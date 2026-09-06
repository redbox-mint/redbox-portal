import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'mocha';
import {
  asScopeKey,
  createScopeRegistry,
  freezeAuthorizationContext,
  type AuthorizationContext,
} from '../../src/authorization';
import { genuineTestActor } from './genuineActor';
import { Services } from '../../src/services/RoleAdministrationService';
import {
  Services as ConfigurationServices,
  parseAuthorizationConfigurationDocument,
} from '../../src/services/AuthorizationConfigurationService';

/**
 * Phase 5 acceptance findings (P5-001..P5-008) repository coverage.
 *
 * These tests run with mocked Waterline globals and an injected transaction
 * runner, so they execute without Docker, MongoDB, or Solr. They verify that
 * every authorization-critical write shares one transaction connection, that
 * compare-and-set mismatches surface as a stable `409
 * authorization.version-conflict` with no success counters or success audits,
 * that denied attempts are audited, and that identical no-op replacements do
 * not mutate protected-role versions.
 *
 * Limitation: true cross-connection concurrency (two overlapping MongoDB
 * transactions, write-conflict aborts, and physical rollback) cannot be
 * exercised without a live replica set. The concurrent-removal cases below
 * simulate the second writer observing stale versions through repository
 * fakes; live concurrency remains covered only by the Docker-backed
 * integration suites, which are intentionally not started here.
 */

const CONFIRMATION_SECRET = 'phase-5-confirmation-secret-that-is-long-enough';
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

interface CapturedAudits {
  readonly succeeded: { readonly input: Record<string, unknown> }[];
  readonly attempts: { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[];
}

function capturedAudits(): CapturedAudits & {
  succeeded: { readonly input: Record<string, unknown> }[];
  attempts: { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[];
} {
  return { succeeded: [], attempts: [] };
}

const testConnection = Object.freeze({ lease: 'phase-5-test' }) as Sails.Connection;

let globalPreviewNonce = 0;

function serviceDependencies(
  audits: CapturedAudits,
  registry: ReturnType<typeof createScopeRegistry>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    now: () => new Date(NOW),
    // Globally unique across tests: preview operation IDs double as the
    // confirmation-bound idempotency key, so per-instance restarts must not
    // collide in the shared operation mirror.
    randomId: () => `phase-5-id-${(globalPreviewNonce += 1)}`,
    getRegistry: () => registry,
    getConfirmationSecret: () => CONFIRMATION_SECRET,
    audit: () => ({
      createSucceededEvent: async (input: Record<string, unknown>) => {
        audits.succeeded.push({ input });
        return { eventId: `event-${audits.succeeded.length}` };
      },
      recordAttempt: async (input: Record<string, unknown>, outcome: 'denied' | 'failed') => {
        audits.attempts.push({ input, outcome });
        return { persisted: true };
      },
    }),
    runTransaction: (work: (connection: Sails.Connection) => Promise<unknown>) => work(testConnection),
    ...overrides,
  };
}

function testRegistry(): ReturnType<typeof createScopeRegistry> {
  return createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0',
      definitions: [
        {
          key: asScopeKey('authorization.assignment.manage'),
          label: 'Manage assignments',
          description: 'Manage assignments.',
          risk: 'admin',
        },
        {
          key: asScopeKey('authorization.assignment.read'),
          label: 'Read assignments',
          description: 'Read assignments.',
          risk: 'read',
        },
        {
          key: asScopeKey('authorization.role.manage'),
          label: 'Manage roles',
          description: 'Manage roles.',
          risk: 'admin',
        },
        {
          key: asScopeKey('authorization.role.read'),
          label: 'Read roles',
          description: 'Read roles.',
          risk: 'read',
        },
        {
          key: asScopeKey('authorization.self.read'),
          label: 'Read own authorization',
          description: 'Read own authorization.',
          risk: 'read',
        },
        {
          key: asScopeKey('system.authorization.manage'),
          label: 'Manage system authorization',
          description: 'Manage system authorization.',
          risk: 'admin',
        },
      ],
    },
  ]);
}

/**
 * Genuine resolver-issued brand actor (real `AuthorizationService`, stub
 * brand/registry). Scope provenance is re-derived by the resolver.
 */
function brandActor(scopes: readonly string[] = ['authorization.assignment.manage']): Promise<AuthorizationContext> {
  return genuineTestActor({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'operator-1',
      username: 'operator',
    },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
    effectiveScopeKeys: scopes,
  });
}

/**
 * Genuine system-administrator actor: a session principal whose stub storage
 * holds both a brand role and a system-admin role, so the resolver issues
 * system scopes alongside brand scopes with complete provenance (the shape
 * production issues to real system administrators). A brand-less internal
 * job cannot carry `authorization.self.read`, which the import delegation
 * ceiling requires.
 */
function systemActor(): Promise<AuthorizationContext> {
  return genuineTestActor({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'system-operator',
      username: 'system-operator',
    },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
    effectiveScopeKeys: ['system.authorization.manage', 'authorization.self.read'],
    // The import delegation ceiling only honors scopes proven via a system
    // role, so the stub system-admin template legitimately carries the read
    // scope (the production shape of a system administrator).
    systemRoleScopeKeys: ['authorization.self.read'],
  });
}

function roleRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'role-1',
    name: 'researcher',
    key: 'researcher',
    displayName: 'Researchers',
    contextType: 'brand',
    branding: 'brand-1',
    protectedKind: 'none',
    status: 'active',
    version: 1,
    ...overrides,
  };
}

function activeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-1',
    username: 'user-1',
    loginDisabled: false,
    accountLinkState: 'active',
    ...overrides,
  };
}

function stubRoleGlobals(role: Record<string, unknown>, extraRoles: readonly Record<string, unknown>[] = []): void {
  const roles = [role, ...extraRoles];
  Reflect.set(globalThis, 'Role', {
    find: (criteria: Record<string, unknown>) => {
      if (criteria?.id !== undefined) {
        const ids = new Set(
          (Array.isArray(criteria.id) ? criteria.id : [criteria.id]).map((value: unknown) => String(value))
        );
        return waterlineQuery(roles.filter(candidate => ids.has(String(candidate.id))));
      }
      return waterlineQuery(roles);
    },
    findOne: (criteria: Record<string, unknown>) => {
      const found = roles.find(candidate => String(candidate.id) === String(criteria?.id));
      return waterlineQuery(found);
    },
    updateOne: () => waterlineQuery(undefined),
  });
  Reflect.set(globalThis, 'RoleTemplate', { findOne: () => waterlineQuery(undefined) });
  Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: () => waterlineQuery(undefined) });
  Reflect.set(globalThis, 'RoleScopeOverride', { find: () => ({ sort: () => waterlineQuery([]) }) });
}

