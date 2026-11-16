import type { BrandingModel } from '../model';
import type { ReportingPrincipal, ReportingUser } from './types';
import { ReportingError } from './types';

interface RoleIdentity {
  readonly id: string;
  readonly name?: string;
}
/** Canonical role lookup used by RecordsService: resolve names through brand.roles, compare IDs. */
export function recordRoleNames(brand: BrandingModel, roles: readonly RoleIdentity[]): string[] {
  const names = [...new Set((brand.roles ?? []).map(role => role.name))];
  return names.filter(name => {
    // Match RolesService.getRole's first canonical match, including legacy duplicate names.
    const canonical = brand.roles.find(role => role.name === name);
    return canonical && roles.some(owned => String(owned.id) === String(canonical.id));
  });
}
const values = (value: unknown): unknown[] => (Array.isArray(value) ? value : value == null ? [] : [value]);
export function recordHasAccess(
  brand: BrandingModel,
  username: string,
  roles: readonly RoleIdentity[],
  record: Record<string, unknown>,
  editOnly = false,
  resolveRole: (brand: BrandingModel, name: string) => RoleIdentity | undefined = (activeBrand, name) =>
    activeBrand.roles?.find(role => role.name === name)
): boolean {
  const auth =
    record.authorization && typeof record.authorization === 'object'
      ? (record.authorization as Record<string, unknown>)
      : undefined;
  const permission = (name: string) => values(auth ? auth[name] : record[`authorization_${name}`]);
  return (
    ['edit', ...(editOnly ? [] : ['view'])].some(kind => permission(kind).some(value => value === username)) ||
    ['editRoles', ...(editOnly ? [] : ['viewRoles'])].some(kind =>
      permission(kind).some(value => {
        const role = resolveRole(brand, String(value));
        return role && roles.some(owned => String(owned.id) === String(role.id));
      })
    )
  );
}
export function assertReportingPrincipal(principal: ReportingPrincipal): void {
  if (
    typeof principal?.brand?.id !== 'string' ||
    !principal.brand.id ||
    typeof principal.user?.id !== 'string' ||
    !principal.user.id ||
    typeof principal.user.username !== 'string' ||
    !principal.user.username ||
    typeof principal.user.type !== 'string' ||
    !principal.user.type ||
    !Array.isArray(principal.brand.roles) ||
    principal.brand.roles.some(
      role => typeof role?.id !== 'string' || !role.id || typeof role.name !== 'string' || !role.name
    ) ||
    !Array.isArray(principal.roles) ||
    !Array.isArray(principal.user.roles) ||
    principal.user.loginDisabled ||
    principal.user.effectiveLoginDisabled ||
    principal.user.accountLinkState === 'linked-alias' ||
    principal.user.roles.some(role => typeof role?.id !== 'string' || !role.id) ||
    principal.roles.some(
      role => typeof role?.id !== 'string' || !role.id || !principal.user.roles.some(owned => owned.id === role.id)
    )
  ) {
    throw new ReportingError('AUTHENTICATION_REQUIRED');
  }
}
/** Server-side callers build this from an authenticated, refreshed/effective user; never from tool arguments. */
export function reportingPrincipal(brand: BrandingModel, user: ReportingUser): ReportingPrincipal {
  const principal = { brand, user, roles: user.roles };
  assertReportingPrincipal(principal);
  return principal;
}
export function reportingMongoAuthorization(principal: ReportingPrincipal): Record<string, unknown> {
  assertReportingPrincipal(principal);
  const names = recordRoleNames(principal.brand, principal.roles);
  return {
    'metaMetadata.brandId': principal.brand.id,
    $or: [
      { 'authorization.edit': principal.user.username },
      { 'authorization.view': principal.user.username },
      { 'authorization.editRoles': { $in: names } },
      { 'authorization.viewRoles': { $in: names } },
    ],
  };
}
/** Exact quoted terms, including usernames containing Lucene syntax. No empty role clauses. */
export function solrLiteral(value: string): string {
  return `"${value.replace(/([\\"])/g, '\\$1')}"`;
}
export function recordSolrAuthorization(
  brand: BrandingModel,
  username: string,
  roles: readonly RoleIdentity[],
  editOnly = false
): string {
  const clauses = [`authorization_edit:${solrLiteral(username)}`];
  if (!editOnly) clauses.push(`authorization_view:${solrLiteral(username)}`);
  const roleTerms = recordRoleNames(brand, roles).map(solrLiteral).join(' OR ');
  if (roleTerms) {
    clauses.push(`authorization_editRoles:(${roleTerms})`);
    if (!editOnly) clauses.push(`authorization_viewRoles:(${roleTerms})`);
  }
  return `(${clauses.join(' OR ')})`;
}
