import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, it } from 'mocha';
import { of } from 'rxjs';
import {
  asScopeKey,
  createScopeRegistry,
  freezeAuthorizationContext,
  type AuthorizationContext,
} from '../../src/authorization';
import { genuineTestActor } from './genuineActor';
import { Services } from '../../src/services/RoleAdministrationService';
import { Services as UsersServices } from '../../src/services/UsersService';
import { Controllers as UserManagementControllers } from '../../src/controllers/webservice/UserManagementController';
import {
  sendAuthorizationAdministrationError,
  sendAuthorizationResourceError,
  sendAuthorizationTransactionUnavailable,
} from '../../src/policies/authorization-response';
import { AuthorizationAdministrationError } from '../../src/authorization/errors';
import { userApiRoutes } from '../../src/api-routes/groups/users';
import { UserLinkWLDef } from '../../src/waterline-models/UserLink';
import { UserLinkOperationWLDef } from '../../src/waterline-models/UserLinkOperation';
import { AUTHORIZATION_PERSISTENCE_MODEL_INDEXES } from '../../src/services/AuthorizationPersistenceService';

/**
 * Phase 5 resolution regression coverage (AUTH-ACTOR-001,
 * AUTH-REQUEST-MUTATION-001, AUTH-LINK-PROOF-001, AUTH-LINK-RACE-001,
 * AUTH-TXN-001, AUTH-COMPOSITE-001, AUTH-CAS-HTTP-001, RB-ANGULAR-001,
 * RB-TEST-ATOMICITY-001).
 *
 * Repository-verifiable, production-surface coverage. Runs with mocked
 * Waterline globals and an injected transaction runner: no Docker, MongoDB,
 * Solr, or Chrome.
 *
 * Honest external-runtime limitations (stated, not proven):
 * - True cross-datastore rollback (mongodb vs redboxStorage) cannot be
 *   exercised without live Mongo; tests prove ordering, predicates, pending
 *   reporting, and idempotent record-phase retry — never single-commit
 *   rollback.
 * - True concurrent overlapping transactions cannot be exercised without a
 *   live replica set; the race test below simulates the loser observing the
 *   winner's row plus a duplicate-key insert, and the shipped unique index +
 *   migration is asserted statically.
 */

const CONFIRMATION_SECRET = 'phase-5-resolution-secret-long-enough!!!!';
const NOW = new Date('2026-09-01T00:00:00.000Z');

function waterlineQuery<T>(rows: T): Promise<T> & Record<string, (...args: never[]) => unknown> {
  const pending = Promise.resolve(rows);
  const query = pending as Promise<T> & Record<string, (...args: never[]) => unknown>;
  for (const method of [
    'exec',
    'fetch',
    'populate',
    'where',
    'sort',
    'limit',
    'skip',
    'select',
    'set',
    'meta',
    'usingConnection',
  ]) {
    query[method] = () => query;
  }
  return query;
}

const testConnection = Object.freeze({ lease: 'phase-5-resolution' }) as Sails.Connection;

let resolutionNonce = 0;

function serviceDependencies(
  audits: { succeeded: unknown[]; attempts: { input: Record<string, unknown>; outcome: string }[] },
  registry: ReturnType<typeof createScopeRegistry>
): Record<string, unknown> {
  return {
    now: () => new Date(NOW),
    randomId: () => `resolution-id-${(resolutionNonce += 1)}`,
    getRegistry: () => registry,
    getConfirmationSecret: () => CONFIRMATION_SECRET,
    audit: () => ({
      createSucceededEvent: async (input: Record<string, unknown>) => {
        (audits.succeeded as Record<string, unknown>[]).push(input);
        return { eventId: `event-${audits.succeeded.length}` };
      },
      recordAttempt: async (input: Record<string, unknown>, outcome: 'denied' | 'failed') => {
        audits.attempts.push({ input, outcome });
        return { persisted: true };
      },
    }),
    runTransaction: (work: (connection: Sails.Connection) => Promise<unknown>) => work(testConnection),
  };
}

