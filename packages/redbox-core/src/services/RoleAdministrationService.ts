import { randomUUID } from 'node:crypto';
import { Services as services } from '../CoreService';
import {
  AUTHORIZATION_ADMIN_CONFIRMATION_TTL_MS,
  AUTHORIZATION_ADMIN_DEFAULT_PAGE_SIZE,
  AUTHORIZATION_ADMIN_MAX_BULK_ROWS,
  AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS,
  AUTHORIZATION_ADMIN_MAX_PAGE_SIZE,
  AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS,
  AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_VALUES,
  BRAND_ADMIN_SCOPE_FLOOR,
  GUEST_SCOPE_ALLOWLIST,
  GUEST_SCOPE_FLOOR,
  SYSTEM_ADMIN_SCOPE_FLOOR,
  AuthorizationAdministrationError,
  authorizationContentHash,
  createAuthorizationConfirmationToken,
  getRoleEffectiveScopes,
  isAuthorizationAdministrationError,
  normalizeRoleScopeOverrides,
  normalizedNewRoleKey,
  normalizedScopeKeys,
  optionalAuthorizationText,
  parseBulkAssignmentRows,
  previewRoleTemplateUpgrade,
  requiredAuthorizationText,
  verifyAuthorizationConfirmationToken,
  type ApplyBulkAssignmentsCommand,
  type ApplyBulkTemplateUpgradeCommand,
  type ApplyAuthorizationConfigurationImportCommand,
  type ApplyRoleLifecycleCommand,
  type ApplyRoleScopesCommand,
  type ApplyRoleTemplateUpgradeCommand,
  type ApplyScopeAdoptionCommand,
  type AssignmentAdministrationSnapshot,
  type AssignmentByIdCommand,
  type AssignmentCatalogPage,
  type AssignmentCatalogQuery,
  type AuthorizationAdministrationCommand,
  type AuthorizationAuditEventType,
  type AuthorizationConfirmationClaims,
  type AuthorizationConfirmationOperation,
  type AuthorizationContext,
  type AuthorizationConfigurationImportPreview,
  type AuthorizationConfigurationImportResult,
  type AuthorizationMutationResult,
  type AuthorizationPreviewResult,
  type BulkAssignmentPreview,
  type BulkAssignmentRow,
  type BulkAssignmentRowPreview,
  type BulkMutationResult,
  type BulkTemplateUpgradePreview,
  type BulkTemplateUpgradeRoleConflict,
  type BulkTemplateUpgradeRolePreview,
  type CreateRoleCommand,
  type ExpireAssignmentCommand,
  type ExternalReplacementResult,
  type GrantAssignmentCommand,
  type PreviewBulkAssignmentsCommand,
  type PreviewBulkTemplateUpgradeCommand,
  type PreviewAuthorizationConfigurationImportCommand,
  type PreviewRoleLifecycleCommand,
  type PreviewRoleScopesCommand,
  type PreviewRoleTemplateUpgradeCommand,
  type PreviewScopeAdoptionCommand,
  type PreviewTemplateRevisionCommand,
  type PublishTemplateRevisionCommand,
  type ReplaceExternalAssignmentsCommand,
  type RevokeAssignmentCommand,
  type RoleAdministrationSnapshot,
  type RoleAssignmentSource,
  type RoleCatalogItem,
  type RoleCatalogPage,
  type RoleCatalogQuery,
  type RoleDependencySummary,
  type RoleScopeOverride,
  type ScopeKey,
  type ScopeRegistry,
  type UpdateRoleCommand,
} from '../authorization';
import type { AuthorizationAuditEventInput } from './AuthorizationAuditService';
import * as AuthorizationConfigurationServiceModule from './AuthorizationConfigurationService';
import type { AuthorizationAuditAttributes } from '../waterline-models/AuthorizationAudit';
import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleAssignmentAttributes } from '../waterline-models/RoleAssignment';
import type { RoleTemplateAttributes } from '../waterline-models/RoleTemplate';
import type { RoleTemplateRevisionAttributes } from '../waterline-models/RoleTemplateRevision';
import type { RoleScopeOverrideAttributes } from '../waterline-models/RoleScopeOverride';
import type { UserAttributes } from '../waterline-models/User';
import { runWithRequiredTransaction } from '../utilities/RequiredTransactionUtils';

const ROLE_MANAGE_SCOPE = 'authorization.role.manage' as ScopeKey;
const ROLE_READ_SCOPE = 'authorization.role.read' as ScopeKey;
const ASSIGNMENT_MANAGE_SCOPE = 'authorization.assignment.manage' as ScopeKey;
const ASSIGNMENT_READ_SCOPE = 'authorization.assignment.read' as ScopeKey;
const SYSTEM_MANAGE_SCOPE = 'system.authorization.manage' as ScopeKey;
const MANUAL_SOURCE_KEY = 'manual';
const MAX_LINK_DEPTH = 16;

interface AuditWriter {
  createSucceededEvent(
    input: AuthorizationAuditEventInput,
    connection: Sails.Connection
  ): Promise<AuthorizationAuditAttributes>;
  recordAttempt(
    input: AuthorizationAuditEventInput,
    outcome: 'denied' | 'failed'
  ): Promise<{ readonly persisted: boolean }>;
}

interface ConfigurationImportWriter {
  previewImport(
    command: PreviewAuthorizationConfigurationImportCommand
  ): Promise<AuthorizationConfigurationImportPreview>;
  applyImport(command: ApplyAuthorizationConfigurationImportCommand): Promise<AuthorizationConfigurationImportResult>;
}

export interface RoleAdministrationServiceDependencies {
  readonly now: () => Date;
  readonly randomId: () => string;
  readonly getRegistry: () => ScopeRegistry;
  readonly getConfirmationSecret: () => string;
  readonly audit: () => AuditWriter;
  readonly configurationImport: () => ConfigurationImportWriter;
  readonly runTransaction: <T>(work: (connection: Sails.Connection) => Promise<T>) => Promise<T>;
}

interface LoadedRoleState {
  readonly role: RoleAttributes;
  readonly template?: RoleTemplateAttributes;
  readonly revision?: RoleTemplateRevisionAttributes;
  readonly baseScopeKeys: readonly ScopeKey[];
  readonly overrides: readonly RoleScopeOverride[];
  readonly effectiveScopeKeys: readonly ScopeKey[];
}

interface AssignmentMutationOutcome {
  readonly assignment: RoleAssignmentAttributes;
  readonly changed: boolean;
  readonly eventType: AuthorizationAuditEventType;
}

interface TemplatePublicationContent {
  readonly scopeKeys: readonly ScopeKey[];
  readonly nextRevision: number;
  readonly displayName?: string;
  readonly description?: string;
  readonly notes?: string;
  readonly reason?: string;
}

interface LoadedBulkTemplateUpgradeRole {
  readonly role: RoleAttributes;
  readonly state: LoadedRoleState;
  readonly preview: BulkTemplateUpgradeRolePreview;
  readonly nextOverrides: readonly RoleScopeOverride[];
}

interface LoadedBulkTemplateUpgradeSelection {
  readonly loaded: readonly LoadedBulkTemplateUpgradeRole[];
  readonly previews: readonly (BulkTemplateUpgradeRolePreview | BulkTemplateUpgradeRoleConflict)[];
}

function associationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { readonly id?: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return undefined;
}

function positiveVersion(value: unknown, field = 'expectedVersion'): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new AuthorizationAdministrationError(
      'authorization.version-conflict',
      409,
      `${field} must be a positive integer.`
    );
  }
  return Number(value);
}

function activeAt(assignment: RoleAssignmentAttributes, now: Date): boolean {
  if (assignment.status !== 'active' || assignment.sourcePresent !== true) return false;
  if (assignment.expiresAt == null) return true;
  const expiry = new Date(assignment.expiresAt);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() > now.getTime();
}

function isProtectedAdministratorRole(role: RoleAttributes): boolean {
  return role.protectedKind === 'brand-admin' || role.protectedKind === 'system-admin';
}

function isCanonicalActiveUser(user: UserAttributes): boolean {
  return user.loginDisabled !== true && user.accountLinkState !== 'linked-alias' && !user.linkedPrimaryUserId?.trim();
}

function normalizedExpiry(value: string | undefined, now: Date): string | undefined {
  if (value === undefined) return undefined;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new AuthorizationAdministrationError(
      'authorization.invalid-role',
      400,
      'Assignment expiry must be a valid future timestamp.'
    );
  }
  return expiry.toISOString();
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizedSelectedRoles(
  roles: PreviewBulkTemplateUpgradeCommand['roles']
): readonly PreviewBulkTemplateUpgradeCommand['roles'][number][] {
  if (roles.length < 1 || roles.length > AUTHORIZATION_ADMIN_MAX_BULK_ROWS) {
    throw new AuthorizationAdministrationError(
      'authorization.bulk-invalid',
      422,
      'Selected role count is outside the bounded limit.'
    );
  }
  const selected = roles
    .map(role => {
      const roleId = requiredAuthorizationText(role.roleId, 'roleId', 256);
      if (!Number.isSafeInteger(role.expectedVersion) || role.expectedVersion < 1) {
        throw new AuthorizationAdministrationError(
          'authorization.bulk-invalid',
          422,
          'A selected role version is invalid.'
        );
      }
      return Object.freeze({ roleId, expectedVersion: role.expectedVersion });
    })
    .sort((left, right) => left.roleId.localeCompare(right.roleId));
  if (new Set(selected.map(role => role.roleId)).size !== selected.length) {
    throw new AuthorizationAdministrationError(
      'authorization.bulk-invalid',
      422,
      'A selected role may appear only once.'
    );
  }
  return Object.freeze(selected);
}

function hasEveryScope(actual: readonly ScopeKey[], required: readonly ScopeKey[]): boolean {
  const actualSet = new Set(actual);
  return required.every(scopeKey => actualSet.has(scopeKey));
}

function roleIdentity(role: RoleAttributes): string {
  return role.key ?? role.name;
}

function boundedRoleCatalogLimit(limit: number | undefined): number {
  if (limit === undefined) return AUTHORIZATION_ADMIN_DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > AUTHORIZATION_ADMIN_MAX_PAGE_SIZE) {
    throw new AuthorizationAdministrationError(
      'authorization.invalid-query',
      400,
      `Role catalog limit must be between 1 and ${AUTHORIZATION_ADMIN_MAX_PAGE_SIZE}.`
    );
  }
  return Number(limit);
}

function boundedRoleQueryText(
  value: string | undefined,
  field: string,
  maxLength: number,
  preserveExactValue = false
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = preserveExactValue ? value : value.trim();
  if (normalized.trim().length < 1 || normalized.length > maxLength) {
    throw new AuthorizationAdministrationError(
      'authorization.invalid-query',
      400,
      `${field} must contain between 1 and ${maxLength} characters.`
    );
  }
  return normalized;
}

/**
 * Waterline resolves a compare-and-set `updateOne` to `undefined` when no row matched
 * the expected version. That is a lost update, not an internal fault, so it must surface
 * as the documented `409` rather than a `TypeError` on the absent row.
 */
function requireUpdatedRow<T>(row: T | null | undefined, message: string): T {
  if (row == null) {
    throw new AuthorizationAdministrationError('authorization.version-conflict', 409, message);
  }
  return row;
}

function requireUnchangedResourceIdentity(expectedId: string, actualId: string): void {
  if (actualId !== expectedId) {
    throw new AuthorizationAdministrationError(
      'authorization.preview-stale',
      409,
      'The authorization target changed since preview.'
    );
  }
}

function requireNewerTemplateRevision(currentRevision: number, targetRevision: number): void {
  if (targetRevision <= currentRevision) {
    throw new AuthorizationAdministrationError(
      'authorization.invalid-role',
      400,
      'A role template upgrade must select a newer revision.'
    );
  }
}

interface BoundedFindQuery extends PromiseLike<unknown[]> {
  limit(value: number): BoundedFindQuery;
  usingConnection(connection: Sails.Connection): Promise<unknown[]>;
}

interface BoundedFindModel {
  find(criteria?: globalThis.Record<string, unknown>): BoundedFindQuery;
}

interface BoundedNativeCursor {
  limit(value: number): BoundedNativeCursor;
  toArray(): Promise<unknown[]>;
}

interface BoundedNativeCollection {
  find(criteria: globalThis.Record<string, unknown>, options: globalThis.Record<string, unknown>): BoundedNativeCursor;
}

interface BoundedNativeManager {
  collection(name: string): BoundedNativeCollection;
}

interface BoundedNativeModel {
  readonly tableName: string;
  getDatastore(): { readonly manager: BoundedNativeManager };
}

interface BoundedAssociationIds {
  readonly ids: readonly string[];
  readonly incomplete: boolean;
}

interface BoundedReferenceCount {
  readonly references: number;
  readonly incomplete: boolean;
}

function errorProperty(
  error: unknown,
  property: 'code' | 'codeName',
  visited: WeakSet<object> = new WeakSet<object>()
): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  if (visited.has(error)) return undefined;
  visited.add(error);
  const record = error as Readonly<Record<string, unknown>>;
  const direct = record[property];
  if (direct !== undefined) return direct;
  for (const nested of [record.raw, record.cause, record.details]) {
    const value = errorProperty(nested, property, visited);
    if (value !== undefined) return value;
  }
  return undefined;
}

function isUniqueConstraintError(error: unknown): boolean {
  return errorProperty(error, 'code') === 'E_UNIQUE' || errorProperty(error, 'code') === 11_000;
}

function isWriteConflictError(error: unknown): boolean {
  return errorProperty(error, 'code') === 112 || errorProperty(error, 'codeName') === 'WriteConflict';
}

function hasExactReference(
  value: unknown,
  target: string,
  remaining: { value: number },
  visited: WeakSet<object>
): boolean {
  if (remaining.value <= 0) return false;
  remaining.value -= 1;
  if (value === target) return true;
  if (typeof value !== 'object' || value === null || value instanceof Date) return false;
  if (visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) return value.some(entry => hasExactReference(entry, target, remaining, visited));
  return Object.values(value).some(entry => hasExactReference(entry, target, remaining, visited));
}

function defaultDependencies(): RoleAdministrationServiceDependencies {
  const configurationImport = new AuthorizationConfigurationServiceModule.Services.AuthorizationConfigurationService();
  return {
    now: () => new Date(),
    randomId: randomUUID,
    getRegistry: () => AuthorizationScopeService.getRegistry(),
    getConfirmationSecret: () => {
      const secret = sails.config.authorization?.confirmationSecret ?? sails.config.redboxSession?.secret;
      if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('Authorization confirmation signing secret is unavailable or too short.');
      }
      return secret;
    },
    audit: () => AuthorizationAuditService,
    configurationImport: () => configurationImport,
    runTransaction: work => runWithRequiredTransaction(Role.getDatastore(), work),
  };
}

