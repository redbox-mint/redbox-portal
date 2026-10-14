import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/SiemController';
import type { BuildResponseType } from '../../../src/model/BuildResponse';

import { validateApiRouteRequest } from '../../../src/api-routes/validation';
import {
  getSiemEventsRoute,
  getSiemDeliveryStatusRoute,
  saveSiemConfigRoute,
  testSiemDestinationRoute,
} from '../../../src/api-routes/groups/siem';
import { normalizeSiemConfiguration, SiemConfigurationError } from '../../../src/configmodels/SiemConfiguration';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from '../../services/testHelper';

class TestSiemController extends Controllers.Siem {
  public override sendResp(req: Sails.Req, res: Sails.Res, response?: BuildResponseType) {
    return super.sendResp(req, res, response);
  }
}

const destination = (id = 'one') => ({
  id,
  enabled: true,
  adapterType: 'cef',
  endpointUrl: 'https://collector.example/ingest',
});

describe('SIEM configuration and request boundary', () => {
  const invalid = [
    { destinations: [destination(), destination()] },
    { destinations: [{ ...destination(), id: ' ' }] },
    { destinations: [{ ...destination(), adapterType: 'unknown' }] },
    { destinations: [{ ...destination(), endpointUrl: 'file:///tmp/x' }] },
    { destinations: [{ ...destination(), endpointUrl: 'https://secret:password@collector.example/' }] },
    { delivery: { batchSize: -1 } },
    { delivery: { maxAttempts: Infinity } },
    { delivery: { retryBackoffMultiplier: 0 } },
    { delivery: { deadLetterRetentionDays: -1 } },
    { redaction: { maxPayloadBytes: 256 } },
    { redaction: { maxPayloadBytes: 1023 } },
    { redaction: { denylistedPaths: null } },
    { redaction: { includeActorEmail: 'false' } },
    { destinations: [{ ...destination(), timeoutMs: 0 }] },
    { destinations: [{ ...destination(), retry: { maxAttempts: -1 } }] },
    { events: { categories: { unknown: true } } },
    { events: { severity: { login: 'invalid' } } },
  ];
  for (const [index, body] of invalid.entries()) {
    it(`rejects invalid configuration ${index} through request validation`, () => {
      const req = Object.assign(createMockSails(), { body, query: {}, params: {}, headers: {} });
      const result = validateApiRouteRequest(req, saveSiemConfigRoute);
      assert.equal(result.valid, false);
      assert.throws(() => normalizeSiemConfiguration(body), SiemConfigurationError);
    });
  }
  it('accepts the minimum budget through request validation and normalization', () => {
    const body = { redaction: { maxPayloadBytes: 1024 } };
    const req = Object.assign(createMockSails(), { body, query: {}, params: {}, headers: {} });
    assert.equal(validateApiRouteRequest(req, saveSiemConfigRoute).valid, true);
    assert.equal(normalizeSiemConfiguration(body).redaction.maxPayloadBytes, 1024);
  });
  it('defaults partial nested config and removes legacy inactive settings', () => {
    const config = normalizeSiemConfiguration({
      destinations: [{ ...destination(), formatOptions: { unused: true } }],
      delivery: { nonBlocking: false },
      redaction: { includeActorEmail: true },
    });
    assert.equal(config.delivery.nonBlocking, true);
    assert.equal(config.delivery.retryDelayMs, 60000);
    assert.equal(config.delivery.retryBackoffMultiplier, 2);
    assert.equal(config.delivery.deadLetterRetentionDays, 30);
    assert.equal(config.redaction.includeActorEmail, true);
    assert.equal('formatOptions' in config.destinations[0], false);
  });
  for (const route of [getSiemEventsRoute, getSiemDeliveryStatusRoute]) {
    it(`validates and extracts page two for ${route.path}`, () => {
      const req = Object.assign(createMockSails(), { query: { limit: '25', offset: '25' }, params: {}, headers: {} });
      const result = validateApiRouteRequest(req, route);
      assert.equal(result.valid, true);
      if (!result.valid) throw new Error('Invalid page two');
      assert.equal(result.query.offset, 25);
    });
    for (const query of [
      { limit: '-1' },
      { offset: '2.5' },
      { offset: '12garbage' },
      { startDate: 'not-a-date' },
      { endDate: '2026-02-30T00:00:00Z' },
    ]) {
      it(`rejects invalid query ${JSON.stringify(query)} for ${route.path}`, () => {
        const req = Object.assign(createMockSails(), { query, params: {}, headers: {} });
        assert.equal(validateApiRouteRequest(req, route).valid, false);
      });
    }
  }
  it('validates destination test policy before dispatch', () => {
    const req = Object.assign(createMockSails(), {
      body: { destination: destination(), redaction: { denylistedPaths: null } },
      query: {},
      params: {},
      headers: {},
    });
    assert.equal(validateApiRouteRequest(req, testSiemDestinationRoute).valid, false);
  });
  it('accepts and extracts failed event state through the actual route boundary', () => {
    const req = Object.assign(createMockSails(), {
      query: { deliveryState: 'failed', limit: '25', offset: '25' },
      params: {},
      headers: {},
    });
    const result = validateApiRouteRequest(req, getSiemEventsRoute);
    assert.equal(result.valid, true);
    if (!result.valid) throw new Error('Failed state rejected');
    assert.equal(result.query.deliveryState, 'failed');
    assert.equal(result.query.offset, 25);
  });
});

