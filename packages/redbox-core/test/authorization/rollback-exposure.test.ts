import { reportRollbackExposure } from '../../src/services/AuthorizationRollbackExposure';
import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { asScopeKey, createScopeRegistry, getRoleEffectiveScopes } from '../../src/authorization';
import {
  MAX_ROLLBACK_ASSIGNMENTS,
  MAX_ROLLBACK_ROLES,
  MAX_ROLLBACK_SCOPES,
} from '../../src/authorization/rollback-exposure';

const registry = createScopeRegistry([
  {
    sourceType: 'core',
    sourcePackage: '@researchdatabox/redbox-core',
    sourceVersion: 'test',
    definitions: ['record.read', 'record.edit'].map(key => ({
      key: asScopeKey(key),
      label: key,
      description: key,
      risk: 'read',
    })),
  },
]);
const now = new Date('2026-09-01T00:00:00.000Z');
const names = ['Role', 'RoleAssignment', 'User', 'RoleTemplateRevision', 'RoleScopeOverride'] as const;
const role = {
  id: 'role-1',
  key: 'Custom',
  status: 'active',
  protectedKind: 'none',
  contextType: 'brand',
  branding: 'b',
};
const grant = {
  id: 'a',
  role: 'role-1',
  principalId: 'u',
  principalType: 'user',
  status: 'active',
  sourcePresent: true,
  source: 'manual',
  branding: 'b',
};
let limits: number[];
function query(value: unknown) {
  return {
    sort: () => query(value),
    limit: (limit: number) => {
      limits.push(limit);
      return Promise.resolve(value);
    },
  };
}
function install(
  roles: unknown[] = [role],
  assignments: unknown[] = [grant],
  users: unknown[] = [{ id: 'u' }],
  scopes: unknown[] = [{ scopeKey: 'record.read', effect: 'add' }]
) {
  Reflect.set(globalThis, 'Role', { find: () => query(roles) });
  Reflect.set(globalThis, 'RoleAssignment', { find: () => query(assignments) });
  Reflect.set(globalThis, 'User', { find: () => query(users) });
  Reflect.set(globalThis, 'RoleScopeOverride', { find: () => query(scopes) });
  Reflect.set(globalThis, 'RoleTemplateRevision', {
    findOne: async () => ({ scopeKeys: ['record.read', 'record.edit'] }),
  });
}
describe('bounded custom-scope rollback exposure', () => {
  let saved: Map<string, PropertyDescriptor | undefined>;
  beforeEach(() => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    limits = [];
    install();
  });
  afterEach(() => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  it('identifies users, roles and capabilities once across multiple sources without granting legacy roles', async () => {
    install([role], [grant, { ...grant, id: 'external', source: 'external' }]);
    const report = await reportRollbackExposure(registry, now);
    assert.deepEqual(report, {
      complete: true,
      incompleteReasons: [],
      affectedUserCount: 1,
      affectedRoleCount: 1,
      affectedCapabilityCount: 1,
      items: [
        {
          userId: 'u',
          roleId: 'role-1',
          roleKey: 'Custom',
          brandId: 'b',
          scopeKeys: ['record.read'],
          temporaryLegacyRoleAssessment: 'required',
        },
      ],
    });
    assert.deepEqual(limits, [501, 1001, 1001, 101]);
  });

  it('resolves template scopes and deny overrides through the existing scope calculator', async () => {
    install(
      [{ ...role, template: 't', templateRevision: 2 }],
      [grant],
      [{ id: 'u' }],
      [{ scopeKey: 'record.read', effect: 'remove' }]
    );
    const report = await reportRollbackExposure(registry, now);
    assert.equal(report.complete, true);
    assert.deepEqual(report.items[0].scopeKeys, ['record.edit']);
  });

  it('excludes an overflowing override set whose truncated prefix omits a removal', async () => {
    const baseScopeKeys = Array.from({ length: MAX_ROLLBACK_SCOPES }, (_, i) =>
      asScopeKey(`record.scope${String(i).padStart(3, '0')}`)
    );
    const addedScope = asScopeKey('record.added');
    const overflowRegistry = createScopeRegistry([
      {
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: 'test',
        definitions: [addedScope, ...baseScopeKeys].map(key => ({
          key,
          label: key,
          description: key,
          risk: 'read',
        })),
      },
    ]);
    // scopeKey ASC puts the addition first and the final removal in the
    // overflow sentinel. Calculating only the first 100 invents a capability.
    const overrides = [
      { scopeKey: addedScope, effect: 'add' as const },
      ...baseScopeKeys.map(scopeKey => ({ scopeKey, effect: 'remove' as const })),
    ];
    assert.deepEqual(
      getRoleEffectiveScopes({ baseScopeKeys, overrides, registry: overflowRegistry }).effectiveScopeKeys,
      [addedScope]
    );
    install([{ ...role, template: 't', templateRevision: 1 }], [grant], [{ id: 'u' }], overrides);
    Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: async () => ({ scopeKeys: baseScopeKeys }) });
    const report = await reportRollbackExposure(overflowRegistry, now);
    assert.deepEqual(report, {
      complete: false,
      incompleteReasons: ['scopes-limit'],
      affectedUserCount: 0,
      affectedRoleCount: 0,
      affectedCapabilityCount: 0,
      items: [],
    });
    assert.deepEqual(limits, [501, 1001, 1001, 101]);
  });

  for (const incompleteInput of ['template', 'overrides'] as const) {
    it(`retains only verified roles and reads an overflowing ${incompleteInput} once across users`, async () => {
      const healthyRole = { ...role, id: 'role-2', key: 'Healthy' };
      install(
        [{ ...role, template: 't', templateRevision: 1 }, healthyRole],
        [grant, { ...grant, id: 'a2', principalId: 'v' }, { ...grant, id: 'a3', role: 'role-2' }],
        [{ id: 'u' }, { id: 'v' }]
      );
      let templateReads = 0;
      const overrideReads: unknown[] = [];
      Reflect.set(globalThis, 'RoleTemplateRevision', {
        findOne: async () => {
          templateReads += 1;
          return {
            scopeKeys: Array(incompleteInput === 'template' ? MAX_ROLLBACK_SCOPES + 1 : 1).fill('record.read'),
          };
        },
      });
      Reflect.set(globalThis, 'RoleScopeOverride', {
        find: (criteria: { role: string }) => {
          overrideReads.push(criteria.role);
          return query(
            criteria.role === 'role-1'
              ? Array(MAX_ROLLBACK_SCOPES + 1).fill({ scopeKey: 'record.read', effect: 'remove' })
              : [{ scopeKey: 'record.edit', effect: 'add' }]
          );
        },
      });
      const report = await reportRollbackExposure(registry, now);
      assert.deepEqual(report.incompleteReasons, ['scopes-limit']);
      assert.equal(report.complete, false);
      assert.equal(report.affectedUserCount, 1);
      assert.equal(report.affectedRoleCount, 1);
      assert.equal(report.affectedCapabilityCount, 1);
      assert.deepEqual(
        report.items.map(item => [item.roleId, item.scopeKeys]),
        [['role-2', ['record.edit']]]
      );
      assert.equal(templateReads, 1);
      assert.deepEqual(overrideReads, incompleteInput === 'template' ? ['role-2'] : ['role-1', 'role-2']);
      assert.deepEqual(limits, incompleteInput === 'template' ? [501, 1001, 1001, 101] : [501, 1001, 1001, 101, 101]);
    });
  }

  for (const patch of [
    { status: 'revoked' },
    { status: 'suppressed' },
    { sourcePresent: false },
    { expiresAt: now.toISOString() },
    { source: 'unknown' },
  ]) {
    it(`excludes ineffective grants ${JSON.stringify(patch)}`, async () => {
      install([role], [{ ...grant, ...patch }]);
      assert.equal((await reportRollbackExposure(registry, now)).affectedUserCount, 0);
    });
  }
  it('excludes disabled users and protected roles; reports invalid alias and brand state as incomplete', async () => {
    install([role], [grant], [{ id: 'u', loginDisabled: true }]);
    assert.equal((await reportRollbackExposure(registry, now)).affectedUserCount, 0);
    install([{ ...role, protectedKind: 'brand-admin' }]);
    assert.equal((await reportRollbackExposure(registry, now)).items.length, 0);
    install([role], [grant], [{ id: 'u', linkedPrimaryUserId: 'primary' }]);
    assert.deepEqual((await reportRollbackExposure(registry, now)).incompleteReasons, ['invalid-state']);
    install([role], [{ ...grant, branding: 'other' }]);
    assert.equal((await reportRollbackExposure(registry, now)).complete, false);
  });
  for (const bound of ['roles', 'assignments', 'scopes', 'users'] as const) {
    it(`never reports a clean scan on ${bound} overflow`, async () => {
      install(
        bound === 'roles' ? Array(MAX_ROLLBACK_ROLES + 1).fill(role) : [role],
        bound === 'assignments' ? Array(MAX_ROLLBACK_ASSIGNMENTS + 1).fill(grant) : [grant],
        bound === 'users' ? Array(MAX_ROLLBACK_ASSIGNMENTS + 1).fill({ id: 'u' }) : [{ id: 'u' }],
        bound === 'scopes'
          ? Array(MAX_ROLLBACK_SCOPES + 1).fill({ scopeKey: 'record.read', effect: 'add' })
          : [{ scopeKey: 'record.read', effect: 'add' }]
      );
      const report = await reportRollbackExposure(registry, now);
      assert.equal(report.complete, false);
      assert.ok(report.incompleteReasons.includes(`${bound}-limit`));
    });
  }
  it('bounds output and marks counts as incomplete when user-role detail is omitted', async () => {
    install(
      [role],
      Array.from({ length: 101 }, (_, i) => ({ ...grant, id: `a${i}`, principalId: `u${i}` })),
      Array.from({ length: 101 }, (_, i) => ({ id: `u${i}` }))
    );
    const report = await reportRollbackExposure(registry, now);
    assert.equal(report.complete, false);
    assert.equal(report.items.length, 100);
    assert.equal(report.affectedUserCount, 101);
    assert.deepEqual(report.incompleteReasons, ['items-limit']);
  });
  it('flags malformed role and override state instead of presenting a complete scan', async () => {
    install([{ ...role, protectedKind: 'unknown' }]);
    assert.deepEqual((await reportRollbackExposure(registry, now)).incompleteReasons, ['invalid-state']);
    install([role], [grant], [{ id: 'u' }], [{ scopeKey: 'record.read', effect: 'unknown' }]);
    assert.deepEqual((await reportRollbackExposure(registry, now)).incompleteReasons, ['invalid-state']);
  });

  it('fails closed on query failure or missing template evidence', async () => {
    Reflect.set(globalThis, 'Role', {
      find: () => {
        throw new Error('offline');
      },
    });
    assert.deepEqual((await reportRollbackExposure(registry, now)).incompleteReasons, ['query-failed']);
    install([{ ...role, template: 'missing', templateRevision: 1 }]);
    Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: async () => undefined });
    assert.deepEqual((await reportRollbackExposure(registry, now)).incompleteReasons, ['invalid-state']);
  });
});
