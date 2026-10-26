const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ApplicationRuntime } = require('../../dist/application');
const { resolveExtensions, composeExtensionApplication, bindExtensionFactory } = require('../../dist/extensions');
const pdfExtension = require('../../../sails-hook-redbox-pdfgen/dist/extension');

function deferred() {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });
  return { promise, resolve };
}
async function until(check) {
  const end = Date.now() + 3000;
  while (!check()) {
    assert(Date.now() < end, 'PDF fixture did not settle');
    await new Promise(r => setTimeout(r, 5));
  }
}
function fixture(overrides = {}) {
  const events = [];
  let closeFails = false;
  const page = {
    setRequestInterception: async () => {},
    on() {},
    mainFrame: () => ({}),
    url: () => 'http://localhost/default/rdmp/record/view/oid',
    goto: async url => ({ status: () => 200, url: () => url, request: () => ({ redirectChain: () => [] }) }),
    waitForNetworkIdle: async () => {},
    waitForSelector: async () => {},
    pdf: async () => Buffer.from('actual generation path with a fixture browser'),
    close: async () => {
      events.push('page-close');
    },
  };
  const browser = {
    newPage: async () => page,
    close: async () => {
      events.push('browser-close');
      if (closeFails) throw new Error('browser retained');
    },
  };
  const dependencies = {
    config: { appUrl: 'http://localhost' },
    runAcceptedWork: operation => operation(),
    log: { warn() {}, error() {}, debug() {}, verbose() {} },
    brandById: () => ({ id: 'brand', name: 'default' }),
    optionsForBrand: () => ({ token: 'fixture-token', maxRetries: 0, ...overrides.options }),
    stagingDisk: () => ({ put: async () => {}, delete: async () => {} }),
    datastreams: {
      addDatastream: async () => {
        events.push('write');
        if (overrides.write) await overrides.write();
      },
    },
    ...overrides.dependencies,
  };
  class TestPDF extends pdfExtension.Services.PDF {
    async launchBrowser() {
      events.push('launch');
      if (overrides.launch) return overrides.launch();
      return browser;
    }
  }
  const declaration = pdfExtension.registerRedboxExtension();
  const resolved = resolveExtensions(
    [
      { name: 'pdf', root: '.', declaration },
      {
        name: 'core',
        root: '.',
        declaration: {
          apiVersion: 1,
          modules: [
            {
              name: 'storage',
              create: () => ({
                initialize: async () => {},
                close: async () => {
                  events.push('storage-close');
                },
              }),
            },
          ],
        },
      },
      {
        name: 'test',
        root: '.',
        declaration: {
          apiVersion: 1,
          modules: [{ name: 'pdf', requires: ['storage'], replaces: true, create: input => new TestPDF(input) }],
        },
      },
    ],
    ['test', 'pdf']
  );
  let pdf;
  const composition = composeExtensionApplication(
    { config: {}, log: console },
    resolved,
    {
      module: item => () => {
        const instance = bindExtensionFactory(
          item.declaration,
          item.declaration.name === 'pdf' ? dependencies : undefined
        )();
        if (item.declaration.name === 'pdf') pdf = instance;
        return instance;
      },
    },
    overrides.initialization
  );
  return {
    app: composition.application,
    events,
    get pdf() {
      return pdf;
    },
    failClose(value) {
      closeFails = value;
    },
  };
}
function graph() {
  assert.equal(global.sails, undefined);
  assert.equal(
    Object.keys(require.cache).some(file =>
      /\/node_modules\/sails\/|\/redbox-core\/dist\/(?:index|CoreBase|CoreService)\.js$|\/compat\//.test(file)
    ),
    false
  );
}

test('PDF declarations are offline; normal generation requires explicit activation', async () => {
  const declaration = pdfExtension.registerRedboxExtension();
  assert(declaration.jobs['PDFService-CreatePDF']);
  assert.equal(declaration.configModels[0].name, 'pdfgen');
  const instance = fixture();
  try {
    await instance.app.initialize();
    assert.throws(() => instance.pdf.createPDF('oid', { metaMetadata: { brandId: 'brand' } }, {}, {}), /active/);
    assert.equal(instance.events.length, 0);
    await instance.app.activate();
    instance.pdf.createPDF('oid', { metaMetadata: { brandId: 'brand' } }, {}, {});
    await until(() => instance.events.includes('browser-close'));
    assert(instance.events.includes('write'));
  } finally {
    await instance.app.stop();
  }
  graph();
});
test('accepted PDF byte-store writes settle before runtime cleanup after a deadline and retry', async () => {
  const write = deferred(),
    entered = deferred();
  const instance = fixture({
    write: () => {
      entered.resolve();
      return write.promise;
    },
  });
  await instance.app.initialize();
  await instance.app.activate();
  instance.pdf.createPDF('oid', { metaMetadata: { brandId: 'brand' } }, {}, {});
  await entered.promise;
  await assert.rejects(instance.app.stop({ deadlineMs: 10 }), /deadline/);
  assert.equal(instance.app.status().cleanupPending, true);
  assert.equal(instance.events.includes('storage-close'), false);
  assert.throws(() => instance.pdf.createPDF('new', {}, {}, {}), /admission/);
  write.resolve();
  await instance.app.stop();
  assert(instance.events.includes('browser-close'));
  assert(instance.events.includes('storage-close'));
  graph();
});
test('scheduled retry fibers are interrupted and cannot generate after stop', async () => {
  const instance = fixture({
    options: { maxRetries: 2, retryDelayMs: 10000 },
    launch: async () => {
      throw new Error('launch unavailable');
    },
  });
  try {
    await instance.app.initialize();
    await instance.app.activate();
    instance.pdf.createPDF('oid', { metaMetadata: { brandId: 'brand' } }, {}, {});
    await until(() => instance.pdf.retryTasks.size === 1);
    await instance.app.stop();
    assert.equal(instance.pdf.retryTasks.size, 0);
    assert.equal(instance.events.filter(event => event === 'launch').length, 1);
  } finally {
    await instance.app.stop();
  }
  graph();
});
test('failed browser cleanup stays owned and application stop retries it observably', async () => {
  const instance = fixture();
  instance.failClose(true);
  await instance.app.initialize();
  await instance.app.activate();
  instance.pdf.createPDF('oid', { metaMetadata: { brandId: 'brand' } }, {}, {});
  await until(() => instance.pdf.generationTasks.size === 0);
  await assert.rejects(instance.app.stop(), /resource|drain|cleanup/i);
  assert.equal(instance.app.status().cleanupPending, true);
  instance.failClose(false);
  await instance.app.stop();
  assert(instance.events.filter(event => event === 'browser-close').length >= 3);
  graph();
});

test('required bootstrap failure leaves PDF generation and retries inactive', async () => {
  const instance = fixture({
    initialization: {
      coreBootstrap: [
        {
          name: 'required-import',
          run: async () => {
            throw new Error('Required initialization failed');
          },
        },
      ],
    },
  });
  await assert.rejects(instance.app.initialize(), /Required initialization failed/);
  assert.throws(() => instance.pdf.createPDF('oid', {}, {}, {}), /active/);
  assert.deepEqual(instance.events, ['storage-close']);
  assert.equal(instance.app.status().cleanupPending, false);
  graph();
});
