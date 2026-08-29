import type { AuthorizationDecisionReasonCode, AuthorizationPrincipalCategory } from '../../authorization';
import type { AuthorizationShadowOutcome } from '../../waterline-models/AuthorizationShadowMismatch';

export class AuthorizationShadowMismatchModel {
  id = '';
  fingerprint = '';
  routeId = '';
  brandId?: string;
  legacyOutcome!: AuthorizationShadowOutcome;
  scopeOutcome!: AuthorizationShadowOutcome;
  reasonCode!: AuthorizationDecisionReasonCode;
  principalCategory!: AuthorizationPrincipalCategory;
  count = 1;
  firstSeenAt!: string | Date;
  lastSeenAt!: string | Date;
  sampleRequestId?: string;
  resolvedAt?: string | Date;
}