function testRegistry(): ReturnType<typeof createScopeRegistry> {
  return createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0',
      definitions: [
        { key: asScopeKey('authorization.assignment.manage'), label: 'M', description: 'M.', risk: 'admin' },
        { key: asScopeKey('authorization.assignment.read'), label: 'R', description: 'R.', risk: 'read' },
        { key: asScopeKey('user.manage'), label: 'U', description: 'U.', risk: 'admin' },
        { key: asScopeKey('user.account-link.manage'), label: 'L', description: 'L.', risk: 'admin' },
      ],
    },
  ]);
}

/**
 * Genuine resolver-issued actor (real `AuthorizationService`, stub
 * brand/registry). The authMethod selects the canonical session, bearer, or
 * internal shape; scope provenance is re-derived by the resolver.
 */
function brandActor(
  scopes: readonly string[] = ['authorization.assignment.manage'],
  authMethod: 'session' | 'bearer' | 'internal' = 'session',
  category = 'authenticated'
): Promise<AuthorizationContext> {
  return genuineTestActor({
    contextType: 'brand',
    principal: {
      category,
      authMethod,
      active: true,
      userId: 'operator-1',
      ...(authMethod === 'bearer' ? { username: 'token-operator' } : {}),
    },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
    effectiveScopeKeys: scopes,
  });
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === code;
}

