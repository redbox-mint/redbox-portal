import { Services as services } from '../CoreService';
import {
  DEFAULT_ROLE_TEMPLATES,
  buildRoleIdentityKey,
  isRoleKey,
  validateRolePersistenceContext,
  type DefaultRoleTemplateDefinition,
  type ProtectedRoleKind,
} from '../authorization';
import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleAssignmentAttributes, RoleAssignmentCreateRecord } from '../waterline-models/RoleAssignment';
import type { RoleTemplateAttributes } from '../waterline-models/RoleTemplate';
import type { UserAttributes } from '../waterline-models/User';
import { runWithRequiredTransaction } from '../utilities/RequiredTransactionUtils';

export const AUTHORIZATION_MIGRATION_NAME = '20260828T120000-authorization-model-v1';
export const AUTHORIZATION_MIGRATION_DEFAULT_BATCH_SIZE = 100;
export const AUTHORIZATION_MIGRATION_MAX_BATCH_SIZE = 500;
const MIGRATION_ACTOR = 'migration:authorization-model-v1';

export type AuthorizationMigrationIssueSeverity = 'blocker' | 'warning' | 'expected';

export interface AuthorizationMigrationIssue {
  readonly code: string;
  readonly severity: AuthorizationMigrationIssueSeverity;
  readonly entityType: 'role' | 'user' | 'assignment' | 'protected-state';
  readonly entityId?: string;
}

export interface AuthorizationMigrationSummary {
  readonly rolesScanned: number;
  readonly rolesMigrated: number;
  readonly usersScanned: number;
  readonly assignmentsCreated: number;
  readonly guestAssociationsSkipped: number;
  readonly issues: readonly AuthorizationMigrationIssue[];
}

export interface AuthorizationDriftReport {
  readonly generatedAt: string;
  readonly issues: readonly AuthorizationMigrationIssue[];
  readonly truncated: boolean;
  readonly summary: Readonly<Record<AuthorizationMigrationIssueSeverity, number>>;
}

interface MutableMigrationSummary {
  rolesScanned: number;
  rolesMigrated: number;
  usersScanned: number;
  assignmentsCreated: number;
  guestAssociationsSkipped: number;
  issues: AuthorizationMigrationIssue[];
}

function associationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = value.id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return undefined;
}

function isRoleAttributes(value: unknown): value is RoleAttributes {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value;
}

function boundedBatchSize(value: number | undefined): number {
  if (value === undefined) return AUTHORIZATION_MIGRATION_DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > AUTHORIZATION_MIGRATION_MAX_BATCH_SIZE) {
    throw new Error(
      `Authorization migration batch size must be between 1 and ${AUTHORIZATION_MIGRATION_MAX_BATCH_SIZE}.`
    );
  }
  return value;
}

function addIssue(
  summary: MutableMigrationSummary,
  issue: AuthorizationMigrationIssue,
  maximum = AUTHORIZATION_MIGRATION_MAX_BATCH_SIZE
): void {
  if (summary.issues.length < maximum) summary.issues.push(Object.freeze(issue));
}

function templateForLegacyRole(name: string): DefaultRoleTemplateDefinition | undefined {
  return DEFAULT_ROLE_TEMPLATES.find(template => template.legacyRoleName === name);
}

function expectedProtectedKind(template: DefaultRoleTemplateDefinition | undefined): ProtectedRoleKind {
  return template?.protectedKind ?? 'none';
}

async function migrationAudit(
  eventType: 'role.updated' | 'assignment.created' | 'authorization.migration.batch-applied',
  targetType: 'role' | 'role-assignment' | 'authorization-migration',
  targetId: string,
  after: unknown,
  connection: Sails.Connection,
  brandId?: string
): Promise<void> {
  await sails.services.authorizationauditservice.createSucceededEvent(
    {
      eventType,
      actorType: 'system-process',
      actorId: MIGRATION_ACTOR,
      authMethod: 'internal',
      targetType,
      targetId,
      brandId,
      after,
      reasonCode: AUTHORIZATION_MIGRATION_NAME,
    },
    connection
  );
}

async function loadTemplates(connection?: Sails.Connection): Promise<Map<string, RoleTemplateAttributes>> {
  let query = RoleTemplate.find({});
  if (connection !== undefined) query = query.usingConnection(connection);
  const templates = (await query) as RoleTemplateAttributes[];
  return new Map(templates.map(template => [template.key, template]));
}

