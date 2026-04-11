import { expect } from 'chai';
import * as sinon from 'sinon';
import { trace } from '@opentelemetry/api';
import { Services } from '../../src/services/IntegrationAuditService';
import { IntegrationAuditAction } from '../../src/model/storage/IntegrationAuditModel';
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

  it('generates fallback trace ids when there is no active span', function () {
    sinon.stub(trace, 'getActiveSpan').returns(undefined);

    const ctx = service.startAudit('oid-1', IntegrationAuditAction.syncRecordWithFigshare);

    expect(ctx.traceId).to.match(/^[a-f0-9]{32}$/);
    expect(ctx.spanId).to.match(/^[a-f0-9]{16}$/);
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

  it('delegates audit-log retrieval to storage', async function () {
    const result = await service.getAuditLog({ oid: 'oid-1', page: 1, pageSize: 10 } as any);

    expect(mockStorageService.getIntegrationAudit.calledOnce).to.be.true;
    expect(mockStorageService.countIntegrationAudit.calledOnce).to.be.true;
    expect(result).to.deep.equal({ rows: [{ redboxOid: 'oid-1' }], total: 7 });
  });
});
