import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import type { WaterlineModelDefinition } from '../../src/decorators';
import {
  AuthorizationAuditWLDef,
  AuthorizationScopeWLDef,
  AuthorizationShadowMismatchWLDef,
  RoleAssignmentWLDef,
  RoleScopeOverrideWLDef,
  RoleTemplateRevisionWLDef,
  RoleTemplateWLDef,
  RoleWLDef,
  WaterlineModels,
} from '../../src/waterline-models';

type Lifecycle = NonNullable<WaterlineModelDefinition['beforeCreate']>;

function runLifecycle(lifecycle: Lifecycle | undefined, record: Record<string, unknown>): Promise<void> {
  if (lifecycle === undefined) {
    throw new Error('Expected the Waterline lifecycle hook to be defined.');
  }
  return new Promise((resolve, reject) => {
    lifecycle(record, error => (error === undefined ? resolve() : reject(error)));
  });
}

describe('authorization Waterline persistence', () => {
  it('registers every Phase 2 model under a distinct shim identity', () => {
    assert.deepEqual(
      Object.keys(WaterlineModels)
        .filter(name => name.startsWith('Authorization') || name.startsWith('Role'))
        .sort(),
      [
        'AuthorizationAudit',
        'AuthorizationScope',
        'AuthorizationShadowMismatch',
        'Role',
        'RoleAssignment',
        'RoleScopeOverride',
        'RoleTemplate',
        'RoleTemplateRevision',
      ]
    );
  });

  it('keeps legacy Role fields and uses a sparse single-field identity index', () => {
    assert.equal(RoleWLDef.attributes.name.required, true);
    assert.equal(RoleWLDef.attributes.branding.model, 'brandingconfig');
    assert.equal(RoleWLDef.attributes.users.collection, 'user');
    assert.deepEqual(RoleWLDef.indexes, [
      { attributes: { identityKey: 1 }, unique: true, sparse: true },
      { attributes: { branding: 1, key: 1 }, partialFilterExpression: { key: { $type: 'string' } } },
      {
        attributes: { branding: 1, status: 1, displayName: 1 },
        partialFilterExpression: { displayName: { $type: 'string' }, status: { $type: 'string' } },
      },
      {
        attributes: { template: 1, templateRevision: 1 },
        partialFilterExpression: { template: { $exists: true }, templateRevision: { $exists: true } },
      },
    ]);
  });

  it('allows untouched legacy roles and preserves compatibility key text exactly', async () => {
    const legacyRole: Record<string, unknown> = {
      name: 'Librarians',
      branding: 'brand-1',
      key: '',
      contextType: '',
      displayName: '',
      protectedKind: '',
      status: '',
      version: 0,
      identityKey: '',
    };
    await runLifecycle(RoleWLDef.beforeCreate, legacyRole);
    assert.equal(legacyRole.name, 'Librarians');
    assert.equal(legacyRole.branding, 'brand-1');
    assert.equal(legacyRole.identityKey, undefined);

    const authorizationRole: Record<string, unknown> = {
      name: 'Admin Legacy',
      key: 'Admin Legacy',
      displayName: 'Administrators',
      contextType: 'brand',
      branding: 'brand-1',
      protectedKind: 'brand-admin',
      status: 'active',
      version: 1,
    };
    await runLifecycle(RoleWLDef.beforeCreate, authorizationRole);
    assert.equal(authorizationRole.name, 'Admin Legacy');
    assert.equal(authorizationRole.key, 'Admin Legacy');
    assert.equal(authorizationRole.identityKey, 'brand:brand-1:Admin Legacy');
  });

  it('publishes the required catalog, template, override, assignment, audit, and shadow indexes', () => {
    assert.deepEqual(AuthorizationScopeWLDef.indexes, [
      { attributes: { key: 1 }, unique: true },
      { attributes: { namespace: 1, status: 1, key: 1 } },
      { attributes: { sourcePackage: 1, status: 1 } },
    ]);
    assert.deepEqual(RoleTemplateWLDef.indexes, [
      { attributes: { key: 1 }, unique: true },
      { attributes: { status: 1, displayName: 1 } },
    ]);
    assert.deepEqual(RoleTemplateRevisionWLDef.indexes, [
      { attributes: { template: 1, revision: 1 }, unique: true },
      { attributes: { template: 1, publishedAt: -1 } },
    ]);
    assert.deepEqual(RoleScopeOverrideWLDef.indexes, [
      { attributes: { role: 1, scopeKey: 1 }, unique: true },
      { attributes: { scopeKey: 1, effect: 1 } },
    ]);
    assert.deepEqual(RoleAssignmentWLDef.indexes, [
      { attributes: { principalType: 1, principalId: 1, role: 1, source: 1, sourceKey: 1 }, unique: true },
      { attributes: { principalType: 1, principalId: 1, status: 1, expiresAt: 1 } },
      { attributes: { branding: 1, role: 1, status: 1 } },
      { attributes: { role: 1, status: 1 } },
      { attributes: { source: 1, sourceKey: 1, status: 1, sourcePresent: 1 } },
      { attributes: { expiresAt: 1, status: 1 } },
    ]);
    assert.deepEqual(AuthorizationAuditWLDef.indexes?.[0], { attributes: { eventId: 1 }, unique: true });
    assert.deepEqual(AuthorizationShadowMismatchWLDef.indexes?.[0], {
      attributes: { fingerprint: 1 },
      unique: true,
    });
  });

  it('keeps RoleAssignment lifecycle validation pure and independent of Role reads', async () => {
    let roleReads = 0;
    Reflect.set(globalThis, 'Role', {
      findOne() {
        roleReads += 1;
        throw new Error('Role reads do not belong in lifecycle hooks.');
      },
    });
    await runLifecycle(RoleAssignmentWLDef.beforeCreate, {
      principalType: 'user',
      principalId: 'user-1',
      role: 'role-1',
      branding: 'brand-1',
      source: 'manual',
      sourceKey: 'manual',
      status: 'active',
      sourcePresent: true,
      assignedBy: 'operator-1',
      assignedAt: new Date('2026-08-28T00:00:00.000Z'),
      version: 1,
    });
    assert.equal(roleReads, 0);
    Reflect.deleteProperty(globalThis, 'Role');
  });

  it('still enforces role-independent revocation and suppression state without a resolved role', async () => {
    const baseAssignment = {
      principalType: 'user',
      principalId: 'user-1',
      role: 'role-1',
      branding: 'brand-1',
      sourceKey: 'manual',
      sourcePresent: true,
      assignedBy: 'operator-1',
      assignedAt: new Date('2026-08-28T00:00:00.000Z'),
      version: 1,
    };

    await assert.rejects(
      runLifecycle(RoleAssignmentWLDef.beforeCreate, {
        ...baseAssignment,
        source: 'manual',
        status: 'revoked',
      }),
      /revokedAt and revokedBy/
    );

    await assert.rejects(
      runLifecycle(RoleAssignmentWLDef.beforeCreate, {
        ...baseAssignment,
        source: 'manual',
        sourceKey: 'manual',
        status: 'suppressed',
        suppressedAt: new Date('2026-08-28T00:00:00.000Z'),
        suppressedBy: 'operator-1',
      }),
      /must be external/
    );
  });

  it('rejects non-canonical template scope arrays and all revision mutations', async () => {
    await assert.rejects(
      runLifecycle(RoleTemplateRevisionWLDef.beforeCreate, {
        template: 'template-1',
        revision: 1,
        scopeKeys: ['record.update', 'record.read'],
        publishedBy: 'operator',
        publishedAt: new Date(),
      }),
      /scopeKeys must be sorted/
    );
    await assert.rejects(runLifecycle(RoleTemplateRevisionWLDef.beforeUpdate, {}), /immutable/);
    await assert.rejects(runLifecycle(RoleTemplateRevisionWLDef.beforeDestroy, {}), /immutable/);
  });

  it('redacts direct audit snapshots and prevents audit updates', async () => {
    const audit: Record<string, unknown> = {
      eventId: 'event-1',
      schemaVersion: 1,
      eventType: 'role.updated',
      outcome: 'succeeded',
      actorType: 'user',
      actorId: 'user-1',
      authMethod: 'session',
      targetType: 'role',
      before: { password: 'secret', safe: true },
      after: { nested: { authorization: 'Bearer secret', status: 'active' } },
      occurredAt: new Date(),
    };
    await runLifecycle(AuthorizationAuditWLDef.beforeCreate, audit);
    assert.deepEqual(audit.before, { safe: true });
    assert.deepEqual(audit.after, { nested: { status: 'active' } });
    await assert.rejects(runLifecycle(AuthorizationAuditWLDef.beforeUpdate, {}), /append-only/);
  });
});
