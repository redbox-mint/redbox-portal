import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { createShadowFingerprint } from '../../src/authorization';

describe('authorization shadow fingerprints', () => {
  it('hashes only bounded discrepancy fields deterministically', () => {
    const fingerprintA = createShadowFingerprint({
      routeId: 'GET:/api/records/:id',
      brandId: 'brand-a',
      principalCategory: 'authenticated',
      legacyAllowed: true,
      decision: {
        allowed: false,
        reasonCode: 'scope-missing',
      },
    });
    const fingerprintB = createShadowFingerprint({
      routeId: 'GET:/api/records/:id',
      brandId: 'brand-a',
      principalCategory: 'authenticated',
      legacyAllowed: true,
      decision: {
        allowed: false,
        reasonCode: 'scope-missing',
      },
    });

    assert.match(fingerprintA, /^[a-f0-9]{64}$/);
    assert.equal(fingerprintA, fingerprintB);
  });

  it('changes when a bounded discrepancy field changes', () => {
    const baseFingerprint = createShadowFingerprint({
      routeId: 'GET:/api/records/:id',
      brandId: 'brand-a',
      principalCategory: 'authenticated',
      legacyAllowed: true,
      decision: {
        allowed: false,
        reasonCode: 'scope-missing',
      },
    });
    const changedFingerprint = createShadowFingerprint({
      routeId: 'GET:/api/records/:id',
      brandId: 'brand-a',
      principalCategory: 'system-admin',
      legacyAllowed: true,
      decision: {
        allowed: false,
        reasonCode: 'scope-missing',
      },
    });

    assert.notEqual(baseFingerprint, changedFingerprint);
  });

  it('encodes tuple fields without delimiter collisions', () => {
    const routeContainsDelimiter = createShadowFingerprint({
      routeId: 'route|brand:brand',
      brandId: 'suffix',
      principalCategory: 'legacy-bearer',
      legacyAllowed: true,
      decision: {
        allowed: false,
        reasonCode: 'scope-missing',
      },
    });
    const brandContainsDelimiter = createShadowFingerprint({
      routeId: 'route',
      brandId: 'brand|brand:suffix',
      principalCategory: 'legacy-bearer',
      legacyAllowed: true,
      decision: {
        allowed: false,
        reasonCode: 'scope-missing',
      },
    });

    assert.notEqual(routeContainsDelimiter, brandContainsDelimiter);
  });
});
