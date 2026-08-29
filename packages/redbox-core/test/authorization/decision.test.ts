import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { asScopeKey, createScopeRegistry, decideAuthorization } from '../../src/authorization';

describe('authorization decisions', () => {
  const scopeRegistry = createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0',
      definitions: [
        {
          key: asScopeKey('record.read'),
          label: 'Read records',
          description: 'Allows reading records in an authorized brand.',
          risk: 'read',
        },
        {
          key: asScopeKey('record.update'),
          label: 'Update records',
          description: 'Allows updating records in an authorized brand.',
          risk: 'write',
        },
        {
          key: asScopeKey('record.legacy-read'),
          label: 'Legacy record read',
          description: 'Legacy compatibility scope.',
          risk: 'read',
          deprecated: true,
          replacementKey: asScopeKey('record.read'),
        },
      ],
    },
  ]);

  function createAllowedInput() {
    return {
      requiredScope: asScopeKey('record.read'),
      registry: scopeRegistry,
      principal: {
        category: 'authenticated' as const,
        authMethod: 'session' as const,
        active: true,
        effectiveScopeKeys: [asScopeKey('record.read')],
      },
      brand: {
        brandId: 'brand-a',
        exists: true,
        authorized: true,
      },
      tokenCeiling: {
        scopeKeys: [asScopeKey('record.read')],
      },
      resource: {
        found: true,
        brandMatches: true,
        recordAcl: 'allowed' as const,
      },
    };
  }

  it('allows only when every gate passes', () => {
    const decision = decideAuthorization({
      ...createAllowedInput(),
      includeEvidence: true,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.reasonCode, 'allowed');
    assert.equal(decision.requiredScope, 'record.read');
    assert.equal(decision.brandId, 'brand-a');
    assert.deepEqual(decision.evidence, {
      requiredScopeActive: true,
      principalActive: true,
      principalHasRequiredScope: true,
      brandKnown: true,
      brandAuthorized: true,
      tokenAllowsRequiredScope: true,
      resourceFound: true,
      resourceBrandMatches: true,
      recordAclAllowsAction: true,
    });
  });

  it('denies orphaned or missing runtime scopes before user-specific checks', () => {
    const decision = decideAuthorization({
      ...createAllowedInput(),
      requiredScope: asScopeKey('record.legacy-read'),
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, 'scope-orphaned');

    const missing = decideAuthorization({
      ...createAllowedInput(),
      requiredScope: asScopeKey('record.publish'),
    });
    assert.equal(missing.reasonCode, 'scope-missing');
  });

  it('returns stable primary reason codes for each remaining denial gate', () => {
    const cases = [
      {
        description: 'principal inactivity',
        input: {
          principal: {
            category: 'authenticated' as const,
            authMethod: 'session' as const,
            active: false,
            effectiveScopeKeys: [asScopeKey('record.read')],
          },
        },
        reasonCode: 'principal-inactive',
      },
      {
        description: 'missing scope membership',
        input: {
          principal: {
            category: 'authenticated' as const,
            authMethod: 'session' as const,
            active: true,
            effectiveScopeKeys: [asScopeKey('record.update')],
          },
        },
        reasonCode: 'scope-missing',
      },
      {
        description: 'unknown brand',
        input: {
          brand: {
            brandId: 'brand-a',
            exists: false,
            authorized: true,
          },
        },
        reasonCode: 'brand-not-found',
      },
      {
        description: 'unauthorized brand',
        input: {
          brand: {
            brandId: 'brand-a',
            exists: true,
            authorized: false,
          },
        },
        reasonCode: 'brand-not-authorized',
      },
      {
        description: 'token scope ceiling',
        input: {
          tokenCeiling: {
            scopeKeys: [asScopeKey('record.update')],
          },
        },
        reasonCode: 'token-scope-ceiling',
      },
      {
        description: 'missing resource',
        input: {
          resource: {
            found: false,
            brandMatches: true,
            recordAcl: 'allowed' as const,
          },
        },
        reasonCode: 'resource-not-found',
      },
      {
        description: 'cross-brand resource mismatch',
        input: {
          resource: {
            found: true,
            brandMatches: false,
            recordAcl: 'allowed' as const,
          },
        },
        reasonCode: 'resource-brand-mismatch',
      },
      {
        description: 'record ACL denial',
        input: {
          resource: {
            found: true,
            brandMatches: true,
            recordAcl: 'denied' as const,
          },
        },
        reasonCode: 'record-acl-denied',
      },
    ] as const;

    for (const testCase of cases) {
      const decision = decideAuthorization({
        ...createAllowedInput(),
        ...testCase.input,
      });

      assert.equal(
        decision.reasonCode,
        testCase.reasonCode,
        `expected ${testCase.description} to return ${testCase.reasonCode}`
      );
      assert.equal(decision.allowed, false);
    }
  });

  it('keeps authentication ahead of authority, and authority ahead of every resource gate', () => {
    const unprivileged = {
      category: 'authenticated' as const,
      authMethod: 'session' as const,
      active: true,
      effectiveScopeKeys: [],
    };

    const inactiveCrossBrand = decideAuthorization({
      ...createAllowedInput(),
      principal: {
        category: 'legacy-bearer',
        authMethod: 'bearer',
        active: false,
        effectiveScopeKeys: [],
      },
      resource: { found: true, brandMatches: false },
    });
    assert.equal(inactiveCrossBrand.reasonCode, 'principal-inactive');

    // A caller that has not passed the action gate learns nothing about the resource:
    // absent, cross-brand, and present-but-forbidden must all deny identically, or the
    // reason code becomes an existence oracle for an unauthorized caller.
    for (const resource of [
      { found: false, brandMatches: true },
      { found: true, brandMatches: false },
      { found: true, brandMatches: true },
    ]) {
      const decision = decideAuthorization({ ...createAllowedInput(), principal: unprivileged, resource });
      assert.equal(decision.allowed, false);
      assert.equal(decision.reasonCode, 'scope-missing');
    }

    // Once the action gate passes, the resource gates report their specific reasons so
    // the service layer can map a cross-brand identifier onto an opaque `404`.
    const privilegedCrossBrand = decideAuthorization({
      ...createAllowedInput(),
      resource: { found: true, brandMatches: false },
    });
    assert.equal(privilegedCrossBrand.reasonCode, 'resource-brand-mismatch');

    const privilegedMissing = decideAuthorization({
      ...createAllowedInput(),
      resource: { found: false, brandMatches: true },
    });
    assert.equal(privilegedMissing.reasonCode, 'resource-not-found');
  });

  it('omits internal evidence unless the caller explicitly requests it', () => {
    const decision = decideAuthorization(createAllowedInput());

    assert.equal(decision.evidence, undefined);
  });
});
