/**
 * Bounded operator classification for shadow mismatch acknowledgement.
 *
 * Free-text `reason` explains the decision; `classification` places it in a
 * fixed triage vocabulary so readiness summaries, audit consumers, and CLI
 * output can group acknowledged mismatches without parsing prose. New
 * classifications must extend this list (never accept free text) to keep the
 * persistence, CLI, and audit contracts in sync.
 */
/** The six operator-facing categories required by the authorization rollout. */
export const AUTHORIZATION_MISMATCH_CATEGORIES = [
  'mapping-defect',
  'data-migration-drift-defect',
  'missing-route-declaration',
  'resource-gate-defect',
  'approved-legacy-security-bug',
  'intentional-product-change',
] as const;

export type AuthorizationMismatchCategory = (typeof AUTHORIZATION_MISMATCH_CATEGORIES)[number];

/**
 * The original four labels remain readable for already persisted rows. Every
 * legacy label has an explicit category mapping; new acknowledgements should
 * use one of AUTHORIZATION_MISMATCH_CATEGORIES.
 */
export const AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP = {
  'approved-security-difference': 'approved-legacy-security-bug',
  'expected-legacy-gap': 'intentional-product-change',
  'scope-declaration-fix-required': 'missing-route-declaration',
  'needs-investigation': 'data-migration-drift-defect',
} as const satisfies Record<string, AuthorizationMismatchCategory>;

export const AUTHORIZATION_MISMATCH_LEGACY_CLASSIFICATIONS = [
  'approved-security-difference',
  'expected-legacy-gap',
  'scope-declaration-fix-required',
  'needs-investigation',
] as const satisfies readonly (keyof typeof AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP)[];

export const AUTHORIZATION_MISMATCH_CLASSIFICATIONS = [
  ...AUTHORIZATION_MISMATCH_CATEGORIES,
  ...AUTHORIZATION_MISMATCH_LEGACY_CLASSIFICATIONS,
] as const;

export type AuthorizationMismatchClassification = (typeof AUTHORIZATION_MISMATCH_CLASSIFICATIONS)[number];

export function isMismatchClassification(value: unknown): value is AuthorizationMismatchClassification {
  return AUTHORIZATION_MISMATCH_CLASSIFICATIONS.some(classification => classification === value);
}

export function mismatchClassificationCategory(
  classification: AuthorizationMismatchClassification
): AuthorizationMismatchCategory {
  if (Object.hasOwn(AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP, classification)) {
    return AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP[
      classification as keyof typeof AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP
    ];
  }
  return classification as AuthorizationMismatchCategory;
}

export const AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS = [
  'approved-legacy-security-bug',
  'intentional-product-change',
  'approved-security-difference',
  'expected-legacy-gap',
] as const satisfies readonly AuthorizationMismatchClassification[];

/** Defects, investigation, missing and unknown legacy values always fail closed. */
export function isApprovedMismatchClassification(classification: unknown): boolean {
  return AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS.some(approved => approved === classification);
}

/** A repaired defect can be closed with verification; it never becomes an approved difference. */
export const AUTHORIZATION_MISMATCH_DEFECT_CLASSIFICATIONS = [
  'mapping-defect',
  'data-migration-drift-defect',
  'missing-route-declaration',
  'resource-gate-defect',
  'scope-declaration-fix-required',
  'needs-investigation',
] as const satisfies readonly AuthorizationMismatchClassification[];

/** Native Mongo equivalent of the Waterline readiness predicate below. */
export function unresolvedShadowMismatchFilter() {
  return {
    $and: [
      {
        $or: [
          { resolvedAt: null },
          { resolutionClassification: { $nin: [...AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS] } },
        ],
      },
      {
        $or: [
          { remediationStatus: { $ne: 'verified' } },
          { remediationEvidenceFingerprint: { $in: [null, ''] } },
          { remediationVerifiedAt: { $in: [null, ''] } },
          { resolutionClassification: { $nin: [...AUTHORIZATION_MISMATCH_DEFECT_CLASSIFICATIONS] } },
        ],
      },
    ],
  };
}

/** Keep null branches explicit: Waterline string normalization differs from Mongo. */
export function unresolvedShadowMismatchCriteria() {
  return {
    and: [
      {
        or: [
          { resolvedAt: null },
          {
            resolvedAt: { '!=': null },
            or: [
              { resolutionClassification: null },
              { resolutionClassification: { nin: [...AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS] } },
            ],
          },
        ],
      },
      {
        or: [
          { remediationStatus: null },
          { remediationStatus: { '!=': 'verified' } },
          { remediationEvidenceFingerprint: null },
          { remediationEvidenceFingerprint: '' },
          { remediationVerifiedAt: null },
          { remediationVerifiedAt: '' },
          { resolutionClassification: null },
          { resolutionClassification: { nin: [...AUTHORIZATION_MISMATCH_DEFECT_CLASSIFICATIONS] } },
        ],
      },
    ],
  };
}
