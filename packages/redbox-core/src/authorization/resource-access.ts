import { AuthorizationResourceError } from './errors';
import type { AuthorizationContext, AuthorizationDecision, AuthorizationResourceResult, RoleKey } from './types';

interface RoleLike {
  readonly key?: unknown;
  readonly name?: unknown;
  readonly branding?: unknown;
  readonly brandId?: unknown;
}

function associationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim();
    return id || undefined;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = Reflect.get(value, 'id');
    if (typeof id === 'string' || typeof id === 'number') {
      const normalized = String(id).trim();
      return normalized || undefined;
    }
  }
  return undefined;
}

export function authorizationResourceError(decision: AuthorizationDecision): AuthorizationResourceError {
  if (decision.reasonCode === 'principal-inactive') {
    return new AuthorizationResourceError('authorization.authentication-required', 401);
  }
  if (
    decision.reasonCode === 'brand-not-found' ||
    decision.reasonCode === 'resource-not-found' ||
    decision.reasonCode === 'resource-brand-mismatch'
  ) {
    return new AuthorizationResourceError('authorization.not-found', 404);
  }
  return new AuthorizationResourceError('authorization.resource-denied', 403);
}

export function requireAllowedResource<T>(result: AuthorizationResourceResult<T>): T {
  if (!result.allowed) throw authorizationResourceError(result.decision);
  return result.resource;
}

export function deniedResource<T>(decision: AuthorizationDecision): AuthorizationResourceResult<T> {
  return Object.freeze({ allowed: false, decision });
}

export function allowedResource<T>(decision: AuthorizationDecision, resource: T): AuthorizationResourceResult<T> {
  return Object.freeze({ allowed: true, decision, resource });
}

export function authorizationRoleKey(role: RoleLike): string | undefined {
  const value = role.key ?? role.name;
  if (typeof value !== 'string' || value.length === 0) return undefined;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return undefined;
  }
  return value;
}

export function authorizationRoleBrandId(role: RoleLike): string | undefined {
  return (
    associationId(role.branding) ?? (typeof role.brandId === 'string' ? role.brandId.trim() || undefined : undefined)
  );
}

/** Stable ACL keys for effective brand roles; global/system roles never match a stored brand ACL implicitly. */
export function effectiveRecordRoleKeys(roles: readonly RoleLike[], brandId: unknown): readonly string[] {
  const normalizedBrandId = associationId(brandId);
  if (normalizedBrandId === undefined) return Object.freeze([]);
  const keys = new Set<string>();
  for (const role of roles) {
    if (authorizationRoleBrandId(role) !== normalizedBrandId) continue;
    const key = authorizationRoleKey(role);
    if (key !== undefined) keys.add(key);
  }
  return Object.freeze([...keys].sort());
}

export function contextRecordRoleKeys(context: AuthorizationContext): readonly RoleKey[] {
  return Object.freeze(
    context.roles
      .filter(role => role.contextType === 'brand' && role.brandId === context.brand?.id)
      .map(role => role.key)
      .sort()
  );
}
