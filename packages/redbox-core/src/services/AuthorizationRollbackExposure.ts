import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleAssignmentAttributes } from '../waterline-models/RoleAssignment';
import type { RoleTemplateRevisionAttributes } from '../waterline-models/RoleTemplateRevision';
import type { RoleScopeOverrideAttributes } from '../waterline-models/RoleScopeOverride';
import type { UserAttributes } from '../waterline-models/User';
import {
  asScopeKey,
  getRoleEffectiveScopes,
  isRoleKey,
  PROTECTED_ROLE_KINDS,
  ROLE_ASSIGNMENT_SOURCES,
  type ScopeRegistry,
} from '../authorization';
import {
  MAX_ROLLBACK_ROLES,
  MAX_ROLLBACK_ASSIGNMENTS,
  MAX_ROLLBACK_SCOPES,
  MAX_ROLLBACK_EXPOSURES,
  type RollbackScanReason,
  type AuthorizationRollbackExposureItem,
  type AuthorizationRollbackExposureReport,
} from '../authorization/rollback-exposure';

function id(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'id' in value) return id(value.id);
  return undefined;
}

/** Bounded in both datastore reads and returned user/role/scope fan-out. Read-only. */
export async function reportRollbackExposure(
  registry: ScopeRegistry,
  now: Date
): Promise<AuthorizationRollbackExposureReport> {
  const reasons = new Set<RollbackScanReason>();
  const items: AuthorizationRollbackExposureItem[] = [];
  const usersSeen = new Set<string>();
  const rolesSeen = new Set<string>();
  const scopesSeen = new Set<string>();
  try {
    const fetchedRoles = (await Role.find({ status: 'active' })
      .sort('id ASC')
      .limit(MAX_ROLLBACK_ROLES + 1)) as RoleAttributes[];
    if (fetchedRoles.length > MAX_ROLLBACK_ROLES) reasons.add('roles-limit');
    // Protected administrators have an explicit legacy projection; Guest is
    // implicit and cannot be assigned. Include template-backed nonprotected
    // roles too: an override or hook template can add new scope-only effects.
    const roles = fetchedRoles.slice(0, MAX_ROLLBACK_ROLES).filter(role => {
      if (id(role.id) === undefined || !PROTECTED_ROLE_KINDS.some(kind => kind === role.protectedKind)) {
        reasons.add('invalid-state');
        return false;
      }
      return role.status === 'active' && role.protectedKind === 'none';
    });
    const roleById = new Map(roles.map(role => [String(role.id), role]));
    if (roles.length > 0) {
      const fetchedAssignments = (await RoleAssignment.find({
        role: roles.map(role => role.id),
        principalType: 'user',
        status: 'active',
        sourcePresent: true,
        source: [...ROLE_ASSIGNMENT_SOURCES],
        or: [{ expiresAt: null }, { expiresAt: { '>': now } }],
      })
        .sort('id ASC')
        .limit(MAX_ROLLBACK_ASSIGNMENTS + 1)) as RoleAssignmentAttributes[];
      if (fetchedAssignments.length > MAX_ROLLBACK_ASSIGNMENTS) reasons.add('assignments-limit');
      const assignments = fetchedAssignments
        .slice(0, MAX_ROLLBACK_ASSIGNMENTS)
        .filter(
          row =>
            row.principalType === 'user' &&
            row.status === 'active' &&
            row.sourcePresent === true &&
            ROLE_ASSIGNMENT_SOURCES.includes(row.source) &&
            (row.expiresAt == null || new Date(row.expiresAt).getTime() > now.getTime())
        );
      const principalIds = [...new Set(assignments.map(row => row.principalId))];
      const users =
        principalIds.length === 0
          ? []
          : ((await User.find({ id: principalIds })
              .sort('id ASC')
              .limit(MAX_ROLLBACK_ASSIGNMENTS + 1)) as UserAttributes[]);
      if (users.length > MAX_ROLLBACK_ASSIGNMENTS) reasons.add('users-limit');
      const userById = new Map(users.slice(0, MAX_ROLLBACK_ASSIGNMENTS).map(user => [String(user.id), user]));
      const scopesByRole = new Map<string, readonly string[]>();
      const pairs = new Set<string>();
      for (const assignment of assignments) {
        const roleId = id(assignment.role);
        const role = roleId === undefined ? undefined : roleById.get(roleId);
        const user = userById.get(assignment.principalId);
        if (
          role === undefined ||
          user === undefined ||
          typeof role.key !== 'string' ||
          !isRoleKey(role.key) ||
          (role.contextType !== 'brand' && role.contextType !== 'system') ||
          (role.contextType === 'brand' &&
            (id(role.branding) === undefined || id(role.branding) !== id(assignment.branding))) ||
          (role.contextType === 'system' && (id(role.branding) !== undefined || id(assignment.branding) !== undefined))
        ) {
          reasons.add('invalid-state');
          continue;
        }
        if (user.loginDisabled === true) continue;
        if (user.accountLinkState === 'linked-alias' || user.linkedPrimaryUserId?.trim()) {
          reasons.add('invalid-state');
          continue;
        }
        const key = JSON.stringify([assignment.principalId, role.id]);
        if (pairs.has(key)) continue;
        pairs.add(key);
        let scopeKeys = scopesByRole.get(String(role.id));
        if (scopeKeys === undefined) {
          // Cache an empty result until the complete inputs are verified. An
          // incomplete role contributes no exposure and is not reread per user.
          scopesByRole.set(String(role.id), []);
          const templateId = id(role.template);
          let baseScopeKeys: ReturnType<typeof asScopeKey>[] = [];
          if (templateId !== undefined || (role.templateRevision != null && role.templateRevision !== 0)) {
            const revision =
              templateId === undefined
                ? undefined
                : ((await RoleTemplateRevision.findOne({
                    template: templateId,
                    revision: role.templateRevision,
                  })) as RoleTemplateRevisionAttributes | undefined);
            if (revision == null || !Array.isArray(revision.scopeKeys)) {
              reasons.add('invalid-state');
              continue;
            }
            if (revision.scopeKeys.length > MAX_ROLLBACK_SCOPES) {
              reasons.add('scopes-limit');
              continue;
            }
            baseScopeKeys = revision.scopeKeys.map(asScopeKey);
          }
          const overrides = (await RoleScopeOverride.find({ role: role.id })
            .sort('scopeKey ASC')
            .limit(MAX_ROLLBACK_SCOPES + 1)) as RoleScopeOverrideAttributes[];
          if (overrides.length > MAX_ROLLBACK_SCOPES) {
            // Truncation could omit a removal and invent effective capabilities,
            // violating the report's lower-bound counts even when incomplete.
            reasons.add('scopes-limit');
            continue;
          }
          if (overrides.some(row => row.effect !== 'add' && row.effect !== 'remove')) {
            reasons.add('invalid-state');
            continue;
          }
          const calculated = getRoleEffectiveScopes({
            baseScopeKeys,
            registry,
            overrides: overrides.map(row => ({ scopeKey: asScopeKey(row.scopeKey), effect: row.effect })),
          });
          if (calculated.missingScopeKeys.length > 0 || calculated.inactiveScopeKeys.length > 0)
            reasons.add('invalid-state');
          scopeKeys = calculated.effectiveScopeKeys.filter(
            scope => role.contextType !== 'brand' || !scope.startsWith('system.')
          );
          if (scopeKeys.length > MAX_ROLLBACK_SCOPES) reasons.add('scopes-limit');
          scopeKeys = scopeKeys.slice(0, MAX_ROLLBACK_SCOPES);
          scopesByRole.set(String(role.id), scopeKeys);
        }
        if (scopeKeys.length === 0) continue;
        usersSeen.add(assignment.principalId);
        rolesSeen.add(String(role.id));
        scopeKeys.forEach(scope => scopesSeen.add(scope));
        if (items.length >= MAX_ROLLBACK_EXPOSURES) {
          reasons.add('items-limit');
          continue;
        }
        const brandId = id(role.branding);
        items.push(
          Object.freeze({
            userId: assignment.principalId,
            roleId: String(role.id),
            roleKey: role.key,
            ...(brandId === undefined ? {} : { brandId }),
            scopeKeys: Object.freeze([...scopeKeys]),
            temporaryLegacyRoleAssessment: 'required',
          })
        );
      }
    }
  } catch {
    reasons.add('query-failed');
  }
  return Object.freeze({
    complete: reasons.size === 0,
    incompleteReasons: Object.freeze([...reasons].sort()),
    affectedUserCount: usersSeen.size,
    affectedRoleCount: rolesSeen.size,
    affectedCapabilityCount: scopesSeen.size,
    items: Object.freeze(items),
  });
}
