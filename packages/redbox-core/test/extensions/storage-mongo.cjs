const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { MongoClient } = require('mongodb');
const { firstValueFrom } = require('rxjs');
const { ApplicationRuntime } = require('../../dist/application');
const { RecordTypes } = require('../../dist/recordTypes');
const {
  resolveExtensions,
  composeExtensionApplication,
  bindExtensionFactory,
  bindExtensionWork,
} = require('../../dist/extensions');
const runtime = require('../../dist/extensions/storage');
const storageExtension = require('../../../sails-hook-redbox-storage-mongo/dist/extension');

assert.equal(global.sails, undefined);
const base = new URL(process.env.EXTENSIONS_TEST_MONGO_URL || 'mongodb://missing/required');
assert.equal(base.pathname, '/sr_p2_extensions', 'Supply EXTENSIONS_TEST_MONGO_URL with disposable /sr_p2_extensions');
const native = new MongoClient(base.toString());
const databases = [];
const apps = [];
after(async () => {
  for (const app of apps) await app.stop();
  for (const database of databases) await native.db(database).dropDatabase();
  await native.close();
});
function checkGraph() {
  assert.equal(global.sails, undefined);
  assert.equal(
    Object.keys(require.cache).some(file =>
      /\/node_modules\/sails\/|\/redbox-core\/dist\/(?:index|CoreBase|CoreService)\.js$|\/compat\//.test(file)
    ),
    false,
    'neutral graph must not load Sails/barrel/compat'
  );
}
async function owner() {
  await native.connect();
  const name = 'sr_p2_extensions_' + process.pid + '_' + databases.length;
  const storageName = name + '_storage';
  databases.push(name, storageName);
  const url = new URL(base);
  url.pathname = '/' + name;
  const bytes = new URL(base);
  bytes.pathname = '/' + storageName;
  return { config: { datastores: { mongodb: { url: url.href }, redboxStorage: { url: bytes.href } } }, log: console };
}
function collaborators() {
  return {
    log: { error() {}, verbose() {} },
    recordTypes: {
      get() {
        throw new Error('not used by readiness');
      },
    },
    forms: {
      getFormByName() {
        throw new Error('not used by readiness');
      },
    },
    disks: {
      stagingDisk() {
        throw new Error('not used by GridFS');
      },
      disk() {
        throw new Error('not used');
      },
    },
    translate: key => key,
    exportMaxRecords: () => 100,
  };
}

test('storage declaration is offline and real index readiness fails closed', async () => {
  const declaration = storageExtension.registerRedboxExtension();
  assert.equal(declaration.modules.length, 1);
  assert.equal(
    declaration.migrations[0].name,
    '@researchdatabox/sails-hook-redbox-storage-mongo:20260823T000000-backfill-record-revisions'
  );
  const selectedOwner = await owner();
  let module;
  const composition = composeExtensionApplication(
    selectedOwner,
    resolveExtensions([{ name: 'storage-hook', root: '.', declaration }]),
    {
      work: item => bindExtensionWork(item.declaration, { owner: selectedOwner }),
      module: item => () => {
        module = bindExtensionFactory(item.declaration, { owner: selectedOwner, collaborators: collaborators() })();
        return module;
      },
    }
  );
  apps.push(composition.application);
  await assert.rejects(composition.application.initialize(), /index|readiness|missing/i);
  assert.equal(composition.application.status().ready, false);
  assert.equal(runtime.persistenceStatus(selectedOwner).pools, 0);
  assert.deepEqual(module.storage.getCapabilities(), {});
  checkGraph();
});

