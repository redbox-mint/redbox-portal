import { Services as services } from '../CoreService';
import {
  GUEST_SCOPE_ALLOWLIST,
  associationIdentity,
  buildRoleIdentityKey,
  type DefaultRoleTemplateDefinition,
  type ScopeKey,
  type ScopeRegistry,
} from '../authorization';
import { DEFAULT_ROLE_TEMPLATES } from '../authorization/default-role-templates';
import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleScopeOverrideAttributes } from '../waterline-models/RoleScopeOverride';
import type { RoleAssignmentAttributes } from '../waterline-models/RoleAssignment';
import type { RoleTemplateAttributes } from '../waterline-models/RoleTemplate';
import type { UserAttributes } from '../waterline-models/User';
import { runWithRequiredTransaction } from '../utilities/RequiredTransactionUtils';
import type { AuthorizationMigrationIssue, AuthorizationDriftReport } from './AuthorizationMigrationService';

const BOOTSTRAP_ACTOR = 'bootstrap:authorization-invariants';
const BOOTSTRAP_SOURCE_KEY = 'bootstrap-parent-administrator';

export interface AuthorizationProtectedBootstrapInput {
  readonly bootstrapUser?: unknown;
}

export interface AuthorizationProtectedBootstrapResult {
  readonly guestRolesCreated: number;
  readonly guestRolesRepaired: number;
  readonly systemRoleCreated: boolean;
  readonly systemAssignmentCreated: boolean;
  readonly systemAssignmentRepaired: boolean;
  readonly issues: readonly AuthorizationMigrationIssue[];
  readonly drift: AuthorizationDriftReport;
}

function userId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('id' in value)) return undefined;
  const id = value.id;
  return typeof id === 'string' || typeof id === 'number' ? associationIdentity(id) : undefined;
}

function templateDefinition(key: string): DefaultRoleTemplateDefinition {
  const definition = DEFAULT_ROLE_TEMPLATES.find(template => template.key === key);
  if (definition === undefined) throw new Error(`Required default role template '${key}' is not declared.`);
  return definition;
}

async function templateRecord(key: string): Promise<RoleTemplateAttributes> {
  const template = await RoleTemplate.findOne({ key });
  if (template == null) throw new Error(`Required persisted role template '${key}' is missing.`);
  return template;
}

async function bootstrapAudit(
  eventType: 'role.created' | 'role.updated' | 'role.scopes-updated' | 'assignment.created',
  targetType: 'role' | 'role-assignment',
  targetId: string,
  after: unknown,
  connection: Sails.Connection,
  brandId?: string
): Promise<void> {
  await sails.services.authorizationauditservice.createSucceededEvent(
    {
      eventType,
      actorType: 'system-process',
      actorId: BOOTSTRAP_ACTOR,
      authMethod: 'internal',
      targetType,
      targetId,
      brandId,
      after,
      reasonCode: 'authorization-protected-bootstrap',
    },
    connection
  );
}

export type ProtectedSystemAssignmentBootstrapIssueCode =
  | 'bootstrap-system-assignment-revoked'
  | 'bootstrap-system-assignment-suppressed'
  | 'bootstrap-system-assignment-expired'
  | 'bootstrap-system-assignment-noncanonical';

/**
 * Bootstrap may create the protected source tuple once, but it must never turn a
 * persisted denial or expiry back into authority. Even an otherwise-active row with
 * a future expiry or missing source presence is left untouched for explicit operator
 * recovery: clearing either state during lift would silently broaden authority.
 */
export function protectedSystemAssignmentBootstrapIssue(
  assignment: Pick<RoleAssignmentAttributes, 'expiresAt' | 'sourcePresent' | 'status'>,
  now: Date
): ProtectedSystemAssignmentBootstrapIssueCode | undefined {
  if (assignment.status === 'revoked') return 'bootstrap-system-assignment-revoked';
  if (assignment.status === 'suppressed') return 'bootstrap-system-assignment-suppressed';
  if (assignment.expiresAt != null) {
    const expiresAt = new Date(assignment.expiresAt).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
      return 'bootstrap-system-assignment-expired';
    }
    return 'bootstrap-system-assignment-noncanonical';
  }
  return assignment.status === 'active' && assignment.sourcePresent === true
    ? undefined
    : 'bootstrap-system-assignment-noncanonical';
}

