import type { RolloutMode } from '../authorization';

export interface AuthorizationConfig {
  /** Deployment-wide route enforcement mode. Rollout starts with legacy behavior. */
  mode: RolloutMode;
  /** Retain legacy evidence during enforce to support a bounded rollback assessment. */
  collectLegacyEvidenceInEnforce: boolean;
  /** Optional dedicated secret for short-lived preview/apply confirmation tokens. */
  confirmationSecret?: string;
}

export const authorization: AuthorizationConfig = Object.freeze({
  mode: 'legacy',
  collectLegacyEvidenceInEnforce: true,
});
