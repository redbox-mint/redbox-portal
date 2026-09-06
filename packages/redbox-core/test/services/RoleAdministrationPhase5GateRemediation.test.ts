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

const CONFIRMATION_SECRET = 'phase-5-gate-remediation-secret-long-enough!!';
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

const testConnection = Object.freeze({ lease: 'phase-5-gate-test' }) as Sails.Connection;

let gateNonce = 0;

function serviceDependencies(
  audits: CapturedAudits,
  registry: ReturnType<typeof createScopeRegistry>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    now: () => new Date(NOW),
    randomId: () => `gate-id-${(gateNonce += 1)}`,
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
        { key: asScopeKey('authorization.assignment.manage'), label: 'Manage', description: 'Manage.', risk: 'admin' },
        { key: asScopeKey('authorization.assignment.read'), label: 'Read', description: 'Read.', risk: 'read' },
        { key: asScopeKey('authorization.role.manage'), label: 'Roles', description: 'Roles.', risk: 'admin' },
        { key: asScopeKey('authorization.role.read'), label: 'Read roles', description: 'Read.', risk: 'read' },
        { key: asScopeKey('authorization.self.read'), label: 'Self', description: 'Self.', risk: 'read' },
        { key: asScopeKey('system.authorization.manage'), label: 'System', description: 'System.', risk: 'system' },
        { key: asScopeKey('user.manage'), label: 'User manage', description: 'Legacy user manage.', risk: 'admin' },
        {
          key: asScopeKey('user.account-link.manage'),
          label: 'Link',
          description: 'Legacy link.',
          risk: 'admin',
        },
        { key: asScopeKey('record.read'), label: 'Record read', description: 'Read.', risk: 'read' },
        { key: asScopeKey('record.update'), label: 'Record write', description: 'Write.', risk: 'write' },
      ],
    },
  ]);
}

/** Genuine resolver-issued brand actor (real `AuthorizationService`, stub brand/registry). */
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
      let filtered = roles;
      if (criteria?.id !== undefined) {
        const ids = new Set(
          (Array.isArray(criteria.id) ? criteria.id : [criteria.id]).map((value: unknown) => String(value))
        );
        filtered = filtered.filter(candidate => ids.has(String(candidate.id)));
      } else if (Array.isArray(criteria?.or)) {
        const wanted = new Set(
          (criteria.or as Record<string, unknown>[]).map(entry => String(entry.key ?? entry.name ?? ''))
        );
        filtered = filtered.filter(
          candidate => wanted.has(String(candidate.key ?? '')) || wanted.has(String(candidate.name ?? ''))
        );
        if (criteria?.branding !== undefined) {
          filtered = filtered.filter(candidate => String(candidate.branding ?? '') === String(criteria.branding));
        }
      }
      return waterlineQuery(filtered);
    },
    findOne: (criteria: Record<string, unknown>) => {
      if (criteria?.key !== undefined || criteria?.name !== undefined) {
        const found = roles.find(
          candidate =>
            String(candidate.key ?? '') === String(criteria?.key ?? '\0') ||
            String(candidate.name ?? '') === String(criteria?.name ?? '\0')
        );
        return waterlineQuery(found);
      }
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
    'Record',
    'DeletedRecord',
    'AppConfig',
    'Form',
    'RecordType',
    'WorkflowStep',
  ]) {
    Reflect.deleteProperty(globalThis, name);
  }
  Reflect.deleteProperty(globalThis, '__phase5LinkWrites');
});

