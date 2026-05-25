let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';

import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

type QueryLike = {
  sort: sinon.SinonStub;
  skip: sinon.SinonStub;
  limit: sinon.SinonStub;
  meta: sinon.SinonStub;
  then: (onFulfilled: (value: unknown) => unknown) => Promise<unknown>;
};

function createChainableQuery(result: unknown): QueryLike {
  const query = {
    sort: sinon.stub().returnsThis(),
    skip: sinon.stub().returnsThis(),
    limit: sinon.stub().returnsThis(),
    meta: sinon.stub().returnsThis(),
    then(onFulfilled: (value: unknown) => unknown) {
      return Promise.resolve(onFulfilled(result));
    },
  } as QueryLike;
  return query;
}

describe('HarvestRunService', function () {
  let HarvestRunServiceClass: any;
  let service: any;
  let originalRecord: any;
  let originalHarvestRun: any;
  let originalHarvestRunChunk: any;
  let originalHarvestRecordEvent: any;
  let mockSails: any;
  let recordsService: {
    create: sinon.SinonStub;
    getMeta: sinon.SinonStub;
    updateMeta: sinon.SinonStub;
    delete: sinon.SinonStub;
    setWorkflowStepRelatedMetadata: sinon.SinonStub;
  };

  beforeEach(function () {
    originalRecord = (global as any).Record;
    originalHarvestRun = (global as any).HarvestRun;
    originalHarvestRunChunk = (global as any).HarvestRunChunk;
    originalHarvestRecordEvent = (global as any).HarvestRecordEvent;

    recordsService = {
      create: sinon.stub(),
      getMeta: sinon.stub(),
      updateMeta: sinon.stub(),
      delete: sinon.stub(),
      setWorkflowStepRelatedMetadata: sinon.stub(),
    };

    mockSails = createMockSails({
      services: {
        recordsservice: recordsService,
      },
    });
    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = recordsService;

    (global as any).HarvestRun = {
      findOne: sinon.stub(),
      create: sinon.stub(),
      updateOne: sinon.stub(),
      find: sinon.stub(),
      count: sinon.stub(),
    };
    (global as any).HarvestRunChunk = {
      findOne: sinon.stub(),
      create: sinon.stub(),
      updateOne: sinon.stub(),
      find: sinon.stub(),
      count: sinon.stub(),
    };
    (global as any).HarvestRecordEvent = {
      create: sinon.stub(),
      createEach: sinon.stub(),
      find: sinon.stub(),
      count: sinon.stub(),
    };
    (global as any).Record = {
      find: sinon.stub(),
    };
    (global as any).WorkflowStepsService = {
      get: sinon.stub(),
    };

    const module = require('../../src/services/HarvestRunService');
    HarvestRunServiceClass = module.Services.HarvestRunService;
    service = new HarvestRunServiceClass();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    (global as any).Record = originalRecord;
    (global as any).HarvestRun = originalHarvestRun;
    (global as any).HarvestRunChunk = originalHarvestRunChunk;
    (global as any).HarvestRecordEvent = originalHarvestRecordEvent;
    delete (global as any).WorkflowStepsService;
    sinon.restore();
  });

  it('creates a tracked harvest run, chunk, and events', async function () {
    (global as any).HarvestRun.findOne.resolves(null);
    (global as any).HarvestRun.create.returns({
      fetch: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([]));
    (global as any).HarvestRunChunk.create.returns({
      fetch: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        attempt: 1,
        status: 'processing',
        recordCount: 1,
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
      }),
    });
    (global as any).HarvestRunChunk.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        status: 'processed',
        recordCount: 1,
        totalProcessed: 1,
        created: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
        responseSummary: { totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0 },
      }),
    });
    (global as any).HarvestRun.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'completed',
        startedAt: '2026-05-25T00:00:00.000Z',
        completedAt: '2026-05-25T00:05:00.000Z',
        totalProcessed: 1,
        created: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 1,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRecordEvent.createEach.resolves([{ id: 'event-1' }]);
    (global as any).Record.find.callsFake(() => ({ meta: sinon.stub().resolves([]) }));
    recordsService.create.resolves({
      oid: 'record-1',
      message: 'Created',
      details: '',
      isSuccessful: () => true,
    });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        finalChunk: true,
        chunk: { index: 1, label: 'part-1' },
        records: [{ harvestId: 'harvest-1', operation: 'upsert', recordRequest: { metadata: { title: 'Test' } } }],
      },
      { username: 'tester' }
    );

    expect(recordsService.create.calledOnce).to.equal(true);
    expect((global as any).HarvestRecordEvent.createEach.calledOnce).to.equal(true);
    expect((global as any).Record.find.calledOnce).to.equal(true);
    expect(response.run.sourceRunId).to.equal('source-run-1');
    expect(response.chunk.status).to.equal('processed');
    expect(response.records).to.equal(undefined);
  });

  it('returns a duplicate chunk response without reprocessing records', async function () {
    (global as any).HarvestRun.findOne.resolves({
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'running',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 1,
      created: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 1,
      duplicateChunks: 0,
    });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([{
      id: 'chunk-1',
      runId: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceRunId: 'source-run-1',
      contentHash: 'hash-1',
      attempt: 1,
      status: 'processed',
      recordCount: 1,
      totalProcessed: 1,
      created: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      duplicate: false,
      submittedAt: '2026-05-25T00:00:00.000Z',
      responseSummary: { totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0 },
    }]));
    (global as any).HarvestRun.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 1,
        created: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 1,
        duplicateChunks: 1,
      }),
    });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [{ harvestId: 'harvest-1', recordRequest: { metadata: { title: 'Test' } } }],
      },
      { username: 'tester' }
    );

    expect(recordsService.create.called).to.equal(false);
    expect(response.chunk.duplicate).to.equal(true);
    expect(response.run.duplicateChunks).to.equal(1);
    expect(response.records).to.equal(undefined);
  });

  it('rejects tracked chunks over the configured record limit before processing', async function () {
    mockSails.config.harvestRuns = { maxRecordsPerChunk: 1, maxChunkBytes: 5_000_000 };

    try {
      await service.submitChunk(
        { id: 'brand-1', name: 'default' },
        { name: 'dataset' },
        {
          sourceRunId: 'source-run-1',
          sourceName: 'source-a',
          chunk: { index: 1 },
          records: [
            { harvestId: 'harvest-1', recordRequest: { metadata: { title: 'One' } } },
            { harvestId: 'harvest-2', recordRequest: { metadata: { title: 'Two' } } },
          ],
        },
        { username: 'tester' }
      );
      throw new Error('Expected submitChunk to reject oversized chunk');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).to.equal(413);
      expect((global as any).HarvestRun.findOne.called).to.equal(false);
    }
  });

  it('returns 409 for a fresh duplicate processing chunk', async function () {
    (global as any).HarvestRun.findOne.resolves({
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'running',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 0,
      duplicateChunks: 0,
    });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([{
      id: 'chunk-1',
      runId: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceRunId: 'source-run-1',
      contentHash: 'hash-1',
      attempt: 1,
      status: 'processing',
      recordCount: 1,
      duplicate: false,
      submittedAt: new Date().toISOString(),
    }]));

    try {
      await service.submitChunk(
        { id: 'brand-1', name: 'default' },
        { name: 'dataset' },
        {
          sourceRunId: 'source-run-1',
          sourceName: 'source-a',
          chunk: { index: 1 },
          records: [{ harvestId: 'harvest-1', recordRequest: { metadata: { title: 'Test' } } }],
        },
        { username: 'tester' }
      );
      throw new Error('Expected submitChunk to reject duplicate processing chunk');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).to.equal(409);
      expect((global as any).HarvestRunChunk.create.called).to.equal(false);
    }
  });

  it('soft deletes tracked records when delete is requested', async function () {
    (global as any).HarvestRun.findOne.resolves(null);
    (global as any).HarvestRun.create.returns({
      fetch: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([]));
    (global as any).HarvestRunChunk.create.returns({
      fetch: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        attempt: 1,
        status: 'processing',
        recordCount: 1,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
      }),
    });
    (global as any).HarvestRunChunk.updateOne.returns({ set: sinon.stub().resolves(null) });
    (global as any).HarvestRun.updateOne.returns({ set: sinon.stub().resolves(null) });
    (global as any).HarvestRecordEvent.createEach.resolves([{ id: 'event-1' }]);
    (global as any).Record.find.callsFake(() => ({
      meta: sinon.stub().resolves([
        { harvestId: 'harvest-1', redboxOid: 'record-1', metadata: { title: 'Existing' }, metaMetadata: { brandId: 'brand-1', type: 'dataset' } },
      ]),
    }));
    recordsService.delete.resolves({
      message: 'Deleted',
      details: '',
      isSuccessful: () => true,
    });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [{ harvestId: 'harvest-1', operation: 'delete' }],
      },
      { username: 'tester' }
    );

    expect(recordsService.delete.calledOnce).to.equal(true);
    expect(response.records).to.equal(undefined);
  });

  it('lists runs and events with brand-scoped filters', async function () {
    (global as any).HarvestRun.count.resolves(2);
    (global as any).HarvestRun.find.returns(createChainableQuery([
      {
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 1,
        created: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 1,
        duplicateChunks: 0,
      },
    ]));
    (global as any).HarvestRecordEvent.count.resolves(1);
    (global as any).HarvestRecordEvent.find.returns(createChainableQuery([
      {
        id: 'event-1',
        runId: 'run-1',
        chunkId: 'chunk-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        harvestId: 'harvest-1',
        oid: 'record-1',
        operation: 'upsert',
        outcome: 'created',
        status: true,
        message: 'Record created successfully',
        details: '',
        createdAt: '2026-05-25T00:01:00.000Z',
      },
    ]));

    const runs = await service.listRuns(
      { id: 'brand-1', name: 'default' },
      { brandId: 'brand-1', page: 1, pageSize: 20 }
    );
    const events = await service.listRunEvents(
      { id: 'brand-1', name: 'default' },
      'run-1',
      { runId: 'run-1', brandId: 'brand-1', page: 1, pageSize: 20 }
    );

    expect((global as any).HarvestRun.find.firstCall.args[0]).to.deep.equal({ brandId: 'brand-1' });
    expect((global as any).HarvestRecordEvent.find.firstCall.args[0]).to.deep.equal({ runId: 'run-1', brandId: 'brand-1' });
    expect(runs.total).to.equal(2);
    expect(runs.rows[0].sourceRunId).to.equal('source-run-1');
    expect(events.total).to.equal(1);
    expect(events.rows[0].harvestId).to.equal('harvest-1');
  });
});