export namespace Services {
  export class RoleAdministrationService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'createRole',
      'updateRole',
      'previewRoleScopes',
      'applyRoleScopes',
      'previewTemplateRevision',
      'publishTemplateRevision',
      'previewRoleTemplateUpgrade',
      'applyRoleTemplateUpgrade',
      'previewBulkTemplateUpgrade',
      'applyBulkTemplateUpgrade',
      'previewRoleInactivation',
      'inactivateRole',
      'getRole',
      'listRoles',
      'previewRoleDeletion',
      'deleteRole',
      'listAssignments',
      'grantAssignment',
      'revokeAssignment',
      'suppressAssignment',
      'unsuppressAssignment',
      'expireAssignment',
      'replaceExternalAssignments',
      'previewBulkAssignments',
      'applyBulkAssignments',
      'previewScopeAdoption',
      'applyScopeAdoption',
      'previewConfigurationImport',
      'applyConfigurationImport',
    ];

    private readonly dependencies: RoleAdministrationServiceDependencies;

    public constructor(dependencies: Partial<RoleAdministrationServiceDependencies> = {}) {
      super();
      this.logHeader = 'RoleAdministrationService::';
      this.dependencies = { ...defaultDependencies(), ...dependencies };
    }

    private actorId(command: AuthorizationAdministrationCommand): string {
      const actorId = command.actor.principal.userId ?? command.actor.principal.operationId;
      if (!command.actor.principal.active || actorId === undefined || actorId.trim().length === 0) {
        throw new AuthorizationAdministrationError(
          'authorization.authentication-required',
          401,
          'An active authoritative actor context is required.'
        );
      }
      return actorId;
    }

    /** The administration service remains the only supported mutation facade. */
    public previewConfigurationImport(
      command: PreviewAuthorizationConfigurationImportCommand
    ): Promise<AuthorizationConfigurationImportPreview> {
      return this.dependencies.configurationImport().previewImport(command);
    }

    /** The specialized import planner executes behind the single-writer facade. */
    public applyConfigurationImport(
      command: ApplyAuthorizationConfigurationImportCommand
    ): Promise<AuthorizationConfigurationImportResult> {
      return this.dependencies.configurationImport().applyImport(command);
    }

    private requireScope(command: AuthorizationAdministrationCommand, scopeKey: ScopeKey, brandId?: string): void {
      this.actorId(command);
      if (brandId !== undefined && command.actor.contextType === 'brand' && command.actor.brand?.id !== brandId) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target was not found.');
      }
      if (!command.actor.effectiveScopeKeys.includes(scopeKey)) {
        throw new AuthorizationAdministrationError(
          'authorization.scope-denied',
          403,
          'The actor lacks the required authorization scope.'
        );
      }
    }

    private auditInput(
      command: AuthorizationAdministrationCommand,
      eventType: AuthorizationAuditEventType,
      targetType: AuthorizationAuditEventInput['targetType'],
      targetId?: string,
      extra: Partial<AuthorizationAuditEventInput> = {}
    ): AuthorizationAuditEventInput {
      const actor = command.actor.principal;
      return {
        eventType,
        actorType: actor.authMethod === 'internal' ? 'system-process' : 'user',
        actorId: this.actorId(command),
        authMethod:
          actor.authMethod === 'bearer' ? 'legacy-bearer' : actor.authMethod === 'internal' ? 'internal' : 'session',
        brandId: command.brandId,
        targetType,
        targetId,
        requestId: requiredAuthorizationText(command.requestId, 'requestId', 128),
        batchId: optionalAuthorizationText(command.batchId, 128),
        reason: optionalAuthorizationText(command.reason, 1_000),
        ...extra,
      };
    }

    private async runMutation<T>(
      command: AuthorizationAdministrationCommand,
      audit: AuthorizationAuditEventInput,
      work: (connection: Sails.Connection) => Promise<T>
    ): Promise<T> {
      try {
        return await this.dependencies.runTransaction(work);
      } catch (error) {
        const normalizedError =
          isWriteConflictError(error) || isUniqueConstraintError(error)
            ? new AuthorizationAdministrationError(
                'authorization.version-conflict',
                409,
                'Authorization state changed concurrently.'
              )
            : error;
        await this.dependencies.audit().recordAttempt(
          {
            ...audit,
            ...(isAuthorizationAdministrationError(normalizedError) ? { reasonCode: normalizedError.code } : {}),
          },
          isAuthorizationAdministrationError(normalizedError) ? 'denied' : 'failed'
        );
        throw normalizedError;
      }
    }

    private issueConfirmation(
      command: AuthorizationAdministrationCommand,
      operation: AuthorizationConfirmationOperation,
      target: string,
      expectedVersion: number | undefined,
      content: unknown
    ): string {
      const now = this.dependencies.now().getTime();
      const claims: AuthorizationConfirmationClaims = {
        version: 1,
        operation,
        target,
        actorId: this.actorId(command),
        brandId: command.brandId,
        expectedVersion,
        contentHash: authorizationContentHash(content),
        nonce: this.dependencies.randomId(),
        issuedAt: now,
        expiresAt: now + AUTHORIZATION_ADMIN_CONFIRMATION_TTL_MS,
      };
      return createAuthorizationConfirmationToken(claims, this.dependencies.getConfirmationSecret());
    }

    private verifyConfirmation(
      command: AuthorizationAdministrationCommand,
      token: string,
      operation: AuthorizationConfirmationOperation,
      target: string,
      expectedVersion: number | undefined,
      content: unknown
    ): void {
      const claims = verifyAuthorizationConfirmationToken(
        token,
        this.dependencies.getConfirmationSecret(),
        this.dependencies.now()
      );
      if (
        claims.operation !== operation ||
        claims.target !== target ||
        claims.actorId !== this.actorId(command) ||
        claims.brandId !== command.brandId ||
        claims.expectedVersion !== expectedVersion ||
        claims.contentHash !== authorizationContentHash(content)
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.preview-stale',
          409,
          'The authorization preview no longer matches this operation.'
        );
      }
    }

    private async findRole(
      roleKey: string,
      brandId: string | undefined,
      connection?: Sails.Connection
    ): Promise<RoleAttributes> {
      const criteria: Record<string, unknown> = {
        or: [{ key: roleKey }, { name: roleKey }],
        ...(brandId === undefined ? { contextType: 'system' } : { branding: brandId, contextType: 'brand' }),
      };
      let query = Role.find(criteria).limit(2);
      if (connection !== undefined) query = query.usingConnection(connection);
      const roles = (await query) as RoleAttributes[];
      if (roles.length !== 1) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target role was not found.');
      }
      return roles[0];
    }

    private async findTemplate(key: string, connection?: Sails.Connection): Promise<RoleTemplateAttributes> {
      let query = RoleTemplate.findOne({ key });
      if (connection !== undefined) query = query.usingConnection(connection);
      const template = (await query) as RoleTemplateAttributes | undefined;
      if (template === undefined) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The role template was not found.');
      }
      return template;
    }

    private async findRevision(
      templateId: string,
      revision: number,
      connection?: Sails.Connection
    ): Promise<RoleTemplateRevisionAttributes> {
      let query = RoleTemplateRevision.findOne({ template: templateId, revision });
      if (connection !== undefined) query = query.usingConnection(connection);
      const row = (await query) as RoleTemplateRevisionAttributes | undefined;
      if (row === undefined) {
        throw new AuthorizationAdministrationError(
          'authorization.not-found',
          404,
          'The template revision was not found.'
        );
      }
      return row;
    }

    private templatePublicationContent(
      command: PreviewTemplateRevisionCommand,
      scopeKeys: readonly ScopeKey[],
      nextRevision: number
    ): TemplatePublicationContent {
      return Object.freeze({
        scopeKeys,
        nextRevision,
        displayName: optionalAuthorizationText(command.displayName, 256),
        description: optionalAuthorizationText(command.description, 2_000),
        notes: optionalAuthorizationText(command.notes, 2_000),
        reason: optionalAuthorizationText(command.reason, 1_000),
      });
    }

    private validateTemplateScopeSet(
      template: RoleTemplateAttributes,
      scopeKeys: readonly ScopeKey[],
      actor: AuthorizationContext
    ): void {
      this.validateScopeSet(
        {
          id: template.id,
          name: template.key,
          key: template.key,
          contextType: template.protectedKind === 'system-admin' ? 'system' : 'brand',
          protectedKind: template.protectedKind,
        } as RoleAttributes,
        scopeKeys,
        actor
      );
    }

    private validateScopeSet(
      role: RoleAttributes,
      desiredScopeKeys: readonly ScopeKey[],
      actor: AuthorizationContext,
      delegableScopeKeys: readonly ScopeKey[] = actor.effectiveScopeKeys
    ): void {
      const registry = this.dependencies.getRegistry();
      const validation = registry.validateScopeKeys(desiredScopeKeys);
      if (validation.inactiveScopeKeys.length > 0 || validation.missingScopeKeys.length > 0) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-scope',
          400,
          'Role scopes must all be active deployed registry keys.',
          {
            inactiveScopeKeys: validation.inactiveScopeKeys,
            missingScopeKeys: validation.missingScopeKeys,
          }
        );
      }
      if (role.contextType === 'brand' && desiredScopeKeys.some(scopeKey => scopeKey.startsWith('system.'))) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-scope',
          400,
          'Brand roles cannot contain system scopes.'
        );
      }
      const floor =
        role.protectedKind === 'guest'
          ? GUEST_SCOPE_FLOOR
          : role.protectedKind === 'brand-admin'
            ? BRAND_ADMIN_SCOPE_FLOOR
            : role.protectedKind === 'system-admin'
              ? SYSTEM_ADMIN_SCOPE_FLOOR
              : [];
      if (!hasEveryScope(desiredScopeKeys, floor)) {
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          409,
          'The protected role scope floor cannot be removed.'
        );
      }
      if (
        role.protectedKind === 'guest' &&
        desiredScopeKeys.some(
          scopeKey => !GUEST_SCOPE_ALLOWLIST.has(scopeKey) || registry.get(scopeKey)?.risk !== 'read'
        )
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          409,
          'Guest can contain only reviewed read-risk scopes.'
        );
      }
      if (!hasEveryScope(delegableScopeKeys, desiredScopeKeys)) {
        throw new AuthorizationAdministrationError(
          'authorization.delegation-ceiling',
          403,
          'The resulting role would exceed the actor delegation ceiling.'
        );
      }
    }

    private delegableScopeKeysForBrand(actor: AuthorizationContext, brandId: string): readonly ScopeKey[] {
      if (actor.contextType === 'system') return actor.effectiveScopeKeys;
      const eligibleRoleIds = new Set(
        actor.roles.filter(role => role.contextType === 'system' || role.brandId === brandId).map(role => role.id)
      );
      const eligibleScopeKeys = new Set(
        actor.scopeProvenance
          .filter(provenance => provenance.roleIds.some(roleId => eligibleRoleIds.has(roleId)))
          .map(provenance => provenance.scopeKey)
      );
      return actor.effectiveScopeKeys.filter(scopeKey => eligibleScopeKeys.has(scopeKey));
    }

    private async loadRoleState(role: RoleAttributes, connection?: Sails.Connection): Promise<LoadedRoleState> {
      const templateId = associationId(role.template);
      let template: RoleTemplateAttributes | undefined;
      let revision: RoleTemplateRevisionAttributes | undefined;
      let baseScopeKeys: readonly ScopeKey[] = [];
      if (templateId !== undefined && role.templateRevision !== undefined) {
        let templateQuery = RoleTemplate.findOne({ id: templateId });
        if (connection !== undefined) templateQuery = templateQuery.usingConnection(connection);
        template = (await templateQuery) as RoleTemplateAttributes | undefined;
        revision = await this.findRevision(templateId, role.templateRevision, connection);
        baseScopeKeys = normalizedScopeKeys(revision.scopeKeys);
      }
      let overrideQuery = RoleScopeOverride.find({ role: role.id }).sort('scopeKey ASC');
      if (connection !== undefined) overrideQuery = overrideQuery.usingConnection(connection);
      const rows = (await overrideQuery) as RoleScopeOverrideAttributes[];
      const overrides = rows.map(row => ({ scopeKey: row.scopeKey as ScopeKey, effect: row.effect }));
      const calculated = getRoleEffectiveScopes({
        baseScopeKeys,
        overrides,
        registry: this.dependencies.getRegistry(),
      });
      return {
        role,
        template,
        revision,
        baseScopeKeys,
        overrides,
        effectiveScopeKeys: calculated.effectiveScopeKeys,
      };
    }

    private snapshot(state: LoadedRoleState): RoleAdministrationSnapshot {
      const role = state.role;
      const brandId = associationId(role.branding);
      return Object.freeze({
        id: role.id,
        key: roleIdentity(role) as RoleAdministrationSnapshot['key'],
        displayName: role.displayName?.trim() || role.name,
        ...(role.description === undefined ? {} : { description: role.description }),
        contextType: role.contextType === 'system' ? 'system' : 'brand',
        ...(brandId === undefined ? {} : { brandId }),
        protectedKind: role.protectedKind ?? 'none',
        status: role.status ?? 'active',
        ...(state.template === undefined
          ? {}
          : { templateKey: state.template.key as RoleAdministrationSnapshot['templateKey'] }),
        ...(role.templateRevision === undefined ? {} : { templateRevision: role.templateRevision }),
        baseScopeKeys: Object.freeze([...state.baseScopeKeys]),
        effectiveScopeKeys: Object.freeze([...state.effectiveScopeKeys]),
        overrides: Object.freeze(state.overrides.map(override => Object.freeze({ ...override }))),
        version: positiveVersion(role.version ?? 1, 'role.version'),
      });
    }

    private roleCatalogItem(
      role: RoleAttributes,
      templateById: ReadonlyMap<string, RoleTemplateAttributes>
    ): RoleCatalogItem {
      const brandId = associationId(role.branding);
      if (brandId === undefined || role.contextType !== 'brand') {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target role was not found.');
      }
      const templateId = associationId(role.template);
      const template = templateId === undefined ? undefined : templateById.get(templateId);
      const description = optionalAuthorizationText(role.description, 2_000);
      return Object.freeze({
        id: role.id,
        key: roleIdentity(role) as RoleCatalogItem['key'],
        displayName: requiredAuthorizationText(role.displayName?.trim() || role.name, 'displayName', 256),
        ...(description === undefined ? {} : { description }),
        contextType: 'brand' as const,
        brandId,
        protectedKind: role.protectedKind ?? 'none',
        status: role.status ?? 'active',
        ...(template === undefined ? {} : { templateKey: template.key as RoleCatalogItem['templateKey'] }),
        ...(role.templateRevision === undefined ? {} : { templateRevision: role.templateRevision }),
        version: positiveVersion(role.version ?? 1, 'role.version'),
      });
    }

    public async listRoles(query: RoleCatalogQuery): Promise<RoleCatalogPage> {
      this.requireScope(
        { actor: query.actor, brandId: query.brandId, requestId: 'authorization-role-catalog-read' },
        ROLE_READ_SCOPE,
        query.brandId
      );
      const limit = boundedRoleCatalogLimit(query.limit);
      const cursor = boundedRoleQueryText(query.cursor, 'cursor', 256, true);
      const search = boundedRoleQueryText(query.search, 'search', 128);
      const criteria: Record<string, unknown> = { branding: query.brandId, contextType: 'brand' };
      if (cursor !== undefined) criteria.key = { '>': cursor };
      if (query.protectedKind !== undefined) criteria.protectedKind = query.protectedKind;
      if (query.status !== undefined) criteria.status = query.status;
      if (search !== undefined) {
        criteria.or = [
          { key: { contains: search } },
          { name: { contains: search } },
          { displayName: { contains: search } },
          { description: { contains: search } },
        ];
      }
      if (query.templateKey !== undefined) {
        const templateKey = boundedRoleQueryText(query.templateKey, 'templateKey', 64);
        const template = await RoleTemplate.findOne({ key: templateKey });
        if (template == null) return Object.freeze({ items: Object.freeze([]) });
        criteria.template = template.id;
      }
      const rows = (await Role.find(criteria)
        .sort('key ASC')
        .limit(limit + 1)) as RoleAttributes[] | undefined;
      const page = (rows ?? []).slice(0, limit);
      const templateIds = uniqueStrings(
        page.map(role => associationId(role.template)).filter((value): value is string => value !== undefined)
      );
      const templates = templateIds.length
        ? ((await RoleTemplate.find({ id: templateIds })) as RoleTemplateAttributes[] | undefined)
        : [];
      const templateById = new Map((templates ?? []).map(template => [String(template.id), template]));
      const items = Object.freeze(page.map(role => this.roleCatalogItem(role, templateById)));
      return Object.freeze({
        items,
        ...((rows?.length ?? 0) > limit && items.length > 0 ? { nextCursor: items[items.length - 1].key } : {}),
      });
    }

    public async getRole(
      actor: AuthorizationContext,
      brandId: string,
      roleKey: string
    ): Promise<RoleAdministrationSnapshot> {
      this.requireScope({ actor, brandId, requestId: 'authorization-role-detail-read' }, ROLE_READ_SCOPE, brandId);
      const key = boundedRoleQueryText(roleKey, 'roleKey', 256, true);
      if (key === undefined) {
        throw new AuthorizationAdministrationError('authorization.invalid-query', 400, 'A role key is required.');
      }
      return this.snapshot(await this.loadRoleState(await this.findRole(key, brandId)));
    }

    public async listAssignments(query: AssignmentCatalogQuery): Promise<AssignmentCatalogPage> {
      this.requireScope(
        { actor: query.actor, brandId: query.brandId, requestId: 'authorization-assignment-catalog-read' },
        ASSIGNMENT_READ_SCOPE,
        query.brandId
      );
      const limit = boundedRoleCatalogLimit(query.limit);
      const cursor = boundedRoleQueryText(query.cursor, 'cursor', 256, true);
      const principalId = boundedRoleQueryText(query.principalId, 'userId', 256, true);
      const roleKey = boundedRoleQueryText(query.roleKey, 'roleKey', 256, true);
      const includeSystemAssignments = query.actor.effectiveScopeKeys.includes(SYSTEM_MANAGE_SCOPE);

      let selectedRoleIds: readonly string[] | undefined;
      if (roleKey !== undefined) {
        const roleContexts: Record<string, unknown>[] = [
          { branding: query.brandId, contextType: 'brand', key: roleKey },
          { branding: query.brandId, contextType: 'brand', name: roleKey },
        ];
        if (includeSystemAssignments) {
          roleContexts.push(
            { branding: null, contextType: 'system', protectedKind: 'system-admin', key: roleKey },
            { branding: null, contextType: 'system', protectedKind: 'system-admin', name: roleKey }
          );
        }
        const matchingRoles = (await Role.find({ or: roleContexts }).limit(4)) as RoleAttributes[];
        selectedRoleIds = uniqueStrings(matchingRoles.map(role => role.id));
        if (selectedRoleIds.length === 0) return Object.freeze({ items: Object.freeze([]) });
      }

      const criteriaParts: Record<string, unknown>[] = [
        includeSystemAssignments
          ? { or: [{ branding: query.brandId }, { branding: null }] }
          : { branding: query.brandId },
      ];
      if (cursor !== undefined) criteriaParts.push({ id: { '>': cursor } });
      if (principalId !== undefined) criteriaParts.push({ principalId });
      if (selectedRoleIds !== undefined) criteriaParts.push({ role: selectedRoleIds });
      if (query.source !== undefined) criteriaParts.push({ source: query.source });
      if (query.status !== undefined) criteriaParts.push({ status: query.status });
      if (query.sourcePresent !== undefined) criteriaParts.push({ sourcePresent: query.sourcePresent });
      if (query.expiry === 'expired') criteriaParts.push({ expiresAt: { '<=': this.dependencies.now() } });
      if (query.expiry === 'never') criteriaParts.push({ expiresAt: null });
      if (query.expiry === 'unexpired') {
        criteriaParts.push({ or: [{ expiresAt: null }, { expiresAt: { '>': this.dependencies.now() } }] });
      }

      const rows = (await RoleAssignment.find({ and: criteriaParts })
        .sort('id ASC')
        .limit(limit + 1)) as RoleAssignmentAttributes[];
      const page = rows.slice(0, limit);
      const roleIds = uniqueStrings(
        page.map(assignment => associationId(assignment.role)).filter((value): value is string => value !== undefined)
      );
      const roles = roleIds.length
        ? ((await Role.find({ id: roleIds }).limit(roleIds.length)) as RoleAttributes[])
        : [];
      const rolesById = new Map(roles.map(role => [role.id, role]));
      const items = Object.freeze(
        page.map(assignment => {
          const roleId = associationId(assignment.role);
          const role = roleId === undefined ? undefined : rolesById.get(roleId);
          const assignmentBrandId = associationId(assignment.branding);
          const roleBrandId = role === undefined ? undefined : associationId(role.branding);
          const validBrandRole =
            role?.contextType === 'brand' && assignmentBrandId === query.brandId && roleBrandId === query.brandId;
          const validSystemRole =
            includeSystemAssignments &&
            role?.contextType === 'system' &&
            role.protectedKind === 'system-admin' &&
            roleBrandId === undefined &&
            assignmentBrandId === undefined;
          if (role === undefined || (!validBrandRole && !validSystemRole)) {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              404,
              'Assignment state was not found in the active authorization context.'
            );
          }
          return this.assignmentSnapshot(assignment, role);
        })
      );
      return Object.freeze({
        items,
        ...(rows.length > limit && items.length > 0 ? { nextCursor: items[items.length - 1].id } : {}),
      });
    }

    private async replaceOverrides(
      roleId: string,
      overrides: readonly RoleScopeOverride[],
      actorId: string,
      reason: string | undefined,
      connection: Sails.Connection
    ): Promise<void> {
      await RoleScopeOverride.destroy({ role: roleId }).usingConnection(connection);
      if (overrides.length > 0) {
        await RoleScopeOverride.createEach(
          overrides.map(override => ({
            role: roleId,
            scopeKey: override.scopeKey,
            effect: override.effect,
            createdBy: actorId,
            reason,
          }))
        )
          .fetch()
          .usingConnection(connection);
      }
    }

    private async boundedReferenceRows(
      modelName: string,
      criteria: globalThis.Record<string, unknown>,
      roleKey: string,
      connection: Sails.Connection | undefined,
      inspectContents: boolean
    ): Promise<{ readonly references: number; readonly incomplete: boolean }> {
      const model = Reflect.get(globalThis, modelName) as BoundedFindModel | undefined;
      if (model?.find === undefined) return { references: 0, incomplete: true };
      try {
        const query = model.find(criteria).limit(AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS + 1);
        const rows = connection === undefined ? await query : await query.usingConnection(connection);
        let incomplete = rows.length > AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS;
        const bounded = rows.slice(0, AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS);
        let references = bounded.length;
        if (inspectContents) {
          const remaining = { value: AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_VALUES };
          references = 0;
          for (const row of bounded) {
            if (hasExactReference(row, roleKey, remaining, new WeakSet<object>())) references += 1;
            if (remaining.value <= 0) {
              incomplete = true;
              break;
            }
          }
        }
        return {
          references,
          incomplete,
        };
      } catch (_error) {
        return { references: 0, incomplete: true };
      }
    }

    private async boundedNativeReferenceRows(
      modelName: string,
      criteria: globalThis.Record<string, unknown>,
      connection?: Sails.Connection
    ): Promise<{ readonly references: number; readonly incomplete: boolean }> {
      const model = Reflect.get(globalThis, modelName) as BoundedNativeModel | undefined;
      if (model === undefined || typeof model.tableName !== 'string' || typeof model.getDatastore !== 'function') {
        return { references: 0, incomplete: true };
      }
      try {
        const manager = (connection ?? model.getDatastore().manager) as BoundedNativeManager;
        if (typeof manager.collection !== 'function') return { references: 0, incomplete: true };
        const collection = manager.collection(model.tableName);
        if (typeof collection.find !== 'function') return { references: 0, incomplete: true };
        const rows = await collection
          .find(criteria, { projection: { _id: 1 } })
          .limit(AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS + 1)
          .toArray();
        return {
          references: Math.min(rows.length, AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS),
          incomplete: rows.length > AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS,
        };
      } catch (_error) {
        return { references: 0, incomplete: true };
      }
    }

    private async boundedAssociationIds(
      modelName: string,
      criteria: globalThis.Record<string, unknown>,
      connection?: Sails.Connection
    ): Promise<BoundedAssociationIds> {
      const model = Reflect.get(globalThis, modelName) as BoundedFindModel | undefined;
      if (model?.find === undefined) return { ids: Object.freeze([]), incomplete: true };
      try {
        const query = model.find(criteria).limit(AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS + 1);
        const rows = connection === undefined ? await query : await query.usingConnection(connection);
        const ids = rows
          .slice(0, AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS)
          .map(associationId)
          .filter((value): value is string => value !== undefined);
        return Object.freeze({
          ids: Object.freeze(uniqueStrings(ids)),
          incomplete:
            rows.length > AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS ||
            ids.length !== Math.min(rows.length, AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS),
        });
      } catch (_error) {
        return { ids: Object.freeze([]), incomplete: true };
      }
    }

    private runtimeReferenceCount(roleKey: string): { readonly references: number; readonly incomplete: boolean } {
      const remaining = { value: AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_VALUES };
      const visited = new WeakSet<object>();
      let references = 0;
      const visit = (value: unknown): void => {
        if (remaining.value <= 0 || references > AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS) return;
        remaining.value -= 1;
        if (value === roleKey) {
          references += 1;
          return;
        }
        if (Array.isArray(value)) {
          value.forEach(visit);
        } else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
          if (visited.has(value)) return;
          visited.add(value);
          Object.values(value).forEach(visit);
        }
      };
      const config = sails.config;
      visit({
        auth: config.auth,
        authorization: config.authorization,
        branding: config.branding,
        navigation: config.navigation,
        pathRules: config.pathRules,
        workflow: config.workflow,
      });
      return {
        references: Math.min(references, AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS),
        incomplete: remaining.value <= 0 || references > AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS,
      };
    }

    private async boundedLegacyUserAssociations(
      roleId: string,
      connection?: Sails.Connection
    ): Promise<BoundedReferenceCount> {
      try {
        let query = Role.findOne({ id: roleId }).populate('users', {
          limit: AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1,
        });
        if (connection !== undefined) query = query.usingConnection(connection);
        const role = (await query) as RoleAttributes | undefined;
        if (role === undefined || !Array.isArray(role.users)) {
          return { references: 0, incomplete: true };
        }
        return {
          references: Math.min(role.users.length, AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1),
          incomplete: role.users.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS,
        };
      } catch (_error) {
        return { references: 0, incomplete: true };
      }
    }

    private async dependencySummary(
      role: RoleAttributes,
      connection?: Sails.Connection
    ): Promise<RoleDependencySummary> {
      let assignmentQuery = RoleAssignment.count({ role: role.id });
      if (connection !== undefined) assignmentQuery = assignmentQuery.usingConnection(connection);
      const [assignmentRowCount, legacyUsers] = await Promise.all([
        assignmentQuery,
        this.boundedLegacyUserAssociations(role.id, connection),
      ]);
      const assignmentRows = Math.min(assignmentRowCount, AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1);
      const roleKey = roleIdentity(role);
      const brandId = associationId(role.branding);
      const brandCriteria = brandId === undefined ? {} : { 'metaMetadata.brandId': brandId };
      const roleCriteria = {
        $or: [{ 'authorization.viewRoles': roleKey }, { 'authorization.editRoles': roleKey }],
      };
      const deletedBrandCriteria =
        brandId === undefined ? {} : { 'deletedRecordMetadata.metaMetadata.brandId': brandId };
      const deletedRoleCriteria = {
        $or: [
          { 'deletedRecordMetadata.authorization.viewRoles': roleKey },
          { 'deletedRecordMetadata.authorization.editRoles': roleKey },
        ],
      };
      const [brandRecordTypes, brandForms] = await Promise.all([
        this.boundedAssociationIds('RecordType', brandId === undefined ? {} : { branding: brandId }, connection),
        this.boundedAssociationIds('Form', brandId === undefined ? {} : { branding: brandId }, connection),
      ]);
      const workflowAssociations = [
        ...(brandRecordTypes.ids.length === 0 ? [] : [{ recordType: brandRecordTypes.ids }]),
        ...(brandForms.ids.length === 0 ? [] : [{ form: brandForms.ids }]),
      ];
      const workflowCriteria =
        workflowAssociations.length === 0
          ? { id: '__authorization-no-brand-workflow__' }
          : { or: workflowAssociations };
      const [active, deleted, appConfigs, forms, recordTypes, workflows] = await Promise.all([
        this.boundedNativeReferenceRows('Record', { ...brandCriteria, ...roleCriteria }, connection),
        this.boundedNativeReferenceRows(
          'DeletedRecord',
          { ...deletedBrandCriteria, ...deletedRoleCriteria },
          connection
        ),
        this.boundedReferenceRows(
          'AppConfig',
          brandId === undefined ? {} : { branding: brandId },
          roleKey,
          connection,
          true
        ),
        this.boundedReferenceRows(
          'Form',
          brandId === undefined ? {} : { branding: brandId },
          roleKey,
          connection,
          true
        ),
        this.boundedReferenceRows(
          'RecordType',
          brandId === undefined ? {} : { branding: brandId },
          roleKey,
          connection,
          true
        ),
        this.boundedReferenceRows('WorkflowStep', workflowCriteria, roleKey, connection, true),
      ]);
      const runtime = this.runtimeReferenceCount(roleKey);
      return Object.freeze({
        assignmentRows,
        legacyUserAssociations: legacyUsers.references,
        activeRecords: active.references,
        deletedRecords: deleted.references,
        storedConfigReferences:
          appConfigs.references + forms.references + recordTypes.references + workflows.references,
        runtimeConfigReferences: runtime.references,
        scanIncomplete:
          legacyUsers.incomplete ||
          active.incomplete ||
          deleted.incomplete ||
          appConfigs.incomplete ||
          forms.incomplete ||
          recordTypes.incomplete ||
          brandRecordTypes.incomplete ||
          brandForms.incomplete ||
          workflows.incomplete ||
          runtime.incomplete,
        templatePinned: associationId(role.template) !== undefined,
      });
    }

    private async activeAssignmentImpact(
      role: RoleAttributes,
      connection?: Sails.Connection
    ): Promise<BoundedReferenceCount> {
      let query = RoleAssignment.count({
        role: role.id,
        status: 'active',
        sourcePresent: true,
        or: [{ expiresAt: null }, { expiresAt: { '>': this.dependencies.now() } }],
      });
      if (connection !== undefined) query = query.usingConnection(connection);
      const references = await query;
      return Object.freeze({
        references: Math.min(references, AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1),
        incomplete: references > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS,
      });
    }

    public async createRole(
      command: CreateRoleCommand
    ): Promise<AuthorizationMutationResult<RoleAdministrationSnapshot>> {
      const auditInput = this.auditInput(
        command,
        command.cloneRoleKey ? 'role.cloned' : 'role.created',
        'role',
        command.key
      );
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
        const actorId = this.actorId(command);
        const key = normalizedNewRoleKey(command.key);
        const displayName = requiredAuthorizationText(command.displayName, 'displayName', 256);
        const description = optionalAuthorizationText(command.description, 2_000);
        if (command.templateKey !== undefined && command.cloneRoleKey !== undefined) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'A role cannot be created from both a template and a clone source.'
          );
        }
        if (command.templateRevision !== undefined && command.templateKey === undefined) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'A template revision requires a template key.'
          );
        }
        if (command.cloneRoleKey !== undefined && command.desiredScopeKeys !== undefined) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'A cloned role copies the source effective scope set.'
          );
        }
        const duplicate = (await Role.find({
          branding: command.brandId,
          or: [{ identityKey: `brand:${command.brandId}:${key}` }, { key }, { name: key }],
        })
          .limit(1)
          .usingConnection(connection)) as RoleAttributes[];
        if (duplicate.length > 0) {
          throw new AuthorizationAdministrationError(
            'authorization.duplicate-role',
            409,
            'A role with this key already exists in the brand.'
          );
        }
        let template: RoleTemplateAttributes | undefined;
        let revision: RoleTemplateRevisionAttributes | undefined;
        let desiredScopeKeys = normalizedScopeKeys(command.desiredScopeKeys ?? []);
        if (command.templateKey !== undefined) {
          template = await this.findTemplate(command.templateKey, connection);
          if (template.status !== 'active') {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-role',
              400,
              'Only an active role template can seed a new role.'
            );
          }
          const targetRevision = command.templateRevision ?? template.currentRevision;
          revision = await this.findRevision(template.id, targetRevision, connection);
          if (command.desiredScopeKeys === undefined) desiredScopeKeys = normalizedScopeKeys(revision.scopeKeys);
        }
        if (command.cloneRoleKey !== undefined) {
          const source = await this.findRole(command.cloneRoleKey, command.brandId, connection);
          desiredScopeKeys = (await this.loadRoleState(source, connection)).effectiveScopeKeys;
        }
        const validationRole = {
          id: 'new',
          name: key,
          key,
          contextType: 'brand' as const,
          branding: command.brandId,
          protectedKind: 'none' as const,
          status: 'active' as const,
          version: 1,
        } as RoleAttributes;
        this.validateScopeSet(validationRole, desiredScopeKeys, command.actor);
        let created: RoleAttributes;
        try {
          created = (await Role.create({
            name: key,
            key,
            identityKey: `brand:${command.brandId}:${key}`,
            displayName,
            description,
            contextType: 'brand',
            branding: command.brandId,
            template: template?.id,
            templateRevision: revision?.revision,
            protectedKind: 'none',
            status: 'active',
            version: 1,
            createdBy: actorId,
            updatedBy: actorId,
          })
            .fetch()
            .usingConnection(connection)) as RoleAttributes;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            throw new AuthorizationAdministrationError(
              'authorization.duplicate-role',
              409,
              'A role with this key already exists in the brand.'
            );
          }
          throw error;
        }
        const overrides = normalizeRoleScopeOverrides({
          baseScopeKeys: revision === undefined ? [] : normalizedScopeKeys(revision.scopeKeys),
          desiredScopeKeys,
        });
        await this.replaceOverrides(created.id, overrides, actorId, command.reason, connection);
        const state = await this.loadRoleState(created, connection);
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, targetId: created.id, after: this.snapshot(state) }, connection);
        return Object.freeze({
          data: this.snapshot(state),
          version: 1,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    public async updateRole(
      command: UpdateRoleCommand
    ): Promise<AuthorizationMutationResult<RoleAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'role.updated', 'role', command.roleKey);
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
        const expectedVersion = positiveVersion(command.expectedVersion);
        const role = await this.findRole(command.roleKey, command.brandId, connection);
        const before = this.snapshot(await this.loadRoleState(role, connection));
        if (command.displayName === undefined && command.description === undefined) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'At least one mutable role field is required.'
          );
        }
        const updated = (await Role.updateOne({ id: role.id, version: expectedVersion })
          .set({
            displayName:
              command.displayName === undefined
                ? before.displayName
                : requiredAuthorizationText(command.displayName, 'displayName', 256),
            description:
              command.description === undefined
                ? before.description
                : (optionalAuthorizationText(command.description, 2_000) ?? ''),
            updatedBy: this.actorId(command),
            version: expectedVersion + 1,
          })
          .usingConnection(connection)) as RoleAttributes | undefined;
        if (updated == null) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The role changed since it was read.'
          );
        }
        const after = this.snapshot(await this.loadRoleState(updated, connection));
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, targetId: role.id, before, after }, connection);
        return Object.freeze({
          data: after,
          version: after.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    private async scopePreview(
      command: PreviewRoleScopesCommand,
      connection?: Sails.Connection,
      allowSystemAdoption = false
    ): Promise<AuthorizationPreviewResult<RoleAdministrationSnapshot>> {
      this.requireScope(command, allowSystemAdoption ? SYSTEM_MANAGE_SCOPE : ROLE_MANAGE_SCOPE, command.brandId);
      const expectedVersion = positiveVersion(command.expectedVersion);
      const role = await this.findRole(command.roleKey, command.brandId, connection);
      if (role.contextType === 'system') this.requireScope(command, SYSTEM_MANAGE_SCOPE);
      const currentState = await this.loadRoleState(role, connection);
      const current = this.snapshot(currentState);
      if (current.version !== expectedVersion) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The role changed since it was read.'
        );
      }
      const desired = normalizedScopeKeys(command.desiredScopeKeys);
      if (allowSystemAdoption) {
        const registryValidation = this.dependencies.getRegistry().validateScopeKeys(desired);
        if (registryValidation.inactiveScopeKeys.length || registryValidation.missingScopeKeys.length) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-scope',
            400,
            'The adoption scope is unavailable.'
          );
        }
        if (role.protectedKind !== 'system-admin') {
          throw new AuthorizationAdministrationError(
            'authorization.protected-role',
            409,
            'Scope adoption targets the protected system role.'
          );
        }
      } else {
        this.validateScopeSet(role, desired, command.actor);
      }
      const currentSet = new Set(current.effectiveScopeKeys);
      const desiredSet = new Set(desired);
      const addedScopeKeys = desired.filter(scopeKey => !currentSet.has(scopeKey));
      const removedScopeKeys = current.effectiveScopeKeys.filter(scopeKey => !desiredSet.has(scopeKey));
      const dependencies = await this.dependencySummary(role, connection);
      const activeAssignments = await this.activeAssignmentImpact(role, connection);
      const proposed = Object.freeze({
        ...current,
        effectiveScopeKeys: desired,
        overrides: normalizeRoleScopeOverrides({
          baseScopeKeys: currentState.baseScopeKeys,
          desiredScopeKeys: desired,
        }),
        version: current.version + 1,
      });
      const content = {
        desiredScopeKeys: desired,
        reason: optionalAuthorizationText(command.reason, 1_000),
        affectedAssignments: activeAssignments.references,
        dependencies,
      };
      const changed = addedScopeKeys.length > 0 || removedScopeKeys.length > 0;
      const fatalErrors =
        dependencies.scanIncomplete || activeAssignments.incomplete
          ? Object.freeze(['assignment-impact-limit'])
          : Object.freeze<string[]>([]);
      return Object.freeze({
        operation: allowSystemAdoption ? 'scope-adoption' : 'role-scopes',
        current,
        proposed,
        addedScopeKeys,
        removedScopeKeys,
        affectedAssignments: activeAssignments.references,
        dependencies,
        warnings: Object.freeze([]),
        fatalErrors,
        confirmationToken:
          changed && fatalErrors.length === 0
            ? this.issueConfirmation(
                command,
                allowSystemAdoption ? 'scope-adoption' : 'role-scopes',
                role.id,
                expectedVersion,
                content
              )
            : undefined,
      });
    }

    public previewRoleScopes(
      command: PreviewRoleScopesCommand
    ): Promise<AuthorizationPreviewResult<RoleAdministrationSnapshot>> {
      return this.scopePreview(command);
    }

    public async applyRoleScopes(
      command: ApplyRoleScopesCommand
    ): Promise<AuthorizationMutationResult<RoleAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'role.scopes-updated', 'role', command.roleKey);
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
        const expectedVersion = positiveVersion(command.expectedVersion);
        const desired = normalizedScopeKeys(command.desiredScopeKeys);
        const fresh = await this.findRole(command.roleKey, command.brandId, connection);
        if (fresh.contextType === 'system') this.requireScope(command, SYSTEM_MANAGE_SCOPE);
        const state = await this.loadRoleState(fresh, connection);
        const before = this.snapshot(state);
        if (before.version !== expectedVersion) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The role changed since preview.'
          );
        }
        this.validateScopeSet(fresh, desired, command.actor);
        const dependencies = await this.dependencySummary(fresh, connection);
        const activeAssignments = await this.activeAssignmentImpact(fresh, connection);
        this.verifyConfirmation(command, command.confirmationToken, 'role-scopes', fresh.id, expectedVersion, {
          desiredScopeKeys: desired,
          reason: optionalAuthorizationText(command.reason, 1_000),
          affectedAssignments: activeAssignments.references,
          dependencies,
        });
        const overrides = normalizeRoleScopeOverrides({
          baseScopeKeys: state.baseScopeKeys,
          desiredScopeKeys: desired,
        });
        await this.replaceOverrides(fresh.id, overrides, this.actorId(command), command.reason, connection);
        const updated = (await Role.updateOne({ id: fresh.id, version: expectedVersion })
          .set({ version: expectedVersion + 1, updatedBy: this.actorId(command) })
          .usingConnection(connection)) as RoleAttributes | undefined;
        if (updated == null) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The role changed since preview.'
          );
        }
        const after = this.snapshot(await this.loadRoleState(updated, connection));
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, targetId: fresh.id, before, after }, connection);
        return Object.freeze({
          data: after,
          version: after.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    public async previewTemplateRevision(
      command: PreviewTemplateRevisionCommand
    ): Promise<AuthorizationPreviewResult<Readonly<Record<string, unknown>>>> {
      this.requireScope(command, SYSTEM_MANAGE_SCOPE);
      const template = await this.findTemplate(command.templateKey);
      const expectedVersion = positiveVersion(command.expectedVersion);
      if (template.version !== expectedVersion) {
        throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The template changed.');
      }
      const scopeKeys = normalizedScopeKeys(command.scopeKeys);
      this.validateTemplateScopeSet(template, scopeKeys, command.actor);
      const currentRevision = await this.findRevision(template.id, template.currentRevision);
      const currentKeys = normalizedScopeKeys(currentRevision.scopeKeys);
      const currentSet = new Set(currentKeys);
      const nextSet = new Set(scopeKeys);
      const content = this.templatePublicationContent(command, scopeKeys, template.currentRevision + 1);
      const current = Object.freeze({
        templateKey: template.key,
        revision: template.currentRevision,
        scopeKeys: currentKeys,
        displayName: template.displayName,
        description: template.description,
        ...(currentRevision.notes === undefined ? {} : { notes: currentRevision.notes }),
        version: template.version,
      });
      const proposed = Object.freeze({
        ...current,
        revision: template.currentRevision + 1,
        scopeKeys,
        displayName: content.displayName ?? template.displayName,
        description: content.description ?? template.description,
        ...(content.notes === undefined ? { notes: undefined } : { notes: content.notes }),
        version: expectedVersion + 1,
      });
      return Object.freeze({
        operation: 'template-publish',
        current,
        proposed,
        addedScopeKeys: scopeKeys.filter(scopeKey => !currentSet.has(scopeKey)),
        removedScopeKeys: currentKeys.filter(scopeKey => !nextSet.has(scopeKey)),
        affectedAssignments: 0,
        warnings: Object.freeze([]),
        fatalErrors: Object.freeze([]),
        confirmationToken: this.issueConfirmation(command, 'template-publish', template.id, expectedVersion, content),
      });
    }

    public async publishTemplateRevision(
      command: PublishTemplateRevisionCommand
    ): Promise<AuthorizationMutationResult<Readonly<Record<string, unknown>>>> {
      const auditInput = this.auditInput(command, 'template.revision-published', 'role-template', command.templateKey);
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, SYSTEM_MANAGE_SCOPE);
        const expectedVersion = positiveVersion(command.expectedVersion);
        const scopeKeys = normalizedScopeKeys(command.scopeKeys);
        const fresh = await this.findTemplate(command.templateKey, connection);
        if (fresh.version !== expectedVersion) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The template changed since preview.'
          );
        }
        this.validateTemplateScopeSet(fresh, scopeKeys, command.actor);
        const content = this.templatePublicationContent(command, scopeKeys, fresh.currentRevision + 1);
        this.verifyConfirmation(
          command,
          command.confirmationToken,
          'template-publish',
          fresh.id,
          expectedVersion,
          content
        );
        const nextRevision = fresh.currentRevision + 1;
        const revision = (await RoleTemplateRevision.create({
          template: fresh.id,
          revision: nextRevision,
          scopeKeys,
          notes: content.notes,
          publishedBy: this.actorId(command),
          publishedAt: this.dependencies.now(),
        })
          .fetch()
          .usingConnection(connection)) as RoleTemplateRevisionAttributes;
        const updated = (await RoleTemplate.updateOne({ id: fresh.id, version: expectedVersion })
          .set({
            currentRevision: nextRevision,
            displayName: content.displayName ?? fresh.displayName,
            description: content.description ?? fresh.description,
            version: expectedVersion + 1,
          })
          .usingConnection(connection)) as RoleTemplateAttributes | undefined;
        if (updated == null)
          throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The template changed.');
        const data = Object.freeze({
          templateKey: updated.key,
          revision: revision.revision,
          scopeKeys: Object.freeze([...scopeKeys]),
        });
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent(
            { ...auditInput, targetId: fresh.id, before: { currentRevision: fresh.currentRevision }, after: data },
            connection
          );
        return Object.freeze({
          data,
          version: updated.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    public async previewRoleTemplateUpgrade(
      command: PreviewRoleTemplateUpgradeCommand
    ): Promise<AuthorizationPreviewResult<RoleAdministrationSnapshot>> {
      this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
      const role = await this.findRole(command.roleKey, command.brandId);
      const state = await this.loadRoleState(role);
      if (state.template === undefined || state.revision === undefined) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-role',
          400,
          'The role is not template based.'
        );
      }
      const current = this.snapshot(state);
      if (current.version !== positiveVersion(command.expectedVersion)) {
        throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The role changed.');
      }
      requireNewerTemplateRevision(current.templateRevision!, command.targetRevision);
      const nextRevision = await this.findRevision(state.template.id, command.targetRevision);
      const upgrade = previewRoleTemplateUpgrade({
        currentBaseScopeKeys: state.baseScopeKeys,
        nextBaseScopeKeys: normalizedScopeKeys(nextRevision.scopeKeys),
        overrides: state.overrides,
        registry: this.dependencies.getRegistry(),
      });
      this.validateScopeSet(role, upgrade.nextEffectiveScopeKeys, command.actor);
      const proposed = Object.freeze({
        ...current,
        templateRevision: command.targetRevision,
        baseScopeKeys: normalizedScopeKeys(nextRevision.scopeKeys),
        effectiveScopeKeys: upgrade.nextEffectiveScopeKeys,
        overrides: upgrade.nextOverrides,
        version: current.version + 1,
      });
      const dependencies = await this.dependencySummary(role);
      const activeAssignments = await this.activeAssignmentImpact(role);
      const content = {
        targetRevision: command.targetRevision,
        reason: optionalAuthorizationText(command.reason, 1_000),
        affectedAssignments: activeAssignments.references,
        dependencies,
      };
      const fatalErrors =
        dependencies.scanIncomplete || activeAssignments.incomplete
          ? Object.freeze(['assignment-impact-limit'])
          : Object.freeze<string[]>([]);
      return Object.freeze({
        operation: 'template-upgrade',
        current,
        proposed,
        addedScopeKeys: upgrade.addedScopeKeys,
        removedScopeKeys: upgrade.removedScopeKeys,
        affectedAssignments: activeAssignments.references,
        dependencies,
        warnings: Object.freeze([]),
        fatalErrors,
        confirmationToken:
          fatalErrors.length === 0
            ? this.issueConfirmation(command, 'template-upgrade', role.id, current.version, content)
            : undefined,
      });
    }

    public async applyRoleTemplateUpgrade(
      command: ApplyRoleTemplateUpgradeCommand
    ): Promise<AuthorizationMutationResult<RoleAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'role.template-upgraded', 'role', command.roleKey);
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
        const expectedVersion = positiveVersion(command.expectedVersion);
        const fresh = await this.findRole(command.roleKey, command.brandId, connection);
        const state = await this.loadRoleState(fresh, connection);
        const before = this.snapshot(state);
        if (before.version !== expectedVersion || state.template === undefined || state.revision === undefined) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The role changed since preview.'
          );
        }
        requireNewerTemplateRevision(before.templateRevision!, command.targetRevision);
        const next = await this.findRevision(state.template.id, command.targetRevision, connection);
        const upgrade = previewRoleTemplateUpgrade({
          currentBaseScopeKeys: state.baseScopeKeys,
          nextBaseScopeKeys: normalizedScopeKeys(next.scopeKeys),
          overrides: state.overrides,
          registry: this.dependencies.getRegistry(),
        });
        this.validateScopeSet(fresh, upgrade.nextEffectiveScopeKeys, command.actor);
        const dependencies = await this.dependencySummary(fresh, connection);
        const activeAssignments = await this.activeAssignmentImpact(fresh, connection);
        this.verifyConfirmation(command, command.confirmationToken, 'template-upgrade', fresh.id, expectedVersion, {
          targetRevision: command.targetRevision,
          reason: optionalAuthorizationText(command.reason, 1_000),
          affectedAssignments: activeAssignments.references,
          dependencies,
        });
        await this.replaceOverrides(fresh.id, upgrade.nextOverrides, this.actorId(command), command.reason, connection);
        const updated = (await Role.updateOne({ id: fresh.id, version: expectedVersion })
          .set({
            templateRevision: command.targetRevision,
            version: expectedVersion + 1,
            updatedBy: this.actorId(command),
          })
          .usingConnection(connection)) as RoleAttributes | undefined;
        if (updated == null)
          throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The role changed.');
        const after = this.snapshot(await this.loadRoleState(updated, connection));
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, targetId: fresh.id, before, after }, connection);
        return Object.freeze({
          data: after,
          version: after.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    public async previewRoleInactivation(
      command: PreviewRoleLifecycleCommand
    ): Promise<AuthorizationPreviewResult<RoleAdministrationSnapshot>> {
      this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
      const role = await this.findRole(command.roleKey, command.brandId);
      const current = this.snapshot(await this.loadRoleState(role));
      if (current.version !== positiveVersion(command.expectedVersion)) {
        throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The role changed.');
      }
      if (role.protectedKind !== 'none') {
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          409,
          'Protected roles cannot be inactivated.'
        );
      }
      if (role.status === 'inactive') {
        throw new AuthorizationAdministrationError('authorization.invalid-role', 400, 'The role is already inactive.');
      }
      const dependencies = await this.dependencySummary(role);
      const activeAssignments = await this.activeAssignmentImpact(role);
      const fatalErrors =
        dependencies.scanIncomplete || activeAssignments.incomplete
          ? Object.freeze(['assignment-impact-limit'])
          : Object.freeze<string[]>([]);
      const content = {
        status: 'inactive',
        reason: optionalAuthorizationText(command.reason, 1_000),
        affectedAssignments: activeAssignments.references,
        dependencies,
      };
      return Object.freeze({
        operation: 'role-inactivate',
        current,
        proposed: Object.freeze({ ...current, status: 'inactive' as const, version: current.version + 1 }),
        addedScopeKeys: Object.freeze([]),
        removedScopeKeys: current.effectiveScopeKeys,
        affectedAssignments: activeAssignments.references,
        dependencies,
        warnings: Object.freeze([]),
        fatalErrors,
        confirmationToken:
          fatalErrors.length === 0
            ? this.issueConfirmation(command, 'role-inactivate', role.id, current.version, content)
            : undefined,
      });
    }

    public async inactivateRole(
      command: ApplyRoleLifecycleCommand
    ): Promise<AuthorizationMutationResult<RoleAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'role.inactivated', 'role', command.roleKey);
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
        const expectedVersion = positiveVersion(command.expectedVersion);
        const fresh = await this.findRole(command.roleKey, command.brandId, connection);
        if (fresh.protectedKind !== 'none')
          throw new AuthorizationAdministrationError(
            'authorization.protected-role',
            409,
            'Protected roles cannot be inactivated.'
          );
        if (fresh.status === 'inactive') {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'The role is already inactive.'
          );
        }
        const dependencies = await this.dependencySummary(fresh, connection);
        const activeAssignments = await this.activeAssignmentImpact(fresh, connection);
        if (dependencies.scanIncomplete || activeAssignments.incomplete)
          throw new AuthorizationAdministrationError(
            'authorization.query-bound-exceeded',
            409,
            'The role impact exceeds the bounded operation limit.'
          );
        const before = this.snapshot(await this.loadRoleState(fresh, connection));
        if (before.version !== expectedVersion) {
          throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The role changed.');
        }
        this.verifyConfirmation(command, command.confirmationToken, 'role-inactivate', fresh.id, expectedVersion, {
          status: 'inactive',
          reason: optionalAuthorizationText(command.reason, 1_000),
          affectedAssignments: activeAssignments.references,
          dependencies,
        });
        const updated = (await Role.updateOne({ id: fresh.id, version: expectedVersion })
          .set({ status: 'inactive', version: expectedVersion + 1, updatedBy: this.actorId(command) })
          .usingConnection(connection)) as RoleAttributes | undefined;
        if (updated == null)
          throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The role changed.');
        await Role.replaceCollection(fresh.id, 'users').members([]).usingConnection(connection);
        const after = this.snapshot(await this.loadRoleState(updated, connection));
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, targetId: fresh.id, before, after }, connection);
        return Object.freeze({
          data: after,
          version: after.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    public async previewRoleDeletion(
      command: PreviewRoleLifecycleCommand
    ): Promise<AuthorizationPreviewResult<RoleAdministrationSnapshot>> {
      this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
      const role = await this.findRole(command.roleKey, command.brandId);
      const current = this.snapshot(await this.loadRoleState(role));
      if (current.version !== positiveVersion(command.expectedVersion))
        throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The role changed.');
      if (role.protectedKind !== 'none')
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          409,
          'Protected roles cannot be deleted.'
        );
      const dependencies = await this.dependencySummary(role);
      const blocked =
        dependencies.assignmentRows > 0 ||
        dependencies.legacyUserAssociations > 0 ||
        dependencies.activeRecords > 0 ||
        dependencies.deletedRecords > 0 ||
        dependencies.storedConfigReferences > 0 ||
        dependencies.runtimeConfigReferences > 0 ||
        dependencies.scanIncomplete;
      const fatalErrors = blocked ? Object.freeze(['role-has-dependencies']) : Object.freeze<string[]>([]);
      return Object.freeze({
        operation: 'role-delete',
        current,
        addedScopeKeys: Object.freeze([]),
        removedScopeKeys: current.effectiveScopeKeys,
        affectedAssignments: dependencies.assignmentRows,
        dependencies,
        warnings: Object.freeze([]),
        fatalErrors,
        confirmationToken: blocked
          ? undefined
          : this.issueConfirmation(command, 'role-delete', role.id, current.version, {
              delete: true,
              reason: optionalAuthorizationText(command.reason, 1_000),
            }),
      });
    }

    public async deleteRole(
      command: ApplyRoleLifecycleCommand
    ): Promise<AuthorizationMutationResult<RoleAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'role.deleted', 'role', command.roleKey);
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, ROLE_MANAGE_SCOPE, command.brandId);
        const expectedVersion = positiveVersion(command.expectedVersion);
        const fresh = await this.findRole(command.roleKey, command.brandId, connection);
        if (fresh.protectedKind !== 'none')
          throw new AuthorizationAdministrationError(
            'authorization.protected-role',
            409,
            'Protected roles cannot be deleted.'
          );
        const before = this.snapshot(await this.loadRoleState(fresh, connection));
        if (before.version !== expectedVersion)
          throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The role changed.');
        this.verifyConfirmation(command, command.confirmationToken, 'role-delete', fresh.id, expectedVersion, {
          delete: true,
          reason: optionalAuthorizationText(command.reason, 1_000),
        });
        const dependencies = await this.dependencySummary(fresh, connection);
        if (
          dependencies.assignmentRows > 0 ||
          dependencies.legacyUserAssociations > 0 ||
          dependencies.activeRecords > 0 ||
          dependencies.deletedRecords > 0 ||
          dependencies.storedConfigReferences > 0 ||
          dependencies.runtimeConfigReferences > 0 ||
          dependencies.scanIncomplete
        ) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The role acquired dependencies after preview.',
            { dependencies }
          );
        }
        await RoleScopeOverride.destroy({ role: fresh.id }).usingConnection(connection);
        await Role.replaceCollection(fresh.id, 'users').members([]).usingConnection(connection);
        const deleted = await Role.destroyOne({ id: fresh.id, version: expectedVersion }).usingConnection(connection);
        if (deleted == null)
          throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The role changed.');
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, targetId: fresh.id, before }, connection);
        return Object.freeze({
          data: before,
          version: expectedVersion,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    private async canonicalUser(identifier: string, connection: Sails.Connection): Promise<UserAttributes> {
      let current = (await User.findOne({ id: identifier }).usingConnection(connection)) as UserAttributes | undefined;
      if (current === undefined) {
        current = (await User.findOne({ username: identifier }).usingConnection(connection)) as
          | UserAttributes
          | undefined;
      }
      const visited = new Set<string>();
      for (let depth = 0; current !== undefined && depth < MAX_LINK_DEPTH; depth += 1) {
        if (visited.has(current.id) || current.loginDisabled === true) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
        }
        visited.add(current.id);
        if (!current.linkedPrimaryUserId?.trim()) {
          if (current.accountLinkState === 'linked-alias') {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              404,
              'The target user was not found.'
            );
          }
          return current;
        }
        current = (await User.findOne({ id: current.linkedPrimaryUserId }).usingConnection(connection)) as
          | UserAttributes
          | undefined;
      }
      throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
    }

    private assignmentRoleScope(command: AuthorizationAdministrationCommand, role: RoleAttributes): void {
      if (role.protectedKind === 'guest') {
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          409,
          'Guest is implicit and cannot be assigned.'
        );
      }
      const brandId = associationId(role.branding);
      if (role.contextType === 'system') {
        if (role.protectedKind !== 'system-admin' || brandId !== undefined) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target role was not found.');
        }
        if (!command.actor.effectiveScopeKeys.includes(SYSTEM_MANAGE_SCOPE)) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target role was not found.');
        }
        this.requireScope(command, SYSTEM_MANAGE_SCOPE);
      } else {
        if (role.contextType !== 'brand' || brandId === undefined || command.brandId !== brandId) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target role was not found.');
        }
        this.requireScope(command, ASSIGNMENT_MANAGE_SCOPE, brandId);
      }
    }

    private requireAssignableRole(role: RoleAttributes): void {
      if (role.status !== 'active') {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-role',
          400,
          'Inactive roles cannot be assigned.'
        );
      }
    }

    private assertAssignmentRoleContext(assignment: RoleAssignmentAttributes, role: RoleAttributes): void {
      const assignmentRoleId = associationId(assignment.role);
      const assignmentBrandId = associationId(assignment.branding);
      const roleBrandId = associationId(role.branding);
      const validBrandContext =
        assignmentRoleId === role.id &&
        role.contextType === 'brand' &&
        roleBrandId !== undefined &&
        assignmentBrandId === roleBrandId;
      const validSystemContext =
        assignmentRoleId === role.id &&
        role.contextType === 'system' &&
        role.protectedKind === 'system-admin' &&
        roleBrandId === undefined &&
        assignmentBrandId === undefined;
      if (!validBrandContext && !validSystemContext) {
        throw new AuthorizationAdministrationError(
          'authorization.not-found',
          404,
          'The assignment was not found in the active authorization context.'
        );
      }
    }

    private async validateAssignmentDelegation(
      command: AuthorizationAdministrationCommand,
      role: RoleAttributes,
      connection: Sails.Connection
    ): Promise<void> {
      const effective = (await this.loadRoleState(role, connection)).effectiveScopeKeys;
      if (!hasEveryScope(command.actor.effectiveScopeKeys, effective)) {
        throw new AuthorizationAdministrationError(
          'authorization.delegation-ceiling',
          403,
          'The assigned role exceeds the actor delegation ceiling.'
        );
      }
    }

    private async findAssignmentByTuple(
      principalId: string,
      roleId: string,
      source: RoleAssignmentSource,
      sourceKey: string,
      connection: Sails.Connection
    ): Promise<RoleAssignmentAttributes | undefined> {
      return (await RoleAssignment.findOne({
        principalType: 'user',
        principalId,
        role: roleId,
        source,
        sourceKey,
      }).usingConnection(connection)) as RoleAssignmentAttributes | undefined;
    }

    private assignmentSnapshot(
      assignment: RoleAssignmentAttributes,
      role: RoleAttributes
    ): AssignmentAdministrationSnapshot {
      const expiresAt = assignment.expiresAt == null ? undefined : new Date(assignment.expiresAt).toISOString();
      const revokedAt = assignment.revokedAt == null ? undefined : new Date(assignment.revokedAt).toISOString();
      const suppressedAt =
        assignment.suppressedAt == null ? undefined : new Date(assignment.suppressedAt).toISOString();
      const reason = optionalAuthorizationText(assignment.reason, 1_000);
      const revokedBy = optionalAuthorizationText(assignment.revokedBy, 256);
      const suppressedBy = optionalAuthorizationText(assignment.suppressedBy, 256);
      return Object.freeze({
        id: assignment.id,
        principalId: assignment.principalId,
        roleId: role.id,
        roleKey: roleIdentity(role) as AssignmentAdministrationSnapshot['roleKey'],
        brandId: associationId(role.branding),
        source: assignment.source,
        sourceKey: assignment.sourceKey,
        status: assignment.status,
        sourcePresent: assignment.sourcePresent,
        assignedBy: requiredAuthorizationText(assignment.assignedBy, 'assignedBy', 256),
        assignedAt: new Date(assignment.assignedAt).toISOString(),
        ...(expiresAt === undefined ? {} : { expiresAt }),
        ...(revokedBy === undefined ? {} : { revokedBy }),
        ...(revokedAt === undefined ? {} : { revokedAt }),
        ...(suppressedBy === undefined ? {} : { suppressedBy }),
        ...(suppressedAt === undefined ? {} : { suppressedAt }),
        ...(reason === undefined ? {} : { reason }),
        version: assignment.version,
      });
    }

    private async projectLegacyAuthority(
      principalId: string,
      role: RoleAttributes,
      connection: Sails.Connection
    ): Promise<void> {
      const roleBrandId = associationId(role.branding);
      const validBrandRole = role.contextType === 'brand' && roleBrandId !== undefined;
      const validSystemRole =
        role.contextType === 'system' && role.protectedKind === 'system-admin' && roleBrandId === undefined;
      if (!validBrandRole && !validSystemRole) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target role was not found.');
      }
      const assignments = (await RoleAssignment.find({
        principalType: 'user',
        principalId,
        role: role.id,
        branding: validBrandRole ? roleBrandId : null,
        status: 'active',
        sourcePresent: true,
        or: [{ expiresAt: null }, { expiresAt: { '>': this.dependencies.now() } }],
      })
        .limit(1)
        .usingConnection(connection)) as RoleAssignmentAttributes[];
      const effective = role.status === 'active' && assignments.length > 0;
      const query = effective
        ? User.addToCollection(principalId, 'roles').members([role.id])
        : User.removeFromCollection(principalId, 'roles').members([role.id]);
      await query.usingConnection(connection);
    }

    private async lockProtectedRole(
      role: RoleAttributes,
      actorId: string,
      connection: Sails.Connection
    ): Promise<void> {
      if (role.protectedKind !== 'brand-admin' && role.protectedKind !== 'system-admin') return;
      const version = positiveVersion(role.version ?? 1, 'role.version');
      const locked = await Role.updateOne({ id: role.id, version })
        .set({ version: version + 1, updatedBy: actorId })
        .usingConnection(connection);
      if (locked == null) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'Protected administrator state changed concurrently.'
        );
      }
    }

    private async assertAdministratorQuorum(
      role: RoleAttributes,
      connection: Sails.Connection,
      requireNonExpiring = false
    ): Promise<void> {
      if (!isProtectedAdministratorRole(role)) return;
      const roleCriteria: Record<string, unknown> = {
        protectedKind: role.protectedKind,
        status: 'active',
        branding: role.protectedKind === 'brand-admin' ? associationId(role.branding) : null,
        ...(role.protectedKind === 'brand-admin' ? { contextType: 'brand' } : { contextType: 'system' }),
      };
      const protectedRoles = (await Role.find(roleCriteria).limit(100).usingConnection(connection)) as RoleAttributes[];
      const roleIds = protectedRoles.map(candidate => candidate.id);
      const rows = (await RoleAssignment.find({
        principalType: 'user',
        role: roleIds,
        branding: role.protectedKind === 'brand-admin' ? associationId(role.branding) : null,
        status: 'active',
        sourcePresent: true,
        ...(requireNonExpiring
          ? { expiresAt: null }
          : { or: [{ expiresAt: null }, { expiresAt: { '>': this.dependencies.now() } }] }),
      })
        .limit(AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1)
        .usingConnection(connection)) as RoleAssignmentAttributes[];
      if (rows.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'Administrator quorum exceeds the bounded validation limit.'
        );
      }
      const principalIds = uniqueStrings(rows.map(row => row.principalId));
      const users = principalIds.length
        ? ((await User.find({ id: principalIds, loginDisabled: { '!=': true } })
            .limit(AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS)
            .usingConnection(connection)) as UserAttributes[])
        : [];
      const activePrincipals = new Set(users.filter(isCanonicalActiveUser).map(user => user.id));
      if (activePrincipals.size === 0) {
        throw new AuthorizationAdministrationError(
          role.protectedKind === 'system-admin' ? 'authorization.last-system-admin' : 'authorization.last-brand-admin',
          409,
          requireNonExpiring
            ? 'The operation would schedule removal of the final effective administrator.'
            : 'The operation would remove the final effective administrator.'
        );
      }
    }

    private async grantWithinTransaction(
      command: GrantAssignmentCommand,
      role: RoleAttributes,
      principalId: string,
      connection: Sails.Connection
    ): Promise<AssignmentMutationOutcome> {
      const sourceKey = requiredAuthorizationText(command.sourceKey, 'sourceKey', 128);
      const existing = await this.findAssignmentByTuple(principalId, role.id, command.source, sourceKey, connection);
      if (existing !== undefined) this.assertAssignmentRoleContext(existing, role);
      const now = this.dependencies.now();
      const expiresAt = normalizedExpiry(command.expiresAt, now);
      if (existing === undefined) {
        if (isProtectedAdministratorRole(role) && expiresAt !== undefined) {
          await this.lockProtectedRole(role, this.actorId(command), connection);
        }
        const created = (await RoleAssignment.create({
          principalType: 'user',
          principalId,
          role: role.id,
          branding: associationId(role.branding),
          source: command.source,
          sourceKey,
          status: 'active',
          sourcePresent: true,
          assignedBy: this.actorId(command),
          assignedAt: now,
          expiresAt,
          reason: optionalAuthorizationText(command.reason, 1_000),
          version: 1,
        })
          .fetch()
          .usingConnection(connection)) as RoleAssignmentAttributes;
        if (isProtectedAdministratorRole(role) && expiresAt !== undefined) {
          await this.assertAdministratorQuorum(role, connection, true);
        }
        return { assignment: created, changed: true, eventType: 'assignment.created' };
      }
      if (existing.status === 'suppressed') {
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          409,
          'A locally suppressed external assignment must be explicitly unsuppressed.'
        );
      }
      if (command.expectedVersion !== undefined && existing.version !== positiveVersion(command.expectedVersion)) {
        throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The assignment changed.');
      }
      const existingExpiry = existing.expiresAt == null ? undefined : new Date(existing.expiresAt).toISOString();
      if (existing.status === 'active' && existing.sourcePresent && existingExpiry === expiresAt) {
        if (isProtectedAdministratorRole(role) && expiresAt !== undefined) {
          await this.assertAdministratorQuorum(role, connection, true);
        }
        return { assignment: existing, changed: false, eventType: 'assignment.noop' };
      }
      if (isProtectedAdministratorRole(role) && expiresAt !== undefined) {
        await this.lockProtectedRole(role, this.actorId(command), connection);
      }
      const updated = (await RoleAssignment.updateOne({ id: existing.id, version: existing.version })
        .set({
          status: 'active',
          sourcePresent: true,
          assignedBy: this.actorId(command),
          assignedAt: now,
          expiresAt: expiresAt ?? null,
          revokedBy: null,
          revokedAt: null,
          suppressedBy: null,
          suppressedAt: null,
          reason: optionalAuthorizationText(command.reason, 1_000),
          version: existing.version + 1,
        })
        .usingConnection(connection)) as RoleAssignmentAttributes | undefined;
      if (updated == null)
        throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The assignment changed.');
      if (isProtectedAdministratorRole(role) && expiresAt !== undefined) {
        await this.assertAdministratorQuorum(role, connection, true);
      }
      return { assignment: updated, changed: true, eventType: 'assignment.reactivated' };
    }

    public async grantAssignment(
      command: GrantAssignmentCommand
    ): Promise<AuthorizationMutationResult<AssignmentAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'assignment.created', 'role-assignment', command.roleKey);
      return this.runMutation(command, auditInput, async connection => {
        const role = await this.findRole(command.roleKey, command.brandId, connection);
        this.assignmentRoleScope(command, role);
        this.requireAssignableRole(role);
        await this.validateAssignmentDelegation(command, role, connection);
        const user = await this.canonicalUser(command.principalId, connection);
        const outcome = await this.grantWithinTransaction(command, role, user.id, connection);
        await this.projectLegacyAuthority(user.id, role, connection);
        const data = this.assignmentSnapshot(outcome.assignment, role);
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent(
            { ...auditInput, eventType: outcome.eventType, targetId: outcome.assignment.id, after: data },
            connection
          );
        return Object.freeze({
          data,
          version: data.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: outcome.changed,
        });
      });
    }

    public async revokeAssignment(
      command: RevokeAssignmentCommand
    ): Promise<AuthorizationMutationResult<AssignmentAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'assignment.revoked', 'role-assignment', command.roleKey);
      return this.runMutation(command, auditInput, async connection => {
        const role = await this.findRole(command.roleKey, command.brandId, connection);
        this.assignmentRoleScope(command, role);
        const user = await this.canonicalUser(command.principalId, connection);
        const assignment = await this.findAssignmentByTuple(
          user.id,
          role.id,
          command.source,
          requiredAuthorizationText(command.sourceKey, 'sourceKey', 128),
          connection
        );
        if (assignment === undefined)
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The assignment was not found.');
        this.assertAssignmentRoleContext(assignment, role);
        if (assignment.version !== positiveVersion(command.expectedVersion))
          throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The assignment changed.');
        if (activeAt(assignment, this.dependencies.now()))
          await this.lockProtectedRole(role, this.actorId(command), connection);
        let updated = assignment;
        let changed = false;
        if (assignment.status !== 'revoked') {
          updated = requireUpdatedRow(
            (await RoleAssignment.updateOne({ id: assignment.id, version: assignment.version })
              .set({
                status: 'revoked',
                revokedBy: this.actorId(command),
                revokedAt: this.dependencies.now(),
                reason: optionalAuthorizationText(command.reason, 1_000),
                version: assignment.version + 1,
              })
              .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
            'The assignment changed since it was read.'
          );
          changed = true;
        }
        await this.assertAdministratorQuorum(role, connection);
        await this.projectLegacyAuthority(user.id, role, connection);
        const data = this.assignmentSnapshot(updated, role);
        const audit = await this.dependencies.audit().createSucceededEvent(
          {
            ...auditInput,
            eventType: changed ? 'assignment.revoked' : 'assignment.noop',
            targetId: assignment.id,
            before: this.assignmentSnapshot(assignment, role),
            after: data,
          },
          connection
        );
        return Object.freeze({
          data,
          version: data.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed,
        });
      });
    }

    private async assignmentById(
      command: AssignmentByIdCommand,
      connection: Sails.Connection
    ): Promise<{ assignment: RoleAssignmentAttributes; role: RoleAttributes }> {
      const assignment = (await RoleAssignment.findOne({ id: command.assignmentId }).usingConnection(connection)) as
        | RoleAssignmentAttributes
        | undefined;
      if (assignment === undefined)
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The assignment was not found.');
      const roleId = associationId(assignment.role);
      const role =
        roleId === undefined
          ? undefined
          : ((await Role.findOne({ id: roleId }).usingConnection(connection)) as RoleAttributes | undefined);
      if (role === undefined)
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The assignment was not found.');
      this.assignmentRoleScope(command, role);
      this.assertAssignmentRoleContext(assignment, role);
      if (assignment.version !== positiveVersion(command.expectedVersion))
        throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'The assignment changed.');
      return { assignment, role };
    }

    public async suppressAssignment(
      command: AssignmentByIdCommand
    ): Promise<AuthorizationMutationResult<AssignmentAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'assignment.suppressed', 'role-assignment', command.assignmentId);
      return this.runMutation(command, auditInput, async connection => {
        const { assignment, role } = await this.assignmentById(command, connection);
        if (assignment.source !== 'external')
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'Only external assignments can be suppressed.'
          );
        if (activeAt(assignment, this.dependencies.now()))
          await this.lockProtectedRole(role, this.actorId(command), connection);
        let updated = assignment;
        let changed = false;
        if (assignment.status !== 'suppressed') {
          updated = requireUpdatedRow(
            (await RoleAssignment.updateOne({ id: assignment.id, version: assignment.version })
              .set({
                status: 'suppressed',
                suppressedBy: this.actorId(command),
                suppressedAt: this.dependencies.now(),
                reason: optionalAuthorizationText(command.reason, 1_000),
                version: assignment.version + 1,
              })
              .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
            'The assignment changed since it was read.'
          );
          changed = true;
        }
        await this.assertAdministratorQuorum(role, connection);
        await this.projectLegacyAuthority(assignment.principalId, role, connection);
        const data = this.assignmentSnapshot(updated, role);
        const audit = await this.dependencies.audit().createSucceededEvent(
          {
            ...auditInput,
            eventType: changed ? 'assignment.suppressed' : 'assignment.noop',
            before: this.assignmentSnapshot(assignment, role),
            after: data,
          },
          connection
        );
        return Object.freeze({
          data,
          version: data.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed,
        });
      });
    }

    public async unsuppressAssignment(
      command: AssignmentByIdCommand
    ): Promise<AuthorizationMutationResult<AssignmentAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'assignment.unsuppressed', 'role-assignment', command.assignmentId);
      return this.runMutation(command, auditInput, async connection => {
        const { assignment, role } = await this.assignmentById(command, connection);
        if (assignment.source !== 'external' || assignment.status !== 'suppressed') {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'The assignment is not externally suppressed.'
          );
        }
        if (assignment.sourcePresent) {
          this.requireAssignableRole(role);
          await this.validateAssignmentDelegation(command, role, connection);
        }
        const now = this.dependencies.now();
        const updated = requireUpdatedRow(
          (await RoleAssignment.updateOne({ id: assignment.id, version: assignment.version })
            .set({
              status: assignment.sourcePresent ? 'active' : 'revoked',
              suppressedBy: null,
              suppressedAt: null,
              revokedBy: assignment.sourcePresent ? null : this.actorId(command),
              revokedAt: assignment.sourcePresent ? null : now,
              reason: optionalAuthorizationText(command.reason, 1_000),
              version: assignment.version + 1,
            })
            .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
          'The assignment changed since it was read.'
        );
        await this.projectLegacyAuthority(assignment.principalId, role, connection);
        const data = this.assignmentSnapshot(updated, role);
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent(
            { ...auditInput, before: this.assignmentSnapshot(assignment, role), after: data },
            connection
          );
        return Object.freeze({
          data,
          version: data.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    public async expireAssignment(
      command: ExpireAssignmentCommand
    ): Promise<AuthorizationMutationResult<AssignmentAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'assignment.expired', 'role-assignment', command.assignmentId);
      return this.runMutation(command, auditInput, async connection => {
        const { assignment, role } = await this.assignmentById(command, connection);
        const now = this.dependencies.now();
        const requestedExpiry = command.expiresAt === undefined ? now : new Date(command.expiresAt);
        if (Number.isNaN(requestedExpiry.getTime())) {
          throw new AuthorizationAdministrationError('authorization.invalid-role', 400, 'Expiry is invalid.');
        }
        const expiresAt = requestedExpiry.toISOString();
        if (activeAt(assignment, now)) await this.lockProtectedRole(role, this.actorId(command), connection);
        const updated = requireUpdatedRow(
          (await RoleAssignment.updateOne({ id: assignment.id, version: assignment.version })
            .set({
              expiresAt,
              version: assignment.version + 1,
              reason: optionalAuthorizationText(command.reason, 1_000),
            })
            .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
          'The assignment changed since it was read.'
        );
        await this.assertAdministratorQuorum(role, connection);
        await this.projectLegacyAuthority(assignment.principalId, role, connection);
        const data = this.assignmentSnapshot(updated, role);
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent(
            { ...auditInput, before: this.assignmentSnapshot(assignment, role), after: data },
            connection
          );
        return Object.freeze({
          data,
          version: data.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    public async replaceExternalAssignments(
      command: ReplaceExternalAssignmentsCommand
    ): Promise<AuthorizationMutationResult<ExternalReplacementResult>> {
      this.requireScope(command, ASSIGNMENT_MANAGE_SCOPE, command.brandId);
      const provider = requiredAuthorizationText(command.provider, 'provider', 64);
      const sourceIdentity = `${provider}::${requiredAuthorizationText(command.sourceKey, 'sourceKey', 64)}`;
      const roleKeys = uniqueStrings(
        command.roleKeys.map(roleKey => requiredAuthorizationText(roleKey, 'roleKey', 128))
      );
      if (roleKeys.length > AUTHORIZATION_ADMIN_MAX_BULK_ROWS) {
        throw new AuthorizationAdministrationError(
          'authorization.bulk-invalid',
          422,
          'External replacement exceeds the role limit.'
        );
      }
      const auditInput = this.auditInput(command, 'assignment.source-replaced', 'role-assignment', command.principalId);
      return this.runMutation(command, auditInput, async connection => {
        const user = await this.canonicalUser(command.principalId, connection);
        const roles: RoleAttributes[] = [];
        for (const roleKey of roleKeys) {
          const role = await this.findRole(roleKey, command.brandId, connection);
          this.assignmentRoleScope(command, role);
          this.requireAssignableRole(role);
          await this.validateAssignmentDelegation(command, role, connection);
          roles.push(role);
        }
        const existing = (await RoleAssignment.find({
          principalType: 'user',
          principalId: user.id,
          source: 'external',
          sourceKey: sourceIdentity,
          branding: command.brandId,
        })
          .limit(AUTHORIZATION_ADMIN_MAX_BULK_ROWS + 1)
          .usingConnection(connection)) as RoleAssignmentAttributes[];
        if (existing.length > AUTHORIZATION_ADMIN_MAX_BULK_ROWS) {
          throw new AuthorizationAdministrationError(
            'authorization.query-bound-exceeded',
            409,
            'External source state exceeds the operation limit.'
          );
        }
        const rolesById = new Map(roles.map(role => [role.id, role]));
        const existingByRole = new Map(existing.map(assignment => [associationId(assignment.role), assignment]));
        const protectedRoles = new Map<string, RoleAttributes>();
        for (const assignment of existing) {
          const roleId = associationId(assignment.role);
          let role = roleId === undefined ? undefined : rolesById.get(roleId);
          if (role === undefined && roleId !== undefined) {
            role = (await Role.findOne({ id: roleId }).usingConnection(connection)) as RoleAttributes | undefined;
          }
          if (role === undefined) {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              404,
              'External assignment state was not found in the active authorization context.'
            );
          }
          this.assignmentRoleScope(command, role);
          this.assertAssignmentRoleContext(assignment, role);
          rolesById.set(role.id, role);
          if (role.protectedKind === 'brand-admin' || role.protectedKind === 'system-admin')
            protectedRoles.set(role.id, role);
        }
        for (const role of roles) {
          if (role.protectedKind === 'brand-admin' || role.protectedKind === 'system-admin')
            protectedRoles.set(role.id, role);
        }
        for (const role of [...protectedRoles.values()].sort((left, right) => left.id.localeCompare(right.id))) {
          await this.lockProtectedRole(role, this.actorId(command), connection);
        }
        let created = 0;
        let reactivated = 0;
        let revoked = 0;
        let suppressedUpdated = 0;
        let noOp = 0;
        for (const role of roles) {
          const current = existingByRole.get(role.id);
          if (current === undefined) {
            await RoleAssignment.create({
              principalType: 'user',
              principalId: user.id,
              role: role.id,
              branding: command.brandId,
              source: 'external',
              sourceKey: sourceIdentity,
              status: 'active',
              sourcePresent: true,
              assignedBy: this.actorId(command),
              assignedAt: this.dependencies.now(),
              reason: optionalAuthorizationText(command.reason, 1_000),
              version: 1,
            })
              .fetch()
              .usingConnection(connection);
            created += 1;
          } else if (current.status === 'suppressed') {
            if (!current.sourcePresent) {
              await RoleAssignment.updateOne({ id: current.id, version: current.version })
                .set({ sourcePresent: true, version: current.version + 1 })
                .usingConnection(connection);
              suppressedUpdated += 1;
            } else noOp += 1;
          } else if (current.status !== 'active' || !current.sourcePresent) {
            await RoleAssignment.updateOne({ id: current.id, version: current.version })
              .set({
                status: 'active',
                sourcePresent: true,
                revokedAt: null,
                revokedBy: null,
                assignedAt: this.dependencies.now(),
                assignedBy: this.actorId(command),
                version: current.version + 1,
              })
              .usingConnection(connection);
            reactivated += 1;
          } else noOp += 1;
        }
        const desiredRoleIds = new Set(roles.map(role => role.id));
        for (const current of existing) {
          const roleId = associationId(current.role);
          if (roleId === undefined || desiredRoleIds.has(roleId)) continue;
          if (current.status === 'suppressed') {
            if (current.sourcePresent) {
              await RoleAssignment.updateOne({ id: current.id, version: current.version })
                .set({ sourcePresent: false, version: current.version + 1 })
                .usingConnection(connection);
              suppressedUpdated += 1;
            } else noOp += 1;
          } else if (current.status !== 'revoked' || current.sourcePresent) {
            await RoleAssignment.updateOne({ id: current.id, version: current.version })
              .set({
                status: 'revoked',
                sourcePresent: false,
                revokedAt: this.dependencies.now(),
                revokedBy: this.actorId(command),
                version: current.version + 1,
              })
              .usingConnection(connection);
            revoked += 1;
          } else noOp += 1;
        }
        for (const role of protectedRoles.values()) await this.assertAdministratorQuorum(role, connection);
        const allRoleIds = uniqueStrings(
          [...roles.map(role => role.id), ...existing.map(row => associationId(row.role) ?? '')].filter(Boolean)
        );
        for (const roleId of allRoleIds) {
          const role =
            rolesById.get(roleId) ??
            ((await Role.findOne({ id: roleId }).usingConnection(connection)) as RoleAttributes | undefined);
          if (role !== undefined) await this.projectLegacyAuthority(user.id, role, connection);
        }
        const data = Object.freeze({ created, reactivated, revoked, suppressedUpdated, noOp });
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent(
            { ...auditInput, targetId: user.id, after: { provider, sourceIdentity, ...data } },
            connection
          );
        return Object.freeze({
          data,
          version: 1,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: created + reactivated + revoked + suppressedUpdated > 0,
        });
      });
    }

    private async bulkPreviewRows(
      command: PreviewBulkAssignmentsCommand,
      rows: readonly BulkAssignmentRow[],
      connection: Sails.Connection
    ): Promise<readonly BulkAssignmentRowPreview[]> {
      const previews: BulkAssignmentRowPreview[] = [];
      const seenTuples = new Set<string>();
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        try {
          const user = await this.canonicalUser(row.principalId, connection);
          const role = await this.findRole(row.roleKey, command.brandId, connection);
          this.assignmentRoleScope(command, role);
          if (row.action === 'grant') {
            this.requireAssignableRole(role);
            await this.validateAssignmentDelegation(command, role, connection);
          }
          const assignment = await this.findAssignmentByTuple(
            user.id,
            role.id,
            'manual',
            row.sourceKey ?? MANUAL_SOURCE_KEY,
            connection
          );
          if (assignment !== undefined) this.assertAssignmentRoleContext(assignment, role);
          const now = this.dependencies.now();
          const desiredExpiry = row.action === 'grant' ? normalizedExpiry(row.expiresAt, now) : undefined;
          if (
            row.expectedVersion !== undefined &&
            (assignment === undefined || assignment.version !== positiveVersion(row.expectedVersion))
          ) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'The assignment version is stale.'
            );
          }
          const currentExpiry =
            assignment?.expiresAt == null ? undefined : new Date(assignment.expiresAt).toISOString();
          const outcome =
            row.action === 'grant'
              ? assignment !== undefined &&
                assignment.status === 'active' &&
                assignment.sourcePresent &&
                currentExpiry === desiredExpiry
                ? 'no-op'
                : 'grant'
              : assignment === undefined || assignment.status === 'revoked'
                ? 'no-op'
                : 'revoke';
          const tupleKey = `${user.id}\u0000${role.id}\u0000${row.sourceKey ?? MANUAL_SOURCE_KEY}`;
          if (seenTuples.has(tupleKey)) {
            throw new AuthorizationAdministrationError(
              'authorization.bulk-invalid',
              422,
              'A manual assignment source tuple may appear only once per batch.'
            );
          }
          seenTuples.add(tupleKey);
          previews.push(
            Object.freeze({
              index,
              row,
              normalizedPrincipalId: user.id,
              assignmentId: assignment?.id,
              assignmentVersion: assignment?.version,
              outcome,
            })
          );
        } catch (error) {
          previews.push(
            Object.freeze({
              index,
              row,
              outcome: 'invalid',
              errorCode: isAuthorizationAdministrationError(error) ? error.code : 'authorization.bulk-invalid',
            })
          );
        }
      }
      return Object.freeze(previews);
    }

    public async previewBulkAssignments(command: PreviewBulkAssignmentsCommand): Promise<BulkAssignmentPreview> {
      this.requireScope(command, ASSIGNMENT_MANAGE_SCOPE, command.brandId);
      const rows = parseBulkAssignmentRows(command.rows, command.format);
      const previews = await this.dependencies.runTransaction(connection =>
        this.bulkPreviewRows(command, rows, connection)
      );
      const grantCount = previews.filter(row => row.outcome === 'grant').length;
      const revokeCount = previews.filter(row => row.outcome === 'revoke').length;
      const noOpCount = previews.filter(row => row.outcome === 'no-op').length;
      const invalidCount = previews.filter(row => row.outcome === 'invalid').length;
      const content = {
        rows: previews.map(row => ({ ...row, row: { ...row.row } })),
        reason: optionalAuthorizationText(command.reason, 1_000),
      };
      return Object.freeze({
        rows: previews,
        grantCount,
        revokeCount,
        noOpCount,
        invalidCount,
        confirmationToken:
          invalidCount === 0 && grantCount + revokeCount > 0
            ? this.issueConfirmation(command, 'assignment-bulk', command.brandId, undefined, content)
            : undefined,
      });
    }

    public async applyBulkAssignments(
      command: ApplyBulkAssignmentsCommand
    ): Promise<AuthorizationMutationResult<BulkMutationResult>> {
      this.requireScope(command, ASSIGNMENT_MANAGE_SCOPE, command.brandId);
      const rows = parseBulkAssignmentRows(command.rows, command.format);
      const previewRows = await this.dependencies.runTransaction(connection =>
        this.bulkPreviewRows(command, rows, connection)
      );
      if (previewRows.some(row => row.outcome === 'invalid')) {
        throw new AuthorizationAdministrationError(
          'authorization.bulk-invalid',
          422,
          'The assignment batch contains invalid rows.'
        );
      }
      const content = {
        rows: previewRows.map(row => ({ ...row, row: { ...row.row } })),
        reason: optionalAuthorizationText(command.reason, 1_000),
      };
      this.verifyConfirmation(
        command,
        command.confirmationToken,
        'assignment-bulk',
        command.brandId,
        undefined,
        content
      );
      const batchId = command.batchId ?? this.dependencies.randomId();
      const auditInput = this.auditInput(
        { ...command, batchId },
        'assignment.batch-applied',
        'role-assignment',
        command.brandId
      );
      return this.runMutation(command, auditInput, async connection => {
        const fresh = await this.bulkPreviewRows(command, rows, connection);
        if (
          authorizationContentHash({
            rows: fresh.map(row => ({ ...row, row: { ...row.row } })),
            reason: optionalAuthorizationText(command.reason, 1_000),
          }) !== authorizationContentHash(content)
        ) {
          throw new AuthorizationAdministrationError(
            'authorization.preview-stale',
            409,
            'The assignment batch changed since preview.'
          );
        }
        let appliedCount = 0;
        let noOpCount = 0;
        for (const rowPreview of fresh) {
          if (rowPreview.outcome === 'no-op') {
            noOpCount += 1;
            continue;
          }
          const row = rowPreview.row;
          const role = await this.findRole(row.roleKey, command.brandId, connection);
          this.assignmentRoleScope(command, role);
          if (rowPreview.outcome === 'grant') {
            this.requireAssignableRole(role);
            const principalId = rowPreview.normalizedPrincipalId;
            if (principalId === undefined) {
              throw new AuthorizationAdministrationError(
                'authorization.preview-stale',
                409,
                'The assignment batch target changed since preview.'
              );
            }
            const grantCommand: GrantAssignmentCommand = {
              ...command,
              principalId,
              roleKey: row.roleKey,
              source: 'manual',
              sourceKey: row.sourceKey ?? MANUAL_SOURCE_KEY,
              expiresAt: row.expiresAt,
              expectedVersion: rowPreview.assignmentVersion,
              batchId,
            };
            const outcome = await this.grantWithinTransaction(grantCommand, role, principalId, connection);
            await this.projectLegacyAuthority(principalId, role, connection);
            await this.dependencies.audit().createSucceededEvent(
              this.auditInput(grantCommand, outcome.eventType, 'role-assignment', outcome.assignment.id, {
                after: this.assignmentSnapshot(outcome.assignment, role),
              }),
              connection
            );
          } else {
            if (rowPreview.assignmentId === undefined) {
              throw new AuthorizationAdministrationError(
                'authorization.preview-stale',
                409,
                'The assignment batch target changed since preview.'
              );
            }
            const assignment = (await RoleAssignment.findOne({ id: rowPreview.assignmentId }).usingConnection(
              connection
            )) as RoleAssignmentAttributes | undefined;
            if (assignment === undefined) {
              throw new AuthorizationAdministrationError(
                'authorization.preview-stale',
                409,
                'The assignment batch target changed since preview.'
              );
            }
            this.assertAssignmentRoleContext(assignment, role);
            if (activeAt(assignment, this.dependencies.now()))
              await this.lockProtectedRole(role, this.actorId(command), connection);
            const updated = requireUpdatedRow(
              (await RoleAssignment.updateOne({ id: assignment.id, version: assignment.version })
                .set({
                  status: 'revoked',
                  revokedBy: this.actorId(command),
                  revokedAt: this.dependencies.now(),
                  reason: optionalAuthorizationText(command.reason, 1_000),
                  version: assignment.version + 1,
                })
                .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
              'The assignment changed since it was read.'
            );
            await this.assertAdministratorQuorum(role, connection);
            await this.projectLegacyAuthority(assignment.principalId, role, connection);
            await this.dependencies.audit().createSucceededEvent(
              this.auditInput({ ...command, batchId }, 'assignment.revoked', 'role-assignment', assignment.id, {
                before: this.assignmentSnapshot(assignment, role),
                after: this.assignmentSnapshot(updated, role),
              }),
              connection
            );
          }
          appliedCount += 1;
        }
        const data: BulkMutationResult = Object.freeze({ appliedCount, noOpCount, rowResults: fresh });
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, after: { appliedCount, noOpCount } }, connection);
        return Object.freeze({
          data,
          version: 1,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          batchId,
          changed: appliedCount > 0,
        });
      });
    }

    public async previewScopeAdoption(
      command: PreviewScopeAdoptionCommand
    ): Promise<AuthorizationPreviewResult<RoleAdministrationSnapshot>> {
      this.requireScope(command, SYSTEM_MANAGE_SCOPE);
      const role = await this.findRole(command.roleKey, undefined);
      const state = await this.loadRoleState(role);
      const desired = normalizedScopeKeys([...state.effectiveScopeKeys, command.scopeKey]);
      return this.scopePreview({ ...command, desiredScopeKeys: desired }, undefined, true);
    }

    public async applyScopeAdoption(
      command: ApplyScopeAdoptionCommand
    ): Promise<AuthorizationMutationResult<RoleAdministrationSnapshot>> {
      this.requireScope(command, SYSTEM_MANAGE_SCOPE);
      const role = await this.findRole(command.roleKey, undefined);
      const state = await this.loadRoleState(role);
      const expectedVersion = positiveVersion(command.expectedVersion);
      const desired = normalizedScopeKeys([...state.effectiveScopeKeys, command.scopeKey]);
      this.verifyConfirmation(command, command.confirmationToken, 'scope-adoption', role.id, expectedVersion, {
        desiredScopeKeys: desired,
        reason: optionalAuthorizationText(command.reason, 1_000),
      });
      const auditInput = this.auditInput(command, 'scope.adopted', 'role', role.id);
      return this.runMutation(command, auditInput, async connection => {
        const fresh = await this.findRole(command.roleKey, undefined, connection);
        requireUnchangedResourceIdentity(role.id, fresh.id);
        const freshState = await this.loadRoleState(fresh, connection);
        const before = this.snapshot(freshState);
        if (before.version !== expectedVersion || fresh.protectedKind !== 'system-admin') {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The system role changed since preview.'
          );
        }
        const validation = this.dependencies.getRegistry().validateScopeKeys(desired);
        if (validation.inactiveScopeKeys.length || validation.missingScopeKeys.length)
          throw new AuthorizationAdministrationError('authorization.invalid-scope', 400, 'The scope is unavailable.');
        const overrides = normalizeRoleScopeOverrides({
          baseScopeKeys: freshState.baseScopeKeys,
          desiredScopeKeys: desired,
        });
        await this.replaceOverrides(fresh.id, overrides, this.actorId(command), command.reason, connection);
        const updated = (await Role.updateOne({ id: fresh.id, version: expectedVersion })
          .set({ version: expectedVersion + 1, updatedBy: this.actorId(command) })
          .usingConnection(connection)) as RoleAttributes;
        const after = this.snapshot(await this.loadRoleState(updated, connection));
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, before, after, targetId: command.scopeKey }, connection);
        return Object.freeze({
          data: after,
          version: after.version,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    private async loadBulkTemplateUpgradeRoles(
      command: PreviewBulkTemplateUpgradeCommand,
      template: RoleTemplateAttributes,
      nextRevision: RoleTemplateRevisionAttributes,
      selected: readonly PreviewBulkTemplateUpgradeCommand['roles'][number][],
      connection: Sails.Connection,
      reportConflicts = false
    ): Promise<LoadedBulkTemplateUpgradeSelection> {
      const rows: LoadedBulkTemplateUpgradeRole[] = [];
      const previews: (BulkTemplateUpgradeRolePreview | BulkTemplateUpgradeRoleConflict)[] = [];
      for (const selectedRole of selected) {
        try {
          const role = (await Role.findOne({ id: selectedRole.roleId, contextType: 'brand' }).usingConnection(
            connection
          )) as RoleAttributes | undefined;
          if (role === undefined || associationId(role.template) !== template.id) {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              404,
              'A selected role was not found.'
            );
          }
          if (role.version !== selectedRole.expectedVersion) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'A selected role changed since it was read.'
            );
          }
          const brandId = associationId(role.branding);
          if (brandId === undefined || role.templateRevision === undefined) {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              404,
              'A selected role was not found.'
            );
          }
          if (command.targetRevision < role.templateRevision) {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-role',
              400,
              'A role template upgrade cannot select an older revision.'
            );
          }
          const state = await this.loadRoleState(role, connection);
          const upgrade = previewRoleTemplateUpgrade({
            currentBaseScopeKeys: state.baseScopeKeys,
            nextBaseScopeKeys: normalizedScopeKeys(nextRevision.scopeKeys),
            overrides: state.overrides,
            registry: this.dependencies.getRegistry(),
          });
          this.validateScopeSet(
            role,
            upgrade.nextEffectiveScopeKeys,
            command.actor,
            this.delegableScopeKeysForBrand(command.actor, brandId)
          );
          const overridesChanged =
            authorizationContentHash(state.overrides) !== authorizationContentHash(upgrade.nextOverrides);
          const preview = Object.freeze({
            roleId: role.id,
            roleKey: roleIdentity(role) as BulkTemplateUpgradeRolePreview['roleKey'],
            brandId,
            expectedVersion: selectedRole.expectedVersion,
            currentRevision: role.templateRevision,
            targetRevision: command.targetRevision,
            addedScopeKeys: upgrade.addedScopeKeys,
            removedScopeKeys: upgrade.removedScopeKeys,
            changed: role.templateRevision !== command.targetRevision || overridesChanged,
          });
          rows.push(
            Object.freeze({
              role,
              state,
              nextOverrides: upgrade.nextOverrides,
              preview,
            })
          );
          previews.push(preview);
        } catch (error) {
          if (!reportConflicts || !isAuthorizationAdministrationError(error)) throw error;
          previews.push(
            Object.freeze({
              roleId: selectedRole.roleId,
              expectedVersion: selectedRole.expectedVersion,
              targetRevision: command.targetRevision,
              conflict: Object.freeze({ code: error.code, status: error.status }),
            })
          );
        }
      }
      return Object.freeze({ loaded: Object.freeze(rows), previews: Object.freeze(previews) });
    }

    private bulkTemplateUpgradeContent(
      command: PreviewBulkTemplateUpgradeCommand,
      selected: readonly PreviewBulkTemplateUpgradeCommand['roles'][number][]
    ): Readonly<Record<string, unknown>> {
      return Object.freeze({
        roles: selected,
        targetRevision: command.targetRevision,
        reason: optionalAuthorizationText(command.reason, 1_000),
      });
    }

    public async previewBulkTemplateUpgrade(
      command: PreviewBulkTemplateUpgradeCommand
    ): Promise<BulkTemplateUpgradePreview> {
      this.requireScope(command, SYSTEM_MANAGE_SCOPE);
      const selected = normalizedSelectedRoles(command.roles);
      const template = await this.findTemplate(command.templateKey);
      const selection = await this.dependencies.runTransaction(async connection => {
        const next = await this.findRevision(template.id, command.targetRevision, connection);
        return this.loadBulkTemplateUpgradeRoles(command, template, next, selected, connection, true);
      });
      const changed = selection.loaded.some(role => role.preview.changed);
      const hasConflicts = selection.previews.some(role => 'conflict' in role);
      return Object.freeze({
        operation: 'template-bulk-upgrade' as const,
        templateKey: template.key,
        targetRevision: command.targetRevision,
        roles: selection.previews,
        warnings: Object.freeze([]),
        fatalErrors: hasConflicts ? Object.freeze(['selected-role-conflict']) : Object.freeze([]),
        ...(changed && !hasConflicts
          ? {
              confirmationToken: this.issueConfirmation(
                command,
                'template-bulk-upgrade',
                template.id,
                undefined,
                this.bulkTemplateUpgradeContent(command, selected)
              ),
            }
          : {}),
      });
    }

    public async applyBulkTemplateUpgrade(
      command: ApplyBulkTemplateUpgradeCommand
    ): Promise<AuthorizationMutationResult<Readonly<Record<string, unknown>>>> {
      const batchId = command.batchId ?? this.dependencies.randomId();
      const auditInput = this.auditInput(
        { ...command, batchId },
        'role.template-upgrade-batch-applied',
        'role-template',
        command.templateKey
      );
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, SYSTEM_MANAGE_SCOPE);
        const selected = normalizedSelectedRoles(command.roles);
        const content = this.bulkTemplateUpgradeContent(command, selected);
        const freshTemplate = await this.findTemplate(command.templateKey, connection);
        this.verifyConfirmation(
          command,
          command.confirmationToken,
          'template-bulk-upgrade',
          freshTemplate.id,
          undefined,
          content
        );
        const next = await this.findRevision(freshTemplate.id, command.targetRevision, connection);
        const selection = await this.loadBulkTemplateUpgradeRoles(command, freshTemplate, next, selected, connection);
        let appliedCount = 0;
        let noOpCount = 0;
        for (const selectedRole of selection.loaded) {
          if (!selectedRole.preview.changed) {
            noOpCount += 1;
            continue;
          }
          const role = selectedRole.role;
          const state = selectedRole.state;
          await this.replaceOverrides(
            role.id,
            selectedRole.nextOverrides,
            this.actorId(command),
            command.reason,
            connection
          );
          const updated = requireUpdatedRow(
            (await Role.updateOne({ id: role.id, version: selectedRole.preview.expectedVersion })
              .set({
                templateRevision: command.targetRevision,
                version: selectedRole.preview.expectedVersion + 1,
                updatedBy: this.actorId(command),
              })
              .usingConnection(connection)) as RoleAttributes | undefined,
            'A selected role changed since preview.'
          );
          await this.dependencies.audit().createSucceededEvent(
            this.auditInput(
              { ...command, brandId: associationId(role.branding), batchId },
              'role.template-upgraded',
              'role',
              role.id,
              {
                before: this.snapshot(state),
                after: this.snapshot(await this.loadRoleState(updated, connection)),
              }
            ),
            connection
          );
          appliedCount += 1;
        }
        const data = Object.freeze({ appliedCount, noOpCount, targetRevision: command.targetRevision });
        const audit = await this.dependencies
          .audit()
          .createSucceededEvent({ ...auditInput, targetId: freshTemplate.id, after: data }, connection);
        return Object.freeze({
          data,
          version: 1,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          batchId,
          changed: appliedCount > 0,
        });
      });
    }
  }
}

declare global {
  let RoleAdministrationService: Services.RoleAdministrationService;
}
