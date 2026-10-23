const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const net = require('node:net');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  assert.notEqual(name, 'sails', 'offline extension graph must not require Sails');
  assert.notEqual(name, '@researchdatabox/redbox-core', 'use a neutral public entry');
  return originalLoad.call(this, name, ...args);
};
const originalListen = net.Server.prototype.listen;
const originalConnect = net.Socket.prototype.connect;
const signals = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
net.Server.prototype.listen = () => {
  throw new Error('Offline registration opened a listener');
};
net.Socket.prototype.connect = () => {
  throw new Error('Offline registration opened a connection');
};
const {
  loadExtensions,
  resolveExtensions,
  composeExtensionApplication,
  bindExtensionFactory,
} = require('@researchdatabox/redbox-core/extensions');
(async () => {
  assert.equal(global.sails, undefined);
  const resolution = await loadExtensions(__dirname);
  for (const provider of resolution.providers) assert(fs.realpathSync(provider.root).startsWith(__dirname + path.sep));
  assert.equal(
    resolution.providers.find(item => item.name === 'sr-esm-hook').declaration.config.packedESM,
    'ESM-only dependency awaited'
  );
  assert.equal(
    resolution.providers.find(item => item.name.includes('storage-mongo')).declaration.modules[0].name,
    'storage'
  );
  assert(resolution.providers.find(item => item.name.includes('pdfgen')).declaration.jobs['PDFService-CreatePDF']);
  const development = resolution.providers.find(item => item.name === 'redbox-hook-dev').declaration;
  assert(development.config.recordtype.rdmp);
  assert(development.forms['default-1.0-draft']);
  assert(development.workflows.rdmp);
  assert.equal(
    Object.keys(development.forms).some(name => name.startsWith('e2e-')),
    false
  );
  const previousEnvironment = process.env;
  try {
    process.env = { ...previousEnvironment, NODE_ENV: 'integrationtest', RBPORTAL_PLAYWRIGHT_SCENARIOS: 'true' };
    const scenarios = (await import('redbox-hook-dev/extension')).registerRedboxExtension();
    assert(Object.keys(scenarios.forms).some(name => name.startsWith('e2e-')));
  } finally {
    process.env = previousEnvironment;
  }

  // Run the installed generator, then compile generated files against installed public declarations.
  const { generateHookArchetype } = require('@researchdatabox/redbox-dev-tools/dist/templates/hook-archetype');
  const generated = path.join(__dirname, 'generated-hook');
  generateHookArchetype({ cwd: generated, packageName: '123-packed-demo', templateName: 'v6' });
  const ts = require('typescript');
  const config = ts.readConfigFile(path.join(generated, 'tsconfig.json'), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, generated);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const emitted = program.emit();
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
  assert.equal(
    diagnostics.length,
    0,
    diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n')
  );
  const scaffold = require(path.join(generated, 'dist/index.js'));
  const declaration = scaffold.registerRedboxExtension();
  resolveExtensions([{ name: 'generated-hook', root: generated, declaration }]);
  const writes = [];
  const workInput = { ensureNamedQuery: async (name, value) => writes.push({ name, value }) };
  assert.equal(writes.length, 0, 'registration must not run migrations/bootstrap');
  await declaration.migrations[0].run(workInput);
  await declaration.bootstrap[0].run(workInput);
  assert.equal(writes.length, 2);
  const auditPath = path.join(generated, 'audit.log');
  const example = declaration.modules[0].create({ auditPath, greeting: 'packed greeting' });
  assert.equal(fs.existsSync(auditPath), false);
  await example.initialize();
  await assert.rejects(example.greet(), /not accepting/);
  await example.activate();
  const accepted = example.greet();
  await example.drain();
  assert.equal(await accepted, 'packed greeting');
  await assert.rejects(example.greet(), /not accepting/);
  await example.close();
  assert.equal(fs.readFileSync(auditPath, 'utf8'), 'packed greeting\n');
  assert.throws(() => require.resolve('sr-esm-hook/package.json'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  assert.throws(() => require('sr-esm-only'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  const ownRequire = createRequire(require.resolve('@researchdatabox/redbox-core/package.json'));
  assert(ownRequire.resolve('import-meta-resolve').startsWith(__dirname));
  const legacyRuntime = '@researchdatabox/redbox-core/dist/persistence/branding/runtime';
  assert.equal(ownRequire.resolve(legacyRuntime), ownRequire.resolve(legacyRuntime + '.js'));
  assert.equal(
    ownRequire.resolve('@researchdatabox/redbox-core/dist/recordTypes'),
    ownRequire.resolve('@researchdatabox/redbox-core/dist/recordTypes/index.js')
  );
  for (const file of Object.keys(require.cache))
    assert(file.startsWith(__dirname), `source-tree or external module shortcut: ${file}`);
  assert.deepEqual(
    ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)),
    signals
  );
  net.Server.prototype.listen = originalListen;
  net.Socket.prototype.connect = originalConnect;
  const selected = resolveExtensions(
    resolution.providers.filter(item => item.name.startsWith('sr-')),
    ['sr-commonjs-hook', 'sr-esm-hook']
  );
  const events = [],
    instances = [];
  const compositions = ['first', 'second'].map(label =>
    composeExtensionApplication({ config: {}, log: console }, selected, {
      module: item => () => {
        const instance = bindExtensionFactory(item.declaration, {
          label,
          created: provider => events.push(provider),
        })();
        instances.push(instance);
        return instance;
      },
    })
  );
  await Promise.all(compositions.map(item => item.application.initialize()));
  assert.deepEqual(events, ['commonjs', 'commonjs']);
  assert.notEqual(instances[0], instances[1]);
  assert.deepEqual(
    instances.map(item => item.values),
    [['first'], ['second']]
  );
  const { ExpressHost } = require('@researchdatabox/redbox-core/http/express');
  const host = new ExpressHost(compositions[0].application, {
    hostname: '127.0.0.1',
    port: 0,
    prepare: async router => {
      router.get('/fixture', (_req, res) => res.json(instances[0].values));
    },
  });
  await host.initialize();
  const url = `http://127.0.0.1:${host.address().port}/fixture`;
  assert.equal((await fetch(url)).status, 503);
  await host.activate();
  assert.deepEqual(await (await fetch(url)).json(), ['first']);
  await host.stop();
  assert.deepEqual(instances[0].values, []);
  assert.deepEqual(instances[1].values, ['second']);
  await compositions[1].application.stop();
  assert.equal(
    Object.keys(require.cache).some(file =>
      /\/node_modules\/sails\/|\/redbox-core\/dist\/(?:index|CoreBase|CoreService)\.js$/.test(file)
    ),
    false
  );
  console.log(
    JSON.stringify({
      checks: 18,
      providers: resolution.providers.map(item => item.name),
      esmOnly: true,
      topLevelAwait: true,
      offline: true,
      isolated: true,
      expressHost: true,
      development: true,
      compiledScaffold: true,
    })
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