function stubUserGlobals(user: Record<string, unknown>, extraUsers: readonly Record<string, unknown>[] = []): void {
  const users = [user, ...extraUsers];
  Reflect.set(globalThis, 'User', {
    findOne: (criteria: Record<string, unknown>) => {
      if (criteria?.id !== undefined)
        return waterlineQuery(users.find(candidate => String(candidate.id) === String(criteria.id)));
      if (criteria?.username !== undefined) {
        return waterlineQuery(users.find(candidate => candidate.username === criteria.username));
      }
      return waterlineQuery(users[0]);
    },
    find: () => waterlineQuery(users),
    updateOne: () => waterlineQuery(undefined),
    addToCollection: () => ({ members: () => waterlineQuery([]) }),
    removeFromCollection: () => ({ members: () => waterlineQuery([]) }),
  });
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === code;
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
  ]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('Phase 5 acceptance findings', () => {
  describe('P5-003 grant compare-and-set', () => {
    function stubGrantGlobals(tuple: Record<string, unknown> | undefined): void {
      stubRoleGlobals(roleRow());
      stubUserGlobals(activeUser());
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(tuple),
        find: () => waterlineQuery([]),
        create: () => ({ fetch: () => waterlineQuery(undefined) }),
        updateOne: () => waterlineQuery(undefined),
      });
    }

    it('rejects an existing-tuple change without caller CAS as a stable version conflict', async () => {
      stubGrantGlobals({
        id: 'assignment-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'manual',
        sourceKey: 'manual',
        status: 'revoked',
        sourcePresent: true,
        assignedBy: 'operator-1',
        assignedAt: NOW,
        expiresAt: null,
        version: 2,
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.grantAssignment({
          actor: await brandActor(),
          brandId: 'brand-1',
          principalId: 'user-1',
          roleKey: 'researcher',
          source: 'manual',
          sourceKey: 'manual',
          requestId: 'grant-without-cas',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'denied');
    });

    it('rejects a stale caller version without mutating or auditing success', async () => {
      stubGrantGlobals({
        id: 'assignment-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'manual',
        sourceKey: 'manual',
        status: 'revoked',
        sourcePresent: true,
        assignedBy: 'operator-1',
        assignedAt: NOW,
        expiresAt: null,
        version: 2,
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.grantAssignment({
          actor: await brandActor(),
          brandId: 'brand-1',
          principalId: 'user-1',
          roleKey: 'researcher',
          source: 'manual',
          sourceKey: 'manual',
          expectedVersion: 1,
          requestId: 'grant-stale-cas',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(audits.succeeded.length, 0);
    });

    it('allows a demonstrable no-op without caller CAS', async () => {
      stubGrantGlobals({
        id: 'assignment-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'manual',
        sourceKey: 'manual',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'operator-1',
        assignedAt: NOW,
        expiresAt: null,
        version: 2,
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const result = await service.grantAssignment({
        actor: await brandActor(),
        brandId: 'brand-1',
        principalId: 'user-1',
        roleKey: 'researcher',
        source: 'manual',
        sourceKey: 'manual',
        requestId: 'grant-noop',
      });

      assert.equal(result.changed, false);
      assert.equal(result.version, 2);
    });
  });

  describe('P5-008 concurrent administrator removals', () => {
    it('fails the second writer with a stable 409 and a denied audit', async () => {
      const adminRole = roleRow({
        id: 'role-admin',
        key: 'brand-admin',
        name: 'brand-admin',
        protectedKind: 'brand-admin',
        version: 5,
      });
      let liveAssignmentVersion = 3;
      let liveRoleVersion = 5;
      stubRoleGlobals(adminRole);
      const admin = activeUser({ id: 'admin-1', username: 'admin-1' });
      const otherAdmin = activeUser({ id: 'admin-2', username: 'admin-2' });
      stubUserGlobals(admin, [otherAdmin]);
      const audits = capturedAudits();
      const liveTuple = (): Record<string, unknown> => ({
        id: 'assignment-admin-1',
        principalType: 'user',
        principalId: 'admin-1',
        role: 'role-admin',
        branding: 'brand-1',
        source: 'manual',
        sourceKey: 'manual',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'operator-1',
        assignedAt: NOW,
        expiresAt: null,
        version: liveAssignmentVersion,
      });
      const roleUpdateOne = async (criteria: Record<string, unknown>) => {
        if (Number(criteria?.version) !== liveRoleVersion) return undefined;
        liveRoleVersion += 1;
        return { ...adminRole, version: liveRoleVersion };
      };
      const assignmentUpdateOne = async (criteria: Record<string, unknown>) => {
        if (Number(criteria?.version) !== liveAssignmentVersion) return undefined;
        liveAssignmentVersion += 1;
        return { ...liveTuple(), status: 'revoked', version: liveAssignmentVersion };
      };
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(liveTuple()),
        find: () => waterlineQuery([liveTuple(), { ...liveTuple(), id: 'assignment-admin-2', principalId: 'admin-2' }]),
        updateOne: (criteria: Record<string, unknown>) => ({
          set: () => waterlineQuery(assignmentUpdateOne(criteria)),
        }),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = (criteria: Record<string, unknown>) => ({
        set: () => waterlineQuery(roleUpdateOne(criteria)),
      });
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
      const command = {
        actor: await brandActor(),
        brandId: 'brand-1',
        principalId: 'admin-1',
        roleKey: 'brand-admin',
        source: 'manual' as const,
        sourceKey: 'manual',
        expectedVersion: 3,
        requestId: 'revoke-admin',
      };

      const first = await service.revokeAssignment(command);
      assert.equal(first.changed, true);
      assert.equal(audits.succeeded.length, 1);

      await assert.rejects(service.revokeAssignment(command), hasCode('authorization.version-conflict'));
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'denied');
      assert.equal(audits.attempts[0].input.reasonCode as string, 'authorization.version-conflict');
    });
  });

  describe('P5-001 guarded disable with quorum and rollback', () => {
    function stubDisableGlobals(): {
      connections: unknown[];
      userUpdates: Record<string, unknown>[];
    } {
      const adminRole = roleRow({
        id: 'role-admin',
        key: 'brand-admin',
        name: 'brand-admin',
        protectedKind: 'brand-admin',
        version: 5,
      });
      stubRoleGlobals(adminRole);
      const target = activeUser({ id: 'user-1', username: 'user-1', loginDisabledVersion: 1 });
      stubUserGlobals(target);
      const connections: unknown[] = [];
      const userUpdates: Record<string, unknown>[] = [];
      const userGlobal = Reflect.get(globalThis, 'User') as Record<string, unknown>;
      userGlobal.updateOne = () => ({
        set: (values: Record<string, unknown>) => ({
          usingConnection: (connection: unknown) => {
            connections.push(connection);
            userUpdates.push(values);
            return waterlineQuery({ ...target, ...values });
          },
        }),
      });
      const tuple = {
        id: 'assignment-admin-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-admin',
        branding: 'brand-1',
        source: 'manual',
        sourceKey: 'manual',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'operator-1',
        assignedAt: NOW,
        expiresAt: null,
        version: 3,
      };
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: (criteria: Record<string, unknown>) => {
          connections.push('find');
          if (criteria?.role !== undefined) return waterlineQuery([tuple]);
          return waterlineQuery([tuple]);
        },
        updateOne: () => waterlineQuery(undefined),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => ({
        set: () => waterlineQuery({ ...adminRole, version: 6 }),
      });
      const legacyAudits: Record<string, unknown>[] = [];
      Reflect.set(globalThis, 'UserAudit', {
        create: (values: Record<string, unknown>) => {
          legacyAudits.push(values);
          return waterlineQuery({ id: 'legacy-audit-1' });
        },
      });
      return { connections, userUpdates };
    }

    it('blocks disabling the final brand administrator and rolls the mutation back', async () => {
      const { connections, userUpdates } = stubDisableGlobals();
      // Post-update quorum read: the disabled target no longer counts, and no
      // other administrator exists, so the quorum check must fail.
      const userGlobal = Reflect.get(globalThis, 'User') as Record<string, unknown>;
      userGlobal.find = () => waterlineQuery([]);
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.setUserAccess({
          actor: await brandActor(),
          brandId: 'brand-1',
          userId: 'user-1',
          disabled: true,
          expectedVersion: 1,
          requestId: 'disable-last-admin',
        }),
        hasCode('authorization.last-brand-admin')
      );
      // The in-transaction user write is abandoned with the transaction: no
      // success audit is recorded and the failure is audited as denied.
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
      assert.equal(userUpdates.length, 1);
      assert.ok(connections.includes(testConnection));
    });

    it('disables a non-final administrator with user and audit writes on one connection', async () => {
      const { connections } = stubDisableGlobals();
      const userGlobal = Reflect.get(globalThis, 'User') as Record<string, unknown>;
      userGlobal.find = () =>
        waterlineQuery([activeUser({ id: 'admin-2', username: 'admin-2', loginDisabledVersion: 1 })]);
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const result = await service.setUserAccess({
        actor: await brandActor(),
        brandId: 'brand-1',
        userId: 'user-1',
        disabled: true,
        expectedVersion: 1,
        requestId: 'disable-non-final-admin',
      });

      assert.equal(result.changed, true);
      assert.equal(result.version, 2);
      assert.equal(result.data.disabled, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 0);
      assert.ok(connections.includes(testConnection));
      const legacyCreate = Reflect.get(globalThis, 'UserAudit') as { create: { callsFake?: unknown } };
      assert.ok(legacyCreate !== undefined);
    });

    it('rejects a stale caller version as a stable conflict', async () => {
      stubDisableGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.setUserAccess({
          actor: await brandActor(),
          brandId: 'brand-1',
          userId: 'user-1',
          disabled: true,
          expectedVersion: 7,
          requestId: 'disable-stale',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(audits.succeeded.length, 0);
    });
  });

  describe('P5-002 atomic linking from authoritative assignments', () => {
    function stubLinkGlobals(): void {
      const researcher = roleRow();
      const other = roleRow({ id: 'role-other', key: 'other', name: 'other' });
      stubRoleGlobals(researcher, [other]);
      const primary = activeUser({ id: 'primary-1', username: 'primary-1' });
      const secondary = activeUser({ id: 'secondary-1', username: 'secondary-1', email: 's@example.com' });
      const userGlobal = {
        findOne: (criteria: Record<string, unknown>) => {
          if (String(criteria?.id) === 'primary-1') {
            return {
              populate: () => waterlineQuery({ ...primary, roles: [{ id: 'role-other', branding: 'brand-1' }] }),
              usingConnection: () => waterlineQuery(primary),
            };
          }
          // Transactional reads use usingConnection directly; legacy
          // projection reads use populate. The secondary projection is
          // deliberately empty to simulate legacy drift.
          return {
            populate: () => waterlineQuery({ ...secondary, roles: [] }),
            usingConnection: () => waterlineQuery(secondary),
          };
        },
        find: () => waterlineQuery([]),
        updateOne: () => ({
          set: (values: Record<string, unknown>) => ({
            usingConnection: () => waterlineQuery({ ...secondary, ...values }),
          }),
        }),
        addToCollection: () => ({ members: () => waterlineQuery([]) }),
        removeFromCollection: () => ({ members: () => waterlineQuery([]) }),
      };
      Reflect.set(globalThis, 'User', userGlobal);
      const primaryTuple = {
        id: 'assignment-primary-other',
        principalType: 'user',
        principalId: 'primary-1',
        role: 'role-other',
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
      const secondaryTuple = {
        id: 'assignment-secondary-1',
        principalType: 'user',
        principalId: 'secondary-1',
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
      const created: Record<string, unknown>[] = [];
      const revoked: string[] = [];
      const revokedIds = new Set<string>();
      const adoptedRoleIds = new Set<string>();
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: (criteria: Record<string, unknown>) => {
          if (String(criteria?.principalId) === 'secondary-1') {
            return waterlineQuery(revokedIds.has('assignment-secondary-1') ? [] : [secondaryTuple]);
          }
          if (String(criteria?.principalId) === 'primary-1') {
            const adopted = [...adoptedRoleIds].map(roleId => ({
              ...secondaryTuple,
              id: `assignment-adopted-${roleId}`,
              principalId: 'primary-1',
              role: roleId,
            }));
            return waterlineQuery([primaryTuple, ...adopted]);
          }
          return waterlineQuery([]);
        },
        create: (values: Record<string, unknown>) => {
          created.push(values);
          adoptedRoleIds.add(String((values as Record<string, unknown>).role ?? ''));
          return { fetch: () => waterlineQuery({ id: 'assignment-adopted-1', ...values }) };
        },
        updateOne: (criteria: Record<string, unknown>) => ({
          set: (values: Record<string, unknown>) => {
            revoked.push(String(criteria?.id));
            revokedIds.add(String(criteria?.id));
            return waterlineQuery({ ...secondaryTuple, ...values });
          },
        }),
      });
      Reflect.set(globalThis, 'UserLink', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: (values: Record<string, unknown>) => waterlineQuery({ id: 'link-1', ...values }),
      });
      Reflect.set(globalThis, 'UserAudit', {
        create: () => waterlineQuery({ id: 'legacy-link-audit-1' }),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => waterlineQuery(undefined);
      (globalThis as Record<string, unknown>).__phase5LinkWrites = { created, revoked };
    }

    it('adopts authoritative tuples even when the legacy projection drifted empty', async () => {
      stubLinkGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      // AUTH-LINK-PROOF-001: preview first, then apply with the pair-bound
      // proof. The idempotency key is suffixed per test because the
      // process-local link-operation mirror persists across tests while
      // preview nonces restart per service instance.
      const preview_link_drift = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-drift-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_drift.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_drift.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_drift.confirmationToken,
        linkOperationId: preview_link_drift.linkOperationId,
        // AUTH-P5-004: a caller-supplied rewrite count is never trusted for
        // progress accounting — the writer reports durable truth (0 with the
        // Record store unavailable here) and ignores this claim.
        recordsRewritten: 2,
        requestId: 'link-drift',
      });

      assert.equal(result.changed, true);
      assert.equal(result.data.rolesAdopted, 1);
      assert.equal(result.data.rolesRetired, 1);
      assert.equal(result.data.recordsRewritten, 0);
      assert.ok(typeof result.data.linkOperationId === 'string' && result.data.linkOperationId.length > 0);
      const writes = Reflect.get(globalThis, '__phase5LinkWrites') as {
        created: Record<string, unknown>[];
        revoked: string[];
      };
      assert.equal(writes.created.length, 1);
      assert.equal(writes.created[0].principalId, 'primary-1');
      assert.deepEqual(writes.revoked, ['assignment-secondary-1']);
      // Link + completion audits.
      // AUTH-TXN-001 honesty: the Record store is unstubbed (unavailable) in
      // these unit fakes, so completion is unverified and the result reports
      // pending drift with a pending audit — never a false completion.
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });

    it('rolls back the whole link when a secondary tuple changes mid-transaction', async () => {
      stubLinkGlobals();
      const assignmentGlobal = Reflect.get(globalThis, 'RoleAssignment') as Record<string, unknown>;
      // Simulate a concurrent writer: the secondary revoke CAS misses, so the
      // transaction must abort with no success audit and no link row.
      assignmentGlobal.updateOne = () => ({ set: () => waterlineQuery(undefined) });
      let linkCreated = false;
      const linkGlobal = Reflect.get(globalThis, 'UserLink') as Record<string, unknown>;
      linkGlobal.create = () => {
        linkCreated = true;
        return waterlineQuery({ id: 'link-1' });
      };
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_link_rollback = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-rollback-preview',
      });
      await assert.rejects(
        service.linkUserAccounts({
          actor: await brandActor(),
          brandId: 'brand-1',
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          primaryExpectedVersion: preview_link_rollback.primaryExpectedVersion,
          secondaryExpectedVersion: preview_link_rollback.secondaryExpectedVersion,
          linkConfirmationToken: preview_link_rollback.confirmationToken,
          linkOperationId: preview_link_rollback.linkOperationId,
          requestId: 'link-rollback',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(linkCreated, false);
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });
  });

  describe('P5-004 replace-external CAS contract and P5-005 no-op locks', () => {
    function stubReplaceGlobals(tuple: Record<string, unknown> | undefined): {
      roleUpdates: number;
    } {
      const adminRole = roleRow({
        id: 'role-admin',
        key: 'brand-admin',
        name: 'brand-admin',
        protectedKind: 'brand-admin',
        version: 5,
      });
      stubRoleGlobals(adminRole);
      stubUserGlobals(activeUser());
      const state = { roleUpdates: 0 };
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => ({
        set: () => {
          state.roleUpdates += 1;
          return waterlineQuery({ ...adminRole, version: 6 });
        },
      });
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery(tuple === undefined ? [] : [tuple]),
        create: () => ({ fetch: () => waterlineQuery({ id: 'assignment-new' }) }),
        updateOne: () => waterlineQuery(undefined),
      });
      return state;
    }

    it('enforces caller-pinned source state before counting or auditing anything', async () => {
      stubReplaceGlobals({
        id: 'assignment-ext-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-admin',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'oidc::researchers',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: null,
        version: 2,
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.replaceExternalAssignments({
          actor: await brandActor(),
          brandId: 'brand-1',
          principalId: 'user-1',
          provider: 'oidc',
          sourceKey: 'researchers',
          roleKeys: ['brand-admin'],
          expectedState: [{ roleKey: 'brand-admin', expectedVersion: 1 }],
          requestId: 'replace-pinned-stale',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });

    it('treats a lost CAS update as a version conflict with no success audit', async () => {
      stubReplaceGlobals({
        id: 'assignment-ext-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-admin',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'oidc::researchers',
        status: 'revoked',
        sourcePresent: false,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: null,
        version: 2,
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.replaceExternalAssignments({
          actor: await brandActor(),
          brandId: 'brand-1',
          principalId: 'user-1',
          provider: 'oidc',
          sourceKey: 'researchers',
          roleKeys: ['brand-admin'],
          requestId: 'replace-lost-update',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });

    it('leaves protected-role versions untouched on an identical no-op round trip', async () => {
      const state = stubReplaceGlobals({
        id: 'assignment-ext-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-admin',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'oidc::researchers',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: null,
        version: 2,
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const result = await service.replaceExternalAssignments({
        actor: await brandActor(),
        brandId: 'brand-1',
        principalId: 'user-1',
        provider: 'oidc',
        sourceKey: 'researchers',
        roleKeys: ['brand-admin'],
        requestId: 'replace-noop',
      });

      assert.equal(result.changed, false);
      assert.equal(result.data.noOp, 1);
      assert.equal(state.roleUpdates, 0);
    });
  });

  describe('P5-006 bulk denied-attempt audits', () => {
    function stubBulkGlobals(): void {
      stubRoleGlobals(roleRow());
      stubUserGlobals(activeUser());
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: () => ({ fetch: () => waterlineQuery({ id: 'assignment-bulk-1' }) }),
        updateOne: () => waterlineQuery(undefined),
      });
    }

    it('audits malformed batches as denied without a success event', async () => {
      stubBulkGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.applyBulkAssignments({
          actor: await brandActor(),
          brandId: 'brand-1',
          rows: 'this is not json{',
          requestId: 'bulk-malformed',
          confirmationToken: 'unused',
        }),
        hasCode('authorization.bulk-invalid')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'denied');
    });

    it('audits scope-denied batches as denied', async () => {
      stubBulkGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
      const reader = await brandActor(['authorization.assignment.read']);

      await assert.rejects(
        service.applyBulkAssignments({
          actor: reader,
          brandId: 'brand-1',
          rows: [{ action: 'grant', principalId: 'user-1', roleKey: 'researcher' }],
          requestId: 'bulk-scope-denied',
          confirmationToken: 'unused',
        }),
        hasCode('authorization.scope-denied')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });

    it('audits tampered confirmation batches as denied preview-stale', async () => {
      stubBulkGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
      const rows = [{ action: 'grant' as const, principalId: 'user-1', roleKey: 'researcher' }];
      const preview = await service.previewBulkAssignments({
        actor: await brandActor(),
        brandId: 'brand-1',
        rows,
        requestId: 'bulk-preview',
      });
      assert.ok(preview.confirmationToken !== undefined);

      await assert.rejects(
        service.applyBulkAssignments({
          actor: await brandActor(),
          brandId: 'brand-1',
          rows: [{ action: 'grant', principalId: 'user-1', roleKey: 'researcher', sourceKey: 'tampered' }],
          requestId: 'bulk-preview',
          confirmationToken: preview.confirmationToken ?? '',
        }),
        hasCode('authorization.preview-stale')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].input.reasonCode as string, 'authorization.preview-stale');
    });
  });

  describe('P5-007 configuration import batch preservation', () => {
    const registry = testRegistry();

    function importDocument(): Record<string, unknown> {
      return {
        schemaVersion: 1,
        templates: [
          {
            key: 'researcher',
            displayName: 'Researchers',
            description: 'Researcher template',
            protectedKind: 'none',
            status: 'active',
            version: 1,
            revisions: [{ revision: 1, scopeKeys: ['authorization.self.read'] }],
          },
        ],
        roles: [
          {
            brandId: 'brand-1',
            key: 'researcher',
            displayName: 'Researchers',
            protectedKind: 'none',
            status: 'active',
            templateKey: 'researcher',
            templateRevision: 1,
            effectiveScopeKeys: ['authorization.self.read'],
            version: 1,
          },
        ],
        assignments: [
          {
            principalId: 'user-1',
            brandId: 'brand-1',
            roleKey: 'researcher',
            source: 'manual',
            sourceKey: 'manual',
            status: 'active',
            sourcePresent: true,
            version: 1,
          },
        ],
      };
    }

    function stubImportGlobals(): void {
      const template = {
        id: 'template-1',
        key: 'researcher',
        displayName: 'Researchers',
        description: 'Researcher template',
        protectedKind: 'none',
        status: 'active',
        currentRevision: 1,
        version: 1,
      };
      const role = roleRow({ template: 'template-1', templateRevision: 1 });
      Reflect.set(globalThis, 'RoleTemplate', {
        findOne: (criteria: Record<string, unknown>) => {
          if (criteria?.key === 'researcher' || criteria?.id === 'template-1') return waterlineQuery(template);
          return waterlineQuery(undefined);
        },
        updateOne: () => waterlineQuery(undefined),
      });
      Reflect.set(globalThis, 'RoleTemplateRevision', {
        find: () => ({
          sort: () => ({ limit: () => waterlineQuery([{ revision: 1, scopeKeys: ['authorization.self.read'] }]) }),
        }),
        findOne: () => waterlineQuery({ revision: 1, scopeKeys: ['authorization.self.read'] }),
      });
      Reflect.set(globalThis, 'Role', {
        find: () => ({ limit: () => waterlineQuery([role]) }),
        findOne: () => waterlineQuery(role),
        updateOne: () => waterlineQuery(undefined),
      });
      Reflect.set(globalThis, 'RoleScopeOverride', {
        find: () => ({ sort: () => ({ limit: () => waterlineQuery([]) }) }),
      });
      stubUserGlobals(activeUser());
      const currentAssignment = {
        id: 'assignment-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'manual',
        sourceKey: 'manual',
        status: 'revoked',
        sourcePresent: true,
        assignedBy: 'operator-1',
        assignedAt: NOW,
        expiresAt: null,
        version: 1,
      };
      Reflect.set(globalThis, 'RoleAssignment', {
        find: () => ({ limit: () => waterlineQuery([currentAssignment]) }),
        findOne: () => waterlineQuery(undefined),
        create: () => ({ fetch: () => waterlineQuery({ id: 'assignment-new' }) }),
        updateOne: () => ({
          set: (values: Record<string, unknown>) => waterlineQuery({ ...currentAssignment, ...values }),
        }),
      });
      Reflect.set(globalThis, 'User', {
        findOne: () => waterlineQuery(activeUser()),
        find: () => waterlineQuery([]),
        addToCollection: () => ({ members: () => waterlineQuery([]) }),
        removeFromCollection: () => ({ members: () => waterlineQuery([]) }),
      });
      Reflect.set(globalThis, 'UserAudit', { create: () => waterlineQuery({ id: 'legacy-1' }) });
      Reflect.set(globalThis, 'UserLink', { findOne: () => waterlineQuery(undefined) });
    }

    async function applyWithBatch(batchId: string | undefined): Promise<{
      result: { batchId: string };
      audits: CapturedAudits;
    }> {
      stubImportGlobals();
      const audits = capturedAudits();
      const service = new ConfigurationServices.AuthorizationConfigurationService(
        serviceDependencies(audits, registry) as never
      );
      const document = parseAuthorizationConfigurationDocument(importDocument() as never);
      const previewActor = await systemActor();
      const preview = await service.previewImport({ actor: previewActor, document, requestId: 'import-preview' });
      assert.ok(preview.confirmationToken !== undefined);
      const result = (await service.applyImport({
        actor: await systemActor(),
        document,
        confirmationToken: preview.confirmationToken ?? '',
        ...(batchId === undefined ? {} : { batchId }),
        requestId: 'import-apply',
      })) as unknown as { batchId: string };
      return { result, audits };
    }

    it('preserves a caller-supplied batchId in the result and every audit row', async () => {
      const { result, audits } = await applyWithBatch('caller-batch-1');

      assert.equal(result.batchId, 'caller-batch-1');
      assert.ok(audits.succeeded.length >= 2);
      for (const event of audits.succeeded) {
        assert.equal(event.input.batchId as string, 'caller-batch-1');
      }
    });

    it('generates a batchId only when the caller omits one', async () => {
      const { result, audits } = await applyWithBatch(undefined);

      // Globally unique preview nonce: assert shape/stability, not an exact
      // per-instance counter value.
      assert.ok(typeof result.batchId === 'string' && result.batchId.startsWith('phase-5-id-'));
      for (const event of audits.succeeded) {
        assert.equal(event.input.batchId as string, result.batchId);
      }
    });
  });

  describe('P5-001 residual: true user CAS predicate', () => {
    it('pins the database predicate to the observed version so concurrent disable/enable cannot both succeed', async () => {
      const adminRole = roleRow({
        id: 'role-admin',
        key: 'brand-admin',
        name: 'brand-admin',
        protectedKind: 'brand-admin',
        version: 5,
      });
      stubRoleGlobals(adminRole);
      const staleTarget = activeUser({ id: 'user-1', username: 'user-1', loginDisabledVersion: 1 });
      stubUserGlobals(staleTarget);
      const userGlobal = Reflect.get(globalThis, 'User') as Record<string, unknown>;
      // Quorum survivor so the first disable commits.
      userGlobal.find = () =>
        waterlineQuery([activeUser({ id: 'admin-2', username: 'admin-2', loginDisabledVersion: 1 })]);
      let liveVersion = 1;
      let liveDisabled = false;
      const updateCriteria: Record<string, unknown>[] = [];
      userGlobal.updateOne = (criteria: Record<string, unknown>) => ({
        set: (values: Record<string, unknown>) => ({
          usingConnection: () => {
            updateCriteria.push({ ...criteria });
            if (Number(criteria?.loginDisabledVersion) !== liveVersion) return waterlineQuery(undefined);
            liveVersion = Number(values.loginDisabledVersion);
            liveDisabled = Boolean(values.loginDisabled);
            return waterlineQuery({ ...staleTarget, loginDisabled: liveDisabled, loginDisabledVersion: liveVersion });
          },
        }),
      });
      const tuple = {
        id: 'assignment-admin-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-admin',
        branding: 'brand-1',
        source: 'manual',
        sourceKey: 'manual',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'operator-1',
        assignedAt: NOW,
        expiresAt: null,
        version: 3,
      };
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([tuple]),
        updateOne: () => waterlineQuery(undefined),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => ({
        set: () => waterlineQuery({ ...adminRole, version: 6 }),
      });
      Reflect.set(globalThis, 'UserAudit', {
        create: () => waterlineQuery({ id: 'legacy-audit-1' }),
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
      const command = {
        actor: await brandActor(),
        brandId: 'brand-1',
        userId: 'user-1',
        disabled: true,
        expectedVersion: 1,
        requestId: 'disable-cas-race',
      };

      const first = await service.setUserAccess(command);
      assert.equal(first.changed, true);
      assert.equal(first.version, 2);
      // The database predicate must pin the observed version.
      assert.equal(updateCriteria.length, 1);
      assert.equal(updateCriteria[0].id as string, 'user-1');
      assert.equal(Number(updateCriteria[0].loginDisabledVersion), 1);

      // A concurrent writer holding the same stale read (version 1) must lose
      // the database CAS even though the in-memory caller check still passes.
      await assert.rejects(service.setUserAccess(command), hasCode('authorization.version-conflict'));
      assert.equal(updateCriteria.length, 2);
      assert.equal(Number(updateCriteria[1].loginDisabledVersion), 1);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].input.reasonCode as string, 'authorization.version-conflict');
    });
  });

  describe('P5-002 residual: sourced tuple preservation and legacy drift', () => {
    function stubSourcedLinkGlobals(): {
      created: Record<string, unknown>[];
      revoked: string[];
      projectionRemovals: string[];
      projectionAdds: string[];
    } {
      const researcher = roleRow();
      const staleRole = roleRow({ id: 'role-stale', key: 'stale', name: 'stale' });
      stubRoleGlobals(researcher, [staleRole]);
      const primary = activeUser({ id: 'primary-1', username: 'primary-1' });
      const secondary = activeUser({ id: 'secondary-1', username: 'secondary-1', email: 's@example.com' });
      const projectionRemovals: string[] = [];
      const projectionAdds: string[] = [];
      const userGlobal = {
        findOne: (criteria: Record<string, unknown>) => {
          if (String(criteria?.id) === 'primary-1') {
            return {
              populate: () => waterlineQuery({ ...primary, roles: [] }),
              usingConnection: () => waterlineQuery(primary),
            };
          }
          return {
            // Legacy projection drift: claims role-stale with no live tuple.
            populate: () => waterlineQuery({ ...secondary, roles: [{ id: 'role-stale', branding: 'brand-1' }] }),
            usingConnection: () => waterlineQuery(secondary),
          };
        },
        find: () => waterlineQuery([]),
        updateOne: () => ({
          set: (values: Record<string, unknown>) => ({
            usingConnection: () => waterlineQuery({ ...secondary, ...values }),
          }),
        }),
        addToCollection: (principalId: string, _collection: string) => ({
          members: (roleIds: string[]) => {
            projectionAdds.push(`${String(principalId)}:${roleIds.join(',')}`);
            return waterlineQuery([]);
          },
        }),
        removeFromCollection: (principalId: string, _collection: string) => ({
          members: (roleIds: string[]) => {
            projectionRemovals.push(`${String(principalId)}:${roleIds.join(',')}`);
            return waterlineQuery([]);
          },
        }),
      };
      Reflect.set(globalThis, 'User', userGlobal);
      const secondaryExternal = {
        id: 'assignment-secondary-ext',
        principalType: 'user',
        principalId: 'secondary-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'oidc::researchers',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: '2027-01-01T00:00:00.000Z',
        version: 4,
      };
      // Primary already holds the same role via a different source tuple.
      const primaryManual = {
        id: 'assignment-primary-manual',
        principalType: 'user',
        principalId: 'primary-1',
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
      const primaryAll: Record<string, unknown>[] = [{ ...primaryManual }];
      const created: Record<string, unknown>[] = [];
      const revoked: string[] = [];
      let secondaryRevoked = false;
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: (criteria: Record<string, unknown>) => {
          if (String(criteria?.principalId) === 'secondary-1') {
            return waterlineQuery(secondaryRevoked ? [] : [secondaryExternal]);
          }
          if (String(criteria?.principalId) === 'primary-1') {
            const adopted = created.map((values, index) => ({
              id: `assignment-adopted-${index}`,
              principalType: 'user',
              principalId: 'primary-1',
              role: values.role,
              branding: 'brand-1',
              source: values.source,
              sourceKey: values.sourceKey,
              status: 'active',
              sourcePresent: true,
              assignedBy: values.assignedBy,
              assignedAt: NOW,
              expiresAt: (values.expiresAt as string | undefined) ?? null,
              version: 1,
            }));
            const rows = [...primaryAll, ...adopted];
            if (criteria?.status === 'active') {
              return waterlineQuery(rows.filter(row => row.status === 'active' && row.sourcePresent === true));
            }
            return waterlineQuery(rows);
          }
          return waterlineQuery([]);
        },
        create: (values: Record<string, unknown>) => {
          created.push(values);
          return { fetch: () => waterlineQuery({ id: 'assignment-adopted-ext', ...values }) };
        },
        updateOne: (criteria: Record<string, unknown>) => ({
          set: (values: Record<string, unknown>) => {
            if (String(criteria?.id) === 'assignment-secondary-ext') {
              if (Number(criteria?.version) !== 4) return waterlineQuery(undefined);
              revoked.push(String(criteria?.id));
              secondaryRevoked = true;
              return waterlineQuery({ ...secondaryExternal, ...values });
            }
            return waterlineQuery(undefined);
          },
        }),
      });
      Reflect.set(globalThis, 'UserLink', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: (values: Record<string, unknown>) => waterlineQuery({ id: 'link-1', ...values }),
      });
      Reflect.set(globalThis, 'UserAudit', {
        create: () => waterlineQuery({ id: 'legacy-link-audit-1' }),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => waterlineQuery(undefined);
      return { created, revoked, projectionRemovals, projectionAdds };
    }

    it('preserves the sourced tuple instead of collapsing to a manual grant', async () => {
      const writes = stubSourcedLinkGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_link_sourced_tuple = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-sourced-tuple-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_sourced_tuple.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_sourced_tuple.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_sourced_tuple.confirmationToken,
        linkOperationId: preview_link_sourced_tuple.linkOperationId,
        requestId: 'link-sourced-tuple',
      });

      assert.equal(result.changed, true);
      assert.equal(result.data.rolesAdopted, 1);
      assert.equal(result.data.rolesRetired, 1);
      assert.equal(writes.created.length, 1);
      // The adopted grant must preserve source identity and expiry.
      assert.equal(writes.created[0].source as string, 'external');
      assert.equal(writes.created[0].sourceKey as string, 'oidc::researchers');
      assert.equal(writes.created[0].expiresAt as string, '2027-01-01T00:00:00.000Z');
      assert.deepEqual(writes.revoked, ['assignment-secondary-ext']);
      // AUTH-TXN-001 honesty: the Record store is unstubbed (unavailable) in
      // these unit fakes, so completion is unverified and the result reports
      // pending drift with a pending audit — never a false completion.
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });

    it('ignores legacy-only projection drift for adoption but heals the stale projection', async () => {
      const writes = stubSourcedLinkGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_link_legacy_drift = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-legacy-drift-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_legacy_drift.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_legacy_drift.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_legacy_drift.confirmationToken,
        linkOperationId: preview_link_legacy_drift.linkOperationId,
        requestId: 'link-legacy-drift',
      });

      // Only the authoritative external tuple is adopted; role-stale exists
      // solely in the legacy projection and must not create a grant.
      assert.equal(writes.created.length, 1);
      assert.ok(
        writes.created.every(created => String(created.role) !== 'role-stale'),
        'legacy-only roles must not be granted'
      );
      // The stale secondary projection is healed by removing role-stale.
      assert.ok(
        writes.projectionRemovals.some(entry => entry.startsWith('secondary-1:') && entry.includes('role-stale')),
        'stale legacy membership must be removed from the secondary projection'
      );
      // AUTH-TXN-001 honesty: the Record store is unstubbed (unavailable) in
      // these unit fakes, so completion is unverified and the result reports
      // pending drift with a pending audit — never a false completion.
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });

    function stubExpiredSourcedLinkGlobals(): {
      created: Record<string, unknown>[];
      revoked: string[];
      secondaryCriteria: Record<string, unknown>[];
    } {
      const researcher = roleRow();
      stubRoleGlobals(researcher);
      const primary = activeUser({ id: 'primary-1', username: 'primary-1' });
      const secondary = activeUser({ id: 'secondary-1', username: 'secondary-1', email: 's@example.com' });
      const userGlobal = {
        findOne: (criteria: Record<string, unknown>) => {
          if (String(criteria?.id) === 'primary-1') {
            return {
              populate: () => waterlineQuery({ ...primary, roles: [] }),
              usingConnection: () => waterlineQuery(primary),
            };
          }
          return {
            populate: () => waterlineQuery({ ...secondary, roles: [] }),
            usingConnection: () => waterlineQuery(secondary),
          };
        },
        find: () => waterlineQuery([]),
        updateOne: () => ({
          set: (values: Record<string, unknown>) => ({
            usingConnection: () => waterlineQuery({ ...secondary, ...values }),
          }),
        }),
        addToCollection: () => ({ members: () => waterlineQuery([]) }),
        removeFromCollection: () => ({ members: () => waterlineQuery([]) }),
      };
      Reflect.set(globalThis, 'User', userGlobal);
      // Inactive/expired authoritative sourced tuple: status active but past
      // expiry, so `activeAt` is false. A live-DB active/unexpired filter
      // would hide it; the all-rows link read must still consider it.
      const secondaryExpired = {
        id: 'assignment-secondary-exp',
        principalType: 'user',
        principalId: 'secondary-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'oidc::researchers',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: '2025-01-01T00:00:00.000Z',
        version: 4,
      };
      const primaryManual = {
        id: 'assignment-primary-manual',
        principalType: 'user',
        principalId: 'primary-1',
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
      const primaryAll: Record<string, unknown>[] = [{ ...primaryManual }];
      const created: Record<string, unknown>[] = [];
      const revoked: string[] = [];
      const secondaryCriteria: Record<string, unknown>[] = [];
      let secondaryRevoked = false;
      const isLive = (row: Record<string, unknown>): boolean => {
        if (row.status !== 'active' || row.sourcePresent !== true) return false;
        if (row.expiresAt == null) return true;
        return new Date(String(row.expiresAt)).getTime() > NOW.getTime();
      };
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: (criteria: Record<string, unknown>) => {
          if (String(criteria?.principalId) === 'secondary-1') {
            secondaryCriteria.push({ ...(criteria ?? {}) });
            // Emulate live-DB filtering: an active/unexpired query hides the
            // expired tuple, while the all-rows link read sees it.
            if (criteria?.status === 'active') return waterlineQuery(secondaryRevoked ? [] : []);
            return waterlineQuery(secondaryRevoked ? [] : [secondaryExpired]);
          }
          if (String(criteria?.principalId) === 'primary-1') {
            const adopted = created.map((values, index) => ({
              id: `assignment-adopted-${index}`,
              principalType: 'user',
              principalId: 'primary-1',
              role: values.role,
              branding: 'brand-1',
              source: values.source,
              sourceKey: values.sourceKey,
              status: 'active',
              sourcePresent: true,
              assignedBy: values.assignedBy,
              assignedAt: NOW,
              expiresAt: (values.expiresAt as string | undefined) ?? null,
              version: 1,
            }));
            const rows = [...primaryAll, ...adopted];
            if (criteria?.status === 'active') return waterlineQuery(rows.filter(isLive));
            return waterlineQuery(rows);
          }
          return waterlineQuery([]);
        },
        create: (values: Record<string, unknown>) => {
          created.push(values);
          return { fetch: () => waterlineQuery({ id: 'assignment-adopted-exp', ...values }) };
        },
        updateOne: (criteria: Record<string, unknown>) => ({
          set: (values: Record<string, unknown>) => {
            if (String(criteria?.id) === 'assignment-secondary-exp') {
              if (Number(criteria?.version) !== 4) return waterlineQuery(undefined);
              revoked.push(String(criteria?.id));
              secondaryRevoked = true;
              return waterlineQuery({ ...secondaryExpired, ...values });
            }
            return waterlineQuery(undefined);
          },
        }),
      });
      Reflect.set(globalThis, 'UserLink', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: (values: Record<string, unknown>) => waterlineQuery({ id: 'link-1', ...values }),
      });
      Reflect.set(globalThis, 'UserAudit', {
        create: () => waterlineQuery({ id: 'legacy-link-audit-1' }),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => waterlineQuery(undefined);
      return { created, revoked, secondaryCriteria };
    }

    it('leaves an expired authoritative sourced tuple non-effective without adopting it', async () => {
      const writes = stubExpiredSourcedLinkGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_link_expired_sourced_tuple = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-expired-sourced-tuple-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_expired_sourced_tuple.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_expired_sourced_tuple.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_expired_sourced_tuple.confirmationToken,
        linkOperationId: preview_link_expired_sourced_tuple.linkOperationId,
        requestId: 'link-expired-sourced-tuple',
      });

      // The authoritative secondary link read must be all-rows (no
      // active/unexpired filter) so the expired sourced tuple is
      // considered. Later projection/drift reads intentionally stay
      // active-filtered, so assert at least one all-rows read exists.
      assert.ok(writes.secondaryCriteria.length > 0);
      assert.ok(
        writes.secondaryCriteria.some(criteria => criteria.status !== 'active'),
        'secondary link read must include an all-rows authoritative read'
      );
      assert.equal(result.changed, true);
      // Expired rows remain non-effective and exactly preserved: never
      // adopted or reactivated as active on the primary, never collapsed
      // into a manual grant, and never collapsed to revoked (P5-G2).
      assert.equal(result.data.rolesAdopted, 0);
      assert.equal(result.data.rolesRetired, 0);
      assert.equal(writes.created.length, 0);
      assert.deepEqual(writes.revoked, []);
      // AUTH-TXN-001 honesty: the Record store is unstubbed (unavailable) in
      // these unit fakes, so completion is unverified and the result reports
      // pending drift with a pending audit — never a false completion.
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });

    it('preserves an expired sourced tuple without tuple writes even when updates would fail', async () => {
      stubExpiredSourcedLinkGlobals();
      const assignmentGlobal = Reflect.get(globalThis, 'RoleAssignment') as Record<string, unknown>;
      assignmentGlobal.updateOne = () => ({ set: () => waterlineQuery(undefined) });
      let linkCreated = false;
      const linkGlobal = Reflect.get(globalThis, 'UserLink') as Record<string, unknown>;
      const originalCreate = linkGlobal.create;
      linkGlobal.create = (values: Record<string, unknown>) => {
        linkCreated = true;
        return (originalCreate as (values: Record<string, unknown>) => unknown)(values);
      };
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      // Expired tuples are non-effective and preserved with no tuple writes
      // (P5-G2), so a failing tuple writer cannot abort the link; effective
      // rollback remains covered by the secondary-tuple rollback case above.
      const preview_link_expired_rollback = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-expired-rollback-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_expired_rollback.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_expired_rollback.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_expired_rollback.confirmationToken,
        linkOperationId: preview_link_expired_rollback.linkOperationId,
        requestId: 'link-expired-rollback',
      });
      assert.equal(result.data.rolesAdopted, 0);
      assert.equal(result.data.rolesRetired, 0);
      assert.equal(linkCreated, true);
      // AUTH-TXN-001 honesty: the Record store is unstubbed (unavailable) in
      // these unit fakes, so completion is unverified and the result reports
      // pending drift with a pending audit — never a false completion.
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });
  });

  describe('P5-002 residual: non-effective lifecycle and brand scope', () => {
    function stubLifecycleLinkGlobals(
      secondaryTuples: Record<string, unknown>[],
      extraRoles: readonly Record<string, unknown>[] = []
    ): {
      created: Record<string, unknown>[];
      revoked: string[];
      updateCriteria: Record<string, unknown>[];
    } {
      const researcher = roleRow();
      stubRoleGlobals(researcher, extraRoles);
      const primary = activeUser({ id: 'primary-1', username: 'primary-1' });
      const secondary = activeUser({ id: 'secondary-1', username: 'secondary-1', email: 's@example.com' });
      const userGlobal = {
        findOne: (criteria: Record<string, unknown>) => {
          if (String(criteria?.id) === 'primary-1') {
            return {
              populate: () => waterlineQuery({ ...primary, roles: [] }),
              usingConnection: () => waterlineQuery(primary),
            };
          }
          return {
            populate: () => waterlineQuery({ ...secondary, roles: [] }),
            usingConnection: () => waterlineQuery(secondary),
          };
        },
        find: () => waterlineQuery([]),
        updateOne: () => ({
          set: (values: Record<string, unknown>) => ({
            usingConnection: () => waterlineQuery({ ...secondary, ...values }),
          }),
        }),
        addToCollection: () => ({ members: () => waterlineQuery([]) }),
        removeFromCollection: () => ({ members: () => waterlineQuery([]) }),
      };
      Reflect.set(globalThis, 'User', userGlobal);
      const primaryManual = {
        id: 'assignment-primary-manual',
        principalType: 'user',
        principalId: 'primary-1',
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
      const primaryAll: Record<string, unknown>[] = [{ ...primaryManual }];
      const created: Record<string, unknown>[] = [];
      const revoked: string[] = [];
      const updateCriteria: Record<string, unknown>[] = [];
      const revokedIds = new Set<string>();
      const liveTuples = (): Record<string, unknown>[] =>
        secondaryTuples.filter(tuple => !revokedIds.has(String(tuple.id)));
      const isLive = (row: Record<string, unknown>): boolean => {
        if (row.status !== 'active' || row.sourcePresent !== true) return false;
        if (row.expiresAt == null) return true;
        return new Date(String(row.expiresAt)).getTime() > NOW.getTime();
      };
      const applyCriteria = (
        rows: Record<string, unknown>[],
        criteria: Record<string, unknown>
      ): Record<string, unknown>[] => {
        let filtered = [...rows];
        if (criteria?.status !== undefined) filtered = filtered.filter(row => row.status === criteria.status);
        if (criteria?.role !== undefined) filtered = filtered.filter(row => String(row.role) === String(criteria.role));
        if (criteria?.status === 'active') filtered = filtered.filter(isLive);
        return filtered;
      };
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: (criteria: Record<string, unknown>) => {
          if (String(criteria?.principalId) === 'secondary-1') {
            return waterlineQuery(applyCriteria(liveTuples(), criteria));
          }
          if (String(criteria?.principalId) === 'primary-1') {
            const adopted = created.map((values, index) => ({
              id: `assignment-adopted-${index}`,
              principalType: 'user',
              principalId: 'primary-1',
              role: values.role,
              branding: 'brand-1',
              source: values.source,
              sourceKey: values.sourceKey,
              status: 'active',
              sourcePresent: true,
              assignedBy: values.assignedBy,
              assignedAt: NOW,
              expiresAt: (values.expiresAt as string | undefined) ?? null,
              version: 1,
            }));
            const rows = [...primaryAll, ...adopted];
            if (criteria?.role !== undefined || criteria?.status !== undefined) {
              return waterlineQuery(applyCriteria(rows, criteria));
            }
            return waterlineQuery(rows);
          }
          return waterlineQuery([]);
        },
        create: (values: Record<string, unknown>) => {
          created.push(values);
          return { fetch: () => waterlineQuery({ id: `assignment-adopted-${created.length}`, ...values }) };
        },
        updateOne: (criteria: Record<string, unknown>) => ({
          set: (values: Record<string, unknown>) => {
            updateCriteria.push({ ...(criteria ?? {}) });
            const target = secondaryTuples.find(tuple => String(tuple.id) === String(criteria?.id));
            if (target === undefined) return waterlineQuery(undefined);
            if (Number(criteria?.version) !== Number(target.version)) return waterlineQuery(undefined);
            revoked.push(String(criteria?.id));
            revokedIds.add(String(criteria?.id));
            return waterlineQuery({ ...target, ...values });
          },
        }),
      });
      Reflect.set(globalThis, 'UserLink', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: (values: Record<string, unknown>) => waterlineQuery({ id: 'link-1', ...values }),
      });
      Reflect.set(globalThis, 'UserAudit', {
        create: () => waterlineQuery({ id: 'legacy-link-audit-1' }),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => waterlineQuery(undefined);
      return { created, revoked, updateCriteria };
    }

    it('never reactivates a revoked sourced tuple as active on the primary', async () => {
      const secondaryRevoked = {
        id: 'assignment-secondary-revoked',
        principalType: 'user',
        principalId: 'secondary-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'oidc::researchers',
        status: 'revoked',
        sourcePresent: false,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: null,
        revokedBy: 'operator-1',
        revokedAt: NOW,
        version: 4,
      };
      const writes = stubLifecycleLinkGlobals([secondaryRevoked]);
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_link_revoked_tuple = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-revoked-tuple-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_revoked_tuple.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_revoked_tuple.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_revoked_tuple.confirmationToken,
        linkOperationId: preview_link_revoked_tuple.linkOperationId,
        requestId: 'link-revoked-tuple',
      });

      assert.equal(result.data.rolesAdopted, 0);
      assert.equal(result.data.rolesRetired, 0);
      assert.equal(writes.created.length, 0);
      assert.deepEqual(writes.revoked, []);
      // The revoked tuple must not be converted into a manual grant either.
      assert.ok(
        writes.created.every(created => String(created.source) !== 'manual' || String(created.role) !== 'role-1'),
        'revoked tuples must not become manual grants'
      );
      // AUTH-TXN-001 honesty: the Record store is unstubbed (unavailable) in
      // these unit fakes, so completion is unverified and the result reports
      // pending drift with a pending audit — never a false completion.
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });

    it('never reactivates a suppressed sourced tuple as active on the primary', async () => {
      const secondarySuppressed = {
        id: 'assignment-secondary-sup',
        principalType: 'user',
        principalId: 'secondary-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'oidc::researchers',
        status: 'suppressed',
        sourcePresent: true,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: null,
        suppressedBy: 'operator-1',
        suppressedAt: NOW,
        version: 4,
      };
      const writes = stubLifecycleLinkGlobals([secondarySuppressed]);
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_link_suppressed_tuple = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-suppressed-tuple-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_suppressed_tuple.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_suppressed_tuple.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_suppressed_tuple.confirmationToken,
        linkOperationId: preview_link_suppressed_tuple.linkOperationId,
        requestId: 'link-suppressed-tuple',
      });

      // Suppressed rows remain non-effective and exactly preserved (P5-G2):
      // no adoption, no manual grant, and no collapse to revoked.
      assert.equal(result.data.rolesAdopted, 0);
      assert.equal(writes.created.length, 0);
      assert.ok(
        writes.created.every(created => String(created.role) !== 'role-1'),
        'suppressed tuples must not be reactivated or converted to manual grants'
      );
      assert.deepEqual(writes.revoked, []);
      assert.equal(result.data.rolesRetired, 0);
      // AUTH-TXN-001 honesty: the Record store is unstubbed (unavailable) in
      // these unit fakes, so completion is unverified and the result reports
      // pending drift with a pending audit — never a false completion.
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });

    it('retires only the requested brand and leaves unrelated brands untouched', async () => {
      const secondaryBrand1 = {
        id: 'assignment-secondary-brand1',
        principalType: 'user',
        principalId: 'secondary-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'oidc::researchers',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: null,
        version: 1,
      };
      // Non-effective foreign-brand tuple: suppressed, so the cross-brand
      // authority check (active tuples only) still passes while the
      // retirement loop must prove it leaves foreign brands alone.
      const secondaryBrand2 = {
        id: 'assignment-secondary-brand2',
        principalType: 'user',
        principalId: 'secondary-1',
        role: 'role-other',
        branding: 'brand-2',
        source: 'external',
        sourceKey: 'oidc::other',
        status: 'suppressed',
        sourcePresent: true,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: null,
        suppressedBy: 'operator-1',
        suppressedAt: NOW,
        version: 2,
      };
      const roleOther = roleRow({ id: 'role-other', key: 'other', name: 'other', branding: 'brand-2' });
      const writes = stubLifecycleLinkGlobals([secondaryBrand1, secondaryBrand2], [roleOther]);
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_link_cross_brand = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-cross-brand-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_cross_brand.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_cross_brand.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_cross_brand.confirmationToken,
        linkOperationId: preview_link_cross_brand.linkOperationId,
        requestId: 'link-cross-brand',
      });

      assert.equal(result.data.rolesAdopted, 1);
      assert.equal(result.data.rolesRetired, 1);
      assert.deepEqual(writes.revoked, ['assignment-secondary-brand1']);
      assert.ok(
        !writes.revoked.includes('assignment-secondary-brand2'),
        'unrelated brand assignments must not be retired'
      );
      assert.ok(
        writes.updateCriteria.every(criteria => String(criteria?.id) !== 'assignment-secondary-brand2'),
        'unrelated brand assignments must not be touched'
      );
      // AUTH-TXN-001 honesty: the Record store is unstubbed (unavailable) in
      // these unit fakes, so completion is unverified and the result reports
      // pending drift with a pending audit — never a false completion.
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });
  });
});