/**
 * A Guest override may stay only when it is expressible and safe: removals are always
 * safe, and an addition must name a scope on the reviewed Guest allowlist. Any override
 * naming a scope the deployed registry no longer declares is dropped, because it can
 * never grant anything and would otherwise linger as unexplained configuration.
 */
function isRetainableGuestOverride(override: RoleScopeOverrideAttributes): boolean {
  const registry = sails.services.authorizationscopeservice.getRegistry() as ScopeRegistry;
  const scopeKey = override.scopeKey as ScopeKey;
  if (!registry.isActive(scopeKey)) {
    return false;
  }
  return override.effect === 'remove' || GUEST_SCOPE_ALLOWLIST.has(scopeKey);
}

async function resolveCanonicalBootstrapUser(
  candidateId: string | undefined,
  issues: AuthorizationMigrationIssue[]
): Promise<UserAttributes | undefined> {
  if (!candidateId) {
    issues.push({ code: 'bootstrap-user-missing', severity: 'blocker', entityType: 'protected-state' });
    return undefined;
  }
  let current = await User.findOne({ id: candidateId });
  const visited = new Set<string>();
  for (let depth = 0; current != null && depth < 16; depth += 1) {
    const id = String(current.id);
    if (visited.has(id)) {
      issues.push({ code: 'bootstrap-user-link-cycle', severity: 'blocker', entityType: 'protected-state' });
      return undefined;
    }
    visited.add(id);
    if (!current.linkedPrimaryUserId?.trim()) {
      if (current.loginDisabled === true) {
        issues.push({ code: 'bootstrap-user-disabled', severity: 'blocker', entityType: 'protected-state' });
        return undefined;
      }
      return current;
    }
    current = await User.findOne({ id: current.linkedPrimaryUserId });
  }
  issues.push({ code: 'bootstrap-user-primary-missing', severity: 'blocker', entityType: 'protected-state' });
  return undefined;
}

export namespace Services {
  export class AuthorizationBootstrapService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['bootstrap'];

