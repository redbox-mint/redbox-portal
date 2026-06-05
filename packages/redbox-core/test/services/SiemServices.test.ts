const { Effect } = require('effect');
const sinon = require('sinon');
const {
  DEFAULT_SIEM_DELIVERY,
  DEFAULT_SIEM_EVENT_SELECTION,
  DEFAULT_SIEM_REDACTION,
  SiemConfiguration,
} = require('../../src/configmodels/SiemConfiguration');
const { buildSiemPayload, SiemAdapterError } = require('../../src/services/siem/SiemAdapters');
const { limitPayloadSize, redactForSiem } = require('../../src/services/siem/SiemPayloadRedactor');
const { Services: SecurityEventServices } = require('../../src/services/SecurityEventService');
const { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } = require('./testHelper');

let expect: Chai.ExpectStatic;
import('chai').then((mod) => expect = mod.expect);

describe('SIEM services and helpers', function () {
  const enabledSiemConfig = {
    enabled: true,
    destinations: [],
    events: DEFAULT_SIEM_EVENT_SELECTION,
    redaction: DEFAULT_SIEM_REDACTION,
    delivery: DEFAULT_SIEM_DELIVERY,
  };

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).AgendaQueueService;
    delete (global as any).AppConfigService;
    delete (global as any).BrandingService;
    delete (global as any).SecurityEvent;
    sinon.restore();
  });

  it('defines disabled defaults for the brand-aware SIEM config model', function () {
    const config = new SiemConfiguration();

    expect(config.enabled).to.equal(false);
    expect(config.destinations).to.deep.equal([]);
    expect(config.events.categories.authentication).to.equal(true);
    expect(config.redaction.includeActorEmail).to.equal(false);
    expect(config.delivery.nonBlocking).to.equal(true);
  });

  it('redacts sensitive nested payload fields and limits oversized payloads', function () {
    const redacted: any = redactForSiem({
      actor: { email: 'hidden@example.edu', name: 'Visible Name' },
      requestContext: { ipAddress: '127.0.0.1', headers: { Authorization: 'Bearer secret' } },
      payload: { token: 'secret-token', tokenCount: 2, safe: 'visible' },
    }, DEFAULT_SIEM_REDACTION);

    expect(redacted.actor.email).to.equal('hidden@example.edu');
    expect(redacted.payload.token).to.equal('[REDACTED]');
    expect(redacted.payload.tokenCount).to.equal(2);
    expect(redacted.requestContext.headers.Authorization).to.equal('[REDACTED]');
    expect(redacted.payload.safe).to.equal('visible');

    const limited: any = limitPayloadSize({ value: 'x'.repeat(200) }, 64);
    expect(limited.truncated).to.equal(true);
    expect(limited.originalBytes).to.be.greaterThan(64);
  });

  it('does not redact fields merely because their key contains a denylisted word', function () {
    const redacted: any = redactForSiem({
      payload: {
        token: 'secret-token',
        tokenCount: 2,
        authenticationTokenExpiry: '2026-01-01T00:00:00.000Z',
      },
    }, DEFAULT_SIEM_REDACTION);

    expect(redacted.payload.token).to.equal('[REDACTED]');
    expect(redacted.payload.tokenCount).to.equal(2);
    expect(redacted.payload.authenticationTokenExpiry).to.equal('2026-01-01T00:00:00.000Z');
  });

  it('formats Splunk and OpenTelemetry payloads with destination headers', async function () {
    const event = {
      eventId: 'event-1',
      brandId: 'brand-1',
      eventType: 'authentication.login.success',
      category: 'authentication',
      severity: 'info',
      occurredAt: '2026-01-01T00:00:00.000Z',
      source: 'UsersService',
      deliveryState: 'pending',
      payload: { ok: true },
    } as any;

    const splunkPayload = await Effect.runPromise(buildSiemPayload([event], {
      id: 'splunk',
      name: 'Splunk',
      enabled: true,
      adapterType: 'splunk-hec-json',
      endpointUrl: 'https://splunk.example/services/collector',
      token: 'token-1',
    }));

    expect(splunkPayload.headers.Authorization).to.equal('Splunk token-1');
    expect(splunkPayload.body).to.be.an('array');
    expect((splunkPayload.body as any[])[0].event.eventId).to.equal('event-1');

    const otlpPayload = await Effect.runPromise(buildSiemPayload([event], {
      id: 'otlp',
      name: 'OTLP',
      enabled: true,
      adapterType: 'otel-otlp-logs',
      endpointUrl: 'https://otel.example/v1/logs',
      token: 'token-2',
    }));

    expect(otlpPayload.headers.Authorization).to.equal('Bearer token-2');
    expect((otlpPayload.body as any).resourceLogs[0].scopeLogs[0].logRecords[0].severityText).to.equal('info');
  });

  it('fails payload construction for unsupported adapter types', async function () {
    try {
      await Effect.runPromise(buildSiemPayload([], {
        id: 'unsupported',
        name: 'Unsupported',
        enabled: true,
        adapterType: 'unsupported' as any,
        endpointUrl: 'https://example.invalid',
      }));
      expect.fail('Expected unsupported adapter to fail');
    } catch (error) {
      expect(String(error)).to.contain('Unsupported SIEM adapter');
    }
  });

  it('queues enabled security events after applying severity mapping and redaction', async function () {
    const queue = { now: sinon.stub().resolves(undefined) };
    setupServiceTestGlobals(createMockSails());
    (global as any).AgendaQueueService = queue;
    (global as any).BrandingService = {
      getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().returns({
        siem: {
          ...enabledSiemConfig,
          events: {
            ...DEFAULT_SIEM_EVENT_SELECTION,
            severity: { 'authorization.failure': 'critical' },
          },
        },
      }),
    };

    const service = new SecurityEventServices.SecurityEventService();
    await service.emitSecurityEvent({
      brandId: 'brand-1',
      eventType: 'authorization.failure',
      category: 'authorization',
      source: 'AuthPolicy',
      payload: { password: 'secret', safe: 'value' },
    });

    expect(queue.now.calledOnce).to.equal(true);
    expect(queue.now.firstCall.args[0]).to.equal('SecurityEventService-StoreSecurityEvent');
    const event = queue.now.firstCall.args[1].event;
    expect(event.severity).to.equal('critical');
    expect(event.payload.password).to.equal('[REDACTED]');
    expect(event.payload.safe).to.equal('value');
  });

  it('does not queue events when SIEM is disabled or the category is excluded', async function () {
    const queue = { now: sinon.stub().resolves(undefined) };
    setupServiceTestGlobals(createMockSails());
    (global as any).AgendaQueueService = queue;
    (global as any).BrandingService = {
      getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().returns({
        siem: {
          ...enabledSiemConfig,
          events: {
            ...DEFAULT_SIEM_EVENT_SELECTION,
            categories: { ...DEFAULT_SIEM_EVENT_SELECTION.categories, authorization: false },
          },
        },
      }),
    };

    const service = new SecurityEventServices.SecurityEventService();
    await service.emitSecurityEvent({
      brandId: 'brand-1',
      eventType: 'authorization.failure',
      category: 'authorization',
      source: 'AuthPolicy',
    });

    expect(queue.now.called).to.equal(false);
  });
});
