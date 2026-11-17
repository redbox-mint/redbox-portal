import assert from 'node:assert/strict';
import sinon from 'sinon';


import path from 'node:path';
import { validateApiRouteRequest } from '../../../src/api-routes/validation';
import { getSiemEventsRoute, getSiemDeliveryStatusRoute, saveSiemConfigRoute, testSiemDestinationRoute } from '../../../src/api-routes/groups/siem';
import { normalizeSiemConfiguration, SiemConfigurationError } from '../../../src/configmodels/SiemConfiguration';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
const destination = (id = 'one') => ({
  id,
  enabled: true,
  adapterType: 'cef',
  endpointUrl: 'https://collector.example/ingest',
});
describe('SIEM configuration and request boundary', function () {

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
      const req = Object.assign({}, { body, query: {}, params: {}, headers: {} });
      const result = validateApiRouteRequest(req, saveSiemConfigRoute);
      assert.equal(result.valid, false);
      assert.throws(() => normalizeSiemConfiguration(body), SiemConfigurationError);
    });
  }
it('accepts the minimum budget through request validation and normalization', () => {
    const body = { redaction: { maxPayloadBytes: 1024 } };
    const req = Object.assign({}, { body, query: {}, params: {}, headers: {} });
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
      const req = Object.assign({}, { query: { limit: '25', offset: '25' }, params: {}, headers: {} });
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
        const req = Object.assign({}, { query, params: {}, headers: {} });
        assert.equal(validateApiRouteRequest(req, route).valid, false);
      });
    }
  }
it('validates destination test policy before dispatch', () => {
    const req = Object.assign(
      {},
      {
        body: { destination: destination(), redaction: { denylistedPaths: null } },
        query: {},
        params: {},
        headers: {},
      }
    );
    assert.equal(validateApiRouteRequest(req, testSiemDestinationRoute).valid, false);
  });
it('accepts and extracts failed event state through the actual route boundary', () => {
    const req = Object.assign(
      {},
      {
        query: { deliveryState: 'failed', limit: '25', offset: '25' },
        params: {},
        headers: {},
      }
    );
    const result = validateApiRouteRequest(req, getSiemEventsRoute);
    assert.equal(result.valid, true);
    if (!result.valid) throw new Error('Failed state rejected');
    assert.equal(result.query.deliveryState, 'failed');
    assert.equal(result.query.offset, 25);
  });
afterEach(() => sinon.restore());
});
