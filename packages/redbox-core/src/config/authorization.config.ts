import type { RolloutMode } from '../authorization';

export interface AuthorizationApprovalEvidence {
  approved: boolean;
  approvedAt: string;
  fingerprint: string;
}

export interface AuthorizationReleaseEvidence {
  navigationParity?: AuthorizationApprovalEvidence;
  approvedSecurityDifferences?: AuthorizationApprovalEvidence;
  performance?: AuthorizationApprovalEvidence & {
    baselineP95Ms: number;
    baselineP99Ms: number;
    maximumOverheadP95Ms: number;
    maximumOverheadP99Ms: number;
    observedOverheadP95Ms: number;
    observedOverheadP99Ms: number;
    baselineQueryCount: number;
    maximumQueryCount: number;
    observedQueryCount: number;
  };
  identity?: { buildVersion: string; instanceId: string };
  shadowWindow?: AuthorizationApprovalEvidence & { startedAt: string; completedAt: string; minimumHours: number };
  rollback?: AuthorizationApprovalEvidence;
  approvals?: {
    product?: AuthorizationApprovalEvidence;
    security?: AuthorizationApprovalEvidence;
    operations?: AuthorizationApprovalEvidence;
    hookOwners?: AuthorizationApprovalEvidence;
    integrators?: AuthorizationApprovalEvidence;
  };
  /** Fingerprint of the complete immutable approval/evidence bundle. */
  durableFingerprint?: string;
}

export interface AuthorizationConfig {
  /** Deployment-wide route enforcement mode. Rollout starts with legacy behavior. */
  mode: RolloutMode;
  /** Retain legacy evidence during enforce to support a bounded rollback assessment. */
  collectLegacyEvidenceInEnforce: boolean;
  /** Optional dedicated secret for short-lived preview/apply confirmation tokens. */
  confirmationSecret?: string;
  /** Operator-supplied, durable release evidence. Missing evidence blocks enforce readiness. */
  releaseEvidence?: AuthorizationReleaseEvidence;
}

export const authorization: AuthorizationConfig = Object.freeze({
  mode: 'legacy',
  collectLegacyEvidenceInEnforce: true,
});
