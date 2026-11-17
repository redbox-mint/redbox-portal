import assert from 'node:assert/strict';
import { GraphQLError } from 'graphql';
import {
  MongoRecordCollectionProvider,
  compileCollectionPipeline,
  type CollectionMongoSource,
} from '../../../src/record-graphql/mongo';
import { GRID_LIMITS, type GridStorageRequest } from '../../../src/record-graphql/grid-types';
import { gridCaller, gridContracts } from '../../fixtures/record-grid.fixtures';

const request = (): GridStorageRequest => ({
  caller: gridCaller,
  contracts: gridContracts(),
  query: { recordType: 'grid-fixture' },
  deadline: Date.now() + 5000,
});
const code = (expected: string) => (error: unknown) =>
  error instanceof GraphQLError && error.extensions.code === expected;
describe('Bounded Mongo collection capability', () => {
  it('uses the request deadline, simple collation and no disk spill', async () => {
    let calls = 0;
    const source: CollectionMongoSource = {
      aggregate(pipeline, options) {
        calls++;
        assert.ok(options.maxTimeMS > 0 && options.maxTimeMS <= 250);
        assert.equal(options.allowDiskUse, false);
        assert.deepEqual(options.collation, { locale: 'simple' });
        assert.deepEqual(
          pipeline.find(stage => '$limit' in stage),
          { $limit: GRID_LIMITS.batchSize }
        );
        assert.ok(!pipeline.some(stage => '$out' in stage || '$merge' in stage || '$count' in stage));
        return { toArray: async () => [] };
      },
    };
    const input = { ...request(), deadline: Date.now() + 250 };
    assert.deepEqual(await new MongoRecordCollectionProvider(source).executeRecordCollection(input), {
      candidates: [],
      exhausted: true,
    });
    await assert.rejects(
      () => new MongoRecordCollectionProvider(source).executeRecordCollection({ ...input, deadline: 0 }),
      code('QUERY_TIMEOUT')
    );
    assert.equal(calls, 1);
  });
  it('revalidates direct storage calls against readable contract paths and sort types', () => {
    const input = request();
    for (const field of ['metadata:/secret', 'metadata:/undeclared', 'metadata:/people', '$where'])
      assert.throws(() =>
        compileCollectionPipeline({ ...input, query: { ...input.query, filters: [{ field, exists: true }] } })
      );
    assert.throws(() => compileCollectionPipeline({ ...input, after: { keys: [3] } }), code('INVALID_CURSOR'));
    assert.throws(
      () => compileCollectionPipeline({ ...input, caller: { ...gridCaller, portal: 'foreign' } }),
      code('INVALID_SCOPE')
    );
  });
  it('rejects oversized result pages and sort keys rather than truncating their meaning', async () => {
    for (const rows of [
      Array.from({ length: 51 }, () => ({ oid: 'a', keys: ['a'] })),
      [{ oid: 'a', keys: ['x'.repeat(GRID_LIMITS.storageBytes)] }],
      [{ oid: 'a', keys: [null], overflow: true }],
    ]) {
      const provider = new MongoRecordCollectionProvider({ aggregate: () => ({ toArray: async () => rows }) });
      await assert.rejects(() => provider.executeRecordCollection(request()), code('COLLECTION_LIMIT'));
    }
  });
});
