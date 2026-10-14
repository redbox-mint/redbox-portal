import { expect } from 'chai';
import * as lodash from 'lodash';
import * as sinon from 'sinon';
import { createServer } from 'node:http';
import { Services as Capture } from '../../src/services/SecurityEventService';
import { Services as Forwarding } from '../../src/services/SiemForwardingService';
import { DEFAULT_SIEM_REDACTION } from '../../src/configmodels/SiemConfiguration';
import { redactForSiem } from '../../src/services/siem/SiemPayloadRedactor';
import type { SecurityEventAttributes } from '../../src/waterline-models/SecurityEvent';
import { createMockSails } from './testHelper';

describe('SIEM ownership and primitive privacy boundaries', () => {
  const originals = new Map<string, unknown>();
  const keys = ['_', 'sails', 'BrandingService', 'AppConfigService', 'AgendaQueueService', 'Record', 'SecurityEvent'];
  let capture: Capture.SecurityEventService;
  let queued: Array<{ event: SecurityEventAttributes }>;
  let lookup: sinon.SinonStub;
  beforeEach(() => {
    keys.forEach(key => originals.set(key, Reflect.get(globalThis, key)));
    queued = [];
    capture = new Capture.SecurityEventService();
    lookup = sinon.stub().returns({ siem: { enabled: true } });
    Object.assign(globalThis, {
      _: lodash,
      sails: createMockSails(),
      BrandingService: {
        getBrandById: (id: string) => (id === 'other-id' ? { id, name: 'other' } : undefined),
        getBrand: (name: string) => (name === 'other' ? { id: 'other-id', name } : undefined),
      },
      AppConfigService: { getAppConfigurationForBrand: lookup },
      AgendaQueueService: {
        now: async (_name: string, data: { event: SecurityEventAttributes }) => {
          queued.push(data);
        },
      },
      Record: { findOne: async () => undefined },
    });
  });
  afterEach(() => {
    originals.forEach((value, key) =>
      value === undefined ? Reflect.deleteProperty(globalThis, key) : Reflect.set(globalThis, key, value)
    );
    sinon.restore();
  });
  it('rejects unresolved ownership at every public capture entry before default config lookup', async () => {
    await capture.emitSecurityEvent({
      brandId: 'unknown',
      eventType: 'record.deleted',
      category: 'recordLifecycle',
      source: 'test',
    });
    await capture.emitFromUserAudit({ id: 'u1' }, 'login', { brandId: 'unknown' });
    await capture.emitFromRecordAudit({ action: 'deleted', record: { metaMetadata: { brandId: 'unknown' } } });
    await capture.emitFromAttachmentAudit({ brandId: 'unknown', action: 'download' });
    await capture.emitFromIntegrationAudit({ brandId: 'unknown', status: 'failed' });
    expect(lookup.called).to.equal(false);
    expect(queued).to.have.length(0);
    await capture.emitFromUserAudit({ id: 'u1' }, 'login', { brandId: 'other' });
    expect(lookup.calledOnceWithExactly('other')).to.equal(true);
    expect(queued[0].event.brandId).to.equal('other-id');
  });
  for (const serialized of [false, true]) {
    it(`redacts primitive emails in ${serialized ? 'serialized' : 'structured'} attributes before storage and delivery`, async () => {
      const attributes = {
        aliases: ['private@example.test', ['second@example.test', 'safe', 7, false]],
        token: 'secret',
      };
      await capture.emitFromUserAudit(
        { id: 'u1', additionalAttributes: serialized ? JSON.stringify(attributes) : attributes },
        'login',
        { brandId: 'other-id' }
      );
      const event = queued[0].event;
      expect(event.actor?.additionalAttributes).to.deep.equal({
        aliases: ['[REDACTED]', ['[REDACTED]', 'safe', 7, false]],
        token: '[REDACTED]',
      });
      expect(JSON.stringify(event)).not.to.include('@example.test');
      expect(JSON.stringify(event)).not.to.include('secret');
      const delivery = redactForSiem(event, DEFAULT_SIEM_REDACTION);
      expect(JSON.stringify(delivery)).not.to.include('@example.test');
      expect(delivery.actor).to.deep.equal(event.actor);
    });
  }
  it('retains primitive emails on opt-in and keeps arbitrary JSON strings opaque', () => {
    const value = { payload: { aliases: ['private@example.test'], ordinary: '{"aliases":["opaque@example.test"]}' } };
    expect(redactForSiem(value, DEFAULT_SIEM_REDACTION).payload).to.deep.equal({
      aliases: ['[REDACTED]'],
      ordinary: value.payload.ordinary,
    });
    expect(redactForSiem(value, { ...DEFAULT_SIEM_REDACTION, includeActorEmail: true })).to.deep.equal(value);
  });
  it('never sends a stored unknown-brand event to the inherited default collector', async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.end('{}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP receiver');
      lookup.returns({
        siem: {
          enabled: true,
          destinations: [
            {
              id: 'default',
              name: 'default',
              enabled: true,
              endpointUrl: `http://127.0.0.1:${address.port}`,
              adapterType: 'splunk-hec-json',
            },
          ],
        },
      });
      const stored: SecurityEventAttributes = {
        id: 'stored',
        eventId: 'event-unknown',
        brandId: 'unknown',
        eventType: 'record.deleted',
        category: 'recordLifecycle',
        severity: 'info',
        occurredAt: new Date().toISOString(),
        source: 'RecordsService',
        deliveryState: 'pending',
      };
      const collection = {
        find: (filter: { deliveryState?: string }) => ({
          sort: () => ({
            limit: () => ({ toArray: async () => (filter.deliveryState === 'deadLetter' ? [] : [stored]) }),
          }),
        }),
        updateOne: async (_filter: object, update: { $set: Partial<SecurityEventAttributes> }) => {
          Object.assign(stored, update.$set);
          return { matchedCount: 1 };
        },
        findOne: async () => stored,
        deleteMany: async () => ({}),
      };
      Reflect.set(globalThis, 'SecurityEvent', {
        tableName: 'securityevent',
        getDatastore: () => ({ manager: { collection: () => collection } }),
      });
      await new Forwarding.SiemForwardingService().forwardSecurityEvents({ attrs: { data: { brandId: 'unknown' } } });
      expect(lookup.called).to.equal(false);
      expect(requests).to.equal(0);
      expect(stored.deliveryState).to.equal('ignored');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
