declare const scopeKeyBrand: unique symbol;
declare const roleKeyBrand: unique symbol;

export type ScopeKey = string & { readonly [scopeKeyBrand]: 'ScopeKey' };
export type RoleKey = string & { readonly [roleKeyBrand]: 'RoleKey' };

export const AUTHORIZATION_SCOPE_RISKS = ['read', 'write', 'admin', 'system'] as const;
export type AuthorizationScopeRisk = (typeof AUTHORIZATION_SCOPE_RISKS)[number];

export const AUTHORIZATION_SCOPE_SOURCE_TYPES = ['core', 'hook'] as const;
export type AuthorizationScopeSourceType = (typeof AUTHORIZATION_SCOPE_SOURCE_TYPES)[number];

export const ROLLOUT_MODES = ['legacy', 'shadow', 'enforce'] as const;
export type RolloutMode = (typeof ROLLOUT_MODES)[number];

export const ROLE_SCOPE_EFFECTS = ['add', 'remove'] as const;
export type RoleScopeEffect = (typeof ROLE_SCOPE_EFFECTS)[number];

export const ROLE_ASSIGNMENT_SOURCES = ['manual', 'onboarding', 'migration', 'external', 'recovery'] as const;
export type RoleAssignmentSource = (typeof ROLE_ASSIGNMENT_SOURCES)[number];

export const ROLE_ASSIGNMENT_STATUSES = ['active', 'revoked', 'suppressed'] as const;
export type RoleAssignmentStatus = (typeof ROLE_ASSIGNMENT_STATUSES)[number];

export const PROTECTED_ROLE_KINDS = ['none', 'guest', 'brand-admin', 'system-admin'] as const;
export type ProtectedRoleKind = (typeof PROTECTED_ROLE_KINDS)[number];

export const AUTHORIZATION_PRINCIPAL_CATEGORIES = [
  'anonymous',
  'authenticated',
  'system-admin',
  'legacy-bearer',
  'system-process',
] as const;
export type AuthorizationPrincipalCategory = (typeof AUTHORIZATION_PRINCIPAL_CATEGORIES)[number];

export const AUTHORIZATION_AUTH_METHODS = ['anonymous', 'session', 'bearer', 'internal'] as const;
export type AuthorizationAuthMethod = (typeof AUTHORIZATION_AUTH_METHODS)[number];

export const AUTHORIZATION_CONTEXT_TYPES = ['brand', 'system'] as const;
export type AuthorizationContextType = (typeof AUTHORIZATION_CONTEXT_TYPES)[number];

export const AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS = 100;
export const AUTHORIZATION_MAX_SCOPE_SET_SIZE = 500;
export const AUTHORIZATION_TEMPLATE_REVISION_WINDOW_SIZE = 20;

export const AUTHORIZATION_RECORD_ACL_OUTCOMES = ['not-applicable', 'allowed', 'denied'] as const;
export type AuthorizationRecordAclOutcome = (typeof AUTHORIZATION_RECORD_ACL_OUTCOMES)[number];

export const AUTHORIZATION_DECISION_REASON_CODES = [
  'allowed',
  'principal-inactive',
  'brand-not-found',
  'brand-not-authorized',
  'legacy-path-denied',
  'scope-missing',
  'scope-orphaned',
  'token-scope-ceiling',
  'resource-not-found',
  'resource-brand-mismatch',
  'record-acl-denied',
] as const;
export type AuthorizationDecisionReasonCode = (typeof AUTHORIZATION_DECISION_REASON_CODES)[number];

export interface AuthorizationScopeDefinition {
  key: ScopeKey;
  label: string;
  description: string;
  risk: AuthorizationScopeRisk;
  deprecated?: boolean;
  replacementKey?: ScopeKey;
}

/** Synchronous, side-effect-free hook contract used during loader discovery. */
export type AuthorizationScopeProvider = () => readonly AuthorizationScopeDefinition[];

export interface ScopeRegistrySource {
  sourceType: AuthorizationScopeSourceType;
  sourcePackage: string;
  sourceVersion: string;
  definitions: readonly AuthorizationScopeDefinition[];
}

export interface RegisteredScopeDefinition extends AuthorizationScopeDefinition {
  namespace: string;
  sourceType: AuthorizationScopeSourceType;
  sourcePackage: string;
  sourceVersion: string;
  status: 'active' | 'deprecated';
}

