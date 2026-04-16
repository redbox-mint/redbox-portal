import { expect } from 'chai';
import * as sinon from 'sinon';
import { trace } from '@opentelemetry/api';
import { Services } from '../../src/services/IntegrationAuditService';
import { IntegrationAuditAction, IntegrationAuditName } from '../../src/model/storage/IntegrationAuditModel';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

describe('IntegrationAuditService', function () {
  let service: InstanceType<typeof Services.IntegrationAuditService>;
  let mockStorageService: Record<string, sinon.SinonStub>;
  let mockQueueService: Record<string, sinon.SinonStub>;

  beforeEach(function () {
    mockStorageService = {
      createIntegrationAudit: sinon.stub().resolves({ success: true, isSuccessful: () => true }),
      getIntegrationAudit: sinon.stub().resolves([{ redboxOid: 'oid-1' }]),
      countIntegrationAudit: sinon.stub().resolves(7),
    };
    mockQueueService = {
      now: sinon.stub(),
    };

    const mockSails = createMockSails({
      config: {
        storage: { serviceName: 'mongostorageservice' },
        environment: 'development',
      },
      services: {
        mongostorageservice: mockStorageService,
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    });

    setupServiceTestGlobals(mockSails);
    (global as any).AgendaQueueService = mockQueueService;
    service = new Services.IntegrationAuditService();
    service.getStorageService();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).AgendaQueueService;
    sinon.restore();
  });

  it('queues a started audit using the active span context when present', function () {
    sinon.stub(trace, 'getActiveSpan').returns({
      spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
    } as any);

    const ctx = service.startAudit('oid-1', IntegrationAuditAction.syncRecordWithFigshare, {
      brandId: 'brand-1',
      triggeredBy: 'manual',
      requestSummary: { authorization: 'Bearer secret', triggerSource: 'manual' },
    });

    expect(ctx.traceId).to.equal('a'.repeat(32));
    expect(ctx.spanId).to.equal('b'.repeat(16));
    expect(ctx.parentSpanId).to.equal(undefined);
    expect(mockQueueService.now.calledOnce).to.be.true;
    expect(mockQueueService.now.firstCall.args[0]).to.equal('IntegrationAuditService-StoreIntegrationAudit');
    expect(mockQueueService.now.firstCall.args[1].requestSummary.authorization).to.equal('REDACTED');
  });

  it('preserves safe audit summary values such as oids and titles', function () {
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    service.startAudit('dc6e5dfa39304d6fad666cb3ce484caf', IntegrationAuditAction.publishDoi, {
      integrationName: IntegrationAuditName.doi,
      requestSummary: {
        oid: 'dc6e5dfa39304d6fad666cb3ce484caf',
        title: 'datacite-validation-error',
        authorization: 'Bearer secret-token',
      },
    });

    const payload = mockQueueService.now.firstCall.args[1];
    expect(payload.requestSummary.oid).to.equal('dc6e5dfa39304d6fad666cb3ce484caf');
    expect(payload.requestSummary.title).to.equal('datacite-validation-error');
    expect(payload.requestSummary.authorization).to.equal('REDACTED');
  });

  it('records DOI integration metadata when requested', function () {
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    const ctx = service.startAudit('oid-1', IntegrationAuditAction.publishDoi, {
      integrationName: IntegrationAuditName.doi,
      requestSummary: { profile: 'dataPublication' },
    });

    expect(ctx.integrationName).to.equal(IntegrationAuditName.doi);
    expect(mockQueueService.now.firstCall.args[1].integrationName).to.equal(IntegrationAuditName.doi);
    expect(mockQueueService.now.firstCall.args[1].integrationAction).to.equal(IntegrationAuditAction.publishDoi);
  });

  it('generates fallback trace ids when there is no active span', function () {
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    const ctx = service.startAudit('oid-1', IntegrationAuditAction.syncRecordWithFigshare);

    expect(ctx.traceId).to.match(/^[a-f0-9]{32}$/);
    expect(ctx.spanId).to.match(/^[a-f0-9]{16}$/);
  });

  it('allows child audits to join an existing trace with a parent span', function () {
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    const ctx = service.startAudit('oid-1', IntegrationAuditAction.publishDoi, {
      integrationName: IntegrationAuditName.doi,
      traceId: 'a'.repeat(32),
      parentSpanId: 'b'.repeat(16),
    });

    expect(ctx.traceId).to.equal('a'.repeat(32));
    expect(ctx.parentSpanId).to.equal('b'.repeat(16));
    expect(ctx.spanId).to.match(/^[a-f0-9]{16}$/);
    expect(ctx.spanId).to.not.equal('b'.repeat(16));
  });

  it('persists directly in integrationtest and sanitizes failure details', function () {
    (global as any).sails.config.environment = 'integrationtest';
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    const ctx = service.startAudit('oid-1', IntegrationAuditAction.publishAfterUploadFilesJob, {
      requestSummary: { token: 'secret-token' },
    });
    service.failAudit(ctx, new Error('publish failed'), {
      responseSummary: { authorization: 'Bearer abc.def.ghi' },
    });

    expect(mockQueueService.now.called).to.be.false;
    expect(mockStorageService.createIntegrationAudit.calledTwice).to.be.true;
    const failurePayload = mockStorageService.createIntegrationAudit.secondCall.args[0];
    expect(failurePayload.status).to.equal('failed');
    expect(failurePayload.errorDetail).to.contain('publish failed');
    expect(failurePayload.responseSummary.authorization).to.equal('REDACTED');
  });

  it('keeps safe nested responseSummary fields while redacting actual credentials', function () {
    (global as any).sails.config.environment = 'integrationtest';
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    const ctx = service.startAudit('dc6e5dfa39304d6fad666cb3ce484caf', IntegrationAuditAction.publishDoi, {
      integrationName: IntegrationAuditName.doi,
    });
    service.failAudit(ctx, new Error('publish failed'), {
      responseSummary: {
        displayErrors: [
          {
            code: 'title-required',
            title: 'datacite-validation-error',
            meta: {
              oid: 'dc6e5dfa39304d6fad666cb3ce484caf',
              authorization: 'Bearer abc.def.ghi',
            },
          },
        ],
      },
    });

    const failurePayload = mockStorageService.createIntegrationAudit.secondCall.args[0];
    const displayError = failurePayload.responseSummary.displayErrors[0];
    expect(displayError.title).to.equal('datacite-validation-error');
    expect(displayError.meta.oid).to.equal('dc6e5dfa39304d6fad666cb3ce484caf');
    expect(displayError.meta.authorization).to.equal('REDACTED');
  });

  it('merges extra requestSummary details into the final audit row', function () {
    (global as any).sails.config.environment = 'integrationtest';
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    const ctx = service.startAudit('oid-1', IntegrationAuditAction.publishDoi, {
      integrationName: IntegrationAuditName.doi,
      requestSummary: {
        event: 'draft',
        forceRun: true,
      },
    });
    service.completeAudit(ctx, {
      message: 'DOI published successfully.',
      requestSummary: {
        requestBody: {
          data: {
            type: 'dois',
            attributes: {
              titles: [{ title: 'Visible title' }],
            },
          },
        },
        authorization: 'Bearer secret-token',
      },
      responseSummary: {
        doi: '10.1234/5678',
      },
    });

    const completionPayload = mockStorageService.createIntegrationAudit.secondCall.args[0];
    expect(completionPayload.requestSummary.event).to.equal('draft');
    expect(completionPayload.requestSummary.forceRun).to.equal(true);
    expect(completionPayload.requestSummary.requestBody.data.attributes.titles[0].title).to.equal('Visible title');
    expect(completionPayload.requestSummary.authorization).to.equal('REDACTED');
  });

  it('swallows persistence failures in storeIntegrationAudit', async function () {
    mockStorageService.createIntegrationAudit.rejects(new Error('storage exploded'));

    service.storeIntegrationAudit({
      attrs: {
        data: {
          redboxOid: 'oid-1',
          integrationName: 'figshare',
          integrationAction: 'syncRecordWithFigshare',
          status: 'started',
          traceId: 'trace-1',
          spanId: 'span-1',
          startedAt: '2025-01-01T00:00:00.000Z',
        },
      },
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect((global as any).sails.log.error.called).to.be.true;
  });

  it('swallows invalid queued payloads in storeIntegrationAudit', function () {
    service.storeIntegrationAudit({
      attrs: {
        data: {
          redboxOid: 'oid-1',
        },
      },
    });

    expect(mockStorageService.createIntegrationAudit.called).to.be.false;
    expect((global as any).sails.log.error.called).to.be.true;
  });

  it('normalizes null optional fields before persisting queued payloads', async function () {
    service.storeIntegrationAudit({
      attrs: {
        data: {
          redboxOid: 'oid-1',
          brandId: 'brand-1',
          integrationName: 'doi',
          integrationAction: 'publishDoiTriggerSync',
          triggeredBy: 'publishDoiTriggerSync',
          message: null,
          errorDetail: null,
          httpStatusCode: null,
          parentSpanId: null,
          completedAt: null,
          durationMs: null,
          requestSummary: { event: 'draft' },
          responseSummary: null,
          status: 'started',
          traceId: 'dd400d83e198e46e940ec54acd8e430c',
          spanId: '44ea46d4a2d6bd14',
          startedAt: '2026-04-14T23:50:30.069Z',
        },
      },
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockStorageService.createIntegrationAudit.calledOnce).to.be.true;
    const payload = mockStorageService.createIntegrationAudit.firstCall.args[0];
    expect(payload.message).to.equal(undefined);
    expect(payload.errorDetail).to.equal(undefined);
    expect(payload.httpStatusCode).to.equal(undefined);
    expect(payload.parentSpanId).to.equal(undefined);
    expect(payload.completedAt).to.equal(undefined);
    expect(payload.durationMs).to.equal(undefined);
    expect(payload.responseSummary).to.equal(undefined);
  });

  it('logs the storage response message when persistence is rejected by storage', async function () {
    mockStorageService.createIntegrationAudit.resolves({
      success: false,
      message: 'Invalid new record.',
      details: 'message cannot be null',
      isSuccessful: () => false,
    });

    (global as any).sails.config.environment = 'integrationtest';
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    service.startAudit('oid-1', IntegrationAuditAction.publishDoiTriggerSync, {
      integrationName: IntegrationAuditName.doi,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect((global as any).sails.log.error.calledWithMatch(sinon.match('Storage response message: Invalid new record.'))).to.be.true;
    expect((global as any).sails.log.error.calledWithMatch(sinon.match('Storage response details: "message cannot be null"'))).to.be.true;
  });

  it('delegates audit-log retrieval to storage', async function () {
    const result = await service.getAuditLog({ oid: 'oid-1', page: 1, pageSize: 10 } as any);

    expect(mockStorageService.getIntegrationAudit.calledOnce).to.be.true;
    expect(mockStorageService.countIntegrationAudit.calledOnce).to.be.true;
    expect(result).to.deep.equal({ rows: [{ redboxOid: 'oid-1' }], total: 7 });
  });

  it('groups audit rows into traces with one event per span in started order', async function () {
    mockStorageService.countIntegrationAudit.resolves(9);
    mockStorageService.getIntegrationAudit.resolves([
      {
        id: 'event-9',
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'publishDoi',
        triggeredBy: 'publishDoiTriggerSync',
        status: 'started',
        traceId: 'trace-d',
        spanId: 'span-d2',
        parentSpanId: 'span-d1',
        startedAt: '2026-03-03T00:00:05.000Z',
      },
      {
        id: 'event-8',
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'publishDoiTriggerSync',
        triggeredBy: 'publishDoiTriggerSync',
        status: 'started',
        traceId: 'trace-d',
        spanId: 'span-d1',
        startedAt: '2026-03-03T00:00:00.000Z',
      },
      {
        id: 'event-7',
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'publishDoi',
        triggeredBy: 'publishDoiTriggerSync',
        status: 'success',
        traceId: 'trace-d',
        spanId: 'span-d2',
        parentSpanId: 'span-d1',
        startedAt: '2026-03-03T00:00:05.000Z',
        completedAt: '2026-03-03T00:00:06.000Z',
        message: 'DOI published successfully.',
        responseSummary: { id: '10.1234/5678' },
      },
      {
        id: 'event-6',
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'publishDoiTriggerSync',
        triggeredBy: 'publishDoiTriggerSync',
        status: 'success',
        traceId: 'trace-d',
        spanId: 'span-d1',
        startedAt: '2026-03-03T00:00:00.000Z',
        completedAt: '2026-03-03T00:00:07.000Z',
        message: 'DOI trigger sync completed.',
      },
      {
        id: 'event-5',
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'publishAfterUploadFilesJob',
        triggeredBy: 'admin',
        status: 'started',
        traceId: 'trace-b',
        spanId: 'span-b1',
        startedAt: '2026-03-02T00:00:00.000Z',
      },
      {
        id: 'event-4',
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'publishAfterUploadFilesJob',
        triggeredBy: 'admin',
        status: 'failed',
        traceId: 'trace-a',
        spanId: 'span-a2',
        parentSpanId: 'span-a1',
        startedAt: '2026-03-01T00:00:02.000Z',
        completedAt: '2026-03-01T00:00:04.000Z',
      },
      {
        id: 'event-3',
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        triggeredBy: 'admin',
        status: 'success',
        traceId: 'trace-a',
        spanId: 'span-a1',
        startedAt: '2026-03-01T00:00:00.000Z',
        completedAt: '2026-03-01T00:00:01.000Z',
      },
      {
        id: 'event-2',
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'publishAfterUploadFilesJob',
        triggeredBy: 'admin',
        status: 'success',
        traceId: 'trace-c',
        spanId: 'span-c2',
        parentSpanId: 'missing-parent',
        startedAt: '2026-02-28T00:00:03.000Z',
        completedAt: '2026-02-28T00:00:05.000Z',
      },
      {
        id: 'event-1',
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        triggeredBy: 'admin',
        status: 'success',
        traceId: 'trace-c',
        spanId: 'span-c1',
        startedAt: '2026-02-28T00:00:01.000Z',
        completedAt: '2026-02-28T00:00:02.000Z',
      },
    ]);

    const result = await service.getTraceAuditLog({ oid: 'oid-1', page: 1, pageSize: 10 } as any);

    expect(mockStorageService.countIntegrationAudit.calledOnce).to.be.true;
    expect(mockStorageService.getIntegrationAudit.calledOnce).to.be.true;
    expect(result.total).to.equal(4);
    expect(result.rows.map(row => row.traceId)).to.deep.equal(['trace-d', 'trace-b', 'trace-a', 'trace-c']);
    expect(result.rows[0].status).to.equal('success');
    expect(result.rows[0].actions).to.deep.equal(['publishDoiTriggerSync', 'publishDoi']);
    expect(result.rows[0].events.map(event => event.spanId)).to.deep.equal(['span-d1', 'span-d2']);
    expect(result.rows[0].events[0].message).to.equal('DOI trigger sync completed.');
    expect(result.rows[0].events[0].status).to.equal('success');
    expect(result.rows[0].events[1].message).to.equal('DOI published successfully.');
    expect(result.rows[0].events[1].status).to.equal('success');
    expect(result.rows[0].events[1].responseSummary).to.deep.equal({ id: '10.1234/5678' });
    expect(result.rows[1].status).to.equal('started');
    expect(result.rows[2].status).to.equal('failed');
    expect(result.rows[2].actions).to.deep.equal(['syncRecordWithFigshare', 'publishAfterUploadFilesJob']);
    expect(result.rows[2].events.map(event => event.spanId)).to.deep.equal(['span-a1', 'span-a2']);
    expect(result.rows[3].events.map(event => event.spanId)).to.deep.equal(['span-c1', 'span-c2']);
    expect(result.rows[3].events[1].depth).to.equal(0);
  });

  it('filters and paginates traces by derived status', async function () {
    mockStorageService.countIntegrationAudit.resolves(4);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationAction: 'syncRecordWithFigshare',
        status: 'failed',
        traceId: 'trace-2',
        spanId: 'span-2',
        startedAt: '2026-03-02T00:00:00.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        traceId: 'trace-3',
        spanId: 'span-3',
        startedAt: '2026-03-03T00:00:00.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationAction: 'syncRecordWithFigshare',
        status: 'failed',
        traceId: 'trace-4',
        spanId: 'span-4',
        startedAt: '2026-03-04T00:00:00.000Z',
      },
    ]);

    const result = await service.getTraceAuditLog({ oid: 'oid-1', status: 'failed', page: 2, pageSize: 1 } as any);

    expect(result.total).to.equal(2);
    expect(result.rows).to.have.length(1);
    expect(result.rows[0].traceId).to.equal('trace-2');
  });
});
