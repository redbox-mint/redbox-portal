import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  AUTHORIZATION_ADMIN_MAX_BULK_ROWS,
  AUTHORIZATION_MAX_SCOPE_SET_SIZE,
  AuthorizationAdministrationError,
  authorizationContentHash,
  createAuthorizationConfirmationToken,
  normalizedNewRoleKey,
  normalizedScopeKeys,
  parseBulkAssignmentRows,
  verifyAuthorizationConfirmationToken,
  type AuthorizationConfirmationClaims,
} from '../../src/authorization';

describe('authorization administration contracts', () => {
  const secret = 'phase-five-confirmation-secret-material';
  const now = new Date('2026-08-29T00:00:00.000Z');

  function claims(overrides: Partial<AuthorizationConfirmationClaims> = {}): AuthorizationConfirmationClaims {
    return {
      version: 1,
      operation: 'role-scopes',
      target: 'role-1',
      actorId: 'user-1',
      brandId: 'brand-1',
      expectedVersion: 3,
      contentHash: authorizationContentHash({ desiredScopeKeys: ['record.read'] }),
      nonce: 'nonce-1',
      issuedAt: now.getTime(),
      expiresAt: now.getTime() + 60_000,
      ...overrides,
    };
  }

  it('signs stable content and rejects tampering, expiry, and future-issued confirmations', () => {
    assert.equal(authorizationContentHash({ b: 2, a: 1 }), authorizationContentHash({ a: 1, b: 2 }));
    const token = createAuthorizationConfirmationToken(claims(), secret);
    assert.deepEqual(verifyAuthorizationConfirmationToken(token, secret, now), claims());

    const [payload, signature] = token.split('.');
    assert.throws(
      () => verifyAuthorizationConfirmationToken(`${payload}x.${signature}`, secret, now),
      (error: unknown) =>
        error instanceof AuthorizationAdministrationError && error.code === 'authorization.preview-stale'
    );
    assert.throws(
      () =>
        verifyAuthorizationConfirmationToken(
          createAuthorizationConfirmationToken(claims({ expiresAt: now.getTime() }), secret),
          secret,
          now
        ),
      /expired/u
    );
    assert.throws(
      () =>
        verifyAuthorizationConfirmationToken(
          createAuthorizationConfirmationToken(claims({ issuedAt: now.getTime() + 31_000 }), secret),
          secret,
          now
        ),
      /expired/u
    );
  });

  it('normalizes new immutable keys and rejects grandfather-only syntax', () => {
    assert.equal(normalizedNewRoleKey('  Research-Team  '), 'research-team');
    assert.throws(() => normalizedNewRoleKey('Research Team'));
    assert.throws(() => normalizedNewRoleKey('admin/records'));
  });

  it('enforces the shared scope-set bound outside the HTTP contract', () => {
    assert.throws(
      () =>
        normalizedScopeKeys(
          Array.from({ length: AUTHORIZATION_MAX_SCOPE_SET_SIZE + 1 }, (_, index) => `record.field-${index}.read`)
        ),
      (error: unknown) =>
        error instanceof AuthorizationAdministrationError && error.code === 'authorization.invalid-scope'
    );
  });

  it('parses bounded JSON and quoted CSV assignment batches deterministically', () => {
    assert.deepEqual(
      parseBulkAssignmentRows(
        'action,principalId,roleKey,sourceKey,expiresAt,expectedVersion\nrevoke,"user,one",researcher,manual,,4',
        'csv'
      ),
      [
        {
          action: 'revoke',
          principalId: 'user,one',
          roleKey: 'researcher',
          sourceKey: 'manual',
          expectedVersion: 4,
        },
      ]
    );
    assert.throws(
      () =>
        parseBulkAssignmentRows(
          Array.from({ length: AUTHORIZATION_ADMIN_MAX_BULK_ROWS + 1 }, (_, index) => ({
            action: 'grant' as const,
            principalId: `user-${index}`,
            roleKey: 'researcher',
          }))
        ),
      (error: unknown) =>
        error instanceof AuthorizationAdministrationError && error.code === 'authorization.bulk-invalid'
    );
    assert.throws(() => parseBulkAssignmentRows('action,principalId,roleKey,unexpected\ngrant,u,r,x', 'csv'));
  });
});