describe('SIEM controller', () => {
  let controller: TestSiemController;
  let mockSails: ReturnType<typeof createMockSails>;
  const brand = { id: 'brand-other', name: 'other' };
  const persist = sinon.stub().resolves();
  const readConfig = sinon.stub();
  const brandConfig = sinon.stub();
  const getBrand = sinon.stub();
  const queryEvents = sinon.stub().resolves({ rows: [], total: 100 });
  const deliveryStatus = sinon.stub().resolves({ rows: [], total: 100 });
  const testDestination = sinon.stub().resolves({ status: 'success' });
  const config = normalizeSiemConfiguration({
    destinations: [
      { ...destination(), token: 'stored-token', headers: { Authorization: 'stored-auth', 'X-Api-Key': 'stored-api' } },
    ],
  });
  let response: unknown;
  beforeEach(() => {
    mockSails = createMockSails({
      services: {
        securityeventservice: { queryEvents },
        siemforwardingservice: { getDeliveryStatus: deliveryStatus, testDestination },
      },
    });
    setupServiceTestGlobals(mockSails);
    getBrand.reset();
    getBrand.returns(brand);
    readConfig.reset();
    readConfig.resolves(config);
    brandConfig.reset();
    brandConfig.returns({ siem: config });
    response = undefined;
    Reflect.set(global, 'BrandingService', { getBrand });
    Reflect.set(global, 'AppConfigService', {
      createOrUpdateConfig: persist,
      getAppConfigByBrandAndKey: readConfig,
      getAppConfigurationForBrand: brandConfig,
    });
    controller = new TestSiemController();
    sinon.stub(controller, 'sendResp').callsFake((_req, _res, value) => {
      response = value;
      return _res;
    });
    persist.resetHistory();
    persist.resolves();
    queryEvents.reset();
    queryEvents.resolves({ rows: [], total: 100 });
    deliveryStatus.reset();
    deliveryStatus.resolves({ rows: [], total: 100 });
    testDestination.resetHistory();
    testDestination.resolves({ status: 'success' });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(global, 'BrandingService');
    Reflect.deleteProperty(global, 'AppConfigService');
  });
  const request = (body: unknown = {}, query = {}) =>
    Object.assign(createMockSails(), {
      session: { branding: 'other' },
      apiRequest: { body, query, params: {}, headers: {}, files: {} },
    });
  it('rejects invalid saves before persistence', async () => {
    await controller.saveConfig(request({ delivery: { batchSize: -1 } }), mockSails);
    assert.equal(persist.called, false);
    assert.equal(Reflect.get(Object(response), 'status'), 400);
  });
  it('rejects budgets below the minimum before persistence', async () => {
    await controller.saveConfig(request({ redaction: { maxPayloadBytes: 1023 } }), mockSails);
    assert.equal(persist.called, false);
    assert.equal(Reflect.get(Object(response), 'status'), 400);
  });
  it('normalizes partial saves and scopes persistence to request brand', async () => {
    await controller.saveConfig(request({ enabled: false }), mockSails);
    assert.deepEqual(persist.firstCall.args[0], brand);
    assert.equal(persist.firstCall.args[2].delivery.retryDelayMs, 60000);
  });
  it('returns actionable 400 when persistence rejects masks for an edited credential target', async () => {
    persist.rejects(new SiemConfigurationError('Replace or explicitly clear every masked credential'));
    await controller.saveConfig(
      request({
        destinations: [{ ...destination(), endpointUrl: 'https://edited.example/ingest', token: '__REDACTED__' }],
      }),
      mockSails
    );
    assert.equal(Reflect.get(Object(response), 'status'), 400);
    assert.match(JSON.stringify(response), /Replace or explicitly clear/);
  });
  it('scopes page-two monitoring to request brand despite supplied brand filter', async () => {
    const req = request({}, { offset: 25, limit: 25, brandId: 'foreign' });
    await controller.getEvents(req, mockSails);
    await controller.getDeliveryStatus(req, mockSails);
    for (const stub of [queryEvents, deliveryStatus])
      assert.deepEqual(stub.firstCall.args[0], { limit: 25, skip: 25, brandId: brand.id });
  });
  it('passes the validated failed event state to the query service', async () => {
    await controller.getEvents(request({}, { deliveryState: 'failed', offset: 25 }), mockSails);
    assert.equal(queryEvents.firstCall.args[0].deliveryState, 'failed');
    assert.equal(queryEvents.firstCall.args[0].skip, 25);
  });
  for (const changed of [{ endpointUrl: 'https://edited.example/ingest' }, { adapterType: 'leef' }]) {
    it(`rejects masked destination tests after target change ${JSON.stringify(changed)}`, async () => {
      await controller.testDestination(
        request({
          destination: {
            ...destination(),
            ...changed,
            token: '__REDACTED__',
            headers: { 'X-Private': '__REDACTED__' },
          },
        }),
        mockSails
      );
      assert.equal(testDestination.called, false);
      assert.equal(Reflect.get(Object(response), 'status'), 400);
    });
  }
  it('resolves masked test headers case-insensitively by destination ID', async () => {
    await controller.testDestination(
      request({
        destination: {
          ...destination(),
          token: '__REDACTED__',
          headers: { authorization: '__REDACTED__', 'x-api-key': '__REDACTED__' },
        },
      }),
      mockSails
    );
    assert.equal(testDestination.calledOnce, true);
    assert.equal(testDestination.firstCall.args[0].destination.token, 'stored-token');
    assert.deepEqual(testDestination.firstCall.args[0].destination.headers, {
      authorization: 'stored-auth',
      'x-api-key': 'stored-api',
    });
  });
  it('sanitizes credentials echoed in test diagnostics', async () => {
    testDestination.resolves({ status: 'failed', errorSummary: { message: 'stored-token stored-auth stored-api' } });
    await controller.testDestination(
      request({
        destination: {
          ...destination(),
          token: '__REDACTED__',
          headers: { authorization: '__REDACTED__', 'x-api-key': '__REDACTED__' },
        },
      }),
      mockSails
    );
    assert.equal(JSON.stringify(response).includes('stored-'), false);
  });
  it('sanitizes thrown collector diagnostics before responding', async () => {
    testDestination.rejects(new Error('collector echoed stored-token'));
    await controller.testDestination(request({ destination: { ...destination(), token: '__REDACTED__' } }), mockSails);
    assert.equal(JSON.stringify(response).includes('stored-token'), false);
    assert.equal(Reflect.get(Object(response), 'status'), 400);
  });
  it('rejects unconfigured destinations and changed URL queries before network access', async () => {
    await controller.testDestination(request({ destination: destination('foreign') }), mockSails);
    await controller.testDestination(
      request({ destination: { ...destination(), endpointUrl: 'https://collector.example/ingest?secret=x' } }),
      mockSails
    );
    assert.equal(testDestination.called, false);
  });

  for (const session of [undefined, {}, { branding: '   ' }, { branding: 42 }]) {
    for (const action of ['getConfig', 'saveConfig', 'getEvents', 'getDeliveryStatus', 'testDestination'] as const) {
      it(`rejects ${action} with invalid branding session ${JSON.stringify(session)} before service access`, async () => {
        const req = Object.assign(request({ destination: destination() }), { session });
        await controller[action](req, mockSails);
        assert.equal(Reflect.get(Object(response), 'status'), action === 'testDestination' ? 400 : 500);
        assert.match(JSON.stringify(response), /Missing or invalid request branding session/);
        for (const stub of [getBrand, readConfig, brandConfig, persist, queryEvents, deliveryStatus, testDestination]) {
          assert.equal(stub.called, false);
        }
      });
    }
  }
  it('reads configuration for the request brand and defaults absent configuration', async () => {
    readConfig.resolves(null);
    await controller.getConfig(request(), mockSails);
    assert.deepEqual(getBrand.firstCall.args, ['other']);
    assert.deepEqual(readConfig.firstCall.args, [brand.id, 'siem']);
    assert.equal(Reflect.get(Object(response), 'status'), 200);
    assert.deepEqual(Reflect.get(Object(response), 'data'), normalizeSiemConfiguration({}));
  });
  it('returns the persisted configuration after a successful save', async () => {
    const saved = normalizeSiemConfiguration({ enabled: true });
    readConfig.resolves(saved);
    await controller.saveConfig(request({ enabled: true }), mockSails);
    assert.equal(persist.calledOnce, true);
    assert.equal(persist.firstCall.args[1], 'siem');
    assert.deepEqual(readConfig.firstCall.args, [brand.id, 'siem']);
    assert.equal(Reflect.get(Object(response), 'status'), 200);
    assert.deepEqual(Reflect.get(Object(response), 'data'), saved);
  });
  for (const action of ['getConfig', 'saveConfig'] as const) {
    it(`returns 500 when ${action} cannot read configuration`, async () => {
      readConfig.rejects(new Error('Configuration storage unavailable'));
      await controller[action](request({ enabled: true }), mockSails);
      assert.equal(Reflect.get(Object(response), 'status'), 500);
      assert.match(JSON.stringify(response), /Configuration storage unavailable/);
      assert.equal(readConfig.calledOnce, true);
      assert.equal(persist.called, action === 'saveConfig');
    });
  }
  it('returns 500 for a persistence outage without reading back configuration', async () => {
    persist.rejects(new Error('Configuration write unavailable'));
    await controller.saveConfig(request({ enabled: true }), mockSails);
    assert.equal(Reflect.get(Object(response), 'status'), 500);
    assert.match(JSON.stringify(response), /Configuration write unavailable/);
    assert.equal(readConfig.called, false);
  });
  const monitoring = [
    {
      action: 'getEvents' as const,
      service: queryEvents,
      filters: { eventType: ' login ', category: ' authentication ', severity: ' warning ', deliveryState: ' failed ' },
      expected: { eventType: 'login', category: 'authentication', severity: 'warning', deliveryState: 'failed' },
      dateField: 'occurredAt',
    },
    {
      action: 'getDeliveryStatus' as const,
      service: deliveryStatus,
      filters: { eventId: ' event-1 ', destinationId: ' one ', status: ' failed ' },
      expected: { eventId: 'event-1', destinationId: 'one', status: 'failed' },
      dateField: 'startedAt',
    },
  ];
  for (const { action, service, filters, expected, dateField } of monitoring) {
    it(`maps ${action} filters and date range and returns the service result`, async () => {
      const result = { rows: [{ id: 'result-1' }], total: 1 };
      service.resolves(result);
      const startDate = '2026-10-01T00:00:00Z';
      const endDate = '2026-10-14T00:00:00Z';
      await controller[action](
        request(
          {},
          {
            ...filters,
            startDate,
            endDate,
            limit: '10',
            offset: '20',
            brandId: 'foreign',
            unsupported: 'ignored',
          }
        ),
        mockSails
      );
      assert.deepEqual(service.firstCall.args, [
        {
          ...expected,
          limit: 10,
          skip: 20,
          brandId: brand.id,
          [`${dateField}Start`]: startDate,
          [`${dateField}End`]: endDate,
        },
      ]);
      assert.equal(Reflect.get(Object(response), 'status'), 200);
      assert.deepEqual(Reflect.get(Object(response), 'data'), result);
    });
    it(`defaults ${action} pagination and omits blank or non-string filters`, async () => {
      await controller[action](
        request(
          {},
          {
            ...Object.fromEntries(Object.keys(filters).map((key, index) => [key, index === 0 ? '   ' : 42])),
            limit: '',
            offset: '',
            startDate: '',
            endDate: null,
          }
        ),
        mockSails
      );
      assert.deepEqual(service.firstCall.args, [{ limit: 50, skip: 0, brandId: brand.id }]);
      assert.equal(Reflect.get(Object(response), 'status'), 200);
    });
    for (const query of [
      { startDate: '2026-10-14T00:00:00Z', endDate: '2026-10-01T00:00:00Z' },
      { startDate: 'invalid-date' },
      { endDate: 42 },
      { limit: 0 },
      { limit: 501 },
      { offset: -1 },
      { offset: 1.5 },
    ]) {
      it(`returns 400 for ${action} query ${JSON.stringify(query)} before querying the service`, async () => {
        await controller[action](request({}, query), mockSails);
        assert.equal(Reflect.get(Object(response), 'status'), 400);
        assert.match(
          JSON.stringify(response),
          /startDate must precede endDate|valid ISO date string|Invalid pagination parameter/
        );
        assert.equal(service.called, false);
      });
    }
    it(`returns 500 for ${action} service failures`, async () => {
      service.rejects(new Error('Monitoring storage unavailable'));
      await controller[action](request(), mockSails);
      assert.equal(service.calledOnce, true);
      assert.equal(Reflect.get(Object(response), 'status'), 500);
      assert.match(JSON.stringify(response), /Monitoring storage unavailable/);
    });
  }
  it('restores a masked password and removes a masked header absent from stored credentials before dispatch', async () => {
    brandConfig.returns({
      siem: normalizeSiemConfiguration({
        destinations: [{ ...destination(), password: 'stored-password' }],
      }),
    });
    await controller.testDestination(
      request({
        destination: {
          ...destination(),
          password: '__REDACTED__',
          headers: { 'X-Missing': '__REDACTED__', 'X-Trace': 'trace-1' },
        },
      }),
      mockSails
    );
    assert.equal(testDestination.calledOnce, true);
    assert.equal(testDestination.firstCall.args[0].destination.password, 'stored-password');
    assert.deepEqual(testDestination.firstCall.args[0].destination.headers, { 'X-Trace': 'trace-1' });
    assert.deepEqual(brandConfig.firstCall.args, [brand.name]);
    assert.equal(Reflect.get(Object(response), 'status'), 200);
  });
});