    private async ensureGuestRoles(
      issues: AuthorizationMigrationIssue[]
    ): Promise<{ created: number; repaired: number }> {
      const definition = templateDefinition('guest');
      const template = await templateRecord('guest');
      const brands = (await BrandingConfig.find({})) as Array<{ id: string }>;
      let created = 0;
      let repaired = 0;
      for (const brand of brands) {
        const candidates = (await Role.find({
          branding: brand.id,
          or: [{ protectedKind: 'guest' }, { name: definition.legacyRoleName }],
        })) as RoleAttributes[];
        if (candidates.length > 1) {
          issues.push({
            code: 'protected-guest-ambiguous',
            severity: 'blocker',
            entityType: 'protected-state',
            entityId: brand.id,
          });
          continue;
        }
        await runWithRequiredTransaction(Role.getDatastore(), async connection => {
          let role = candidates[0];
          if (role === undefined) {
            role = await Role.create({
              name: definition.legacyRoleName,
              key: definition.legacyRoleName,
              identityKey: buildRoleIdentityKey('brand', String(definition.legacyRoleName), brand.id),
              displayName: definition.displayName,
              description: definition.description,
              contextType: 'brand',
              branding: brand.id,
              template: template.id,
              templateRevision: definition.revision,
              protectedKind: 'guest',
              status: 'active',
              version: 1,
              createdBy: BOOTSTRAP_ACTOR,
              updatedBy: BOOTSTRAP_ACTOR,
            })
              .fetch()
              .usingConnection(connection);
            await bootstrapAudit('role.created', 'role', role.id, { protectedKind: 'guest' }, connection, brand.id);
            created += 1;
          } else {
            const expectedIdentity = buildRoleIdentityKey('brand', role.name, brand.id);
            if (role.key && role.key !== role.name) {
              issues.push({
                code: 'protected-guest-key-drift',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              return;
            }
            const changes = {
              key: role.name,
              identityKey: expectedIdentity,
              displayName: role.displayName?.trim() ? role.displayName : definition.displayName,
              contextType: 'brand',
              template: template.id,
              templateRevision: definition.revision,
              protectedKind: 'guest',
              status: 'active',
              version: Number.isInteger(role.version) && Number(role.version) >= 1 ? role.version : 1,
              updatedBy: BOOTSTRAP_ACTOR,
            };
            const changed =
              role.identityKey !== expectedIdentity ||
              role.protectedKind !== 'guest' ||
              role.status !== 'active' ||
              associationIdentity(role.template) !== template.id ||
              role.templateRevision !== definition.revision;
            if (changed) {
              const updated = await Role.updateOne({ id: role.id })
                .set(changes)
                .meta({ skipAllLifecycleCallbacks: true })
                .usingConnection(connection);
              if (updated == null) throw new Error(`Guest role '${role.id}' changed concurrently.`);
              await bootstrapAudit('role.updated', 'role', role.id, { protectedKind: 'guest' }, connection, brand.id);
              repaired += 1;
            }
          }
          // Guest scopes remain administrator-configurable, so normalization removes
          // only the overrides that are unsafe or unusable: additions outside the
          // reviewed Guest allowlist, and any override naming a scope the deployed
          // registry no longer declares. Valid removals and allowlisted additions are
          // preserved.
          const unsafeOverrideIds = (
            (await RoleScopeOverride.find({ role: role.id }).usingConnection(
              connection
            )) as RoleScopeOverrideAttributes[]
          )
            .filter(override => !isRetainableGuestOverride(override))
            .map(override => override.id);
          if (unsafeOverrideIds.length > 0) {
            await RoleScopeOverride.destroy({ id: unsafeOverrideIds }).usingConnection(connection);
            await bootstrapAudit(
              'role.scopes-updated',
              'role',
              role.id,
              { removedUnsafeOverrideCount: unsafeOverrideIds.length },
              connection,
              brand.id
            );
          }
        });
      }
      return { created, repaired };
    }

    private async ensureSystemRole(
      issues: AuthorizationMigrationIssue[]
    ): Promise<{ role?: RoleAttributes; created: boolean }> {
      const definition = templateDefinition('system-admin');
      const template = await templateRecord('system-admin');
      const candidates = (await Role.find({
        or: [{ identityKey: 'system:system-admin' }, { contextType: 'system' }, { protectedKind: 'system-admin' }],
      })) as RoleAttributes[];
      if (candidates.length > 1) {
        issues.push({ code: 'system-admin-role-ambiguous', severity: 'blocker', entityType: 'protected-state' });
        return { created: false };
      }
      return runWithRequiredTransaction(Role.getDatastore(), async connection => {
        let role = candidates[0];
        if (role === undefined) {
          role = await Role.create({
            name: 'system-admin',
            key: 'system-admin',
            identityKey: 'system:system-admin',
            displayName: definition.displayName,
            description: definition.description,
            contextType: 'system',
            template: template.id,
            templateRevision: definition.revision,
            protectedKind: 'system-admin',
            status: 'active',
            version: 1,
            createdBy: BOOTSTRAP_ACTOR,
            updatedBy: BOOTSTRAP_ACTOR,
          })
            .fetch()
            .usingConnection(connection);
          await bootstrapAudit('role.created', 'role', role.id, { protectedKind: 'system-admin' }, connection);
          return { role, created: true };
        }
        if (role.name !== 'system-admin' || (role.key && role.key !== 'system-admin')) {
          issues.push({
            code: 'system-admin-role-key-drift',
            severity: 'blocker',
            entityType: 'role',
            entityId: role.id,
          });
          return { created: false };
        }
        const changed =
          role.identityKey !== 'system:system-admin' ||
          role.contextType !== 'system' ||
          role.protectedKind !== 'system-admin' ||
          role.status !== 'active' ||
          associationIdentity(role.template) !== template.id ||
          role.templateRevision !== definition.revision;
        if (changed) {
          const updated = await Role.updateOne({ id: role.id })
            .set({
              key: 'system-admin',
              identityKey: 'system:system-admin',
              displayName: role.displayName?.trim() ? role.displayName : definition.displayName,
              contextType: 'system',
              template: template.id,
              templateRevision: definition.revision,
              protectedKind: 'system-admin',
              status: 'active',
              version: Number.isInteger(role.version) && Number(role.version) >= 1 ? role.version : 1,
              updatedBy: BOOTSTRAP_ACTOR,
            })
            .meta({ skipAllLifecycleCallbacks: true })
            .usingConnection(connection);
          if (updated == null) throw new Error(`System administrator role '${role.id}' changed concurrently.`);
          role = updated;
          await bootstrapAudit('role.updated', 'role', role.id, { protectedKind: 'system-admin' }, connection);
        }
        return { role, created: false };
      });
    }

    private async ensureSystemAssignment(
      role: RoleAttributes,
      principal: UserAttributes,
      issues: AuthorizationMigrationIssue[]
    ): Promise<{ created: boolean; repaired: boolean }> {
      return runWithRequiredTransaction(RoleAssignment.getDatastore(), async connection => {
        const existing = await RoleAssignment.findOne({
          principalType: 'user',
          principalId: String(principal.id),
          role: role.id,
          source: 'recovery',
          sourceKey: BOOTSTRAP_SOURCE_KEY,
        }).usingConnection(connection);
        if (existing == null) {
          const created = (await sails.services.authorizationpersistenceservice.createRoleAssignment(
            {
              principalType: 'user',
              principalId: String(principal.id),
              role: role.id,
              source: 'recovery',
              sourceKey: BOOTSTRAP_SOURCE_KEY,
              status: 'active',
              sourcePresent: true,
              assignedBy: BOOTSTRAP_ACTOR,
              assignedAt: new Date(),
              reason: 'Protected assignment for the canonical bootstrap parent administrator.',
              version: 1,
            },
            connection
          )) as RoleAssignmentAttributes;
          await bootstrapAudit(
            'assignment.created',
            'role-assignment',
            created.id,
            { source: 'recovery', sourceKey: BOOTSTRAP_SOURCE_KEY },
            connection
          );
          return { created: true, repaired: false };
        }
        const issueCode = protectedSystemAssignmentBootstrapIssue(existing, new Date());
        if (issueCode !== undefined) {
          issues.push({
            code: issueCode,
            severity: 'blocker',
            entityType: 'assignment',
            entityId: existing.id,
          });
        }
        return { created: false, repaired: false };
      });
    }

    public async bootstrap(
      input: AuthorizationProtectedBootstrapInput = {}
    ): Promise<AuthorizationProtectedBootstrapResult> {
      const issues: AuthorizationMigrationIssue[] = [];
      await sails.services.authorizationscopeservice.bootstrap();
      await sails.services.authorizationmigrationservice.reconcileBrandRoles();
      const guest = await this.ensureGuestRoles(issues);
      const system = await this.ensureSystemRole(issues);
      const principal = await resolveCanonicalBootstrapUser(userId(input.bootstrapUser), issues);
      let assignment = { created: false, repaired: false };
      if (principal !== undefined && system.role !== undefined) {
        await sails.services.authorizationmigrationservice.migrateUserAssignments(100, [String(principal.id)]);
        assignment = await this.ensureSystemAssignment(system.role, principal, issues);
      }
      const drift = (await sails.services.authorizationmigrationservice.reportDrift()) as AuthorizationDriftReport;
      const result: AuthorizationProtectedBootstrapResult = Object.freeze({
        guestRolesCreated: guest.created,
        guestRolesRepaired: guest.repaired,
        systemRoleCreated: system.created,
        systemAssignmentCreated: assignment.created,
        systemAssignmentRepaired: assignment.repaired,
        issues: Object.freeze([...issues]),
        drift,
      });
      await runWithRequiredTransaction(AuthorizationAudit.getDatastore(), async connection => {
        await sails.services.authorizationauditservice.createSucceededEvent(
          {
            eventType: 'authorization.bootstrap.invariants-checked',
            actorType: 'system-process',
            actorId: BOOTSTRAP_ACTOR,
            authMethod: 'internal',
            targetType: 'authorization-readiness',
            targetId: 'protected-authorization-state',
            after: {
              guestRolesCreated: result.guestRolesCreated,
              guestRolesRepaired: result.guestRolesRepaired,
              systemRoleCreated: result.systemRoleCreated,
              systemAssignmentCreated: result.systemAssignmentCreated,
              systemAssignmentRepaired: result.systemAssignmentRepaired,
              blockerCount: result.issues.filter(issue => issue.severity === 'blocker').length + drift.summary.blocker,
              warningCount: result.issues.filter(issue => issue.severity === 'warning').length + drift.summary.warning,
            },
            reasonCode: 'authorization-protected-bootstrap',
          },
          connection
        );
      });
      sails.config.authorizationReadiness = result;
      sails.log.info(`${this.logHeader} Protected authorization readiness`, {
        blockerCount: result.issues.filter(issue => issue.severity === 'blocker').length + drift.summary.blocker,
        warningCount: result.issues.filter(issue => issue.severity === 'warning').length + drift.summary.warning,
      });
      return result;
    }
  }
}

declare global {
  let AuthorizationBootstrapService: Services.AuthorizationBootstrapService;
}
