import {
  AuthorizationDecision,
  AuthorizationDecisionEvidence,
  AuthorizationDecisionInput,
  AuthorizationRecordAclOutcome,
} from './types';

function createEvidence(
  input: AuthorizationDecisionInput,
  requiredScopeActive: boolean,
  principalHasRequiredScope: boolean
): AuthorizationDecisionEvidence {
  const recordAcl = input.resource?.recordAcl ?? 'not-applicable';

  return Object.freeze({
    requiredScopeActive,
    principalActive: input.principal.active,
    principalHasRequiredScope,
    brandKnown: input.brand?.exists ?? true,
    brandAuthorized: input.brand?.authorized ?? true,
    tokenAllowsRequiredScope: input.tokenCeiling ? input.tokenCeiling.scopeKeys.includes(input.requiredScope) : true,
    resourceFound: input.resource?.found ?? true,
    resourceBrandMatches: input.resource?.brandMatches ?? true,
    recordAclAllowsAction: recordAcl !== 'denied',
  });
}

function createDecision(
  input: AuthorizationDecisionInput,
  allowed: boolean,
  reasonCode: AuthorizationDecision['reasonCode'],
  evidence: AuthorizationDecisionEvidence | undefined
): AuthorizationDecision {
  return Object.freeze({
    allowed,
    reasonCode,
    requiredScope: input.requiredScope,
    brandId: input.brand?.brandId,
    evidence,
  });
}

function recordAclDenied(recordAcl: AuthorizationRecordAclOutcome | undefined): boolean {
  return (recordAcl ?? 'not-applicable') === 'denied';
}

export function decideAuthorization(input: AuthorizationDecisionInput): AuthorizationDecision {
  const requiredScopeKnown = input.registry.has(input.requiredScope);
  const requiredScopeActive = requiredScopeKnown && input.registry.isActive(input.requiredScope);
  const principalHasRequiredScope =
    requiredScopeActive && input.principal.effectiveScopeKeys.includes(input.requiredScope);
  const evidence = input.includeEvidence
    ? createEvidence(input, requiredScopeActive, principalHasRequiredScope)
    : undefined;

  if (!requiredScopeKnown) {
    return createDecision(input, false, 'scope-missing', evidence);
  }

  if (!requiredScopeActive) {
    return createDecision(input, false, 'scope-orphaned', evidence);
  }

  if (!input.principal.active) {
    return createDecision(input, false, 'principal-inactive', evidence);
  }

  if (!(input.brand?.exists ?? true)) {
    return createDecision(input, false, 'brand-not-found', evidence);
  }

  if (!(input.brand?.authorized ?? true)) {
    return createDecision(input, false, 'brand-not-authorized', evidence);
  }

  // The action gate precedes every resource gate. Design section 5.3 scopes `404` to an
  // entity absent "in the authorized context", so a principal that has not passed the
  // action gate must not be able to tell a missing resource (`404`) from one it may not
  // touch (`403`) — that difference is an existence oracle for unauthorized callers.
  if (!principalHasRequiredScope) {
    return createDecision(input, false, 'scope-missing', evidence);
  }

  if (input.tokenCeiling && !input.tokenCeiling.scopeKeys.includes(input.requiredScope)) {
    return createDecision(input, false, 'token-scope-ceiling', evidence);
  }

  if (!(input.resource?.found ?? true)) {
    return createDecision(input, false, 'resource-not-found', evidence);
  }

  if (!(input.resource?.brandMatches ?? true)) {
    return createDecision(input, false, 'resource-brand-mismatch', evidence);
  }

  if (recordAclDenied(input.resource?.recordAcl)) {
    return createDecision(input, false, 'record-acl-denied', evidence);
  }

  return createDecision(input, true, 'allowed', evidence);
}