function roleProjection(
  role: RoleAttributes,
  brandId: string,
  template: RoleTemplateAttributes | undefined,
  definition: DefaultRoleTemplateDefinition | undefined
): Record<string, unknown> {
  const key = role.name;
  const protectedKind = expectedProtectedKind(definition);
  const projection: Record<string, unknown> = {
    key,
    identityKey: buildRoleIdentityKey('brand', key, brandId),
    displayName: role.displayName?.trim() ? role.displayName : role.name,
    contextType: 'brand',
    protectedKind,
    status: role.status === 'inactive' ? 'inactive' : 'active',
    version: Number.isInteger(role.version) && Number(role.version) >= 1 ? role.version : 1,
    createdBy: role.createdBy?.trim() ? role.createdBy : MIGRATION_ACTOR,
    updatedBy: MIGRATION_ACTOR,
  };
  if (template !== undefined && definition !== undefined) {
    projection.template = template.id;
    projection.templateRevision = definition.revision;
  }
  validateRolePersistenceContext({
    name: role.name,
    key,
    contextType: 'brand',
    branding: brandId,
    protectedKind,
    identityKey: String(projection.identityKey),
  });
  return projection;
}

function projectionDiffers(role: RoleAttributes, projection: Record<string, unknown>): boolean {
  return Object.entries(projection).some(([field, value]) => {
    const current = role[field as keyof RoleAttributes];
    if (field === 'template') return associationId(current) !== associationId(value);
    return current !== value;
  });
}

const LINKED_ACCOUNT_MAX_DEPTH = 16;

type LinkChainFailure =
  | 'linked-account-cycle'
  | 'linked-alias-missing-primary'
  | 'canonical-user-disabled'
  | 'linked-alias-primary-not-found'
  | 'linked-account-depth-exceeded';

type LinkChainResolution =
  | { readonly user: UserAttributes }
  | { readonly failure: LinkChainFailure; readonly entityId: string };

/**
 * Walks a linked-account alias chain to its active primary user. Migration and drift
 * reporting share this walker so a chain longer than one link cannot be canonicalized
 * one way when writing assignments and another way when auditing them.
 */
async function resolveLinkChain(user: UserAttributes, connection?: Sails.Connection): Promise<LinkChainResolution> {
  let current = user;
  const visited = new Set<string>();
  for (let depth = 0; depth < LINKED_ACCOUNT_MAX_DEPTH; depth += 1) {
    const currentId = String(current.id);
    if (visited.has(currentId)) {
      return { failure: 'linked-account-cycle', entityId: currentId };
    }
    visited.add(currentId);
    const primaryId = current.linkedPrimaryUserId?.trim();
    if (!primaryId) {
      if (current.accountLinkState === 'linked-alias') {
        return { failure: 'linked-alias-missing-primary', entityId: currentId };
      }
      if (current.loginDisabled === true) {
        return { failure: 'canonical-user-disabled', entityId: currentId };
      }
      return { user: current };
    }
    let query = User.findOne({ id: primaryId });
    if (connection !== undefined) query = query.usingConnection(connection);
    const primary = await query;
    if (primary == null) {
      return { failure: 'linked-alias-primary-not-found', entityId: currentId };
    }
    current = primary;
  }
  return { failure: 'linked-account-depth-exceeded', entityId: String(user.id) };
}

async function canonicalUser(
  user: UserAttributes,
  connection: Sails.Connection,
  summary: MutableMigrationSummary
): Promise<UserAttributes | undefined> {
  const resolution = await resolveLinkChain(user, connection);
  if ('user' in resolution) {
    return resolution.user;
  }
  addIssue(summary, {
    code: resolution.failure,
    severity: 'blocker',
    entityType: 'user',
    entityId: resolution.entityId,
  });
  return undefined;
}

async function canonicalUserFromLinkChain(user: UserAttributes): Promise<UserAttributes | undefined> {
  const resolution = await resolveLinkChain(user);
  return 'user' in resolution ? resolution.user : undefined;
}

function assignmentInput(userId: string, originalUserId: string, role: RoleAttributes): RoleAssignmentCreateRecord {
  const brandId = associationId(role.branding);
  return {
    principalType: 'user',
    principalId: userId,
    role: role.id,
    ...(brandId ? { branding: brandId } : {}),
    source: 'migration',
    sourceKey: `legacy-role:${originalUserId}:${role.id}`,
    status: 'active',
    sourcePresent: true,
    assignedBy: MIGRATION_ACTOR,
    assignedAt: new Date(),
    reason: 'Projected from the retained legacy user-role association.',
    version: 1,
  };
}

