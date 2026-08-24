const { expect } = require('chai');

import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { backfillRecordRevisions } from '../../src/migrations/recordRevisionBackfill';
const { Services } = require('../../src/services/MongoStorageService');

const mongoUrl = process.env.MONGO_CONCURRENCY_TEST_URL;
const describeMongo = mongoUrl ? describe : describe.skip;

describeMongo('MongoStorageService shared Mongo integration', function () {
  this.timeout(30_000);

  let client: MongoClient;
  let databaseName: string;
  let firstService: any;
  let secondService: any;
  let records: any;
  let tombstones: any;

  before(async function () {
    client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 5_000 });
    await client.connect();
    databaseName = `redbox_concurrency_test_${process.pid}_${Date.now()}`;
    const db = client.db(databaseName);
    records = db.collection('record');
    tombstones = db.collection('deletedrecord');
    await records.createIndex({ redboxOid: 1 }, { unique: true });
    await tombstones.createIndex({ redboxOid: 1 }, { unique: true });

    firstService = new Services.MongoStorageService();
    secondService = new Services.MongoStorageService();
    firstService.recordCol = records;
    firstService.deletedRecordCol = tombstones;
    secondService.recordCol = records;
    secondService.deletedRecordCol = tombstones;
  });

  after(async function () {
    if (client) {
      // This database is uniquely named and created only by this test run.
      await client.db(databaseName).dropDatabase();
      await client.close();
    }
  });

  function activeRecord(oid: string) {
    return {
      redboxOid: oid,
      revision: 0,
      metaMetadata: { brandId: 'brand-1', type: 'rdmp' },
      metadata: { title: 'baseline' },
      workflow: { stage: 'draft' },
      authorization: {},
    };
  }

  function lifecycleOperation(
    kind: 'delete' | 'restore' | 'purge',
    sourceRevision: number,
    targetRevision: number,
    operationId = randomUUID()
  ) {
    return {
      operationId,
      kind,
      requestId: randomUUID(),
      sourceRevision,
      targetRevision,
      startedAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
      attempts: 1,
      resolution: 'direct',
    };
  }

  it('has one winner across two service instances sharing one Mongo datastore', async function () {
    const oid = `cas-${randomUUID()}`;
    await records.insertOne(activeRecord(oid));
    const options = { precondition: { expectedRevision: 0, requireRevision: true } };

    const results = await Promise.all([
      firstService.updateMeta(
        { id: 'brand-1' },
        oid,
        { metaMetadata: { brandId: 'brand-1', type: 'rdmp' }, metadata: { title: 'first' } },
        undefined,
        options
      ),
      secondService.updateMeta(
        { id: 'brand-1' },
        oid,
        { metaMetadata: { brandId: 'brand-1', type: 'rdmp' }, metadata: { title: 'second' } },
        undefined,
        options
      ),
    ]);

    expect(results.filter(result => result.applicationState === 'applied')).to.have.length(1);
    expect(results.filter(result => result.nonApplicationReason === 'stale-revision')).to.have.length(1);
    const stored = await records.findOne({ redboxOid: oid });
    expect(stored.revision).to.equal(1);
  });

  it('has one winner for an active update/removal race', async function () {
    const oid = `remove-${randomUUID()}`;
    await records.insertOne(activeRecord(oid));
    const options = { precondition: { expectedRevision: 0, requireRevision: true } };

    const results = await Promise.all([
      firstService.removeActiveRecord({ id: 'brand-1' }, oid, options),
      secondService.updateMeta(
        { id: 'brand-1' },
        oid,
        { metaMetadata: { brandId: 'brand-1', type: 'rdmp' }, metadata: { title: 'racing update' } },
        undefined,
        options
      ),
    ]);

    expect(results.filter(result => result.applicationState === 'applied')).to.have.length(1);
    expect(results.filter(result => result.applicationState === 'not-applied')).to.have.length(1);
    const stored = await records.findOne({ redboxOid: oid });
    if (stored) expect(stored.revision).to.equal(1);
  });

  it('atomically gives one winner to a legacy record with no revision', async function () {
    const oid = `legacy-${randomUUID()}`;
    const legacy = activeRecord(oid);
    delete legacy.revision;
    await records.insertOne(legacy);
    const options = { precondition: { expectedRevision: 0, requireRevision: true } };

    const results = await Promise.all([
      firstService.updateMeta({ id: 'brand-1' }, oid, { metadata: { title: 'first' } }, undefined, options),
      secondService.updateMeta({ id: 'brand-1' }, oid, { metadata: { title: 'second' } }, undefined, options),
    ]);

    expect(results.filter(result => result.applicationState === 'applied')).to.have.length(1);
    expect(results.filter(result => result.nonApplicationReason === 'stale-revision')).to.have.length(1);
    expect((await records.findOne({ redboxOid: oid })).revision).to.equal(1);
  });

  it('conditionally advances and removes a tombstone in the real dialect', async function () {
    const oid = `tombstone-${randomUUID()}`;
    await tombstones.insertOne({
      redboxOid: oid,
      revision: 5,
      brandId: 'brand-1',
      lifecycleState: 'deleted',
      deletedRecordMetadata: {
        redboxOid: oid,
        metaMetadata: { brandId: 'brand-1' },
        metadata: {},
      },
    });

    const claimed = await firstService.updateTombstone(
      { id: 'brand-1' },
      oid,
      { lifecycleState: 'purge-pending' },
      { precondition: { expectedRevision: 5, requireRevision: true } }
    );
    const stale = await secondService.updateTombstone(
      { id: 'brand-1' },
      oid,
      { lifecycleState: 'restore-pending' },
      { precondition: { expectedRevision: 5, requireRevision: true } }
    );
    const removed = await firstService.removeTombstone({ id: 'brand-1' }, oid, {
      precondition: { expectedRevision: 6, requireRevision: true },
    });

    expect(claimed).to.include({ applicationState: 'applied', committedRevision: 6 });
    expect(stale).to.include({ applicationState: 'not-applied', nonApplicationReason: 'stale-revision' });
    expect(removed).to.include({ applicationState: 'applied', committedRevision: 6 });
    expect(await tombstones.findOne({ redboxOid: oid })).to.equal(null);
  });

  it('gives one durable owner to two competing lifecycle intents', async function () {
    const oid = `intent-${randomUUID()}`;
    await records.insertOne(activeRecord(oid));
    const firstOperation = lifecycleOperation('delete', 0, 1);
    const secondOperation = lifecycleOperation('delete', 0, 1);
    const tombstone = (operation: ReturnType<typeof lifecycleOperation>) => ({
      redboxOid: oid,
      revision: 1,
      brandId: 'brand-1',
      lifecycleState: 'delete-pending',
      lifecycleOperation: operation,
      deletedRecordMetadata: activeRecord(oid),
      dateDeleted: '2026-08-24T00:00:00.000Z',
    });

    const results = await Promise.all([
      firstService.createTombstone({ id: 'brand-1' }, oid, tombstone(firstOperation), {
        precondition: { expectedRevision: 0, requireRevision: true },
        lifecycle: { expectedState: 'delete-pending', operationId: firstOperation.operationId },
      }),
      secondService.createTombstone({ id: 'brand-1' }, oid, tombstone(secondOperation), {
        precondition: { expectedRevision: 0, requireRevision: true },
        lifecycle: { expectedState: 'delete-pending', operationId: secondOperation.operationId },
      }),
    ]);

    expect(results.filter(result => result.applicationState === 'applied')).to.have.length(1);
    expect(results.filter(result => result.nonApplicationReason === 'lifecycle-conflict')).to.have.length(1);
    const stored = await tombstones.findOne({ redboxOid: oid });
    expect(stored.revision).to.equal(1);
    expect([firstOperation.operationId, secondOperation.operationId]).to.include(stored.lifecycleOperation.operationId);
  });

  it('serializes restore/purge claims and idempotently delivers a claimed restore', async function () {
    const oid = `restore-${randomUUID()}`;
    const restoreOperation = lifecycleOperation('restore', 5, 6);
    const purgeOperation = lifecycleOperation('purge', 5, 6);
    await tombstones.insertOne({
      redboxOid: oid,
      revision: 5,
      brandId: 'brand-1',
      lifecycleState: 'deleted',
      deletedRecordMetadata: activeRecord(oid),
    });

    const claims = await Promise.all([
      firstService.updateTombstone(
        { id: 'brand-1' },
        oid,
        { lifecycleState: 'restore-pending', lifecycleOperation: restoreOperation },
        {
          precondition: { expectedRevision: 5, requireRevision: true },
          lifecycle: { expectedState: 'deleted' },
        }
      ),
      secondService.updateTombstone(
        { id: 'brand-1' },
        oid,
        { lifecycleState: 'purge-pending', lifecycleOperation: purgeOperation },
        {
          precondition: { expectedRevision: 5, requireRevision: true },
          lifecycle: { expectedState: 'deleted' },
        }
      ),
    ]);
    expect(claims.filter(result => result.applicationState === 'applied')).to.have.length(1);
    expect(claims.filter(result => result.applicationState === 'not-applied')).to.have.length(1);

    const claimed = await tombstones.findOne({ redboxOid: oid });
    if (claimed.lifecycleState !== 'restore-pending') {
      await tombstones.updateOne(
        { redboxOid: oid },
        { $set: { lifecycleState: 'restore-pending', lifecycleOperation: restoreOperation } }
      );
    }
    const options = {
      precondition: { expectedRevision: 6, requireRevision: true },
      lifecycle: { expectedState: 'restore-pending', operationId: restoreOperation.operationId },
    };
    const candidate = activeRecord(oid);
    const deliveries = await Promise.all([
      firstService.createActiveRecordFromTombstone({ id: 'brand-1' }, oid, candidate, options),
      secondService.createActiveRecordFromTombstone({ id: 'brand-1' }, oid, candidate, options),
    ]);

    expect(deliveries.every(result => result.applicationState === 'applied')).to.equal(true);
    expect(deliveries.every(result => result.committedRevision === 7)).to.equal(true);
    expect(await records.countDocuments({ redboxOid: oid })).to.equal(1);
    expect(await records.findOne({ redboxOid: oid })).to.include({
      revision: 7,
      lifecycleOperationId: restoreOperation.operationId,
    });
  });

  it('runs the revision backfill idempotently against the real Mongo API', async function () {
    const activeOid = `migration-active-${randomUUID()}`;
    const tombstoneOid = `migration-tombstone-${randomUUID()}`;
    const active = activeRecord(activeOid);
    delete active.revision;
    await records.insertOne(active);
    await tombstones.insertOne({ redboxOid: tombstoneOid, deletedRecordMetadata: { redboxOid: tombstoneOid } });
    const logger = { info: () => undefined, error: () => undefined };

    const first = await backfillRecordRevisions(client.db(databaseName), 'record', 'deletedrecord', logger, {
      batchSize: 1,
    });
    const repeated = await backfillRecordRevisions(client.db(databaseName), 'record', 'deletedrecord', logger);

    expect(first.activeUpdated).to.equal(1);
    expect(first.tombstonesUpdated).to.equal(1);
    expect(repeated).to.include({ activeUpdated: 0, tombstonesUpdated: 0, batches: 0 });
    expect((await records.findOne({ redboxOid: activeOid })).revision).to.equal(0);
    expect(await tombstones.findOne({ redboxOid: tombstoneOid })).to.include({
      revision: 0,
      lifecycleState: 'deleted',
    });
  });
});
