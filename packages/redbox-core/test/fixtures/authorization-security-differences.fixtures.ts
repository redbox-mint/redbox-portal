/**
 * Separately recorded legacy security deltas.
 *
 * Each entry names historical behavior that the new model intentionally does
 * not preserve. These deltas are excluded from shadow parity expectations and
 * carry no product/security approval: `approval` is always
 * `external-required` until the named approvers record it outside this
 * repository. Tests assert the separation; they never mark a delta approved.
 */

export interface SecurityDifferenceFixture {
  readonly id: string;
  readonly historicalBehavior: string;
  readonly targetBehavior: string;
  readonly modes: readonly string[];
  readonly approval: 'external-required';
}

export const APPROVED_SECURITY_DIFFERENCES: readonly SecurityDifferenceFixture[] = Object.freeze([
  Object.freeze({
    id: 'invalid-bearer-401',
    historicalBehavior: 'A supplied invalid bearer could fall through to anonymous Guest handling.',
    targetBehavior: 'Any supplied invalid bearer returns 401 before Guest evaluation, in every mode.',
    modes: Object.freeze(['legacy', 'shadow', 'enforce']),
    approval: 'external-required',
  }),
  Object.freeze({
    id: 'enforce-no-rule-deny',
    historicalBehavior: 'A path with no matching PathRule was historically allowed.',
    targetBehavior: 'Enforce mode denies unclassified or unmatched routes; missing declarations fail readiness.',
    modes: Object.freeze(['enforce']),
    approval: 'external-required',
  }),
  Object.freeze({
    id: 'cross-brand-404',
    historicalBehavior: 'ID-only lookups could observe or mutate another brand by identifier.',
    targetBehavior: 'Cross-brand identifiers return opaque 404; 403 is reserved for known in-brand denials.',
    modes: Object.freeze(['legacy', 'shadow', 'enforce']),
    approval: 'external-required',
  }),
  Object.freeze({
    id: 'guest-explicit-assignment-rejected',
    historicalBehavior: 'Guest appeared as an assignable role in legacy user-role data.',
    targetBehavior:
      'Guest is implicit per brand and never has assignment rows; explicit grants are rejected with 409/422.',
    modes: Object.freeze(['legacy', 'shadow', 'enforce']),
    approval: 'external-required',
  }),
  Object.freeze({
    id: 'stale-session-roles-ignored',
    historicalBehavior: 'Serialized session role arrays could carry stale authority.',
    targetBehavior: 'Every request re-resolves assignments; revocation and expiry apply on the next request.',
    modes: Object.freeze(['shadow', 'enforce']),
    approval: 'external-required',
  }),
]);
