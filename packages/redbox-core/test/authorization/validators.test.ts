import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import {
  AuthorizationValidationError,
  asNewRoleKey,
  asRoleKey,
  asScopeKey,
  isNewRoleKey,
  isRoleKey,
  isScopeKey,
  SCOPE_KEY_MAX_LENGTH,
} from '../../src/authorization';

function assertValidationError(fn: () => unknown, code: AuthorizationValidationError['code']): void {
  assert.throws(fn, (error: unknown) => {
    assert.equal(error instanceof AuthorizationValidationError, true);
    if (!(error instanceof AuthorizationValidationError)) {
      return false;
    }

    assert.equal(error.code, code);
    return true;
  });
}

describe('authorization validators', () => {
  it('accepts explicit business scope keys', () => {
    assert.equal(asScopeKey('record.read'), 'record.read');
    assert.equal(isScopeKey('authorization.role.manage'), true);
  });

  it('rejects wildcard and controller-like scope keys', () => {
    assert.equal(isScopeKey('record.*'), false);
    assert.equal(isScopeKey('Record.Read'), false);
    assert.equal(isScopeKey('record/read'), false);
    assertValidationError(() => asScopeKey(' record.read '), 'scope-key-invalid');
    assert.equal(isScopeKey(`a.${'b'.repeat(SCOPE_KEY_MAX_LENGTH - 2)}`), true);
    assert.equal(isScopeKey(`a.${'b'.repeat(SCOPE_KEY_MAX_LENGTH - 1)}`), false);
  });

  it('preserves grandfathered role keys exactly', () => {
    assert.equal(asRoleKey('Admin'), 'Admin');
    assert.equal(asRoleKey('Team Editors'), 'Team Editors');
    assert.equal(isRoleKey('Librarians'), true);
  });

  it('enforces strict new-role key creation grammar separately', () => {
    assert.equal(asNewRoleKey('brand-admin'), 'brand-admin');
    assert.equal(isNewRoleKey('brand-admin'), true);
    assert.equal(isNewRoleKey('Admin'), false);
    assertValidationError(() => asNewRoleKey('Admin'), 'role-key-new-invalid');
    assertValidationError(() => asRoleKey('bad\nkey'), 'role-key-invalid');
  });
});
