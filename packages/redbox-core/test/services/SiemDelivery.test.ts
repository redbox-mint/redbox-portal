import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { expect } from 'chai';
import { Effect } from 'effect';
import { Services } from '../../src/services/SiemForwardingService';
import { buildSiemPayload, deliverSiemPayload } from '../../src/services/siem/SiemAdapters';
import { claimDelivery, saveDelivery } from '../../src/services/siem/SiemDeliveryStore';
import { DEFAULT_SIEM_DELIVERY, DEFAULT_SIEM_REDACTION } from '../../src/configmodels/SiemConfiguration';
import type { SiemDestinationConfig } from '../../src/configmodels/SiemConfiguration';
import type { SecurityEventAttributes } from '../../src/waterline-models/SecurityEvent';

const sample = (): SecurityEventAttributes => ({ id: 'test', eventId: randomUUID(), brandId: 'test', eventType: 'authentication.login.success', category: 'authentication', severity: 'info', occurredAt: new Date().toISOString(), source: 'UsersService', deliveryState: 'pending', payload: { ok: true, count: 2, list: ['a', false], text: 'x=y\\z\nnext' } });
const destination = (url: string, adapterType: SiemDestinationConfig['adapterType'] = 'splunk-hec-json'): SiemDestinationConfig => ({ id: adapterType, name: adapterType, enabled: true, endpointUrl: url, adapterType, timeoutMs: 1000 });
let server: Server;
let endpoint: string;
let received: string[];
let status = 200;
let response: object = {};
let waitMs = 0;

