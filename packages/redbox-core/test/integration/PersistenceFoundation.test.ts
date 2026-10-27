import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { initializePersistence, mongoDatabase, cleanupPersistence } from '../../src/persistence/runtime';
import {
  inspectPersistenceIndex,
  ensurePersistenceIndex,
  requirePersistenceIndex,
} from '../../src/persistence/indexes';
import type { PersistenceIndex } from '../../src/persistence/indexes';
import {
  initializeCachePersistence,
  getCacheEntryRepository,
  cleanupCachePersistence,
} from '../../src/persistence/cache/runtime';

const uri = process.env.P1_MONGO_URL;
const suite = uri ? describe : describe.skip;
suite('isolated standalone driver foundation', function () {
  this.timeout(30000);
  let app: Sails.Application;
  let raw: MongoClient;
  before(async () => {
    assert.match(uri!, /^mongodb:\/\/p1_fixture:p1-only@127\.0\.0\.1:(?!27017\/)[0-9]+\/wr_p1_core\?authSource=admin$/);
    app = {
      config: {
        datastores: {
          mongodb: { url: uri!, maxPoolSize: 3 },
          redboxStorage: { url: uri!.replace('wr_p1_core', 'wr_p1_storage'), maxPoolSize: 3 },
        },
      },
      log: { warn() {} },
    } as unknown as Sails.Application;
    raw = await new MongoClient(uri!).connect();
    assert.equal((await raw.db().command({ buildInfo: 1 })).version, '9.0.4');
    await initializePersistence(app);
  });
  after(async () => {
    await cleanupCachePersistence(app);
    await cleanupPersistence(app);
    await raw.close();
  });
  const descriptor: PersistenceIndex = {
    datastore: 'mongodb',
    collection: 'ledger_probe',
    name: 'name_unique',
    keys: { name: 1 },
    unique: true,
  };
  it('routes two DB handles on one compatible pool without models, managers or unintended collections', async () => {
    const [core, storage, again] = await Promise.all([
      mongoDatabase(app, 'mongodb'),
      mongoDatabase(app, 'redboxStorage'),
      mongoDatabase(app, 'mongodb'),
    ]);
    assert.equal(core, again);
    assert.equal(core.databaseName, 'wr_p1_core');
    assert.equal(storage.databaseName, 'wr_p1_storage');
    const clientOf = (db: unknown) => (db as { client: MongoClient }).client;
    assert.equal(clientOf(core), clientOf(storage));
    assert.equal((await storage.listCollections().toArray()).length, 0);
    assert.equal((await core.listCollections().toArray()).length, 0);
  });
  it('inspects missing/conflicting/duplicate indexes read-only and ensures only an explicit scope', async () => {
    assert.equal((await inspectPersistenceIndex(app, descriptor)).index, 'missing');
    assert.equal(await raw.db().collection(descriptor.collection).countDocuments(), 0);
    await ensurePersistenceIndex(app, descriptor);
    assert.equal((await ensurePersistenceIndex(app, descriptor)).index, 'ready');
    const db = raw.db();
    for (const [suffix, options] of [
      ['nonunique', {}],
      ['sparse', { unique: true, sparse: true }],
      ['partial', { unique: true, partialFilterExpression: { name: { $type: 'string' } } }],
      ['ttl', { unique: true, expireAfterSeconds: 0 }],
      ['collation', { unique: true, collation: { locale: 'en' } }],
    ] as const) {
      const target = { ...descriptor, collection: `index_${suffix}` };
      await db.collection(target.collection).createIndex({ name: 1 }, { name: target.name, ...options });
      assert.equal((await inspectPersistenceIndex(app, target)).index, 'conflicting');
      await assert.rejects(ensurePersistenceIndex(app, target));
    }
    const duplicates = { ...descriptor, collection: 'duplicates' };
    await db.collection(duplicates.collection).insertMany([{ name: 'same' }, { name: 'same' }]);
    const report = await inspectPersistenceIndex(app, duplicates);
    assert.equal(report.duplicateKeyGroups, 1);
    assert.throws(() => requirePersistenceIndex(report));
    await assert.rejects(ensurePersistenceIndex(app, duplicates));
    assert.equal(await db.collection(duplicates.collection).countDocuments(), 2);
    const appConfig = { ...descriptor, collection: 'appconfig_probe', unique: false };
    await db.collection(appConfig.collection).insertMany([{ name: 'same' }, { name: 'same' }]);
    await ensurePersistenceIndex(app, appConfig);
    assert.equal(await db.collection(appConfig.collection).countDocuments(), 2);
  });
  it('starts Prisma cache without model registration, refuses missing index and restarts without rewrite', async () => {
    await assert.rejects(initializeCachePersistence(app), /index.*missing|index is missing/);
    await initializePersistence(app);
    const cacheIndex: PersistenceIndex = {
      datastore: 'mongodb',
      collection: 'cacheentry',
      name: 'cacheentry_name_unique',
      keys: { name: 1 },
      unique: true,
    };
    await ensurePersistenceIndex(app, cacheIndex);
    await initializeCachePersistence(app);
    const repository = getCacheEntryRepository(app);
    await repository.create({ name: 'driver', data: { nested: [false, 0, null] }, ts_added: 42 });
    const before = await raw.db().collection('cacheentry').findOne({ name: 'driver' });
    await cleanupCachePersistence(app);
    await cleanupPersistence(app);
    await assert.rejects(repository.findByName('driver'), /no longer active|draining/);
    await initializeCachePersistence(app);
    assert.deepEqual((await getCacheEntryRepository(app).findByName('driver'))?.data, { nested: [false, 0, null] });
    assert.deepEqual(await raw.db().collection('cacheentry').findOne({ name: 'driver' }), before);
  });
});
