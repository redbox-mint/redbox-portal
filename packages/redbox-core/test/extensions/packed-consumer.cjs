const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const net = require('node:net');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  assert.notEqual(name, 'sails', 'offline extension graph must not require Sails');
  assert.notEqual(name, '@researchdatabox/redbox-core', 'use a neutral public entry');
  return originalLoad.call(this, name, ...args);
};
const originalListen = net.Server.prototype.listen;
const originalConnect = net.Socket.prototype.connect;
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
  assert.equal(
    resolution.providers.find(item => item.name === 'sr-esm-hook').declaration.config.packedESM,
    'ESM-only dependency awaited'
  );
  assert.equal(
    resolution.providers.find(item => item.name.includes('storage-mongo')).declaration.modules[0].name,
    'storage'
  );
  assert(resolution.providers.find(item => item.name.includes('pdfgen')).declaration.jobs['PDFService-CreatePDF']);
  assert.throws(() => require.resolve('sr-esm-hook/package.json'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  assert.throws(() => require('sr-esm-only'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  const ownRequire = createRequire(require.resolve('@researchdatabox/redbox-core/package.json'));
  assert(ownRequire.resolve('import-meta-resolve').startsWith(__dirname));
  for (const file of Object.keys(require.cache))
    assert(file.startsWith(__dirname), `source-tree or external module shortcut: ${file}`);
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
      checks: 12,
      providers: resolution.providers.map(item => item.name),
      esmOnly: true,
      topLevelAwait: true,
      offline: true,
      isolated: true,
      expressHost: true,
    })
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
