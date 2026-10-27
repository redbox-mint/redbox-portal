import type { PersistenceOwner } from '../../src/persistence/owner';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { MongoClient } from 'mongodb';
import {
  initializePersistence,
  prismaDatabase,
  mongoDatabase,
  mongoResourceDatabase,
  mongoSessionDatabase,
  cleanupPersistence,
  persistenceOperation,
} from '../../src/persistence/runtime';

// Exercise real Prisma client construction; only network acquisition is stubbed.
describe('app-owned Prisma datastore clients', function () {
  afterEach(() => sinon.restore());
  it('reacquires shared native and Prisma clients after a failed connection', async function () {
    const url = 'mongodb://fixture/recovery';
    const app = {
      config: { datastores: { mongodb: { url }, redboxStorage: { url } } },
      log: { warn() {} },
    } as unknown as PersistenceOwner;
    const connect = sinon.stub(MongoClient.prototype, 'connect');
    connect.onFirstCall().rejects(new Error('server unavailable'));
    connect.callsFake(async function (this: MongoClient) {
      return this;
    });
    const close = sinon.stub(MongoClient.prototype, 'close').resolves();
    const acquire = () =>
      Promise.all([
        mongoResourceDatabase(app, 'gridfs:separate', { mongoUrl: url }),
        mongoResourceDatabase(app, 'agenda', { mongoUrl: url }),
        mongoSessionDatabase(app, { mongoUrl: url }),
        prismaDatabase(app, 'mongodb'),
        prismaDatabase(app, 'redboxStorage'),
      ]);
    await initializePersistence(app);
    try {
      const failed = await Promise.allSettled([
        mongoResourceDatabase(app, 'gridfs:separate', { mongoUrl: url }),
        mongoResourceDatabase(app, 'agenda', { mongoUrl: url }),
        mongoSessionDatabase(app, { mongoUrl: url }),
        prismaDatabase(app, 'mongodb'),
        prismaDatabase(app, 'redboxStorage'),
      ]);
      assert(failed.every(result => result.status === 'rejected'));
      assert.equal(connect.callCount, 1);
      assert.equal(close.callCount, 1);
      const recovered = await acquire();
      assert.equal(connect.callCount, 2);
      assert.equal(recovered[0].client, recovered[1].client);
      assert.equal(recovered[1].client, recovered[2].client);
      assert.notEqual(close.firstCall.thisValue, recovered[0].client);
      const again = await acquire();
      assert.equal(again[3], recovered[3]);
      assert.equal(again[4], recovered[4]);
    } finally {
      await cleanupPersistence(app);
    }
    assert.equal(close.callCount, 2);
  });

  it('permits lazy Prisma acquisition only within unsettled accepted work during cleanup', async function () {
    const app = {
      config: { datastores: { mongodb: { url: 'mongodb://fixture/accepted' } } },
      log: { warn() {} },
    } as unknown as PersistenceOwner;
    sinon.stub(MongoClient.prototype, 'connect').resolvesThis();
    const poolClose = sinon.stub(MongoClient.prototype, 'close').resolves();
    await initializePersistence(app);
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    let detached!: () => Promise<unknown>;
    const accepted = persistenceOperation(app, async () => {
      // Bind an untracked callback to the admission context; it must expire.
      const { AsyncResource } = await import('node:async_hooks');
      detached = AsyncResource.bind(() => prismaDatabase(app, 'mongodb'));
      await held;
      const client = await prismaDatabase(app, 'mongodb');
      assert.equal(poolClose.callCount, 0);
      return client;
    });
    const cleanup = cleanupPersistence(app);
    await assert.rejects(prismaDatabase(app, 'mongodb'), /draining/);
    release();
    await accepted;
    await assert.rejects(detached(), /draining/);
    await cleanup;
    assert.equal(poolClose.callCount, 1);
  });

  it('retains failed acquisition clients until close succeeds, independently of recovery', async function () {
    const app = {
      config: { datastores: { mongodb: { url: 'mongodb://fixture/recovery' } } },
      log: { warn() {} },
    } as unknown as PersistenceOwner;
    const connect = sinon.stub(MongoClient.prototype, 'connect');
    connect.onFirstCall().rejects(new Error('server unavailable'));
    connect.callsFake(async function (this: MongoClient) {
      return this;
    });
    let failedClient: MongoClient | undefined;
    let canClose = false;
    const close = sinon.stub(MongoClient.prototype, 'close').callsFake(async function (this: MongoClient) {
      failedClient ??= this;
      if (this === failedClient && !canClose) throw new Error('close failed');
    });
    await initializePersistence(app);
    await assert.rejects(prismaDatabase(app, 'mongodb'));
    const recovered = await mongoDatabase(app, 'mongodb');
    assert.notEqual(recovered.client, failedClient);
    await assert.rejects(cleanupPersistence(app), /app-owned persistence pools/);
    assert.equal(close.getCalls().filter(call => call.thisValue === failedClient).length, 2);
    canClose = true;
    await cleanupPersistence(app);
    assert.equal(close.getCalls().filter(call => call.thisValue === failedClient).length, 3);
    assert.equal(close.getCalls().filter(call => call.thisValue === recovered.client).length, 1);
  });
  it('is lazy, shares acquisition by logical datastore, survives reload, and closes before a shared pool', async function () {
    const app = {
      config: {
        datastores: {
          mongodb: { url: 'mongodb://fixture/core' },
          redboxStorage: { url: 'mongodb://fixture/storage' },
        },
      },
      log: { warn() {} },
    } as unknown as PersistenceOwner;
    const connect = sinon.stub(MongoClient.prototype, 'connect').callsFake(async function (this: MongoClient) {
      return this;
    });
    const poolClose = sinon.stub(MongoClient.prototype, 'close').resolves();
    await initializePersistence(app);
    assert.equal(connect.callCount, 0);
    const [a, b, storage] = await Promise.all([
      prismaDatabase(app, 'mongodb'),
      prismaDatabase(app, 'mongodb'),
      prismaDatabase(app, 'redboxStorage'),
    ]);
    assert.equal(a, b);
    assert.notEqual(a, storage);
    assert.equal(connect.callCount, 1);
    assert.equal((await mongoDatabase(app, 'mongodb')).client, (await mongoDatabase(app, 'redboxStorage')).client);
    const order: string[] = [];
    const coreClose = sinon.stub(a, 'close').callsFake(async () => {
      order.push('core');
    });
    const storageClose = sinon.stub(storage, 'close').callsFake(async () => {
      order.push('storage');
    });
    poolClose.callsFake(async () => {
      order.push('pool');
    });
    const modulePath = require.resolve('../../src/persistence/runtime');
    const saved = require.cache[modulePath];
    try {
      delete require.cache[modulePath];
      const reloaded: typeof import('../../src/persistence/runtime') = require(modulePath);
      assert.equal(await reloaded.prismaDatabase(app, 'mongodb'), a);
      await assert.rejects(prismaDatabase(app, 'mongodb', 'another'), /already bound/);
      await Promise.all([cleanupPersistence(app), reloaded.cleanupPersistence(app)]);
      await cleanupPersistence(app);
      assert.deepEqual(order, ['core', 'storage', 'pool']);
      assert.equal(coreClose.callCount, 1);
      assert.equal(storageClose.callCount, 1);
      await assert.rejects(prismaDatabase(app, 'mongodb'), /draining/);
      await initializePersistence(app);
      assert.notEqual(await prismaDatabase(app, 'mongodb'), a);
      await cleanupPersistence(app);
    } finally {
      if (saved) require.cache[modulePath] = saved;
      await cleanupPersistence(app);
    }
  });
  it('uses fixed SIEM collection contracts for both models', async function () {
    const {
      createCorePrismaClient,
    }: typeof import('../../src/persistence/prisma/client') = require('../../src/persistence/prisma/client');
    const client = createCorePrismaClient(new MongoClient('mongodb://fixture/unit'), 'unit');
    assert.equal(
      client.query
        .from('securityevent')
        .match(f => f.eventId.eq('one'))
        .count('total')
        .build().collection,
      'securityevent'
    );
    assert.equal(
      client.query
        .from('siemdeliveryattempt')
        .match(f => f.eventId.eq('one'))
        .count('total')
        .build().collection,
      'siemdeliveryattempt'
    );
    await client.close();
  });
  it('retains a failed Prisma close for retry without closing its borrowed pool', async function () {
    const app = {
      config: { datastores: { mongodb: { url: 'mongodb://fixture/core' } } },
      log: { warn() {} },
    } as unknown as PersistenceOwner;
    sinon.stub(MongoClient.prototype, 'connect').callsFake(async function (this: MongoClient) {
      return this;
    });
    const poolClose = sinon.stub(MongoClient.prototype, 'close').resolves();
    await initializePersistence(app);
    const client = await prismaDatabase(app, 'mongodb');
    const close = sinon.stub(client, 'close').onFirstCall().rejects(new Error('synthetic failure'));
    close.onSecondCall().resolves();
    await assert.rejects(cleanupPersistence(app), /Prisma clients/);
    assert.equal(poolClose.callCount, 0);
    await cleanupPersistence(app);
    assert.equal(close.callCount, 2);
    assert.equal(poolClose.callCount, 1);
  });
});
