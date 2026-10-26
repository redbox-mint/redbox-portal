import assert from 'node:assert/strict';
import { MongoClient, ObjectId } from 'mongodb';
import * as sinon from 'sinon';
import { ApplicationRuntime } from '../../src/application';
import type { PersistenceOwner } from '../../src/persistence/owner';
import { mongoDatabase, persistenceOperation } from '../../src/persistence/runtime';
import { initializeReferencePersistence, getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { referenceIndexes } from '../../src/persistence/reference/preflight';
import type { RecordTypeRepository } from '../../src/persistence/reference/ReferenceRepositories';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

describe('application ownership on real MongoDB', function () {
  this.timeout(30_000);
  let native: MongoClient;
  let url: URL;
  const applications: ApplicationRuntime[] = [];
  const databases: string[] = [];
  before(async () => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined, 'Run without the legacy test/setup.ts');
    assert(
      process.env.APPLICATION_TEST_MONGO_URL,
      'APPLICATION_TEST_MONGO_URL is required; no missing-environment skip'
    );
    url = new URL(process.env.APPLICATION_TEST_MONGO_URL);
    assert.equal(url.pathname, '/sr_p1_application', 'Only a disposable application fixture database is allowed');
    native = await new MongoClient(url.toString()).connect();
    assert(Number.parseInt((await native.db().command({ buildInfo: 1 })).version, 10) >= 8);
  });
  afterEach(async () => {
    for (const app of applications.splice(0)) await app.stop();
    sinon.restore();
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    assert.equal(
      Object.keys(require.cache).some(path => path.includes('/node_modules/sails/')),
      false
    );
  });
  after(async () => {
    if (!native) return;
    try {
      for (const name of databases) await native.db(name).dropDatabase();
    } finally {
      await native.close();
    }
  });
  function owner(): PersistenceOwner {
    const database = `sr_p1_application_${process.pid}_${databases.length}`;
    databases.push(database);
    const connection = new URL(url);
    connection.pathname = '/' + database;
    return { config: { datastores: { mongodb: { url: connection.toString(), maxPoolSize: 2 } } }, log: { warn() {} } };
  }
  async function indexes(application: PersistenceOwner) {
    const connection = application.config.datastores!.mongodb as { url: string };
    const database = native.db(new URL(connection.url).pathname.slice(1));
    for (const index of referenceIndexes)
      await database.collection(index.collection).createIndex(index.keys, { name: index.name, unique: index.unique });
  }
  function application(
    applicationOwner: PersistenceOwner,
    modules: ConstructorParameters<typeof ApplicationRuntime>[1]
  ) {
    const app = new ApplicationRuntime(applicationOwner, modules);
    applications.push(app);
    return app;
  }

  it('owns isolated factories, caches, groups and pools across simultaneously initialized applications', async () => {
    const firstOwner = owner(),
      secondOwner = owner();
    await indexes(firstOwner);
    await indexes(secondOwner);
    let creates = 0;
    const instances: { cache: string[]; repository: RecordTypeRepository }[] = [];
    const brand = new ObjectId().toHexString();
    const registration = (selectedOwner: PersistenceOwner, name: string) => ({
      name: 'definitions',
      create: () => {
        creates++;
        const cache: string[] = [];
        return {
          initialize: async () => {
            await initializeReferencePersistence(selectedOwner);
            const repository = getReferenceRepositories(selectedOwner).recordTypes;
            await repository.createDefinition({ branding: brand, name, packageType: 'dataset' });
            cache.push(...(await repository.listForBrand(brand)).map(row => row.name));
            instances.push({ cache, repository });
          },
          close: async () => {
            cache.length = 0;
          },
        };
      },
    });
    const first = application(firstOwner, [registration(firstOwner, 'first')]);
    const second = application(secondOwner, [registration(secondOwner, 'second')]);
    await Promise.all([first.initialize(), first.initialize(), second.initialize()]);
    assert.equal(creates, 2);
    assert.notEqual(instances[0].repository, instances[1].repository);
    assert.deepEqual(instances.map(instance => instance.cache[0]).sort(), ['first', 'second']);
    const firstPool = (await mongoDatabase(firstOwner, 'mongodb')).client;
    const secondPool = (await mongoDatabase(secondOwner, 'mongodb')).client;
    assert.notEqual(firstPool, secondPool);
    await first.activate();
    await Promise.all([first.stop(), first.stop()]);
    assert.equal(first.status().persistence.pools, 0);
    assert.equal(second.status().persistence.pools, 1);
    assert.equal((await getReferenceRepositories(secondOwner).recordTypes.listForBrand(brand))[0].name, 'second');
    assert.equal(instances.filter(instance => instance.cache.length === 0).length, 1);
  });

  it('cleans a real pool after initialization failure and preserves its original error', async () => {
    const selectedOwner = owner();
    const failure = new Error('synthetic startup failure');
    let closes = 0;
    const app = application(selectedOwner, [
      {
        name: 'failing',
        create: () => ({
          initialize: async () => {
            const db = await mongoDatabase(selectedOwner, 'mongodb');
            await db.collection('startup_probe').insertOne({ state: 'written-before-failure' });
            throw failure;
          },
          close: async () => {
            closes++;
          },
        }),
      },
    ]);
    await assert.rejects(app.initialize(), error => error === failure);
    assert.equal(app.status().ready, false);
    assert.equal(app.status().cleanupPending, false);
    assert.equal(app.status().persistence.pools, 0);
    assert.equal(closes, 1);
    assert.equal(
      await native.db(databases.at(-1)).collection('startup_probe').countDocuments(),
      1,
      'Cleanup makes no rollback claim for completed writes'
    );
  });

  it('retains a pending real pool acquisition after a stop deadline and closes only on explicit retry', async () => {
    const entered = deferred(),
      release = deferred();
    const connect = MongoClient.prototype.connect;
    sinon.stub(MongoClient.prototype, 'connect').callsFake(async function (this: MongoClient) {
      entered.resolve();
      await release.promise;
      return connect.call(this);
    });
    const close = sinon.spy(MongoClient.prototype, 'close');
    const selectedOwner = owner();
    let moduleCloses = 0;
    const app = application(selectedOwner, [
      {
        name: 'acquiring',
        create: () => ({
          initialize: async () => {
            await (await mongoDatabase(selectedOwner, 'mongodb')).command({ ping: 1 });
          },
          close: async () => {
            moduleCloses++;
          },
        }),
      },
    ]);
    const rejected = assert.rejects(app.initialize(), /stop has begun/);
    await entered.promise;
    try {
      await assert.rejects(app.stop({ deadlineMs: 20 }), /deadline exceeded/);
      assert.equal(close.callCount, 0);
      assert.equal(app.status().persistence.pools, 1);
    } finally {
      release.resolve();
      await rejected;
    }
    await turn();
    assert.equal(close.callCount, 0);
    assert.equal(moduleCloses, 0);
    assert.equal(app.status().stopFailed, true);
    await app.stop();
    assert.equal(close.callCount, 1);
    assert.equal(moduleCloses, 1);
    assert.equal(app.status().persistence.pools, 0);
  });

  it('keeps the pool open for an accepted write after the stop deadline and refuses new work', async () => {
    const selectedOwner = owner();
    const app = application(selectedOwner, [
      {
        name: 'writer',
        create: () => ({
          initialize: async () => {
            await mongoDatabase(selectedOwner, 'mongodb');
          },
          close: async () => {},
        }),
      },
    ]);
    await app.initialize();
    await app.activate();
    const db = await mongoDatabase(selectedOwner, 'mongodb');
    const close = sinon.spy(MongoClient.prototype, 'close');
    const entered = deferred(),
      release = deferred();
    const accepted = persistenceOperation(selectedOwner, async () => {
      entered.resolve();
      await release.promise;
      await db.collection('completion_probe').insertOne({ completed: true });
    });
    await entered.promise;
    try {
      await assert.rejects(app.stop({ deadlineMs: 20 }), /deadline exceeded/);
      assert.equal(close.callCount, 0);
      assert.equal(app.status().persistence.operations, 1);
      assert.equal(app.status().persistence.pools, 1);
      assert.equal(app.status().ready, false);
      await assert.rejects(
        persistenceOperation(selectedOwner, async () => {}),
        /draining/
      );
    } finally {
      release.resolve();
      await accepted;
    }
    await app.stop();
    assert.equal(await native.db(db.databaseName).collection('completion_probe').countDocuments(), 1);
    assert.equal(close.callCount, 1);
    assert.equal(app.status().state, 'stopped');
  });

  it('restarts with a fresh application and rejects a retained repository from its predecessor', async () => {
    const firstOwner = owner();
    await indexes(firstOwner);
    const brand = new ObjectId().toHexString();
    const registration = (selectedOwner: PersistenceOwner) => ({
      name: 'definitions',
      create: () => ({
        initialize: () => initializeReferencePersistence(selectedOwner),
        close: async () => {},
      }),
    });
    const first = application(firstOwner, [registration(firstOwner)]);
    await first.initialize();
    const stale = getReferenceRepositories(firstOwner).recordTypes;
    await stale.createDefinition({ branding: brand, name: 'retained', packageType: 'dataset' });
    await first.stop();
    const nextOwner: PersistenceOwner = { config: firstOwner.config, log: { warn() {} } };
    const next = application(nextOwner, [registration(nextOwner)]);
    await next.initialize();
    await assert.rejects(stale.listForBrand(brand), /active reference repository/);
    assert.equal(
      (await getReferenceRepositories(nextOwner).recordTypes.findByName(brand, 'retained'))?.name,
      'retained'
    );
    await assert.rejects(first.initialize(), /fresh application/);
  });
});
