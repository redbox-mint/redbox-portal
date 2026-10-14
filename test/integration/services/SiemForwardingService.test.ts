import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { normalizeSiemConfiguration, type SiemConfigDto } from '@researchdatabox/sails-ng-common';
describe('The SiemForwardingService', function () {
  let siemForwardingService: any;
  let originalGetAppConfigurationForBrand: typeof AppConfigService.getAppConfigurationForBrand;
  let originalGetBrandById: typeof BrandingService.getBrandById;
  let originalGetBrand: typeof BrandingService.getBrand;
  let brandId: string;
  let config: SiemConfigDto;
  const createdEventIds: string[] = [];
  const createdAttemptEventIds: string[] = [];

  before(function () {
    siemForwardingService = sails.services.siemforwardingservice;
  });

  beforeEach(function () {
    originalGetAppConfigurationForBrand = AppConfigService.getAppConfigurationForBrand;
    originalGetBrandById = BrandingService.getBrandById;
    originalGetBrand = BrandingService.getBrand;
    const defaultBrand = BrandingService.getDefault();
    brandId = randomUUID();
    const brand = { ...defaultBrand, id: brandId, name: `siem-forwarding-${brandId}` };
    BrandingService.getBrandById = id => (id === brandId ? brand : originalGetBrandById.call(BrandingService, id));
    BrandingService.getBrand = name => (name === brand.name ? brand : originalGetBrand.call(BrandingService, name));
    config = normalizeSiemConfiguration({
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
    });
    AppConfigService.getAppConfigurationForBrand = name =>
      name === brand.name
        ? { ...originalGetAppConfigurationForBrand.call(AppConfigService, defaultBrand.name), siem: config }
        : originalGetAppConfigurationForBrand.call(AppConfigService, name);
  });

  afterEach(async function () {
    AppConfigService.getAppConfigurationForBrand = originalGetAppConfigurationForBrand;
    BrandingService.getBrandById = originalGetBrandById;
    BrandingService.getBrand = originalGetBrand;
    if (createdAttemptEventIds.length > 0) {
      await SiemDeliveryAttempt.destroy({ eventId: createdAttemptEventIds.splice(0, createdAttemptEventIds.length) });
    }
    if (createdEventIds.length > 0) {
      await SecurityEvent.destroy({ eventId: createdEventIds.splice(0, createdEventIds.length) });
    }
  });

  function securityEvent(eventId: string, eventBrandId = brandId) {
    createdEventIds.push(eventId);
    return SecurityEvent.create({
      eventId,
      brandId: eventBrandId,
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

    await siemForwardingService.forwardSecurityEvents({ attrs: { data: { brandId } } });

    const updated = await SecurityEvent.findOne({ eventId });
    expect(updated.deliveryState).to.equal('ignored');
  });

  it('leaves unrelated-brand pending and expired dead-letter rows unchanged', async function () {
    const defaultBrand = BrandingService.getDefault();
    const defaultConfig = originalGetAppConfigurationForBrand.call(AppConfigService, defaultBrand.name);
    expect(AppConfigService.getAppConfigurationForBrand(defaultBrand.name)).to.deep.equal(defaultConfig);
    expect(BrandingService.getBrandById(defaultBrand.id)).to.deep.equal(defaultBrand);
    expect(BrandingService.getBrand(defaultBrand.name)).to.deep.equal(defaultBrand);

    // Neither sentinel belongs to a brand enumerated by the live retry worker.
    const unrelatedBrandId = randomUUID();
    expect(BrandingService.getAvailable().map(name => BrandingService.getBrand(name)?.id)).not.to.include(
      unrelatedBrandId
    );
    const pendingId = `siem-unrelated-pending-${randomUUID()}`;
    const expiredId = `siem-unrelated-expired-${randomUUID()}`;
    await securityEvent(pendingId, unrelatedBrandId);
    await securityEvent(expiredId, unrelatedBrandId);
    const expiredAt = new Date(Date.now() - 31 * 86400000).toISOString();
    await SecurityEvent.update({ eventId: expiredId }, { deliveryState: 'deadLetter', terminalAt: expiredAt });
    createdAttemptEventIds.push(expiredId);
    await SiemDeliveryAttempt.create({
      eventId: expiredId,
      brandId: unrelatedBrandId,
      destinationId: 'unrelated',
      adapterType: 'splunk-hec-json',
      attemptNumber: 1,
      status: 'failed',
      startedAt: expiredAt,
      completedAt: expiredAt,
      durationMs: 0,
      httpStatusCode: 503,
      errorSummary: { message: 'unrelated expired attempt' },
    });
    const unrelatedEvents = await SecurityEvent.find({ eventId: [pendingId, expiredId] }).sort('eventId ASC');
    const unrelatedAttempts = await SiemDeliveryAttempt.find({ eventId: [pendingId, expiredId] });
    const assertUnrelatedRowsUnchanged = async () => {
      expect(await SecurityEvent.find({ eventId: [pendingId, expiredId] }).sort('eventId ASC')).to.deep.equal(
        unrelatedEvents
      );
      expect(await SiemDeliveryAttempt.find({ eventId: [pendingId, expiredId] })).to.deep.equal(unrelatedAttempts);
    };

    const requests: string[] = [];
    const receiver = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push(body);
        res.writeHead(200);
        res.end('{}');
      });
    });
    await new Promise<void>(resolve => receiver.listen(0, '0.0.0.0', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP receiver');
    try {
      config.destinations = [
        {
          id: 'receiver',
          name: 'receiver',
          enabled: true,
          adapterType: 'splunk-hec-json',
          endpointUrl: `http://127.0.0.1:${address.port}`,
          timeoutMs: 1000,
        },
      ];
      const disabledId = `siem-isolated-disabled-${randomUUID()}`;
      await securityEvent(disabledId);
      const job = { attrs: { data: { brandId } } };
      await siemForwardingService.forwardSecurityEvents(job);
      expect((await SecurityEvent.findOne({ eventId: disabledId })).deliveryState).to.equal('ignored');
      expect(requests).to.have.length(0);
      await assertUnrelatedRowsUnchanged();

      config.enabled = true;
      const enabledId = `siem-isolated-enabled-${randomUUID()}`;
      createdAttemptEventIds.push(enabledId);
      await securityEvent(enabledId);
      await siemForwardingService.forwardSecurityEvents(job);
      expect((await SecurityEvent.findOne({ eventId: enabledId })).deliveryState).to.equal('delivered');
      expect(await SiemDeliveryAttempt.count({ eventId: enabledId })).to.equal(1);
      expect(requests).to.have.length(1);
      expect(JSON.parse(requests[0]).event.eventId).to.equal(enabledId);
      await assertUnrelatedRowsUnchanged();
    } finally {
      await new Promise<void>(resolve => receiver.close(() => resolve()));
    }
  });

  it('marks pending events ignored when SIEM is enabled with no active destinations', async function () {
    config.enabled = true;
    config.destinations = [];
    const eventId = `siem-forwarding-no-destinations-${Date.now()}`;
    await securityEvent(eventId);

    await siemForwardingService.forwardSecurityEvents({ attrs: { data: { brandId } } });

    const updated = await SecurityEvent.findOne({ eventId });
    expect(updated.deliveryState).to.equal('ignored');
    expect(updated.destinationStates).to.deep.equal({});
    expect(await SiemDeliveryAttempt.count({ eventId })).to.equal(0);
  });

  it('lists delivery attempts with filters and pagination', async function () {
    const eventId = `siem-delivery-status-${Date.now()}`;
    createdAttemptEventIds.push(eventId);
    await SiemDeliveryAttempt.create({
      eventId,
      brandId,
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
      brandId,
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
  it('uses the installed datastore to let concurrent workers claim an enabled event once', async function () {
    const requests: string[] = [];
    const receiver = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push(body);
        setTimeout(() => {
          res.writeHead(200);
          res.end('{}');
        }, 100);
      });
    });
    await new Promise<void>(resolve => receiver.listen(0, '0.0.0.0', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP receiver');
    try {
      config.enabled = true;
      config.destinations = [
        {
          id: 'receiver',
          name: 'receiver',
          enabled: true,
          adapterType: 'splunk-hec-json',
          endpointUrl: `http://127.0.0.1:${address.port}`,
          timeoutMs: 1000,
        },
      ];
      const eventId = `siem-concurrent-${Date.now()}`;
      createdAttemptEventIds.push(eventId);
      await securityEvent(eventId);
      const job = { attrs: { data: { brandId } } };
      await Promise.all(Array.from({ length: 8 }, () => siemForwardingService.forwardSecurityEvents(job)));
      expect(requests).to.have.length(1);
      expect(JSON.parse(requests[0]).event.eventId).to.equal(eventId);
      const row = await SecurityEvent.findOne({ eventId });
      expect(row.deliveryState).to.equal('delivered');
      expect(row.destinationStates.receiver.status).to.equal('success');
      expect(await SiemDeliveryAttempt.count({ eventId })).to.equal(1);
    } finally {
      await new Promise<void>(resolve => receiver.close(() => resolve()));
    }
  });

  it('retains success, retries independently, schedules backoff and removes expired dead letters', async function () {
    const calls = { healthy: 0, short: 0, long: 0 };
    const receiver = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        if (req.url === '/healthy') {
          calls.healthy++;
          res.writeHead(200);
        } else if (req.url === '/short') {
          calls.short++;
          res.writeHead(401);
        } else {
          calls.long++;
          res.writeHead(503);
        }
        res.end('{}');
      });
    });
    await new Promise<void>(resolve => receiver.listen(0, '0.0.0.0', resolve));
    const address = receiver.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP receiver');
    try {
      config.enabled = true;
      config.delivery.retryDelayMs = 1000;
      config.destinations = ['healthy', 'short', 'long'].map(id => ({
        id,
        name: id,
        enabled: true,
        adapterType: 'splunk-hec-json',
        endpointUrl: `http://127.0.0.1:${address.port}/${id}`,
        retry: { maxAttempts: id === 'short' ? 1 : 3 },
      }));
      const eventId = `siem-progress-${Date.now()}`;
      createdAttemptEventIds.push(eventId);
      await securityEvent(eventId);
      const job = { attrs: { data: { brandId } } };
      const collection = SecurityEvent.getDatastore().manager.collection(SecurityEvent.tableName);
      for (let round = 0; round < 3; round++) {
        if (round)
          await collection.updateOne(
            { eventId },
            { $set: { nextEligibleAt: null, 'destinationStates.long.nextEligibleAt': new Date(0).toISOString() } }
          );
        const before = Date.now();
        await siemForwardingService.forwardSecurityEvents(job);
        const row = await SecurityEvent.findOne({ eventId });
        expect(row.deliveryState).to.equal(round === 2 ? 'deadLetter' : 'failed');
        if (round < 2) expect(Date.parse(row.nextEligibleAt) - before).to.be.at.least(1000 * 2 ** round);
      }
      expect(calls).to.deep.equal({ healthy: 1, short: 1, long: 3 });
      const attempts = await SiemDeliveryAttempt.find({ eventId });
      expect(attempts.find(attempt => attempt.destinationId === 'short').httpStatusCode).to.equal(401);
      expect(attempts.find(attempt => attempt.destinationId === 'long').httpStatusCode).to.equal(503);
      await collection.updateOne(
        { eventId },
        { $set: { terminalAt: new Date(Date.now() - 31 * 86400000).toISOString() } }
      );
      await siemForwardingService.forwardSecurityEvents(job);
      expect(await SecurityEvent.count({ eventId })).to.equal(0);
      expect(await SiemDeliveryAttempt.count({ eventId })).to.equal(0);
    } finally {
      await new Promise<void>(resolve => receiver.close(() => resolve()));
    }
  });
});
