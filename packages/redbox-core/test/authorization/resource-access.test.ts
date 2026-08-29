import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  allowedResource,
  asRoleKey,
  asScopeKey,
  authorizationResourceError,
  contextRecordRoleKeys,
  deniedResource,
  effectiveRecordRoleKeys,
  freezeAuthorizationContext,
  requireAllowedResource,
  type AuthorizationDecision,
} from '../../src/authorization';

function decision(allowed: boolean, reasonCode: AuthorizationDecision['reasonCode']): AuthorizationDecision {
  return Object.freeze({ allowed, reasonCode, requiredScope: asScopeKey('record.read') });
}

describe('authorization resource access', () => {
  it('maps cross-brand and missing resources to the same opaque not-found error', () => {
    for (const reasonCode of ['resource-not-found', 'resource-brand-mismatch'] as const) {
      const error = authorizationResourceError(decision(false, reasonCode));
      assert.equal(error.status, 404);
      assert.equal(error.code, 'authorization.not-found');
      assert.equal(error.message, 'Resource was not found.');
      assert.throws(
        () => requireAllowedResource(deniedResource(decision(false, reasonCode))),
        candidate => candidate instanceof Error && candidate.message === 'Resource was not found.'
      );
    }
  });

  it('maps in-brand ACL/scope denials to 403 and inactive principals to 401', () => {
    assert.equal(authorizationResourceError(decision(false, 'record-acl-denied')).status, 403);
    assert.equal(authorizationResourceError(decision(false, 'scope-missing')).status, 403);
    assert.equal(authorizationResourceError(decision(false, 'principal-inactive')).status, 401);
    assert.equal(requireAllowedResource(allowedResource(decision(true, 'allowed'), 'record-1')), 'record-1');
  });

  it('uses immutable same-brand role keys and excludes system and foreign-brand roles from record ACLs', () => {
    const roles = [
      { key: 'Researcher', name: 'Renamed researcher', branding: { id: 'brand-a' } },
      { name: 'Legacy role', branding: 'brand-a' },
      { key: 'Foreign', branding: { id: 'brand-b' } },
      { key: 'System administrator' },
      { key: 'bad\nkey', branding: 'brand-a' },
    ];

    assert.deepEqual(effectiveRecordRoleKeys(roles, 'brand-a'), ['Legacy role', 'Researcher']);

    const context = freezeAuthorizationContext({
      contextType: 'brand',
      principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'user-1' },
      brand: { id: 'brand-a', name: 'Brand A', exists: true, authorized: true },
      roles: [
        {
          id: 'same-brand',
          key: asRoleKey('Researcher'),
          name: 'Researcher',
          displayName: 'Researcher',
          contextType: 'brand',
          brandId: 'brand-a',
          protectedKind: 'none',
          implicit: false,
          assignmentCount: 1,
          assignmentsTruncated: false,
          assignments: [],
          effectiveScopeKeys: [asScopeKey('record.read')],
          inactiveScopeKeys: [],
          missingScopeKeys: [],
        },
        {
          id: 'system',
          key: asRoleKey('system-administrator'),
          name: 'system-administrator',
          displayName: 'System administrator',
          contextType: 'system',
          protectedKind: 'system-admin',
          implicit: false,
          assignmentCount: 1,
          assignmentsTruncated: false,
          assignments: [],
          effectiveScopeKeys: [asScopeKey('record.read.all')],
          inactiveScopeKeys: [],
          missingScopeKeys: [],
        },
      ],
      grantedScopeKeys: [asScopeKey('record.read'), asScopeKey('record.read.all')],
      effectiveScopeKeys: [asScopeKey('record.read'), asScopeKey('record.read.all')],
    });

    assert.deepEqual(contextRecordRoleKeys(context), ['Researcher']);
  });
});
