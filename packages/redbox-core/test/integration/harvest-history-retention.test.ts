import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { pruneHarvestHistory } from '../../src/utilities/HarvestHistoryRetention';
import { ensureHarvestRunIndexes } from '../../src/utilities/HarvestRunIndexes';
import { agendaQueue, HARVEST_HISTORY_RETENTION_JOB_NAME } from '../../src/config/agendaQueue.config';

const mongoUrl = process.env.HARVEST_MONGO_TEST_URL;
const now = new Date('2026-10-30T00:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const config = { enabled: true, successfulDays: 90, failedDays: 365, batchSize: 2 };

(mongoUrl ? describe : describe.skip)('Harvest history retention against MongoDB', function () {
  this.timeout(15000);
  let client: MongoClient;
  let db: Db;
  before(async () => {
    client = new MongoClient(mongoUrl!);
    await client.connect();
  });
  beforeEach(async () => {
    db = client.db(`harvest-retention-test-${randomUUID()}`);
    await ensureHarvestRunIndexes(db);
  });
  afterEach(async () => {
    await db.dropDatabase();
  });
  after(async () => {
    await client?.close();
  });

  /**
   * Insert a run with successful and failed detail at the requested age in days.
   * Return its ID so tests can change activity dates or inspect retained history.
   */
  async function seed(age: number, status = 'completed_with_errors', brandId = 'brand') {
    const _id = new ObjectId();
    const timestamp = daysAgo(age);
    await db.collection('harvestrun').insertOne({
      _id,
      brandId,
      recordType: 'party',
      sourceName: 'test',
      sourceRunId: String(_id),
      status,
      startedAt: timestamp,
      completedAt: timestamp,
      lastChunkAt: timestamp,
      totalProcessed: 4,
      created: 3,
      failed: 1,
      chunksProcessed: 2,
    });
    const scope = { runId: String(_id), brandId };
    await db
      .collection('harvestrecordevent')
      .insertMany([
        ...Array.from({ length: 3 }, () => ({ ...scope, outcome: 'unchanged', createdAt: timestamp })),
        { ...scope, outcome: 'failed', createdAt: timestamp, recordSnapshot: { recordRequest: { title: 'failure' } } },
      ]);
    await db.collection('harvestrunchunk').insertMany([
      { ...scope, contentHash: 'success', attempt: 1, status: 'processed', failed: 0, submittedAt: timestamp },
      { ...scope, contentHash: 'failure', attempt: 1, status: 'processed', failed: 1, submittedAt: timestamp },
    ]);
    return _id;
  }

  it('keeps summaries, prunes successes at 90 days and failures at 365 across brands, and is repeatable', async () => {
    const old = await seed(100);
    const ancient = await seed(400, 'failed', 'other-brand');
    const fresh = await seed(89);
    let heartbeats = 0;
    const result = await pruneHarvestHistory(
      db,
      config,
      {},
      async () => {
        heartbeats++;
      },
      now
    );
    assert.equal(result.runs, 2);
    assert.equal(result.events, 7);
    assert.equal(result.chunks, 3);
    assert.ok(heartbeats >= 5);
    assert.equal(await db.collection('harvestrun').countDocuments(), 3);
    const summary = await db.collection('harvestrun').findOne({ _id: old });
    assert.equal(summary?.totalProcessed, 4);
    assert.equal(summary?.failed, 1);
    assert.equal(summary?.historyRetention.complete, false);
    assert.equal((await db.collection('harvestrun').findOne({ _id: ancient }))?.historyRetention.complete, true);
    assert.equal((await db.collection('harvestrun').findOne({ _id: fresh }))?.historyRetention, undefined);
    const retained = await db
      .collection('harvestrecordevent')
      .find({ runId: String(old) })
      .toArray();
    assert.equal(retained.length, 1);
    assert.equal(retained[0].outcome, 'failed');
    assert.ok(retained[0].recordSnapshot);
    const again = await pruneHarvestHistory(db, config, {}, undefined, now);
    assert.equal(again.events, 0);
    assert.equal(again.chunks, 0);
    const later = new Date(now.getTime() + 270 * 86_400_000);
    await pruneHarvestHistory(db, config, {}, undefined, later);
    assert.equal(await db.collection('harvestrecordevent').countDocuments({ runId: String(old) }), 0);
    assert.equal((await db.collection('harvestrun').findOne({ _id: old }))?.historyRetention.complete, true);
  });

  it('makes no changes for dry runs and reports matching deletes', async () => {
    const id = await seed(100);
    const result = await pruneHarvestHistory(db, config, { dryRun: true }, undefined, now);
    assert.equal(result.events, 3);
    assert.equal(result.chunks, 1);
    assert.equal(await db.collection('harvestrecordevent').countDocuments(), 4);
    assert.equal((await db.collection('harvestrun').findOne({ _id: id }))?.historyRetention, undefined);
    const disabled = await pruneHarvestHistory(db, { ...config, enabled: false }, {}, undefined, now);
    assert.equal(disabled.runs, 0);
  });

  it('skips running runs, missing completion dates, active chunks, recent activity and exact cutoff dates', async () => {
    await seed(400, 'running');
    const missing = await seed(400);
    await db.collection('harvestrun').updateOne({ _id: missing }, { $unset: { completedAt: '' } });
    const active = await seed(400);
    await db.collection('harvestrunchunk').updateOne({ runId: String(active) }, { $set: { status: 'processing' } });
    const recent = await seed(400);
    await db.collection('harvestrun').updateOne({ _id: recent }, { $set: { lastChunkAt: daysAgo(1) } });
    await seed(90);
    const result = await pruneHarvestHistory(db, config, {}, undefined, now);
    assert.equal(result.runs, 0);
    assert.equal(result.events, 0);
    assert.equal(await db.collection('harvestrecordevent').countDocuments(), 20);
  });

  it('fails closed on unsafe configuration and resumes after a partial deletion failure', async () => {
    const id = await seed(100);
    await assert.rejects(() => pruneHarvestHistory(db, { ...config, successfulDays: 0 }, {}, undefined, now));
    await assert.rejects(() => pruneHarvestHistory(db, { ...config, failedDays: 89 }, {}, undefined, now));
    let touches = 0;
    await assert.rejects(
      () =>
        pruneHarvestHistory(
          db,
          config,
          {},
          async () => {
            if (++touches === 2) throw new Error('Lost lock');
          },
          now
        ),
      /Lost lock/
    );
    assert.ok((await db.collection('harvestrun').findOne({ _id: id }))?.historyRetention);
    await pruneHarvestHistory(db, config, {}, undefined, now);
    assert.equal(await db.collection('harvestrecordevent').countDocuments(), 1);
    assert.equal(await db.collection('harvestrunchunk').countDocuments(), 1);
  });

  it('does not mark runs without expired details, and preserves failures exactly 365 days old', async () => {
    const failuresOnly = await seed(100);
    await db.collection('harvestrecordevent').deleteMany({runId: String(failuresOnly), outcome: 'unchanged'});
    await db.collection('harvestrunchunk').deleteOne({runId: String(failuresOnly), failed: 0});
    const boundary = await seed(365);
    const result = await pruneHarvestHistory(db, config, {}, undefined, now);
    assert.equal(result.runs, 1);
    assert.equal((await db.collection('harvestrun').findOne({_id: failuresOnly}))?.historyRetention, undefined);
    assert.equal(await db.collection('harvestrecordevent').countDocuments({runId: String(boundary)}), 1);
    assert.equal(await db.collection('harvestrunchunk').countDocuments({runId: String(boundary)}), 1);
  });

  it('registers a daily Mongo-backed job with a single worker and no immediate startup purge', () => {
    const job = agendaQueue.jobs[HARVEST_HISTORY_RETENTION_JOB_NAME];
    assert.equal(job.fnName, 'harvestrunservice.pruneHistoryJob');
    assert.equal(job.backend, 'mongodb');
    assert.equal(job.options?.concurrency, 1);
    assert.equal(job.options?.lockLimit, 1);
    assert.equal(job.schedule?.intervalOrSchedule, '1 day');
    assert.equal(job.schedule?.opts?.skipImmediate, true);
  });
});
