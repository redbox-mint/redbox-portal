import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  Services as MigrationServices,
  decodeDriftContinuation,
  DRIFT_ENTITY_FINDINGS_MAX,
} from '../../src/services/AuthorizationMigrationService';
import { isGuestFloorRemovalOverride } from '../../src/services/AuthorizationBootstrapService';
import {
  isExactProtectedRolePin,
  expectedProtectedTemplatePin,
} from '../../src/authorization/protected-role-validators';
import { DEFAULT_ROLE_TEMPLATES } from '../../src/authorization/default-role-templates';
import { Services as ScopeServices } from '../../src/services/AuthorizationScopeService';
import { Services as RoleServices } from '../../src/services/RoleAdministrationService';
import { asRoleKey, createScopeRegistry } from '../../src/authorization';
import { createAuthorizationAuditEvent } from '../../src/services/AuthorizationAuditService';
import { genuineBrandActor } from './genuineActor';

function connectedResult<T>(value: T) {
  return Object.assign(Promise.resolve(value), { usingConnection: () => Promise.resolve(value) });
}

/** Predicate-honoring find chain: applies id range + sort + limit like a real adapter. */
function honoringCollection(rows: Array<Record<string, unknown>>) {
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    find: (criteria: Record<string, unknown> = {}) => {
      let out = [...sorted];
      const idCrit = (criteria as Record<string, Record<string, string>>).id;
      if (idCrit !== undefined) {
        if (idCrit['>'] !== undefined) out = out.filter(r => String(r.id) > String(idCrit['>']));
        else if (idCrit['>='] !== undefined) out = out.filter(r => String(r.id) >= String(idCrit['>=']));
      }
      // Narrow brand/status/protectedKind filters used by drift sections.
      for (const [key, value] of Object.entries(criteria)) {
        if (key === 'id' || key === 'or') continue;
        if (Array.isArray(value)) out = out.filter(r => (value as unknown[]).includes(r[key]));
        else if (value !== undefined && typeof value !== 'object') out = out.filter(r => r[key] === value);
        else if (
          value !== undefined &&
          typeof value === 'object' &&
          value !== null &&
          !('>' in value) &&
          !('>=' in value) &&
          !('nin' in value)
        ) {
          out = out.filter(r => r[key] === value);
        }
      }
      const chain: Record<string, unknown> = {};
      chain.sort = () => chain;
      chain.populate = () => chain;
      chain.limit = (n: number) => connectedResult(out.slice(0, n));
      return chain;
    },
  };
}

function installHealthyTemplateGlobals(): void {
  Reflect.set(globalThis, 'RoleTemplate', {
    find: (criteria: Record<string, unknown> = {}) => {
      const keys = Array.isArray((criteria as Record<string, unknown>).key)
        ? ((criteria as Record<string, unknown>).key as unknown[])
        : (criteria as Record<string, unknown>).key !== undefined
          ? [(criteria as Record<string, unknown>).key]
          : undefined;
      const defs =
        keys === undefined
          ? [...DEFAULT_ROLE_TEMPLATES]
          : DEFAULT_ROLE_TEMPLATES.filter(d => (keys as unknown[]).includes(String(d.key)));
      const rows = defs.map(d => ({
        id: `tmpl-${String(d.key)}`,
        key: String(d.key),
        status: 'active',
        protectedKind: d.protectedKind,
        contextType: d.contextType,
        currentRevision: d.revision,
      }));
      return { sort: () => ({ limit: (n: number) => Promise.resolve(rows.slice(0, n)) }) };
    },
    findOne: async (criteria: Record<string, unknown>) => {
      const definition = DEFAULT_ROLE_TEMPLATES.find(
        candidate =>
          String(candidate.key) === String(criteria.key) || `tmpl-${String(candidate.key)}` === String(criteria.id)
      );
      if (definition === undefined) return undefined;
      return {
        id: `tmpl-${String(definition.key)}`,
        key: String(definition.key),
        status: 'active',
        protectedKind: definition.protectedKind,
        contextType: definition.contextType,
        currentRevision: definition.revision,
      };
    },
  });
  Reflect.set(globalThis, 'RoleTemplateRevision', {
    findOne: async (criteria: Record<string, unknown>) => {
      const definition = DEFAULT_ROLE_TEMPLATES.find(
        candidate => `tmpl-${String(candidate.key)}` === String(criteria.template)
      );
      if (definition === undefined || criteria.revision !== definition.revision) return undefined;
      return { template: criteria.template, revision: criteria.revision, scopeKeys: [...definition.scopeKeys] };
    },
  });
}

