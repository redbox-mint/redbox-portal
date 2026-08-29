import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  asScopeKey,
  asRoleKey,
  createCoreAuthorizationScopeSource,
  createScopeRegistry,
  freezeAuthorizationContext,
  scopeAuthorization,
  type AuthorizationContext,
  type AuthorizationDecision,
  type RolloutMode,
} from '../../src/authorization';
import {
  Services,
  type AuthorizationRolloutDependencies,
  type AuthorizationShadowMismatchInput,
} from '../../src/services/AuthorizationRolloutService';
import { routes } from '../../src/config/routes.config';
import { createMockSails } from './testHelper';

const REQUIRED_SCOPE = asScopeKey('record.read');

let originalSailsDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalSailsDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sails');
  const testSails = createMockSails();
  testSails.config = {
    ...testSails.config,
    authorization: { mode: 'legacy', collectLegacyEvidenceInEnforce: true },
    apiRoutesHooks: [],
    routes,
  };
  Reflect.set(globalThis, 'sails', testSails);
});

afterEach(() => {
  if (originalSailsDescriptor === undefined) {
    Reflect.deleteProperty(globalThis, 'sails');
    return;
  }
  Object.defineProperty(globalThis, 'sails', originalSailsDescriptor);
});

function context(active = true): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active, userId: 'user-1' },
    brand: { requestedIdentifier: 'default', id: 'brand-1', name: 'default', exists: true, authorized: true },
    grantedScopeKeys: [REQUIRED_SCOPE],
    effectiveScopeKeys: [REQUIRED_SCOPE],
  });
}

function request(): Sails.Req {
  return {
    method: 'GET',
    path: '/default/rdmp/api/records',
    headers: {},
    query: {},
    session: {} as Sails.Req['session'],
    isAuthenticated: (() => true) as Sails.Req['isAuthenticated'],
  } as Sails.Req;
}

function decision(allowed: boolean): AuthorizationDecision {
  return Object.freeze({
    allowed,
    reasonCode: allowed ? 'allowed' : 'scope-missing',
    requiredScope: REQUIRED_SCOPE,
    brandId: 'brand-1',
  });
}

function fixture(
  mode: RolloutMode,
  legacyAllowed: boolean,
  scopeAllowed: boolean,
  collectLegacyEvidenceInEnforce = true,
  evaluateLegacy: AuthorizationRolloutDependencies['evaluateLegacy'] = () => legacyAllowed
) {
  const mismatches: AuthorizationShadowMismatchInput[] = [];
  const registry = createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: 'test',
      definitions: [
        {
          key: REQUIRED_SCOPE,
          label: 'Read records',
          description: 'Read records.',
          risk: 'read',
        },
      ],
    },
  ]);
  const dependencies: AuthorizationRolloutDependencies = {
    getMode: () => mode,
    collectLegacyEvidenceInEnforce: () => collectLegacyEvidenceInEnforce,
    getRegistry: () => registry,
    authorizeScope: () => decision(scopeAllowed),
    evaluateLegacy,
    persistMismatch: async mismatch => {
      mismatches.push(mismatch);
    },
  };
  const service = new Services.AuthorizationRolloutService(dependencies);
  return { service, mismatches };
}

function evaluate(service: Services.AuthorizationRolloutService, resolvedContext = context()) {
  return service.evaluateRequest({
    req: request(),
    context: resolvedContext,
    authorization: scopeAuthorization(REQUIRED_SCOPE),
    routeId: 'GET /:branding/:portal/api/records (webservice/RecordController#listRecords)',
    requestId: 'request-1',
  });
}