export namespace Services {
  export class AuthorizationMigrationService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'migrateUserAssignments',
      'reconcileBrandRoles',
      'reportDrift',
      'run',
    ];

    public async reconcileBrandRoles(batchSizeInput?: number): Promise<AuthorizationMigrationSummary> {
      const batchSize = boundedBatchSize(batchSizeInput);
      const summary: MutableMigrationSummary = {
        rolesScanned: 0,
        rolesMigrated: 0,
        usersScanned: 0,
        assignmentsCreated: 0,
        guestAssociationsSkipped: 0,
        issues: [],
      };
      const templates = await loadTemplates();
      let offset = 0;
      for (;;) {
        const batch = (await Role.find({}).sort('id ASC').limit(batchSize).skip(offset)) as RoleAttributes[];
        if (batch.length === 0) break;
        await runWithRequiredTransaction(Role.getDatastore(), async connection => {
          for (const snapshot of batch) {
            summary.rolesScanned += 1;
            const role = await Role.findOne({ id: snapshot.id }).usingConnection(connection);
            if (role == null) continue;
            const brandId = associationId(role.branding);
            if (!brandId) {
              addIssue(summary, {
                code: 'role-brand-missing',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              continue;
            }
            if (!isRoleKey(role.name)) {
              addIssue(summary, {
                code: 'role-key-invalid',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              continue;
            }
            const duplicateCount = await Role.count({ branding: brandId, name: role.name }).usingConnection(connection);
            if (duplicateCount !== 1) {
              addIssue(summary, {
                code: 'duplicate-brand-role-key',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              continue;
            }
            if (role.key && role.key !== role.name) {
              addIssue(summary, {
                code: 'role-key-name-drift',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              continue;
            }
            const definition = templateForLegacyRole(role.name);
            const template = definition ? templates.get(String(definition.key)) : undefined;
            if (definition !== undefined && template === undefined) {
              addIssue(summary, {
                code: 'default-template-missing',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              continue;
            }
            const projection = roleProjection(role, brandId, template, definition);
            if (!projectionDiffers(role, projection)) continue;
            const updated = await Role.updateOne({ id: role.id })
              .set(projection)
              .meta({ skipAllLifecycleCallbacks: true })
              .usingConnection(connection);
            if (updated == null) throw new Error(`Role '${role.id}' changed concurrently during migration.`);
            await migrationAudit(
              'role.updated',
              'role',
              role.id,
              { key: role.name, contextType: 'brand', protectedKind: projection.protectedKind },
              connection,
              brandId
            );
            summary.rolesMigrated += 1;
          }
          await migrationAudit(
            'authorization.migration.batch-applied',
            'authorization-migration',
            AUTHORIZATION_MIGRATION_NAME,
            { phase: 'roles', batchSize: batch.length },
            connection
          );
        });
        offset += batch.length;
      }
      return Object.freeze({ ...summary, issues: Object.freeze([...summary.issues]) });
    }

    public async migrateUserAssignments(
      batchSizeInput?: number,
      onlyUserIds?: readonly string[]
    ): Promise<AuthorizationMigrationSummary> {
      const batchSize = boundedBatchSize(batchSizeInput);
      const summary: MutableMigrationSummary = {
        rolesScanned: 0,
        rolesMigrated: 0,
        usersScanned: 0,
        assignmentsCreated: 0,
        guestAssociationsSkipped: 0,
        issues: [],
      };
      let offset = 0;
      for (;;) {
        const criteria = onlyUserIds === undefined ? {} : { id: [...onlyUserIds] };
        const batch = (await User.find(criteria)
          .populate('roles')
          .sort('id ASC')
          .limit(batchSize)
          .skip(offset)) as UserAttributes[];
        if (batch.length === 0) break;
        await runWithRequiredTransaction(User.getDatastore(), async connection => {
          for (const user of batch) {
            summary.usersScanned += 1;
            const canonical = await canonicalUser(user, connection, summary);
            if (canonical === undefined) continue;
            for (const roleValue of user.roles ?? []) {
              if (!isRoleAttributes(roleValue)) {
                addIssue(summary, {
                  code: 'user-role-reference-missing',
                  severity: 'blocker',
                  entityType: 'user',
                  entityId: user.id,
                });
                continue;
              }
              const role = roleValue;
              if (role.protectedKind === 'guest' || role.name === 'Guest') {
                summary.guestAssociationsSkipped += 1;
                continue;
              }
              if (role.contextType !== 'brand' || !associationId(role.branding)) {
                addIssue(summary, {
                  code: 'user-role-not-migrated',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: role.id,
                });
                continue;
              }
              const input = assignmentInput(String(canonical.id), String(user.id), role);
              const existing = await RoleAssignment.findOne({
                principalType: input.principalType,
                principalId: input.principalId,
                role: input.role,
                source: input.source,
                sourceKey: input.sourceKey,
              }).usingConnection(connection);
              if (existing != null) continue;
              const created = (await sails.services.authorizationpersistenceservice.createRoleAssignment(
                input,
                connection
              )) as RoleAssignmentAttributes;
              await migrationAudit(
                'assignment.created',
                'role-assignment',
                created.id,
                { principalId: input.principalId, roleId: role.id, source: 'migration' },
                connection,
                associationId(role.branding)
              );
              summary.assignmentsCreated += 1;
            }
          }
          await migrationAudit(
            'authorization.migration.batch-applied',
            'authorization-migration',
            AUTHORIZATION_MIGRATION_NAME,
            { phase: 'assignments', batchSize: batch.length },
            connection
          );
        });
        offset += batch.length;
      }
      return Object.freeze({ ...summary, issues: Object.freeze([...summary.issues]) });
    }

    public async run(batchSizeInput?: number): Promise<AuthorizationMigrationSummary> {
      await sails.services.authorizationscopeservice.bootstrap();
      const roles = await this.reconcileBrandRoles(batchSizeInput);
      const assignments = await this.migrateUserAssignments(batchSizeInput);
      const result = Object.freeze({
        rolesScanned: roles.rolesScanned,
        rolesMigrated: roles.rolesMigrated,
        usersScanned: assignments.usersScanned,
        assignmentsCreated: assignments.assignmentsCreated,
        guestAssociationsSkipped: assignments.guestAssociationsSkipped,
        issues: Object.freeze([...roles.issues, ...assignments.issues]),
      });
      const counts = result.issues.reduce<Record<string, number>>((summary, issue) => {
        summary[issue.code] = (summary[issue.code] ?? 0) + 1;
        return summary;
      }, {});
      sails.log.info(`${this.logHeader} Authorization migration summary`, {
        rolesScanned: result.rolesScanned,
        rolesMigrated: result.rolesMigrated,
        usersScanned: result.usersScanned,
        assignmentsCreated: result.assignmentsCreated,
        guestAssociationsSkipped: result.guestAssociationsSkipped,
        issueCounts: counts,
      });
      return result;
    }

    public async reportDrift(limitInput = 100): Promise<AuthorizationDriftReport> {
      const limit = boundedBatchSize(limitInput);
      const issues: AuthorizationMigrationIssue[] = [];
      let truncated = false;
      const append = (issue: AuthorizationMigrationIssue) => {
        if (issues.length < limit) issues.push(Object.freeze(issue));
        else truncated = true;
      };
      const brands = (await BrandingConfig.find({}).limit(limit + 1)) as Array<{ id: string }>;
      for (const brand of brands.slice(0, limit)) {
        const guests = await Role.count({ branding: brand.id, protectedKind: 'guest', status: 'active' });
        if (guests !== 1) {
          append({
            code: 'protected-guest-count-invalid',
            severity: 'blocker',
            entityType: 'protected-state',
            entityId: brand.id,
          });
        }
        const admins = (await Role.find({
          branding: brand.id,
          protectedKind: 'brand-admin',
          status: 'active',
        })) as RoleAttributes[];
        if (admins.length === 0) {
          append({
            code: 'brand-admin-role-missing',
            severity: 'blocker',
            entityType: 'protected-state',
            entityId: brand.id,
          });
          continue;
        }
        const activeAssignments = await RoleAssignment.count({
          role: admins.map(role => role.id),
          status: 'active',
          or: [{ expiresAt: null }, { expiresAt: { '>': new Date() } }],
        });
        if (activeAssignments === 0) {
          append({
            code: 'brand-admin-assignment-missing',
            severity: 'blocker',
            entityType: 'protected-state',
            entityId: brand.id,
          });
        }
      }
      const systemRoles = (await Role.find({
        contextType: 'system',
        protectedKind: 'system-admin',
        status: 'active',
      })) as RoleAttributes[] | undefined;
      if ((systemRoles ?? []).length !== 1) {
        append({ code: 'system-admin-role-count-invalid', severity: 'blocker', entityType: 'protected-state' });
      } else {
        const count = await RoleAssignment.count({
          role: systemRoles?.[0].id,
          status: 'active',
          or: [{ expiresAt: null }, { expiresAt: { '>': new Date() } }],
        });
        if (count === 0)
          append({ code: 'system-admin-assignment-missing', severity: 'blocker', entityType: 'protected-state' });
        if (count === 1)
          append({ code: 'system-admin-enforce-quorum-low', severity: 'warning', entityType: 'protected-state' });
      }

      const users = (await User.find({})
        .populate('roles')
        .limit(limit + 1)) as UserAttributes[];
      if (users.length > limit) truncated = true;
      for (const user of users.slice(0, limit)) {
        // Drift must canonicalize exactly the way the migration did. A single hop would
        // report a false projection gap for any alias chain longer than one link.
        const canonical = await canonicalUserFromLinkChain(user);
        if (canonical === undefined) {
          append({ code: 'linked-account-unresolvable', severity: 'blocker', entityType: 'user' });
          continue;
        }
        const principalId = String(canonical.id);
        for (const roleValue of user.roles ?? []) {
          if (!isRoleAttributes(roleValue)) {
            append({ code: 'user-role-reference-missing', severity: 'blocker', entityType: 'user' });
            continue;
          }
          if (roleValue.protectedKind === 'guest' || roleValue.name === 'Guest') continue;
          const sourceKey = `legacy-role:${String(user.id)}:${roleValue.id}`;
          const assignment = await RoleAssignment.findOne({
            principalType: 'user',
            principalId,
            role: roleValue.id,
            source: 'migration',
            sourceKey,
            status: 'active',
          });
          if (assignment == null) {
            append({ code: 'legacy-assignment-projection-missing', severity: 'blocker', entityType: 'assignment' });
          }
        }
      }

      const assignments = (await RoleAssignment.find({})
        .populate('role')
        .limit(limit + 1)) as RoleAssignmentAttributes[];
      if (assignments.length > limit) truncated = true;
      for (const assignment of assignments.slice(0, limit)) {
        if (!isRoleAttributes(assignment.role)) {
          append({ code: 'assignment-role-missing', severity: 'blocker', entityType: 'assignment' });
          continue;
        }
        const assignmentBrand = associationId(assignment.branding);
        const roleBrand = associationId(assignment.role.branding);
        if (assignment.role.contextType === 'brand' && assignmentBrand !== roleBrand) {
          append({ code: 'assignment-role-brand-mismatch', severity: 'blocker', entityType: 'assignment' });
        }
      }

      const recordModel = sails.models.record;
      if (recordModel !== undefined) {
        const records = (await recordModel.find({}).limit(limit + 1)) as Array<Record<string, unknown>>;
        if (records.length > limit) truncated = true;
        for (const record of records.slice(0, limit)) {
          const metadata =
            typeof record.metaMetadata === 'object' && record.metaMetadata !== null
              ? (record.metaMetadata as Record<string, unknown>)
              : {};
          const authorization =
            typeof record.authorization === 'object' && record.authorization !== null
              ? (record.authorization as Record<string, unknown>)
              : {};
          const brandId = typeof metadata.brandId === 'string' ? metadata.brandId : undefined;
          const roleKeys = [authorization.viewRoles, authorization.editRoles]
            .flatMap(value => (Array.isArray(value) ? value : []))
            .filter((value): value is string => typeof value === 'string');
          for (const roleKey of new Set(roleKeys)) {
            if (!brandId) {
              append({ code: 'record-acl-brand-missing', severity: 'warning', entityType: 'protected-state' });
              break;
            }
            const role = await Role.findOne({ branding: brandId, key: roleKey, status: 'active' });
            if (role == null) {
              append({ code: 'record-acl-role-unmatched', severity: 'warning', entityType: 'role' });
            }
          }
        }
      }

      // Route-to-scope mapping arrives with the rollout engine, so every retained path
      // rule is currently unmapped. Reporting one issue per rule would crowd genuine
      // anomalies out of the bounded report, so this is summarised as a single count.
      const unmappedPathRuleCount = await PathRule.count({});
      if (unmappedPathRuleCount > 0) {
        append({
          code: 'legacy-path-rule-unmapped',
          severity: 'warning',
          entityType: 'protected-state',
          entityId: `count:${unmappedPathRuleCount}`,
        });
      }
      const summary = Object.freeze({
        blocker: issues.filter(issue => issue.severity === 'blocker').length,
        warning: issues.filter(issue => issue.severity === 'warning').length,
        expected: issues.filter(issue => issue.severity === 'expected').length,
      });
      return Object.freeze({
        generatedAt: new Date().toISOString(),
        issues: Object.freeze(issues),
        truncated,
        summary,
      });
    }
  }
}

declare global {
  let AuthorizationMigrationService: Services.AuthorizationMigrationService;
}
