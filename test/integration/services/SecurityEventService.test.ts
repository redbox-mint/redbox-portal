describe('The SecurityEventService', function () {
  let securityEventService: any;
  let originalQueueNow: any;
  let originalGetAppConfigurationForBrand: any;
  const createdEventIds: string[] = [];

  before(function () {
    securityEventService = sails.services.securityeventservice;
  });

  beforeEach(function () {
    originalQueueNow = AgendaQueueService.now;
    originalGetAppConfigurationForBrand = AppConfigService.getAppConfigurationForBrand;
    AppConfigService.getAppConfigurationForBrand = () => {
      return {
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
            severity: {
              'integration.failure': 'error',
            },
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
    };
  });

  afterEach(async function () {
    AgendaQueueService.now = originalQueueNow;
    AppConfigService.getAppConfigurationForBrand = originalGetAppConfigurationForBrand;
    if (createdEventIds.length > 0) {
      await SecurityEvent.destroy({ eventId: createdEventIds.splice(0, createdEventIds.length) });
    }
  });

  it('queues, stores, redacts, and queries canonical security events', async function () {
    const queuedJobs: Array<{ name: string; data: any }> = [];
    AgendaQueueService.now = async (name: string, data: any) => {
      queuedJobs.push({ name, data });
    };

    await securityEventService.emitSecurityEvent({
      brandId: 'default',
      eventType: 'integration.failure',
      category: 'integrationAudit',
      source: 'IntegrationAuditService',
      occurredAt: '2026-01-01T00:00:00.000Z',
      payload: {
        token: 'secret-token',
        safe: 'visible',
      },
      traceId: 'trace-1',
    });

    expect(queuedJobs).to.have.length(1);
    expect(queuedJobs[0].name).to.equal('SecurityEventService-StoreSecurityEvent');
    const event = queuedJobs[0].data.event;
    createdEventIds.push(event.eventId);
    expect(event.severity).to.equal('error');
    expect(event.payload.token).to.equal('[REDACTED]');

    await securityEventService.storeSecurityEvent({ attrs: { data: { event } } });
    expect(queuedJobs[1].name).to.equal('SiemForwardingService-ForwardSecurityEvents');
    expect(queuedJobs[1].data.brandId).to.equal('default');

    const stored = await SecurityEvent.findOne({ eventId: event.eventId });
    expect(stored).to.not.equal(undefined);
    expect(stored.deliveryState).to.equal('pending');
    expect(stored.payload.safe).to.equal('visible');

    const result = await securityEventService.queryEvents({
      brandId: 'default',
      category: 'integrationAudit',
      deliveryState: 'pending',
      limit: 10,
    });
    expect(result.total).to.be.greaterThan(0);
    expect(result.rows.some((row: any) => row.eventId === event.eventId)).to.equal(true);
  });

  it('skips queueing when the configured event category is disabled', async function () {
    AppConfigService.getAppConfigurationForBrand = () => {
      return {
        siem: {
          enabled: true,
          destinations: [],
          events: {
            categories: {
              authentication: true,
              authorization: true,
              userManagement: true,
              recordLifecycle: true,
              integrationAudit: false,
              attachmentAccess: true,
            },
            severity: {},
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
    };
    const queuedJobs: Array<{ name: string; data: any }> = [];
    AgendaQueueService.now = async (name: string, data: any) => {
      queuedJobs.push({ name, data });
    };

    await securityEventService.emitFromIntegrationAudit({
      brandId: 'default',
      status: 'failed',
      token: 'secret-token',
    });

    expect(queuedJobs).to.have.length(0);
  });
  it('captures the real record audit worker after persistence without losing brand or oversized markers', async function () {
    const queuedJobs: Array<{ name: string; data: { event?: Record<string, unknown> } }> = [];
    AgendaQueueService.now = async (name, data) => {
      queuedJobs.push({ name, data });
    };
    const records = sails.services.recordsservice;
    const originalStorage = Reflect.get(records, 'storageService');
    Reflect.set(records, 'storageService', {
      createRecordAudit: async () => ({ isSuccessful: () => true }),
    });
    try {
      await records.storeRecordAudit({
        attrs: {
          data: {
            action: 'updated',
            redboxOid: 'siem-capture-regression',
            record: { metaMetadata: { brandId: 'default' }, text: '😀'.repeat(30000) },
            user: { email: 'private@example.test', additionalAttributes: { token: 'private-token' } },
          },
        },
      });
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(queuedJobs).to.have.length(1);
      const event = queuedJobs[0].data.event;
      expect(event).to.have.property('eventType', 'record.updated');
      expect(event).to.have.property('brandId', 'default');
      expect(event?.payload).to.have.property('truncated', true);
      expect(JSON.stringify(event)).not.to.include('private@example.test');
      expect(JSON.stringify(event)).not.to.include('private-token');
      expect(Buffer.byteLength(JSON.stringify(event))).to.be.at.most(65536);
    } finally {
      Reflect.set(records, 'storageService', originalStorage);
    }
  });
});
