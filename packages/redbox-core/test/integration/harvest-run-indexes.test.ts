import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { ensureHarvestRunIndexes } from '../../src/utilities/HarvestRunIndexes';

const mongoUrl = process.env.HARVEST_MONGO_TEST_URL;

(mongoUrl ? describe : describe.skip)('Harvest indexes against MongoDB', function () {
  this.timeout(15000);
  let client: MongoClient;
  let db: Db;

  before(async () => {
    client = new MongoClient(mongoUrl!);
    await client.connect();
  });
  beforeEach(() => {
    db = client.db(`harvest-index-test-${randomUUID()}`);
  });
  afterEach(async () => {
    await db.dropDatabase();
  });
  after(async () => {
    await client?.close();
  });

  it('creates required indexes idempotently, including both uniqueness constraints', async () => {
    await ensureHarvestRunIndexes(db);
    await ensureHarvestRunIndexes(db);
    await db
      .collection('harvestrun')
      .insertOne({ brandId: 'brand', recordType: 'party', sourceName: 'mint', sourceRunId: 'source-run' });
    await assert.rejects(
      () =>
        db
          .collection('harvestrun')
          .insertOne({ brandId: 'brand', recordType: 'party', sourceName: 'mint', sourceRunId: 'source-run' }),
      /E11000/
    );
    await db.collection('harvestrunchunk').insertOne({ runId: 'run', contentHash: 'hash', attempt: 1 });
    await assert.rejects(
      () => db.collection('harvestrunchunk').insertOne({ runId: 'run', contentHash: 'hash', attempt: 1 }),
      /E11000/
    );
  });

  it('uses indexes for ordered event/chunk pages and counts without scanning documents for counts', async () => {
    await ensureHarvestRunIndexes(db);
    const events = Array.from({ length: 1000 }, (_, i) => ({
      runId: i < 500 ? 'run' : 'other-run',
      brandId: 'brand',
      createdAt: '2026-10-30T00:00:00Z',
      outcome: i % 2 ? 'failed' : 'created',
      harvestId: `source-${i % 5}`,
      chunkId: `chunk-${Math.floor(i / 100)}`,
    }));
    await db.collection('harvestrecordevent').insertMany(events);
    await db.collection('harvestrunchunk').insertMany(
      Array.from({ length: 200 }, (_, i) => ({
        runId: 'run',
        brandId: 'brand',
        contentHash: `hash-${i}`,
        attempt: 1,
        submittedAt: '2026-10-30T00:00:00Z',
      }))
    );
    for (const filter of [
      { runId: 'run', brandId: 'brand' },
      { runId: 'run', brandId: 'brand', outcome: 'failed' },
      { runId: 'run', brandId: 'brand', harvestId: 'source-1' },
      { runId: 'run', brandId: 'brand', chunkId: 'chunk-1' },
      { runId: 'run', brandId: 'brand', chunkId: 'chunk-1', outcome: 'failed' },
    ]) {
      const e = await db
        .collection('harvestrecordevent')
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(20)
        .explain('executionStats');
      assert.equal(e.executionStats.nReturned, 20);
      // A chunk+outcome query scans the selected chunk in index order and
      // filters outcomes; it never scans the rest of the run.
      if ('chunkId' in filter && 'outcome' in filter) {
        assert.ok(e.executionStats.totalDocsExamined <= 100);
      } else {
        assert.equal(e.executionStats.totalDocsExamined, 20);
      }
      assert.match(JSON.stringify(e.queryPlanner.winningPlan), /"stage":"IXSCAN"/);
      assert.doesNotMatch(JSON.stringify(e.queryPlanner.winningPlan), /"stage":"(?:SORT|COLLSCAN)"/);
    }
    const chunks = await db
      .collection('harvestrunchunk')
      .find({ runId: 'run', brandId: 'brand' })
      .sort({ submittedAt: 1, _id: 1 })
      .skip(20)
      .limit(20)
      .explain('executionStats');
    assert.equal(chunks.executionStats.nReturned, 20);
    assert.doesNotMatch(JSON.stringify(chunks.queryPlanner.winningPlan), /"stage":"(?:SORT|COLLSCAN)"/);
    const pipeline = [{ $match: { runId: 'run', brandId: 'brand' } }, { $count: 'total' }];
    const count = await db.collection('harvestrecordevent').aggregate(pipeline).explain('executionStats');
    const cursor = count.stages?.find(stage => stage.$cursor)?.$cursor ?? count;
    assert.equal(cursor.executionStats.totalDocsExamined, 0);
    assert.equal((await db.collection('harvestrecordevent').aggregate(pipeline).toArray())[0].total, 500);
  });

  it('fails on existing duplicate unique keys without deleting records', async () => {
    const runs = db.collection('harvestrun');
    const row = { brandId: 'brand', recordType: 'party', sourceName: 'mint', sourceRunId: 'source-run' };
    await runs.insertMany([{ ...row }, { ...row }]);
    await assert.rejects(() => ensureHarvestRunIndexes(db), /E11000/);
    assert.equal(await runs.countDocuments(), 2);
  });

  it('rejects a conflicting uniqueness definition without dropping the existing index', async () => {
    await db.collection('harvestrun').createIndex({ brandId: 1, recordType: 1, sourceName: 1, sourceRunId: 1 });
    await assert.rejects(() => ensureHarvestRunIndexes(db), /already exists|conflict/i);
    assert.equal((await db.collection('harvestrun').indexes()).length, 2);
  });
});
