import { AuthorizationPersistenceValidationError } from './errors';
import {
  AUTHORIZATION_MAX_SCOPE_SET_SIZE,
  PROTECTED_ROLE_KINDS,
  ROLE_ASSIGNMENT_SOURCES,
  ROLE_ASSIGNMENT_STATUSES,
  type ProtectedRoleKind,
  type RoleAssignmentSource,
  type RoleAssignmentStatus,
  type ScopeKey,
} from './types';
import { asScopeKey, compareScopeKeys, isRoleKey } from './validators';

export const ROLE_CONTEXT_TYPES = ['brand', 'system'] as const;
export type RoleContextType = (typeof ROLE_CONTEXT_TYPES)[number];

export const AUTHORIZATION_ROLE_STATUSES = ['active', 'inactive'] as const;
export type AuthorizationRoleStatus = (typeof AUTHORIZATION_ROLE_STATUSES)[number];

export const AUTHORIZATION_SCOPE_STATUSES = ['active', 'deprecated', 'orphaned'] as const;
export type AuthorizationScopeStatus = (typeof AUTHORIZATION_SCOPE_STATUSES)[number];

export type AssociationIdentity = string | number | { readonly id: string | number } | null | undefined;

export interface RolePersistenceContext {
  readonly key: string;
  readonly name: string;
  readonly contextType: RoleContextType;
  readonly branding?: AssociationIdentity;
  readonly protectedKind: ProtectedRoleKind;
  readonly identityKey?: string | null;
}

export interface AssignmentRoleContext {
  readonly id: string | number;
  readonly contextType?: RoleContextType;
  readonly branding?: AssociationIdentity;
  readonly protectedKind?: ProtectedRoleKind;
}

export interface RoleAssignmentPersistenceContext {
  readonly branding?: AssociationIdentity;
  readonly status: RoleAssignmentStatus;
  readonly source: RoleAssignmentSource;
  readonly revokedAt?: string | Date | null;
  readonly revokedBy?: string | null;
  readonly suppressedAt?: string | Date | null;
  readonly suppressedBy?: string | null;
}

export function associationIdentity(value: AssociationIdentity): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const identity = String(value);
    return identity.length > 0 ? identity : undefined;
  }
  if (value !== null && typeof value === 'object') {
    return associationIdentity(value.id);
  }
  return undefined;
}

export function buildRoleIdentityKey(
  contextType: RoleContextType,
  key: string,
  branding?: AssociationIdentity
): string {
  if (!isRoleKey(key)) {
    throw new AuthorizationPersistenceValidationError(
      'role-identity-invalid',
      'Role.key must be a non-empty compatibility value without control characters.'
    );
  }
  const brandingId = associationIdentity(branding);
  if (contextType === 'brand') {
    if (brandingId === undefined) {
      throw new AuthorizationPersistenceValidationError(
        'role-context-invalid',
        'Brand roles require a branding relationship.'
      );
    }
    return `brand:${brandingId}:${key}`;
  }
  if (brandingId !== undefined) {
    throw new AuthorizationPersistenceValidationError(
      'role-context-invalid',
      'System roles cannot have a branding relationship.'
    );
  }
  return `system:${key}`;
}

