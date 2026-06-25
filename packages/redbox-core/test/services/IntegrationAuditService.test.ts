import * as sinon from 'sinon';
import { trace } from '@opentelemetry/api';
import { Services } from '../../src/services/IntegrationAuditService';
import { IntegrationAuditAction, IntegrationAuditName } from '../../src/model/storage/IntegrationAuditModel';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

let expect!: Chai.ExpectStatic;

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
    mockStorageService.countIntegrationAudit.resolves(11);
    mockStorageService.getIntegrationAudit.resolves([
      {
        id: 'event-11',
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'createDoiRequest',
        triggeredBy: 'publishDoiTriggerSync',
        status: 'started',
        traceId: 'trace-d',
        spanId: 'span-d3',
        parentSpanId: 'span-d2',
        startedAt: '2026-03-03T00:00:05.500Z',
      },
      {
        id: 'event-10',
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'createDoiRequest',
        triggeredBy: 'publishDoiTriggerSync',
        status: 'success',
        traceId: 'trace-d',
        spanId: 'span-d3',
        parentSpanId: 'span-d2',
        startedAt: '2026-03-03T00:00:05.500Z',
        completedAt: '2026-03-03T00:00:05.900Z',
        message: 'DataCite create DOI request completed.',
        responseSummary: { data: { id: '10.1234/5678' } },
      },
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
    expect(result.rows[0].actions).to.deep.equal(['publishDoiTriggerSync', 'publishDoi', 'createDoiRequest']);
    expect(result.rows[0].events.map(event => event.spanId)).to.deep.equal(['span-d1', 'span-d2', 'span-d3']);
    expect(result.rows[0].events[0].message).to.equal('DOI trigger sync completed.');
    expect(result.rows[0].events[0].status).to.equal('success');
    expect(result.rows[0].events[1].message).to.equal('DOI published successfully.');
    expect(result.rows[0].events[1].status).to.equal('success');
    expect(result.rows[0].events[1].responseSummary).to.deep.equal({ id: '10.1234/5678' });
    expect(result.rows[0].events[2].message).to.equal('DataCite create DOI request completed.');
    expect(result.rows[0].events[2].status).to.equal('success');
    expect(result.rows[0].events[2].depth).to.equal(2);
    expect(result.rows[0].events[2].responseSummary).to.deep.equal({ data: { id: '10.1234/5678' } });
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

  it('getStatusSummary filters by integrationName (single)', async function () {
    mockStorageService.countIntegrationAudit.resolves(4);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'publishDoi',
        status: 'success',
        traceId: 'trace-2',
        spanId: 'span-2',
        startedAt: '2026-03-02T00:00:00.000Z',
      },
    ]);

    const result = await service.getStatusSummary({ oid: 'oid-1', integrationName: 'doi' } as any);

    expect(result).to.have.length(1);
    expect(result[0].integrationName).to.equal('doi');
  });

  it('getStatusSummary filters by integrationName (CSV multiple)', async function () {
    mockStorageService.countIntegrationAudit.resolves(4);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'publishDoi',
        status: 'success',
        traceId: 'trace-2',
        spanId: 'span-2',
        startedAt: '2026-03-02T00:00:00.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'publishAfterUploadFilesJob',
        status: 'success',
        traceId: 'trace-3',
        spanId: 'span-3',
        startedAt: '2026-03-03T00:00:00.000Z',
      },
    ]);

    const result = await service.getStatusSummary({ oid: 'oid-1', integrationName: 'figshare,doi' } as any);

    expect(result).to.have.length(2);
    expect(result.map(r => r.integrationName).sort()).to.deep.equal(['doi', 'figshare']);
  });

  it('getStatusSummary returns empty for non-matching integrationName', async function () {
    mockStorageService.countIntegrationAudit.resolves(4);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);

    const result = await service.getStatusSummary({ oid: 'oid-1', integrationName: 'nonexistent' } as any);

    expect(result).to.have.length(0);
  });

  it('does not merge trace-less rows that share the same timestamp', async function () {
    mockStorageService.countIntegrationAudit.resolves(2);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'failed',
        startedAt: '2026-03-01T00:00:00.000Z',
        completedAt: '2026-03-01T00:00:01.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        startedAt: '2026-03-01T00:00:00.000Z',
        completedAt: '2026-03-01T00:00:02.000Z',
      },
    ]);

    const result = await service.getTraceAuditLog({ oid: 'oid-1' } as any);

    expect(result.total).to.equal(2);
    expect(result.rows).to.have.length(2);
    expect(result.rows.map(row => row.status).sort()).to.deep.equal(['failed', 'success']);
  });

  it('extractKeyResult reads doi from responseSummary.data.id (DataCite JSON:API mint shape)', async function () {
    mockStorageService.countIntegrationAudit.resolves(2);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'publishDoi',
        status: 'success',
        traceId: 'trace-doi',
        spanId: 'span-1',
        startedAt: '2026-03-01T00:00:00.000Z',
        completedAt: '2026-03-01T00:00:01.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'createDoiRequest',
        status: 'success',
        traceId: 'trace-doi',
        spanId: 'span-2',
        startedAt: '2026-03-01T00:00:00.000Z',
        completedAt: '2026-03-01T00:00:02.000Z',
        responseSummary: { data: { id: '10.1234/mint-test' } },
      },
    ]);

    const statusResult = await service.getStatusSummary({ oid: 'oid-1' } as any);
    expect(statusResult).to.have.length(1);
    expect(statusResult[0].keyResult?.doi).to.equal('10.1234/mint-test');
  });

  it('extractKeyResult reads articleId from responseSummary (figshare shape)', async function () {
    mockStorageService.countIntegrationAudit.resolves(1);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        traceId: 'trace-fig',
        spanId: 'span-1',
        startedAt: '2026-03-01T00:00:00.000Z',
        completedAt: '2026-03-01T00:00:01.000Z',
        responseSummary: { articleId: '98765', phases: ['metadata sync'] },
      },
    ]);

    const statusResult = await service.getStatusSummary({ oid: 'oid-1' } as any);
    expect(statusResult).to.have.length(1);
    expect(statusResult[0].keyResult?.articleId).to.equal('98765');
  });

  it('applies a registered custom outcome mapper for an unknown integration name', async function () {
    service.registerOutcomeMapper('rda', (summary) => {
      if (summary.status === 'failed') {
        return { state: 'error', severity: 'error', labelKey: '@integration-status-outcome-rda-error' };
      }
      if (summary.status === 'success') {
        return { state: 'published', severity: 'success', labelKey: '@integration-status-outcome-rda-published' };
      }
      return { state: 'none', severity: 'none', labelKey: '@integration-status-outcome-rda-none' };
    });

    mockStorageService.countIntegrationAudit.resolves(2);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationName: 'rda',
        integrationAction: 'produceMetadataFiles',
        status: 'success',
        traceId: 'trace-rda',
        spanId: 'span-rda-1',
        startedAt: '2026-03-01T00:00:00.000Z',
        completedAt: '2026-03-01T00:00:03.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationName: 'rda',
        integrationAction: 'produceRIFCS',
        status: 'success',
        traceId: 'trace-rda',
        spanId: 'span-rda-2',
        parentSpanId: 'span-rda-1',
        startedAt: '2026-03-01T00:00:01.000Z',
        completedAt: '2026-03-01T00:00:02.000Z',
      },
    ]);

    const result = await service.getStatusSummaryWithOutcomes({ oid: 'oid-1', integrationName: 'rda' } as any, {} as any);

    expect(result).to.have.length(1);
    expect(result[0].integrationName).to.equal('rda');
    expect(result[0].outcome?.state).to.equal('published');
    expect(result[0].outcome?.severity).to.equal('success');
  });

  it('synthesizes a none tile for a registered integration name with no audit rows', async function () {
    service.registerOutcomeMapper('rda', (summary) => {
      if (summary.status === 'none') {
        return { state: 'none', severity: 'none', labelKey: '@integration-status-outcome-rda-none' };
      }
      return undefined;
    });

    mockStorageService.countIntegrationAudit.resolves(0);
    mockStorageService.getIntegrationAudit.resolves([]);

    const result = await service.getStatusSummaryWithOutcomes({ oid: 'oid-1', integrationName: 'rda' } as any, {} as any);

    expect(result).to.have.length(1);
    expect(result[0].integrationName).to.equal('rda');
    expect(result[0].synthesized).to.equal(true);
    expect(result[0].outcome?.state).to.equal('none');
  });

  it('does not synthesize a tile for an unregistered integration name', async function () {
    mockStorageService.countIntegrationAudit.resolves(0);
    mockStorageService.getIntegrationAudit.resolves([]);

    const result = await service.getStatusSummaryWithOutcomes({ oid: 'oid-1', integrationName: 'unregistered' } as any, {} as any);

    expect(result).to.have.length(0);
  });

  it('filters traces by integration name before pagination', async function () {
    mockStorageService.countIntegrationAudit.resolves(4);
    mockStorageService.getIntegrationAudit.resolves([
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        traceId: 'trace-1',
        spanId: 'span-1',
        startedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationName: 'doi',
        integrationAction: 'publishDoi',
        status: 'success',
        traceId: 'trace-2',
        spanId: 'span-2',
        startedAt: '2026-03-02T00:00:00.000Z',
      },
      {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'publishAfterUploadFilesJob',
        status: 'success',
        traceId: 'trace-3',
        spanId: 'span-3',
        startedAt: '2026-03-03T00:00:00.000Z',
      },
    ]);

    const result = await service.getTraceAuditLog({ oid: 'oid-1', integrationName: 'fig', page: 1, pageSize: 10 } as any);

    expect(result.total).to.equal(2);
    expect(result.rows.map(row => row.traceId)).to.deep.equal(['trace-3', 'trace-1']);
  });

  describe('persistEntry - notification enqueue', function () {
    let mockStorageService: Record<string, sinon.SinonStub>;
    let mockQueueService: Record<string, sinon.SinonStub>;

    beforeEach(function () {
      mockStorageService = {
        createIntegrationAudit: sinon.stub().resolves({ success: true, isSuccessful: () => true }),
        getIntegrationAudit: sinon.stub().resolves([]),
        countIntegrationAudit: sinon.stub().resolves(0),
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

    it('enqueues IntegrationNotificationService-Dispatch for failed status', async function () {
      const auditData = {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'failed',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        startedAt: new Date().toISOString(),
      };
      service.storeIntegrationAudit({ attrs: { data: auditData } });
      await new Promise(resolve => setImmediate(resolve));

      expect(mockQueueService.now.calledOnce).to.be.true;
      expect(mockQueueService.now.firstCall.args[0]).to.equal('IntegrationNotificationService-Dispatch');
    });

    it('enqueues IntegrationNotificationService-Dispatch for success status', async function () {
      const auditData = {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'success',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        startedAt: new Date().toISOString(),
      };
      service.storeIntegrationAudit({ attrs: { data: auditData } });
      await new Promise(resolve => setImmediate(resolve));

      expect(mockQueueService.now.calledOnce).to.be.true;
      expect(mockQueueService.now.firstCall.args[0]).to.equal('IntegrationNotificationService-Dispatch');
    });

    it('does not enqueue notification for started status', async function () {
      const auditData = {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'started',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        startedAt: new Date().toISOString(),
      };
      service.storeIntegrationAudit({ attrs: { data: auditData } });
      await new Promise(resolve => setImmediate(resolve));

      expect(mockQueueService.now.called).to.be.false;
    });

    it('does not break persistEntry when enqueue throws', async function () {
      mockQueueService.now.throws(new Error('Queue unavailable'));

      const auditData = {
        redboxOid: 'oid-1',
        integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare',
        status: 'failed',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        startedAt: new Date().toISOString(),
      };
      service.storeIntegrationAudit({ attrs: { data: auditData } });
      await new Promise(resolve => setImmediate(resolve));

      expect(mockStorageService.createIntegrationAudit.called).to.be.true;
      expect((global as any).sails.log.error.called).to.be.true;
    });

    it('does not leak an unhandled rejection when enqueue rejects asynchronously', async function () {
      // AgendaQueueService.now is async; an unknown job rejects the returned promise.
      // The audit service must handle that rejection rather than let it escape and crash.
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);
      try {
        mockQueueService.now.rejects(new Error(`Unknown job 'IntegrationNotificationService-Dispatch'`));

        const auditData = {
          redboxOid: 'oid-1',
          integrationName: 'figshare',
          integrationAction: 'syncRecordWithFigshare',
          status: 'failed',
          traceId: 'a'.repeat(32),
          spanId: 'b'.repeat(16),
          startedAt: new Date().toISOString(),
        };
        service.storeIntegrationAudit({ attrs: { data: auditData } });
        // Allow the rejected enqueue promise and its handler to settle.
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));

        expect(mockStorageService.createIntegrationAudit.called).to.be.true;
        expect((global as any).sails.log.error.called).to.be.true;
        expect(unhandled).to.have.length(0);
      } finally {
        process.removeListener('unhandledRejection', onUnhandled);
      }
    });
  });
});
  before(async function () {
    ({ expect } = await import('chai'));
  });
