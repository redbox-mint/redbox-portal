import { AuthorizationValidationError } from './errors';
import { RoleKey, ScopeKey } from './types';

export const SCOPE_KEY_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
export const SCOPE_KEY_MAX_LENGTH = 256;
export const NEW_ROLE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export const RESERVED_CORE_SCOPE_NAMESPACES = Object.freeze([
  'portal',
  'record',
  'attachment',
  'search',
  'dashboard',
  'workspace',
  'vocabulary',
  'form',
  'record-type',
  'report',
  'export',
  'harvest',
  'integration',
  'branding',
  'translation',
  'app-config',
  'navigation',
  'named-query',
  'user',
  'authorization',
  'system',
] as const);

const RESERVED_CORE_SCOPE_NAMESPACE_SET = new Set<string>(RESERVED_CORE_SCOPE_NAMESPACES);

function hasOnlyWhitespace(value: string): boolean {
  return value.trim().length === 0;
}

function containsControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

export function isReservedCoreScopeNamespace(namespace: string): boolean {
  return RESERVED_CORE_SCOPE_NAMESPACE_SET.has(namespace);
}

export function isScopeKey(value: string): value is ScopeKey {
  return value.length <= SCOPE_KEY_MAX_LENGTH && SCOPE_KEY_PATTERN.test(value);
}

export function isRoleKey(value: string): value is RoleKey {
  return !hasOnlyWhitespace(value) && !containsControlCharacters(value);
}

export function isNewRoleKey(value: string): value is RoleKey {
  return NEW_ROLE_KEY_PATTERN.test(value);
}

export function asScopeKey(value: string): ScopeKey {
  if (!isScopeKey(value)) {
    throw new AuthorizationValidationError(
      'scope-key-invalid',
      `Invalid scope key "${value}". Scope keys must be at most ${SCOPE_KEY_MAX_LENGTH} characters and use lower-case dot-separated business segments like "record.read".`
    );
  }

  return value as ScopeKey;
}

export function asRoleKey(value: string): RoleKey {
  if (!isRoleKey(value)) {
    throw new AuthorizationValidationError(
      'role-key-invalid',
      `Invalid role key "${value}". Existing role keys are exact compatibility values and must be non-empty without control characters.`
    );
  }

  return value as RoleKey;
}

export function asNewRoleKey(value: string): RoleKey {
  if (!isNewRoleKey(value)) {
    throw new AuthorizationValidationError(
      'role-key-new-invalid',
      `Invalid new role key "${value}". New role keys must match "^[a-z][a-z0-9-]{0,63}$".`
    );
  }

  return value as RoleKey;
}

/**
 * Canonical scope-key ordering. Uses code-unit comparison rather than `localeCompare`
 * because the registry generation hash and persisted revision arrays must be identical
 * across instances regardless of the host's ICU locale, and default collation treats
 * `-` and `.` as ignorable punctuation.
 */
export function compareScopeKeys(left: ScopeKey, right: ScopeKey): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function getScopeNamespace(scopeKey: ScopeKey): string {
  const [namespace] = scopeKey.split('.', 1);
  return namespace;
}

export function deriveHookScopeNamespace(sourcePackage: string): string | null {
  const match = sourcePackage.match(/^(?:@[^/]+\/)?redbox-hook-([a-z0-9-]+)$/);
  return match?.[1] ?? null;
}