describe('SIEM receiver and delivery regression tests', function () {
  before(async function () {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        received.push(body);
        if (req.url === '/trickle') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const timer = setInterval(() => res.write(' '), 5);
          const stop = setTimeout(() => res.end('{}'), 200);
          res.on('close', () => { clearInterval(timer); clearTimeout(stop); });
          return;
        }
        setTimeout(() => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(response)); }, waitMs);
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server');
    endpoint = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(function () { received = []; status = 200; response = {}; waitMs = 0; });
  after(async function () { await new Promise<void>(resolve => server.close(() => resolve())); });

  for (const adapter of ['splunk-hec-json', 'otel-otlp-logs', 'syslog-rfc5424-json', 'cef', 'leef'] satisfies SiemDestinationConfig['adapterType'][]) {
    it(`delivers valid ${adapter} output to an HTTP receiver`, async function () {
      const event = sample();
      const config = destination(endpoint, adapter);
      const payload = await Effect.runPromise(buildSiemPayload([event], config));
      const result = await Effect.runPromise(deliverSiemPayload(payload, config));
      expect(result.status).to.equal('success');
      expect(received).to.have.length(1);
      const wire = received[0];
      if (adapter === 'splunk-hec-json') expect(JSON.parse(wire)[0].event.eventId).to.equal(event.eventId);
      if (adapter === 'syslog-rfc5424-json') {
        const fields = wire.split(' ');
        expect(fields[5].length).to.be.at.most(32);
        expect(fields[5]).to.match(/^[!-~]+$/);
        expect(JSON.parse(fields.slice(7).join(' ')).eventId).to.equal(event.eventId);
      }
      if (adapter === 'cef') {
        expect(wire).to.contain('x\\=y');
        expect(wire).to.contain('\\\\');
        expect(wire).not.to.contain('\n');
        expect(wire).to.contain(`eventId=${event.eventId}`);
      }
      if (adapter === 'leef') {
        expect(wire).to.contain('|0x09|eventId=');
        expect(wire.split('\t')).to.have.length(3);
        expect(wire).not.to.contain('\n');
      }
      if (adapter === 'otel-otlp-logs') {
        const values = JSON.parse(wire).resourceLogs[0].scopeLogs[0].logRecords[0].body.kvlistValue.values;
        expect(values.find((entry: { key: string }) => entry.key === 'portalId')).to.equal(undefined);
        const fields = values.find((entry: { key: string }) => entry.key === 'payload').value.kvlistValue.values;
        expect(fields.find((entry: { key: string }) => entry.key === 'ok').value).to.deep.equal({ boolValue: true });
        expect(fields.find((entry: { key: string }) => entry.key === 'count').value).to.deep.equal({ intValue: '2' });
        expect(fields.find((entry: { key: string }) => entry.key === 'list').value.arrayValue.values).to.deep.equal([{ stringValue: 'a' }, { boolValue: false }]);
      }
    });
  }
  for (const code of [401, 503]) {
    it(`preserves HTTP ${code} and bounded safe diagnostics through Effect`, async function () {
      status = code; response = { token: 'secret', message: 'x'.repeat(10000) };
      const result = await new Services.SiemForwardingService().testDestination({ destination: destination(endpoint) });
      expect(result.status).to.equal('failed');
      expect(result.httpStatusCode).to.equal(code);
      expect(JSON.stringify(result)).not.to.contain('secret');
      expect(JSON.stringify(result).length).to.be.lessThan(1000);
      expect(result.responseSummary?.statusText).to.be.a('string');
    });
  }
  it('records a timeout without leaking URL credentials', async function () {
    waitMs = 100;
    const result = await new Services.SiemForwardingService().testDestination({ destination: { ...destination(endpoint), timeoutMs: 10 } });
    expect(result.status).to.equal('failed');
    expect(result.errorSummary?.message).to.equal('SIEM request timed out');
  });
  it('bounds a trickling HTTP response by an absolute deadline', async function () {
    const result = await new Services.SiemForwardingService().testDestination({ destination: { ...destination(`${endpoint}/trickle`), timeoutMs: 30 } });
    expect(result.status).to.equal('failed');
    expect(result.errorSummary?.message).to.equal('SIEM request timed out');
  });
  it('rejects OTLP partial success and Splunk application errors', async function () {
    response = { partialSuccess: { rejectedLogRecords: '1', errorMessage: 'private' } };
    const service = new Services.SiemForwardingService();
    const otlp = await service.testDestination({ destination: destination(endpoint, 'otel-otlp-logs') });
    expect(otlp.status).to.equal('failed'); expect(otlp.httpStatusCode).to.equal(200);
    expect(JSON.stringify(otlp)).not.to.contain('private');
    response = { code: 4, text: 'invalid token private' };
    const splunk = await service.testDestination({ destination: destination(endpoint) });
    expect(splunk.status).to.equal('failed'); expect(splunk.responseSummary?.collectorCode).to.equal(4);
  });

  describe('native Mongo delivery claims and progress', function () {
    let client: MongoClient;
    let db: Db;
    let config: { enabled: boolean; destinations: SiemDestinationConfig[]; delivery: typeof DEFAULT_SIEM_DELIVERY; redaction: typeof DEFAULT_SIEM_REDACTION };
    const originals = new Map<string, unknown>();
    const job = { attrs: { data: { brandId: 'test' } } };
    before(async function () {
      if (!process.env.SIEM_TEST_MONGO_URL) this.skip();
      client = await MongoClient.connect(process.env.SIEM_TEST_MONGO_URL!);
      db = client.db(`siem_delivery_test_${randomUUID().replace(/-/g, '')}`);
      for (const key of ['SecurityEvent', 'SiemDeliveryAttempt', 'BrandingService', 'AppConfigService']) originals.set(key, Reflect.get(globalThis, key));
      Reflect.set(globalThis, 'SecurityEvent', { tableName: 'securityevent', getDatastore: () => ({ manager: db }) });
      Reflect.set(globalThis, 'SiemDeliveryAttempt', { tableName: 'siemdeliveryattempt', getDatastore: () => ({ manager: db }),
        count: (criteria: object) => db.collection('siemdeliveryattempt').countDocuments(criteria), create: (row: object) => db.collection('siemdeliveryattempt').insertOne(row) });
      Reflect.set(globalThis, 'BrandingService', { getBrandById: () => ({ name: 'test' }), getBrand: () => ({ name: 'test' }) });
      Reflect.set(globalThis, 'AppConfigService', { getAppConfigurationForBrand: () => ({ siem: config }) });
    });
    beforeEach(async function () {
      if (!db) return;
      await db.collection('securityevent').deleteMany({}); await db.collection('siemdeliveryattempt').deleteMany({});
      config = { enabled: true, destinations: [destination(endpoint)], delivery: { ...DEFAULT_SIEM_DELIVERY, retryDelayMs: 1000 }, redaction: DEFAULT_SIEM_REDACTION };
    });
    after(async function () {
      if (!client) return;
      await db.dropDatabase(); await client.close();
      for (const [key, value] of originals) { if (value === undefined) Reflect.deleteProperty(globalThis, key); else Reflect.set(globalThis, key, value); }
    });
    it('allows exactly one claimant and rejects expired/stale owner writes', async function () {
      const event = sample(); await db.collection('securityevent').insertOne(event);
      const claims = await Promise.all(Array.from({ length: 20 }, () => claimDelivery(event, 30000)));
      const owners = claims.filter((claim): claim is SecurityEventAttributes => claim !== null);
      expect(owners).to.have.length(1);
      await db.collection('securityevent').updateOne({ eventId: event.eventId }, { $set: { leaseExpiresAt: new Date(0).toISOString() } });
      expect(await saveDelivery(owners[0], { deliveryState: 'delivered' })).to.equal(false);
      const newOwner = await claimDelivery(event, 30000);
      expect(newOwner).not.to.equal(null);
      expect(await saveDelivery(owners[0], { deliveryState: 'delivered' })).to.equal(false);
      expect(await saveDelivery(newOwner!, { deliveryState: 'delivered' })).to.equal(true);
    });
    it('renews ownership before the next operation and retains acknowledgements for disabled destinations', async function () {
      const event = sample(); await db.collection('securityevent').insertOne(event);
      const owner = await claimDelivery(event, 100);
      expect(owner).not.to.equal(null);
      expect(await saveDelivery(owner!, { leaseExpiresAt: new Date(Date.now() + 60000).toISOString() })).to.equal(true);
      expect(await claimDelivery(event, 30000)).to.equal(null);
      await db.collection('securityevent').updateOne({ eventId: event.eventId }, { $set: { deliveryState: 'failed', nextEligibleAt: null,
        destinationStates: { disabled: { status: 'success', attempts: 1 } } } });
      await new Services.SiemForwardingService().forwardSecurityEvents(job);
      const row = await db.collection('securityevent').findOne({ eventId: event.eventId });
      expect(row?.destinationStates.disabled.status).to.equal('success');
      expect(row?.deliveryState).to.equal('delivered');
    });
    it('recovers legacy processing records with absent or null leases', async function () {
      for (const leaseExpiresAt of [undefined, null]) {
        const event = sample(); event.deliveryState = 'processing';
        if (leaseExpiresAt === null) event.leaseExpiresAt = null;
        await db.collection('securityevent').insertOne(event);
        expect(await claimDelivery(event, 30000)).not.to.equal(null);
      }
    });
    it('concurrent workers send once even while delivery takes time', async function () {
      waitMs = 50; const event = sample(); await db.collection('securityevent').insertOne(event);
      await Promise.all(Array.from({ length: 8 }, () => new Services.SiemForwardingService().forwardSecurityEvents(job)));
      expect(received).to.have.length(1);
      expect((await db.collection('securityevent').findOne({ eventId: event.eventId }))?.deliveryState).to.equal('delivered');
    });
    it('keeps successful destinations terminal across retries and uses exponential eligibility', async function () {
      const healthy = destination(endpoint); const failing = { ...destination(endpoint), id: 'failing', endpointUrl: `${endpoint}/fail` };
      // First destination succeeds; use a second receiver for failures.
      const failureServer = createServer((_req, res) => { res.writeHead(503); res.end(); });
      await new Promise<void>(resolve => failureServer.listen(0, '127.0.0.1', resolve));
      const address = failureServer.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP');
      failing.endpointUrl = `http://127.0.0.1:${address.port}`;
      try {
        config.destinations = [healthy, failing]; const event = sample(); await db.collection('securityevent').insertOne(event);
        const service = new Services.SiemForwardingService(); const before = Date.now(); await service.forwardSecurityEvents(job);
        let stored = await db.collection('securityevent').findOne({ eventId: event.eventId });
        expect(stored?.destinationStates[healthy.id].status).to.equal('success');
        expect(Date.parse(stored?.nextEligibleAt) - before).to.be.at.least(1000);
        await service.forwardSecurityEvents(job); expect(received).to.have.length(1);
        await db.collection('securityevent').updateOne({ eventId: event.eventId }, { $set: { nextEligibleAt: null, 'destinationStates.failing.nextEligibleAt': new Date(0).toISOString() } });
        const secondStart = Date.now(); await service.forwardSecurityEvents(job);
        stored = await db.collection('securityevent').findOne({ eventId: event.eventId });
        expect(Date.parse(stored?.nextEligibleAt) - secondStart).to.be.at.least(2000);
        expect(received).to.have.length(1); expect(stored?.destinationStates.failing.attempts).to.equal(2);
      } finally { await new Promise<void>(resolve => failureServer.close(() => resolve())); }
    });
    it('exhausts unequal destination budgets independently and cleans retained attempts', async function () {
      status = 503;
      config.destinations = [{ ...destination(endpoint), id: 'one', retry: { maxAttempts: 1 } }, { ...destination(endpoint), id: 'three', retry: { maxAttempts: 3 } }];
      const event = sample(); await db.collection('securityevent').insertOne(event);
      const service = new Services.SiemForwardingService();
      for (let round = 0; round < 3; round++) {
        await db.collection('securityevent').updateOne({ eventId: event.eventId }, { $set: { nextEligibleAt: null, 'destinationStates.three.nextEligibleAt': new Date(0).toISOString() } });
        await service.forwardSecurityEvents(job);
        const row = await db.collection('securityevent').findOne({ eventId: event.eventId });
        expect(row?.deliveryState).to.equal(round === 2 ? 'deadLetter' : 'failed');
      }
      expect(await db.collection('siemdeliveryattempt').countDocuments({ destinationId: 'one' })).to.equal(1);
      expect(await db.collection('siemdeliveryattempt').countDocuments({ destinationId: 'three' })).to.equal(3);
      await db.collection('securityevent').updateOne({ eventId: event.eventId }, { $set: { terminalAt: new Date(Date.now() - 31 * 86400000).toISOString() } });
      await service.forwardSecurityEvents(job);
      expect(await db.collection('securityevent').countDocuments({})).to.equal(0);
      expect(await db.collection('siemdeliveryattempt').countDocuments({})).to.equal(0);
    });
    it('recovers an interrupted reserved attempt without resending an acknowledged destination', async function () {
      const event = sample(); event.deliveryState = 'processing'; event.leaseExpiresAt = new Date(0).toISOString();
      event.destinationStates = { [config.destinations[0].id]: { status: 'success', attempts: 1 }, second: { status: 'processing', attempts: 1 } };
      config.destinations.push({ ...destination(endpoint), id: 'second' });
      await db.collection('securityevent').insertOne(event);
      await new Services.SiemForwardingService().forwardSecurityEvents(job);
      expect(received).to.have.length(1);
      const row = await db.collection('securityevent').findOne({ eventId: event.eventId });
      expect(row?.destinationStates.second.attempts).to.equal(2); expect(row?.deliveryState).to.equal('delivered');
    });
  });
});
