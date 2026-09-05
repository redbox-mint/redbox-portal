import { associationIdentity, buildRoleIdentityKey } from './persistence-validation';

interface ProtectedRoleLike {
  readonly name?: unknown;
  readonly key?: unknown;
  readonly identityKey?: unknown;
  readonly displayName?: unknown;
  readonly contextType?: unknown;
  readonly branding?: unknown;
  readonly template?: unknown;
  readonly protectedKind?: unknown;
  readonly status?: unknown;
  readonly version?: unknown;
}

function brandingId(value: unknown): string | undefined {
  return associationIdentity(value as Parameters<typeof associationIdentity>[0]);
}

function hasPositiveVersion(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 1;
}

function hasNonEmptyDisplayName(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function expectedBrandIdentity(key: string, brandId: string): string {
  return buildRoleIdentityKey('brand', key, brandId);
}

/** Exact protected Guest identity for one brand (all fields conjunctive). */
export function isExactGuestRole(role: ProtectedRoleLike, brandId: string): boolean {
  // The persisted `key` is the immutable compatibility identity used by
  // record ACLs and Solr: it must be present and exact. A missing key never
  // falls back to `name`, otherwise a keyless row could validate as protected.
  return (
    role.name === 'Guest' &&
    role.key === 'Guest' &&
    role.identityKey === expectedBrandIdentity('Guest', brandId) &&
    hasNonEmptyDisplayName(role.displayName) &&
    role.contextType === 'brand' &&
    brandingId(role.branding) === brandId &&
    role.protectedKind === 'guest' &&
    hasPositiveVersion(role.version)
  );
}

/** Exact protected brand-administrator identity for one brand. */
export function isExactBrandAdminRole(role: ProtectedRoleLike, brandId: string): boolean {
  const key = typeof role.key === 'string' ? role.key : typeof role.name === 'string' ? role.name : undefined;
  if (key === undefined) return false;
  return (
    role.name === key &&
    role.key === key &&
    role.identityKey === expectedBrandIdentity(key, brandId) &&
    hasNonEmptyDisplayName(role.displayName) &&
    role.contextType === 'brand' &&
    brandingId(role.branding) === brandId &&
    role.protectedKind === 'brand-admin' &&
    hasPositiveVersion(role.version)
  );
}

/** Exact brandless protected system-administrator identity. */
export function isExactSystemAdminRole(role: ProtectedRoleLike): boolean {
  // The persisted `key` must be present and exact: a missing key never falls
  // back to `name`, otherwise a keyless `system-admin` row could validate.
  return (
    role.name === 'system-admin' &&
    role.key === 'system-admin' &&
    role.identityKey === 'system:system-admin' &&
    hasNonEmptyDisplayName(role.displayName) &&
    role.contextType === 'system' &&
    brandingId(role.branding) === undefined &&
    role.protectedKind === 'system-admin' &&
    hasPositiveVersion(role.version)
  );
}

/** Shared change detection for protected roles: key/identity/display/context/brand/version. */
export function protectedRoleIdentityDrift(
  role: ProtectedRoleLike,
  expected: { readonly identityKey: string; readonly contextType: 'brand' | 'system'; readonly protectedKind: string }
): boolean {
  return (
    role.identityKey !== expected.identityKey ||
    role.contextType !== expected.contextType ||
    role.protectedKind !== expected.protectedKind ||
    !hasNonEmptyDisplayName(role.displayName) ||
    !hasPositiveVersion(role.version)
  );
}

/** Required template key per protected kind. A protected role must pin its own kind's template. */
export const PROTECTED_TEMPLATE_KEY_BY_KIND: Readonly<Record<string, string>> = Object.freeze({
  guest: 'guest',
  'brand-admin': 'brand-admin',
  'system-admin': 'system-admin',
});

interface ProtectedTemplateLike {
  readonly key?: unknown;
  readonly protectedKind?: unknown;
  readonly contextType?: unknown;
  readonly status?: unknown;
  readonly currentRevision?: unknown;
}

/**
 * Exact protected template pin: the role carries a positive integer revision,
 * the template record carries the required key/kind/context, is active, and
 * the role pins exactly the required immutable revision. Any mismatch fails
 * closed so a tampered pin (wrong template, inactive template, unpinned or
 * mutated revision) cannot validate as protected.
 */
export function isExactProtectedRolePin(
  role: ProtectedRoleLike & { readonly templateRevision?: unknown; readonly template?: unknown },
  template: ProtectedTemplateLike | undefined,
  expected: { readonly templateKey: string; readonly protectedKind: string; readonly revision: number }
): boolean {
  if (!Number.isInteger(role.templateRevision) || Number(role.templateRevision) !== expected.revision) return false;
  if (role.template === undefined || role.template === null) return false;
  if (template === undefined) return false;
  return (
    template.key === expected.templateKey &&
    template.protectedKind === expected.protectedKind &&
    (expected.protectedKind === 'system-admin'
      ? template.contextType === 'system'
      : template.contextType === 'brand') &&
    template.status === 'active' &&
    template.currentRevision === expected.revision
  );
}

/** Required template pin per protected kind (revision 1 for the initial protected templates). */
export function expectedProtectedTemplatePin(protectedKind: 'guest' | 'brand-admin' | 'system-admin'): {
  readonly templateKey: string;
  readonly protectedKind: string;
  readonly revision: number;
} {
  return {
    templateKey: PROTECTED_TEMPLATE_KEY_BY_KIND[protectedKind],
    protectedKind,
    revision: 1,
  };
}
