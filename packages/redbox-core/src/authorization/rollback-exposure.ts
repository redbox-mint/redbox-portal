export const MAX_ROLLBACK_ROLES = 500;
export const MAX_ROLLBACK_ASSIGNMENTS = 1_000;
export const MAX_ROLLBACK_SCOPES = 100;
export const MAX_ROLLBACK_EXPOSURES = 100;
export const ROLLBACK_SCAN_REASONS = [
  'roles-limit',
  'assignments-limit',
  'users-limit',
  'scopes-limit',
  'items-limit',
  'invalid-state',
  'query-failed',
] as const;
export type RollbackScanReason = (typeof ROLLBACK_SCAN_REASONS)[number];

export interface AuthorizationRollbackExposureItem {
  readonly userId: string;
  readonly roleId: string;
  readonly roleKey: string;
  readonly brandId?: string;
  readonly scopeKeys: readonly string[];
  readonly temporaryLegacyRoleAssessment: 'required';
}

/** Conservative candidates, not a claim that a scope has an inverse legacy path rule. */
export interface AuthorizationRollbackExposureReport {
  readonly complete: boolean;
  readonly incompleteReasons: readonly RollbackScanReason[];
  /** All counts are observed lower bounds when complete=false. */
  readonly affectedUserCount: number;
  readonly affectedRoleCount: number;
  readonly affectedCapabilityCount: number;
  readonly items: readonly AuthorizationRollbackExposureItem[];
}