test('storage capability precedes strict record-type bootstrap; writes, GridFS, stale handles and fresh owners work', async () => {
  const selectedOwner = await owner();
  await runtime.initializePersistence(selectedOwner);
  await runtime.ensureMigrationPersistenceIndex(selectedOwner);
  await storageExtension.ensurePrismaStagedStorageIndexes(selectedOwner);
  await runtime.ensureReferencePersistenceIndexes(selectedOwner);
  let storage, recordTypes;
  const declaration = storageExtension.registerRedboxExtension();
  const resolved = resolveExtensions([
    { name: 'storage-hook', root: '.', declaration },
    {
      name: 'core',
      root: '.',
      declaration: {
        apiVersion: 1,
        modules: [
          {
            name: 'recordTypes',
            requires: ['storage'],
            create: () => ({
              initialize: async () => {
                assert.equal(storage.getCapabilities().recordConcurrency, 1);
                await runtime.initializeReferencePersistence(selectedOwner);
                recordTypes = new RecordTypes({
                  repository: runtime.getReferenceRepositories(selectedOwner).recordTypes,
                  config: {
                    appmode: {},
                    recordtype: { dataset: { packageType: 'dataset', concurrentModification: { mode: 'strict' } } },
                  },
                  log: { debug() {}, verbose() {} },
                  storageCapability: () => storage,
                });
                await recordTypes.initialize({ id: '000000000000000000000001' });
              },
              close: async () => {
                await recordTypes?.close();
              },
            }),
          },
        ],
      },
    },
  ]);
  const composition = composeExtensionApplication(selectedOwner, resolved, {
    work: item => bindExtensionWork(item.declaration, { owner: selectedOwner }),
    module: item => () => {
      const module =
        item.declaration.name === 'storage'
          ? bindExtensionFactory(item.declaration, { owner: selectedOwner, collaborators: collaborators() })()
          : item.declaration.create();
      if (item.declaration.name === 'storage') storage = module.storage;
      return module;
    },
  });
  apps.push(composition.application);
  await composition.application.initialize();
  assert.equal((await firstValueFrom(recordTypes.get({ id: '000000000000000000000001' }, 'dataset'))).name, 'dataset');
  await composition.application.activate();
  const response = await storage.create(
    { id: '000000000000000000000001' },
    { metaMetadata: { brandId: '000000000000000000000001', type: 'dataset' }, metadata: { title: 'P2' } },
    {}
  );
  assert.equal(response.success, true);
  const oid = response.oid;
  assert.equal((await storage.getMeta(oid)).metadata.title, 'P2');
  const { Readable } = require('node:stream');
  const staged = { getStream: async () => Readable.from(Buffer.from('owned GridFS bytes')) };
  await storage.addDatastream(oid, new runtime.Datastream({ fileId: 'artifact.txt', mimeType: 'text/plain' }), staged);
  const stream = await storage.getDatastream(oid, 'artifact.txt');
  const chunks = [];
  for await (const chunk of stream.readstream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'owned GridFS bytes');
  await composition.application.stop();
  await assert.rejects(storage.getMeta(oid), /unavailable or draining/i);
  assert.deepEqual(storage.getCapabilities(), {});
  assert.equal(runtime.persistenceStatus(selectedOwner).pools, 0);
  const restartOwner = { config: selectedOwner.config, log: console };
  let restarted;
  const restart = new ApplicationRuntime(restartOwner, [
    {
      name: 'storage',
      create: () => {
        const module = storageExtension.createMongoStorageModule({
          owner: restartOwner,
          collaborators: collaborators(),
        });
        restarted = module.storage;
        return module;
      },
    },
  ]);
  apps.push(restart);
  await restart.initialize();
  await restart.activate();
  assert.equal((await restarted.getMeta(oid)).metadata.title, 'P2');
  await assert.rejects(storage.getMeta(oid));
  await restart.stop();
  checkGraph();
});

test('accepted GridFS upload retains clients and pools through timed-out stop and retry', async () => {
  const selectedOwner = await owner();
  await runtime.initializePersistence(selectedOwner);
  await runtime.ensureMigrationPersistenceIndex(selectedOwner);
  await storageExtension.ensurePrismaStagedStorageIndexes(selectedOwner);
  let storage;
  const app = new ApplicationRuntime(selectedOwner, [
    {
      name: 'storage',
      create: () => {
        const module = storageExtension.createMongoStorageModule({
          owner: selectedOwner,
          collaborators: collaborators(),
        });
        storage = module.storage;
        return module;
      },
    },
  ]);
  apps.push(app);
  await app.initialize();
  await app.activate();
  const { PassThrough } = require('node:stream');
  const source = new PassThrough();
  let started;
  const hasStarted = new Promise(resolve => {
    started = resolve;
  });
  const upload = storage.addDatastream('accepted-oid', new runtime.Datastream({ fileId: 'pending.txt' }), {
    getStream: async () => {
      started();
      return source;
    },
  });
  await hasStarted;
  await assert.rejects(app.stop({ deadlineMs: 10 }), /deadline/);
  assert.equal(app.status().cleanupPending, true);
  assert.ok(runtime.persistenceStatus(selectedOwner).pools > 0);
  await assert.rejects(storage.getMeta('new-work'), /draining/);
  source.end('completion bytes');
  await upload;
  await app.stop();
  assert.equal(runtime.persistenceStatus(selectedOwner).pools, 0);
  checkGraph();
});