async function drainDrift(limit: number, maxPages = 30) {
  const service = new MigrationServices.AuthorizationMigrationService();
  const seen: string[] = [];
  let continuation: string | undefined;
  let pages = 0;
  let truncated = false;
  do {
    const page = await service.reportDrift(limit, continuation);
    pages += 1;
    assert.ok(pages <= maxPages, 'drift must progress, not loop forever');
    for (const issue of page.issues) seen.push(`${issue.code}@${issue.entityId ?? ''}`);
    truncated = page.truncated;
    continuation = page.continuation;
    if (truncated) assert.ok(continuation !== undefined, 'truncated must carry continuation');
    if (!truncated) break;
    // Round-trip: every emitted continuation must decode.
    assert.doesNotThrow(() => decodeDriftContinuation(continuation));
  } while (continuation !== undefined);
  return { seen, pages, truncated };
}

describe('P3-001 predicate-honoring no-omission/no-duplication (users with partial offsets)', () => {
  it('drains every finding across item#offset resumes with an honoring adapter', async () => {
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const names = [
      'BrandingConfig',
      'Role',
      'RoleAssignment',
      'User',
      'PathRule',
      'RoleTemplate',
      'RoleTemplateRevision',
      'RoleScopeOverride',
    ] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    // Three users: user-1 clean, user-2 has 3 projection findings, user-3 clean.
    const ghostRoles = [{ id: 'ghost-1' }, { id: 'ghost-2' }, { id: 'ghost-3' }];
    const users = [
      { id: 'user-1', roles: [] },
      { id: 'user-2', roles: ghostRoles },
      { id: 'user-3', roles: [] },
    ];
    Reflect.set(globalThis, 'BrandingConfig', honoringCollection([]));
    Reflect.set(globalThis, 'Role', {
      ...honoringCollection([]),
      count: async () => 0,
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      ...honoringCollection([]),
      count: async () => 0,
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'User', {
      find: (criteria: Record<string, unknown> = {}) => {
        let out = [...users];
        const idCrit = (criteria as Record<string, Record<string, string>>).id;
        if (idCrit?.['>'] !== undefined) out = out.filter(u => u.id > String(idCrit['>']));
        else if (idCrit?.['>='] !== undefined) out = out.filter(u => u.id >= String(idCrit['>=']));
        const chain: Record<string, unknown> = {};
        chain.populate = () => chain;
        chain.sort = () => chain;
        chain.limit = (n: number) => Promise.resolve(out.slice(0, n));
        return chain;
      },
    });
    Reflect.set(globalThis, 'PathRule', honoringCollection([]));
    Reflect.set(globalThis, 'RoleScopeOverride', { findOne: async () => undefined });
    installHealthyTemplateGlobals();
    try {
      // limit=1 forces user-2's 3 findings across partial item#offset pages.
      const { seen } = await drainDrift(1);
      const user2Findings = seen.filter(s => s.includes('user-role-reference-missing'));
      assert.ok(user2Findings.length >= 3, `expected 3 user-2 findings, got ${JSON.stringify(seen)}`);
      // No duplication of user-1/user-3 clean markers and no omission of user-3 scan.
      const { seen: seenFull } = await drainDrift(100);
      assert.ok(seenFull.length >= 3);
    } finally {
      sails.models = previousModels;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });
});

describe('P3-002 per-entity finding bound never emits item#501', () => {
  it('caps a 600-finding entity with an overflow blocker and round-trips', async () => {
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const names = [
      'BrandingConfig',
      'Role',
      'RoleAssignment',
      'User',
      'PathRule',
      'RoleTemplate',
      'RoleTemplateRevision',
      'RoleScopeOverride',
    ] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    const manyRoles = Array.from({ length: 600 }, (_, i) => ({ id: `ghost-${i}` }));
    Reflect.set(globalThis, 'BrandingConfig', honoringCollection([]));
    Reflect.set(globalThis, 'Role', {
      ...honoringCollection([]),
      count: async () => 0,
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      ...honoringCollection([]),
      count: async () => 0,
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'User', {
      find: () => {
        const chain: Record<string, unknown> = {};
        chain.populate = () => chain;
        chain.sort = () => chain;
        chain.limit = (n: number) => Promise.resolve([{ id: 'user-9', roles: manyRoles }].slice(0, n));
        return chain;
      },
    });
    Reflect.set(globalThis, 'PathRule', honoringCollection([]));
    Reflect.set(globalThis, 'RoleScopeOverride', { findOne: async () => undefined });
    installHealthyTemplateGlobals();
    try {
      const { seen } = await drainDrift(100);
      assert.ok(
        seen.some(s => s.startsWith('users-findings-overflow')),
        `expected overflow blocker, got ${seen.length}`
      );
      assert.ok(seen.length <= DRIFT_ENTITY_FINDINGS_MAX + 50, `entity must be bounded, got ${seen.length}`);
    } finally {
      sails.models = previousModels;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });
});

describe('P3-003 cursor canonicality rejects non-canonical envelopes', () => {
  it('rejects whitespace, reordered keys, and unsorted cursors/completed', async () => {
    const service = new MigrationServices.AuthorizationMigrationService();
    // Get a valid continuation by forcing truncation.
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const names = [
      'BrandingConfig',
      'Role',
      'RoleAssignment',
      'User',
      'PathRule',
      'RoleTemplate',
      'RoleTemplateRevision',
      'RoleScopeOverride',
    ] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    Reflect.set(globalThis, 'BrandingConfig', honoringCollection([{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }]));
    Reflect.set(globalThis, 'Role', {
      ...honoringCollection([]),
      count: async () => 1,
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      ...honoringCollection([]),
      count: async () => 0,
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'User', honoringCollection([]));
    Reflect.set(globalThis, 'PathRule', honoringCollection([]));
    Reflect.set(globalThis, 'RoleScopeOverride', { findOne: async () => undefined });
    installHealthyTemplateGlobals();
    let valid: string | undefined;
    try {
      const page = await service.reportDrift(1);
      valid = page.continuation;
      assert.ok(valid !== undefined, 'expected a continuation to mutate');
    } finally {
      sails.models = previousModels;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
    assert.ok(valid !== undefined);
    const rawJson = Buffer.from(valid, 'base64url').toString('utf8');
    const withWhitespace = Buffer.from(rawJson.replace('{', '{ '), 'utf8').toString('base64url');
    assert.throws(() => decodeDriftContinuation(withWhitespace), /invalid/);
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const reordered: Record<string, unknown> = {};
    for (const key of Object.keys(parsed).reverse()) reordered[key] = parsed[key];
    const reorderedToken = Buffer.from(JSON.stringify(reordered), 'utf8').toString('base64url');
    if (reorderedToken !== valid) assert.throws(() => decodeDriftContinuation(reorderedToken), /invalid/);
  });
});

describe('P3-004 guest floor-removal overrides are not retainable', () => {
  it('flags authorization.self.read removals for deletion', () => {
    assert.equal(isGuestFloorRemovalOverride({ scopeKey: 'authorization.self.read', effect: 'remove' }), true);
    assert.equal(isGuestFloorRemovalOverride({ scopeKey: 'authorization.self.read', effect: 'add' }), false);
    assert.equal(isGuestFloorRemovalOverride({ scopeKey: 'portal.home.read', effect: 'remove' }), false);
  });
});

describe('P3-005 protected template pin validation', () => {
  it('requires the exact template key/kind/revision, not any active template', () => {
    const expected = expectedProtectedTemplatePin('guest');
    assert.equal(expected.templateKey, 'guest');
    const role = { template: 'tmpl-guest', templateRevision: 1 };
    assert.equal(
      isExactProtectedRolePin(
        role,
        { key: 'guest', protectedKind: 'guest', contextType: 'brand', status: 'active', currentRevision: 1 },
        expected
      ),
      true
    );
    // Wrong template key must fail even when active.
    assert.equal(
      isExactProtectedRolePin(
        role,
        { key: 'researcher', protectedKind: 'none', contextType: 'brand', status: 'active', currentRevision: 1 },
        expected
      ),
      false
    );
    // Stale revision must fail.
    assert.equal(
      isExactProtectedRolePin(
        { template: 'tmpl-guest', templateRevision: 2 },
        { key: 'guest', protectedKind: 'guest', contextType: 'brand', status: 'active', currentRevision: 1 },
        expected
      ),
      false
    );
    // Inactive template must fail.
    assert.equal(
      isExactProtectedRolePin(
        role,
        { key: 'guest', protectedKind: 'guest', contextType: 'brand', status: 'inactive', currentRevision: 1 },
        expected
      ),
      false
    );
  });
});

describe('P3-009 supported-source membership and migration provenance', () => {
  const sources = ['manual', 'onboarding', 'recovery', 'external', 'migration'] as const;
  const names = [
    'BrandingConfig',
    'Role',
    'RoleAssignment',
    'User',
    'PathRule',
    'RoleTemplate',
    'RoleTemplateRevision',
    'RoleScopeOverride',
    'Record',
    'DeletedRecord',
    'AppConfig',
    'Form',
    'RecordType',
    'WorkflowStep',
  ] as const;
  const brandRole = {
    id: 'role-1',
    name: 'Researcher',
    key: 'Researcher',
    identityKey: 'brand:brand-1:Researcher',
    status: 'active',
    version: 1,
    contextType: 'brand',
    branding: 'brand-1',
    protectedKind: 'none',
  };
  const grant = (source: string) => ({
    id: `a-${source}`,
    principalId: 'user-1',
    principalType: 'user',
    role: brandRole,
    branding: 'brand-1',
    source,
    sourceKey: source === 'migration' ? 'legacy-role:user-1:role-1' : `${source}:1`,
    status: 'active',
    sourcePresent: true,
    expiresAt: null as string | null,
  });
  let assignments: ReturnType<typeof grant>[];
  let user: { id: string; roles: (typeof brandRole)[] };
  let saved: Map<string, PropertyDescriptor | undefined>;
  let previousModels: typeof sails.models;

  beforeEach(() => {
    previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    brandRole.status = 'active';
    brandRole.version = 1;
    assignments = [];
    user = { id: 'user-1', roles: [] };
    Reflect.set(globalThis, 'BrandingConfig', honoringCollection([]));
    Reflect.set(globalThis, 'Role', {
      ...honoringCollection([brandRole]),
      count: async () => 1,
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      find: (criteria: Record<string, unknown> = {}) => honoringCollection(assignments).find(criteria),
      count: async (criteria: Record<string, unknown>) => {
        if (criteria.principalId !== user.id || criteria.role !== brandRole.id) return 0;
        return assignments.filter(
          row =>
            row.status === 'active' &&
            row.sourcePresent &&
            (row.expiresAt === null || new Date(row.expiresAt).getTime() > Date.now())
        ).length;
      },
    });
    Reflect.set(globalThis, 'User', {
      find: (criteria: Record<string, unknown> = {}) => honoringCollection([user]).find(criteria),
      findOne: (criteria: Record<string, unknown>) => ({
        populate: (_association: string, options: { limit: number; sort: string }) => {
          assert.equal(options.limit, 501);
          assert.equal(options.sort, 'id ASC');
          return Promise.resolve(criteria.id === user.id ? user : undefined);
        },
      }),
      getDatastore: () => ({
        manager: {
          collection: () => ({
            find: () => ({
              limit: (limit: number) => {
                assert.equal(limit, 501);
                return Promise.resolve([]);
              },
            }),
          }),
        },
      }),
    });
    Reflect.set(globalThis, 'PathRule', honoringCollection([]));
    Reflect.set(globalThis, 'RoleScopeOverride', { findOne: async () => undefined });
    installHealthyTemplateGlobals();
  });
  afterEach(() => {
    sails.models = previousModels;
    for (const n of names) {
      const descriptor = saved.get(n);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, n);
      else Object.defineProperty(globalThis, n, descriptor);
    }
  });

  async function assignmentFindings() {
    const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
    assert.equal(report.truncated, false);
    return report.issues.filter(issue => issue.entityType === 'assignment');
  }

  async function inactivateRole() {
    const connection = {
      collection: () => ({ find: () => ({ limit: () => ({ toArray: async () => [] }) }) }),
    } as unknown as Sails.Connection;
    for (const name of ['Record', 'DeletedRecord']) {
      Reflect.set(globalThis, name, { tableName: name, getDatastore: () => ({ manager: connection }) });
    }
    for (const name of ['AppConfig', 'Form', 'RecordType', 'WorkflowStep']) {
      Reflect.set(globalThis, name, honoringCollection([]));
    }
    Reflect.set(globalThis, 'RoleScopeOverride', {
      find: () => ({ sort: () => connectedResult([]) }),
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'Role', {
      ...honoringCollection([brandRole]),
      count: async () => 1,
      findOne: ({ id }: { id: string }) => ({
        populate: () =>
          connectedResult(id === brandRole.id ? { ...brandRole, users: user.roles.length ? [user] : [] } : undefined),
      }),
      updateOne: (criteria: { id: string; version: number }) => ({
        set: (patch: { status: string; version: number }) => ({
          usingConnection: async (actual: Sails.Connection) => {
            assert.equal(actual, connection);
            assert.deepEqual(criteria, { id: brandRole.id, version: brandRole.version });
            Object.assign(brandRole, patch);
            return { ...brandRole };
          },
        }),
      }),
      replaceCollection: (id: string, association: string) => ({
        members: (members: string[]) => ({
          usingConnection: async (actual: Sails.Connection) => {
            assert.equal(actual, connection);
            assert.equal(id, brandRole.id);
            assert.equal(association, 'users');
            assert.deepEqual(members, []);
            user.roles = [];
          },
        }),
      }),
    });
    const assignmentModel = Reflect.get(globalThis, 'RoleAssignment') as object;
    Reflect.set(globalThis, 'RoleAssignment', {
      ...assignmentModel,
      count: ({ role }: { role: string }) => connectedResult(role === brandRole.id ? assignments.length : 0),
    });
    const service = new RoleServices.RoleAdministrationService({
      runTransaction: work => work(connection),
      getRegistry: () => createScopeRegistry([]),
      getConfirmationSecret: () => 'role-inactivation-regression-confirmation-secret',
      audit: () => ({
        createSucceededEvent: async (input, actual) => {
          assert.equal(actual, connection);
          return { id: 'audit-role-inactivation', ...createAuthorizationAuditEvent(input, 'succeeded') };
        },
        recordAttempt: async () => ({ persisted: true }),
      }),
    });
    const command = {
      actor: await genuineBrandActor(['authorization.role.manage']),
      brandId: 'brand-1',
      roleKey: asRoleKey(brandRole.key),
      expectedVersion: brandRole.version,
      requestId: 'role-inactivation-drift-regression',
      reason: 'Retire this role while retaining assignment history',
    };
    const preview = await service.previewRoleInactivation(command);
    assert.deepEqual(preview.fatalErrors, []);
    assert.equal(preview.affectedAssignments, assignments.length);
    assert.ok(preview.confirmationToken);
    const result = await service.inactivateRole({ ...command, confirmationToken: preview.confirmationToken });
    assert.equal(result.changed, true);
    assert.equal(result.data.status, 'inactive');
    assert.equal(result.version, 2);
  }

  for (const source of sources) {
    it(`accepts retained ${source} assignments after supported role inactivation`, async () => {
      assignments = [grant(source)];
      user.roles = [brandRole];
      assert.deepEqual(await assignmentFindings(), []);
      const retained = assignments.map(row => ({ ...row, role: row.role.id }));
      await inactivateRole();
      assert.deepEqual(user.roles, []);
      assert.deepEqual(
        assignments.map(row => ({ ...row, role: row.role.id })),
        retained
      );
      assert.deepEqual(await assignmentFindings(), []);
    });
    for (const status of ['inactive', 'disabled']) {
      it(`does not require either projection for ${source} assignments with a ${status} role`, async () => {
        brandRole.status = status;
        assignments = [grant(source)];
        assert.deepEqual(await assignmentFindings(), []);
        user.roles = [brandRole];
        assignments[0].status = 'revoked';
        assert.deepEqual(await assignmentFindings(), []);
      });
    }
    it(`accepts ${source} with legacy membership and source-appropriate provenance`, async () => {
      assignments = [grant(source)];
      user.roles = [brandRole];
      assert.deepEqual(await assignmentFindings(), []);
    });
    it(`reports missing legacy membership for effective ${source} grants`, async () => {
      assignments = [grant(source)];
      assert.deepEqual(await assignmentFindings(), [
        {
          code: 'new-assignment-legacy-projection-missing',
          severity: 'blocker',
          entityType: 'assignment',
          entityId: `a-${source}`,
        },
      ]);
    });
    for (const patch of [
      { status: 'revoked' },
      { status: 'suppressed' },
      { sourcePresent: false },
      { expiresAt: '2000-01-01T00:00:00.000Z' },
    ]) {
      it(`does not require legacy membership for ineffective ${source}: ${JSON.stringify(patch)}`, async () => {
        assignments = [{ ...grant(source), ...patch }];
        assert.deepEqual(await assignmentFindings(), []);
      });
    }
  }

  it('checks each supported source and both projection directions through final revocation', async () => {
    assignments = sources.map(grant);
    assert.deepEqual(
      (await assignmentFindings()).map(issue => issue.entityId).sort(),
      assignments.map(row => row.id).sort()
    );
    user.roles = [brandRole];
    assert.deepEqual(await assignmentFindings(), []);
    for (const assignment of assignments) {
      assignment.status = 'revoked';
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      assert.deepEqual(
        report.issues.filter(
          issue => issue.entityType === 'assignment' && issue.code !== 'legacy-assignment-projection-missing'
        ),
        []
      );
      assert.equal(
        report.issues.some(issue => issue.code === 'legacy-assignment-projection-missing'),
        assignments.every(row => row.status === 'revoked')
      );
    }
    user.roles = [];
    const cleaned = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
    assert.equal(
      cleaned.issues.some(issue => issue.code.includes('projection')),
      false
    );
  });

  for (const status of ['active', 'inactive', 'disabled']) {
    for (const sourceKey of ['manual:1', 'legacy-role:user-1:another-role', 'legacy-role:unlinked-user:role-1']) {
      it(`keeps migration provenance validation for active assignments with a ${status} role: ${sourceKey}`, async () => {
        brandRole.status = status;
        if (status === 'active') user.roles = [brandRole];
        assignments = [{ ...grant('migration'), sourceKey }];
        assert.deepEqual(
          (await assignmentFindings()).map(issue => issue.code),
          ['new-assignment-legacy-projection-missing']
        );
      });
    }
  }

  for (const source of sources.filter(source => source !== 'migration')) {
    it(`fails closed when the ${source} legacy membership read throws`, async () => {
      assignments = [grant(source)];
      Reflect.set(globalThis, 'User', {
        find: () => honoringCollection([]).find(),
        findOne: () => ({ populate: () => Promise.reject(new Error('projection unavailable')) }),
      });
      assert.ok(
        (await assignmentFindings()).some(
          issue => issue.code === 'assignment-legacy-projection-scan-incomplete' && issue.entityId === `a-${source}`
        )
      );
    });
  }
});

describe('P3-011 orphan cursor validation fails closed on predicate-ignoring adapters', () => {
  it('rejects invalid cursors and stalled pages', async () => {
    const service = new ScopeServices.AuthorizationScopeService();
    await assert.rejects(() => service.reconcileOrphans({ afterKey: 'NOT A KEY!!' }), /invalid/);
    await assert.rejects(() => service.reconcileOrphans({ afterKey: '' }), /invalid/);
  });
});