export interface ScopeActivityReader {
  has(scopeKey: ScopeKey): boolean;
  isActive(scopeKey: ScopeKey): boolean;
}

export interface ScopeKeyValidationSummary {
  activeScopeKeys: readonly ScopeKey[];
  inactiveScopeKeys: readonly ScopeKey[];
  missingScopeKeys: readonly ScopeKey[];
}

export interface RoleTemplateRevision {
  templateKey: RoleKey;
  revision: number;
  scopeKeys: readonly ScopeKey[];
  protectedKind?: ProtectedRoleKind;
}

export interface RoleScopeOverride {
  scopeKey: ScopeKey;
  effect: RoleScopeEffect;
}

export interface RoleEffectiveScopeInput {
  baseScopeKeys?: readonly ScopeKey[];
  overrides?: readonly RoleScopeOverride[];
  registry?: ScopeActivityReader;
}

export interface RoleEffectiveScopeResult {
  effectiveScopeKeys: readonly ScopeKey[];
  inactiveScopeKeys: readonly ScopeKey[];
  missingScopeKeys: readonly ScopeKey[];
}

export interface RoleScopeNormalizationInput {
  baseScopeKeys: readonly ScopeKey[];
  desiredScopeKeys: readonly ScopeKey[];
}

export interface RoleTemplateUpgradePreview {
  currentEffectiveScopeKeys: readonly ScopeKey[];
  nextEffectiveScopeKeys: readonly ScopeKey[];
  addedScopeKeys: readonly ScopeKey[];
  removedScopeKeys: readonly ScopeKey[];
  nextOverrides: readonly RoleScopeOverride[];
  inactiveScopeKeys: readonly ScopeKey[];
  missingScopeKeys: readonly ScopeKey[];
}

export interface AuthorizationPrincipalContext {
  category: AuthorizationPrincipalCategory;
  authMethod: AuthorizationAuthMethod;
  active: boolean;
  effectiveScopeKeys: readonly ScopeKey[];
}

export interface AuthorizationResolvedPrincipal {
  readonly category: AuthorizationPrincipalCategory;
  readonly authMethod: AuthorizationAuthMethod;
  readonly active: boolean;
  readonly userId?: string;
  readonly username?: string;
  readonly operationId?: string;
}

export interface AuthorizationResolvedBrand {
  readonly requestedIdentifier?: string;
  readonly id?: string;
  readonly name?: string;
  readonly exists: boolean;
  readonly authorized: boolean;
}

export interface AuthorizationAssignmentSourceEvidence {
  readonly assignmentId: string;
  readonly source: RoleAssignmentSource;
  readonly sourceKey: string;
  readonly expiresAt?: string;
}

export interface EffectiveAuthorizationRole {
  readonly id: string;
  readonly key: RoleKey;
  readonly name: string;
  readonly displayName: string;
  readonly contextType: AuthorizationContextType;
  readonly brandId?: string;
  readonly protectedKind: ProtectedRoleKind;
  readonly implicit: boolean;
  readonly assignmentCount: number;
  readonly assignmentsTruncated: boolean;
  readonly assignments: readonly AuthorizationAssignmentSourceEvidence[];
  readonly effectiveScopeKeys: readonly ScopeKey[];
  readonly inactiveScopeKeys: readonly ScopeKey[];
  readonly missingScopeKeys: readonly ScopeKey[];
}

export interface AuthorizationCompatibilityRole {
  readonly id: string;
  readonly key: RoleKey;
  readonly name: string;
  readonly displayName: string;
  readonly contextType: AuthorizationContextType;
  readonly protectedKind: ProtectedRoleKind;
  readonly branding?: Readonly<{
    id: string;
    name: string;
  }>;
}

export interface AuthorizationScopeProvenance {
  readonly scopeKey: ScopeKey;
  readonly roleIds: readonly string[];
  readonly roleKeys: readonly RoleKey[];
}

export interface AuthorizationResolutionEvidence {
  readonly expiredAssignmentIds: readonly string[];
  readonly ignoredAssignmentIds: readonly string[];
  readonly inactiveRoleIds: readonly string[];
  readonly ignoredRoleIds: readonly string[];
  readonly missingTemplateRevisionRoleIds: readonly string[];
  readonly inactiveScopeKeys: readonly ScopeKey[];
  readonly missingScopeKeys: readonly ScopeKey[];
  readonly rejectedScopeKeys: readonly ScopeKey[];
}

