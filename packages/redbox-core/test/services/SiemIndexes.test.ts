import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { MongoClient, type Db } from 'mongodb';
import { Services } from '../../src/services/SiemForwardingService';
import { Services as Capture } from '../../src/services/SecurityEventService';
import { coreBootstrap } from '../../src/bootstrap';
import { ensureSecurityEventStorage, ensureSiemDeliveryStorage } from '../../src/services/siem/SiemDeliveryStore';

interface IndexCall {
  collection: string;
  spec: object;
  options?: { unique?: boolean };
}
function storageStub() {
  const calls: IndexCall[] = [];
  let failure: Error | undefined;
  let failureCollection: string | undefined;
  const manager = {
    // Return a fresh wrapper each time, as native Mongo's Db.collection does.
    collection: (collection: string) => ({
      createIndex: async (spec: object, options?: { unique?: boolean }) => {
        calls.push({ collection, spec, options });
        if (failure && (!failureCollection || collection === failureCollection)) throw failure;
        return 'index';
      },
    }),
  };
  return {
    calls,
    manager,
    event: { tableName: 'securityevent', getDatastore: () => ({ manager }) },
    attempt: { tableName: 'siemdeliveryattempt', getDatastore: () => ({ manager }) },
    fail: (error?: Error, collection?: string) => {
      failure = error;
      failureCollection = collection;
    },
  };
}

