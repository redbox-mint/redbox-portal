import assert from 'node:assert/strict';
import { GraphQLError } from 'graphql';
import sinon from 'sinon';
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
        assert.equal(options.timeoutMS, options.maxTimeMS);
        assert.equal(options.timeoutMode, 'cursorLifetime');
        assert.equal(options.signal.aborted, false);
        assert.equal(options.allowDiskUse, false);
        assert.deepEqual(options.collation, { locale: 'simple' });
        assert.deepEqual(
          pipeline.find(stage => '$limit' in stage),
          { $limit: GRID_LIMITS.batchSize }
        );
        assert.ok(!pipeline.some(stage => '$out' in stage || '$merge' in stage || '$count' in stage));
        return { toArray: async () => [], close: async () => {} };
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
      const provider = new MongoRecordCollectionProvider({
        aggregate: () => ({ toArray: async () => rows, close: async () => {} }),
      });
      await assert.rejects(() => provider.executeRecordCollection(request()), code('COLLECTION_LIMIT'));
    }
  });
  it('aborts a never-resolving operation on deadline and bounds a stalled close', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let signal: AbortSignal;
      const close = sinon.stub().returns(new Promise<void>(() => {}));
      const provider = new MongoRecordCollectionProvider({
        aggregate: (_pipeline, options) => {
          signal = options.signal;
          return { toArray: () => new Promise(() => {}), close };
        },
      });
      const result = assert.rejects(
        () => provider.executeRecordCollection({ ...request(), deadline: Date.now() + 30 }),
        code('QUERY_TIMEOUT')
      );
      await clock.tickAsync(29);
      assert.equal(close.callCount, 0);
      await clock.tickAsync(1);
      await result;
      assert.equal(signal!.aborted, true);
      assert.equal(close.callCount, 1);
      assert.equal(clock.countTimers(), 0);
    } finally {
      clock.restore();
    }
  });
  it('cleans up late success/failure without unhandled rejections or timers', async () => {
    const clock = sinon.useFakeTimers();
    try {
      for (const lateFailure of [false, true]) {
        let resolve: (rows: object[]) => void;
        let reject: (error: Error) => void;
        const operation = new Promise<object[]>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        const close = sinon.stub().rejects(new Error('cleanup failed'));
        const provider = new MongoRecordCollectionProvider({ aggregate: () => ({ toArray: () => operation, close }) });
        const result = assert.rejects(
          () => provider.executeRecordCollection({ ...request(), deadline: Date.now() + 20 }),
          code('QUERY_TIMEOUT')
        );
        await clock.tickAsync(20);
        await result;
        assert.equal(close.callCount, 1);
        if (lateFailure) reject!(new Error('late failure'));
        else resolve!([]);
        await clock.tickAsync(0);
        assert.equal(close.callCount, 2);
        assert.equal(clock.countTimers(), 0);
      }
    } finally {
      clock.restore();
    }
  });
  it('maps driver timeouts across versions and clears timers on success and errors', async () => {
    const clock = sinon.useFakeTimers();
    try {
      const failure = new Error('ordinary failure');
      for (const error of [
        undefined,
        failure,
        Object.assign(new Error('client timeout'), { name: 'MongoOperationTimeoutError' }),
        Object.assign(new Error('server timeout'), { code: 50 }),
      ]) {
        let signal: AbortSignal;
        const close = sinon.stub().resolves();
        const provider = new MongoRecordCollectionProvider({
          aggregate: (_pipeline, options) => {
            signal = options.signal;
            return {
              toArray: async () => {
                if (error) throw error;
                return [];
              },
              close,
            };
          },
        });
        if (error)
          await assert.rejects(
            () => provider.executeRecordCollection(request()),
            error === failure ? candidate => candidate === error : code('QUERY_TIMEOUT')
          );
        else assert.deepEqual(await provider.executeRecordCollection(request()), { candidates: [], exhausted: true });
        assert.equal(close.callCount, 1);
        assert.equal(clock.countTimers(), 0);
        await clock.tickAsync(10_000);
        assert.equal(signal!.aborted, false);
      }
      const provider = new MongoRecordCollectionProvider({
        aggregate: () => {
          throw failure;
        },
      });
      await assert.rejects(
        () => provider.executeRecordCollection(request()),
        error => error === failure
      );
      assert.equal(clock.countTimers(), 0);
    } finally {
      clock.restore();
    }
  });
});
