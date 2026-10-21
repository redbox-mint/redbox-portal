import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, type CommandStartedEvent, type Db } from 'mongodb';
import * as sinon from 'sinon';
import { publicationOperationIdempotencyKey } from '@researchdatabox/redbox-core/dist/services/publication/operations';
import {
  PublicationProviderRegistry,
  type PublicationProvider,
  type PublicationObject,
  type PublicationValidationResult,
  PublicationSyncStore,
  publicationOperationEvidence,
  PublicationResourceStore,
  PublicationLeaseLost,
  PublicationStoreConflict,
  PublicationBindingConflict,
  PublicationStagingFence,
  publicationStagingIsReferenced,
  type PublicationWorkKey,
  type PublicationOperation,
  type PublicationSyncModel,
} from '@researchdatabox/redbox-core';

if (process.env.CI === 'true' && !process.env.MONGO_TEST_URL)
  throw new Error('CI requires MONGO_TEST_URL; publication store acceptance cannot be skipped');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Native publication state and resource ownership (PUB-05)', function () {
  this.timeout(20000);
  let client: MongoClient;
  let store: PublicationSyncStore;
  let databaseHandle: Db;
  let resources: PublicationResourceStore;
  let now: number;
  const database = `publication_store_${randomUUID().replaceAll('-', '')}`;
  const key: PublicationWorkKey = { brandId: 'brand', oid: 'record', destinationId: 'main' };
  const resource = { providerId: 'oni', namespace: 'ocfl://actual-repository', resourceKey: 'ingestion' };
  const request = (generation = 1) => ({
    sourceGeneration: generation,
    sourceRevision: generation,
    approvalId: `approval-${generation}`,
    approvalEpoch: 1,
    sourceDigest: `source-${generation}`,
    configurationDigest: 'config',
    source: { encodingVersion: 1, disk: 'durable', key: `brand/request-${generation}`, digest: 'a'.repeat(64) },
  });
  const operation = (id = 'deposit'): PublicationOperation => ({
    id,
    kind: 'deposit',
    approvalId: 'approval-1',
    approvalEpoch: 1,
    sourceGeneration: 1,
    intendedDigest: 'payload',
    submittedAt: '2026-10-19T01:00:00Z',
    outcome: 'submitted',
    evidence: { head: 'v1' },
  });
  async function ready(workKey = key, target = 'target') {
    await store.initialise(workKey, 'oni', target);
    return store.importRequest(workKey, request(), now);
  }
  async function owned(
    workKey = key
  ): Promise<PublicationSyncModel & { lease: NonNullable<PublicationSyncModel['lease']> }> {
    await ready(workKey);
    const row = await store.claim(workKey, 'worker', 1000);
    assert.ok(row?.lease);
    return { ...row, lease: row.lease };
  }
  before(async () => {
    client = new MongoClient(process.env.MONGO_TEST_URL!, { monitorCommands: true });
    await client.connect();
  });
  beforeEach(async () => {
    await client.db(database).dropDatabase();
    now = 10000;
    databaseHandle = client.db(database);
    store = new PublicationSyncStore(databaseHandle, () => now);
    resources = new PublicationResourceStore(databaseHandle, () => now);
    await store.ensureIndexes();
    await resources.ensureIndexes();
  });
  after(async () => {
    await client.db(database).dropDatabase();
    await client.close();
  });
  it('initialises one work row under contention and keeps destinations/brands independent', async () => {
    await Promise.all(Array.from({ length: 20 }, () => store.initialise(key, 'oni', 'target')));
    await store.initialise({ ...key, destinationId: 'second' }, 'oni', 'target');
    await store.initialise({ ...key, brandId: 'other' }, 'oni', 'target');
    assert.equal(await store.collection.countDocuments({}), 3);
    assert.equal(await store.get({ ...key, brandId: 'missing' }), null);
  });
  it('pins used destination target/provider across records and restarts', async () => {
    await ready();
    const restarted = new PublicationSyncStore(client.db(database), () => now);
    await assert.rejects(restarted.initialise({ ...key, oid: 'other' }, 'oni', 'different'), /identity cannot change/);
    await assert.rejects(
      restarted.initialise({ ...key, oid: 'other' }, 'other-provider', 'target'),
      /identity cannot change/
    );
    assert.deepEqual(await restarted.usedDestinations('brand'), {
      main: { providerId: 'oni', targetFingerprint: 'target' },
    });
    assert.equal(await store.collection.countDocuments({}), 1);
  });
  it('reserves targets before dispatch and finishes backfill only after durable identity writes', async () => {
    const writes: CommandStartedEvent[] = [];
    const capture = (event: CommandStartedEvent) => {
      if (event.command.update === 'publicationdestinationledger' || event.command.update === 'publicationdestination')
        writes.push(event);
    };
    client.on('commandStarted', capture);
    try {
      await assert.rejects(
        store.prepareDestinationLedger('brand', async () => {
          await store.reserveDestination('brand', 'main', 'oni', 'target');
          throw new Error('Unreadable sealed evidence');
        }),
        /Unreadable/
      );
      assert.equal(await store.destinationLedgerReady('brand'), false);
      await store.prepareDestinationLedger('brand', async () => {
        await store.reserveDestination('brand', 'main', 'oni', 'target');
      });
      assert.equal(await new PublicationSyncStore(databaseHandle).destinationLedgerReady('brand'), true);
      await store.prepareDestinationLedger('brand', async () => assert.fail('Completed backfill must not run again'));
      const raced = await Promise.allSettled([
        store.reserveDestination('brand', 'another', 'oni', 'one'),
        store.reserveDestination('brand', 'another', 'oni', 'two'),
      ]);
      assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(raced.filter(result => result.status === 'rejected').length, 1);
      assert.equal(await store.collection.countDocuments(), 0);
      assert.equal(await store.destinationLedgerReady('foreign'), false);
      await databaseHandle
        .collection<{ _id: string; schemaVersion: number }>('publicationdestinationledger')
        .updateOne({ _id: 'brand' }, { $set: { schemaVersion: 900 } }, { writeConcern: { w: 'majority', j: true } });
      await assert.rejects(store.destinationLedgerReady('brand'), /Unsupported/);
    } finally {
      client.off('commandStarted', capture);
    }
    assert.ok(writes.length >= 5);
    for (const write of writes) assert.deepEqual(write.command.writeConcern, { w: 'majority', j: true });
  });
  it('requires journaled majority acknowledgement before granting remote mutation authority', async () => {
    const writes: CommandStartedEvent[] = [];
    const capture = (event: CommandStartedEvent) => {
      if (
        ['insert', 'update', 'delete', 'findAndModify'].includes(event.commandName) &&
        ['publicationsync', 'publicationdestination', 'publicationresourcelease'].includes(
          event.command[event.commandName]
        )
      )
        writes.push(event);
    };
    client.on('commandStarted', capture);
    try {
      const row = await owned();
      await store.journal(key, row.lease, row.revision, operation());
      const shared = await resources.claim(resource, key.brandId, 'worker', 1000);
      assert.ok(shared?.lease);
      await resources.journal(resource, key.brandId, shared.lease, shared.revision, key, operation());
    } finally {
      client.off('commandStarted', capture);
    }
    assert.ok(writes.length >= 6);
    for (const write of writes) assert.deepEqual(write.command.writeConcern, { w: 'majority', j: true });
  });
  it('imports out-of-order generations idempotently without erasing evidence', async () => {
    await ready();
    await Promise.all([2, 7, 4, 3, 5, 6].map(generation => store.importRequest(key, request(generation), now)));
    const row = await store.get(key);
    assert.ok(row);
    assert.equal(row.sourceGeneration, 7);
    await store.importRequest(key, request(7), now);
    assert.deepEqual(await store.get(key), row);
    await assert.rejects(
      store.importRequest(key, { ...request(7), sourceDigest: 'forged' }),
      /conflicting source identity/
    );
  });
  it('archives superseded settled journals and source references without growing the active record', async function () {
    this.timeout(120000);
    let row = await owned();
    const registry = new PublicationProviderRegistry();
    registry.register({
      id: 'oni',
      contractVersion: 2,
      stateVersion: 1,
      configurationSchema: {},
      secretPaths: [],
      mutationRecovery: { mode: 'idempotency-key' },
      capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: true },
      validateConfiguration: () => ({ valid: true, value: {} }),
      targetFingerprint: () => 'target',
      decodeState: () => ({ valid: true, value: {} }),
      upgradeState: () => ({ valid: true, value: {} }),
      decodePreparedSource: () => ({ valid: true, value: {} }),
      prepareSource: async () => ({ valid: true, value: {} }),
      synchronise: async context => ({ kind: 'waiting', state: context.state, reason: 'review' }),
      observe: async context => ({ kind: 'waiting', state: context.state, reason: 'review' }),
      reconcile: async context => ({ kind: 'waiting', state: context.state, reason: 'review' }),
      repairs: [],
    });
    const first = request(1).source;
    const release = await new PublicationStagingFence(client.db(database)).pinRegistered(first);
    await release();
    const keys = new Map<string, string>();
    for (let generation = 1; generation <= 140; generation++) {
      const op = { ...operation(`deposit-${generation}`), approvalId: row.approvalId, sourceGeneration: generation };
      const operationKey = publicationOperationIdempotencyKey(row, op);
      keys.set(op.id, operationKey);
      Object.assign(op, { idempotencyKey: operationKey });
      row = { ...(await store.journal(key, row.lease, row.revision, op)), lease: row.lease };
      row = {
        ...(await store.journal(key, row.lease, row.revision, {
          ...op,
          outcome: 'confirmed',
          confirmation: publicationOperationEvidence(row, op),
        })),
        lease: row.lease,
      };
      row = {
        ...(await store.checkpointProviderState(key, row.lease, row.revision, {}, registry, [op.id])),
        lease: row.lease,
      };
      const next = request(generation + 1);
      await (
        await new PublicationStagingFence(client.db(database)).pinRegistered(next.source)
      )();
      row = { ...(await store.importRequest(key, next, now)), lease: row.lease };
    }
    assert.equal(row.operations.length, 128);
    assert.equal(row.recoverySources.length, 16);
    const history = client.db(database).collection('publicationhistory');
    const original = await history.findOne({
      'snapshot.brandId': key.brandId,
      'snapshot.oid': key.oid,
      'snapshot.sourceGeneration': 1,
    });
    assert.ok(original);
    assert.deepEqual(original.snapshot.source, first);
    assert.equal(original.snapshot.operations[0].outcome, 'confirmed');
    assert.equal(original.snapshot.operations[0].idempotencyKey, keys.get('deposit-1'));
    assert.equal(new Set(keys.values()).size, 140);
    for (const op of row.operations) assert.equal(op.idempotencyKey, keys.get(op.id));
    const restarted = await new PublicationSyncStore(client.db(database), () => now).get(key);
    assert.deepEqual(restarted?.operations, row.operations);
    assert.equal(await publicationStagingIsReferenced(client.db(database), first), true);
  });
  it('bounds the shared repository journal while retaining unresolved readiness and archived evidence', async function () {
    this.timeout(120000);
    const db = client.db(database);
    let shared = await resources.claim(resource, key.brandId, 'worker', 1000);
    assert.ok(shared?.lease);
    const lease = shared.lease;
    const indexing = { ...operation('indexing'), kind: 'oni.index.search' };
    shared = await resources.journal(resource, key.brandId, lease, shared.revision, key, indexing);
    shared = await resources.journal(resource, key.brandId, lease, shared.revision, key, {
      ...indexing,
      outcome: 'confirmed',
      evidence: { acceptedAt: 'now' },
    });
    for (let index = 0; index < 140; index++) {
      const work = { ...key, oid: `record-${index}` };
      const op = operation(`deposit-${index}`);
      // The record checkpoint matches the durable resource checkpoint before it can be archived.
      await store.initialise(work, 'oni', 'target');
      await store.collection.updateOne(work, {
        $set: {
          status: 'completed',
          sourceGeneration: op.sourceGeneration,
          approvalId: op.approvalId,
          approvalEpoch: op.approvalEpoch,
          operations: [{ ...op, outcome: 'confirmed' }],
        },
      });
      shared = await resources.journal(resource, key.brandId, lease, shared.revision, work, op);
      shared = await resources.journal(resource, key.brandId, lease, shared.revision, work, {
        ...op,
        outcome: 'confirmed',
      });
    }
    assert.ok(shared.operations.length <= 128);
    assert.ok(shared.operations.some(entry => entry.operation.id === 'indexing'));
    const history = await db.collection('publicationhistory').findOne({ 'snapshot.namespace': resource.namespace });
    assert.ok(history);
    assert.equal(
      history.snapshot.operations.find(
        (entry: { operation: PublicationOperation }) => entry.operation.id === 'deposit-0'
      ).operation.outcome,
      'confirmed'
    );
  });
  it('refuses oversized operation submissions before consuming journal capacity or remote authority', async () => {
    const row = await owned();
    await assert.rejects(
      store.journal(key, row.lease, row.revision, {
        ...operation(),
        evidence: { oversized: 'x'.repeat(4 * 1024 * 1024) },
      }),
      /journal capacity reached/
    );
    assert.deepEqual((await store.get(key))!.operations, []);
    const shared = await resources.claim(resource, key.brandId, 'worker', 1000);
    assert.ok(shared?.lease);
    await assert.rejects(
      resources.journal(resource, key.brandId, shared.lease, shared.revision, key, {
        ...operation(),
        evidence: { oversized: 'x'.repeat(4 * 1024 * 1024) },
      }),
      /journal capacity reached/
    );
    assert.deepEqual((await resources.get(resource))!.operations, []);
  });
  it('retains live evidence when the archive write fails before pruning', async () => {
    const before = await owned();
    const db = databaseHandle;
    const history = db.collection('publicationhistory');
    const write = sinon.stub(history, 'updateOne').rejects(new Error('archive unavailable'));
    const collection = sinon.stub(db, 'collection').callThrough();
    collection.withArgs('publicationhistory').returns(history);
    try {
      await assert.rejects(store.importRequest(key, request(2)), /archive unavailable/);
      assert.equal(write.callCount, 1);
      assert.deepEqual(await store.get(key), before);
    } finally {
      sinon.restore();
    }
  });
  for (const outcome of ['submitted', 'confirmed'] as const)
    it(`retains ${outcome} recovery beyond journal and source compaction windows`, async () => {
      let row = await owned();
      row = { ...(await store.journal(key, row.lease, row.revision, operation())), lease: row.lease };
      if (outcome === 'confirmed')
        row = {
          ...(await store.journal(key, row.lease, row.revision, { ...operation(), outcome })),
          lease: row.lease,
        };
      // Add already-settled historical evidence to push the pending receipt beyond the recent 128.
      await store.collection.updateOne(key, {
        $push: {
          operations: {
            $each: Array.from({ length: 130 }, (_, i) => ({
              ...operation(`settled-${i}`),
              outcome: 'rejected' as const,
            })),
          },
        },
      });
      for (let generation = 2; generation <= 20; generation++)
        row = { ...(await store.importRequest(key, request(generation))), lease: row.lease };
      assert.ok(row.recoverySources.some(reference => reference.key === request().source.key));
      assert.equal(row.operations.find(entry => entry.id === operation().id)?.outcome, outcome);
    });
  it('gives duplicate workers exactly one unexpired owner', async () => {
    await ready();
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.claim(key, `worker-${index}`, 1000))
    );
    assert.equal(claims.filter(Boolean).length, 1);
  });
  it('retains migrated uncertainty without inventing a sealed historical approval', async () => {
    await store.initialise(key, 'oni', 'target');
    const legacy = {
      ...operation('legacy'),
      approvalId: '',
      approvalEpoch: 0,
      outcome: 'uncertain' as const,
      evidence: { historical: true },
    };
    await store.collection.updateOne(key, {
      $set: { operations: [legacy], providerState: { legacyReceipt: 'retained' } },
    });
    const imported = await store.importRequest(key, request());
    assert.deepEqual(imported.operations, [legacy]);
    assert.deepEqual(imported.providerState, { legacyReceipt: 'retained' });
    assert.deepEqual(imported.recoverySources, []);
  });
  it('enforces revision CAS when current owners compete for a checkpoint', async () => {
    const row = await owned();
    const results = await Promise.allSettled([
      store.checkpoint(key, row.lease, row.revision, { links: { url: 'one' } }),
      store.checkpoint(key, row.lease, row.revision, { links: { url: 'two' } }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(
      results.filter(result => result.status === 'rejected' && result.reason instanceof PublicationStoreConflict)
        .length,
      1
    );
    assert.equal((await store.get(key))!.revision, row.revision + 1);
  });
  it('rejects expired checkpoint, heartbeat and release before replacement', async () => {
    const row = await owned();
    now += 1000;
    await assert.rejects(store.checkpoint(key, row.lease, row.revision, { status: 'completed' }), PublicationLeaseLost);
    await assert.rejects(store.renew(key, row.lease, row.revision, 1000), PublicationLeaseLost);
    await assert.rejects(store.release(key, row.lease, row.revision), PublicationLeaseLost);
  });
  it('uses a new token on reacquisition even with the same owner name', async () => {
    const row = await owned();
    now += 1001;
    const successor = await store.claim(key, 'worker', 1000);
    assert.ok(successor?.lease);
    assert.notEqual(successor.lease.token, row.lease.token);
    await assert.rejects(
      store.checkpoint(key, row.lease, successor.revision, { status: 'completed' }),
      PublicationLeaseLost
    );
    await assert.rejects(store.release(key, row.lease, successor.revision), PublicationLeaseLost);
    const renewed = await store.renew(key, successor.lease, successor.revision, 5000);
    assert.equal(renewed.lease!.expiresAt, now + 5000);
  });
  it('retains journals across lease replacement and source supersession', async () => {
    const row = await owned();
    const submitted = await store.journal(key, row.lease, row.revision, operation());
    const uncertain = await store.journal(key, row.lease, submitted.revision, {
      ...operation(),
      outcome: 'uncertain',
      evidence: { timeout: true },
    });
    now += 1001;
    const successor = await store.claim(key, 'successor', 1000);
    assert.ok(successor?.lease);
    const fresh = await store.importRequest(key, request(2));
    const confirmed = await store.journal(key, successor.lease, fresh.revision, {
      ...operation(),
      outcome: 'confirmed',
      evidence: { actualHead: 'v2' },
    });
    assert.equal(confirmed.sourceGeneration, 2);
    assert.deepEqual(confirmed.recoverySources, [request(1).source]);
    assert.deepEqual(confirmed.source, request(2).source);
    assert.deepEqual(confirmed.operations[0].evidence, { head: 'v1', timeout: true, actualHead: 'v2' });
    await assert.rejects(store.journal(key, successor.lease, confirmed.revision, operation()), /cannot regress/);
    assert.equal(uncertain.operations[0].outcome, 'uncertain');
    const restarted = new PublicationSyncStore(client.db(database));
    assert.deepEqual((await restarted.get(key))!.operations, confirmed.operations);
  });
  it('rejects blind resubmission, changed operation identity and stale authority', async () => {
    const row = await owned();
    let state = await store.journal(key, row.lease, row.revision, operation());
    state = await store.journal(key, row.lease, state.revision, { ...operation(), outcome: 'uncertain' });
    await assert.rejects(store.journal(key, row.lease, state.revision, operation()), /requires reconciliation/);
    await assert.rejects(
      store.journal(key, row.lease, state.revision, { ...operation(), intendedDigest: 'different' }),
      /identity cannot change/
    );
    await assert.rejects(
      store.journal(key, row.lease, state.revision, { ...operation('other'), approvalEpoch: 8 }),
      /current publication request/
    );
  });
  it('blocks new mutations until uncertain work is reconciled and preserves original evidence', async () => {
    const row = await owned();
    const submitted = await store.journal(key, row.lease, row.revision, operation());
    const uncertain = await store.journal(key, row.lease, submitted.revision, { ...operation(), outcome: 'uncertain' });
    await assert.rejects(
      store.journal(key, row.lease, uncertain.revision, operation('second')),
      /requires reconciliation/
    );
    await assert.rejects(
      store.journal(key, row.lease, uncertain.revision, {
        ...operation(),
        outcome: 'confirmed',
        evidence: { head: 'overwritten' },
      }),
      /cannot be overwritten/
    );
    const reconciled = await store.journal(key, row.lease, uncertain.revision, {
      ...operation(),
      outcome: 'not_applied',
    });
    await store.journal(key, row.lease, reconciled.revision, operation('second'));
    const held = await resources.claim(resource, 'brand', 'worker', 1000);
    assert.ok(held?.lease);
    const pending = await resources.journal(resource, 'brand', held.lease, held.revision, key, operation());
    await assert.rejects(
      resources.journal(resource, 'brand', held.lease, pending.revision, key, operation('other')),
      /requires reconciliation/
    );
  });
  it('permits many unbound rows and rejects one remote object managed across brands and destinations', async () => {
    const first = await owned();
    const secondKey = { brandId: 'other', oid: 'another', destinationId: 'second' };
    const second = await owned(secondKey);
    await store.initialise({ ...key, oid: 'unbound-1' }, 'oni', 'target');
    await store.initialise({ ...key, oid: 'unbound-2' }, 'oni', 'target');
    const binding = {
      namespace: 'actual-repository',
      objectId: 'object',
      targetFingerprint: 'target',
      evidence: { version: 'v1' },
    };
    await store.bind(key, first.lease, first.revision, binding);
    await assert.rejects(store.bind(secondKey, second.lease, second.revision, binding), PublicationBindingConflict);
    assert.equal((await store.get(secondKey))!.binding, undefined);
    await store.bind(secondKey, second.lease, second.revision, { ...binding, namespace: 'independent-repository' });
  });
  it('rejects two same-record destinations managing one remote object or repointing a binding', async () => {
    const first = await owned();
    const secondKey = { ...key, destinationId: 'second' };
    const second = await owned(secondKey);
    const binding = { namespace: 'actual-repository', objectId: 'object', targetFingerprint: 'target', evidence: {} };
    const bound = await store.bind(key, first.lease, first.revision, binding);
    await assert.rejects(store.bind(secondKey, second.lease, second.revision, binding), PublicationBindingConflict);
    await assert.rejects(
      store.bind(key, first.lease, bound.revision, { ...binding, objectId: 'other' }),
      /administrative repair/
    );
    await assert.rejects(
      store.bind(secondKey, second.lease, second.revision, { ...binding, targetFingerprint: 'other' }),
      /target mismatch/
    );
  });
  it('paginates durable due work fairly, scopes by brand and atomically claims dispatch cooldown', async () => {
    for (const oid of ['a', 'b', 'c', 'd']) await ready({ ...key, oid });
    await ready({ ...key, brandId: 'other' });
    const page = await store.due('brand', 2);
    assert.deepEqual(
      page.map(row => row.oid),
      ['a', 'b']
    );
    const last = page[1];
    assert.ok(last.nextActionAt !== null);
    const rest = await store.due('brand', 2, {
      brandId: 'brand',
      oid: last.oid,
      destinationId: last.destinationId,
      nextActionAt: last.nextActionAt,
    });
    assert.deepEqual(
      rest.map(row => row.oid),
      ['c', 'd']
    );
    const dispatches = await Promise.all(
      Array.from({ length: 10 }, () => store.dispatchClaim(page[0], page[0].revision, 1000))
    );
    assert.equal(dispatches.filter(Boolean).length, 1);
    assert.equal((await store.due('brand')).length, 3);
    now += 1000;
    assert.equal((await store.due('brand')).length, 4);
    await assert.rejects(
      store.due('other', 2, { brandId: 'brand', oid: 'a', destinationId: 'main', nextActionAt: 10000 }),
      /due page/
    );
  });
  it('schedules only unprocessed work and preserves independent observation/maintenance obligations', async () => {
    const row = await owned();
    const changed = await store.request(key, 'observe', row.revision, now + 100);
    const checkpoint = await store.checkpoint(key, row.lease, changed.revision, {
      work: { ...changed.work, synchronise: { requested: 1, processed: 1, dueAt: now } },
    });
    assert.equal(checkpoint.nextActionAt, now + 100);
    await store.release(key, row.lease, checkpoint.revision);
    assert.equal((await store.due('brand')).length, 0);
    now += 100;
    assert.equal((await store.due('brand')).length, 1);
  });
  it('rejects obligation regression and source regression while retaining current work', async () => {
    const row = await owned();
    await assert.rejects(
      store.checkpoint(key, row.lease, row.revision, {
        work: { ...row.work, synchronise: { requested: 0, processed: 0, dueAt: null } },
      }),
      /cannot be erased/
    );
    const newer = await store.importRequest(key, request(2));
    await assert.rejects(store.importRequest(key, { ...request(3), sourceRevision: 1 }), /cannot regress/);
    assert.equal((await store.get(key))!.revision, newer.revision);
  });
  it('retains unknown row schema without attempting a replacement', async () => {
    await ready();
    await client
      .db(database)
      .collection('publicationsync')
      .updateOne(key, { $set: { schemaVersion: 2 } });
    const before = await store.collection.findOne(key);
    await assert.rejects(store.initialise(key, 'oni', 'target'), /Unsupported/);
    assert.deepEqual(await store.collection.findOne(key), before);
  });
  it('persists explicit provider upgrades under CAS and retains unknown or invalid evidence', async () => {
    const registry = new PublicationProviderRegistry();
    const decode = (value: unknown): PublicationValidationResult<PublicationObject> => {
      if (
        value &&
        typeof value === 'object' &&
        'legacy' in value &&
        typeof value.legacy === 'string' &&
        'evidence' in value &&
        typeof value.evidence === 'string'
      )
        return { valid: true, value: { legacy: value.legacy, evidence: value.evidence, upgraded: true } };
      return { valid: false, issues: [{ path: '', code: 'invalid-state', message: 'Invalid state' }] };
    };
    const provider: PublicationProvider<PublicationObject, PublicationObject, PublicationObject> = {
      id: 'oni',
      contractVersion: 2,
      stateVersion: 2,
      configurationSchema: {},
      secretPaths: [],
      mutationRecovery: { mode: 'idempotency-key' },
      capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: true },
      validateConfiguration: () => ({ valid: true, value: {} }),
      targetFingerprint: () => 'target',
      decodeState: decode,
      upgradeState: decode,
      decodePreparedSource: decode,
      prepareSource: async () => ({ valid: true, value: {} }),
      synchronise: async context => ({ kind: 'waiting', state: context.state, reason: 'review', nextCheckAt: now }),
      observe: async context => ({ kind: 'waiting', state: context.state, reason: 'review', nextCheckAt: now }),
      reconcile: async context => ({ kind: 'waiting', state: context.state, reason: 'review', nextCheckAt: now }),
      repairs: [],
    };
    registry.register(provider);
    registry.freeze();
    const row = await owned();
    await store.collection.updateOne(key, { $set: { providerState: { legacy: 'v1', evidence: 'uncertain-create' } } });
    const upgraded = await store.upgradeProviderState(key, row.lease, row.revision, registry);
    assert.equal(upgraded.providerStateVersion, 2);
    assert.deepEqual(upgraded.providerState, { legacy: 'v1', evidence: 'uncertain-create', upgraded: true });
    await assert.rejects(
      store.checkpointProviderState(key, row.lease, upgraded.revision, { invalid: true }, registry),
      /Invalid/
    );
    assert.deepEqual(await store.get(key), upgraded);
    await store.collection.updateOne(key, {
      $set: { providerStateVersion: 99, providerState: { unknown: { evidence: 'retain byte for byte' } } },
    });
    const future = await store.get(key);
    await assert.rejects(store.upgradeProviderState(key, row.lease, upgraded.revision, registry), /Unsupported/);
    await assert.rejects(store.checkpointProviderState(key, row.lease, upgraded.revision, {}, registry), /Unsupported/);
    assert.deepEqual(await store.get(key), future);
  });
  it('serialises shared repository resources across brands while unrelated resources progress', async () => {
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, index) => resources.claim(resource, `brand-${index}`, `worker-${index}`, 1000))
    );
    assert.equal(claims.filter(Boolean).length, 1);
    assert.ok(await resources.claim({ ...resource, namespace: 'ocfl://other' }, 'brand', 'worker', 1000));
    assert.ok(await resources.claim({ ...resource, resourceKey: 'root-collection' }, 'brand', 'worker', 1000));
  });
  it('preserves uncertain resource operations on expiry and refuses stale or cross-brand checkpoints', async () => {
    const first = await resources.claim(resource, 'brand', 'worker', 1000);
    assert.ok(first?.lease);
    let state = await resources.journal(resource, 'brand', first.lease, first.revision, key, operation());
    state = await resources.journal(resource, 'brand', first.lease, state.revision, key, {
      ...operation(),
      outcome: 'uncertain',
    });
    await assert.rejects(resources.renew(resource, 'other', first.lease, state.revision, 1000), PublicationLeaseLost);
    now += 1000;
    await assert.rejects(resources.release(resource, 'brand', first.lease, state.revision), PublicationLeaseLost);
    const next = await resources.claim(resource, 'brand', 'worker', 1000);
    assert.ok(next?.lease);
    assert.equal(next.operations[0].operation.outcome, 'uncertain');
    await assert.rejects(
      resources.journal(resource, 'brand', first.lease, next.revision, key, operation()),
      PublicationLeaseLost
    );
    const confirmed = await resources.journal(resource, 'brand', next.lease, next.revision, key, {
      ...operation(),
      outcome: 'confirmed',
      evidence: { indexAfterCommit: 'v2' },
    });
    await resources.release(resource, 'brand', next.lease, confirmed.revision);
    const restarted = new PublicationResourceStore(client.db(database));
    assert.equal((await restarted.get(resource))!.operations[0].operation.outcome, 'confirmed');
  });
  it('enforces resource revision CAS on heartbeat and release', async () => {
    const row = await resources.claim(resource, 'brand', 'worker', 1000);
    assert.ok(row?.lease);
    const renewed = await resources.renew(resource, 'brand', row.lease, row.revision, 5000);
    await assert.rejects(resources.release(resource, 'brand', row.lease, row.revision), PublicationStoreConflict);
    assert.equal(renewed.lease!.expiresAt, now + 5000);
    await resources.release(resource, 'brand', row.lease, renewed.revision);
    const next = await resources.claim(resource, 'brand', 'worker', 1000);
    assert.ok(next?.lease);
    assert.notEqual(next.lease.token, row.lease.token);
  });
});