describe('AuthorizationRolloutService', function () {
  it('enforces the legacy result in legacy and shadow modes for every allow/deny pairing', async function () {
    for (const mode of ['legacy', 'shadow'] as const) {
      for (const legacyAllowed of [false, true]) {
        for (const scopeAllowed of [false, true]) {
          const { service, mismatches } = fixture(mode, legacyAllowed, scopeAllowed);
          const result = evaluate(service);
          await Promise.resolve();

          assert.equal(result.allowed, legacyAllowed, `${mode}/${legacyAllowed}/${scopeAllowed}`);
          assert.equal(result.enforcedBy, 'legacy');
          assert.equal(mismatches.length, mode === 'shadow' && legacyAllowed !== scopeAllowed ? 1 : 0);
        }
      }
    }
  });

  it('makes the scope result authoritative in enforce mode and retains bounded rollback evidence', async function () {
    const { service, mismatches } = fixture('enforce', true, false);

    const result = evaluate(service);
    await Promise.resolve();

    assert.equal(result.allowed, false);
    assert.equal(result.enforcedBy, 'scope');
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].routeId.includes('/default/'), false);
    assert.equal(Object.hasOwn(mismatches[0], 'actorId'), false);
    assert.equal(Object.hasOwn(mismatches[0], 'token'), false);
  });

  it('does not invoke the legacy engine in enforce mode when rollback evidence is disabled', function () {
    const { service } = fixture('enforce', true, false, false, () => assert.fail('legacy authorization was evaluated'));

    const result = evaluate(service);

    assert.equal(result.allowed, false);
    assert.equal(result.enforcedBy, 'scope');
    assert.equal(result.legacyAllowed, undefined);
  });

  it('denies a missing declaration in enforce even when startup validation was bypassed', function () {
    const { service } = fixture('enforce', true, true);
    const result = service.evaluateRequest({
      req: request(),
      context: context(),
      routeId: 'GET /missing (MissingController#show)',
      requestId: 'request-2',
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reasonCode, 'scope-missing');
    assert.equal(result.scopeDecision.requiredScope, undefined);
  });

  it('fails startup validation when the merged Sails route table has no authorization declaration', function () {
    const originalRoutes = sails.config.routes;
    const originalHookProviders = sails.config.apiRoutesHooks;
    sails.config.routes = {
      ...routes,
      'get /unclassified': { controller: 'MissingController', action: 'show' },
    } as Sails.ConfigObject['routes'];
    sails.config.apiRoutesHooks = [];
    const service = new Services.AuthorizationRolloutService({
      getMode: () => 'legacy',
      getRegistry: () => createScopeRegistry([createCoreAuthorizationScopeSource('test')]),
    });

    try {
      assert.throws(
        () => service.validateRouteConfiguration(),
        /Missing authorization declaration: GET \/unclassified/u
      );
    } finally {
      sails.config.routes = originalRoutes;
      sails.config.apiRoutesHooks = originalHookProviders;
    }
  });

  it('applies inactive-principal security semantics in every mode', function () {
    for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
      const { service } = fixture(mode, true, true);
      const result = evaluate(service, context(false));

      assert.equal(result.allowed, false);
      assert.equal(result.enforcedBy, 'security-fix');
      assert.equal(result.reasonCode, 'principal-inactive');
    }
  });

  it('applies missing and unauthorized brand security semantics in every mode', function () {
    const brandStates = [
      { exists: false, authorized: false, reasonCode: 'brand-not-found' },
      { exists: true, authorized: false, reasonCode: 'brand-not-authorized' },
    ] as const;
    for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
      for (const brandState of brandStates) {
        const { service } = fixture(mode, true, true);
        const deniedContext = freezeAuthorizationContext({
          contextType: 'brand',
          principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'user-1' },
          brand: {
            requestedIdentifier: 'missing',
            exists: brandState.exists,
            authorized: brandState.authorized,
          },
        });

        const result = evaluate(service, deniedContext);

        assert.equal(result.allowed, false);
        assert.equal(result.enforcedBy, 'security-fix');
        assert.equal(result.reasonCode, brandState.reasonCode);
      }
    }
  });

  it("maps a protected system administrator to the active brand's legacy Admin role", function () {
    const originalServices = sails.services;
    let receivedRoleIds: string[] = [];
    sails.services = {
      brandingservice: {
        getBrandById: () => ({ id: 'brand-1', name: 'default' }),
        getBrand: () => ({ id: 'brand-1', name: 'default' }),
      },
      rolesservice: { getAdmin: () => ({ id: 'legacy-admin', name: 'Admin' }) },
      pathrulesservice: {
        getRulesFromPath: () => [{ id: 'rule-1' }],
        canRead: (_rules: unknown[], roles: Array<{ id: string }>) => {
          receivedRoleIds = roles.map(role => role.id);
          return roles.some(role => role.id === 'legacy-admin');
        },
      },
    };
    try {
      const systemContext = freezeAuthorizationContext({
        contextType: 'brand',
        principal: { category: 'system-admin', authMethod: 'session', active: true, userId: 'system-user' },
        brand: { id: 'brand-1', name: 'default', exists: true, authorized: true },
        roles: [
          {
            id: 'system-role',
            key: asRoleKey('system-administrator'),
            name: 'System Administrator',
            displayName: 'System Administrator',
            contextType: 'system',
            protectedKind: 'system-admin',
            implicit: false,
            assignmentCount: 1,
            assignmentsTruncated: false,
            assignments: [],
            effectiveScopeKeys: [REQUIRED_SCOPE],
            inactiveScopeKeys: [],
            missingScopeKeys: [],
          },
        ],
        grantedScopeKeys: [REQUIRED_SCOPE],
        effectiveScopeKeys: [REQUIRED_SCOPE],
      });
      const service = new Services.AuthorizationRolloutService({
        getMode: () => 'legacy',
        collectLegacyEvidenceInEnforce: () => false,
        authorizeScope: () => decision(true),
        persistMismatch: async () => undefined,
      });

      const result = evaluate(service, systemContext);

      assert.equal(result.allowed, true);
      assert.equal(receivedRoleIds.includes('legacy-admin'), true);
    } finally {
      sails.services = originalServices;
    }
  });

  it('does not let shadow persistence failure alter the enforced legacy result', async function () {
    const failing = new Services.AuthorizationRolloutService({
      getMode: () => 'shadow',
      collectLegacyEvidenceInEnforce: () => true,
      authorizeScope: () => decision(false),
      evaluateLegacy: () => true,
      persistMismatch: async () => {
        throw new Error('datastore unavailable');
      },
    });

    const result = evaluate(failing);
    await Promise.resolve();

    assert.equal(result.allowed, true);
    assert.equal(result.enforcedBy, 'legacy');
  });
});