describe('Phase 5 gate remediation (P5-G1..P5-G9)', () => {
  describe('P5-G1 legacy loginDisabledVersion backfill', () => {
    function stubLegacyUserGlobals(): { criteria: Record<string, unknown>[] } {
      stubRoleGlobals(roleRow());
      // Legacy document: no loginDisabledVersion field at all.
      const legacy = activeUser({ id: 'user-1', username: 'user-1' });
      Reflect.deleteProperty(legacy, 'loginDisabledVersion');
      stubUserGlobals(legacy);
      const userGlobal = Reflect.get(globalThis, 'User') as Record<string, unknown>;
      const criteria: Record<string, unknown>[] = [];
      userGlobal.updateOne = (where: Record<string, unknown>) => ({
        set: (values: Record<string, unknown>) => ({
          usingConnection: () => {
            criteria.push({ ...where });
            return waterlineQuery({ ...legacy, ...values });
          },
        }),
      });
      userGlobal.find = () =>
        waterlineQuery([activeUser({ id: 'admin-2', username: 'admin-2', loginDisabledVersion: 1 })]);
      const memberTuple = {
        id: 'assignment-member-1',
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
        version: 1,
      };
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([memberTuple]),
        updateOne: () => waterlineQuery(undefined),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => ({ set: () => waterlineQuery({ ...roleRow(), version: 2 }) });
      Reflect.set(globalThis, 'UserAudit', { create: () => waterlineQuery({ id: 'legacy-1' }) });
      return { criteria };
    }

    it('treats a missing version as 1, matches missing/null, and persists version 2', async () => {
      const { criteria } = stubLegacyUserGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const result = await service.setUserAccess({
        actor: await brandActor(),
        brandId: 'brand-1',
        userId: 'user-1',
        disabled: true,
        requestId: 'legacy-backfill',
      });

      assert.equal(result.changed, true);
      assert.equal(result.version, 2);
      assert.equal(criteria.length, 1);
      const where = criteria[0] as Record<string, unknown>;
      assert.equal(String(where.id), 'user-1');
      const or = where.or as Record<string, unknown>[] | undefined;
      assert.ok(Array.isArray(or), 'legacy CAS predicate must match version 1 or missing/null');
      assert.equal(audits.succeeded.length, 1);
    });

    it('rejects a stale caller version for a legacy document as a stable conflict', async () => {
      stubLegacyUserGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.setUserAccess({
          actor: await brandActor(),
          brandId: 'brand-1',
          userId: 'user-1',
          disabled: true,
          expectedVersion: 7,
          requestId: 'legacy-stale',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });
  });

  describe('P5-G2 primary-collision conflict semantics', () => {
    function stubCollisionGlobals(primaryTuple: Record<string, unknown>): {
      created: Record<string, unknown>[];
      revoked: string[];
    } {
      stubRoleGlobals(roleRow());
      const primary = activeUser({ id: 'primary-1', username: 'primary-1' });
      const secondary = activeUser({ id: 'secondary-1', username: 'secondary-1', email: 's@example.com' });
      Reflect.set(globalThis, 'User', {
        findOne: (criteria: Record<string, unknown>) => {
          if (String(criteria?.id) === 'primary-1')
            return {
              populate: () => waterlineQuery({ ...primary, roles: [] }),
              usingConnection: () => waterlineQuery(primary),
            };
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
      });
      const secondaryEffective = {
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
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: (criteria: Record<string, unknown>) => {
          if (String(criteria?.principalId) === 'secondary-1') return waterlineQuery([secondaryEffective]);
          if (String(criteria?.principalId) === 'primary-1') return waterlineQuery([primaryTuple]);
          return waterlineQuery([]);
        },
        create: (values: Record<string, unknown>) => {
          created.push(values);
          return { fetch: () => waterlineQuery({ id: 'adopted', ...values }) };
        },
        updateOne: (criteria: Record<string, unknown>) => ({
          set: (values: Record<string, unknown>) => {
            revoked.push(String(criteria?.id));
            return waterlineQuery({ ...secondaryEffective, ...values });
          },
        }),
      });
      Reflect.set(globalThis, 'UserLink', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: (values: Record<string, unknown>) => waterlineQuery({ id: 'link-1', ...values }),
      });
      Reflect.set(globalThis, 'UserAudit', { create: () => waterlineQuery({ id: 'legacy-1' }) });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => waterlineQuery(undefined);
      return { created, revoked };
    }

    const primaryBase = {
      id: 'assignment-primary-1',
      principalType: 'user',
      principalId: 'primary-1',
      role: 'role-1',
      branding: 'brand-1',
      source: 'manual',
      sourceKey: 'manual',
      assignedBy: 'operator-1',
      assignedAt: NOW,
      version: 3,
    };

    it('denies when the primary holds the same tuple revoked, preserving both sides', async () => {
      const writes = stubCollisionGlobals({ ...primaryBase, status: 'revoked', sourcePresent: true, expiresAt: null });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      // Real collision path: preview proves the live pair, apply denies on the
      // divergent sourced tuple (not the entry gate).
      const preview_collision_revoked = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'collision-revoked-preview',
      });
      await assert.rejects(
        service.linkUserAccounts({
          actor: await brandActor(),
          brandId: 'brand-1',
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          primaryExpectedVersion: preview_collision_revoked.primaryExpectedVersion,
          secondaryExpectedVersion: preview_collision_revoked.secondaryExpectedVersion,
          linkConfirmationToken: preview_collision_revoked.confirmationToken,
          linkOperationId: preview_collision_revoked.linkOperationId,
          requestId: 'collision-revoked',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(writes.created.length, 0);
      assert.deepEqual(writes.revoked, []);
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });

    it('denies when the primary holds the same tuple suppressed', async () => {
      const writes = stubCollisionGlobals({
        ...primaryBase,
        status: 'suppressed',
        sourcePresent: true,
        expiresAt: null,
        suppressedBy: 'operator-1',
        suppressedAt: NOW,
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_collision_suppressed = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'collision-suppressed-preview',
      });
      await assert.rejects(
        service.linkUserAccounts({
          actor: await brandActor(),
          brandId: 'brand-1',
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          primaryExpectedVersion: preview_collision_suppressed.primaryExpectedVersion,
          secondaryExpectedVersion: preview_collision_suppressed.secondaryExpectedVersion,
          linkConfirmationToken: preview_collision_suppressed.confirmationToken,
          linkOperationId: preview_collision_suppressed.linkOperationId,
          requestId: 'collision-suppressed',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(writes.created.length, 0);
      assert.deepEqual(writes.revoked, []);
    });

    it('denies on divergent expiry instead of forcing the primary active', async () => {
      const writes = stubCollisionGlobals({
        ...primaryBase,
        status: 'active',
        sourcePresent: true,
        expiresAt: '2027-06-01T00:00:00.000Z',
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_collision_expiry = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'collision-expiry-preview',
      });
      await assert.rejects(
        service.linkUserAccounts({
          actor: await brandActor(),
          brandId: 'brand-1',
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          primaryExpectedVersion: preview_collision_expiry.primaryExpectedVersion,
          secondaryExpectedVersion: preview_collision_expiry.secondaryExpectedVersion,
          linkConfirmationToken: preview_collision_expiry.confirmationToken,
          linkOperationId: preview_collision_expiry.linkOperationId,
          requestId: 'collision-expiry',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(writes.created.length, 0);
      assert.deepEqual(writes.revoked, []);
      assert.equal(audits.succeeded.length, 0);
    });
  });

  describe('P5-G4 atomic role-set batch', () => {
    function stubBatchGlobals(): void {
      stubRoleGlobals(roleRow(), [roleRow({ id: 'role-2', key: 'second', name: 'second' })]);
      stubUserGlobals(activeUser());
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: () => ({ fetch: () => waterlineQuery({ id: 'assignment-new' }) }),
        updateOne: () => waterlineQuery(undefined),
      });
    }

    it('applies grants and removals in one transaction with one audit', async () => {
      stubBatchGlobals();
      const assignmentGlobal = Reflect.get(globalThis, 'RoleAssignment') as Record<string, unknown>;
      const created: Record<string, unknown>[] = [];
      assignmentGlobal.create = (values: Record<string, unknown>) => {
        created.push(values);
        return { fetch: () => waterlineQuery({ id: `created-${created.length}`, ...values }) };
      };
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const result = await service.applyUserRoleSet({
        actor: await brandActor(),
        brandId: 'brand-1',
        principalId: 'user-1',
        grants: [{ roleKey: 'researcher' }, { roleKey: 'second' }],
        removals: [],
        requestId: 'role-set-batch',
      });

      assert.equal(result.changed, true);
      assert.equal(result.data.granted, 2);
      assert.equal(created.length, 2);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 0);
    });

    it('rolls the whole batch back mid-sequence with a denied audit and no success', async () => {
      stubRoleGlobals(roleRow());
      stubUserGlobals(activeUser());
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: () => ({ fetch: () => waterlineQuery({ id: 'assignment-new' }) }),
        updateOne: () => waterlineQuery(undefined),
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.applyUserRoleSet({
          actor: await brandActor(),
          brandId: 'brand-1',
          principalId: 'user-1',
          grants: [{ roleKey: 'researcher' }, { roleKey: 'missing-role-key' }],
          removals: [],
          requestId: 'role-set-rollback',
        }),
        hasCode('authorization.not-found')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'denied');
    });
  });

  describe('P5-G6 legacy scope compatibility', () => {
    function stubAccessGlobals(): void {
      stubRoleGlobals(roleRow());
      stubUserGlobals(activeUser({ id: 'user-1', username: 'user-1', loginDisabledVersion: 1 }));
      const userGlobal = Reflect.get(globalThis, 'User') as Record<string, unknown>;
      userGlobal.find = () =>
        waterlineQuery([activeUser({ id: 'admin-2', username: 'admin-2', loginDisabledVersion: 1 })]);
      userGlobal.updateOne = () => ({
        set: (values: Record<string, unknown>) => ({
          usingConnection: () => waterlineQuery({ ...activeUser(), ...values }),
        }),
      });
      const memberTuple = {
        id: 'assignment-member-1',
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
        version: 1,
      };
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([memberTuple]),
        updateOne: () => waterlineQuery(undefined),
      });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => ({ set: () => waterlineQuery({ ...roleRow(), version: 2 }) });
      Reflect.set(globalThis, 'UserAudit', { create: () => waterlineQuery({ id: 'legacy-1' }) });
    }

    it('accepts the legacy user.manage scope for guarded disable', async () => {
      stubAccessGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const result = await service.setUserAccess({
        actor: await brandActor(['user.manage']),
        brandId: 'brand-1',
        userId: 'user-1',
        disabled: true,
        // AUTH-CAS-HTTP-001: CAS is required for versioned rows.
        expectedVersion: 1,
        requestId: 'legacy-scope-disable',
      });

      assert.equal(result.changed, true);
      assert.equal(audits.succeeded.length, 1);
    });

    it('requires CAS for versioned rows when omitted', async () => {
      stubAccessGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.setUserAccess({
          actor: await brandActor(['user.manage']),
          brandId: 'brand-1',
          userId: 'user-1',
          disabled: true,
          requestId: 'legacy-scope-disable-no-cas',
        }),
        hasCode('authorization.version-conflict')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });

    it('rejects actors with neither assignment nor legacy scope', async () => {
      stubAccessGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.setUserAccess({
          actor: await brandActor(['authorization.assignment.read']),
          brandId: 'brand-1',
          userId: 'user-1',
          disabled: true,
          requestId: 'scope-denied',
        }),
        hasCode('authorization.scope-denied')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });
  });

  describe('P5-G7 external replacement denied audits', () => {
    function stubExternalGlobals(): void {
      stubRoleGlobals(roleRow({ id: 'role-admin', key: 'brand-admin', name: 'brand-admin' }));
      stubUserGlobals(activeUser());
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: () => ({ fetch: () => waterlineQuery({ id: 'assignment-new' }) }),
        updateOne: () => waterlineQuery(undefined),
      });
    }

    it('audits scope-denied replacement attempts as denied', async () => {
      stubExternalGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.replaceExternalAssignments({
          actor: await brandActor(['authorization.assignment.read']),
          brandId: 'brand-1',
          principalId: 'user-1',
          provider: 'oidc',
          sourceKey: 'researchers',
          roleKeys: ['brand-admin'],
          requestId: 'external-scope-denied',
        }),
        hasCode('authorization.scope-denied')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'denied');
    });

    it('audits malformed expected-state as denied without a success event', async () => {
      stubExternalGlobals();
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
          expectedState: [
            { roleKey: 'brand-admin', expectedVersion: 1 },
            { roleKey: 'brand-admin', expectedVersion: 1 },
          ],
          requestId: 'external-malformed',
        }),
        hasCode('authorization.bulk-invalid')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });
  });

  describe('P5-G9 risk-broadening warnings', () => {
    function stubScopeGlobals(): void {
      const researcher = {
        id: 'role-1',
        name: 'researcher',
        key: 'researcher',
        displayName: 'Researchers',
        contextType: 'brand',
        branding: 'brand-1',
        protectedKind: 'none',
        status: 'active',
        version: 1,
      };
      Reflect.set(globalThis, 'Role', {
        find: () => ({ limit: () => waterlineQuery([researcher]) }),
        findOne: () => ({ populate: () => waterlineQuery({ ...researcher, users: [] }) }),
        updateOne: () => waterlineQuery(undefined),
      });
      Reflect.set(globalThis, 'RoleTemplate', { findOne: () => waterlineQuery(undefined) });
      Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: () => waterlineQuery(undefined) });
      Reflect.set(globalThis, 'RoleScopeOverride', {
        find: () => ({ sort: () => waterlineQuery([{ scopeKey: 'record.read', effect: 'allow' }]) }),
      });
      Reflect.set(globalThis, 'RoleAssignment', {
        count: () => waterlineQuery(0),
        find: () => ({ limit: () => waterlineQuery([]) }),
      });
      const emptyNativeModel = (tableName: string) => ({
        tableName,
        getDatastore: () => ({
          manager: {
            collection: () => ({
              find: () => ({ limit: () => ({ toArray: () => Promise.resolve([]) }) }),
            }),
          },
        }),
      });
      Reflect.set(globalThis, 'Record', emptyNativeModel('record'));
      Reflect.set(globalThis, 'DeletedRecord', emptyNativeModel('deletedrecord'));
      for (const model of ['AppConfig', 'Form', 'RecordType', 'WorkflowStep']) {
        Reflect.set(globalThis, model, { find: () => ({ limit: () => waterlineQuery([]) }) });
      }
      Reflect.set(globalThis, 'sails', {
        ...(Reflect.get(globalThis, 'sails') as object | undefined),
        config: {},
        models: {},
      });
    }

    it('returns explicit broadening warnings when adding an admin scope', async () => {
      stubScopeGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview = await service.previewRoleScopes({
        actor: await brandActor([
          'authorization.role.manage',
          'authorization.assignment.manage',
          'record.read',
          'record.update',
        ]),
        brandId: 'brand-1',
        roleKey: 'researcher',
        expectedVersion: 1,
        desiredScopeKeys: [asScopeKey('record.read'), asScopeKey('record.update')] as never,
        requestId: 'scope-broadening',
      });

      assert.ok(preview.addedScopeKeys.length > 0);
      assert.ok(
        preview.warnings.some(warning => warning === 'risk-broadening:write'),
        `expected write broadening, got ${JSON.stringify(preview.warnings)}`
      );
      assert.ok(
        preview.warnings.some(warning => warning.startsWith('risk-level-increased:')),
        `expected level increase, got ${JSON.stringify(preview.warnings)}`
      );
    });

    it('returns no warnings when the scope set does not broaden', async () => {
      stubScopeGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview = await service.previewRoleScopes({
        actor: await brandActor(['authorization.role.manage', 'record.read']),
        brandId: 'brand-1',
        roleKey: 'researcher',
        expectedVersion: 1,
        desiredScopeKeys: [asScopeKey('record.read')] as never,
        requestId: 'scope-no-broadening',
      });

      assert.deepEqual([...preview.warnings], []);
    });
  });

  describe('P5-Gate-F account-link atomicity (single writer transaction)', () => {
    function stubAtomicLinkGlobals(recordRow: Record<string, unknown>): {
      recordUpdates: { criteria: Record<string, unknown>; values: Record<string, unknown>; connection: unknown }[];
      recordFindConnections: unknown[];
      linkCreates: { values: Record<string, unknown>; connection: unknown }[];
      assignmentCreates: Record<string, unknown>[];
      assignmentUpdates: { criteria: Record<string, unknown>; connection: unknown }[];
    } {
      stubRoleGlobals(roleRow());
      const primary = activeUser({ id: 'primary-1', username: 'primary-1' });
      const secondary = activeUser({
        id: 'secondary-1',
        username: 'secondary-1',
        email: 'secondary@example.com',
      });
      Reflect.set(globalThis, 'User', {
        findOne: (criteria: Record<string, unknown>) => {
          const isPrimary = String(criteria?.id) === 'primary-1';
          const target = isPrimary ? primary : secondary;
          return {
            populate: () =>
              waterlineQuery({
                ...target,
                roles: isPrimary ? [{ id: 'role-1', branding: 'brand-1' }] : [],
              }),
            usingConnection: () => waterlineQuery(target),
          };
        },
        find: () => waterlineQuery([]),
        updateOne: () => ({
          set: (values: Record<string, unknown>) => ({
            usingConnection: () => waterlineQuery({ ...secondary, ...values }),
          }),
        }),
        addToCollection: () => ({ members: () => ({ usingConnection: () => waterlineQuery([]) }) }),
        removeFromCollection: () => ({ members: () => ({ usingConnection: () => waterlineQuery([]) }) }),
      });
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
      const assignmentCreates: Record<string, unknown>[] = [];
      const assignmentUpdates: { criteria: Record<string, unknown>; connection: unknown }[] = [];
      let secondaryRevoked = false;
      const adoptedPrimary: Record<string, unknown>[] = [];
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => waterlineQuery(undefined),
        find: (criteria: Record<string, unknown>) => {
          if (String(criteria?.principalId) === 'secondary-1') {
            return waterlineQuery(secondaryRevoked ? [] : [secondaryTuple]);
          }
          if (String(criteria?.principalId) === 'primary-1') return waterlineQuery([...adoptedPrimary]);
          return waterlineQuery([]);
        },
        create: (values: Record<string, unknown>) => {
          assignmentCreates.push(values);
          adoptedPrimary.push({
            id: `adopted-${adoptedPrimary.length + 1}`,
            principalType: 'user',
            principalId: 'primary-1',
            role: (values as Record<string, unknown>).role,
            branding: 'brand-1',
            source: (values as Record<string, unknown>).source,
            sourceKey: (values as Record<string, unknown>).sourceKey,
            status: 'active',
            sourcePresent: true,
            assignedBy: (values as Record<string, unknown>).assignedBy,
            assignedAt: NOW,
            expiresAt: (values as Record<string, unknown>).expiresAt ?? null,
            version: 1,
          });
          return { fetch: () => ({ usingConnection: () => waterlineQuery({ id: 'adopted-1', ...values }) }) };
        },
        updateOne: (criteria: Record<string, unknown>) => ({
          set: (values: Record<string, unknown>) => ({
            usingConnection: (connection: unknown) => {
              assignmentUpdates.push({ criteria: { ...criteria }, connection });
              if (String(criteria?.id) === 'assignment-secondary-1') {
                if (Number(criteria?.version) !== 1) return waterlineQuery(undefined);
                secondaryRevoked = true;
              }
              return waterlineQuery({ ...secondaryTuple, ...values });
            },
          }),
        }),
      });
      const linkCreates: { values: Record<string, unknown>; connection: unknown }[] = [];
      Reflect.set(globalThis, 'UserLink', {
        findOne: () => waterlineQuery(undefined),
        find: () => waterlineQuery([]),
        create: (values: Record<string, unknown>) => ({
          usingConnection: (connection: unknown) => {
            linkCreates.push({ values: { ...values }, connection });
            return waterlineQuery({ id: 'link-1', ...values });
          },
        }),
      });
      Reflect.set(globalThis, 'UserAudit', { create: () => waterlineQuery({ id: 'legacy-1' }) });
      const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
      roleGlobal.updateOne = () => waterlineQuery(undefined);

      // AUTH-TXN-001: records live on a separate datastore and MUST NOT receive
      // the Role transaction connection. The stub records whether any caller
      // incorrectly threads a connection through.
      const recordUpdates: {
        criteria: Record<string, unknown>;
        values: Record<string, unknown>;
        connection: unknown;
      }[] = [];
      const recordFindConnections: unknown[] = [];
      Reflect.set(globalThis, 'Record', {
        find: (criteria: Record<string, unknown>) => {
          const query = waterlineQuery([recordRow]) as unknown as Record<string, unknown>;
          const withMeta = {
            ...query,
            meta: () => waterlineQuery([recordRow]),
          } as unknown as Record<string, (...args: never[]) => unknown>;
          void criteria;
          return withMeta;
        },
        updateOne: (criteria: Record<string, unknown>) => ({
          set: (values: Record<string, unknown>) => {
            recordUpdates.push({ criteria: { ...criteria }, values: { ...values }, connection: undefined });
            return waterlineQuery({ ...recordRow, ...values });
          },
        }),
      });
      // Detect incorrect connection threading if production regresses: wrap the
      // query prototype is unnecessary — any usingConnection call on Record
      // would throw here because the stub exposes no such method on set().
      return { recordUpdates, recordFindConnections, linkCreates, assignmentCreates, assignmentUpdates };
    }

    const recordFixture = {
      redboxOid: 'record-1',
      revision: 7,
      metaMetadata: { brandId: 'brand-1' },
      authorization: {
        edit: ['secondary-1'],
        view: [],
        editPending: [],
        viewPending: [],
      },
    };

    it('leaves records untouched when scope validation fails after planning', async () => {
      const writes = stubAtomicLinkGlobals(recordFixture);
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.linkUserAccounts({
          actor: await brandActor(['authorization.assignment.read']),
          brandId: 'brand-1',
          primaryUserId: 'primary-1',
          secondaryUserId: 'secondary-1',
          requestId: 'link-scope-denied-atomic',
        }),
        hasCode('authorization.scope-denied')
      );
      assert.equal(writes.recordUpdates.length, 0);
      assert.equal(writes.recordFindConnections.length, 0);
      assert.equal(writes.linkCreates.length, 0);
      assert.equal(writes.assignmentCreates.length, 0);
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'denied');
    });

    it('rewrites records in a separate Record-datastore phase with brand/revision CAS', async () => {
      const writes = stubAtomicLinkGlobals(recordFixture);
      const audits = capturedAudits();
      let transactionCalls = 0;
      const deps = serviceDependencies(audits, testRegistry(), {
        runTransaction: (work: (connection: Sails.Connection) => Promise<unknown>) => {
          transactionCalls += 1;
          return work(testConnection);
        },
      });
      const service = new Services.RoleAdministrationService(deps as never);

      const preview_link_atomic_success = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-atomic-success-preview',
      });
      // The preview above consumed one transaction; only the apply-phase
      // transactions (mutation + completion audit) count below.
      transactionCalls = 0;
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_atomic_success.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_atomic_success.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_atomic_success.confirmationToken,
        linkOperationId: preview_link_atomic_success.linkOperationId,
        requestId: 'link-atomic-success',
      });

      // AUTH-TXN-001: authorization commits once; records run afterwards on
      // their own datastore without the Role connection. The completion audit
      // runs in its own second transaction.
      assert.equal(result.changed, true);
      assert.equal(result.data.recordsRewritten, 1);
      assert.equal(result.data.recordsPending, false);
      assert.ok(typeof result.data.linkOperationId === 'string' && result.data.linkOperationId.length > 0);
      assert.equal(transactionCalls, 2);
      assert.equal(writes.recordUpdates.length, 1);
      assert.equal(writes.recordFindConnections.length, 0);
      assert.equal(writes.recordUpdates[0].connection, undefined);
      assert.deepEqual((writes.recordUpdates[0].values.authorization as Record<string, unknown>).edit, ['primary-1']);
      // Brand/revision CAS predicates travel with the record write.
      assert.equal(String((writes.recordUpdates[0].criteria as Record<string, unknown>).redboxOid), 'record-1');
      assert.equal(Number((writes.recordUpdates[0].criteria as Record<string, unknown>).revision), 7);
      assert.equal(Number((writes.recordUpdates[0].values as Record<string, unknown>).revision), 8);
      assert.equal(writes.linkCreates.length, 1);
      assert.equal(writes.linkCreates[0].connection, testConnection);
      assert.equal(writes.assignmentUpdates.length, 1);
      assert.equal(writes.assignmentUpdates[0].connection, testConnection);
      assert.equal(audits.succeeded.length, 2);
      assert.equal(audits.succeeded[1].input.eventType as string, 'user.link-operation-completed');
    });

    it('keeps the committed link but reports pending drift when the record phase fails', async () => {
      stubAtomicLinkGlobals(recordFixture);
      const recordGlobal = Reflect.get(globalThis, 'Record') as Record<string, unknown>;
      (recordGlobal.updateOne as (criteria: Record<string, unknown>) => unknown) = () => ({
        set: () => waterlineQuery(undefined),
      });
      let linkCreated = false;
      const linkGlobal = Reflect.get(globalThis, 'UserLink') as Record<string, unknown>;
      linkGlobal.create = (values: Record<string, unknown>) => ({
        usingConnection: () => {
          linkCreated = true;
          return waterlineQuery({ id: 'link-1', ...values });
        },
      });
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      // AUTH-TXN-001: no distributed transaction exists, so a record failure
      // cannot roll back the committed authorization state. It is reported as
      // pending drift for operator reconciliation.
      const preview_link_record_failure = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-record-failure-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_record_failure.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_record_failure.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_record_failure.confirmationToken,
        linkOperationId: preview_link_record_failure.linkOperationId,
        requestId: 'link-record-failure',
      });
      assert.equal(linkCreated, true);
      assert.equal(result.changed, true);
      assert.equal(result.data.recordsRewritten, 0);
      assert.equal(result.data.recordsPending, true);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
      assert.equal(audits.attempts[0].outcome, 'failed');
    });

    it('treats cross-brand records as not-found and reports pending drift', async () => {
      const crossBrand = {
        ...recordFixture,
        metaMetadata: { brandId: 'brand-2' },
      };
      stubAtomicLinkGlobals(crossBrand);
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      const preview_link_cross_brand_record = await service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: 'link-cross-brand-record-preview',
      });
      const result = await service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: preview_link_cross_brand_record.primaryExpectedVersion,
        secondaryExpectedVersion: preview_link_cross_brand_record.secondaryExpectedVersion,
        linkConfirmationToken: preview_link_cross_brand_record.confirmationToken,
        linkOperationId: preview_link_cross_brand_record.linkOperationId,
        requestId: 'link-cross-brand-record',
      });
      assert.equal(result.data.recordsPending, true);
      assert.equal(result.data.recordsRewritten, 0);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 1);
    });
    describe('Independent review remediation (AUTH-P5-003/004/005)', () => {
      describe('AUTH-P5-003 bounded discovery before await', () => {
        it('fails closed before any authority mutation when the record surface lacks a limit capability', async () => {
          stubAtomicLinkGlobals(recordFixture);
          // Limit-less query surface: find/meta WITHOUT a limit capability
          // anywhere (meta resolves to a plain array, not a limit-bearing query).
          Reflect.set(globalThis, 'Record', {
            find: () => ({
              meta: () => Promise.resolve([recordFixture]),
            }),
            updateOne: () => ({ set: () => waterlineQuery(undefined) }),
          });
          const audits = capturedAudits();
          const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

          const preview = await service.previewLinkAccounts({
            actor: await brandActor(),
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            requestId: 'link-no-limit-preview',
          });
          // AUTH-TXN-001 durable plan: the bounded record plan is discovered
          // BEFORE any authority mutation. An unbounded surface fails the
          // whole link with 409 (no authorization commit, no partial drift)
          // instead of committing first and drifting later.
          await assert.rejects(
            service.linkUserAccounts({
              actor: await brandActor(),
              brandId: 'brand-1',
              primaryUserId: 'primary-1',
              secondaryUserId: 'secondary-1',
              primaryExpectedVersion: preview.primaryExpectedVersion,
              secondaryExpectedVersion: preview.secondaryExpectedVersion,
              linkConfirmationToken: preview.confirmationToken,
              linkOperationId: preview.linkOperationId,
              requestId: 'link-no-limit',
            }),
            hasCode('authorization.query-bound-exceeded')
          );

          // No authorization commit happened: no success audit, and the failed
          // transition is durable for operators.
          assert.equal(
            audits.succeeded.filter(event => (event as { eventType?: string }).eventType === 'user.linked').length,
            0
          );
          const failed = await service.getLinkOperation(
            await brandActor(['authorization.assignment.read']),
            'brand-1',
            preview.linkOperationId
          );
          assert.equal(failed.status, 'failed');
        });
      });

      describe('AUTH-P5-004 retry provenance, scope, and operation binding', () => {
        async function completedLinkOperation(): Promise<{
          service: Services.RoleAdministrationService;
          operationId: string;
          primaryExpectedVersion: number;
          secondaryExpectedVersion: number;
          linkConfirmationToken: string;
        }> {
          stubAtomicLinkGlobals(recordFixture);
          const audits = capturedAudits();
          const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
          const preview = await service.previewLinkAccounts({
            actor: await brandActor(),
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            requestId: 'link-retry-gate-preview',
          });
          await service.linkUserAccounts({
            actor: await brandActor(),
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            primaryExpectedVersion: preview.primaryExpectedVersion,
            secondaryExpectedVersion: preview.secondaryExpectedVersion,
            linkConfirmationToken: preview.confirmationToken,
            linkOperationId: preview.linkOperationId,
            requestId: 'link-retry-gate',
          });
          return {
            service,
            operationId: preview.linkOperationId,
            primaryExpectedVersion: preview.primaryExpectedVersion,
            secondaryExpectedVersion: preview.secondaryExpectedVersion,
            linkConfirmationToken: preview.confirmationToken,
          };
        }

        it('rejects a retry with a forged (non-server-issued) actor', async () => {
          const { service, operationId, primaryExpectedVersion, secondaryExpectedVersion, linkConfirmationToken } =
            await completedLinkOperation();
          const forged = freezeAuthorizationContext({
            contextType: 'brand',
            principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'attacker' },
            brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1', exists: true, authorized: true },
            roles: [],
            compatibilityRoles: [],
            grantedScopeKeys: ['user.account-link.manage'] as never,
            effectiveScopeKeys: ['user.account-link.manage'] as never,
            scopeProvenance: [
              { scopeKey: 'user.account-link.manage', roleIds: ['role-1'], roleKeys: ['researcher' as never] },
            ] as never,
          });
          await assert.rejects(
            service.retryLinkOperation({
              actor: forged,
              brandId: 'brand-1',
              primaryUserId: 'primary-1',
              secondaryUserId: 'secondary-1',
              primaryExpectedVersion,
              secondaryExpectedVersion,
              linkConfirmationToken,
              linkOperationId: operationId,
              requestId: 'link-retry-forged',
            }),
            hasCode('authorization.authentication-required')
          );
        });

        it('rejects a retry whose actor lacks the link scope', async () => {
          const { service, operationId, primaryExpectedVersion, secondaryExpectedVersion, linkConfirmationToken } =
            await completedLinkOperation();
          await assert.rejects(
            service.retryLinkOperation({
              actor: await brandActor(['authorization.assignment.read']),
              brandId: 'brand-1',
              primaryUserId: 'primary-1',
              secondaryUserId: 'secondary-1',
              primaryExpectedVersion,
              secondaryExpectedVersion,
              linkConfirmationToken,
              linkOperationId: operationId,
              requestId: 'link-retry-scope',
            }),
            hasCode('authorization.scope-denied')
          );
        });

        it('rejects a retry without the explicit preview operation ID', async () => {
          const { service, primaryExpectedVersion, secondaryExpectedVersion, linkConfirmationToken } =
            await completedLinkOperation();
          await assert.rejects(
            service.retryLinkOperation({
              actor: await brandActor(),
              brandId: 'brand-1',
              primaryUserId: 'primary-1',
              secondaryUserId: 'secondary-1',
              primaryExpectedVersion,
              secondaryExpectedVersion,
              linkConfirmationToken,
              linkOperationId: '',
              requestId: 'link-retry-no-op-id',
            }),
            hasCode('authorization.preview-stale')
          );
        });

        it('resumes the completed operation idempotently on a bound retry', async () => {
          const { service, operationId, primaryExpectedVersion, secondaryExpectedVersion, linkConfirmationToken } =
            await completedLinkOperation();
          const resumed = await service.retryLinkOperation({
            actor: await brandActor(),
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            primaryExpectedVersion,
            secondaryExpectedVersion,
            linkConfirmationToken,
            linkOperationId: operationId,
            requestId: 'link-retry-bound',
          });
          assert.equal(resumed.changed, false);
        });

        it('rejects a retry whose versions drift from the stored proof', async () => {
          const { service, operationId, secondaryExpectedVersion, linkConfirmationToken } =
            await completedLinkOperation();
          await assert.rejects(
            service.retryLinkOperation({
              actor: await brandActor(),
              brandId: 'brand-1',
              primaryUserId: 'primary-1',
              secondaryUserId: 'secondary-1',
              primaryExpectedVersion: 999,
              secondaryExpectedVersion,
              linkConfirmationToken,
              linkOperationId: operationId,
              requestId: 'link-retry-version-drift',
            }),
            hasCode('authorization.version-conflict')
          );
        });

        it('rejects a retry whose confirmation token does not reproduce the stored proof', async () => {
          // Force a pending operation: the record rewrite loses CAS, so the
          // authorization commits but the record phase stays pending with a
          // complete durable proof.
          stubAtomicLinkGlobals(recordFixture);
          const recordGlobal = Reflect.get(globalThis, 'Record') as Record<string, unknown>;
          const blockedFind = recordGlobal.find;
          Reflect.set(globalThis, 'Record', {
            find: blockedFind,
            updateOne: () => ({ set: () => waterlineQuery(undefined) }),
          });
          const audits = capturedAudits();
          const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
          const preview = await service.previewLinkAccounts({
            actor: await brandActor(),
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            requestId: 'link-retry-tamper-preview',
          });
          const linked = await service.linkUserAccounts({
            actor: await brandActor(),
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            primaryExpectedVersion: preview.primaryExpectedVersion,
            secondaryExpectedVersion: preview.secondaryExpectedVersion,
            linkConfirmationToken: preview.confirmationToken,
            linkOperationId: preview.linkOperationId,
            requestId: 'link-retry-tamper-apply',
          });
          assert.equal(linked.data.recordsPending, true);
          const pendingProof = {
            primaryExpectedVersion: preview.primaryExpectedVersion,
            secondaryExpectedVersion: preview.secondaryExpectedVersion,
            linkConfirmationToken: preview.confirmationToken,
            linkOperationId: preview.linkOperationId,
          };
          // A tampered token fails closed against the stored proof.
          await assert.rejects(
            service.retryLinkOperation({
              actor: await brandActor(),
              brandId: 'brand-1',
              primaryUserId: 'primary-1',
              secondaryUserId: 'secondary-1',
              ...pendingProof,
              linkConfirmationToken: `${preview.confirmationToken}tampered`,
              requestId: 'link-retry-token-tamper',
            }),
            hasCode('authorization.preview-stale')
          );
          // The genuine proof resumes the pending record phase.
          const resumed = await service.retryLinkOperation({
            actor: await brandActor(),
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            ...pendingProof,
            requestId: 'link-retry-tamper-valid',
          });
          assert.equal(resumed.data.recordsPending, true);
        });

        it('rejects resuming a pending row that carries no durable proof instead of rebuilding it', async () => {
          const { service, operationId } = await completedLinkOperation();
          // Hand-craft an incomplete pending row (pre-proof legacy shape):
          // the writer must reject it, never rebuild a plan from live users.
          const writer = service as unknown as {
            writeLinkOperationState: (state: Record<string, unknown>) => Promise<void>;
          };
          await writer.writeLinkOperationState({
            operationId,
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            primaryUsername: 'primary-1',
            secondaryUsername: 'secondary-1',
            secondaryEmail: 'secondary@example.com',
            status: 'pending',
            recordsPending: true,
            recordsRewritten: 0,
            rolesAdopted: 0,
            rolesRetired: 0,
            attemptCount: 1,
            recordOids: [],
            recordsCompletedOids: [],
          });
          await assert.rejects(
            service.retryLinkOperation({
              actor: await brandActor(),
              brandId: 'brand-1',
              primaryUserId: 'primary-1',
              secondaryUserId: 'secondary-1',
              primaryExpectedVersion: 1,
              secondaryExpectedVersion: 1,
              linkConfirmationToken: 'token',
              linkOperationId: operationId,
              requestId: 'link-retry-incomplete',
            }),
            hasCode('authorization.version-conflict')
          );
        });
      });

      describe('AUTH-P5-005 every-brand authority with complete proof', () => {
        it('fails closed when the secondary holds active foreign-brand authority', async () => {
          stubAtomicLinkGlobals(recordFixture);
          // The secondary also holds an ACTIVE tuple on another brand: the
          // all-brand snapshot must surface it and the writer must reject it as
          // foreign authority (opaque not-found), even though the requested-brand
          // view is clean.
          stubRoleGlobals(roleRow(), [
            roleRow({ id: 'role-foreign', key: 'foreign-role', name: 'foreign-role', branding: 'brand-2' }),
          ]);
          const assignmentGlobal = Reflect.get(globalThis, 'RoleAssignment') as Record<string, unknown>;
          const baseFind = assignmentGlobal.find as (criteria: Record<string, unknown>) => unknown;
          assignmentGlobal.find = (criteria: Record<string, unknown>) => {
            if (String(criteria?.principalId) === 'secondary-1') {
              return waterlineQuery([
                {
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
                },
                {
                  id: 'assignment-secondary-foreign',
                  principalType: 'user',
                  principalId: 'secondary-1',
                  role: 'role-foreign',
                  branding: 'brand-2',
                  source: 'manual',
                  sourceKey: 'manual',
                  status: 'active',
                  sourcePresent: true,
                  assignedBy: 'operator-1',
                  assignedAt: NOW,
                  expiresAt: null,
                  version: 1,
                },
              ]);
            }
            return baseFind(criteria);
          };
          const audits = capturedAudits();
          const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

          await assert.rejects(
            service.previewLinkAccounts({
              actor: await brandActor(),
              brandId: 'brand-1',
              primaryUserId: 'primary-1',
              secondaryUserId: 'secondary-1',
              requestId: 'link-foreign-brand-preview',
            }),
            hasCode('authorization.not-found')
          );
          assert.equal(audits.succeeded.length, 0);
        });
      });
    });
  });

  describe('P5-Gate-F multi-source role-set compatibility (one atomic batch)', () => {
    function stubMultiSourceGlobals(): {
      updates: { criteria: Record<string, unknown>; values: Record<string, unknown>; connection: unknown }[];
      transactions: number;
    } {
      stubRoleGlobals(roleRow());
      stubUserGlobals(activeUser({ id: 'user-1', username: 'user-1' }));
      const manualTuple = {
        id: 'assignment-manual-1',
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
        version: 3,
      };
      const externalTuple = {
        id: 'assignment-external-1',
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-1',
        branding: 'brand-1',
        source: 'external',
        sourceKey: 'hr-provider',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'provider-sync',
        assignedAt: NOW,
        expiresAt: null,
        version: 5,
      };
      const liveById = new Map<string, Record<string, unknown>>([
        ['assignment-manual-1', { ...manualTuple }],
        ['assignment-external-1', { ...externalTuple }],
      ]);
      const updates: {
        criteria: Record<string, unknown>;
        values: Record<string, unknown>;
        connection: unknown;
      }[] = [];
      const state = { transactions: 0 };
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: (criteria: Record<string, unknown>) => {
          if (criteria?.id !== undefined) {
            return { usingConnection: () => waterlineQuery(liveById.get(String(criteria.id))) };
          }
          const wantedSource = String(criteria?.source ?? '');
          const wantedKey = String(criteria?.sourceKey ?? '');
          for (const tuple of liveById.values()) {
            if (
              String(tuple.principalId) === String(criteria?.principalId) &&
              String(tuple.role) === String(criteria?.role) &&
              String(tuple.source) === wantedSource &&
              String(tuple.sourceKey) === wantedKey
            ) {
              return { usingConnection: () => waterlineQuery({ ...tuple }) };
            }
          }
          return { usingConnection: () => waterlineQuery(undefined) };
        },
        find: (criteria: Record<string, unknown>) => {
          // projectLegacyAuthority effective check: after both removals there
          // is no effective tuple; during the batch report remaining actives.
          if (String(criteria?.principalId) === 'user-1' && criteria?.role !== undefined) {
            const remaining = [...liveById.values()].filter(
              tuple => tuple.status === 'active' && tuple.sourcePresent === true
            );
            return { limit: () => ({ usingConnection: () => waterlineQuery(remaining) }) };
          }
          return { limit: () => ({ usingConnection: () => waterlineQuery([]) }) };
        },
        create: () => ({ fetch: () => waterlineQuery({ id: 'assignment-new' }) }),
        updateOne: (criteria: Record<string, unknown>) => ({
          set: (values: Record<string, unknown>) => ({
            usingConnection: (connection: unknown) => {
              updates.push({ criteria: { ...criteria }, values: { ...values }, connection });
              const live = liveById.get(String(criteria?.id));
              if (live === undefined || Number(live.version) !== Number(criteria?.version)) {
                return waterlineQuery(undefined);
              }
              const next = { ...live, ...values };
              liveById.set(String(criteria?.id), next);
              return waterlineQuery(next);
            },
          }),
        }),
      });
      const userGlobal = Reflect.get(globalThis, 'User') as Record<string, unknown>;
      userGlobal.addToCollection = () => ({ members: () => ({ usingConnection: () => waterlineQuery([]) }) });
      userGlobal.removeFromCollection = () => ({ members: () => ({ usingConnection: () => waterlineQuery([]) }) });
      return {
        updates,
        get transactions() {
          return state.transactions;
        },
      };
    }

    it('applies multi-source removals for one role end-to-end in one transaction', async () => {
      const tracked = stubMultiSourceGlobals();
      const audits = capturedAudits();
      let transactions = 0;
      const deps = serviceDependencies(audits, testRegistry(), {
        runTransaction: (work: (connection: Sails.Connection) => Promise<unknown>) => {
          transactions += 1;
          return work(testConnection);
        },
      });
      const service = new Services.RoleAdministrationService(deps as never);

      const result = await service.applyUserRoleSet({
        actor: await brandActor(),
        brandId: 'brand-1',
        principalId: 'user-1',
        grants: [],
        removals: [
          { roleKey: 'researcher', source: 'manual', sourceKey: 'manual', expectedVersion: 3 },
          { roleKey: 'researcher', assignmentId: 'assignment-external-1', expectedVersion: 5 },
        ],
        requestId: 'role-set-multi-source',
      });

      assert.equal(result.changed, true);
      assert.equal(result.data.revoked, 1);
      assert.equal(result.data.suppressed, 1);
      assert.equal(result.data.granted, 0);
      assert.equal(tracked.updates.length, 2);
      assert.ok(tracked.updates.every(entry => entry.connection === testConnection));
      assert.equal(transactions, 1);
      assert.equal(audits.succeeded.length, 1);
      assert.equal(audits.attempts.length, 0);
    });

    it('rejects an exact duplicate source tuple while preserving distinct sources', async () => {
      stubMultiSourceGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.applyUserRoleSet({
          actor: await brandActor(),
          brandId: 'brand-1',
          principalId: 'user-1',
          grants: [],
          removals: [
            { roleKey: 'researcher', source: 'manual', sourceKey: 'manual', expectedVersion: 3 },
            { roleKey: 'researcher', source: 'manual', sourceKey: 'manual', expectedVersion: 3 },
          ],
          requestId: 'role-set-duplicate-tuple',
        }),
        hasCode('authorization.bulk-invalid')
      );
      assert.equal(audits.succeeded.length, 0);
      assert.equal(audits.attempts.length, 1);
    });

    it('rejects a grant colliding with a removal for the same role', async () => {
      stubMultiSourceGlobals();
      const audits = capturedAudits();
      const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);

      await assert.rejects(
        service.applyUserRoleSet({
          actor: await brandActor(),
          brandId: 'brand-1',
          principalId: 'user-1',
          grants: [{ roleKey: 'researcher' }],
          removals: [{ roleKey: 'researcher', source: 'manual', sourceKey: 'manual', expectedVersion: 3 }],
          requestId: 'role-set-grant-removal-collision',
        }),
        hasCode('authorization.bulk-invalid')
      );
      assert.equal(audits.succeeded.length, 0);
    });
  });
});
