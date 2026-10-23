import { expect } from 'chai';
import { encodeSiem } from '../../src/persistence/siem/physical';
import { readProgress } from '../../src/services/siem/SiemDeliveryStore';

describe('SIEM persistence plain boundary', () => {
  const input = {
    eventId: 'e',
    brandId: 'tenant',
    eventType: 'test',
    category: 'authentication',
    severity: 'info',
    source: 'test',
    occurredAt: '2026-01-01T00:00:00.000Z',
    deliveryState: 'pending',
  };
  it('preserves loaded numeric coercion for JSON scalars', () => {
    for (const [value, expected] of [
      [true, 1],
      [false, 0],
      ['2', 2],
    ] as const) {
      const encoded = encodeSiem('siemdeliveryattempt', { durationMs: value }, true);
      expect(encoded.durationMs).to.equal(expected);
    }
    for (const value of [' 2 ', '', null, {}, [], NaN, Infinity])
      expect(() => encodeSiem('siemdeliveryattempt', { durationMs: value }, true)).to.throw();
  });
  it('keeps routing references and lease times as strings and preserves null/default shapes', () => {
    const row = encodeSiem('securityevent', input);
    expect(row.brandId).to.equal('tenant');
    expect(row.leaseExpiresAt).to.equal(null);
    expect(row.actor).to.equal(null);
    expect(row.portalId).to.equal('');
    expect(encodeSiem('securityevent', { leaseExpiresAt: '2026-01-01T00:00:00.000Z' }, true).leaseExpiresAt).to.be.a(
      'string'
    );
  });
  it('rejects nested undefined and native values without serializing missed producers', () => {
    for (const payload of [{ optional: undefined }, { date: new Date() }, { value: NaN }])
      expect(() => encodeSiem('securityevent', { ...input, payload })).to.throw('plain JSON');
    expect(() => encodeSiem('securityevent', { ...input, source: null })).to.throw('Invalid J3 field');
  });
  it('returns per-destination progress with absent optional properties omitted', () => {
    expect(readProgress({ status: 'success', attempts: 1 })).to.deep.equal({ status: 'success', attempts: 1 });
    expect(readProgress('success')).to.deep.equal({ status: 'success', attempts: 0 });
    expect(readProgress({ status: 'unknown', attempts: 1 })).to.equal(undefined);
  });
});
