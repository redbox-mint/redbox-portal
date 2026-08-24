import { FormConflictState, FormRecordBaselineState, planFormConflictRebase } from './form-concurrency-state';

describe('form concurrency rebase planning', () => {
  const baseTag = `"rb-record-v1.4.${'a'.repeat(43)}"`;
  const latestTag = `"rb-record-v1.5.${'b'.repeat(43)}"`;
  const fingerprint = 'sha256:form_1';
  const identity = { oid: 'oid-1', recordType: 'rdmp', formName: 'rdmp-draft' };

  function baseline(overrides: Partial<FormRecordBaselineState> = {}): FormRecordBaselineState {
    return {
      oid: 'oid-1',
      recordType: 'rdmp',
      formName: 'rdmp-draft',
      metadata: { mine: 'base', remote: 'base', roundTrip: 'base' },
      trusted: true,
      entityTag: baseTag,
      revision: 4,
      formFingerprint: fingerprint,
      ...overrides,
    };
  }

  function conflict(overrides: Partial<FormConflictState> = {}): FormConflictState {
    return {
      requestId: '11111111-1111-4111-8111-111111111111',
      cause: 'record-stale',
      base: { mine: 'base', remote: 'base', roundTrip: 'base' },
      local: { mine: 'local', remote: 'base', roundTrip: 'base' },
      latest: { mine: 'base', remote: 'latest', roundTrip: 'latest' },
      baseRevision: 4,
      latestRevision: 5,
      baseEntityTag: baseTag,
      latestEntityTag: latestTag,
      baseFormFingerprint: fingerprint,
      latestFormFingerprint: fingerprint,
      status: 'stale',
      autoRetryAttempted: false,
      ...overrides,
    };
  }

  it('builds latest plus only trusted base-to-local changes', () => {
    const plan = planFormConflictRebase(
      baseline(),
      conflict(),
      { mine: 'local', remote: 'base', roundTrip: 'base' },
      fingerprint,
      identity
    );

    expect(plan.eligible).toBeTrue();
    if (!plan.eligible) return;
    expect(plan.rebase.candidate).toEqual({ mine: 'local', remote: 'latest', roundTrip: 'latest' });
    expect(plan.rebase.localChangesAlreadyPresent).toBeFalse();
  });

  it('rejects untrusted baselines, incomplete latest versions, and form drift', () => {
    expect(planFormConflictRebase(baseline({ trusted: false }), conflict(), {}, fingerprint, identity)).toEqual({
      eligible: false,
      reason: 'baseline-untrusted',
    });
    expect(
      planFormConflictRebase(baseline(), conflict({ latestEntityTag: undefined }), {}, fingerprint, identity)
    ).toEqual({
      eligible: false,
      reason: 'latest-version-untrusted',
    });
    expect(planFormConflictRebase(baseline(), conflict(), {}, 'sha256:changed', identity)).toEqual({
      eligible: false,
      reason: 'form-fingerprint-mismatch',
    });
    expect(planFormConflictRebase(baseline(), conflict(), {}, fingerprint, { ...identity, oid: 'oid-2' })).toEqual({
      eligible: false,
      reason: 'record-identity-mismatch',
    });
  });

  it('rejects divergent overlaps but resolves an equal final value as already present', () => {
    expect(
      planFormConflictRebase(
        baseline(),
        conflict({ latest: { mine: 'latest', remote: 'base', roundTrip: 'base' } }),
        { mine: 'local', remote: 'base', roundTrip: 'base' },
        fingerprint,
        identity
      )
    ).toEqual({ eligible: false, reason: 'overlapping-changes' });

    const equalPlan = planFormConflictRebase(
      baseline(),
      conflict({ latest: { mine: 'local', remote: 'latest', roundTrip: 'base' } }),
      { mine: 'local', remote: 'base', roundTrip: 'base' },
      fingerprint,
      identity
    );
    expect(equalPlan.eligible).toBeTrue();
    if (!equalPlan.eligible) return;
    expect(equalPlan.rebase.localChangesAlreadyPresent).toBeTrue();
    expect(equalPlan.rebase.candidate).toEqual({ mine: 'local', remote: 'latest', roundTrip: 'base' });
  });
});
