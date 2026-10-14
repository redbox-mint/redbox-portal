import { expect } from 'chai';
import * as sinon from 'sinon';
import type { SiemConfigDto } from '../../../packages/redbox-core/src/configmodels/SiemConfiguration';
import type { Services } from '../../../packages/redbox-core/src/services/SecurityEventService';

interface QueuedJob {
  name: string;
  data: { event?: Record<string, unknown>; brandId?: string };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('The SecurityEventService', function () {
  let securityEventService: Services.SecurityEventService;
  let brandId: string;
  const sandbox = sinon.createSandbox();
  let queue: sinon.SinonStub<Parameters<typeof AgendaQueueService.now>, ReturnType<typeof AgendaQueueService.now>>;
  const createdEventIds: string[] = [];
  let configuration: ReturnType<typeof AppConfigService.getAppConfigurationForBrand> & { siem: SiemConfigDto };

  function queuedJobs(): QueuedJob[] {
    return queue.getCalls().map(call => {
      const [name, data] = call.args;
      if (!isRecord(data)) throw new Error('Expected structured queue data');
      const event = data.event;
      if (event !== undefined && !isRecord(event)) throw new Error('Expected structured security event');
      return { name, data: { event, brandId: typeof data.brandId === 'string' ? data.brandId : undefined } };
    });
  }

  before(function () {
    securityEventService = SecurityEventService;
    brandId = BrandingService.getDefault().id;
  });

  beforeEach(function () {
    const original = AppConfigService.getAppConfigurationForBrand(BrandingService.getDefault().name);
    configuration = {
      ...original,
      siem: {
        enabled: true,
        destinations: [],
        events: {
          categories: {
            authentication: true,
            authorization: true,
            userManagement: true,
            recordLifecycle: true,
            integrationAudit: true,
            attachmentAccess: true,
          },
          severity: { 'integration.failure': 'error' },
        },
        redaction: {
          denylistedPaths: ['password', 'token', 'authorization', 'headers.Authorization'],
          maxPayloadBytes: 65536,
          includeActorEmail: false,
          includeIpAddress: false,
          includeUserAgent: false,
        },
        delivery: {
          batchSize: 50,
          maxAttempts: 3,
          retryDelayMs: 60000,
          retryBackoffMultiplier: 2,
          deadLetterRetentionDays: 30,
          nonBlocking: true,
        },
      },
    };
    sandbox.stub(AppConfigService, 'getAppConfigurationForBrand').returns(configuration);
    queue = sandbox.stub(AgendaQueueService, 'now').resolves();
  });

  afterEach(async function () {
    sandbox.restore();
    if (createdEventIds.length > 0) {
      await SecurityEvent.destroy({ eventId: createdEventIds.splice(0, createdEventIds.length) });
    }
  });

  it('queues, stores, redacts, queries and idempotently replays canonical security events', async function () {
    await securityEventService.emitSecurityEvent({
      brandId,
      eventType: 'integration.failure',
      category: 'integrationAudit',
      source: 'IntegrationAuditService',
      occurredAt: '2026-01-01T00:00:00.000Z',
      payload: { token: 'secret-token', safe: 'visible' },
      traceId: 'trace-1',
    });

    expect(queuedJobs()).to.have.length(1);
    expect(queuedJobs()[0].name).to.equal('SecurityEventService-StoreSecurityEvent');
    const event = queuedJobs()[0].data.event;
    if (!event || typeof event.eventId !== 'string') throw new Error('Expected queued security event');
    createdEventIds.push(event.eventId);
    expect(event.severity).to.equal('error');
    expect(event.payload).to.have.property('token', '[REDACTED]');

    await securityEventService.storeSecurityEvent({ attrs: { data: { event } } });
    expect(queuedJobs()[1].name).to.equal('SiemForwardingService-ForwardSecurityEvents');
    expect(queuedJobs()[1].data.brandId).to.equal(brandId);

    const stored = await SecurityEvent.findOne({ eventId: event.eventId });
    expect(stored).to.not.equal(undefined);
    expect(stored.deliveryState).to.equal('pending');
    expect(stored.payload).to.have.property('safe', 'visible');

    // A replay after persistence must not duplicate or reset delivery progress.
    await SecurityEvent.update({ eventId: event.eventId }).set({ deliveryState: 'delivered' });
    await securityEventService.storeSecurityEvent({ attrs: { data: { event } } });
    expect(await SecurityEvent.count({ eventId: event.eventId })).to.equal(1);
    expect((await SecurityEvent.findOne({ eventId: event.eventId })).deliveryState).to.equal('delivered');
    expect(queuedJobs()[2].name).to.equal('SiemForwardingService-ForwardSecurityEvents');

    const result = await securityEventService.queryEvents({
      brandId,
      category: 'integrationAudit',
      deliveryState: 'delivered',
      limit: 10,
    });
    expect(result.total).to.be.greaterThan(0);
    expect(result.rows.some(row => row.eventId === event.eventId)).to.equal(true);
  });

  it('skips queueing when the configured event category is disabled', async function () {
    configuration.siem.events.categories.integrationAudit = false;
    await securityEventService.emitFromIntegrationAudit({ brandId, status: 'failed', token: 'secret-token' });
    expect(queuedJobs()).to.have.length(0);
  });

  it('captures and stores minimized record-worker identity without research metadata', async function () {
    const records = sails.services.recordsservice;
    const originalStorage = Reflect.get(records, 'storageService');
    Reflect.set(records, 'storageService', { createRecordAudit: async () => ({ isSuccessful: () => true }) });
    try {
      await records.storeRecordAudit({
        attrs: {
          data: {
            action: 'updated',
            redboxOid: 'siem-capture-regression',
            occurredAt: '2026-10-14T10:00:00+10:00',
            record: {
              metaMetadata: { brandId: 'default', type: 'rdmp' },
              metadata: { description: 'SECRET-DESC', text: '😀'.repeat(30000) },
            },
            concurrency: { revision: 7, resolution: 'direct' },
            user: {
              id: 'siem-user',
              username: 'alice',
              email: 'private@example.test',
              additionalAttributes: { token: 'private-token', profile: 'PRIVATE-PROFILE' },
            },
          },
        },
      });
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(queuedJobs()).to.have.length(1);
      const event = queuedJobs()[0].data.event;
      if (!event || typeof event.eventId !== 'string') throw new Error('Expected queued security event');
      expect(event).to.include({ eventType: 'record.updated', brandId });
      expect(event.occurredAt).to.equal('2026-10-14T00:00:00.000Z');
      expect(event.resource).to.deep.equal({
        redboxOid: 'siem-capture-regression',
        action: 'updated',
        type: 'rdmp',
        brandId,
      });
      expect(event.actor).to.deep.equal({ id: 'siem-user', username: 'alice' });
      expect(event.payload).to.deep.equal({ concurrency: { revision: 7, resolution: 'direct' } });
      createdEventIds.push(event.eventId);
      await securityEventService.storeSecurityEvent({ attrs: { data: { event } } });
      const stored = await SecurityEvent.findOne({ eventId: event.eventId });
      expect(stored.resource).to.deep.equal(event.resource);
      expect(stored.actor).to.deep.equal(event.actor);
      expect(stored.payload).to.deep.equal(event.payload);
      for (const secret of ['SECRET-DESC', 'PRIVATE-PROFILE', 'private@example.test', 'private-token']) {
        expect(JSON.stringify(event)).not.to.include(secret);
        expect(JSON.stringify(stored)).not.to.include(secret);
      }
      expect(Buffer.byteLength(JSON.stringify(event))).to.be.at.most(65536);
    } finally {
      Reflect.set(records, 'storageService', originalStorage);
    }
  });
});