describe('SIEM native storage indexes', function () {
  const originals = new Map<string, unknown>();
  beforeEach(function () {
    for (const key of ['SecurityEvent', 'SiemDeliveryAttempt', 'BrandingService', 'AgendaQueueService'])
      originals.set(key, Reflect.get(globalThis, key));
  });
  afterEach(function () {
    for (const [key, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, key);
      else Reflect.set(globalThis, key, value);
    }
  });

  it('blocks actual core bootstrap before service startup when native index setup fails', async function () {
    const storage = storageStub();
    Reflect.set(globalThis, 'SecurityEvent', storage.event);
    Reflect.set(globalThis, 'SiemDeliveryAttempt', storage.attempt);
    const failure = new Error('index permission denied');
    storage.fail(failure);
    let caught: unknown;
    try {
      await coreBootstrap();
    } catch (error) {
      caught = error;
    }
    expect(caught).to.equal(failure);
  });

  it('creates indexes before capture writes and recovers a replay after forwarding enqueue failed', async function () {
    const storage = storageStub();
    const event = { eventId: 'replayed', brandId: 'test', deliveryState: 'pending' };
    let stored: typeof event | undefined;
    let creates = 0;
    let queues = 0;
    Reflect.set(globalThis, 'SecurityEvent', {
      ...storage.event,
      create: async (input: typeof event) => {
        expect(storage.calls).to.have.length(6);
        creates++;
        if (stored) throw Object.assign(new Error('duplicate'), { code: 'E_UNIQUE' });
        stored = { ...input };
      },
      findOne: async (where: { eventId: string; brandId: string }) =>
        stored?.eventId === where.eventId && stored?.brandId === where.brandId ? stored : undefined,
    });
    Reflect.set(globalThis, 'AgendaQueueService', {
      now: async (name: string, data: object) => {
        expect(name).to.equal('SiemForwardingService-ForwardSecurityEvents');
        expect(data).to.deep.equal({ brandId: 'test' });
        if (++queues === 1) throw new Error('queue unavailable after commit');
      },
    });
    const service = new Capture.SecurityEventService();
    const job = { attrs: { data: { event } } };
    let caught: unknown;
    try {
      await service.storeSecurityEvent(job);
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(Error);
    if (!(caught instanceof Error)) throw new Error('Expected queue failure');
    expect(caught.message).to.equal('queue unavailable after commit');
    if (!stored) throw new Error('Expected committed event before queue failure');
    stored.deliveryState = 'delivered';
    await service.storeSecurityEvent(job);
    expect(creates).to.equal(2);
    expect(queues).to.equal(2);
    expect(stored.deliveryState).to.equal('delivered');
    expect(storage.calls).to.have.length(6);
  });

  it('propagates capture index failures before create or queue', async function () {
    const storage = storageStub();
    const failure = new Error('index permission denied');
    storage.fail(failure);
    let writes = 0;
    Reflect.set(globalThis, 'SecurityEvent', {
      ...storage.event,
      create: async () => {
        writes++;
      },
    });
    Reflect.set(globalThis, 'AgendaQueueService', {
      now: async () => {
        writes++;
      },
    });
    let caught: unknown;
    try {
      await new Capture.SecurityEventService().storeSecurityEvent({
        attrs: { data: { event: { eventId: 'e', brandId: 'test' } } },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).to.equal(failure);
    expect(writes).to.equal(0);
  });

  for (const code of ['E_UNIQUE', 11000, 'E_CONNECTION']) {
    it(`does not suppress ${code} when the matching tenant event does not exist`, async function () {
      const storage = storageStub();
      const failure = Object.assign(new Error('create failed'), { code });
      Reflect.set(globalThis, 'SecurityEvent', {
        ...storage.event,
        create: async () => {
          throw failure;
        },
        findOne: async () => undefined,
      });
      let queued = false;
      Reflect.set(globalThis, 'AgendaQueueService', {
        now: async () => {
          queued = true;
        },
      });
      let caught: unknown;
      try {
        await new Capture.SecurityEventService().storeSecurityEvent({
          attrs: { data: { event: { eventId: 'e', brandId: 'test' } } },
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).to.equal(failure);
      expect(queued).to.equal(false);
    });
  }

  it('initializes indexes before polling even when no brands are configured', async function () {
    const storage = storageStub();
    Reflect.set(globalThis, 'SecurityEvent', storage.event);
    Reflect.set(globalThis, 'SiemDeliveryAttempt', storage.attempt);
    Reflect.set(globalThis, 'BrandingService', { getAvailable: () => [] });
    await new Services.SiemForwardingService().retryFailedDeliveries({});
    expect(storage.calls).to.deep.include({
      collection: 'securityevent',
      spec: { eventId: 1 },
      options: { unique: true },
    });
    expect(storage.calls.some(call => call.collection === 'siemdeliveryattempt')).to.equal(true);
  });

  it('coalesces concurrent setup and caches by manager and table, not collection wrapper', async function () {
    const storage = storageStub();
    await Promise.all(Array.from({ length: 20 }, () => ensureSiemDeliveryStorage(storage.event, storage.attempt)));
    const initialCount = storage.calls.length;
    expect(initialCount).to.equal(8);
    await ensureSecurityEventStorage({ ...storage.event });
    await ensureSiemDeliveryStorage(storage.event, storage.attempt);
    expect(storage.calls).to.have.length(initialCount);
    await ensureSecurityEventStorage({ ...storage.event, tableName: 'another_securityevent' });
    expect(storage.calls).to.have.length(initialCount + 6);
    const otherDb = storageStub();
    await ensureSecurityEventStorage(otherDb.event);
    expect(otherDb.calls).to.have.length(6);
  });

  it('propagates index failures to all waiters and retries on the next use', async function () {
    const storage = storageStub();
    const failure = new Error('duplicate eventId prevents unique index');
    storage.fail(failure);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => ensureSecurityEventStorage(storage.event))
    );
    expect(storage.calls).to.have.length(1);
    for (const result of results) {
      expect(result.status).to.equal('rejected');
      if (result.status === 'rejected') expect(result.reason).to.equal(failure);
    }
    storage.fail();
    await ensureSecurityEventStorage(storage.event);
    expect(storage.calls).to.have.length(7);
  });

  it('stops forwarding on index failure and does not mark failed bootstrap ready', async function () {
    const storage = storageStub();
    Reflect.set(globalThis, 'SecurityEvent', storage.event);
    Reflect.set(globalThis, 'SiemDeliveryAttempt', storage.attempt);
    let brandReads = 0;
    Reflect.set(globalThis, 'BrandingService', {
      getAvailable: () => {
        brandReads++;
        return [];
      },
    });
    const failure = new Error('createIndex permission denied');
    storage.fail(failure);
    const service = new Services.SiemForwardingService();
    for (const operation of [() => service.bootstrap(), () => service.retryFailedDeliveries({})]) {
      let caught: unknown;
      try {
        await operation();
      } catch (error) {
        caught = error;
      }
      expect(caught).to.equal(failure);
    }
    expect(brandReads).to.equal(0);
    storage.fail();
    await service.bootstrap();
    const calls = storage.calls.length;
    await service.retryFailedDeliveries({});
    expect(storage.calls).to.have.length(calls);
    expect(brandReads).to.equal(1);
  });

  it('retries failed attempt initialization without repeating successful event DDL', async function () {
    const storage = storageStub();
    const failure = new Error('attempt indexes unavailable');
    storage.fail(failure, 'siemdeliveryattempt');
    let caught: unknown;
    try {
      await ensureSiemDeliveryStorage(storage.event, storage.attempt);
    } catch (error) {
      caught = error;
    }
    expect(caught).to.equal(failure);
    expect(storage.calls.filter(call => call.collection === 'securityevent')).to.have.length(6);
    storage.fail();
    await ensureSiemDeliveryStorage(storage.event, storage.attempt);
    expect(storage.calls.filter(call => call.collection === 'securityevent')).to.have.length(6);
    expect(storage.calls.filter(call => call.collection === 'siemdeliveryattempt')).to.have.length(3);
  });

  it('initializes indexes before querying delivery monitoring', async function () {
    const storage = storageStub();
    Reflect.set(globalThis, 'SecurityEvent', storage.event);
    const queries: number[] = [];
    Reflect.set(globalThis, 'SiemDeliveryAttempt', {
      ...storage.attempt,
      find: () => {
        queries.push(storage.calls.length);
        return { sort: () => ({ skip: () => ({ limit: async () => [] }) }) };
      },
      count: async () => {
        queries.push(storage.calls.length);
        return 0;
      },
    });
    expect(await new Services.SiemForwardingService().getDeliveryStatus({ brandId: 'test' })).to.deep.equal({
      rows: [],
      total: 0,
    });
    expect(queries).to.deep.equal([8, 8]);
  });

  it('rejects a datastore that cannot create native indexes', async function () {
    let caught: unknown;
    try {
      await ensureSecurityEventStorage({
        tableName: 'securityevent',
        getDatastore: () => ({ manager: { collection: () => ({}) } }),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(Error);
  });
});

describe('SIEM native Mongo index acceptance', function () {
  let client: MongoClient;
  let db: Db;
  before(async function () {
    const url = process.env.SIEM_TEST_MONGO_URL;
    if (!url) this.skip();
    client = await MongoClient.connect(url);
    db = client.db(`siem_indexes_test_${randomUUID().replace(/-/g, '')}`);
  });
  after(async function () {
    if (!client) return;
    try {
      await db.dropDatabase();
    } finally {
      await client.close();
    }
  });

  it('creates default-named query indexes and rejects duplicate eventIds under safe migration', async function () {
    const event = { tableName: 'securityevent', getDatastore: () => ({ manager: db }) };
    const attempt = { tableName: 'siemdeliveryattempt', getDatastore: () => ({ manager: db }) };
    // No Waterline migration/schema synchronization: ensureStorage supplies the DDL.
    await ensureSiemDeliveryStorage(event, attempt);
    await ensureSiemDeliveryStorage(event, attempt);
    const indexes = await db.collection('securityevent').listIndexes().toArray();
    expect(indexes.find(index => index.name === 'eventId_1')?.unique).to.equal(true);
    for (const name of [
      'brandId_1_deliveryState_1_nextEligibleAt_1_occurredAt_1',
      'brandId_1_occurredAt_-1',
      'brandId_1_deliveryState_1_leaseExpiresAt_1',
      'brandId_1_deliveryState_1_terminalAt_1',
      'brandId_1_deliveryState_1_updatedAt_1',
    ])
      expect(
        indexes.some(index => index.name === name),
        name
      ).to.equal(true);
    const attempts = await db.collection('siemdeliveryattempt').listIndexes().toArray();
    for (const name of ['eventId_1_destinationId_1', 'brandId_1_startedAt_-1']) {
      expect(
        attempts.some(index => index.name === name),
        name
      ).to.equal(true);
    }
    await db.collection('securityevent').insertOne({ eventId: 'replayed-job', brandId: 'test' });
    let caught: unknown;
    try {
      await db.collection('securityevent').insertOne({ eventId: 'replayed-job', brandId: 'test' });
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(Error);
    if (!(caught instanceof Error) || !('code' in caught)) throw new Error('Expected Mongo duplicate key error');
    expect(caught.code).to.equal(11000);
    expect(await db.collection('securityevent').countDocuments({ eventId: 'replayed-job' })).to.equal(1);
  });
});
