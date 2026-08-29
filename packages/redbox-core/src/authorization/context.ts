import type {
  AuthorizationAssignmentSourceEvidence,
  AuthorizationCompatibilityRole,
  AuthorizationContext,
  AuthorizationResolutionEvidence,
  AuthorizationResolvedBrand,
  AuthorizationResolvedPrincipal,
  AuthorizationScopeProvenance,
  EffectiveAuthorizationRole,
  RoleKey,
  ScopeKey,
} from './types';

export interface AuthorizationContextInput {
  readonly contextType: AuthorizationContext['contextType'];
  readonly principal: AuthorizationResolvedPrincipal;
  readonly brand?: AuthorizationResolvedBrand;
  readonly roles?: readonly EffectiveAuthorizationRole[];
  readonly compatibilityRoles?: readonly AuthorizationCompatibilityRole[];
  readonly roleKeys?: readonly RoleKey[];
  readonly grantedScopeKeys?: readonly ScopeKey[];
  readonly effectiveScopeKeys?: readonly ScopeKey[];
  readonly tokenScopeCeiling?: readonly ScopeKey[];
  readonly scopeProvenance?: readonly AuthorizationScopeProvenance[];
  readonly resolutionEvidence?: AuthorizationResolutionEvidence;
}

const EMPTY_RESOLUTION_EVIDENCE: AuthorizationResolutionEvidence = Object.freeze({
  expiredAssignmentIds: Object.freeze([]),
  ignoredAssignmentIds: Object.freeze([]),
  inactiveRoleIds: Object.freeze([]),
  ignoredRoleIds: Object.freeze([]),
  missingTemplateRevisionRoleIds: Object.freeze([]),
  inactiveScopeKeys: Object.freeze([]),
  missingScopeKeys: Object.freeze([]),
  rejectedScopeKeys: Object.freeze([]),
});

function freezeStrings<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeAssignment(assignment: AuthorizationAssignmentSourceEvidence): AuthorizationAssignmentSourceEvidence {
  return Object.freeze({ ...assignment });
}

function freezeRole(role: EffectiveAuthorizationRole): EffectiveAuthorizationRole {
  return Object.freeze({
    ...role,
    assignments: Object.freeze(role.assignments.map(freezeAssignment)),
    effectiveScopeKeys: freezeStrings(role.effectiveScopeKeys),
    inactiveScopeKeys: freezeStrings(role.inactiveScopeKeys),
    missingScopeKeys: freezeStrings(role.missingScopeKeys),
  });
}

function freezeCompatibilityRole(role: AuthorizationCompatibilityRole): AuthorizationCompatibilityRole {
  return Object.freeze({
    ...role,
    ...(role.branding === undefined ? {} : { branding: Object.freeze({ ...role.branding }) }),
  });
}

function freezeProvenance(provenance: AuthorizationScopeProvenance): AuthorizationScopeProvenance {
  return Object.freeze({
    scopeKey: provenance.scopeKey,
    roleIds: freezeStrings(provenance.roleIds),
    roleKeys: freezeStrings(provenance.roleKeys),
  });
}

function freezeResolutionEvidence(evidence: AuthorizationResolutionEvidence): AuthorizationResolutionEvidence {
  return Object.freeze({
    expiredAssignmentIds: freezeStrings(evidence.expiredAssignmentIds),
    ignoredAssignmentIds: freezeStrings(evidence.ignoredAssignmentIds),
    inactiveRoleIds: freezeStrings(evidence.inactiveRoleIds),
    ignoredRoleIds: freezeStrings(evidence.ignoredRoleIds),
    missingTemplateRevisionRoleIds: freezeStrings(evidence.missingTemplateRevisionRoleIds),
    inactiveScopeKeys: freezeStrings(evidence.inactiveScopeKeys),
    missingScopeKeys: freezeStrings(evidence.missingScopeKeys),
    rejectedScopeKeys: freezeStrings(evidence.rejectedScopeKeys),
  });
}

export function createAnonymousAuthorizationPrincipal(): AuthorizationResolvedPrincipal {
  return Object.freeze({ category: 'anonymous', authMethod: 'anonymous', active: true });
}

export function createUserAuthorizationPrincipal(input: {
  readonly userId?: string;
  readonly username?: string;
  readonly active: boolean;
  readonly systemAdministrator?: boolean;
}): AuthorizationResolvedPrincipal {
  return Object.freeze({
    category: input.systemAdministrator === true ? 'system-admin' : 'authenticated',
    authMethod: 'session',
    active: input.active,
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    ...(input.username === undefined ? {} : { username: input.username }),
  });
}

export function createLegacyBearerAuthorizationPrincipal(input: {
  readonly userId?: string;
  readonly username?: string;
  readonly active: boolean;
  readonly systemAdministrator?: boolean;
}): AuthorizationResolvedPrincipal {
  return Object.freeze({
    category: input.systemAdministrator === true ? 'system-admin' : 'legacy-bearer',
    authMethod: 'bearer',
    active: input.active,
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    ...(input.username === undefined ? {} : { username: input.username }),
  });
}

/** Finalizes the authority-bearing object and recursively freezes every nested collection. */
export function freezeAuthorizationContext(input: AuthorizationContextInput): AuthorizationContext {
  const roles = Object.freeze((input.roles ?? []).map(freezeRole));
  const compatibilityRoles = Object.freeze((input.compatibilityRoles ?? []).map(freezeCompatibilityRole));
  const context: AuthorizationContext = {
    contextType: input.contextType,
    principal: Object.freeze({ ...input.principal }),
    ...(input.brand === undefined ? {} : { brand: Object.freeze({ ...input.brand }) }),
    roles,
    compatibilityRoles,
    roleKeys: freezeStrings(input.roleKeys ?? roles.map(role => role.key)),
    grantedScopeKeys: freezeStrings(input.grantedScopeKeys ?? []),
    effectiveScopeKeys: freezeStrings(input.effectiveScopeKeys ?? []),
    ...(input.tokenScopeCeiling === undefined ? {} : { tokenScopeCeiling: freezeStrings(input.tokenScopeCeiling) }),
    scopeProvenance: Object.freeze((input.scopeProvenance ?? []).map(freezeProvenance)),
    resolutionEvidence: freezeResolutionEvidence(input.resolutionEvidence ?? EMPTY_RESOLUTION_EVIDENCE),
  };
  return Object.freeze(context);
}
