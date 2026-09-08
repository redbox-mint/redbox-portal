import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS,
  AUTHORIZATION_MISMATCH_DEFECT_CLASSIFICATIONS,
  asScopeKey,
  asRoleKey,
  createCoreAuthorizationScopeSource,
  createScopeRegistry,
  freezeAuthorizationContext,
  preAuthAuthorization,
  publicAuthorization,
  scopeAuthorization,
  type AuthorizationContext,
  type AuthorizationDecision,
  type RolloutMode,
} from '../../src/authorization';
import {
  Services,
  persistShadowMismatch,
  type AuthorizationRolloutDependencies,
  type AuthorizationShadowMismatchInput,
} from '../../src/services/AuthorizationRolloutService';
import { Services as authorizationServices } from '../../src/services/AuthorizationService';
import type { AuthorizationAuditEventInput } from '../../src/services/AuthorizationAuditService';
import { routes } from '../../src/config/routes.config';
import { createMockSails } from './testHelper';
import { ALL_SHADOW_CLASSIFICATION_FIXTURES } from '../fixtures/authorization-shadow-classification.fixtures';

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
  evaluateLegacy: AuthorizationRolloutDependencies['evaluateLegacy'] = () => legacyAllowed,
  authorizeScope: AuthorizationRolloutDependencies['authorizeScope'] = () => decision(scopeAllowed)
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
    getBuildVersion: () => 'test',
    getMode: () => mode,
    collectLegacyEvidenceInEnforce: () => collectLegacyEvidenceInEnforce,
    getRegistry: () => registry,
    authorizeScope,
    evaluateLegacy,
    persistMismatch: async mismatch => {
      mismatches.push(mismatch);
    },
    appendAuditEvent: async () => undefined,
    runAtomic: async () => {
      throw new Error('fixture runAtomic must not run during request evaluation.');
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
  const authorizationService = new authorizationServices.AuthorizationService({
    getRegistry: () => createScopeRegistry([createCoreAuthorizationScopeSource('test')]),
  });
  const authorizeScope: AuthorizationRolloutDependencies['authorizeScope'] = (resolvedContext, authorization) =>
    authorizationService.authorizeAction(resolvedContext, authorization.scope);
  const ceilings = [
    { name: 'empty', ceiling: [], permits: false },
    { name: 'restricted', ceiling: [asScopeKey('record.update')], permits: false },
    { name: 'permitted', ceiling: [REQUIRED_SCOPE], permits: true },
    { name: 'absent', ceiling: undefined, permits: true },
  ] as const;

  for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
    for (const { name, ceiling, permits } of ceilings) {
      it(`applies the ${name} bearer ceiling independently of grants in ${mode}`, async function () {
        for (const legacyAllowed of [true, false]) {
          for (const scopeGranted of [true, false]) {
            const { service, mismatches } = fixture(mode, legacyAllowed, scopeGranted, true, undefined, authorizeScope);
            const resolvedContext = freezeAuthorizationContext({
              ...context(),
              principal: { ...context().principal, authMethod: 'bearer' },
              grantedScopeKeys: scopeGranted ? [REQUIRED_SCOPE] : [],
              effectiveScopeKeys: scopeGranted && permits ? [REQUIRED_SCOPE] : [],
              tokenScopeCeiling: ceiling,
            });
            const result = evaluate(service, resolvedContext);
            await Promise.resolve();

            assert.equal(result.allowed, permits && (mode === 'enforce' ? scopeGranted : legacyAllowed));
            assert.equal(result.scopeDecision.allowed, permits && scopeGranted);
            assert.equal(
              result.scopeDecision.reasonCode,
              !scopeGranted ? 'scope-missing' : permits ? 'allowed' : 'token-scope-ceiling'
            );
            assert.equal(result.legacyAllowed, legacyAllowed);
            if (!permits) {
              assert.equal(result.reasonCode, 'token-scope-ceiling');
              assert.equal(result.enforcedBy, 'security-fix');
            } else {
              assert.equal(result.enforcedBy, mode === 'enforce' ? 'scope' : 'legacy');
              assert.equal(
                result.reasonCode,
                result.allowed ? 'allowed' : mode === 'enforce' ? 'scope-missing' : 'legacy-path-denied'
              );
            }
            assert.equal(
              mismatches.length,
              mode !== 'legacy' && legacyAllowed !== result.scopeDecision.allowed ? 1 : 0
            );
          }
        }
      });
    }

    it(`preserves unscoped route declarations with an empty ceiling in ${mode}`, function () {
      const resolvedContext = freezeAuthorizationContext({
        ...context(),
        principal: { ...context().principal, authMethod: 'bearer' },
        tokenScopeCeiling: [],
        effectiveScopeKeys: [],
      });
      for (const authorization of [publicAuthorization('Public metadata'), preAuthAuthorization('Login'), undefined]) {
        for (const legacyAllowed of [false, true]) {
          const { service } = fixture(mode, legacyAllowed, true, false, undefined, authorizeScope);
          const result = service.evaluateRequest({
            req: request(),
            context: resolvedContext,
            authorization,
            routeId: 'GET /unscoped (ExampleController#show)',
            requestId: 'unscoped-request',
          });
          assert.equal(result.allowed, mode === 'enforce' ? authorization !== undefined : legacyAllowed);
          assert.equal(result.enforcedBy, mode === 'enforce' ? 'scope' : 'legacy');
        }
      }
    });
  }

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

  it('ignores a missing legacy PathRule in enforce while preserving legacy-mode compatibility', function () {
    const originalServices = sails.services;
    let pathRuleLookups = 0;
    sails.services = {
      brandingservice: {
        getBrandById: () => ({ id: 'brand-1', name: 'default' }),
        getBrand: () => ({ id: 'brand-1', name: 'default' }),
      },
      rolesservice: { getAdmin: () => undefined },
      pathrulesservice: {
        getRulesFromPath: () => {
          pathRuleLookups += 1;
          return null;
        },
        canRead: () => assert.fail('A missing legacy PathRule must not call canRead.'),
      },
    };
    const dependencies = {
      collectLegacyEvidenceInEnforce: () => false,
      getRegistry: () => createScopeRegistry([createCoreAuthorizationScopeSource('test')]),
      authorizeScope: () => decision(false),
      persistMismatch: async () => undefined,
    };

    try {
      const enforce = new Services.AuthorizationRolloutService({ ...dependencies, getMode: () => 'enforce' });
      const enforceResult = evaluate(enforce);
      assert.equal(enforceResult.allowed, false);
      assert.equal(enforceResult.enforcedBy, 'scope');
      assert.equal(pathRuleLookups, 0);

      const legacy = new Services.AuthorizationRolloutService({ ...dependencies, getMode: () => 'legacy' });
      const legacyResult = evaluate(legacy);
      assert.equal(legacyResult.allowed, true);
      assert.equal(legacyResult.enforcedBy, 'legacy');
      assert.equal(pathRuleLookups, 1);
    } finally {
      sails.services = originalServices;
    }
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
    } as unknown as Sails.ConfigObject['routes'];
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
        canRead: (...args: unknown[]) => {
          const roles = args[1] as Array<{ id: string }>;
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

  describe('shadow mismatch acknowledgement and retention', function () {
    const FINGERPRINT = 'a'.repeat(64);
    const UNRESOLVED_OR_UNAPPROVED = {
      $and: [
        {
          $or: [
            { resolvedAt: null },
            { resolutionClassification: { $nin: [...AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS] } },
          ],
        },
        {
          $or: [
            { remediationStatus: { $ne: 'verified' } },
            { remediationEvidenceFingerprint: { $in: [null, ''] } },
            { remediationVerifiedAt: { $in: [null, ''] } },
            { resolutionClassification: { $nin: [...AUTHORIZATION_MISMATCH_DEFECT_CLASSIFICATIONS] } },
          ],
        },
      ],
    };
    let updateOne: { calledWith: unknown[]; resolves: unknown };
    let collection: Record<string, unknown>;
    let datastoreCollectionCalls: number;
    let originalDescriptor: PropertyDescriptor | undefined;

    beforeEach(function () {
      originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AuthorizationShadowMismatch');
      updateOne = { calledWith: [], resolves: { matchedCount: 1 } };
      collection = {};
      datastoreCollectionCalls = 0;
      Reflect.set(globalThis, 'AuthorizationShadowMismatch', {
        tableName: 'authorizationshadowmismatch',
        getDatastore: () => ({
          manager: {
            collection: () => {
              datastoreCollectionCalls += 1;
              return collection;
            },
          },
        }),
      });
    });

    afterEach(function () {
      if (originalDescriptor === undefined) Reflect.deleteProperty(globalThis, 'AuthorizationShadowMismatch');
      else Object.defineProperty(globalThis, 'AuthorizationShadowMismatch', originalDescriptor);
    });

    function transactionConnection(): Sails.Connection {
      return { collection: () => collection } as Sails.Connection;
    }

    function installCollection(overrides: Record<string, unknown> = {}): void {
      Object.assign(collection, {
        updateOne: async (filter: unknown, update: unknown) => {
          updateOne.calledWith.push({ filter, update });
          return updateOne.resolves;
        },
        find: () => ({
          limit: () => ({ toArray: async () => [{ _id: 'row-1' }, { _id: 'row-2' }] }),
        }),
        deleteMany: async () => ({ deletedCount: 2 }),
        ...overrides,
      });
    }

    function assertRetentionFilter(filter: unknown, ids?: readonly string[]): void {
      assert.ok(typeof filter === 'object' && filter !== null);
      assert.deepEqual(Reflect.get(filter, 'resolvedAt'), { $ne: null });
      assert.deepEqual(Reflect.get(filter, 'resolutionClassification'), {
        $in: [...AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS],
      });
      assert.ok(typeof Reflect.get(filter, 'lastSeenAt').$lt === 'string');
      if (ids !== undefined) assert.deepEqual(Reflect.get(filter, '_id'), { $in: ids });
    }

    it('excludes every defect, investigation, unclassified and reopened row from retention', async function () {
      const old = '2000-01-01T00:00:00.000Z';
      const rows = [
        ...ALL_SHADOW_CLASSIFICATION_FIXTURES.flatMap(({ classification }) => [
          { _id: classification, resolutionClassification: classification, resolvedAt: old, lastSeenAt: old },
          {
            _id: `open-${classification}`,
            resolutionClassification: classification,
            resolvedAt: null,
            lastSeenAt: old,
          },
        ]),
        { _id: 'unclassified', resolutionClassification: undefined, resolvedAt: old, lastSeenAt: old },
        { _id: 'unknown', resolutionClassification: 'unknown-legacy-label', resolvedAt: old, lastSeenAt: old },
        {
          _id: 'recent',
          resolutionClassification: 'intentional-product-change',
          resolvedAt: old,
          lastSeenAt: '2999-01-01T00:00:00.000Z',
        },
      ];
      type Filter = {
        resolvedAt: { $ne: null };
        resolutionClassification: { $in: readonly string[] };
        lastSeenAt: { $lt: string };
        _id?: { $in: readonly string[] };
      };
      const matches = (row: (typeof rows)[number], filter: Filter) =>
        row.resolvedAt != null &&
        typeof row.resolutionClassification === 'string' &&
        filter.resolutionClassification.$in.includes(row.resolutionClassification) &&
        row.lastSeenAt < filter.lastSeenAt.$lt &&
        (filter._id === undefined || filter._id.$in.includes(row._id));
      let deleted: string[] = [];
      installCollection({
        find: (filter: Filter) => {
          assertRetentionFilter(filter);
          return {
            limit: (limit: number) => ({
              toArray: async () => rows.filter(row => matches(row, filter)).slice(0, limit),
            }),
          };
        },
        deleteMany: async (filter: Filter) => {
          assertRetentionFilter(filter);
          // A recurrence between selection and deletion must also be protected.
          const recurring = rows.find(row => row._id === 'intentional-product-change');
          assert.ok(recurring);
          recurring.resolvedAt = null;
          deleted = rows.filter(row => matches(row, filter)).map(row => row._id);
          return { deletedCount: deleted.length };
        },
      });
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => undefined,
        runAtomic: async work => work(transactionConnection()),
      });
      const result = await service.retainResolvedShadowMismatches({
        olderThanDays: 30,
        retainedBy: 'operator-1',
        reason: 'retention window elapsed',
      });
      assert.deepEqual(deleted, [
        'approved-legacy-security-bug',
        'approved-security-difference',
        'expected-legacy-gap',
      ]);
      assert.deepEqual(result, { deleted: 3, truncated: false });
    });

    for (const { classification } of ALL_SHADOW_CLASSIFICATION_FIXTURES) {
      for (const duplicateFirstObservation of [false, true]) {
        it(`automatically reopens ${classification} and clears all resolution evidence${duplicateFirstObservation ? ' after an upsert race' : ''}`, async function () {
          const row: Record<string, unknown> = {
            count: 3,
            firstSeenAt: '2026-01-01T00:00:00.000Z',
            resolvedAt: '2026-01-02T00:00:00.000Z',
            resolvedBy: 'previous-operator',
            resolutionReason: 'previous review',
            resolutionClassification: classification,
          };
          let calls = 0;
          installCollection({
            updateOne: async (
              _filter: unknown,
              update: { $set: Record<string, unknown>; $unset: Record<string, unknown>; $inc: { count: number } },
              options: { upsert: boolean }
            ) => {
              calls += 1;
              if (duplicateFirstObservation && calls === 1) throw { code: 11000 };
              assert.equal(options.upsert, !duplicateFirstObservation);
              Object.assign(row, update.$set);
              for (const field of Object.keys(update.$unset)) delete row[field];
              row.count = Number(row.count) + update.$inc.count;
              return { matchedCount: 1 };
            },
          });
          await persistShadowMismatch(
            {
              routeId: 'GET /:branding/:portal/api/records',
              brandId: 'brand-1',
              principalCategory: 'authenticated',
              legacyAllowed: true,
              decision: decision(false),
              requestId: 'new-request',
            },
            new Date('2026-02-01T00:00:00.000Z')
          );
          for (const field of ['resolvedAt', 'resolvedBy', 'resolutionReason', 'resolutionClassification']) {
            assert.equal(Object.hasOwn(row, field), false, `${field} must be cleared on recurrence`);
          }
          assert.equal(row.count, 4);
          assert.equal(row.firstSeenAt, '2026-01-01T00:00:00.000Z');
          assert.equal(row.lastSeenAt, '2026-02-01T00:00:00.000Z');
          assert.equal(row.sampleRequestId, 'new-request');
          assert.equal(calls, duplicateFirstObservation ? 2 : 1);
        });
      }
    }

    it('lists unresolved mismatches with bounded fingerprint-ordered pagination', async function () {
      const row = (fingerprint: string) => ({
        fingerprint,
        routeId: 'GET /:branding/:portal/admin (AdminController#index)',
        brandId: 'brand-1',
        legacyOutcome: 'allow',
        scopeOutcome: 'deny',
        reasonCode: 'scope-missing',
        principalCategory: 'authenticated',
        count: 2,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-01-02T00:00:00.000Z',
        sampleRequestId: 'request-1',
        resolvedAt: null,
      });
      let captured: { filter: unknown; options: unknown; limit: unknown } | undefined;
      installCollection({
        find: (filter: unknown, options: unknown) => ({
          limit: (limit: unknown) => ({
            toArray: async () => {
              captured = { filter, options, limit };
              return [row('a'.repeat(64)), row('b'.repeat(64))];
            },
          }),
        }),
      });
      const service = new Services.AuthorizationRolloutService();

      const result = await service.listUnresolvedShadowMismatches({ limit: 1 });

      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].fingerprint, 'a'.repeat(64));
      assert.equal(result.truncated, true);
      assert.equal(result.nextCursor, 'a'.repeat(64));
      assert.deepEqual(captured?.filter, UNRESOLVED_OR_UNAPPROVED);
      assert.deepEqual((captured?.options as { sort?: unknown })?.sort, { fingerprint: 1 });
      assert.equal(captured?.limit, 2);
      assert.equal(Object.hasOwn(result.items[0], 'resolvedBy'), false);
    });

    it('paginates past a fingerprint cursor and rejects unbounded list requests', async function () {
      let capturedFilter: unknown;
      installCollection({
        find: (filter: unknown) => ({
          limit: () => ({
            toArray: async () => {
              capturedFilter = filter;
              return [];
            },
          }),
        }),
      });
      const service = new Services.AuthorizationRolloutService();

      const result = await service.listUnresolvedShadowMismatches({ limit: 50, cursor: 'a'.repeat(64) });

      assert.deepEqual(result, { items: [], truncated: false });
      assert.deepEqual(capturedFilter, { ...UNRESOLVED_OR_UNAPPROVED, fingerprint: { $gt: 'a'.repeat(64) } });

      await assert.rejects(service.listUnresolvedShadowMismatches({ limit: 0 }), /bounded/);
      await assert.rejects(service.listUnresolvedShadowMismatches({ limit: 201 }), /bounded/);
      await assert.rejects(service.listUnresolvedShadowMismatches({ cursor: 'not-a-fingerprint' }), /cursor/);
    });

    it('acknowledges one unresolved mismatch with bounded operator identity and reason', async function () {
      installCollection();
      const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async (input, outcome) => {
          audits.push({ input, outcome });
        },
        runAtomic: async work => work(transactionConnection()),
      });

      const result = await service.acknowledgeShadowMismatch({
        fingerprint: FINGERPRINT,
        acknowledgedBy: 'operator-1',
        reason: 'approved security difference',
        classification: 'approved-security-difference',
      });

      assert.equal(result.fingerprint, FINGERPRINT);
      assert.equal(typeof result.resolvedAt, 'string');
      const call = updateOne.calledWith[0] as {
        filter: Record<string, unknown>;
        update: { $set: Record<string, unknown> };
      };
      assert.deepEqual(call.filter, { ...UNRESOLVED_OR_UNAPPROVED, fingerprint: FINGERPRINT });
      assert.equal(call.update.$set.resolvedBy, 'operator-1');
      assert.equal(call.update.$set.resolutionReason, 'approved security difference');
      assert.equal(call.update.$set.resolutionClassification, 'approved-security-difference');
      assert.equal(audits.length, 1);
      assert.equal(audits[0].outcome, 'succeeded');
      assert.equal(audits[0].input.actorType, 'operator');
      assert.equal(audits[0].input.authMethod, 'operator');
      assert.equal(audits[0].input.actorId, 'operator-1');
      assert.equal(audits[0].input.eventType, 'shadow.mismatch-acknowledged');
      assert.equal(audits[0].input.targetType, 'authorization-shadow-mismatch');
      assert.equal(audits[0].input.targetId, FINGERPRINT);
      assert.equal(audits[0].input.reason, 'approved security difference');
      assert.equal((audits[0].input.after as Record<string, unknown>).classification, 'approved-security-difference');
    });

    it('lists and audits re-triage of historical defects, unknown and unclassified rows while preserving approvals', async function () {
      // Evaluate the native predicates with the query engine behind sails-disk,
      // rather than returning rows regardless of the service's actual filter.
      const { match } = require('@sailshq/nedb/lib/model') as {
        match(row: object, filter: object): boolean;
      };
      const old = '2026-01-01T00:00:00.000Z';
      const fixtures = [
        ...ALL_SHADOW_CLASSIFICATION_FIXTURES.flatMap(({ classification, resolves }) => [
          { classification, resolvedAt: old, blocker: !resolves },
          { classification, resolvedAt: null, blocker: true },
        ]),
        ...[undefined, null, '', 'unknown-legacy-label'].map(classification => ({
          classification,
          resolvedAt: old,
          blocker: true,
        })),
      ];
      const rows: Array<Record<string, unknown>> = fixtures.map((fixture, index) => ({
        fingerprint: (index + 1).toString(16).padStart(64, '0'),
        routeId: `route-${index}`,
        resolvedAt: fixture.resolvedAt,
        ...(fixture.classification === undefined ? {} : { resolutionClassification: fixture.classification }),
        resolvedBy: 'original-operator',
        resolutionReason: 'original triage',
      }));
      installCollection({
        find: (filter: object) => ({
          limit: (limit: number) => ({ toArray: async () => rows.filter(row => match(row, filter)).slice(0, limit) }),
        }),
        updateOne: async (filter: object, update: { $set: object }) => {
          const row = rows.find(candidate => match(candidate, filter));
          if (row === undefined) return { matchedCount: 0 };
          Object.assign(row, update.$set);
          return { matchedCount: 1 };
        },
      });
      const audits: AuthorizationAuditEventInput[] = [];
      let failAudit = false;
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async input => {
          if (failAudit) throw new Error('audit unavailable');
          audits.push(input);
        },
        runAtomic: async work => {
          const before = structuredClone(rows);
          try {
            return await work(transactionConnection());
          } catch (error) {
            rows.splice(0, rows.length, ...before);
            throw error;
          }
        },
      });
      const listed: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await service.listUnresolvedShadowMismatches({ limit: 3, cursor });
        assert.equal(page.truncated, page.nextCursor !== undefined);
        listed.push(...page.items.map(row => row.fingerprint));
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      assert.deepEqual(
        listed,
        rows.filter((_row, index) => fixtures[index].blocker).map(row => row.fingerprint)
      );

      for (let index = 0; index < rows.length; index += 1) {
        const original = { ...rows[index] };
        const input = {
          fingerprint: original.fingerprint,
          acknowledgedBy: 'operator-2',
          reason: 're-triaged historical evidence',
          classification: 'mapping-defect',
        };
        const auditCount = audits.length;
        if (!fixtures[index].blocker) {
          await assert.rejects(service.acknowledgeShadowMismatch(input), /No unresolved shadow mismatch/);
          assert.deepEqual(rows[index], original, 'an approved resolution must not change');
          assert.equal(audits.length, auditCount);
          continue;
        }
        failAudit = true;
        await assert.rejects(service.acknowledgeShadowMismatch(input), /audit unavailable/);
        assert.deepEqual(rows[index], original, 'failed audit restores all historical evidence');
        assert.equal(audits.length, auditCount);
        failAudit = false;

        const triaged = await service.acknowledgeShadowMismatch(input);
        assert.equal(triaged.resolvedAt, null);
        assert.equal(rows[index].resolvedAt, null);
        assert.equal(rows[index].resolutionClassification, 'mapping-defect');
        assert.equal(rows[index].resolvedBy, 'operator-2');
        assert.equal(rows[index].resolutionReason, input.reason);
        assert.equal(audits.length, auditCount + 1);
        assert.equal(audits.at(-1)?.eventType, 'shadow.mismatch-acknowledged');
        assert.equal(audits.at(-1)?.actorId, 'operator-2');
        assert.equal(audits.at(-1)?.reason, input.reason);
        assert.deepEqual(audits.at(-1)?.after, {
          fingerprint: original.fingerprint,
          resolvedAt: null,
          resolvedBy: 'operator-2',
          classification: 'mapping-defect',
        });
        assert.ok(
          (await service.listUnresolvedShadowMismatches()).items.some(row => row.fingerprint === original.fingerprint)
        );

        // Historical blockers may also be approved directly when evidence warrants it.
        rows[index] = { ...original };
        const approved = await service.acknowledgeShadowMismatch({
          ...input,
          classification: 'intentional-product-change',
        });
        assert.equal(typeof approved.resolvedAt, 'string');
        assert.equal(rows[index].resolvedAt, approved.resolvedAt);
        assert.equal(audits.length, auditCount + 2);
        assert.equal((audits.at(-1)?.after as Record<string, unknown>).classification, 'intentional-product-change');
        assert.ok(
          !(await service.listUnresolvedShadowMismatches()).items.some(row => row.fingerprint === original.fingerprint)
        );
      }
      assert.deepEqual(await service.listUnresolvedShadowMismatches(), { items: [], truncated: false });
    });

    it('rejects malformed fingerprints, missing identity, missing reasons, and missing classifications', async function () {
      installCollection();
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => undefined,
        runAtomic: async work => work(transactionConnection()),
      });

      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: 'not-a-fingerprint',
          acknowledgedBy: 'o',
          reason: 'r',
          classification: 'needs-investigation',
        }),
        /64-character/
      );
      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: '  ',
          reason: 'r',
          classification: 'needs-investigation',
        }),
        /operator identity/
      );
      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: 'o',
          reason: '',
          classification: 'needs-investigation',
        }),
        /operator reason/
      );
      await assert.rejects(
        service.acknowledgeShadowMismatch({ fingerprint: FINGERPRINT, acknowledgedBy: 'o', reason: 'r' }),
        /classification/
      );
      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: 'o',
          reason: 'r',
          classification: 'free-text-triage',
        }),
        /classification/
      );
      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: 'o',
          reason: 'r',
          classification: 'Needs-Investigation',
        }),
        /classification/
      );
    });

    it('persists only the bounded classification vocabulary on acknowledgement', async function () {
      for (const { classification, resolves } of ALL_SHADOW_CLASSIFICATION_FIXTURES) {
        updateOne.calledWith = [];
        installCollection();
        const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
        const service = new Services.AuthorizationRolloutService({
          appendAuditEvent: async (input, outcome) => {
            audits.push({ input, outcome });
          },
          runAtomic: async work => work(transactionConnection()),
        });
        const result = await service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: 'operator-1',
          reason: 'routine review',
          classification,
        });
        assert.equal(result.fingerprint, FINGERPRINT);
        const call = updateOne.calledWith[0] as { update: { $set: Record<string, unknown> } };
        assert.equal(call.update.$set.resolutionClassification, classification);
        assert.equal(result.resolvedAt !== null, resolves, `${classification} resolution eligibility`);
        assert.equal(call.update.$set.resolvedAt, result.resolvedAt);
        assert.equal((audits[0].input.after as Record<string, unknown>).resolvedAt, result.resolvedAt);
        assert.equal((audits[0].input.after as Record<string, unknown>).classification, classification);
      }
    });

    it('fails closed when no unresolved mismatch matches the fingerprint', async function () {
      // The native driver reports a zero match as an UpdateResult, never null.
      installCollection({ updateOne: async () => ({ matchedCount: 0 }) });
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => undefined,
        runAtomic: async work => work(transactionConnection()),
      });

      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: 'o',
          reason: 'r',
          classification: 'needs-investigation',
        }),
        /No unresolved shadow mismatch/
      );
    });

    it('surfaces operator audit persistence failure instead of silently skipping evidence', async function () {
      installCollection();
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => {
          throw new Error('audit unavailable');
        },
        runAtomic: async work => work(transactionConnection()),
      });

      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: 'o',
          reason: 'r',
          classification: 'approved-legacy-security-bug',
        }),
        /audit unavailable/
      );
    });

    it('rolls back the acknowledgement resolve when the audit insert fails', async function () {
      // Transactional row store: the resolve mutates the row, but the
      // snapshot-restoring runAtomic models transaction abort, so an audit
      // failure must leave the mismatch unresolved.
      const rows = new Map<string, { resolvedAt: string | null; resolvedBy?: string }>([
        [FINGERPRINT, { resolvedAt: null }],
      ]);
      const snapshot = (): Map<string, { resolvedAt: string | null; resolvedBy?: string }> =>
        new Map([...rows].map(([key, value]) => [key, { ...value }]));
      let updateCalls = 0;
      Object.assign(collection, {
        updateOne: async (filter: { fingerprint: string }, update: { $set: Record<string, unknown> }) => {
          updateCalls += 1;
          const row = rows.get(filter.fingerprint);
          if (row === undefined || row.resolvedAt !== null) return { matchedCount: 0 };
          row.resolvedAt = update.$set.resolvedAt as string;
          row.resolvedBy = update.$set.resolvedBy as string;
          return { matchedCount: 1 };
        },
        find: () => ({ limit: () => ({ toArray: async () => [] }) }),
        deleteMany: async () => ({ deletedCount: 0 }),
      });
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => {
          throw new Error('audit unavailable');
        },
        runAtomic: async work => {
          const before = snapshot();
          try {
            return await work(transactionConnection());
          } catch (error) {
            rows.clear();
            for (const [key, value] of before) rows.set(key, value);
            throw error;
          }
        },
      });

      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: 'o',
          reason: 'r',
          classification: 'needs-investigation',
        }),
        /audit unavailable/
      );
      assert.equal(updateCalls, 1);
      assert.equal(rows.get(FINGERPRINT)?.resolvedAt, null);
      assert.equal(rows.get(FINGERPRINT)?.resolvedBy, undefined);
    });

    it('writes nothing when operator identity or reason carries controls or credential material', async function () {
      const INVALID_IDENTITIES = [
        'bad\u0000operator',
        'operator \u001f trimmed',
        'Bearer abcdef1234567890',
        'api-key: hunter2secret',
        '550e8400-e29b-41d4-a716-446655440000',
        '  ',
      ];
      const INVALID_REASONS = [
        'reason with \u001F control',
        'password= supersecret1',
        'Bearer abcdef1234567890',
        '550e8400-e29b-41d4-a716-446655440000',
        '',
      ];
      for (const acknowledgedBy of INVALID_IDENTITIES) {
        let updateCalls = 0;
        let auditCalls = 0;
        installCollection({
          updateOne: async () => {
            updateCalls += 1;
            return { matchedCount: 1 };
          },
        });
        const service = new Services.AuthorizationRolloutService({
          appendAuditEvent: async () => {
            auditCalls += 1;
          },
          runAtomic: async work => work(transactionConnection()),
        });
        await assert.rejects(
          service.acknowledgeShadowMismatch({
            fingerprint: FINGERPRINT,
            acknowledgedBy,
            reason: 'routine review',
            classification: 'needs-investigation',
          }),
          /operator identity|control|credential/i
        );
        assert.equal(updateCalls, 0, `acknowledge must not write for identity ${JSON.stringify(acknowledgedBy)}`);
        assert.equal(auditCalls, 0, `acknowledge must not audit for identity ${JSON.stringify(acknowledgedBy)}`);
      }
      for (const reason of INVALID_REASONS) {
        let updateCalls = 0;
        let auditCalls = 0;
        installCollection({
          updateOne: async () => {
            updateCalls += 1;
            return { matchedCount: 1 };
          },
        });
        const service = new Services.AuthorizationRolloutService({
          appendAuditEvent: async () => {
            auditCalls += 1;
          },
          runAtomic: async work => work(transactionConnection()),
        });
        await assert.rejects(
          service.acknowledgeShadowMismatch({
            fingerprint: FINGERPRINT,
            acknowledgedBy: 'operator-1',
            reason,
            classification: 'needs-investigation',
          }),
          /operator reason|control|credential/i
        );
        assert.equal(updateCalls, 0, `acknowledge must not write for reason ${JSON.stringify(reason)}`);
        assert.equal(auditCalls, 0, `acknowledge must not audit for reason ${JSON.stringify(reason)}`);
      }
    });

    it('sends identical canonical values to the aggregate row and the audit event', async function () {
      installCollection();
      const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async (input, outcome) => {
          audits.push({ input, outcome });
        },
        runAtomic: async work => work(transactionConnection()),
      });

      await service.acknowledgeShadowMismatch({
        fingerprint: FINGERPRINT,
        acknowledgedBy: '  operator-1  ',
        reason: '  routine review  ',
        classification: 'needs-investigation',
      });

      const call = updateOne.calledWith[0] as { update: { $set: Record<string, unknown> } };
      assert.equal(call.update.$set.resolvedBy, 'operator-1');
      assert.equal(call.update.$set.resolutionReason, 'routine review');
      assert.equal(call.update.$set.resolutionClassification, 'needs-investigation');
      assert.equal(audits[0].input.actorId, 'operator-1');
      assert.equal(audits[0].input.reason, 'routine review');
      assert.equal((audits[0].input.after as Record<string, unknown>).classification, 'needs-investigation');
      assert.equal(call.update.$set.resolvedBy, audits[0].input.actorId);
      assert.equal(call.update.$set.resolutionReason, audits[0].input.reason);
      assert.equal(
        call.update.$set.resolutionClassification,
        (audits[0].input.after as Record<string, unknown>).classification
      );
    });

    it('binds the acknowledgement mutation and audit to the same transaction connection', async function () {
      installCollection();
      const collectionRequests: string[] = [];
      const auditConnections: unknown[] = [];
      const txConnection: Sails.Connection = {
        collection: (name: string) => {
          collectionRequests.push(name);
          return collection;
        },
      } as Sails.Connection;
      const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async (input, outcome, connection) => {
          audits.push({ input, outcome });
          auditConnections.push(connection);
        },
        runAtomic: async work => work(txConnection),
      });

      await service.acknowledgeShadowMismatch({
        fingerprint: FINGERPRINT,
        acknowledgedBy: 'operator-1',
        reason: 'routine review',
        classification: 'needs-investigation',
      });

      assert.deepEqual(collectionRequests, ['authorizationshadowmismatch']);
      assert.equal(auditConnections.length, 1);
      assert.equal(auditConnections[0], txConnection);
      assert.equal(datastoreCollectionCalls, 0);
    });

    it('fails closed when the acknowledgement transaction connection lacks collection()', async function () {
      installCollection();
      let auditCalls = 0;
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => {
          auditCalls += 1;
        },
        runAtomic: async work => work({} as Sails.Connection),
      });

      await assert.rejects(
        service.acknowledgeShadowMismatch({
          fingerprint: FINGERPRINT,
          acknowledgedBy: 'operator-1',
          reason: 'routine review',
          classification: 'needs-investigation',
        }),
        /transaction-bound connection exposing collection/
      );
      assert.equal(auditCalls, 0);
      assert.equal(updateOne.calledWith.length, 0);
      assert.equal(datastoreCollectionCalls, 0);
    });

    it('binds the retention mutation and audit to the same transaction connection', async function () {
      installCollection();
      const collectionRequests: string[] = [];
      const auditConnections: unknown[] = [];
      const txConnection: Sails.Connection = {
        collection: (name: string) => {
          collectionRequests.push(name);
          return collection;
        },
      } as Sails.Connection;
      const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async (input, outcome, connection) => {
          audits.push({ input, outcome });
          auditConnections.push(connection);
        },
        runAtomic: async work => work(txConnection),
      });

      const result = await service.retainResolvedShadowMismatches({
        olderThanDays: 30,
        limit: 100,
        retainedBy: 'operator-1',
        reason: 'retention window elapsed',
      });

      assert.deepEqual(result, { deleted: 2, truncated: false });
      assert.deepEqual(collectionRequests, ['authorizationshadowmismatch']);
      assert.equal(auditConnections.length, 1);
      assert.equal(auditConnections[0], txConnection);
      assert.equal(datastoreCollectionCalls, 0);
    });

    it('fails closed when the retention transaction connection lacks collection()', async function () {
      installCollection({
        deleteMany: async () => {
          throw new Error('deleteMany must not run without a transaction-bound connection');
        },
      });
      let auditCalls = 0;
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => {
          auditCalls += 1;
        },
        runAtomic: async work => work({} as Sails.Connection),
      });

      await assert.rejects(
        service.retainResolvedShadowMismatches({
          olderThanDays: 30,
          retainedBy: 'operator-1',
          reason: 'retention window elapsed',
        }),
        /transaction-bound connection exposing collection/
      );
      assert.equal(auditCalls, 0);
      assert.equal(datastoreCollectionCalls, 0);
    });

    it('deletes only resolved aggregates past the cutoff within a bounded limit', async function () {
      let capturedFilter: unknown;
      installCollection({
        deleteMany: async (filter: unknown) => {
          capturedFilter = filter;
          return { deletedCount: 2 };
        },
      });
      const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async (input, outcome) => {
          audits.push({ input, outcome });
        },
        runAtomic: async work => work(transactionConnection()),
      });

      const result = await service.retainResolvedShadowMismatches({
        olderThanDays: 30,
        limit: 100,
        retainedBy: 'operator-1',
        reason: 'retention window elapsed',
      });

      assert.deepEqual(result, { deleted: 2, truncated: false });
      assertRetentionFilter(capturedFilter, ['row-1', 'row-2']);
      assert.equal(audits.length, 1);
      assert.equal(audits[0].outcome, 'succeeded');
      assert.equal(audits[0].input.actorType, 'operator');
      assert.equal(audits[0].input.authMethod, 'operator');
      assert.equal(audits[0].input.actorId, 'operator-1');
      assert.equal(audits[0].input.eventType, 'shadow.retention.completed');
      assert.equal(audits[0].input.targetType, 'authorization-shadow-mismatch');
      assert.equal(audits[0].input.reason, 'retention window elapsed');
      assert.equal((audits[0].input.after as Record<string, unknown>).deleted, 2);
    });

    it('fetches limit+1 to observe truncation but deletes only the limit', async function () {
      let observedLimit: unknown;
      const rows = [{ _id: 'row-1' }, { _id: 'row-2' }, { _id: 'row-3' }];
      let deletedFilter: unknown;
      installCollection({
        find: () => ({
          limit: (limit: unknown) => ({
            toArray: async () => {
              observedLimit = limit;
              return [...rows];
            },
          }),
        }),
        deleteMany: async (filter: unknown) => {
          deletedFilter = filter;
          return { deletedCount: 2 };
        },
      });
      const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async (input, outcome) => {
          audits.push({ input, outcome });
        },
        runAtomic: async work => work(transactionConnection()),
      });
      const result = await service.retainResolvedShadowMismatches({
        olderThanDays: 30,
        limit: 2,
        retainedBy: 'operator-1',
        reason: 'retention window elapsed',
      });
      assert.equal(observedLimit, 3, 'retention must fetch limit+1 to observe truncation');
      assertRetentionFilter(deletedFilter, ['row-1', 'row-2']);
      assert.deepEqual(result, { deleted: 2, truncated: true });
      assert.equal((audits[0].input.after as Record<string, unknown>).truncated, true);
    });

    it('reports the driver-confirmed deletedCount instead of the requested scope', async function () {
      installCollection({
        find: () => ({ limit: () => ({ toArray: async () => [{ _id: 'row-1' }, { _id: 'row-2' }] }) }),
        deleteMany: async () => ({ deletedCount: 1 }),
      });
      const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async (input, outcome) => {
          audits.push({ input, outcome });
        },
        runAtomic: async work => work(transactionConnection()),
      });
      const result = await service.retainResolvedShadowMismatches({
        olderThanDays: 30,
        limit: 100,
        retainedBy: 'operator-1',
        reason: 'retention window elapsed',
      });
      assert.deepEqual(result, { deleted: 1, truncated: false });
      assert.equal(
        (audits[0].input.after as Record<string, unknown>).deleted,
        1,
        'audit summary must carry the confirmed deletedCount so a concurrent race is reported as observed'
      );
    });

    it('fails closed when deleteMany lacks a valid authoritative deletedCount', async function () {
      const invalidResults: unknown[] = [
        {},
        { deletedCount: undefined },
        { deletedCount: 1.5 },
        { deletedCount: -1 },
        { deletedCount: '2' },
        null,
        undefined,
      ];
      for (const invalid of invalidResults) {
        installCollection({
          find: () => ({ limit: () => ({ toArray: async () => [{ _id: 'row-1' }, { _id: 'row-2' }] }) }),
          deleteMany: async () => invalid as { deletedCount?: number },
        });
        let auditCalls = 0;
        const service = new Services.AuthorizationRolloutService({
          appendAuditEvent: async () => {
            auditCalls += 1;
          },
          runAtomic: async work => work(transactionConnection()),
        });
        await assert.rejects(
          service.retainResolvedShadowMismatches({
            olderThanDays: 30,
            limit: 100,
            retainedBy: 'operator-1',
            reason: 'retention window elapsed',
          }),
          /valid deletedCount/,
          `retention must fail closed for deletedCount ${JSON.stringify(invalid)} instead of auditing ids.length`
        );
        assert.equal(auditCalls, 0, 'no audit summary may be written without a driver-confirmed count');
      }
    });

    it('audits retention summaries even when nothing is deleted and never deletes audit evidence', async function () {
      installCollection({
        find: () => ({ limit: () => ({ toArray: async () => [] }) }),
        deleteMany: async () => {
          throw new Error('deleteMany must not run when nothing is stale');
        },
      });
      const audits: Array<{ input: AuthorizationAuditEventInput; outcome: unknown }> = [];
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async (input, outcome) => {
          audits.push({ input, outcome });
        },
        runAtomic: async work => work(transactionConnection()),
      });

      const result = await service.retainResolvedShadowMismatches({
        olderThanDays: 30,
        retainedBy: 'operator-1',
        reason: 'routine review',
      });

      assert.deepEqual(result, { deleted: 0, truncated: false });
      assert.equal(audits.length, 1);
      assert.equal(audits[0].outcome, 'succeeded');
      assert.equal(audits[0].input.eventType, 'shadow.retention.completed');
      assert.equal((audits[0].input.after as Record<string, unknown>).deleted, 0);
    });

    it('refuses unbounded or invalid retention requests', async function () {
      installCollection();
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => undefined,
        runAtomic: async work => work(transactionConnection()),
      });

      await assert.rejects(service.retainResolvedShadowMismatches({ olderThanDays: 0 }), /olderThanDays/);
      await assert.rejects(service.retainResolvedShadowMismatches({ olderThanDays: 30, limit: 100_000 }), /bounded/);
      await assert.rejects(
        service.retainResolvedShadowMismatches({ olderThanDays: 30, retainedBy: '  ', reason: 'r' }),
        /operator identity/
      );
      await assert.rejects(
        service.retainResolvedShadowMismatches({ olderThanDays: 30, retainedBy: 'o', reason: '' }),
        /operator reason/
      );
      await assert.rejects(
        service.retainResolvedShadowMismatches({ olderThanDays: 30, reason: 'r' }),
        /operator identity/
      );
    });

    it('requires a bounded safe integer retention age', async function () {
      installCollection();
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => undefined,
        runAtomic: async work => work(transactionConnection()),
      });

      const invalidAges: unknown[] = [
        1.5,
        30.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        '1.5',
        '30.0',
        '1e2',
        '3e1',
        'Infinity',
        'NaN',
        '',
        '0',
        '36501',
        '9007199254740993',
        0,
        -1,
        36_501,
        Number.MAX_SAFE_INTEGER,
      ];
      for (const olderThanDays of invalidAges) {
        await assert.rejects(
          service.retainResolvedShadowMismatches({ olderThanDays, retainedBy: 'operator-1', reason: 'r' }),
          /bounded safe integer/,
          `retention age ${JSON.stringify(olderThanDays)} must be rejected`
        );
      }
      await assert.rejects(
        service.retainResolvedShadowMismatches({ olderThanDays: '1e2', retainedBy: 'operator-1', reason: 'r' }),
        /bounded safe integer/
      );
    });

    it('leaves resolved rows undeleted when the retention audit summary fails', async function () {
      // Transactional row store: deletion happens inside runAtomic, and the
      // snapshot-restoring runner models transaction abort, so an audit
      // failure must leave the stale rows present.
      const rows = new Map<string, { _id: string }>([
        ['row-1', { _id: 'row-1' }],
        ['row-2', { _id: 'row-2' }],
      ]);
      let deleteCalls = 0;
      Object.assign(collection, {
        find: () => ({ limit: () => ({ toArray: async () => [...rows.values()].map(row => ({ ...row })) }) }),
        deleteMany: async (filter: { _id: { $in: string[] } }) => {
          deleteCalls += 1;
          for (const id of filter._id.$in) rows.delete(id);
          return { deletedCount: filter._id.$in.length };
        },
      });
      const service = new Services.AuthorizationRolloutService({
        appendAuditEvent: async () => {
          throw new Error('audit unavailable');
        },
        runAtomic: async work => {
          const before = new Map(rows);
          try {
            return await work(transactionConnection());
          } catch (error) {
            rows.clear();
            for (const [key, value] of before) rows.set(key, value);
            throw error;
          }
        },
      });

      await assert.rejects(
        service.retainResolvedShadowMismatches({
          olderThanDays: 30,
          retainedBy: 'operator-1',
          reason: 'retention window elapsed',
        }),
        /audit unavailable/
      );
      assert.equal(deleteCalls, 1);
      assert.deepEqual([...rows.keys()].sort(), ['row-1', 'row-2']);
    });

    it('deletes nothing when retention identity or reason is invalid', async function () {
      const INVALID_IDENTITIES = ['bad\0operator', 'Bearer abcdef1234567890', '  '];
      const INVALID_REASONS = ['password= supersecret1', '550e8400-e29b-41d4-a716-446655440000', ''];
      for (const retainedBy of INVALID_IDENTITIES) {
        let findCalls = 0;
        let deleteCalls = 0;
        let auditCalls = 0;
        installCollection({
          find: () => ({
            limit: () => ({
              toArray: async () => {
                findCalls += 1;
                return [];
              },
            }),
          }),
          deleteMany: async () => {
            deleteCalls += 1;
            return { deletedCount: 0 };
          },
        });
        const service = new Services.AuthorizationRolloutService({
          appendAuditEvent: async () => {
            auditCalls += 1;
          },
          runAtomic: async work => work(transactionConnection()),
        });
        await assert.rejects(
          service.retainResolvedShadowMismatches({ olderThanDays: 30, retainedBy, reason: 'routine review' }),
          /operator identity|control|credential/i
        );
        assert.equal(findCalls, 0, `retention must not read for identity ${JSON.stringify(retainedBy)}`);
        assert.equal(deleteCalls, 0, `retention must not delete for identity ${JSON.stringify(retainedBy)}`);
        assert.equal(auditCalls, 0, `retention must not audit for identity ${JSON.stringify(retainedBy)}`);
      }
      for (const reason of INVALID_REASONS) {
        let findCalls = 0;
        let deleteCalls = 0;
        let auditCalls = 0;
        installCollection({
          find: () => ({
            limit: () => ({
              toArray: async () => {
                findCalls += 1;
                return [];
              },
            }),
          }),
          deleteMany: async () => {
            deleteCalls += 1;
            return { deletedCount: 0 };
          },
        });
        const service = new Services.AuthorizationRolloutService({
          appendAuditEvent: async () => {
            auditCalls += 1;
          },
          runAtomic: async work => work(transactionConnection()),
        });
        await assert.rejects(
          service.retainResolvedShadowMismatches({ olderThanDays: 30, retainedBy: 'operator-1', reason }),
          /operator reason|control|credential/i
        );
        assert.equal(findCalls, 0, `retention must not read for reason ${JSON.stringify(reason)}`);
        assert.equal(deleteCalls, 0, `retention must not delete for reason ${JSON.stringify(reason)}`);
        assert.equal(auditCalls, 0, `retention must not audit for reason ${JSON.stringify(reason)}`);
      }
    });
  });
});
