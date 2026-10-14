import { randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { normalizeSiemConfiguration } from '@researchdatabox/sails-ng-common';

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('Expected API object');
  return value;
}

describe('SIEM authenticated HTTP API', function () {
  const prefix = `siem-api-${randomUUID()}`;
  const eventIds = Array.from({ length: 4 }, (_, index) => `${prefix}-${index}`);
  let token: string;
  let brand: ReturnType<typeof BrandingService.getDefault>;
  let originalConfig: ReturnType<typeof normalizeSiemConfiguration>;

  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${sails.config.port}/default/rdmp/api/siem/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'X-ReDBox-Api-Version': '2.0', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await response.json();
    const envelope = object(json);
    return { status: response.status, data: object(envelope.data ?? envelope) };
  }

  before(async function () {
    brand = BrandingService.getDefault();
    const config = AppConfigService.getAppConfigurationForBrand(brand.name);
    const configuredToken: unknown = _.get(config, 'auth.local.default.token');
    if (typeof configuredToken !== 'string' || !configuredToken) throw new Error('Missing integration admin token');
    token = configuredToken;
    originalConfig = normalizeSiemConfiguration(Reflect.get(config, 'siem') ?? {});
    for (const [index, eventId] of eventIds.entries()) {
      await SecurityEvent.create({
        eventId,
        brandId: brand.id,
        eventType: prefix,
        category: 'authentication',
        severity: 'warning',
        occurredAt: `2026-01-01T00:00:0${index}.000Z`,
        source: 'SiemApi.test',
        deliveryState: 'failed',
      });
      await SiemDeliveryAttempt.create({
        eventId: eventIds[0],
        brandId: brand.id,
        destinationId: prefix,
        adapterType: 'cef',
        attemptNumber: index + 1,
        status: 'failed',
        startedAt: `2026-01-01T00:00:0${index}.000Z`,
      });
    }
    await SecurityEvent.create({
      eventId: `${prefix}-foreign`,
      brandId: 'foreign-brand',
      eventType: prefix,
      category: 'authentication',
      severity: 'warning',
      occurredAt: '2026-01-01T00:00:09.000Z',
      source: 'SiemApi.test',
      deliveryState: 'failed',
    });
  });

  after(async function () {
    await SecurityEvent.destroy({ eventId: [...eventIds, `${prefix}-foreign`] });
    await SiemDeliveryAttempt.destroy({ eventId: eventIds[0] });
    await AppConfigService.createOrUpdateConfig(brand, 'siem', { ...originalConfig });
  });

  it('returns disjoint event pages for the failed filter and enforces request brand', async function () {
    const pages = [];
    for (const offset of [0, 2]) {
      const result = await request(
        `events?eventType=${prefix}&deliveryState=failed&limit=2&offset=${offset}&brandId=foreign-brand`
      );
      expect(result.status).to.equal(200);
      expect(result.data.total).to.equal(4);
      const rows = result.data.rows;
      if (!Array.isArray(rows)) throw new Error('Expected events');
      expect(rows).to.have.length(2);
      expect(rows.every(row => object(row).brandId === brand.id)).to.equal(true);
      pages.push(rows.map(row => object(row).eventId));
    }
    expect(pages.flat()).to.deep.equal([...eventIds].reverse());
  });

  it('returns disjoint persisted delivery-attempt pages', async function () {
    const numbers: unknown[] = [];
    for (const offset of [0, 2]) {
      const result = await request(`delivery-status?eventId=${eventIds[0]}&status=failed&limit=2&offset=${offset}`);
      expect(result.status).to.equal(200);
      expect(result.data.total).to.equal(4);
      const rows = result.data.rows;
      if (!Array.isArray(rows)) throw new Error('Expected attempts');
      numbers.push(...rows.map(row => object(row).attemptNumber));
    }
    expect(numbers).to.deep.equal([4, 3, 2, 1]);
  });

  it('masks custom credentials and leaves persisted config unchanged after invalid saves', async function () {
    const config = normalizeSiemConfiguration({
      destinations: [
        {
          id: prefix,
          adapterType: 'cef',
          enabled: false,
          endpointUrl: 'https://collector.example/ingest',
          token: 'test-token',
          headers: { 'X-Custom-Credential': 'test-secret' },
        },
      ],
    });
    const saved = await request('config', 'PUT', config);
    expect(saved.status).to.equal(200);
    expect(JSON.stringify(saved.data)).not.to.include('test-secret');
    const before = await request('config');
    const invalid = await request('config', 'PUT', { redaction: { maxPayloadBytes: 256 } });
    expect(invalid.status).to.equal(400);
    expect((await request('config')).data).to.deep.equal(before.data);
    const destinations = before.data.destinations;
    if (!Array.isArray(destinations)) throw new Error('Expected destinations');
    const masked = object(destinations[0]);
    const moved = await request('config', 'PUT', {
      ...before.data,
      destinations: [{ ...masked, endpointUrl: 'https://other.example/ingest' }],
    });
    expect(moved.status).to.equal(400);
    expect((await request('config')).data).to.deep.equal(before.data);
  });
});