/**
 * Immutable, request-local authority projection. `grantedScopeKeys` records the
 * active role union before a credential ceiling, while `effectiveScopeKeys` is
 * the only set consumers may use for authorization.
 */
export interface AuthorizationContext {
  readonly contextType: AuthorizationContextType;
  readonly principal: AuthorizationResolvedPrincipal;
  readonly brand?: AuthorizationResolvedBrand;
  readonly roles: readonly EffectiveAuthorizationRole[];
  readonly compatibilityRoles: readonly AuthorizationCompatibilityRole[];
  readonly roleKeys: readonly RoleKey[];
  readonly grantedScopeKeys: readonly ScopeKey[];
  readonly effectiveScopeKeys: readonly ScopeKey[];
  readonly tokenScopeCeiling?: readonly ScopeKey[];
  readonly scopeProvenance: readonly AuthorizationScopeProvenance[];
  readonly resolutionEvidence: AuthorizationResolutionEvidence;
}

export interface AuthorizationBrandContext {
  brandId?: string;
  exists?: boolean;
  authorized?: boolean;
}

export interface AuthorizationTokenCeilingContext {
  scopeKeys: readonly ScopeKey[];
}

export interface AuthorizationResourceContext {
  found?: boolean;
  brandMatches?: boolean;
  recordAcl?: AuthorizationRecordAclOutcome;
}

export interface AuthorizationDecisionEvidence {
  requiredScopeActive: boolean;
  principalActive: boolean;
  principalHasRequiredScope: boolean;
  brandKnown: boolean;
  brandAuthorized: boolean;
  tokenAllowsRequiredScope: boolean;
  resourceFound: boolean;
  resourceBrandMatches: boolean;
  recordAclAllowsAction: boolean;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: AuthorizationDecisionReasonCode;
  requiredScope?: ScopeKey;
  brandId?: string;
  evidence?: AuthorizationDecisionEvidence;
}

/**
 * Result returned by resource-owning services after composing the action,
 * brand/entity and optional record ACL gates. A denied result never carries
 * the resource that was used to make the decision.
 */
export type AuthorizationResourceResult<T> =
  | {
      readonly allowed: true;
      readonly decision: AuthorizationDecision;
      readonly resource: T;
    }
  | {
      readonly allowed: false;
      readonly decision: AuthorizationDecision;
    };

export interface AuthorizationDecisionExplanationProjection {
  readonly principal: AuthorizationResolvedPrincipal;
  readonly brand?: AuthorizationResolvedBrand;
  readonly roles: readonly EffectiveAuthorizationRole[];
  readonly grantedScopeKeys: readonly ScopeKey[];
  readonly effectiveScopeKeys: readonly ScopeKey[];
  readonly tokenScopeCeiling?: readonly ScopeKey[];
  readonly scopeProvenance: readonly AuthorizationScopeProvenance[];
  readonly resolutionEvidence: AuthorizationResolutionEvidence;
}

export type AuthorizationExplanationResult =
  | {
      readonly explained: false;
      readonly decision: AuthorizationDecision;
    }
  | {
      readonly explained: true;
      readonly decision: AuthorizationDecision;
      readonly projection: AuthorizationDecisionExplanationProjection;
    };

export interface AuthorizationDecisionInput {
  requiredScope: ScopeKey;
  principal: AuthorizationPrincipalContext;
  registry: ScopeActivityReader;
  brand?: AuthorizationBrandContext;
  tokenCeiling?: AuthorizationTokenCeilingContext;
  resource?: AuthorizationResourceContext;
  includeEvidence?: boolean;
}

export type RouteAuthorization =
  | {
      kind: 'scope';
      scope: ScopeKey;
    }
  | {
      kind: 'public';
      reason: string;
    }
  | {
      kind: 'pre-auth';
      reason: string;
    };

export interface ShadowFingerprintInput {
  routeId: string;
  brandId?: string;
  principalCategory: AuthorizationPrincipalCategory;
  legacyAllowed: boolean;
  decision: Pick<AuthorizationDecision, 'allowed' | 'reasonCode'>;
}
