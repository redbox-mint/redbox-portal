import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';

import { protectedSystemAssignmentBootstrapIssue } from '../../src/services/AuthorizationBootstrapService';

const now = new Date('2026-08-31T00:00:00.000Z');

describe('AuthorizationBootstrapService protected assignment classification', () => {
  it('accepts only the already-active, present, non-expiring protected tuple', () => {
    assert.equal(protectedSystemAssignmentBootstrapIssue({ status: 'active', sourcePresent: true }, now), undefined);
  });

  it('fails closed for a revoked protected tuple', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue({ status: 'revoked', sourcePresent: true }, now),
      'bootstrap-system-assignment-revoked'
    );
  });

  it('fails closed for a suppressed protected tuple', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue({ status: 'suppressed', sourcePresent: true }, now),
      'bootstrap-system-assignment-suppressed'
    );
  });

  it('fails closed for an expired protected tuple', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(
        { status: 'active', sourcePresent: true, expiresAt: '2026-08-30T23:59:59.999Z' },
        now
      ),
      'bootstrap-system-assignment-expired'
    );
  });

  it('does not silently clear future expiry or missing source presence', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(
        { status: 'active', sourcePresent: true, expiresAt: '2026-09-01T00:00:00.000Z' },
        now
      ),
      'bootstrap-system-assignment-noncanonical'
    );
    assert.equal(
      protectedSystemAssignmentBootstrapIssue({ status: 'active', sourcePresent: false }, now),
      'bootstrap-system-assignment-noncanonical'
    );
  });
});