export function validateRolePersistenceContext(context: RolePersistenceContext): string {
  if (context.name !== context.key) {
    throw new AuthorizationPersistenceValidationError(
      'role-identity-invalid',
      'Role.name and Role.key must retain the same exact compatibility text.'
    );
  }
  if (!ROLE_CONTEXT_TYPES.includes(context.contextType)) {
    throw new AuthorizationPersistenceValidationError('role-context-invalid', 'Role.contextType is invalid.');
  }
  if (!PROTECTED_ROLE_KINDS.includes(context.protectedKind)) {
    throw new AuthorizationPersistenceValidationError('role-context-invalid', 'Role.protectedKind is invalid.');
  }
  if (context.contextType === 'system' && context.protectedKind !== 'system-admin') {
    throw new AuthorizationPersistenceValidationError(
      'role-context-invalid',
      'The phase-one system role must be the protected system-administrator role.'
    );
  }
  if (context.contextType === 'brand' && context.protectedKind === 'system-admin') {
    throw new AuthorizationPersistenceValidationError(
      'role-context-invalid',
      'A brand role cannot be the protected system-administrator role.'
    );
  }
  const expectedIdentityKey = buildRoleIdentityKey(context.contextType, context.key, context.branding);
  if (context.identityKey != null && context.identityKey !== expectedIdentityKey) {
    throw new AuthorizationPersistenceValidationError(
      'role-identity-invalid',
      'Role.identityKey does not match the server-computed role context.'
    );
  }
  return expectedIdentityKey;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasDate(value: string | Date | null | undefined): boolean {
  if (value == null) {
    return false;
  }
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

export function validateRoleAssignmentPersistenceContext(
  assignment: RoleAssignmentPersistenceContext,
  role?: AssignmentRoleContext
): void {
  if (!ROLE_ASSIGNMENT_SOURCES.includes(assignment.source) || !ROLE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
    throw new AuthorizationPersistenceValidationError(
      'role-assignment-state-invalid',
      'Role assignment source or status is invalid.'
    );
  }
  // Revocation and suppression consistency does not depend on the role, so it is
  // enforced for model-level writes that cannot resolve the role on the caller's
  // leased transaction connection.
  if (assignment.status === 'revoked' && (!hasDate(assignment.revokedAt) || !hasText(assignment.revokedBy))) {
    throw new AuthorizationPersistenceValidationError(
      'role-assignment-state-invalid',
      'Revoked assignments require revokedAt and revokedBy.'
    );
  }
  if (assignment.status === 'suppressed') {
    if (assignment.source !== 'external' || !hasDate(assignment.suppressedAt) || !hasText(assignment.suppressedBy)) {
      throw new AuthorizationPersistenceValidationError(
        'role-assignment-state-invalid',
        'Suppressed assignments must be external and require suppressedAt and suppressedBy.'
      );
    }
  }
  if (role === undefined) {
    return;
  }
  if (role.protectedKind === 'guest') {
    throw new AuthorizationPersistenceValidationError(
      'role-assignment-guest-forbidden',
      'Guest is implicit and cannot be represented by a RoleAssignment.'
    );
  }
  if (role.contextType === 'brand') {
    const assignmentBrand = associationIdentity(assignment.branding);
    const roleBrand = associationIdentity(role.branding);
    if (assignmentBrand === undefined || roleBrand === undefined || assignmentBrand !== roleBrand) {
      throw new AuthorizationPersistenceValidationError(
        'role-assignment-context-invalid',
        'RoleAssignment.branding must match its brand role.'
      );
    }
  } else if (role.contextType === 'system') {
    if (associationIdentity(assignment.branding) !== undefined) {
      throw new AuthorizationPersistenceValidationError(
        'role-assignment-context-invalid',
        'A system-role assignment cannot have a branding relationship.'
      );
    }
  } else {
    throw new AuthorizationPersistenceValidationError(
      'role-assignment-context-invalid',
      'RoleAssignment requires a migrated role with a valid contextType.'
    );
  }
}

export function validateCanonicalScopeKeyArray(value: unknown): readonly ScopeKey[] {
  if (!Array.isArray(value)) {
    throw new AuthorizationPersistenceValidationError('scope-array-invalid', 'scopeKeys must be a JSON string array.');
  }
  if (value.length > AUTHORIZATION_MAX_SCOPE_SET_SIZE) {
    throw new AuthorizationPersistenceValidationError(
      'scope-array-invalid',
      `scopeKeys cannot contain more than ${AUTHORIZATION_MAX_SCOPE_SET_SIZE} entries.`
    );
  }
  const scopeKeys = value.map(item => {
    if (typeof item !== 'string') {
      throw new AuthorizationPersistenceValidationError('scope-array-invalid', 'scopeKeys must contain only strings.');
    }
    return asScopeKey(item);
  });
  for (let index = 1; index < scopeKeys.length; index += 1) {
    if (compareScopeKeys(scopeKeys[index - 1], scopeKeys[index]) >= 0) {
      throw new AuthorizationPersistenceValidationError(
        'scope-array-invalid',
        'scopeKeys must be sorted and contain no duplicates.'
      );
    }
  }
  return Object.freeze(scopeKeys);
}

export function sanitizeAuthorizationText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const sanitized = Array.from(value)
    .filter(character => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join('')
    .trim();
  return sanitized.length > 0 ? sanitized.slice(0, maxLength) : undefined;
}