afterEach(() => {
  for (const name of [
    'Role',
    'RoleAssignment',
    'RoleTemplate',
    'RoleTemplateRevision',
    'RoleScopeOverride',
    'User',
    'UserAudit',
    'UserLink',
    'UserLinkOperation',
    'Record',
    'BrandingService',
    'UsersService',
  ]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('Phase 5 resolution findings', () => {
  it('exports the guarded link seams and hides raw storage helpers (production surface)', () => {
    const roleAdmin = new Services.RoleAdministrationService().exports() as Record<string, unknown>;
    for (const method of ['previewLinkAccounts', 'linkUserAccounts', 'getLinkOperation', 'retryLinkOperation']) {
      assert.equal(typeof roleAdmin[method], 'function', `${method} must be exported`);
    }
    const users = new UsersServices.Users().exports() as Record<string, unknown>;
    for (const method of [
      'addLocalUser',
      'updateUserDetails',
      'updateUserDetailsForBrand',
      'setUserKey',
      'setUserKeyForBrand',
      'linkAccounts',
    ]) {
      assert.equal(typeof users[method], 'function', `${method} must stay exported as the guarded seam`);
    }
    for (const raw of [
      'createLocalUserRecord',
      'persistUserKeyRecord',
      'persistUserDetailsRecord',
      'persistUserDetailsRecordInner',
      'createSystemJobActor',
      'disableUserAsSystemJob',
      'enableUserAsSystemJob',
      'assignOnboardingRole',
      'requireRequestActor',
      'requireMutationActor',
    ]) {
      assert.equal(users[raw], undefined, `${raw} must NOT be exported`);
    }
  });

  it('AUTH-ACTOR-001: rejects an active forged (unfrozen) context and accepts a genuine bearer principal', async () => {
    Reflect.set(globalThis, 'Role', {
      find: () => waterlineQuery([]),
      findOne: () => waterlineQuery(undefined),
      updateOne: () => waterlineQuery(undefined),
    });
    Reflect.set(globalThis, 'RoleTemplate', { findOne: () => waterlineQuery(undefined) });
    Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: () => waterlineQuery(undefined) });
    Reflect.set(globalThis, 'RoleScopeOverride', { find: () => ({ sort: () => waterlineQuery([]) }) });
    const target = {
      id: 'user-1',
      username: 'user-1',
      loginDisabled: false,
      accountLinkState: 'active',
      loginDisabledVersion: 1,
    };
    Reflect.set(globalThis, 'User', {
      // Transactional reads use usingConnection; brand-membership reads use
      // populate (legacy projection carries the brand role).
      findOne: () => ({
        populate: () => waterlineQuery({ ...target, roles: [{ id: 'role-1', branding: 'brand-1' }] }),
        usingConnection: () => waterlineQuery(target),
      }),
      find: () => waterlineQuery([target]),
      updateOne: () => ({
        set: () => ({
          usingConnection: () => waterlineQuery({ ...target, loginDisabled: true, loginDisabledVersion: 2 }),
        }),
      }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => waterlineQuery(undefined),
      find: () => waterlineQuery([]),
    });
    const audits = {
      succeeded: [] as unknown[],
      attempts: [] as { input: Record<string, unknown>; outcome: string }[],
    };
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

    // Active forged context: structurally plausible but NOT server-frozen.
    const forged = {
      contextType: 'brand',
      principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'attacker' },
      brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1', exists: true, authorized: true },
      roles: [],
      compatibilityRoles: [],
      grantedScopeKeys: ['authorization.assignment.manage'],
      effectiveScopeKeys: ['authorization.assignment.manage'],
      scopeProvenance: [],
    };
    assert.equal(Object.isFrozen(forged), false);
    await assert.rejects(
      service.setUserAccess({
        actor: forged as never,
        brandId: 'brand-1',
        userId: 'user-1',
        disabled: true,
        expectedVersion: 1,
        requestId: 'forged-active',
      }),
      hasCode('authorization.authentication-required')
    );

    // Genuine canonical bearer principal: category legacy-bearer +
    // authMethod bearer, server-frozen. Must pass actor validation (it may
    // still fail later on scope/quorum, but never with authentication-required).
    const bearer = await brandActor(['authorization.assignment.manage', 'user.manage'], 'bearer', 'legacy-bearer');
    assert.equal(Object.isFrozen(bearer), true);
    const result = await service.setUserAccess({
      actor: bearer,
      brandId: 'brand-1',
      userId: 'user-1',
      disabled: true,
      expectedVersion: 1,
      requestId: 'genuine-bearer',
    });
    assert.equal(result.changed, true);
    assert.equal(result.version, 2);
  });

  it('AUTH-LINK-RACE-001: ships the enforceable unique constraint and migration', () => {
    const userLinkIndexes =
      (UserLinkWLDef as unknown as { indexes?: { attributes: Record<string, number>; unique?: boolean }[] }).indexes ??
      [];
    const secondaryUnique = userLinkIndexes.find(
      index => index.unique === true && index.attributes.secondaryUserId === 1 && index.attributes.status === 1
    );
    assert.ok(secondaryUnique !== undefined, 'UserLink model must declare unique {secondaryUserId,status}');

    const operationIndexes =
      (UserLinkOperationWLDef as unknown as { indexes?: { attributes: Record<string, number>; unique?: boolean }[] })
        .indexes ?? [];
    assert.ok(
      operationIndexes.some(index => index.unique === true && index.attributes.operationId === 1),
      'UserLinkOperation model must declare unique {operationId}'
    );

    const persisted = AUTHORIZATION_PERSISTENCE_MODEL_INDEXES as unknown as {
      modelIdentity: string;
      indexes: { key: Record<string, number>; name: string; unique?: boolean }[];
    }[];
    const userLinkEntry = persisted.find(entry => entry.modelIdentity === 'userlink');
    assert.ok(
      userLinkEntry?.indexes.some(index => index.unique === true && index.key.secondaryUserId === 1),
      'persistence index contract must include the userlink unique constraint'
    );
    assert.ok(
      persisted.some(entry => entry.modelIdentity === 'userlinkoperation'),
      'persistence index contract must include the link operation collection'
    );

    const migrationPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'api',
      'migrations',
      '20260905T120000-account-link-uniqueness.js'
    );
    assert.ok(fs.existsSync(migrationPath), 'account-link uniqueness migration must ship');
    const migrationSource = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(migrationSource.includes('userlink') || migrationSource.includes('user_link'));
    assert.ok(
      migrationSource.includes('userlinkoperation') || migrationSource.includes('ensureAuthorizationPersistenceIndexes')
    );
  });

  it('AUTH-LINK-PROOF-001: HTTP link controller forwards the complete proof and maps conflicts to Problem Details', async () => {
    const captured: {
      primary: string;
      secondary: string;
      actor: string;
      brand: string;
      options: Record<string, unknown>;
    }[] = [];
    const actor = await brandActor(['user.account-link.manage', 'authorization.assignment.manage']);
    Reflect.set(globalThis, 'BrandingService', { getBrandFromReq: () => ({ id: 'brand-1' }) });
    Reflect.set(globalThis, 'UsersService', {
      getUserForBrand: () => of({ id: 'primary-1' }),
      linkAccounts: (
        primaryUserId: string,
        secondaryUserId: string,
        routeActor: string,
        brandId: string,
        options: Record<string, unknown>
      ) => {
        captured.push({
          primary: primaryUserId,
          secondary: secondaryUserId,
          actor: routeActor,
          brand: brandId,
          options,
        });
        return of({
          primary: { id: 'primary-1' },
          linkedAccounts: [],
          impact: { recordsRewritten: 0, rolesMerged: 0 },
        });
      },
    });
    const controller = new UserManagementControllers.UserManagement();
    const sendCalls: { status?: number; data?: unknown; displayErrors?: { detail?: string }[] }[] = [];
    (controller as unknown as { sendResp: unknown }).sendResp = (
      _req: unknown,
      _res: unknown,
      opts: { status?: number; data?: unknown; displayErrors?: { detail?: string }[] }
    ) => {
      sendCalls.push(opts);
    };
    const req = {
      body: {},
      apiRequest: {
        body: {
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          reason: 'merge',
          primaryExpectedVersion: 3,
          secondaryExpectedVersion: 4,
          linkConfirmationToken: 'proof-token',
          linkOperationId: 'op-1',
        },
        params: {},
        query: {},
      },
      authorization: actor,
      authorizationRequestId: 'req-link-proof',
      user: { id: 'operator-1', username: 'operator' },
      path: '/b/p/api/users/link',
    } as unknown as Sails.Req;
    await controller.linkAccounts(req, {} as Sails.Res);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].options.primaryExpectedVersion, 3);
    assert.equal(captured[0].options.secondaryExpectedVersion, 4);
    assert.equal(captured[0].options.linkConfirmationToken, 'proof-token');
    assert.equal(captured[0].options.linkOperationId, 'op-1');
    assert.equal(captured[0].options.reason, 'merge');
    assert.equal(sendCalls.length, 1);

    // Conflict mapping: an administration version-conflict becomes a stable
    // 409 Problem Details response (not a success schema, not a 500).
    const statuses: number[] = [];
    const bodies: unknown[] = [];
    const res = {
      status: (status: number) => {
        statuses.push(status);
        return res as unknown as Sails.Res;
      },
      type: () => res as unknown as Sails.Res,
      json: (body: unknown) => {
        bodies.push(body);
      },
    } as unknown as Sails.Res;
    const problemReq = { path: '/b/p/api/users/link', authorizationRequestId: 'req-1' } as unknown as Sails.Req;
    assert.equal(
      sendAuthorizationAdministrationError(
        problemReq,
        res,
        new AuthorizationAdministrationError('authorization.version-conflict', 409, 'stale')
      ),
      true
    );
    assert.deepEqual(statuses, [409]);
    assert.equal((bodies[0] as { code?: string }).code, 'authorization.version-conflict');
  });

  it('AUTH-CAS-HTTP-001: transaction-unavailable emits a stable 503 and routes declare Problem Details', () => {
    const statuses: number[] = [];
    const bodies: unknown[] = [];
    const types: string[] = [];
    const res = {
      status: (status: number) => {
        statuses.push(status);
        return res as unknown as Sails.Res;
      },
      type: (mediaType: string) => {
        types.push(mediaType);
        return res as unknown as Sails.Res;
      },
      json: (body: unknown) => {
        bodies.push(body);
      },
    } as unknown as Sails.Res;
    const req = { path: '/b/p/api/users/user-1/disable', authorizationRequestId: 'req-503' } as unknown as Sails.Req;
    const unavailable = new Error('no replica set') as Error & { code?: string };
    unavailable.code = 'authorization.transaction-unavailable';
    assert.equal(sendAuthorizationTransactionUnavailable(req, res, unavailable), true);
    assert.equal(sendAuthorizationResourceError(req, res, unavailable), true);
    assert.deepEqual(statuses, [503, 503]);
    assert.ok(types.every(mediaType => mediaType === 'application/problem+json'));
    assert.equal((bodies[0] as { code?: string }).code, 'authorization.transaction-unavailable');

    const byAction = new Map<string, (typeof userApiRoutes)[number]>(
      userApiRoutes.map(route => [`${route.method} ${route.controller}#${route.action}`, route] as const)
    );
    // Per-route error contracts: preview is read-only (no 409); operation
    // reads are lookups (no 409/422); everything else carries the full
    // 401/403/404/409/422/503 Problem Details set.
    const expectedErrors: Record<string, readonly number[]> = {
      'post webservice/UserManagementController#linkAccounts': [401, 403, 404, 409, 422, 503],
      'post webservice/UserManagementController#previewLinkAccounts': [401, 403, 404, 422, 503],
      'get webservice/UserManagementController#getLinkOperation': [401, 403, 404, 503],
      'post webservice/UserManagementController#retryLinkOperation': [401, 403, 404, 409, 422, 503],
      'post webservice/UserManagementController#disableUser': [401, 403, 404, 409, 422, 503],
      'post webservice/UserManagementController#enableUser': [401, 403, 404, 409, 422, 503],
      'put webservice/UserManagementController#createUser': [401, 403, 404, 409, 422, 503],
      'post webservice/UserManagementController#updateUser': [401, 403, 404, 409, 422, 503],
    };
    for (const [key, statuses] of Object.entries(expectedErrors)) {
      const route = byAction.get(key);
      assert.ok(route !== undefined, `${key} must exist`);
      const responses = (route as unknown as { responses?: Record<string | number, unknown> }).responses ?? {};
      for (const status of statuses) {
        const response = responses[status] as { content?: Record<string, unknown>; description?: string } | undefined;
        assert.ok(response !== undefined, `${key} must declare ${status}`);
        assert.ok(
          response.content?.['application/problem+json'] !== undefined,
          `${key} ${status} must use Problem Details, not the success schema`
        );
      }
    }
  });

  it('AUTH-TXN-001: partial multi-record progress reports pending and idempotent retry converges', async () => {
    const researcher = {
      id: 'role-1',
      name: 'researcher',
      key: 'researcher',
      displayName: 'R',
      contextType: 'brand',
      branding: 'brand-1',
      protectedKind: 'none',
      status: 'active',
      version: 1,
    };
    Reflect.set(globalThis, 'Role', {
      find: () => waterlineQuery([researcher]),
      findOne: () => waterlineQuery(researcher),
      updateOne: () => waterlineQuery(undefined),
    });
    Reflect.set(globalThis, 'RoleTemplate', { findOne: () => waterlineQuery(undefined) });
    Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: () => waterlineQuery(undefined) });
    Reflect.set(globalThis, 'RoleScopeOverride', { find: () => ({ sort: () => waterlineQuery([]) }) });
    const primary = {
      id: 'primary-txn',
      username: 'primary-txn',
      loginDisabled: false,
      accountLinkState: 'active',
      loginDisabledVersion: 1,
    };
    const secondary = {
      id: 'secondary-txn',
      username: 'secondary-txn',
      email: 'secondary-txn@example.com',
      loginDisabled: false,
      accountLinkState: 'active',
      loginDisabledVersion: 1,
    };
    Reflect.set(globalThis, 'User', {
      findOne: (criteria: Record<string, unknown>) => ({
        // Brand membership for the preview comes from the legacy projection;
        // transactional reads use the canonical rows.
        populate: () =>
          waterlineQuery({
            ...(String(criteria?.id) === 'primary-txn' ? primary : secondary),
            roles: String(criteria?.id) === 'primary-txn' ? [{ id: 'role-1', branding: 'brand-1' }] : [],
          }),
        usingConnection: () => waterlineQuery(String(criteria?.id) === 'primary-txn' ? primary : secondary),
      }),
      find: () => waterlineQuery([]),
      updateOne: (criteria: Record<string, unknown>) => ({
        set: (values: Record<string, unknown>) => ({
          usingConnection: () => {
            // CAS predicates pin versions for both rows.
            if (String((criteria as Record<string, unknown>).id) === 'primary-txn') {
              return waterlineQuery({ ...primary });
            }
            return waterlineQuery({ ...secondary, ...values });
          },
        }),
      }),
      addToCollection: () => ({ members: () => ({ usingConnection: () => waterlineQuery([]) }) }),
      removeFromCollection: () => ({ members: () => ({ usingConnection: () => waterlineQuery([]) }) }),
    });
    const secondaryTuple = {
      id: 'assignment-secondary-txn',
      principalType: 'user',
      principalId: 'secondary-txn',
      role: 'role-1',
      branding: 'brand-1',
      source: 'manual',
      sourceKey: 'manual',
      status: 'active',
      sourcePresent: true,
      assignedBy: 'operator-1',
      assignedAt: NOW,
      expiresAt: null,
      version: 1,
    };
    let secondaryRevoked = false;
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => waterlineQuery(undefined),
      find: (criteria: Record<string, unknown>) => {
        if (String(criteria?.principalId) === 'secondary-txn') {
          return waterlineQuery(secondaryRevoked ? [] : [secondaryTuple]);
        }
        if (String(criteria?.principalId) === 'primary-txn') {
          return waterlineQuery(
            secondaryRevoked
              ? [
                  {
                    id: 'adopted-txn',
                    principalType: 'user',
                    principalId: 'primary-txn',
                    role: 'role-1',
                    branding: 'brand-1',
                    source: 'manual',
                    sourceKey: 'manual',
                    status: 'active',
                    sourcePresent: true,
                    assignedBy: 'operator-1',
                    assignedAt: NOW,
                    expiresAt: null,
                    version: 1,
                  },
                ]
              : []
          );
        }
        return waterlineQuery([]);
      },
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: () => waterlineQuery({ id: 'adopted-txn', ...values }) }),
      }),
      updateOne: () => ({
        set: (values: Record<string, unknown>) => ({
          usingConnection: () => {
            secondaryRevoked = true;
            return waterlineQuery({ ...secondaryTuple, ...values });
          },
        }),
      }),
    });
    Reflect.set(globalThis, 'UserLink', {
      findOne: () => waterlineQuery(undefined),
      find: () => waterlineQuery([]),
      create: (values: Record<string, unknown>) => ({
        usingConnection: () => waterlineQuery({ id: 'link-1', ...values }),
      }),
    });
    Reflect.set(globalThis, 'UserAudit', { create: () => waterlineQuery({ id: 'legacy-1' }) });
    // Two linked records: the first rewrite commits, the second is lost to a
    // concurrent writer (undefined = lost CAS). Partial progress must NOT
    // roll back the authorization commit; it reports pending drift.
    const recordA = {
      redboxOid: 'record-a',
      revision: 3,
      metaMetadata: { brandId: 'brand-1' },
      authorization: { edit: ['secondary-txn'], view: [], editPending: [], viewPending: [] },
    };
    const recordB = {
      redboxOid: 'record-b',
      revision: 5,
      metaMetadata: { brandId: 'brand-1' },
      authorization: { edit: ['secondary-txn'], view: [], editPending: [], viewPending: [] },
    };
    const rewrittenOids: string[] = [];
    let recordBBlocked = true;
    Reflect.set(globalThis, 'Record', {
      find: () => ({ meta: () => waterlineQuery([recordA, recordB]) }),
      updateOne: (criteria: Record<string, unknown>) => ({
        set: (values: Record<string, unknown>) => {
          if (String(criteria?.redboxOid) === 'record-b' && recordBBlocked) return waterlineQuery(undefined);
          rewrittenOids.push(String(criteria?.redboxOid));
          return waterlineQuery({ ...(String(criteria?.redboxOid) === 'record-a' ? recordA : recordB), ...values });
        },
      }),
    });
    const audits = {
      succeeded: [] as unknown[],
      attempts: [] as { input: Record<string, unknown>; outcome: string }[],
    };
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

    const preview = await service.previewLinkAccounts({
      actor: await brandActor(['user.account-link.manage', 'authorization.assignment.manage']),
      brandId: 'brand-1',
      primaryUserId: 'primary-txn',
      secondaryUserId: 'secondary-txn',
      requestId: 'txn-preview',
    });
    assert.ok(preview.confirmationToken.length > 0);
    assert.ok(preview.linkOperationId.length > 0);

    const linked = await service.linkUserAccounts({
      actor: await brandActor(['user.account-link.manage', 'authorization.assignment.manage']),
      brandId: 'brand-1',
      primaryUserId: 'primary-txn',
      secondaryUserId: 'secondary-txn',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
      requestId: 'txn-apply',
    });
    // Partial multi-record progress: record A rewrote, record B lost CAS.
    assert.equal(linked.changed, true);
    assert.equal(linked.data.recordsPending, true);
    assert.deepEqual(rewrittenOids, ['record-a']);
    assert.equal(linked.data.linkOperationId, preview.linkOperationId);
    // Completion audit exists for the authz commit; pending drift is audited.
    assert.ok(audits.succeeded.some(event => (event as Record<string, unknown>).eventType === 'user.linked'));

    // Durable state is observable while pending, including the monotonic
    // per-record progress (record A verified, record B still outstanding).
    const pending = await service.getLinkOperation(
      await brandActor(['authorization.assignment.read']),
      'brand-1',
      preview.linkOperationId
    );
    assert.equal(pending.status, 'pending');
    assert.equal(pending.recordsPending, true);
    assert.deepEqual([...pending.recordsCompletedOids], ['record-a']);
    assert.equal(pending.recordsRewritten, 1);

    // Idempotent recovery: unblock record B and retry the SAME operation.
    // Only the record phase re-runs (authorization is not re-executed, so no
    // self-conflict); already-rewritten record A is a no-op skip. AUTH-P5-006:
    // the retry re-proves the full preview contract (operation ID, both
    // account versions, confirmation token), verified against the stored
    // durable proof before the record phase resumes.
    recordBBlocked = false;
    const retried = await service.retryLinkOperation({
      actor: await brandActor(['user.account-link.manage', 'authorization.assignment.manage']),
      brandId: 'brand-1',
      primaryUserId: 'primary-txn',
      secondaryUserId: 'secondary-txn',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
      requestId: 'txn-retry',
    });
    assert.equal(retried.data.recordsPending, false);
    assert.ok(rewrittenOids.includes('record-b'));
    assert.ok(
      audits.succeeded.some(event => (event as Record<string, unknown>).eventType === 'user.link-operation-completed'),
      'a completion event must exist on recovery'
    );
    const completed = await service.getLinkOperation(
      await brandActor(['authorization.assignment.read']),
      'brand-1',
      preview.linkOperationId
    );
    assert.equal(completed.status, 'completed');
    // Durable monotonic progress converged across both attempts.
    assert.deepEqual([...completed.recordsCompletedOids].sort(), ['record-a', 'record-b']);
    assert.equal(completed.recordsRewritten, 2);
    assert.equal(retried.data.recordsRewritten, 2);
  });
});
