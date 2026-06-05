describe('The SiemForwardingService', function () {
  let siemForwardingService: any;
  let originalBrandingAppConfigMap: any;
  const createdEventIds: string[] = [];
  const createdAttemptEventIds: string[] = [];

  before(function () {
    siemForwardingService = sails.services.siemforwardingservice;
  });

  beforeEach(function () {
    originalBrandingAppConfigMap = AppConfigService.brandingAppConfigMap;
    AppConfigService.brandingAppConfigMap = {
      default: {
        siem: {
          enabled: false,
          destinations: [],
          delivery: {
            batchSize: 10,
            maxAttempts: 3,
            retryDelayMs: 60000,
            retryBackoffMultiplier: 2,
            deadLetterRetentionDays: 30,
            nonBlocking: true,
          },
          redaction: {
            denylistedPaths: ['token', 'password', 'authorization'],
            maxPayloadBytes: 65536,
            includeActorEmail: false,
            includeIpAddress: false,
            includeUserAgent: false,
          },
        },
      },
    };
  });

  afterEach(async function () {
    AppConfigService.brandingAppConfigMap = originalBrandingAppConfigMap;
    if (createdAttemptEventIds.length > 0) {
      await SiemDeliveryAttempt.destroy({ eventId: createdAttemptEventIds.splice(0, createdAttemptEventIds.length) });
    }
    if (createdEventIds.length > 0) {
      await SecurityEvent.destroy({ eventId: createdEventIds.splice(0, createdEventIds.length) });
    }
  });

  function securityEvent(eventId: string) {
    createdEventIds.push(eventId);
    return SecurityEvent.create({
      eventId,
      brandId: 'default',
      eventType: 'authentication.login.success',
      category: 'authentication',
      severity: 'info',
      occurredAt: '2026-01-01T00:00:00.000Z',
      source: 'UsersService',
      deliveryState: 'pending',
      payload: { ok: true },
      destinationStates: {},
    });
  }

  it('marks pending events ignored when the brand SIEM config is disabled', async function () {
    const eventId = `siem-forwarding-disabled-${Date.now()}`;
    await securityEvent(eventId);

    await siemForwardingService.forwardSecurityEvents({ attrs: { data: { brandId: 'default' } } });

    const updated = await SecurityEvent.findOne({ eventId });
    expect(updated.deliveryState).to.equal('ignored');
  });

  it('lists delivery attempts with filters and pagination', async function () {
    const eventId = `siem-delivery-status-${Date.now()}`;
    createdAttemptEventIds.push(eventId);
    await SiemDeliveryAttempt.create({
      eventId,
      brandId: 'default',
      destinationId: 'splunk',
      adapterType: 'splunk-hec-json',
      attemptNumber: 1,
      status: 'failed',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      httpStatusCode: 500,
      errorSummary: { message: 'downstream failed' },
    });

    const status = await siemForwardingService.getDeliveryStatus({
      brandId: 'default',
      eventId,
      destinationId: 'splunk',
      status: 'failed',
      limit: 5,
    });

    expect(status.total).to.equal(1);
    expect(status.rows).to.have.length(1);
    expect(status.rows[0].httpStatusCode).to.equal(500);
    expect(status.rows[0].errorSummary.message).to.equal('downstream failed');
  });
});
