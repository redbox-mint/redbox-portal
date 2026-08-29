import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  asRoleKey,
  asScopeKey,
  createAnonymousAuthorizationPrincipal,
  createLegacyBearerAuthorizationPrincipal,
  createUserAuthorizationPrincipal,
  freezeAuthorizationContext,
  type ScopeKey,
} from '../../src/authorization';

describe('authorization contexts', () => {
  it('constructs the supported request principals without accepting authority fields', () => {
    assert.deepEqual(createAnonymousAuthorizationPrincipal(), {
      category: 'anonymous',
      authMethod: 'anonymous',
      active: true,
    });
    assert.deepEqual(createUserAuthorizationPrincipal({ userId: 'user-1', username: 'primary', active: true }), {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'user-1',
      username: 'primary',
    });
    assert.equal(
      createLegacyBearerAuthorizationPrincipal({ active: true, systemAdministrator: true }).category,
      'system-admin'
    );
  });

  it('recursively freezes roles, scope provenance, evidence, and compatibility projections', () => {
    const context = freezeAuthorizationContext({
      contextType: 'brand',
      principal: createUserAuthorizationPrincipal({ userId: 'user-1', username: 'primary', active: true }),
      brand: { requestedIdentifier: 'brand-a', id: 'brand-a', name: 'Brand A', exists: true, authorized: true },
      roles: [
        {
          id: 'role-1',
          key: asRoleKey('Researcher'),
          name: 'Researcher',
          displayName: 'Researcher label',
          contextType: 'brand',
          brandId: 'brand-a',
          protectedKind: 'none',
          implicit: false,
          assignmentCount: 1,
          assignmentsTruncated: false,
          assignments: [{ assignmentId: 'assignment-1', source: 'manual', sourceKey: 'manual' }],
          effectiveScopeKeys: [asScopeKey('record.read')],
          inactiveScopeKeys: [],
          missingScopeKeys: [],
        },
      ],
      compatibilityRoles: [
        {
          id: 'role-1',
          key: asRoleKey('Researcher'),
          name: 'Researcher',
          displayName: 'Researcher label',
          contextType: 'brand',
          protectedKind: 'none',
          branding: { id: 'brand-a', name: 'Brand A' },
        },
      ],
      grantedScopeKeys: [asScopeKey('record.read')],
      effectiveScopeKeys: [asScopeKey('record.read')],
      scopeProvenance: [
        { scopeKey: asScopeKey('record.read'), roleIds: ['role-1'], roleKeys: [asRoleKey('Researcher')] },
      ],
    });

    assert.equal(Object.isFrozen(context), true);
    assert.equal(Object.isFrozen(context.roles), true);
    assert.equal(Object.isFrozen(context.roles[0]), true);
    assert.equal(Object.isFrozen(context.roles[0].assignments), true);
    assert.equal(Object.isFrozen(context.compatibilityRoles[0].branding), true);
    assert.equal(Object.isFrozen(context.scopeProvenance[0].roleIds), true);
    assert.equal(Object.isFrozen(context.resolutionEvidence), true);
    assert.throws(() => {
      (context.effectiveScopeKeys as ScopeKey[]).push(asScopeKey('record.update'));
    }, TypeError);
  });
});
