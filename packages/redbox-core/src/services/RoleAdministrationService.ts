import { authorizationTelemetry, authorizationLabels, observeAuthorization } from '../authorization/observability';
import { createHash, randomUUID } from 'node:crypto';
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
  normalizeLinkUserAccountsRequest,
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
  type ApplyUserRoleSetCommand,
  type UserRoleSetResult,
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
  type ExternalAssignmentExpectedState,
  type ExternalReplacementResult,
  type GrantAssignmentCommand,
  type LinkUserAccountsCommand,
  type LinkAccountsPreview,
  type PreviewBulkAssignmentsCommand,
  type PreviewBulkTemplateUpgradeCommand,
  type PreviewLinkAccountsCommand,
  type PreviewAuthorizationConfigurationImportCommand,
  type PreviewRoleLifecycleCommand,
  type PreviewRoleScopesCommand,
  type PreviewRoleTemplateUpgradeCommand,
  type PreviewScopeAdoptionCommand,
  type PreviewTemplateRevisionCommand,
  type PublishTemplateRevisionCommand,
  type ReplaceExternalAssignmentsCommand,
  type RetryLinkOperationCommand,
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
  type SetUserAccessCommand,
  type UpdateRoleCommand,
  type UserAccessResult,
  type UserAccountLinkResult,
} from '../authorization';
import type { AuthorizationAuditEventInput } from './AuthorizationAuditService';
import { isTrustedAuthorizationContextInternal } from './AuthorizationActorIssuer';
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
/** AUTH-TXN-001 bounded idempotent retry budget for a durable link operation. */
const LINK_OPERATION_MAX_ATTEMPTS = 5;
/**
 * Named bounded recovery-process identity for restart-safe link replay. The
 * replay worker acts as its own system-process principal (authMethod
 * internal); it never reuses the stored preview actor (`proofActorId`), which
 * remains durable proof evidence only. The stored proof actor is still bound
 * by the completed-proof gate on interactive resume paths.
 */
export const LINK_RECOVERY_PROCESS_ACTOR_ID = 'system-recovery:link-replay';

export interface LinkOperationState {
  readonly operationId: string;
  readonly brandId: string;
  readonly primaryUserId: string;
  readonly secondaryUserId: string;
  readonly primaryUsername: string;
  readonly secondaryUsername: string;
  readonly secondaryEmail: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly recordsPending: boolean;
  readonly recordsRewritten: number;
  readonly rolesAdopted: number;
  readonly rolesRetired: number;
  readonly attemptCount: number;
  /**
   * AUTH-TXN-001 durable plan + proof. `recordOids` is the bounded complete
   * record plan discovered BEFORE any authority mutation; `proofHash` is the
   * SHA-256 of the pair-bound confirmation token; `assignmentSnapshot` is the
   * frozen authoritative snapshot bound into that token;
   * `primaryExpectedVersion`/`secondaryExpectedVersion` are the bound account
   * versions; `proofActorId` is the preview actor identity. Retry consumes
   * ONLY this stored plan/proof.
   */
  readonly recordOids: readonly string[];
  readonly recordsCompletedOids: readonly string[];
  readonly primaryExpectedVersion?: number;
  readonly secondaryExpectedVersion?: number;
  readonly proofHash?: string;
  readonly assignmentSnapshot?: readonly string[];
  readonly proofActorId?: string;
}

/**
 * AUTH-TXN-001 reduced-runtime mirror. Production persists every transition
 * to the `UserLinkOperation` model (Mongo); when the model is unavailable
 * (unit fakes) this process-local mirror preserves read-your-write
 * transitions. It is NOT durability proof — only the shipped model +
 * migration is.
 */
const linkOperationFallback = new Map<string, LinkOperationState>();

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

/**
 * AUTH-P5-001 module-private verifier. Server-issued provenance lives in the
 * internal `AuthorizationActorIssuer` module closure; verification goes
 * through its guarded predicate. The predicate is NOT injectable: callers
 * cannot supply `() => true`. Published consumers cannot deep-import the
 * issuer module (package `exports` exposes only the entry point and
 * package.json), so only genuine server code paths that hold a
 * server-issued context pass.
 */
function defaultIsTrustedActor(actor: unknown): boolean {
  try {
    return isTrustedAuthorizationContextInternal(actor);
  } catch {
    return false;
  }
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

function optionalRoleTemplateRevision(value: unknown): number | undefined {
  return value === undefined || value === null || value === 0 ? undefined : (value as number);
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
      'applyUserRoleSet',
      'linkUserAccounts',
      'previewLinkAccounts',
      'getLinkOperation',
      'retryLinkOperation',
      'recoverIncompleteLinkOperations',
      'replayIncompleteLinkOperations',
      'revokeAssignment',
      'setUserAccess',
      'suppressAssignment',
      'unsuppressAssignment',
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

    /**
     * AUTH-ACTOR-001: fail-closed trusted-actor validation with non-forgeable
     * provenance. The writer only trusts server-issued contexts recognized by
     * the internal `AuthorizationActorIssuer` guarded predicate
     * (module-private WeakSet capability populated by the genuine
     * `AuthorizationService` resolvers and the internal system-process
     * factory).
     * `Object.isFrozen` or public `freezeAuthorizationContext` output alone is
     * INSUFFICIENT — a caller that manually freezes a forged object (or calls
     * the public freezer) is rejected because it lacks the capability. Scope
     * gates additionally re-check `scopeProvenance` so claimed
     * `effectiveScopeKeys` cannot mint authority. Canonical authMethods:
     * `session`, `bearer`, `internal`.
     */
    private isTrustedActor(actor: unknown): boolean {
      try {
        return defaultIsTrustedActor(actor);
      } catch {
        return false;
      }
    }

    private actorId(command: AuthorizationAdministrationCommand): string {
      const actor: unknown = command.actor;
      if (actor === undefined || actor === null || !this.isTrustedActor(actor)) {
        throw new AuthorizationAdministrationError(
          'authorization.authentication-required',
          401,
          'An active authoritative actor context is required.'
        );
      }
      const principal: unknown =
        typeof actor === 'object' && actor !== null && 'principal' in actor ? actor.principal : undefined;
      const userIdRaw: unknown =
        typeof principal === 'object' && principal !== null && 'userId' in principal ? principal.userId : undefined;
      const operationIdRaw: unknown =
        typeof principal === 'object' && principal !== null && 'operationId' in principal
          ? principal.operationId
          : undefined;
      const actorId =
        (typeof userIdRaw === 'string' ? userIdRaw : undefined) ??
        (typeof operationIdRaw === 'string' ? operationIdRaw : undefined);
      const active =
        typeof principal === 'object' && principal !== null && 'active' in principal && principal.active === true;
      const categoryRaw: unknown =
        typeof principal === 'object' && principal !== null && 'category' in principal ? principal.category : undefined;
      const category = typeof categoryRaw === 'string' ? categoryRaw : '';
      const authMethodRaw: unknown =
        typeof principal === 'object' && principal !== null && 'authMethod' in principal
          ? principal.authMethod
          : undefined;
      const authMethod = typeof authMethodRaw === 'string' ? authMethodRaw : '';
      if (
        !active ||
        actorId === undefined ||
        actorId.trim().length === 0 ||
        category === 'anonymous' ||
        category.length === 0 ||
        !['session', 'bearer', 'internal'].includes(authMethod)
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.authentication-required',
          401,
          'An active authoritative actor context is required.'
        );
      }
      if (!Array.isArray(command.actor.effectiveScopeKeys)) {
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

    /**
     * Scope gate with provenance binding: the claimed `effectiveScopeKeys`
     * entry is insufficient unless `scopeProvenance` carries the scope (or the
     * actor is a server-issued `internal` system-process whose scopes were
     * bounded at mint time).
     */
    private hasProvenScope(actor: AuthorizationAdministrationCommand['actor'], scopeKey: ScopeKey): boolean {
      if (!actor.effectiveScopeKeys.includes(scopeKey)) return false;
      if (actor.principal.authMethod === 'internal') return true;
      return actor.scopeProvenance.some(provenance => provenance.scopeKey === scopeKey);
    }

    private requireScope(command: AuthorizationAdministrationCommand, scopeKey: ScopeKey, brandId?: string): void {
      this.actorId(command);
      if (brandId !== undefined && command.actor.contextType === 'brand' && command.actor.brand?.id !== brandId) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target was not found.');
      }
      if (!this.hasProvenScope(command.actor, scopeKey)) {
        throw new AuthorizationAdministrationError(
          'authorization.scope-denied',
          403,
          'The actor lacks the required authorization scope.'
        );
      }
    }

    /**
     * P5-G6 scope contract: legacy user-management routes declare
     * `user.manage` / `user.account-link.manage` while the guarded writer is
     * authoritative for `authorization.assignment.manage`. To preserve
     * custom-role compatibility, the writer accepts either the canonical
     * assignment scope or the legacy user-management scope. Brand-admin
     * holds both; legacy custom roles keep working via the legacy scope.
     */
    private requireAssignmentOrLegacyScope(
      command: AuthorizationAdministrationCommand,
      brandId: string,
      legacyScope: ScopeKey
    ): void {
      this.actorId(command);
      if (command.actor.contextType === 'brand' && command.actor.brand?.id !== brandId) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target was not found.');
      }
      if (this.hasProvenScope(command.actor, ASSIGNMENT_MANAGE_SCOPE)) return;
      if (this.hasProvenScope(command.actor, legacyScope)) return;
      throw new AuthorizationAdministrationError(
        'authorization.scope-denied',
        403,
        'The actor lacks the required authorization scope.'
      );
    }

    private auditInput(
      command: AuthorizationAdministrationCommand,
      eventType: AuthorizationAuditEventType,
      targetType: AuthorizationAuditEventInput['targetType'],
      targetId?: string,
      extra: Partial<AuthorizationAuditEventInput> = {}
    ): AuthorizationAuditEventInput {
      // AUTH-ACTOR-001: fail closed when the trusted actor is omitted instead
      // of throwing a TypeError that bypasses the stable 401 contract.
      // Requires the non-forgeable server-issued capability, not mere freezing.
      const commandActor: unknown = command.actor;
      const principal: unknown =
        typeof commandActor === 'object' && commandActor !== null && 'principal' in commandActor
          ? commandActor.principal
          : undefined;
      const authMethod: unknown =
        typeof principal === 'object' && principal !== null && 'authMethod' in principal
          ? principal.authMethod
          : undefined;
      if (principal === undefined || principal === null || !this.isTrustedActor(commandActor)) {
        throw new AuthorizationAdministrationError(
          'authorization.authentication-required',
          401,
          'An active authoritative actor context is required.'
        );
      }
      return {
        eventType,
        actorType: authMethod === 'internal' ? 'system-process' : 'user',
        actorId: this.actorId(command),
        authMethod: authMethod === 'bearer' ? 'legacy-bearer' : authMethod === 'internal' ? 'internal' : 'session',
        brandId: command.brandId,
        targetType,
        targetId,
        requestId: requiredAuthorizationText(command.requestId, 'requestId', 128),
        batchId: optionalAuthorizationText(command.batchId, 128),
        reason: optionalAuthorizationText(command.reason, 1_000),
        ...extra,
      };
    }

    private normalizeMutationError(error: unknown): unknown {
      return isWriteConflictError(error) || isUniqueConstraintError(error)
        ? new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'Authorization state changed concurrently.'
          )
        : error;
    }

    private async recordDeniedAttempt(audit: AuthorizationAuditEventInput, error: unknown): Promise<unknown> {
      const normalizedError = this.normalizeMutationError(error);
      await this.dependencies.audit().recordAttempt(
        {
          ...audit,
          ...(isAuthorizationAdministrationError(normalizedError) ? { reasonCode: normalizedError.code } : {}),
        },
        isAuthorizationAdministrationError(normalizedError) ? 'denied' : 'failed'
      );
      return normalizedError;
    }

    private async runMutation<T>(
      command: AuthorizationAdministrationCommand,
      audit: AuthorizationAuditEventInput,
      work: (connection: Sails.Connection) => Promise<T>
    ): Promise<T> {
      try {
        return await this.dependencies.runTransaction(work);
      } catch (error) {
        throw await this.recordDeniedAttempt(audit, error);
      }
    }

    /**
     * Audited wrapper for mutation pre-phases that must run before the required
     * transaction opens (scope checks, payload parsing, preview hashing, and
     * confirmation verification). Malformed, tampered, replayed, and
     * scope-denied attempts are recorded atomically instead of escaping
     * without a denied-attempt audit row.
     */
    private async runAuditedPrePhase<T>(audit: AuthorizationAuditEventInput, work: () => Promise<T>): Promise<T> {
      try {
        return await work();
      } catch (error) {
        throw await this.recordDeniedAttempt(audit, error);
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
      const templateRevision = optionalRoleTemplateRevision(role.templateRevision);
      let template: RoleTemplateAttributes | undefined;
      let revision: RoleTemplateRevisionAttributes | undefined;
      let baseScopeKeys: readonly ScopeKey[] = [];
      if (templateId !== undefined && templateRevision !== undefined) {
        let templateQuery = RoleTemplate.findOne({ id: templateId });
        if (connection !== undefined) templateQuery = templateQuery.usingConnection(connection);
        template = (await templateQuery) as RoleTemplateAttributes | undefined;
        revision = await this.findRevision(templateId, templateRevision, connection);
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
      const templateRevision = optionalRoleTemplateRevision(role.templateRevision);
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
        ...(templateRevision === undefined ? {} : { templateRevision }),
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
      const templateRevision = optionalRoleTemplateRevision(role.templateRevision);
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
        ...(templateRevision === undefined ? {} : { templateRevision }),
        version: positiveVersion(role.version ?? 1, 'role.version'),
      });
    }

    public async listRoles(query: RoleCatalogQuery): Promise<RoleCatalogPage> {
      this.requireScope(
        { actor: query.actor, brandId: query.brandId, requestId: query.requestId ?? 'authorization-role-catalog-read' },
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
      const includeSystemAssignments = this.hasProvenScope(query.actor, SYSTEM_MANAGE_SCOPE);

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

    /**
     * P5-G9 risk-broadening classification (spec 5.3): scope previews must
     * return explicit warnings when added scopes broaden privilege. Ranks
     * read < write < admin < system; emits one `risk-broadening:<risk>` per
     * distinct added risk plus `risk-level-increased:<from>-><to>` when the
     * maximum added risk exceeds the current maximum.
     */
    private scopeRiskBroadeningWarnings(current: readonly ScopeKey[], added: readonly ScopeKey[]): readonly string[] {
      if (added.length === 0) return Object.freeze([] as string[]);
      const order = ['read', 'write', 'admin', 'system'] as const;
      const rank = (risk: unknown): number => {
        const index = (order as readonly unknown[]).indexOf(risk);
        return index >= 0 ? index : -1;
      };
      const registry = this.dependencies.getRegistry();
      const currentRisks: string[] = [];
      for (const key of current) {
        const risk = registry.get(key)?.risk as unknown;
        if (typeof risk === 'string' && rank(risk) >= 0) currentRisks.push(risk);
      }
      const addedRisks: string[] = [];
      for (const key of added) {
        const risk = registry.get(key)?.risk as unknown;
        if (typeof risk === 'string' && rank(risk) >= 0) addedRisks.push(risk);
      }
      const distinctAdded = [...new Set(addedRisks)].sort((left, right) => rank(left) - rank(right));
      const warnings: string[] = distinctAdded.map(risk => `risk-broadening:${String(risk)}`);
      const currentMax = currentRisks.length > 0 ? Math.max(...currentRisks.map(rank)) : -1;
      const addedMax = addedRisks.length > 0 ? Math.max(...addedRisks.map(rank)) : -1;
      if (addedMax > currentMax && addedMax >= 0) {
        const from = currentMax >= 0 ? String(order[currentMax]) : 'none';
        warnings.push(`risk-level-increased:${from}->${String(order[addedMax])}`);
      }
      return Object.freeze(warnings);
    }

    private async scopePreview(
      command: PreviewRoleScopesCommand,
      connection?: Sails.Connection,
      adoptionScopeKey?: ScopeKey
    ): Promise<AuthorizationPreviewResult<RoleAdministrationSnapshot>> {
      const allowSystemAdoption = adoptionScopeKey !== undefined;
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
      const content =
        adoptionScopeKey === undefined
          ? {
              desiredScopeKeys: desired,
              reason: optionalAuthorizationText(command.reason, 1_000),
              affectedAssignments: activeAssignments.references,
              dependencies,
            }
          : this.scopeAdoptionConfirmationContent(
              adoptionScopeKey,
              desired,
              command.reason,
              activeAssignments.references,
              dependencies
            );
      const changed = addedScopeKeys.length > 0 || removedScopeKeys.length > 0;
      const fatalErrors =
        dependencies.scanIncomplete || activeAssignments.incomplete
          ? Object.freeze(['assignment-impact-limit'])
          : Object.freeze<string[]>([]);
      const warnings = this.scopeRiskBroadeningWarnings(current.effectiveScopeKeys, addedScopeKeys);
      return Object.freeze({
        operation: allowSystemAdoption ? 'scope-adoption' : 'role-scopes',
        current,
        proposed,
        addedScopeKeys,
        removedScopeKeys,
        affectedAssignments: activeAssignments.references,
        dependencies,
        warnings,
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
        if (!this.hasProvenScope(command.actor, SYSTEM_MANAGE_SCOPE)) {
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
        observeAuthorization(() =>
          authorizationTelemetry.emit('quorum_rejections', 1, {
            ...authorizationLabels(),
            source: role.protectedKind,
            reason: 'authorization.query-bound-exceeded',
          })
        );
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
        observeAuthorization(() =>
          authorizationTelemetry.emit('quorum_rejections', 1, {
            ...authorizationLabels(),
            source: role.protectedKind,
            reason:
              role.protectedKind === 'system-admin'
                ? 'authorization.last-system-admin'
                : 'authorization.last-brand-admin',
          })
        );
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
      const isGrantNoOp = existing.status === 'active' && existing.sourcePresent && existingExpiry === expiresAt;
      if (isGrantNoOp) {
        if (isProtectedAdministratorRole(role) && expiresAt !== undefined) {
          await this.assertAdministratorQuorum(role, connection, true);
        }
        return { assignment: existing, changed: false, eventType: 'assignment.noop' };
      }
      if (command.expectedVersion === undefined) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'An expectedVersion is required to modify an existing assignment.'
        );
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

    /**
     * P5-G4 atomic legacy role-set writer. Applies every grant/removal for one
     * principal+brand in a single required transaction with one audit event,
     * one CAS boundary, and one quorum evaluation. Any mid-sequence failure
     * rolls the whole set back with a denied-attempt audit and no partial
     * success counters.
     */
    public async applyUserRoleSet(
      command: ApplyUserRoleSetCommand
    ): Promise<AuthorizationMutationResult<UserRoleSetResult>> {
      const auditInput = this.auditInput(
        command,
        'assignment.role-set-applied',
        'role-assignment',
        command.principalId
      );
      return this.runMutation(command, auditInput, async connection => {
        const brandId = requiredAuthorizationText(command.brandId, 'brandId', 256);
        this.requireAssignmentOrLegacyScope(command, brandId, 'user.manage' as ScopeKey);
        const principalId = requiredAuthorizationText(command.principalId, 'principalId', 256);
        const user = await this.canonicalUser(principalId, connection);
        // AUTH-P5-002 atomic user-row CAS: when the caller pins the observed
        // user version, re-pin and bump it in THIS required transaction —
        // the same commit as the assignment writes below. The predicate
        // carries legacy null-healing for version 1; a zero-row result is a
        // lost race (409), never a silent interleave with a concurrent
        // disable/link/profile mutation.
        if (command.userExpectedVersion !== undefined) {
          const rawUserVersion: unknown = (user as UserAttributes).loginDisabledVersion;
          const observedUserVersion =
            typeof rawUserVersion === 'number' && Number.isSafeInteger(rawUserVersion) ? (rawUserVersion as number) : 1;
          const expectedUserVersion = positiveVersion(command.userExpectedVersion);
          if (observedUserVersion !== expectedUserVersion) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'The user changed since it was read.'
            );
          }
          const userCasCriteria =
            observedUserVersion === 1
              ? { id: user.id, or: [{ loginDisabledVersion: 1 }, { loginDisabledVersion: null }] }
              : { id: user.id, loginDisabledVersion: observedUserVersion };
          requireUpdatedRow(
            (await User.updateOne(userCasCriteria)
              .set({ loginDisabledVersion: observedUserVersion + 1 })
              .usingConnection(connection)) as UserAttributes | undefined,
            'The user changed since it was read.'
          );
        }
        const grants = [...(command.grants ?? [])];
        const removals = [...(command.removals ?? [])];
        if (grants.length + removals.length === 0) {
          throw new AuthorizationAdministrationError(
            'authorization.bulk-invalid',
            422,
            'The role set must contain at least one grant or removal.'
          );
        }
        if (grants.length + removals.length > AUTHORIZATION_ADMIN_MAX_BULK_ROWS) {
          throw new AuthorizationAdministrationError(
            'authorization.bulk-invalid',
            422,
            'The role set exceeds the bounded operation limit.'
          );
        }
        const grantRoles = new Map<
          string,
          { readonly role: RoleAttributes; readonly grant: ApplyUserRoleSetCommand['grants'][number] }
        >();
        for (const grant of grants) {
          const role = await this.findRole(grant.roleKey, brandId, connection);
          this.assignmentRoleScope(command, role);
          this.requireAssignableRole(role);
          await this.validateAssignmentDelegation(command, role, connection);
          if (grantRoles.has(role.id)) {
            throw new AuthorizationAdministrationError(
              'authorization.bulk-invalid',
              422,
              'A role may appear only once per role-set batch.'
            );
          }
          grantRoles.set(role.id, { role, grant });
        }
        const removalGroups = new Map<
          string,
          {
            readonly role: RoleAttributes;
            readonly removals: ApplyUserRoleSetCommand['removals'][number][];
          }
        >();
        const removalTupleKey = (removal: ApplyUserRoleSetCommand['removals'][number]): string => {
          if (removal.assignmentId !== undefined) {
            return `id:${requiredAuthorizationText(removal.assignmentId, 'assignmentId', 256)}`;
          }
          const source = String(removal.source ?? MANUAL_SOURCE_KEY);
          const sourceKey = requiredAuthorizationText(removal.sourceKey ?? MANUAL_SOURCE_KEY, 'sourceKey', 128);
          return `tuple:${source}::${sourceKey}`;
        };
        for (const removal of removals) {
          const role = await this.findRole(removal.roleKey, brandId, connection);
          this.assignmentRoleScope(command, role);
          const key = role.id;
          if (grantRoles.has(key)) {
            throw new AuthorizationAdministrationError(
              'authorization.bulk-invalid',
              422,
              'A role may appear only once per role-set batch.'
            );
          }
          // Legacy compatibility: one role may carry several sourced tuples
          // (manual + external, distinct sourceKeys, etc.). Aggregate removals
          // by role while preserving every exact source tuple. Only an exact
          // duplicate tuple target is rejected.
          const tupleKey = removalTupleKey(removal);
          const existing = removalGroups.get(key);
          if (existing !== undefined) {
            const seen = new Set(existing.removals.map(entry => removalTupleKey(entry)));
            if (seen.has(tupleKey)) {
              throw new AuthorizationAdministrationError(
                'authorization.bulk-invalid',
                422,
                'A role source tuple may appear only once per role-set batch.'
              );
            }
            removalGroups.set(key, { role: existing.role, removals: [...existing.removals, removal] });
          } else {
            removalGroups.set(key, { role, removals: [removal] });
          }
          // Validate the expectedVersion shape eagerly so malformed batches
          // fail before any write.
          positiveVersion(removal.expectedVersion);
        }
        const removalRoles = removalGroups;
        const affectedRoles = new Map<string, RoleAttributes>();
        for (const entry of grantRoles.values()) affectedRoles.set(entry.role.id, entry.role);
        for (const entry of removalRoles.values()) affectedRoles.set(entry.role.id, entry.role);
        for (const role of [...affectedRoles.values()].sort((left, right) => left.id.localeCompare(right.id))) {
          if (isProtectedAdministratorRole(role)) {
            await this.lockProtectedRole(role, this.actorId(command), connection);
          }
        }
        let granted = 0;
        let revoked = 0;
        let suppressed = 0;
        let noOp = 0;
        for (const entry of [...grantRoles.values()].sort((left, right) => left.role.id.localeCompare(right.role.id))) {
          const { role, grant } = entry;
          const grantCommand: GrantAssignmentCommand = {
            ...command,
            principalId: user.id,
            roleKey: String(role.key ?? role.name),
            source: 'manual',
            sourceKey: grant.sourceKey ?? MANUAL_SOURCE_KEY,
            ...(grant.expiresAt === undefined ? {} : { expiresAt: grant.expiresAt }),
            ...(grant.expectedVersion === undefined ? {} : { expectedVersion: grant.expectedVersion }),
          };
          const outcome = await this.grantWithinTransaction(grantCommand, role, user.id, connection);
          if (outcome.changed) granted += 1;
          else noOp += 1;
          await this.projectLegacyAuthority(user.id, role, connection);
        }
        const flattenedRemovals: {
          readonly role: RoleAttributes;
          readonly removal: ApplyUserRoleSetCommand['removals'][number];
        }[] = [];
        for (const group of removalRoles.values()) {
          for (const removal of group.removals) {
            flattenedRemovals.push({ role: group.role, removal });
          }
        }
        flattenedRemovals.sort((left, right) => {
          const roleOrder = left.role.id.localeCompare(right.role.id);
          if (roleOrder !== 0) return roleOrder;
          const leftKey =
            left.removal.assignmentId !== undefined
              ? `id:${String(left.removal.assignmentId)}`
              : `tuple:${String(left.removal.source ?? MANUAL_SOURCE_KEY)}::${String(left.removal.sourceKey ?? MANUAL_SOURCE_KEY)}`;
          const rightKey =
            right.removal.assignmentId !== undefined
              ? `id:${String(right.removal.assignmentId)}`
              : `tuple:${String(right.removal.source ?? MANUAL_SOURCE_KEY)}::${String(right.removal.sourceKey ?? MANUAL_SOURCE_KEY)}`;
          return leftKey.localeCompare(rightKey);
        });
        for (const entry of flattenedRemovals) {
          const { role, removal } = entry;
          const expectedVersion = positiveVersion(removal.expectedVersion);
          if (removal.assignmentId !== undefined) {
            const assignment = (await RoleAssignment.findOne({ id: removal.assignmentId }).usingConnection(
              connection
            )) as RoleAssignmentAttributes | undefined;
            if (assignment === undefined) {
              throw new AuthorizationAdministrationError(
                'authorization.not-found',
                404,
                'The assignment was not found.'
              );
            }
            this.assertAssignmentRoleContext(assignment, role);
            if (assignment.version !== expectedVersion) {
              throw new AuthorizationAdministrationError(
                'authorization.version-conflict',
                409,
                'The assignment changed.'
              );
            }
            if (String(assignment.source ?? '') === 'external') {
              if (assignment.status !== 'suppressed') {
                requireUpdatedRow(
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
                suppressed += 1;
              } else {
                noOp += 1;
              }
            } else {
              if (assignment.status !== 'revoked') {
                requireUpdatedRow(
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
                revoked += 1;
              } else {
                noOp += 1;
              }
            }
            await this.projectLegacyAuthority(user.id, role, connection);
            continue;
          }
          const tuple = await this.findAssignmentByTuple(
            user.id,
            role.id,
            (removal.source ?? 'manual') as RoleAssignmentSource,
            requiredAuthorizationText(removal.sourceKey ?? MANUAL_SOURCE_KEY, 'sourceKey', 128),
            connection
          );
          if (tuple === undefined) {
            throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The assignment was not found.');
          }
          this.assertAssignmentRoleContext(tuple, role);
          if (tuple.version !== expectedVersion) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'The assignment changed.'
            );
          }
          if (String(tuple.source ?? '') === 'external') {
            if (tuple.status !== 'suppressed') {
              requireUpdatedRow(
                (await RoleAssignment.updateOne({ id: tuple.id, version: tuple.version })
                  .set({
                    status: 'suppressed',
                    suppressedBy: this.actorId(command),
                    suppressedAt: this.dependencies.now(),
                    reason: optionalAuthorizationText(command.reason, 1_000),
                    version: tuple.version + 1,
                  })
                  .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
                'The assignment changed since it was read.'
              );
              suppressed += 1;
            } else {
              noOp += 1;
            }
          } else {
            if (tuple.status !== 'revoked') {
              requireUpdatedRow(
                (await RoleAssignment.updateOne({ id: tuple.id, version: tuple.version })
                  .set({
                    status: 'revoked',
                    revokedBy: this.actorId(command),
                    revokedAt: this.dependencies.now(),
                    reason: optionalAuthorizationText(command.reason, 1_000),
                    version: tuple.version + 1,
                  })
                  .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
                'The assignment changed since it was read.'
              );
              revoked += 1;
            } else {
              noOp += 1;
            }
          }
          await this.projectLegacyAuthority(user.id, role, connection);
        }
        for (const role of affectedRoles.values()) {
          await this.assertAdministratorQuorum(role, connection);
        }
        const data = Object.freeze({
          principalId: user.id,
          granted,
          revoked,
          suppressed,
          noOp,
          changed: granted + revoked + suppressed > 0,
        });
        const audit = await this.dependencies.audit().createSucceededEvent(
          {
            ...auditInput,
            targetId: user.id,
            after: { ...data, brandId },
          },
          connection
        );
        return Object.freeze({
          data,
          version: 1,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: data.changed,
        });
      });
    }

    private async loadAccessTargetUser(userId: string, connection: Sails.Connection): Promise<UserAttributes> {
      const target = (await User.findOne({ id: userId }).usingConnection(connection)) as UserAttributes | undefined;
      if (target === undefined) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
      }
      return target;
    }

    private async userLinkInBrand(userId: string, brandId: string, connection: Sails.Connection): Promise<boolean> {
      if (typeof UserLink === 'undefined') return false;
      const link = (await UserLink.findOne({
        brandId,
        status: 'active',
        or: [{ primaryUserId: userId }, { secondaryUserId: userId }],
      }).usingConnection(connection)) as { readonly id?: string } | undefined;
      return link != null;
    }

    private async authoritativeActiveAssignments(
      principalId: string,
      connection: Sails.Connection,
      branding?: string
    ): Promise<RoleAssignmentAttributes[]> {
      const rows = (await RoleAssignment.find({
        principalType: 'user',
        principalId,
        ...(branding === undefined ? {} : { branding }),
        status: 'active',
        sourcePresent: true,
        or: [{ expiresAt: null }, { expiresAt: { '>': this.dependencies.now() } }],
      })
        .limit(AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1)
        .usingConnection(connection)) as RoleAssignmentAttributes[];
      if (rows.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'The principal assignment state exceeds the bounded operation limit.'
        );
      }
      return rows;
    }

    /**
     * Authoritative link read (P5-002): every RoleAssignment row for the
     * principal, all statuses including expired/inactive. The account-link
     * writer must consider inactive/expired sourced tuples so they are never
     * collapsed into a manual grant; active/source-aware adoption and
     * revocation decisions are applied in-memory via `activeAt` below.
     */
    private async authoritativeAllAssignments(
      principalId: string,
      connection: Sails.Connection,
      branding?: string
    ): Promise<RoleAssignmentAttributes[]> {
      const rows = (await RoleAssignment.find({
        principalType: 'user',
        principalId,
        ...(branding === undefined ? {} : { branding }),
      })
        .limit(AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1)
        .usingConnection(connection)) as RoleAssignmentAttributes[];
      if (rows.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'The principal assignment state exceeds the bounded operation limit.'
        );
      }
      return rows;
    }

    private async legacyBrandRoleIds(userId: string, brandId: string, connection: Sails.Connection): Promise<string[]> {
      const populated = (await User.findOne({ id: userId }).populate('roles').usingConnection(connection)) as
        | UserAttributes
        | undefined;
      const roles = (populated?.roles ?? []) as { readonly id?: unknown; readonly branding?: unknown }[];
      const ids: string[] = [];
      for (const role of roles) {
        const branding = role.branding as string | { readonly id?: unknown } | undefined;
        const roleBrandId =
          typeof branding === 'object' && branding !== null ? String(branding.id ?? '') : String(branding ?? '');
        if (roleBrandId === brandId && (typeof role.id === 'string' || typeof role.id === 'number')) {
          ids.push(String(role.id));
        }
      }
      return uniqueStrings(ids);
    }

    private async principalBelongsToBrand(
      userId: string,
      brandId: string,
      connection: Sails.Connection
    ): Promise<boolean> {
      // AUTH-LINK-001: brand membership considers any sourced tuple (including
      // revoked/suppressed/expired history), the legacy projection, and link
      // rows — not only currently effective assignments — so users with only
      // historical brand authority are still recognized as brand members while
      // cross-brand users remain opaque 404.
      const authoritative = await this.authoritativeActiveAssignments(userId, connection, brandId);
      if (authoritative.length > 0) return true;
      const all = await this.authoritativeAllAssignments(userId, connection, brandId);
      if (all.length > 0) return true;
      if ((await this.legacyBrandRoleIds(userId, brandId, connection)).length > 0) return true;
      return this.userLinkInBrand(userId, brandId, connection);
    }

    private actorUsername(command: AuthorizationAdministrationCommand): string {
      return command.actor.principal.username?.trim() || this.actorId(command);
    }

    private async writeLegacyUserAuditRow(
      actorUsername: string,
      action: string,
      context: Record<string, unknown>,
      connection: Sails.Connection
    ): Promise<void> {
      if (typeof UserAudit === 'undefined') return;
      await UserAudit.create({
        user: { username: actorUsername },
        action,
        additionalContext: JSON.stringify(context),
      }).usingConnection(connection);
    }

    /**
     * Versioned guarded user-access mutation (P5-001). Disabling or enabling a
     * user re-locks every protected administrator role the target effectively
     * holds, applies the access change and the AuthorizationAudit success event
     * on the same required transaction, and re-evaluates the administrator
     * quorum against post-update state so a failure rolls everything back.
     */
    public async setUserAccess(command: SetUserAccessCommand): Promise<AuthorizationMutationResult<UserAccessResult>> {
      const auditInput = this.auditInput(
        command,
        command.disabled ? 'user.disabled' : 'user.enabled',
        'user',
        command.userId
      );
      return this.runMutation(command, auditInput, async connection => {
        const brandId = requiredAuthorizationText(command.brandId, 'brandId', 256);
        const userId = requiredAuthorizationText(command.userId, 'userId', 256);
        this.requireAssignmentOrLegacyScope(command, brandId, 'user.manage' as ScopeKey);
        const actorId = this.actorId(command);
        const target = await this.loadAccessTargetUser(userId, connection);
        if (target.accountLinkState === 'linked-alias' || target.linkedPrimaryUserId?.trim()) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            command.disabled
              ? 'Cannot disable a linked alias user. Disable the primary account instead.'
              : 'Cannot enable a linked alias user. Enable the primary account instead.'
          );
        }
        if (!(await this.principalBelongsToBrand(target.id, brandId, connection))) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
        }
        const assignments = await this.authoritativeActiveAssignments(target.id, connection);
        const roleIds = uniqueStrings(
          assignments.map(row => associationId(row.role)).filter((value): value is string => value !== undefined)
        );
        const roles =
          roleIds.length > 0
            ? ((await Role.find({ id: roleIds }).limit(roleIds.length).usingConnection(connection)) as RoleAttributes[])
            : [];
        if (roles.some(role => role.contextType === 'system' && role.protectedKind === 'system-admin')) {
          this.requireScope(command, SYSTEM_MANAGE_SCOPE);
        }
        const protectedRoles = roles.filter(role => isProtectedAdministratorRole(role));
        const current = target.loginDisabled === true;
        // P5-G1: legacy User documents predate loginDisabledVersion. Missing
        // (or non-integer) values read as version 1; the CAS predicate below
        // matches both `1` and missing/null so the first guarded mutation
        // heals the field to 2 atomically instead of 409ing forever.
        const rawVersion = target.loginDisabledVersion as unknown;
        const versionMissing = !(typeof rawVersion === 'number' && Number.isSafeInteger(rawVersion as number));
        const currentVersion = versionMissing ? 1 : (rawVersion as number);
        // AUTH-CAS-HTTP-001: validate supplied CAS before the no-op short
        // circuit so stale callers cannot observe a false success.
        if (command.expectedVersion !== undefined && currentVersion !== positiveVersion(command.expectedVersion)) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The user access state changed since it was read.'
          );
        }
        if (current === command.disabled) {
          const data = Object.freeze({ userId: target.id, disabled: current, changed: false });
          const audit = await this.dependencies
            .audit()
            .createSucceededEvent({ ...auditInput, eventType: 'user.access-noop', after: data }, connection);
          return Object.freeze({
            data,
            version: currentVersion,
            auditEventId: audit.eventId,
            requestId: command.requestId,
            changed: false,
          });
        }
        // AUTH-CAS-HTTP-001: CAS is required for state-changing mutations on
        // versioned rows. Legacy rows without the field (versionMissing) may
        // omit it once for backfill; versioned rows must pin the observed
        // version or fail with 409. No-op reads may omit it for idempotent
        // retries (already validated above when supplied).
        if (!versionMissing && command.expectedVersion === undefined) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'An expectedVersion is required to modify user access state.'
          );
        }
        // Serialize quorum-critical disable work: a concurrent administrator
        // removal that commits first fails this lock with a version conflict
        // instead of silently violating quorum.
        if (command.disabled) {
          for (const role of [...protectedRoles].sort((left, right) => left.id.localeCompare(right.id))) {
            await this.lockProtectedRole(role, actorId, connection);
          }
        }
        // True compare-and-set: the database predicate pins the observed
        // loginDisabledVersion so concurrent disable/enable writers cannot
        // both succeed. A lost update resolves to undefined and surfaces as a
        // stable authorization.version-conflict with no success audit; the
        // surrounding required transaction rolls back quorum locks and audits.
        // Legacy rows without the field match via `or` and are backfilled to
        // currentVersion + 1 on first mutation.
        const casCriteria =
          versionMissing && currentVersion === 1
            ? { id: target.id, or: [{ loginDisabledVersion: 1 }, { loginDisabledVersion: null }] }
            : { id: target.id, loginDisabledVersion: currentVersion };
        const updated = requireUpdatedRow(
          (await User.updateOne(casCriteria)
            .set({ loginDisabled: command.disabled, loginDisabledVersion: currentVersion + 1 })
            .usingConnection(connection)) as UserAttributes | undefined,
          'The user access state changed since it was read.'
        );
        if (command.disabled) {
          // Re-evaluate against post-update state: the disabled target no
          // longer counts as an effective administrator.
          for (const role of protectedRoles) {
            await this.assertAdministratorQuorum(role, connection);
          }
        }
        const data = Object.freeze({ userId: updated.id, disabled: command.disabled, changed: true });
        const audit = await this.dependencies.audit().createSucceededEvent(
          {
            ...auditInput,
            before: { disabled: current, version: currentVersion },
            after: { ...data, version: currentVersion + 1 },
          },
          connection
        );
        await this.writeLegacyUserAuditRow(
          this.actorUsername(command),
          command.disabled ? 'disable-user' : 'enable-user',
          { userId: updated.id, brandId },
          connection
        );
        return Object.freeze({
          data,
          version: currentVersion + 1,
          auditEventId: audit.eventId,
          requestId: command.requestId,
          changed: true,
        });
      });
    }

    /**
     * AUTH-TXN-001 explicit cross-store consistency protocol.
     *
     * Role/User/UserLink/RoleAssignment live on the default `mongodb`
     * datastore while records live on the separate `redboxStorage` Mongo
     * database (see `config/datastores.config.ts`). The two datastores share
     * no session, so passing the Role transaction connection to Record writes
     * cannot provide a distributed commit. This helper therefore NEVER uses
     * the Role connection: it runs on the Record datastore's own connection
     * (or without one in reduced runtimes) with brand and revision CAS
     * predicates, idempotent recomputation, and drift reporting.
     *
     * Protocol: the authorization transaction commits first; this phase runs
     * afterwards. A record failure does NOT roll back the committed
     * authorization state. Instead the caller records a
     * `user.link-records-pending` audit event and returns
     * `recordsPending: true` so operators can retry/reconcile. Tests must not
     * claim single-commit rollback across datastores.
     *
     * AUTH-LINK-001: every rewritten record is constrained to the link brand
     * (`metaMetadata.brandId`) and to its observed `revision` when present. A
     * cross-brand row is treated as not-found (never rewritten); a revision
     * mismatch surfaces as `authorization.version-conflict` for retry.
     */
    /**
     * AUTH-TXN-001 bounded record-plan discovery. Returns the complete set of
     * record OIDs whose authorization references the secondary identity
     * (usernames or pending email) in the link brand. The limit is applied
     * BEFORE await (max+1 probe); oversized sets fail closed. A row matching
     * without an OID fails closed (its rewrite would be untargetable).
     * Returns null when the Record store is unavailable (reduced runtimes).
     */
    private async discoverLinkedRecordPlan(
      secondaryUsername: string,
      secondaryEmail: string,
      brandId: string
    ): Promise<readonly string[] | null> {
      const secondaryName = String(secondaryUsername ?? '');
      const secondaryMail = String(secondaryEmail ?? '').toLowerCase();
      if (secondaryName.length === 0 && secondaryMail.length === 0) return Object.freeze([]);
      const recordGlobal = (globalThis as unknown as Record<string, unknown>).Record as
        | {
            find?: (criteria: Record<string, unknown>) => unknown;
            updateOne?: (criteria: Record<string, unknown>) => unknown;
          }
        | undefined;
      if (recordGlobal?.find === undefined || recordGlobal?.updateOne === undefined) return null;
      // AUTH-LINK-002: brand-constrained discovery predicate. The brand is
      // part of the query (not a post-read filter) so foreign-brand rows are
      // never returned; unbranded rows are still excluded post-read as opaque
      // not-found. The bounded limit is applied BEFORE await (max+1 probe).
      const criteria: Record<string, unknown> = {
        'metaMetadata.brandId': brandId,
        or: [
          ...(secondaryName.length > 0
            ? [{ 'authorization.edit': secondaryName }, { 'authorization.view': secondaryName }]
            : []),
          ...(secondaryMail.length > 0
            ? [{ 'authorization.editPending': secondaryMail }, { 'authorization.viewPending': secondaryMail }]
            : []),
        ],
      };
      let findQuery = recordGlobal.find(criteria) as unknown as {
        meta?: (values: Record<string, unknown>) => unknown;
        limit?: (value: number) => unknown;
      };
      if (typeof findQuery?.meta === 'function') {
        findQuery = findQuery.meta({ enableExperimentalDeepTargets: true }) as typeof findQuery;
      }
      // AUTH-P5-003: the bound MUST hold before await. A query surface without
      // a limit capability fails closed — never an unbounded await.
      if (typeof findQuery?.limit !== 'function') {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'Linked record discovery is unavailable without a bounded query.'
        );
      }
      findQuery = findQuery.limit(AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1) as typeof findQuery;
      // Deliberately no `.usingConnection(roleConnection)`: records live on a
      // different datastore/session.
      const rows = (await findQuery) as unknown[];
      const discovered = Array.isArray(rows) ? rows : [];
      // AUTH-TXN-001: bound record discovery. An unbounded rewrite fan-out
      // is not a safe second phase; oversized result sets fail closed for
      // operator-scoped reconciliation instead of partially rewriting.
      if (discovered.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'The linked record set exceeds the bounded rewrite limit.'
        );
      }
      const oids: string[] = [];
      for (const row of discovered) {
        const oid = String((row as Record<string, unknown>).redboxOid ?? '');
        if (oid.length === 0) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'Linked record authorization state is unavailable.'
          );
        }
        oids.push(oid);
      }
      return Object.freeze(oids);
    }

    /**
     * AUTH-TXN-001 plan-scoped record rewrite (Commit 2). Consumes ONLY the
     * stored plan: fresh discovery is intersected with `planOids`, so a retry
     * can never rewrite outside the persisted plan. Planned OIDs absent from
     * fresh discovery already converged (rewritten or removed) and count as
     * complete. Returns the rewritten count plus the durable per-record
     * progress (`completedOids`). Progress is ALSO appended to the optional
     * `progress` out-param as rows complete, so a mid-pass failure still
     * persists its completed prefix instead of losing partial work.
     * Returns `rewritten: -1` when the Record store is unavailable (reduced
     * runtimes only). Both the initial pass and every retry pass the
     * persisted pre-mutation plan: the operation plan is authoritative, and
     * no unplanned write ever runs.
     */
    private async rewriteLinkedRecordAuthorizationsSeparateStore(
      primaryUsername: string,
      secondaryUsername: string,
      secondaryEmail: string,
      brandId: string,
      planOids: readonly string[] | undefined,
      progress?: string[]
    ): Promise<{ readonly rewritten: number; readonly completedOids: readonly string[] }> {
      const secondaryName = String(secondaryUsername ?? '');
      const secondaryMail = String(secondaryEmail ?? '').toLowerCase();
      const primaryName = String(primaryUsername ?? '');
      if ((secondaryName.length === 0 && secondaryMail.length === 0) || primaryName.length === 0) {
        return { rewritten: 0, completedOids: Object.freeze([]) };
      }
      const recordGlobal = (globalThis as unknown as Record<string, unknown>).Record as
        | {
            find?: (criteria: Record<string, unknown>) => unknown;
            updateOne?: (criteria: Record<string, unknown>) => unknown;
          }
        | undefined;
      if (recordGlobal?.find === undefined || recordGlobal?.updateOne === undefined) {
        return { rewritten: -1, completedOids: Object.freeze([]) };
      }
      // AUTH-LINK-002: brand-constrained discovery predicate. The brand is
      // part of the query (not a post-read filter) so foreign-brand rows are
      // never returned; unbranded rows are still excluded post-read as opaque
      // not-found. The bounded limit is applied BEFORE await (max+1 probe).
      const criteria: Record<string, unknown> = {
        'metaMetadata.brandId': brandId,
        or: [
          ...(secondaryName.length > 0
            ? [{ 'authorization.edit': secondaryName }, { 'authorization.view': secondaryName }]
            : []),
          ...(secondaryMail.length > 0
            ? [{ 'authorization.editPending': secondaryMail }, { 'authorization.viewPending': secondaryMail }]
            : []),
        ],
      };
      let findQuery = recordGlobal.find(criteria) as unknown as {
        meta?: (values: Record<string, unknown>) => unknown;
        limit?: (value: number) => unknown;
      };
      if (typeof findQuery?.meta === 'function') {
        findQuery = findQuery.meta({ enableExperimentalDeepTargets: true }) as typeof findQuery;
      }
      // AUTH-P5-003: the bound MUST hold before await. A query surface without
      // a limit capability fails closed — never an unbounded await.
      if (typeof findQuery?.limit !== 'function') {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'Linked record discovery is unavailable without a bounded query.'
        );
      }
      findQuery = findQuery.limit(AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1) as typeof findQuery;
      // Deliberately no `.usingConnection(roleConnection)`: records live on a
      // different datastore/session.
      const rows = (await findQuery) as unknown[];
      const uniq = (values: string[]): string[] => [...new Set(values)];
      const discovered = Array.isArray(rows) ? rows : [];
      // AUTH-TXN-001: bound record discovery. An unbounded rewrite fan-out
      // is not a safe second phase; oversized result sets fail closed for
      // operator-scoped reconciliation instead of partially rewriting.
      if (discovered.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'The linked record set exceeds the bounded rewrite limit.'
        );
      }
      const planned = planOids === undefined ? undefined : new Set(planOids);
      const completed: string[] = progress ?? [];
      // Planned OIDs absent from fresh discovery already converged (rewritten
      // by an earlier attempt or removed): record them up front so even a
      // mid-pass failure preserves the converged prefix.
      if (planned !== undefined) {
        const freshOids = new Set(discovered.map(row => String((row as Record<string, unknown>).redboxOid ?? '')));
        for (const oid of planned) {
          if (oid.length > 0 && !freshOids.has(oid) && !completed.includes(oid)) completed.push(oid);
        }
      }
      let rewritten = 0;
      for (const row of discovered) {
        const recordObj = row as Record<string, unknown>;
        const oid = String(recordObj.redboxOid ?? '');
        // AUTH-TXN-001 plan authority: every pass consumes ONLY the stored
        // plan. Fresh matches outside the plan are never touched on a
        // planned pass.
        if (planned !== undefined && !planned.has(oid)) continue;
        // Brand predicate: never rewrite a record owned by another brand —
        // and never rewrite an UNBRANDED row under a brand link (its
        // ownership is unverifiable). Both surface as opaque not-found so
        // the operation reports pending drift for operator reconciliation
        // instead of silently rewriting foreign or orphan state.
        const meta = (recordObj.metaMetadata ?? {}) as Record<string, unknown>;
        const recordBrand = typeof meta.brandId === 'string' ? String(meta.brandId) : '';
        if (recordBrand.length === 0 || recordBrand !== brandId) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target was not found.');
        }
        const current = ((recordObj.authorization ?? {}) as Record<string, unknown>) ?? {};
        const edit = uniq(((current.edit ?? []) as unknown[]).map(value => String(value)));
        const view = uniq(((current.view ?? []) as unknown[]).map(value => String(value)));
        const editPending = ((current.editPending ?? []) as unknown[]).map(value => String(value).toLowerCase());
        const viewPending = ((current.viewPending ?? []) as unknown[]).map(value => String(value).toLowerCase());
        const nextEdit = uniq(edit.map(username => (username === secondaryName ? primaryName : username)));
        const nextView = uniq(view.map(username => (username === secondaryName ? primaryName : username)));
        let nextEditPending = [...editPending];
        let nextEditWithPrimary = [...nextEdit];
        let nextViewPending = [...viewPending];
        let nextViewWithPrimary = [...nextView];
        let changed =
          JSON.stringify(nextEdit) !== JSON.stringify(edit) || JSON.stringify(nextView) !== JSON.stringify(view);
        if (secondaryMail.length > 0 && editPending.includes(secondaryMail)) {
          nextEditPending = nextEditPending.filter(email => email !== secondaryMail);
          nextEditWithPrimary = uniq([...nextEditWithPrimary, primaryName]);
          changed = true;
        }
        if (secondaryMail.length > 0 && viewPending.includes(secondaryMail)) {
          nextViewPending = nextViewPending.filter(email => email !== secondaryMail);
          nextViewWithPrimary = uniq([...nextViewWithPrimary, primaryName]);
          changed = true;
        }
        // Idempotent no-op: the row already carries no secondary references
        // (rewritten by an earlier attempt). Counts as durable progress.
        if (!changed) {
          if (oid.length > 0) completed.push(oid);
          continue;
        }
        if (oid.length === 0) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'Linked record authorization state is unavailable.'
          );
        }
        const nextAuthorization = {
          ...current,
          edit: nextEditWithPrimary,
          view: nextViewWithPrimary,
          editPending: nextEditPending,
          viewPending: nextViewPending,
        };
        // Revision CAS (required): every rewritten record must carry an
        // observed numeric revision pinned into the update predicate AND the
        // brand predicate. Rows without a revision fail as pending drift
        // (never an unversioned blind update) for operator reconciliation.
        const observedRevision = (recordObj as Record<string, unknown>).revision;
        if (typeof observedRevision !== 'number' || !Number.isSafeInteger(observedRevision)) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The linked record changed since it was read.'
          );
        }
        const updateCriteria: Record<string, unknown> = {
          redboxOid: oid,
          revision: observedRevision,
          'metaMetadata.brandId': brandId,
        };
        const nextValues: Record<string, unknown> = {
          authorization: nextAuthorization,
          revision: observedRevision + 1,
        };
        const updateQuery = (recordGlobal.updateOne as (criteria: Record<string, unknown>) => unknown)(
          updateCriteria
        ) as unknown as {
          set?: (values: Record<string, unknown>) => unknown;
        };
        if (typeof updateQuery?.set !== 'function') {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'Linked record authorization state is unavailable.'
          );
        }
        const updated = (await updateQuery.set(nextValues)) as Record<string, unknown> | undefined;
        requireUpdatedRow(updated, 'The linked record changed since it was read.');
        rewritten += 1;
        completed.push(oid);
      }
      return Object.freeze({ rewritten, completedOids: Object.freeze([...completed]) });
    }

    /**
     * AUTH-TXN-001 + AUTH-LINK-001: two-commit link protocol.
     *
     * Commit 1 (required transaction on the default `mongodb` datastore):
     * canonical users, brand membership for BOTH accounts, pair-bound
     * expected versions, delegation ceiling, sourced-tuple adoption/retirement
     * with CAS, `UserLink` uniqueness (secondary may have exactly one active
     * link; duplicates/ races surface as 409), secondary canonical update,
     * legacy projection heal, quorum re-check, drift guard, and audits.
     *
     * Commit 2 (separate Record-datastore phase, no shared session): linked
     * record rewrites with brand (`metaMetadata.brandId`, unbranded rows are
     * rejected as opaque not-found) and `revision` CAS predicates over a
     * bounded discovery set. A record failure never rolls back Commit 1; it
     * is reported via a `user.link-records-pending` audit and
     * `recordsPending: true`. The `userlink { secondaryUserId: 1, status: 1 }`
     * unique constraint is enforceable in production via the
     * `AUTHORIZATION_PERSISTENCE_MODEL_INDEXES` entry, the model declaration,
     * and migration `20260905T120000-account-link-uniqueness`; the
     * application pre-check plus duplicate-key normalization make the race a
     * stable 409 even before the index converges.
     */
    public async linkUserAccounts(
      command: LinkUserAccountsCommand
    ): Promise<AuthorizationMutationResult<UserAccountLinkResult>> {
      const auditInput = this.auditInput(command, 'user.linked', 'user', command.primaryUserId);
      // AUTH-P5-009 completed-operation proof: the idempotent completed
      // resume is NOT a brand+pair-only shortcut. The lookup uses the caller
      // operation key first (preserving the documented drift-before-token
      // ordering for fresh links), but a completed stored row is returned
      // ONLY after the canonical mandatory DTO (operation ID, both account
      // versions, pair-bound confirmation token), the proven link scope, the
      // caller versions and CURRENT caller actor bound to the stored proof,
      // and the full stored proof (proofHash, assignmentSnapshot, both account
      // versions, proofActorId, operation identity, brand/pair) plus token
      // verification (signature + expiry + content) all succeed. An expired
      // or tampered token fails closed with preview-stale instead of
      // returning the stored result.
      const operationId = this.linkOperationKey(command);
      const prior = await this.readLinkOperationState(operationId);
      if (prior !== undefined && prior.status === 'completed' && prior.recordsPending !== true) {
        const completedProof = normalizeLinkUserAccountsRequest(command);
        const completedBrandId = requiredAuthorizationText(command.brandId, 'brandId', 256);
        this.requireAssignmentOrLegacyScope(command, completedBrandId, 'user.account-link.manage' as ScopeKey);
        this.requireCompletedLinkProof(prior, completedProof, command);
        return this.resumeStoredLinkResult(command, prior, false);
      }
      const attemptCount = (prior?.attemptCount ?? 0) + 1;
      if (attemptCount > LINK_OPERATION_MAX_ATTEMPTS) {
        throw new AuthorizationAdministrationError(
          'authorization.bulk-invalid',
          422,
          'The link operation exceeded the bounded retry limit.'
        );
      }
      // AUTH-TXN-001 durability: NO pre-commit running row with an empty plan.
      // The full plan (usernames/email) plus the committed authorization phase
      // are persisted ATOMICALLY inside Commit 1 on the same leased
      // connection (see the `writeLinkOperationState(..., connection, ...)`
      // call before the Commit 1 return). Persistence failures inside Commit 1
      // throw and roll the authorization commit back (fail closed).
      const priorAttemptCount = prior?.attemptCount ?? 0;
      let recordPlan:
        | {
            readonly primaryUsername: string;
            readonly secondaryUsername: string;
            readonly secondaryEmail: string;
            readonly recordOids: readonly string[];
            /**
             * AUTH-P5-004: true only when the Record store produced a complete
             * bounded plan inside Commit 1 (false when discovery found the
             * store unavailable and persisted an empty plan). The initial
             * record pass consumes the persisted plan ONLY when complete;
             * otherwise it reports pending drift without an unplanned write.
             */
            readonly planComplete: boolean;
          }
        | undefined;
      // AUTH-TXN-001 proof bundle, captured inside Commit 1 and threaded
      // through every post-commit durable write (pending/completed) so the
      // stored operation always carries the complete plan + proof.
      let committedProof:
        | {
            readonly primaryExpectedVersion: number;
            readonly secondaryExpectedVersion: number;
            readonly proofHash: string;
            readonly assignmentSnapshot: readonly string[];
            readonly proofActorId: string;
          }
        | undefined;
      let committed: AuthorizationMutationResult<UserAccountLinkResult>;
      try {
        committed = await this.runMutation(command, auditInput, async connection => {
          if (typeof UserLink === 'undefined') {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-role',
              400,
              'Account linking is unavailable.'
            );
          }
          const brandId = requiredAuthorizationText(command.brandId, 'brandId', 256);
          this.requireAssignmentOrLegacyScope(command, brandId, 'user.account-link.manage' as ScopeKey);
          const actorId = this.actorId(command);
          const primaryId = requiredAuthorizationText(command.primaryUserId, 'primaryUserId', 256);
          const secondaryId = requiredAuthorizationText(command.secondaryUserId, 'secondaryUserId', 256);
          // AUTH-P5-006: pair-bound server proof. Both expected versions
          // are required immediately after the scope gate — omission fails
          // closed so callers must prove a recent server-verified read of
          // BOTH identities. The confirmation token and operation ID are
          // normalized to the canonical mandatory request below, AFTER the
          // live-version drift checks, preserving the documented
          // drift-before-token ordering (stale pairs fail with
          // version-conflict even when no token is supplied).
          if (command.primaryExpectedVersion === undefined || command.secondaryExpectedVersion === undefined) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'Both primaryExpectedVersion and secondaryExpectedVersion are required to link accounts.'
            );
          }
          const primaryExpected = positiveVersion(command.primaryExpectedVersion, 'primaryExpectedVersion');
          const secondaryExpected = positiveVersion(command.secondaryExpectedVersion, 'secondaryExpectedVersion');
          if (primaryId === secondaryId) {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-role',
              400,
              'Cannot link a user to itself.'
            );
          }
          // Resolve the canonical primary inside the transaction so a
          // concurrently linked primary cannot be adopted inconsistently.
          let primary = await this.loadAccessTargetUser(primaryId, connection);
          const seenPrimaryIds = new Set<string>();
          for (let depth = 0; depth < MAX_LINK_DEPTH; depth += 1) {
            if (seenPrimaryIds.has(primary.id)) {
              throw new AuthorizationAdministrationError(
                'authorization.not-found',
                404,
                'The target user was not found.'
              );
            }
            seenPrimaryIds.add(primary.id);
            if (!primary.linkedPrimaryUserId?.trim()) break;
            const next = (await User.findOne({ id: primary.linkedPrimaryUserId }).usingConnection(connection)) as
              | UserAttributes
              | undefined;
            if (next === undefined) {
              throw new AuthorizationAdministrationError(
                'authorization.not-found',
                404,
                'The target user was not found.'
              );
            }
            primary = next;
          }
          if (primary.linkedPrimaryUserId?.trim()) {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              404,
              'The target user was not found.'
            );
          }
          if (primary.accountLinkState === 'linked-alias') {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-role',
              400,
              'Primary user cannot be a linked alias.'
            );
          }
          if (primary.loginDisabled === true) {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-role',
              400,
              'Cannot link accounts: primary user is disabled.'
            );
          }
          const secondary = await this.loadAccessTargetUser(secondaryId, connection);
          // AUTH-LINK-PROOF-001: both accounts must be active. The primary
          // disabled check above is symmetric: a disabled secondary cannot be
          // linked (its authority must not move while login is barred).
          if (secondary.loginDisabled === true) {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-role',
              400,
              'Cannot link accounts: secondary user is disabled.'
            );
          }
          if (secondary.accountLinkState === 'linked-alias') {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'Secondary user is already linked to another primary account.'
            );
          }
          if (
            (secondary.linkedPrimaryUserId?.trim() ?? '') !== '' &&
            String(secondary.linkedPrimaryUserId) !== String(primary.id)
          ) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'Secondary user is already linked to another primary account.'
            );
          }
          if (!(await this.principalBelongsToBrand(primary.id, brandId, connection))) {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              404,
              'The target user was not found.'
            );
          }
          // AUTH-LINK-001: both accounts are brand members. The secondary check
          // is symmetric so a brand administrator cannot link authority owned
          // by another brand via the secondary side.
          if (!(await this.principalBelongsToBrand(secondary.id, brandId, connection))) {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              404,
              'The target user was not found.'
            );
          }
          // AUTH-LINK-001 pair-bound expected versions (server proof that the
          // caller recently read BOTH identities). Missing loginDisabledVersion
          // reads as 1 for legacy rows. Both versions are REQUIRED (checked at
          // entry); any drift fails closed before any write.
          const secondaryRawVersion = (secondary as UserAttributes).loginDisabledVersion as unknown;
          const secondaryLiveVersion =
            typeof secondaryRawVersion === 'number' && Number.isSafeInteger(secondaryRawVersion)
              ? (secondaryRawVersion as number)
              : 1;
          if (secondaryLiveVersion !== secondaryExpected) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'The secondary account changed since it was read.'
            );
          }
          const primaryRawVersion = (primary as UserAttributes).loginDisabledVersion as unknown;
          const primaryLiveVersion =
            typeof primaryRawVersion === 'number' && Number.isSafeInteger(primaryRawVersion)
              ? (primaryRawVersion as number)
              : 1;
          if (primaryLiveVersion !== primaryExpected) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'The primary account changed since it was read.'
            );
          }
          // AUTH-LINK-PROOF-001 + AUTH-LINK-003: the preview confirmation
          // token binds actor + brand + pair + both versions + authoritative
          // assignment snapshot + operation ID with a short expiry. The live
          // snapshot is recomputed here and verified as the token content:
          // any assignment drift (new/removed/expired/suppressed tuples or
          // version movement on either account) or operation-ID confusion
          // fails closed with 409 before any write.
          // AUTH-P5-006: normalize to the canonical mandatory request here,
          // after the live-version drift checks. Omitted confirmation token
          // or operation ID fails closed with preview-stale, and every
          // downstream proof/operation check consumes this one shape.
          const proof = normalizeLinkUserAccountsRequest(command);
          const linkToken = proof.linkConfirmationToken;
          const liveSnapshot = await this.snapshotLinkAssignments(
            String(primary.id),
            String(secondary.id),
            brandId,
            connection
          );
          const liveOperationId = proof.linkOperationId;
          this.verifyConfirmation(
            command,
            linkToken,
            'account-link',
            `account-link:${primaryId}:${secondaryId}`,
            secondaryExpected,
            this.linkProofContent(
              primaryId,
              secondaryId,
              primaryExpected,
              secondaryExpected,
              liveSnapshot.snapshot,
              liveOperationId
            )
          );
          const existingLink = (await UserLink.findOne({
            secondaryUserId: String(secondary.id),
            status: 'active',
          }).usingConnection(connection)) as { readonly id?: string } | undefined;
          if (existingLink != null) {
            // AUTH-LINK-RACE-001: existing-link conflicts normalize to 409
            // (safe idempotent retry of the SAME operation resumes via the
            // durable operation record; a different operation conflicting here
            // is a version conflict, never a 400). A pending operation for the
            // same pair (records awaiting reconciliation) resumes from any
            // request key so operators can retry without the original key.
            // Completed rows found here still pass the full completed-proof
            // gate (caller versions + current actor + token vs stored proof):
            // there is no brand+pair-only bypass.
            const retryable = await this.findResumableLinkOperation(command, String(secondary.id), brandId);
            if (retryable !== undefined) {
              if (retryable.status === 'completed' && retryable.recordsPending !== true) {
                this.requireCompletedLinkProof(retryable, proof, command);
              }
              return this.resumeCompletedLinkOperation(retryable);
            }
            const pendingForPair = await this.findPendingLinkOperationForPair(
              String(primary.id),
              String(secondary.id),
              brandId
            );
            if (pendingForPair !== undefined) {
              return this.resumeCompletedLinkOperation(pendingForPair);
            }
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'Secondary user is already linked.'
            );
          }
          const secondaryOwnLinks = (await UserLink.findOne({
            primaryUserId: String(secondary.id),
            status: 'active',
          }).usingConnection(connection)) as { readonly id?: string } | undefined;
          if (secondaryOwnLinks != null) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'Secondary user already has linked accounts.'
            );
          }
          // AUTH-TXN-001 durable plan: discover the bounded complete record
          // plan BEFORE any authority mutation. The OID set is persisted
          // atomically with the authorization commit (see the Commit 1
          // operation write); the initial record pass and every retry consume
          // ONLY this stored plan. A null plan means the Record store is
          // unavailable (reduced runtimes): it is persisted as empty AND
          // marked incomplete so Commit 2 reports pending drift instead of
          // running an unplanned write.
          const discoveredRecordOids = await this.discoverLinkedRecordPlan(
            String(secondary.username ?? ''),
            String(secondary.email ?? ''),
            brandId
          );
          const recordOids: readonly string[] = discoveredRecordOids ?? Object.freeze([]);
          // Authoritative brand authority for the secondary: every
          // RoleAssignment row (all statuses, including expired/inactive),
          // never the legacy projection. Active/source-aware adoption and
          // revocation decisions are applied in-memory below via `activeAt`
          // and exact sourced-tuple matching, preserving
          // source/sourceKey/expiresAt and never collapsing into a manual
          // grant.
          const secondaryAllTuples = await this.authoritativeAllAssignments(String(secondary.id), connection);
          const nowForSecondaryRead = this.dependencies.now();
          const secondaryActiveTuples = secondaryAllTuples.filter(tuple => activeAt(tuple, nowForSecondaryRead));
          const secondaryRoleIds = uniqueStrings(
            secondaryAllTuples
              .map(row => associationId(row.role))
              .filter((value): value is string => value !== undefined)
          );
          const secondaryRoles =
            secondaryRoleIds.length > 0
              ? ((await Role.find({ id: secondaryRoleIds })
                  .limit(secondaryRoleIds.length)
                  .usingConnection(connection)) as RoleAttributes[])
              : [];
          const secondaryRolesById = new Map(secondaryRoles.map(role => [role.id, role]));
          for (const tuple of secondaryActiveTuples) {
            const role = secondaryRolesById.get(associationId(tuple.role) ?? '');
            if (
              role === undefined ||
              role.contextType !== 'brand' ||
              associationId(role.branding) !== brandId ||
              associationId(tuple.branding) !== brandId
            ) {
              throw new AuthorizationAdministrationError(
                'authorization.not-found',
                404,
                'The secondary account holds authority outside the active brand context.'
              );
            }
            this.assertAssignmentRoleContext(tuple, role);
          }
          // Authoritative adoption only: the legacy User.roles projection is
          // never authoritative. Brand authority derives solely from
          // RoleAssignment tuples; legacy drift is healed via projection
          // writes below, never via new grants. Only active/effective sourced
          // tuples (active status, source present, unexpired) are adopted.
          // Revoked, suppressed, or expired rows remain non-effective: they are
          // never recreated or reactivated as active on the primary and never
          // collapsed into a manual grant.
          const brandSecondaryTuples = secondaryAllTuples.filter(tuple => associationId(tuple.branding) === brandId);
          const brandRolesById = new Map(secondaryRoles.map(role => [role.id, role]));
          const now = this.dependencies.now();
          const brandSecondaryEffective = brandSecondaryTuples.filter(tuple => activeAt(tuple, now));
          const brandRoleIds = uniqueStrings(
            brandSecondaryTuples
              .map(row => associationId(row.role))
              .filter((value): value is string => value !== undefined)
          );
          const effectiveBrandRoleIds = uniqueStrings(
            brandSecondaryEffective
              .map(row => associationId(row.role))
              .filter((value): value is string => value !== undefined)
          );
          // Query every primary brand tuple (all statuses) so adoption matches
          // the exact sourced tuple instead of collapsing by role id. A primary
          // row with the same role but a different source is a distinct grant.
          const primaryBrandTuplesAll = (await RoleAssignment.find({
            principalType: 'user',
            principalId: String(primary.id),
            branding: brandId,
          })
            .limit(AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS + 1)
            .usingConnection(connection)) as RoleAssignmentAttributes[];
          if (primaryBrandTuplesAll.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS) {
            throw new AuthorizationAdministrationError(
              'authorization.query-bound-exceeded',
              409,
              'The principal assignment state exceeds the bounded operation limit.'
            );
          }
          const sourceTupleKey = (roleId: string, source: string, sourceKey: string): string =>
            `${roleId}::${source}::${sourceKey}`;
          const primaryTupleBySourceKey = new Map(
            primaryBrandTuplesAll.map(row => [
              sourceTupleKey(associationId(row.role) ?? '', String(row.source), String(row.sourceKey)),
              row,
            ])
          );
          const protectedRoles = new Map<string, RoleAttributes>();
          for (const roleId of effectiveBrandRoleIds) {
            const role = brandRolesById.get(roleId);
            if (role === undefined || associationId(role.branding) !== brandId || role.contextType !== 'brand') {
              throw new AuthorizationAdministrationError(
                'authorization.not-found',
                404,
                'The secondary account holds authority outside the active brand context.'
              );
            }
            if (role.protectedKind === 'guest') {
              throw new AuthorizationAdministrationError(
                'authorization.protected-role',
                409,
                'Guest is implicit and cannot be linked.'
              );
            }
            if (isProtectedAdministratorRole(role)) protectedRoles.set(role.id, role);
          }
          for (const role of [...protectedRoles.values()].sort((left, right) => left.id.localeCompare(right.id))) {
            await this.lockProtectedRole(role, actorId, connection);
          }
          const normalizeExpiry = (value: unknown): string | null => {
            if (value == null) return null;
            const time = new Date(String(value)).getTime();
            return Number.isNaN(time) ? String(value) : new Date(time).toISOString();
          };
          const isEffectiveTuple = (row: RoleAssignmentAttributes, at: Date): boolean =>
            row.status === 'active' &&
            row.sourcePresent === true &&
            (row.expiresAt == null || new Date(String(row.expiresAt)).getTime() > at.getTime());
          let rolesAdopted = 0;
          for (const tuple of brandSecondaryEffective) {
            const roleId = associationId(tuple.role) ?? '';
            const role = brandRolesById.get(roleId);
            if (role === undefined) continue;
            const tupleKey = sourceTupleKey(roleId, String(tuple.source), String(tuple.sourceKey));
            const existing = primaryTupleBySourceKey.get(tupleKey);
            if (existing !== undefined) {
              // P5-G2 lifecycle collision: validate exact authoritative state
              // (status/sourcePresent/expiresAt), not only tuple identity. An
              // effective secondary tuple colliding with a revoked, suppressed,
              // expired, or otherwise divergent primary tuple must not force the
              // primary active or clear lifecycle metadata. Deny with a stable
              // conflict so both sides stay exactly preserved for operator
              // resolution.
              const existingEffective = isEffectiveTuple(existing, now);
              const expiryMatches = normalizeExpiry(existing.expiresAt) === normalizeExpiry(tuple.expiresAt);
              if (existingEffective && expiryMatches) {
                continue;
              }
              throw new AuthorizationAdministrationError(
                'authorization.version-conflict',
                409,
                'The primary account holds a divergent assignment for a linked role.'
              );
            }
            this.requireAssignableRole(role);
            const effective = (await this.loadRoleState(role, connection)).effectiveScopeKeys;
            if (!hasEveryScope(command.actor.effectiveScopeKeys, effective)) {
              throw new AuthorizationAdministrationError(
                'authorization.delegation-ceiling',
                403,
                'The linked role exceeds the actor delegation ceiling.'
              );
            }
            // Preserve every authoritative source tuple verbatim on the
            // primary: source, sourceKey, and expiry travel with the grant.
            // No reactivation path exists: a colliding primary tuple above
            // either matches exactly (skipped) or denies the link.
            await RoleAssignment.create({
              principalType: 'user',
              principalId: String(primary.id),
              role: role.id,
              branding: brandId,
              source: tuple.source,
              sourceKey: tuple.sourceKey,
              status: 'active',
              sourcePresent: true,
              assignedBy: actorId,
              assignedAt: now,
              ...(tuple.expiresAt == null ? {} : { expiresAt: tuple.expiresAt }),
              reason: optionalAuthorizationText(command.reason, 1_000),
              version: 1,
            })
              .fetch()
              .usingConnection(connection);
            rolesAdopted += 1;
            primaryTupleBySourceKey.set(tupleKey, {
              ...tuple,
              principalId: String(primary.id),
              status: 'active',
              sourcePresent: true,
            } as RoleAssignmentAttributes);
          }
          let rolesRetired = 0;
          // Brand-scoped retirement: only effective secondary tuples in the
          // requested brand are revoked. Revoked, suppressed, or expired rows
          // are non-effective and remain exactly preserved (never collapsed to
          // revoked). Assignments from unrelated brands are untouched.
          const brandSecondaryToRetire = brandSecondaryTuples.filter(tuple => isEffectiveTuple(tuple, now));
          for (const tuple of brandSecondaryToRetire) {
            requireUpdatedRow(
              (await RoleAssignment.updateOne({ id: tuple.id, version: tuple.version })
                .set({
                  status: 'revoked',
                  revokedBy: actorId,
                  revokedAt: now,
                  reason: optionalAuthorizationText(command.reason, 1_000),
                  version: tuple.version + 1,
                })
                .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
              'The secondary assignment changed since it was read.'
            );
            rolesRetired += 1;
          }
          // AUTH-TXN-001: capture the record plan but do NOT rewrite records
          // inside the authorization transaction. Records live on `redboxStorage`
          // and share no session with this transaction; any record failure after
          // this commit is reported as pending drift, never as a rollback.
          // The OID plan was discovered BEFORE any authority mutation above
          // and travels with the proof bundle below.
          recordPlan = {
            primaryUsername: String(primary.username ?? ''),
            secondaryUsername: String(secondary.username ?? ''),
            secondaryEmail: String(secondary.email ?? ''),
            recordOids,
            planComplete: discoveredRecordOids !== null,
          };
          committedProof = {
            primaryExpectedVersion: primaryExpected,
            secondaryExpectedVersion: secondaryExpected,
            proofHash: this.linkProofHash(linkToken),
            assignmentSnapshot: [...liveSnapshot.snapshot],
            proofActorId: actorId,
          };
          // UserLink storage uniqueness: exactly one active link per secondary.
          // The pre-check above fails closed for the common case; the insert
          // below is the race guard (unique-index violation normalizes to 409
          // via runMutation). Production must enforce a unique partial index on
          // `{ secondaryUserId: 1, status: 1 }`.
          await UserLink.create({
            primaryUserId: String(primary.id),
            primaryUsername: String(primary.username ?? ''),
            secondaryUserId: String(secondary.id),
            secondaryUsername: String(secondary.username ?? ''),
            brandId,
            status: 'active',
            createdBy: this.actorUsername(command),
          }).usingConnection(connection);
          // AUTH-LINK-RACE-001 + AUTH-LINK-003: CAS both user rows inside the
          // protocol and ADVANCE the shared primary link version. The
          // secondary canonical update pins `loginDisabledVersion` (legacy
          // rows read as 1) and heals it forward; the primary row is
          // CAS-verified with a version-pinned predicate and advanced by one
          // so concurrent primary disable/link attempts abort instead of
          // interleaving and later readers observe link movement.
          const primaryCasCriteria =
            primaryLiveVersion === 1
              ? {
                  id: String(primary.id),
                  or: [{ loginDisabledVersion: 1 }, { loginDisabledVersion: null }],
                }
              : { id: String(primary.id), loginDisabledVersion: primaryLiveVersion };
          requireUpdatedRow(
            (await User.updateOne(primaryCasCriteria)
              .set({ loginDisabledVersion: primaryLiveVersion + 1 })
              .usingConnection(connection)) as UserAttributes | undefined,
            'The primary account changed since it was read.'
          );
          const secondaryCasCriteria =
            secondaryLiveVersion === 1
              ? {
                  id: String(secondary.id),
                  or: [{ loginDisabledVersion: 1 }, { loginDisabledVersion: null }],
                }
              : { id: String(secondary.id), loginDisabledVersion: secondaryLiveVersion };
          requireUpdatedRow(
            (await User.updateOne(secondaryCasCriteria)
              .set({
                token: '',
                accountLinkState: 'linked-alias',
                linkedPrimaryUserId: String(primary.id),
                loginDisabledVersion: secondaryLiveVersion + 1,
              })
              .usingConnection(connection)) as UserAttributes | undefined,
            'The secondary account changed since it was read.'
          );
          // Heal the legacy projection from authoritative state (P5-G5).
          // Authoritative effective state (status/sourcePresent/expiresAt) is
          // the only source of truth; the projection never creates grants.
          // Heals: secondary adopted roles for both users, secondary
          // legacy-only drift, primary-only authoritative drift, and primary
          // legacy-only drift.
          for (const roleId of brandRoleIds) {
            const role = brandRolesById.get(roleId);
            if (role === undefined) continue;
            await this.projectLegacyAuthority(String(primary.id), role, connection);
            await this.projectLegacyAuthority(String(secondary.id), role, connection);
          }
          const legacySecondaryRoleIds = await this.legacyBrandRoleIds(String(secondary.id), brandId, connection);
          const legacyOnlyRoleIds = legacySecondaryRoleIds.filter(roleId => !brandRolesById.has(roleId));
          if (legacyOnlyRoleIds.length > 0) {
            const legacyOnlyRoles = (await Role.find({ id: legacyOnlyRoleIds })
              .limit(legacyOnlyRoleIds.length)
              .usingConnection(connection)) as RoleAttributes[];
            for (const role of legacyOnlyRoles) {
              if (associationId(role.branding) !== brandId || role.contextType !== 'brand') continue;
              await this.projectLegacyAuthority(String(secondary.id), role, connection);
            }
          }
          const primaryAuthoritativeActive = await this.authoritativeActiveAssignments(
            String(primary.id),
            connection,
            brandId
          );
          const primaryActiveRoleIds = uniqueStrings(
            primaryAuthoritativeActive
              .map(row => associationId(row.role))
              .filter((value): value is string => value !== undefined)
          );
          if (primaryActiveRoleIds.length > 0) {
            const primaryActiveRoles = (await Role.find({ id: primaryActiveRoleIds })
              .limit(primaryActiveRoleIds.length)
              .usingConnection(connection)) as RoleAttributes[];
            for (const role of primaryActiveRoles) {
              if (associationId(role.branding) !== brandId || role.contextType !== 'brand') continue;
              await this.projectLegacyAuthority(String(primary.id), role, connection);
            }
          }
          const legacyPrimaryRoleIds = await this.legacyBrandRoleIds(String(primary.id), brandId, connection);
          const primaryAuthoritativeRoleIdSet = new Set([
            ...brandRolesById.keys(),
            ...primaryActiveRoleIds,
            ...primaryBrandTuplesAll
              .map(row => associationId(row.role))
              .filter((value): value is string => value !== undefined),
          ]);
          const primaryLegacyOnlyIds = legacyPrimaryRoleIds.filter(
            roleId => !primaryAuthoritativeRoleIdSet.has(roleId)
          );
          if (primaryLegacyOnlyIds.length > 0) {
            const primaryLegacyOnlyRoles = (await Role.find({ id: primaryLegacyOnlyIds })
              .limit(primaryLegacyOnlyIds.length)
              .usingConnection(connection)) as RoleAttributes[];
            for (const role of primaryLegacyOnlyRoles) {
              if (associationId(role.branding) !== brandId || role.contextType !== 'brand') continue;
              await this.projectLegacyAuthority(String(primary.id), role, connection);
            }
          }
          // Post-revocation quorum: the secondary no longer counts as effective.
          for (const role of protectedRoles.values()) {
            await this.assertAdministratorQuorum(role, connection);
          }
          // Dual-write drift guard (P5-G5): authoritative state must now show
          // the secondary with no live brand authority and the primary holding
          // every adopted effective source tuple with exact state
          // (status/sourcePresent/expiresAt), not only tuple identity.
          // Non-effective (revoked/suppressed/expired) tuples are intentionally
          // not adopted and remain non-effective and preserved.
          const secondaryAfter = await this.authoritativeActiveAssignments(String(secondary.id), connection, brandId);
          if (secondaryAfter.length > 0) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'The secondary assignment state changed during linking.'
            );
          }
          const primaryAfterAll = await this.authoritativeAllAssignments(String(primary.id), connection, brandId);
          const primaryAfterByKey = new Map(
            primaryAfterAll.map(row => [
              sourceTupleKey(associationId(row.role) ?? '', String(row.source), String(row.sourceKey)),
              row,
            ])
          );
          const driftedTuple = brandSecondaryEffective.some(tuple => {
            const row = primaryAfterByKey.get(
              sourceTupleKey(associationId(tuple.role) ?? '', String(tuple.source), String(tuple.sourceKey))
            );
            if (row === undefined) return true;
            if (row.status !== 'active' || row.sourcePresent !== true) return true;
            return normalizeExpiry(row.expiresAt) !== normalizeExpiry(tuple.expiresAt);
          });
          if (driftedTuple) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'The primary assignment state changed during linking.'
            );
          }
          const data = Object.freeze({
            primaryUserId: String(primary.id),
            secondaryUserId: String(secondary.id),
            rolesAdopted,
            rolesRetired,
            recordsRewritten: 0,
            recordsPending: true,
            changed: true,
            linkOperationId: operationId,
          });
          const audit = await this.dependencies.audit().createSucceededEvent(
            {
              ...auditInput,
              targetId: String(primary.id),
              after: { ...data, primaryUsername: primary.username, secondaryUsername: secondary.username, brandId },
            },
            connection
          );
          await this.writeLegacyUserAuditRow(
            this.actorUsername(command),
            'link-accounts',
            {
              primaryUserId: primary.id,
              primaryUsername: primary.username,
              secondaryUserId: secondary.id,
              secondaryUsername: secondary.username,
              brandId,
              rolesMerged: rolesAdopted,
              recordsRewritten: 0,
              recordsPending: true,
            },
            connection
          );
          // AUTH-TXN-001: persist the full record plan + committed
          // authorization phase + authority proof ATOMICALLY with Commit 1 on
          // the same leased connection. A persistence failure throws and rolls
          // Commit 1 back (fail closed) via runMutation — never a
          // committed-but-untracked link. CAS on the prior attempt count
          // defeats concurrent writers (creation races additionally break on
          // the unique operationId index).
          await this.writeLinkOperationState(
            {
              operationId,
              brandId,
              primaryUserId: String(primary.id),
              secondaryUserId: String(secondary.id),
              primaryUsername: String(primary.username ?? ''),
              secondaryUsername: String(secondary.username ?? ''),
              secondaryEmail: String(secondary.email ?? ''),
              status: 'pending',
              recordsPending: true,
              recordsRewritten: 0,
              rolesAdopted,
              rolesRetired,
              attemptCount,
              recordOids,
              recordsCompletedOids: Object.freeze([]),
              primaryExpectedVersion: committedProof?.primaryExpectedVersion,
              secondaryExpectedVersion: committedProof?.secondaryExpectedVersion,
              proofHash: committedProof?.proofHash,
              assignmentSnapshot: committedProof?.assignmentSnapshot,
              proofActorId: committedProof?.proofActorId,
            },
            connection,
            priorAttemptCount,
            prior?.status
          );
          return Object.freeze({
            data,
            version: 1,
            auditEventId: audit.eventId,
            requestId: command.requestId,
            changed: true,
          });
        });
      } catch (error) {
        // AUTH-TXN-001: the authorization commit did not happen. Record the
        // terminal failed transition (runMutation already recorded the denied
        // attempt) so operators and retry logic observe it durably. A
        // persistence failure here must not mask the original authorization
        // error, but it is surfaced via the audit fallback chain.
        try {
          await this.writeLinkOperationState(
            {
              operationId,
              brandId: String(command.brandId ?? ''),
              primaryUserId: String(command.primaryUserId ?? ''),
              secondaryUserId: String(command.secondaryUserId ?? ''),
              primaryUsername: '',
              secondaryUsername: '',
              secondaryEmail: '',
              status: 'failed',
              recordsPending: false,
              recordsRewritten: 0,
              rolesAdopted: 0,
              rolesRetired: 0,
              attemptCount,
              // No plan/proof: nothing was authorized. Failed rows never
              // resume the record phase (retry re-runs the full link), so
              // they are permanently incomplete by construction.
              recordOids: Object.freeze([]),
              recordsCompletedOids: Object.freeze([]),
            },
            undefined,
            priorAttemptCount,
            prior?.status
          );
        } catch (persistenceError) {
          await this.dependencies.audit().recordAttempt(
            {
              ...auditInput,
              eventType: 'user.link-records-pending',
              targetId: String(command.primaryUserId ?? ''),
              reasonCode: 'authorization.internal-error',
              after: { linkOperationId: operationId },
            },
            'failed'
          );
          void persistenceError;
        }
        throw error;
      }
      // Commit 2 (separate Record-datastore phase). The authorization commit
      // above is durable; record failures are reported as pending drift.
      // AUTH-P5-004: the initial pass consumes ONLY the persisted pre-mutation
      // plan (`planComplete` from Commit 1 discovery). It never runs an
      // unplanned write: when discovery found the Record store unavailable,
      // the pass reports pending drift; retries consume the stored plan (see
      // retryLinkOperation).
      const plan = recordPlan ?? {
        primaryUsername: '',
        secondaryUsername: '',
        secondaryEmail: '',
        recordOids: Object.freeze([]),
        planComplete: false,
      };
      const proofBundle = committedProof;
      let rewriteOutcome: { readonly rewritten: number; readonly completedOids: readonly string[] } = {
        rewritten: -1,
        completedOids: Object.freeze([]),
      };
      const initialProgress: string[] = [];
      try {
        rewriteOutcome =
          plan.planComplete === true
            ? await this.rewriteLinkedRecordAuthorizationsSeparateStore(
                plan.primaryUsername,
                plan.secondaryUsername,
                plan.secondaryEmail,
                requiredAuthorizationText(command.brandId, 'brandId', 256),
                [...plan.recordOids],
                initialProgress
              )
            : { rewritten: -1, completedOids: Object.freeze([]) };
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code ?? 'authorization.internal-error')
            : 'authorization.internal-error';
        // AUTH-TXN-001: authorization is committed; records await
        // reconciliation. Persist the completed prefix (durable monotonic
        // per-record progress) so bounded retry resumes instead of
        // restarting. The operation stays `pending` (not failed).
        const partialCompleted = Object.freeze([...initialProgress]);
        await this.dependencies.audit().recordAttempt(
          {
            ...auditInput,
            eventType: 'user.link-records-pending',
            targetId: String(committed.data.primaryUserId),
            reasonCode: code,
            after: {
              ...committed.data,
              recordsPending: true,
              recordsRewritten: partialCompleted.length,
              errorCode: code,
            },
          },
          'failed'
        );
        await this.writeLinkOperationState(
          {
            operationId,
            brandId: String(command.brandId ?? ''),
            primaryUserId: String(committed.data.primaryUserId),
            secondaryUserId: String(committed.data.secondaryUserId),
            primaryUsername: plan.primaryUsername,
            secondaryUsername: plan.secondaryUsername,
            secondaryEmail: plan.secondaryEmail,
            status: 'pending',
            recordsPending: true,
            recordsRewritten: partialCompleted.length,
            rolesAdopted: Number(committed.data.rolesAdopted ?? 0),
            rolesRetired: Number(committed.data.rolesRetired ?? 0),
            attemptCount,
            recordOids: [...plan.recordOids],
            recordsCompletedOids: [...partialCompleted],
            primaryExpectedVersion: proofBundle?.primaryExpectedVersion,
            secondaryExpectedVersion: proofBundle?.secondaryExpectedVersion,
            proofHash: proofBundle?.proofHash,
            assignmentSnapshot: proofBundle?.assignmentSnapshot,
            proofActorId: proofBundle?.proofActorId,
          },
          undefined,
          attemptCount,
          'pending'
        );
        return Object.freeze({
          data: Object.freeze({
            ...committed.data,
            recordsRewritten: partialCompleted.length,
            recordsPending: true,
            linkOperationId: operationId,
          }),
          version: committed.version,
          auditEventId: committed.auditEventId,
          requestId: committed.requestId,
          changed: true,
        });
      }
      // AUTH-TXN-001: progress is durable truth (completed OID count), never
      // a caller-supplied claim. When the Record store is unavailable
      // (rewritten < 0, reduced runtimes only — production always hosts the
      // model), completion is UNVERIFIED: report pending drift.
      const recordsRewritten = rewriteOutcome.rewritten < 0 ? 0 : rewriteOutcome.completedOids.length;
      if (rewriteOutcome.rewritten < 0) {
        await this.dependencies.audit().recordAttempt(
          {
            ...auditInput,
            eventType: 'user.link-records-pending',
            targetId: String(committed.data.primaryUserId),
            reasonCode: 'record-store-unavailable',
            after: {
              ...committed.data,
              recordsRewritten,
              recordsPending: true,
              errorCode: 'record-store-unavailable',
            },
          },
          'failed'
        );
        await this.writeLinkOperationState(
          {
            operationId,
            brandId: String(command.brandId ?? ''),
            primaryUserId: String(committed.data.primaryUserId),
            secondaryUserId: String(committed.data.secondaryUserId),
            primaryUsername: plan.primaryUsername,
            secondaryUsername: plan.secondaryUsername,
            secondaryEmail: plan.secondaryEmail,
            status: 'pending',
            recordsPending: true,
            recordsRewritten,
            rolesAdopted: Number(committed.data.rolesAdopted ?? 0),
            rolesRetired: Number(committed.data.rolesRetired ?? 0),
            attemptCount,
            recordOids: [...plan.recordOids],
            recordsCompletedOids: [...rewriteOutcome.completedOids],
            primaryExpectedVersion: proofBundle?.primaryExpectedVersion,
            secondaryExpectedVersion: proofBundle?.secondaryExpectedVersion,
            proofHash: proofBundle?.proofHash,
            assignmentSnapshot: proofBundle?.assignmentSnapshot,
            proofActorId: proofBundle?.proofActorId,
          },
          undefined,
          attemptCount,
          'pending'
        );
        return Object.freeze({
          data: Object.freeze({
            ...committed.data,
            recordsRewritten,
            recordsPending: true,
            linkOperationId: operationId,
          }),
          version: committed.version,
          auditEventId: committed.auditEventId,
          requestId: committed.requestId,
          changed: true,
        });
      }
      // AUTH-TXN-001 completion: `completed` is contingent on the durable
      // completion audit. Both persist in ONE transaction — a failure leaves
      // the operation `pending` (fail closed) instead of claiming completion
      // without audit proof. Errors are never swallowed.
      try {
        await this.dependencies.runTransaction(async completionConnection => {
          await this.dependencies.audit().createSucceededEvent(
            {
              ...auditInput,
              eventType: 'user.link-operation-completed',
              targetId: String(committed.data.primaryUserId),
              after: {
                ...committed.data,
                recordsRewritten,
                recordsPending: false,
                linkOperationId: operationId,
              },
            },
            completionConnection
          );
          await this.writeLinkOperationState(
            {
              operationId,
              brandId: String(command.brandId ?? ''),
              primaryUserId: String(committed.data.primaryUserId),
              secondaryUserId: String(committed.data.secondaryUserId),
              primaryUsername: plan.primaryUsername,
              secondaryUsername: plan.secondaryUsername,
              secondaryEmail: plan.secondaryEmail,
              status: 'completed',
              recordsPending: false,
              recordsRewritten,
              rolesAdopted: Number(committed.data.rolesAdopted ?? 0),
              rolesRetired: Number(committed.data.rolesRetired ?? 0),
              attemptCount,
              recordOids: [...plan.recordOids],
              recordsCompletedOids: [...rewriteOutcome.completedOids],
              primaryExpectedVersion: proofBundle?.primaryExpectedVersion,
              secondaryExpectedVersion: proofBundle?.secondaryExpectedVersion,
              proofHash: proofBundle?.proofHash,
              assignmentSnapshot: proofBundle?.assignmentSnapshot,
              proofActorId: proofBundle?.proofActorId,
            },
            completionConnection,
            attemptCount,
            'pending'
          );
        });
      } catch (completionError) {
        // Fail closed: completion audit/persistence failed, so the operation
        // stays pending for bounded retry instead of reporting completed.
        await this.dependencies.audit().recordAttempt(
          {
            ...auditInput,
            eventType: 'user.link-records-pending',
            targetId: String(committed.data.primaryUserId),
            reasonCode: 'authorization.internal-error',
            after: { ...committed.data, recordsPending: true, linkOperationId: operationId },
          },
          'failed'
        );
        void completionError;
        return Object.freeze({
          data: Object.freeze({
            ...committed.data,
            recordsRewritten,
            recordsPending: true,
            linkOperationId: operationId,
          }),
          version: committed.version,
          auditEventId: committed.auditEventId,
          requestId: committed.requestId,
          changed: true,
        });
      }
      return Object.freeze({
        data: Object.freeze({
          ...committed.data,
          recordsRewritten,
          recordsPending: false,
          linkOperationId: operationId,
        }),
        version: committed.version,
        auditEventId: committed.auditEventId,
        requestId: committed.requestId,
        changed: true,
      });
    }

    /**
     * AUTH-LINK-PROOF-001 server-bound preview/confirmation flow. Read-only:
     * resolves the canonical primary, validates both accounts are active
     * brand members, reads live pair versions, counts adoptable/retirable
     * sourced tuples, and issues a short-lived pair-bound confirmation token
     * plus a stable `linkOperationId`. The writer re-verifies the token and
     * both versions before any write; preview alone never mutates.
     */
    public async previewLinkAccounts(command: PreviewLinkAccountsCommand): Promise<LinkAccountsPreview> {
      const brandId = requiredAuthorizationText(command.brandId, 'brandId', 256);
      this.requireAssignmentOrLegacyScope(command, brandId, 'user.account-link.manage' as ScopeKey);
      const primaryId = requiredAuthorizationText(command.primaryUserId, 'primaryUserId', 256);
      const secondaryId = requiredAuthorizationText(command.secondaryUserId, 'secondaryUserId', 256);
      if (primaryId === secondaryId) {
        throw new AuthorizationAdministrationError('authorization.invalid-role', 400, 'Cannot link a user to itself.');
      }
      return this.dependencies.runTransaction(async connection => {
        if (typeof UserLink === 'undefined') {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-role',
            400,
            'Account linking is unavailable.'
          );
        }
        const primary = await this.loadLinkPreviewPrimary(primaryId, connection);
        const secondary = (await User.findOne({ id: secondaryId }).usingConnection(connection)) as
          | UserAttributes
          | undefined;
        if (secondary === undefined) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
        }
        this.assertLinkPreviewPairActive(primary, secondary);
        if (!(await this.principalBelongsToBrand(primary.id, brandId, connection))) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
        }
        if (!(await this.principalBelongsToBrand(secondary.id, brandId, connection))) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
        }
        const primaryLiveVersion = this.liveLoginDisabledVersion(primary);
        const secondaryLiveVersion = this.liveLoginDisabledVersion(secondary);
        // AUTH-LINK-003: bounded authoritative snapshots for BOTH accounts.
        // The snapshot (tuple identities + versions + lifecycle) and the
        // operation ID are bound into the confirmation content so drift or
        // operation confusion fails closed at apply time.
        const {
          rolesToAdopt,
          rolesToRetire,
          snapshot: assignmentSnapshot,
        } = await this.snapshotLinkAssignments(String(primary.id), String(secondary.id), brandId, connection);
        const linkOperationId = this.dependencies.randomId();
        const content = this.linkProofContent(
          String(primary.id),
          String(secondary.id),
          primaryLiveVersion,
          secondaryLiveVersion,
          assignmentSnapshot,
          linkOperationId
        );
        const confirmationToken = this.issueConfirmation(
          { ...command, requestId: command.requestId },
          'account-link',
          `account-link:${content.primaryUserId}:${content.secondaryUserId}`,
          secondaryLiveVersion,
          content
        );
        return Object.freeze({
          primaryUserId: content.primaryUserId,
          secondaryUserId: content.secondaryUserId,
          primaryExpectedVersion: primaryLiveVersion,
          secondaryExpectedVersion: secondaryLiveVersion,
          primaryUsername: String(primary.username ?? ''),
          secondaryUsername: String(secondary.username ?? ''),
          rolesToAdopt,
          rolesToRetire,
          confirmationToken,
          linkOperationId,
        });
      });
    }

    /**
     * AUTH-TXN-001: expose durable link-operation state. Returns the
     * pending/running/completed/failed record keyed by the stable operation
     * ID so clients can poll and retry idempotently. 404 when unknown.
     */
    public async getLinkOperation(
      actor: AuthorizationContext,
      brandId: string,
      linkOperationId: string
    ): Promise<LinkOperationState> {
      const operationId = requiredAuthorizationText(linkOperationId, 'linkOperationId', 256);
      const cleanBrandId = requiredAuthorizationText(brandId, 'brandId', 256);
      this.actorId({ actor, brandId: cleanBrandId, requestId: 'link-operation-read' });
      // AUTH-P5-004 actor brand binding: a brand-scoped actor reads only its
      // own brand's operations; cross-brand rows are opaque 404 below.
      if (actor.contextType === 'brand' && actor.brand?.id !== cleanBrandId) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The link operation was not found.');
      }
      if (
        !this.hasProvenScope(actor, ASSIGNMENT_READ_SCOPE) &&
        !this.hasProvenScope(actor, ASSIGNMENT_MANAGE_SCOPE) &&
        !this.hasProvenScope(actor, 'user.account-link.manage' as ScopeKey)
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.scope-denied',
          403,
          'The actor lacks the required authorization scope.'
        );
      }
      const stored = await this.readLinkOperationState(operationId);
      if (stored === undefined || stored.brandId !== cleanBrandId) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The link operation was not found.');
      }
      return Object.freeze({ ...stored });
    }

    /**
     * AUTH-TXN-001 bounded idempotent retry over the MANDATORY retry DTO. A
     * completed operation returns its stored result without re-executing. A
     * pending operation resumes SAFELY: the caller re-proves the full preview
     * contract (operation ID, both account versions, confirmation token) and
     * every element is verified against the STORED durable proof before only
     * the record phase re-runs — the authorization commit is never
     * re-executed, so retry cannot conflict with its own prior commit. Rows
     * missing proof on a resumable status are rejected as incomplete (never
     * rebuilt from mutable live users). Attempts beyond the bounded limit
     * fail closed with 422.
     */
    public async retryLinkOperation(
      command: RetryLinkOperationCommand
    ): Promise<AuthorizationMutationResult<UserAccountLinkResult>> {
      // AUTH-P5-004: retries carry the same provenance/scope/brand gate as the
      // initial link — a server-issued actor with proven
      // `user.account-link.manage` (or assignment-manage) bound to the
      // operation brand. The stored pair match below re-verifies brand+pair.
      const retryBrandId = requiredAuthorizationText(command.brandId, 'brandId', 256);
      this.requireAssignmentOrLegacyScope(command, retryBrandId, 'user.account-link.manage' as ScopeKey);
      // AUTH-P5-006: normalize to the canonical mandatory retry DTO first.
      // Omitted/invalid operation ID, versions, or token fail closed here
      // (never a partial validation of scope/op/brand/pair alone).
      const proof = normalizeLinkUserAccountsRequest(command);
      const operationId = proof.linkOperationId;
      const stored = await this.readLinkOperationState(operationId);
      if (stored === undefined) {
        throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The link operation was not found.');
      }
      if (
        stored.brandId !== String(command.brandId ?? '') ||
        stored.primaryUserId !== String(command.primaryUserId ?? '') ||
        stored.secondaryUserId !== String(command.secondaryUserId ?? '')
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The link retry does not match the stored operation pair.'
        );
      }
      // Bind even read-only resume to the stored proof versions, then to the
      // full stored proof (including the confirmation token). The completed
      // idempotent resume verifies the token exactly like a work-resuming
      // retry: an expired or tampered token fails closed with preview-stale
      // instead of returning the stored result (no brand+pair-only bypass).
      if (
        proof.primaryExpectedVersion !== stored.primaryExpectedVersion ||
        proof.secondaryExpectedVersion !== stored.secondaryExpectedVersion
      ) {
        // `undefined` stored versions mark rows that never carried proof
        // (failed rows predate proof capture): they fail closed here rather
        // than comparing against undefined.
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The link retry does not match the stored operation proof.'
        );
      }
      if (stored.status === 'completed' && stored.recordsPending !== true) {
        // The shared completed-proof gate re-checks caller versions plus the
        // CURRENT caller actor binding and the token against the stored
        // proof (the inline version check above stays as the first fail-fast
        // mismatch signal with the same stable code).
        this.requireCompletedLinkProof(stored, proof, command);
        return this.resumeStoredLinkResult(command, stored, false);
      }
      if (stored.attemptCount >= LINK_OPERATION_MAX_ATTEMPTS) {
        throw new AuthorizationAdministrationError(
          'authorization.bulk-invalid',
          422,
          'The link operation exceeded the bounded retry limit.'
        );
      }
      // Failed BEFORE the authorization commit: re-run the whole link (the
      // prior attempt wrote nothing durable, so no self-conflict is possible).
      // The mandatory DTO carries the full proof the fresh link requires.
      if (stored.status === 'failed') {
        return this.linkUserAccounts(command);
      }
      // Resumable statuses MUST carry the complete durable plan + proof.
      // Anything less is rejected as incomplete — the plan is never rebuilt
      // from mutable live users, which could authorize a different pairing
      // than the committed one.
      const storedSnapshot = stored.assignmentSnapshot;
      if (
        stored.status !== 'pending' ||
        !Array.isArray(stored.recordOids) ||
        stored.proofHash === undefined ||
        storedSnapshot === undefined ||
        stored.primaryExpectedVersion === undefined ||
        stored.secondaryExpectedVersion === undefined ||
        stored.proofActorId === undefined
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The link operation plan is unavailable for retry.'
        );
      }
      // Bind the retry token to the stored proof: it must reproduce the
      // committed confirmation exactly (operation, pair, brand, versions,
      // preview actor, content hash).
      this.verifyStoredLinkProof(stored, proof);
      // Pending with committed authorization: resume only the record phase
      // over the STORED plan (never fresh discovery scope). The rewrite is
      // idempotent (already-rewritten rows carry no secondary references and
      // are skipped), so partial multi-record progress converges instead of
      // restarting.
      const auditInput = this.auditInput(command, 'user.linked', 'user', stored.primaryUserId);
      const nextAttempt = stored.attemptCount + 1;
      // AUTH-P5-004 retry fencing: claim the CAS lease (attempt count + status)
      // BEFORE record I/O so concurrent retries serialize; a lost lease fails
      // closed with version-conflict instead of double-rewriting records.
      await this.writeLinkOperationState(
        {
          ...stored,
          status: 'pending',
          recordsPending: true,
          attemptCount: nextAttempt,
        },
        undefined,
        stored.attemptCount,
        stored.status
      );
      const resumePlan = {
        primaryUsername: stored.primaryUsername,
        secondaryUsername: stored.secondaryUsername,
        secondaryEmail: stored.secondaryEmail,
      };
      const retryProgress: string[] = [];
      let rewriteOutcome: { readonly rewritten: number; readonly completedOids: readonly string[] };
      try {
        rewriteOutcome = await this.rewriteLinkedRecordAuthorizationsSeparateStore(
          resumePlan.primaryUsername,
          resumePlan.secondaryUsername,
          resumePlan.secondaryEmail,
          stored.brandId,
          [...stored.recordOids],
          retryProgress
        );
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code ?? 'authorization.internal-error')
            : 'authorization.internal-error';
        // AUTH-P5-004: CAS on the currently persisted attempt count AND
        // status. Progress is the durable union of previously completed and
        // newly completed OIDs (monotonic — never reset).
        const partialCompleted = Object.freeze([...new Set([...stored.recordsCompletedOids, ...retryProgress])]);
        await this.writeLinkOperationState(
          {
            ...stored,
            status: 'pending',
            recordsPending: true,
            recordsRewritten: partialCompleted.length,
            recordsCompletedOids: [...partialCompleted],
            attemptCount: nextAttempt,
          },
          undefined,
          nextAttempt,
          'pending'
        );
        await this.dependencies.audit().recordAttempt(
          {
            ...auditInput,
            eventType: 'user.link-records-pending',
            targetId: stored.primaryUserId,
            reasonCode: code,
            after: { recordsPending: true, errorCode: code, linkOperationId: operationId },
          },
          'failed'
        );
        return this.resumeStoredLinkResult(
          command,
          { ...stored, recordsPending: true, recordsRewritten: partialCompleted.length, attemptCount: nextAttempt },
          false
        );
      }
      if (rewriteOutcome.rewritten < 0) {
        // AUTH-P5-004: CAS on the leased attempt count AND status.
        await this.writeLinkOperationState(
          {
            ...stored,
            status: 'pending',
            recordsPending: true,
            attemptCount: nextAttempt,
          },
          undefined,
          nextAttempt,
          'pending'
        );
        return this.resumeStoredLinkResult(
          command,
          { ...stored, recordsPending: true, attemptCount: nextAttempt },
          false
        );
      }
      // Durable monotonic progress: previously completed plus newly completed.
      const totalCompleted = Object.freeze([
        ...new Set([...stored.recordsCompletedOids, ...rewriteOutcome.completedOids]),
      ]);
      const resumed: LinkOperationState = {
        ...stored,
        status: 'completed',
        recordsPending: false,
        recordsRewritten: totalCompleted.length,
        recordsCompletedOids: [...totalCompleted],
        attemptCount: nextAttempt,
      };
      // Completed contingent on the durable completion audit in one
      // transaction; failures stay pending (fail closed, never swallowed).
      await this.dependencies.runTransaction(async completionConnection => {
        await this.dependencies.audit().createSucceededEvent(
          {
            ...auditInput,
            eventType: 'user.link-operation-completed',
            targetId: stored.primaryUserId,
            after: { recordsRewritten: totalCompleted.length, recordsPending: false, linkOperationId: operationId },
          },
          completionConnection
        );
        await this.writeLinkOperationState(resumed, completionConnection, nextAttempt, 'pending');
      });
      return this.resumeStoredLinkResult(command, resumed, false);
    }

    /**
     * AUTH-TXN-001 restart recovery: durable list of resumable (pending /
     * running) link operations. Terminal rows are never returned. When the
     * durable `UserLinkOperation` model exists its answer is authoritative
     * (durable read errors fail closed with 503, never a silent empty list);
     * the process-local mirror serves reduced runtimes without the model only.
     */
    public async recoverIncompleteLinkOperations(limit = 50): Promise<readonly LinkOperationState[]> {
      const bounded = Number.isSafeInteger(limit) && limit >= 1 ? Math.min(Number(limit), 200) : 50;
      if (typeof UserLinkOperation === 'undefined') {
        return Object.freeze(
          [...linkOperationFallback.values()]
            .filter(state => state.status === 'pending' || state.status === 'running')
            .sort((left, right) => left.operationId.localeCompare(right.operationId))
            .slice(0, bounded)
            .map(state => Object.freeze({ ...state }))
        );
      }
      let rows: unknown;
      try {
        rows = await UserLinkOperation.find({
          or: [{ status: 'pending' }, { status: 'running' }],
        }).limit(bounded);
      } catch (error) {
        if (isAuthorizationAdministrationError(error)) throw error;
        throw new AuthorizationAdministrationError(
          'authorization.audit-unavailable',
          503,
          'The link operation state is unavailable.'
        );
      }
      const states: LinkOperationState[] = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        const operationId = String((row as Record<string, unknown>).operationId ?? '');
        if (operationId.length === 0) continue;
        const stored = await this.readLinkOperationState(operationId);
        if (stored !== undefined && (stored.status === 'pending' || stored.status === 'running')) {
          states.push(stored);
        }
      }
      return Object.freeze(
        states.sort((left, right) => left.operationId.localeCompare(right.operationId)).slice(0, bounded)
      );
    }

    /**
     * AUTH-TXN-001 restart-safe replay/compensation over the STORED durable
     * plan. Unlike `retryLinkOperation` (which re-proves a caller-supplied
     * confirmation token), this server-side recovery consumes ONLY the
     * committed plan + proof already persisted in each operation row
     * (`recordOids`, `recordsCompletedOids`, `proofHash`,
     * `assignmentSnapshot`, bound account versions, `proofActorId`) and
     * re-drives ONLY the record phase — the authorization commit is never
     * re-executed. Each resumable row is CAS-claimed (attempt count + status
     * fenced) before record I/O so concurrent recovery workers serialize; a
     * lost lease is skipped, an exhausted budget marks the row failed, and
     * rows with an incomplete stored plan fail closed instead of rebuilding a
     * plan from mutable live users. Every terminal (`completed`) transition
     * persists fenced by operationId + claimed attempt/status inside ONE
     * transaction with the durable completion audit; failures stay `pending`
     * (fail closed, never swallowed). Compensation is monotonic progress:
     * previously completed OIDs union newly completed OIDs, so partial
     * multi-record work converges instead of restarting. Recovery audit
     * evidence is emitted under the named bounded recovery-process identity
     * (`system-recovery:link-replay`, actorType system-process, authMethod
     * internal), never the stored preview actor.
     *
     * Lift integration: invoke once at startup (and on a bounded schedule)
     * from the lifted server runtime so a restarted process resumes committed
     * link work instead of merely listing it.
     */
    public async replayIncompleteLinkOperations(options?: {
      readonly limit?: number;
      readonly maxAttempts?: number;
      readonly onRewrite?: (
        plan: Pick<
          LinkOperationState,
          'primaryUsername' | 'secondaryUsername' | 'secondaryEmail' | 'brandId' | 'recordOids'
        >,
        progress: string[]
      ) => Promise<{ readonly rewritten: number; readonly completedOids: readonly string[] }>;
    }): Promise<readonly LinkOperationState[]> {
      const limit = Number.isSafeInteger(options?.limit) ? Number(options?.limit) : 50;
      const maxAttempts = Number.isSafeInteger(options?.maxAttempts) ? Number(options?.maxAttempts) : 5;
      const resumable = await this.recoverIncompleteLinkOperations(limit);
      const ordered = [...resumable].sort((left, right) => left.operationId.localeCompare(right.operationId));
      const settled: LinkOperationState[] = [];
      for (const state of ordered) {
        const fresh = await this.readLinkOperationState(state.operationId);
        const current = fresh ?? state;
        if (current.status === 'completed' || current.status === 'failed') {
          settled.push(current);
          continue;
        }
        if (
          current.status !== 'pending' ||
          !Array.isArray(current.recordOids) ||
          current.proofHash === undefined ||
          current.assignmentSnapshot === undefined ||
          current.primaryExpectedVersion === undefined ||
          current.secondaryExpectedVersion === undefined ||
          current.proofActorId === undefined
        ) {
          settled.push(
            await this.failIncompleteLinkOperation(current, 'The link operation plan is unavailable for retry.')
          );
          continue;
        }
        if (current.attemptCount >= maxAttempts || current.attemptCount >= LINK_OPERATION_MAX_ATTEMPTS) {
          settled.push(
            await this.failIncompleteLinkOperation(current, 'The link operation exceeded the bounded retry limit.')
          );
          continue;
        }
        const nextAttempt = current.attemptCount + 1;
        try {
          await this.writeLinkOperationState(
            { ...current, status: 'pending', recordsPending: true, attemptCount: nextAttempt },
            undefined,
            current.attemptCount,
            current.status
          );
        } catch (claimError) {
          if (isAuthorizationAdministrationError(claimError)) {
            const reread = await this.readLinkOperationState(current.operationId);
            if (reread !== undefined) {
              settled.push(reread);
              continue;
            }
          }
          throw claimError;
        }
        const recoveryAudit: AuthorizationAuditEventInput = {
          eventType: 'user.linked',
          actorType: 'system-process',
          actorId: LINK_RECOVERY_PROCESS_ACTOR_ID,
          authMethod: 'internal',
          brandId: current.brandId,
          targetType: 'user',
          targetId: current.primaryUserId,
          requestId: `link-recovery:${current.operationId}`,
        };
        const retryProgress: string[] = [];
        let rewriteOutcome: { readonly rewritten: number; readonly completedOids: readonly string[] };
        try {
          rewriteOutcome =
            options?.onRewrite !== undefined
              ? await options.onRewrite(
                  {
                    primaryUsername: current.primaryUsername,
                    secondaryUsername: current.secondaryUsername,
                    secondaryEmail: current.secondaryEmail,
                    brandId: current.brandId,
                    recordOids: [...current.recordOids],
                  },
                  retryProgress
                )
              : await this.rewriteLinkedRecordAuthorizationsSeparateStore(
                  current.primaryUsername,
                  current.secondaryUsername,
                  current.secondaryEmail,
                  current.brandId,
                  [...current.recordOids],
                  retryProgress
                );
        } catch (error) {
          const code =
            typeof error === 'object' && error !== null && 'code' in error
              ? String((error as { code?: unknown }).code ?? 'authorization.internal-error')
              : 'authorization.internal-error';
          const partialCompleted = Object.freeze([...new Set([...current.recordsCompletedOids, ...retryProgress])]);
          await this.writeLinkOperationState(
            {
              ...current,
              status: 'pending',
              recordsPending: true,
              recordsRewritten: partialCompleted.length,
              recordsCompletedOids: [...partialCompleted],
              attemptCount: nextAttempt,
            },
            undefined,
            nextAttempt,
            'pending'
          );
          await this.dependencies.audit().recordAttempt(
            {
              ...recoveryAudit,
              eventType: 'user.link-records-pending',
              reasonCode: code,
              after: { recordsPending: true, errorCode: code, linkOperationId: current.operationId },
            },
            'failed'
          );
          const reread = await this.readLinkOperationState(current.operationId);
          settled.push(reread ?? { ...current, status: 'pending', recordsPending: true, attemptCount: nextAttempt });
          continue;
        }
        if (rewriteOutcome.rewritten < 0) {
          await this.writeLinkOperationState(
            { ...current, status: 'pending', recordsPending: true, attemptCount: nextAttempt },
            undefined,
            nextAttempt,
            'pending'
          );
          const reread = await this.readLinkOperationState(current.operationId);
          settled.push(reread ?? { ...current, status: 'pending', recordsPending: true, attemptCount: nextAttempt });
          continue;
        }
        const totalCompleted = Object.freeze([
          ...new Set([...current.recordsCompletedOids, ...rewriteOutcome.completedOids]),
        ]);
        const resumed: LinkOperationState = {
          ...current,
          status: 'completed',
          recordsPending: false,
          recordsRewritten: totalCompleted.length,
          recordsCompletedOids: [...totalCompleted],
          attemptCount: nextAttempt,
        };
        try {
          await this.dependencies.runTransaction(async completionConnection => {
            await this.dependencies.audit().createSucceededEvent(
              {
                ...recoveryAudit,
                eventType: 'user.link-operation-completed',
                after: {
                  recordsRewritten: totalCompleted.length,
                  recordsPending: false,
                  linkOperationId: current.operationId,
                },
              },
              completionConnection
            );
            await this.writeLinkOperationState(resumed, completionConnection, nextAttempt, 'pending');
          });
        } catch {
          await this.writeLinkOperationState(
            { ...current, status: 'pending', recordsPending: true, attemptCount: nextAttempt },
            undefined,
            nextAttempt,
            'pending'
          );
          const reread = await this.readLinkOperationState(current.operationId);
          settled.push(reread ?? { ...current, status: 'pending', recordsPending: true, attemptCount: nextAttempt });
          continue;
        }
        const completed = await this.readLinkOperationState(current.operationId);
        settled.push(completed ?? resumed);
      }
      return Object.freeze([...settled]);
    }

    /**
     * AUTH-TXN-001 recovery terminal-failure writer. Fenced by operationId +
     * the freshly read attempt/status (pinned into the update predicate), so a
     * concurrent claim winner is never overwritten; terminal rows are
     * idempotent.
     */
    private async failIncompleteLinkOperation(
      current: LinkOperationState,
      detail: string
    ): Promise<LinkOperationState> {
      const fresh = await this.readLinkOperationState(current.operationId);
      const target = fresh ?? current;
      if (target.status === 'completed' || target.status === 'failed') return target;
      const failed: LinkOperationState = { ...target, status: 'failed', recordsPending: false };
      try {
        await this.writeLinkOperationState(failed, undefined, target.attemptCount, target.status);
      } catch (error) {
        if (isAuthorizationAdministrationError(error)) {
          const reread = await this.readLinkOperationState(current.operationId);
          if (reread !== undefined) return reread;
        }
        throw error;
      }
      await this.dependencies.audit().recordAttempt(
        {
          eventType: 'user.linked',
          actorType: 'system-process',
          actorId: LINK_RECOVERY_PROCESS_ACTOR_ID,
          authMethod: 'internal',
          brandId: target.brandId,
          targetType: 'user',
          targetId: target.primaryUserId,
          requestId: `link-recovery:${target.operationId}`,
          reasonCode: 'authorization.bulk-invalid',
          after: { recordsPending: false, linkOperationId: target.operationId, detail },
        },
        'failed'
      );
      return (await this.readLinkOperationState(current.operationId)) ?? failed;
    }

    /**
     * AUTH-P5-009 completed-operation proof gate shared by every completed
     * resume path (`linkUserAccounts` early resume, the in-transaction
     * existing-link conflict resume, and the `retryLinkOperation` completed
     * resume). All paths require the same durable proof: operation identity
     * (stored.operationId === caller operation ID), brand/pair match, the
     * caller-supplied account versions bound to the stored proof versions
     * (a resume that ignores caller versions is rejected), the CURRENT
     * caller actor bound to the stored proof actor (a different operator
     * cannot replay another actor's completed proof), and a complete stored
     * row (proofHash, assignmentSnapshot, both versions, proofActorId). The
     * caller confirmation token is then verified against the stored proof
     * (signature + expiry + operation/target/brand/version/actor/content +
     * proof hash). Any gap fails closed; an expired token surfaces the
     * deliberate preview-stale expiry error instead of returning stored data.
     * There is no brand+pair-only bypass.
     */
    private requireCompletedLinkProof(
      stored: LinkOperationState,
      proof: {
        readonly linkConfirmationToken: string;
        readonly linkOperationId: string;
        readonly brandId: string;
        readonly primaryUserId: string;
        readonly secondaryUserId: string;
        readonly primaryExpectedVersion: number;
        readonly secondaryExpectedVersion: number;
      },
      command: AuthorizationAdministrationCommand
    ): void {
      if (
        stored.operationId !== proof.linkOperationId ||
        stored.brandId !== String(proof.brandId ?? '') ||
        stored.primaryUserId !== String(proof.primaryUserId ?? '') ||
        stored.secondaryUserId !== String(proof.secondaryUserId ?? '') ||
        stored.brandId.length === 0 ||
        stored.primaryUserId.length === 0 ||
        stored.secondaryUserId.length === 0
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The link retry does not match the stored operation proof.'
        );
      }
      if (
        stored.proofHash === undefined ||
        stored.assignmentSnapshot === undefined ||
        stored.primaryExpectedVersion === undefined ||
        stored.secondaryExpectedVersion === undefined ||
        stored.proofActorId === undefined
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The link operation proof is incomplete.'
        );
      }
      // Caller versions are bound on every resume path: a completed resume
      // that ignores them would return stale authority to a caller that never
      // observed the committed account state.
      if (
        proof.primaryExpectedVersion !== stored.primaryExpectedVersion ||
        proof.secondaryExpectedVersion !== stored.secondaryExpectedVersion
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The link retry does not match the stored operation proof.'
        );
      }
      // The CURRENT caller actor is bound to the stored proof actor: only the
      // operator whose preview produced the committed confirmation may replay
      // the completed result. `actorId` additionally re-validates trusted
      // server-issued provenance (forged actors fail closed with 401).
      if (this.actorId(command) !== stored.proofActorId) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The link retry does not match the stored operation proof.'
        );
      }
      this.verifyStoredLinkProof(stored, proof);
    }

    /**
     * AUTH-P5-006 retry proof verification against the STORED durable proof
     * (not the live caller claims). Decodes the caller token (signature +
     * expiry) and requires operation, target, brand, secondary version,
     * preview actor, and content hash to reproduce the committed confirmation
     * exactly. Any mismatch fails closed with preview-stale.
     */
    private verifyStoredLinkProof(
      stored: LinkOperationState,
      proof: { readonly linkConfirmationToken: string; readonly linkOperationId: string }
    ): void {
      const expectedContent = this.linkProofContent(
        stored.primaryUserId,
        stored.secondaryUserId,
        Number(stored.primaryExpectedVersion),
        Number(stored.secondaryExpectedVersion),
        stored.assignmentSnapshot ?? [],
        stored.operationId
      );
      let claims: AuthorizationConfirmationClaims;
      try {
        claims = verifyAuthorizationConfirmationToken(
          proof.linkConfirmationToken,
          this.dependencies.getConfirmationSecret(),
          this.dependencies.now()
        );
      } catch (error) {
        // Preserve the deliberate expired-token error so an expired
        // confirmation surfaces as an expiry (not a generic invalid proof);
        // all token failures remain fail-closed preview-stale.
        if (isAuthorizationAdministrationError(error) && error.code === 'authorization.preview-stale') throw error;
        throw new AuthorizationAdministrationError(
          'authorization.preview-stale',
          409,
          'The link retry proof is invalid.'
        );
      }
      if (
        claims.operation !== 'account-link' ||
        claims.target !== `account-link:${stored.primaryUserId}:${stored.secondaryUserId}` ||
        claims.brandId !== stored.brandId ||
        claims.expectedVersion !== stored.secondaryExpectedVersion ||
        claims.actorId !== stored.proofActorId ||
        claims.contentHash !== authorizationContentHash(expectedContent) ||
        this.linkProofHash(proof.linkConfirmationToken) !== stored.proofHash
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.preview-stale',
          409,
          'The link retry does not match the stored operation proof.'
        );
      }
    }
    private liveLoginDisabledVersion(user: UserAttributes): number {
      const raw = (user as UserAttributes).loginDisabledVersion as unknown;
      return typeof raw === 'number' && Number.isSafeInteger(raw) ? (raw as number) : 1;
    }

    private async loadLinkPreviewPrimary(primaryId: string, connection: Sails.Connection): Promise<UserAttributes> {
      let primary = await this.loadAccessTargetUser(primaryId, connection);
      const seen = new Set<string>();
      for (let depth = 0; depth < MAX_LINK_DEPTH; depth += 1) {
        if (seen.has(primary.id)) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
        }
        seen.add(primary.id);
        if (!primary.linkedPrimaryUserId?.trim()) break;
        const next = (await User.findOne({ id: primary.linkedPrimaryUserId }).usingConnection(connection)) as
          | UserAttributes
          | undefined;
        if (next === undefined) {
          throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The target user was not found.');
        }
        primary = next;
      }
      if (primary.linkedPrimaryUserId?.trim() || primary.accountLinkState === 'linked-alias') {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-role',
          400,
          'Primary user cannot be a linked alias.'
        );
      }
      return primary;
    }

    private assertLinkPreviewPairActive(primary: UserAttributes, secondary: UserAttributes): void {
      if (primary.loginDisabled === true) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-role',
          400,
          'Cannot link accounts: primary user is disabled.'
        );
      }
      if (secondary.loginDisabled === true) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-role',
          400,
          'Cannot link accounts: secondary user is disabled.'
        );
      }
      if (secondary.accountLinkState === 'linked-alias') {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'Secondary user is already linked to another primary account.'
        );
      }
    }

    /**
     * AUTH-LINK-003 authoritative assignment snapshots for BOTH accounts in
     * the link brand. Bounded (max+1 probe, fail closed). Each entry pins the
     * tuple identity + version so the writer can reject drift, plus the role
     * context so foreign-brand authority is rejected before confirmation.
     */
    /**
     * AUTH-P5-005: bounded authoritative snapshots for ALL affected brands.
     * Both accounts load every-brand assignment state (no brand filter), so
     * foreign-brand drift cannot hide outside the requested-brand view; every
     * effective tuple whose role or tuple brand escapes the link brand (other
     * than unbranded system tuples) then fails closed. The proof snapshot
     * carries complete tuple identity — tuple id, principal, tuple brand,
     * role id/key, version, status, source/sourceKey, sourcePresent, expiry —
     * normalized and sorted; operation ID and account/link versions travel in
     * the confirmation content alongside it (see preview/apply call sites).
     */
    private async snapshotLinkAssignments(
      primaryId: string,
      secondaryId: string,
      brandId: string,
      connection: Sails.Connection
    ): Promise<{
      readonly rolesToAdopt: number;
      readonly rolesToRetire: number;
      readonly snapshot: readonly string[];
    }> {
      const now = this.dependencies.now();
      const [primaryAll, secondaryAll] = await Promise.all([
        this.authoritativeAllAssignments(primaryId, connection),
        this.authoritativeAllAssignments(secondaryId, connection),
      ]);
      if (primaryAll.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'The principal assignment state exceeds the bounded operation limit.'
        );
      }
      if (secondaryAll.length > AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'The principal assignment state exceeds the bounded operation limit.'
        );
      }
      const roleIds = uniqueStrings(
        [...primaryAll, ...secondaryAll]
          .map(row => associationId(row.role))
          .filter((value): value is string => value !== undefined)
      );
      const roles =
        roleIds.length > 0
          ? ((await Role.find({ id: roleIds }).limit(roleIds.length).usingConnection(connection)) as RoleAttributes[])
          : [];
      const rolesById = new Map(roles.map(role => [role.id, role]));
      // Foreign-authority rejection: any effective tuple (either account)
      // whose role is unresolved, system-scoped, or brand-escaped fails closed
      // here. There is no silent skip: an assignment row pointing at a missing
      // role, or a system tuple with no brand, must never authorize a link —
      // system authority moves only through separately authorized system flows.
      for (const tuple of [...primaryAll, ...secondaryAll]) {
        if (!activeAt(tuple, now)) continue;
        const role = rolesById.get(associationId(tuple.role) ?? '');
        if (role === undefined) {
          throw new AuthorizationAdministrationError(
            'authorization.not-found',
            404,
            'The account holds authority from an unresolved role.'
          );
        }
        const tupleBrand = associationId(tuple.branding);
        const roleBrand = associationId(role.branding);
        if (role.contextType === 'system') {
          throw new AuthorizationAdministrationError(
            'authorization.not-found',
            404,
            'The account holds system authority outside a separately authorized system flow.'
          );
        }
        if (tupleBrand !== brandId || roleBrand !== brandId) {
          throw new AuthorizationAdministrationError(
            'authorization.not-found',
            404,
            'The account holds authority outside the active brand context.'
          );
        }
      }
      const secondaryActive = secondaryAll.filter(tuple => activeAt(tuple, now));
      const brandEffective = secondaryActive.filter(tuple => {
        const role = rolesById.get(associationId(tuple.role) ?? '');
        return (
          role !== undefined &&
          role.contextType === 'brand' &&
          associationId(role.branding) === brandId &&
          associationId(tuple.branding) === brandId
        );
      });
      const snapshot = Object.freeze(
        [...primaryAll, ...secondaryAll]
          .map(tuple => {
            const roleId = associationId(tuple.role) ?? '?';
            const role = rolesById.get(associationId(tuple.role) ?? '');
            const roleKey = role !== undefined ? roleIdentity(role) : '?';
            // Bind the complete role identity AND version: a role row mutated
            // between preview and apply (template upgrade, scope change) must
            // drift the snapshot so confirmation fails closed.
            const roleVersion = role !== undefined ? Number(role.version ?? 0) : 0;
            const tupleBrand = associationId(tuple.branding) ?? '';
            const expiryRaw = tuple.expiresAt == null ? undefined : new Date(tuple.expiresAt);
            const expiry =
              expiryRaw === undefined || Number.isNaN(expiryRaw.getTime()) ? 'never' : expiryRaw.toISOString();
            return [
              String(tuple.id ?? '?'),
              String(tuple.principalId ?? '?'),
              tupleBrand,
              roleId,
              roleKey,
              `rv${Number.isSafeInteger(roleVersion) ? roleVersion : 0}`,
              `v${Number(tuple.version ?? 0)}`,
              String(tuple.status ?? '?'),
              String(tuple.source ?? '?'),
              String(tuple.sourceKey ?? '?'),
              `present=${tuple.sourcePresent === true ? '1' : '0'}`,
              `exp=${expiry}`,
            ].join('::');
          })
          .sort()
      );
      return Object.freeze({
        rolesToAdopt: brandEffective.length,
        rolesToRetire: brandEffective.length,
        snapshot,
      });
    }

    private async countLinkAdoptions(
      primaryId: string,
      secondaryId: string,
      brandId: string,
      connection: Sails.Connection
    ): Promise<{ readonly rolesToAdopt: number; readonly rolesToRetire: number }> {
      const { rolesToAdopt, rolesToRetire } = await this.snapshotLinkAssignments(
        primaryId,
        secondaryId,
        brandId,
        connection
      );
      return Object.freeze({ rolesToAdopt, rolesToRetire });
    }

    /**
     * AUTH-P5-006 canonical proof content. The field order is part of the
     * confirmation hash: preview, apply, and retry MUST build it through this
     * helper so hashes agree. Binds pair + both account versions +
     * authoritative assignment snapshot + operation ID.
     */
    private linkProofContent(
      primaryUserId: string,
      secondaryUserId: string,
      primaryExpectedVersion: number,
      secondaryExpectedVersion: number,
      assignmentSnapshot: readonly string[],
      linkOperationId: string
    ): {
      readonly primaryUserId: string;
      readonly secondaryUserId: string;
      readonly primaryExpectedVersion: number;
      readonly secondaryExpectedVersion: number;
      readonly assignmentSnapshot: readonly string[];
      readonly linkOperationId: string;
    } {
      return Object.freeze({
        primaryUserId,
        secondaryUserId,
        primaryExpectedVersion,
        secondaryExpectedVersion,
        assignmentSnapshot,
        linkOperationId,
      });
    }

    private linkProofHash(token: string): string {
      return createHash('sha256').update(token, 'utf8').digest('hex');
    }

    private linkOperationKey(command: LinkUserAccountsCommand): string {
      const explicit = typeof command.linkOperationId === 'string' ? command.linkOperationId.trim() : '';
      if (explicit.length > 0) return explicit;
      // Stable per-link key scoped by the request idempotency key: the same
      // operation retried with the same requestId (or explicit
      // linkOperationId) resumes instead of conflicting, while distinct
      // requests never share retry budget.
      const brandId = String(command.brandId ?? '').trim();
      const primaryId = String(command.primaryUserId ?? '').trim();
      const secondaryId = String(command.secondaryUserId ?? '').trim();
      const requestId = String(command.requestId ?? '').trim();
      return `account-link:${brandId}:${primaryId}:${secondaryId}:${requestId}`;
    }

    private async readLinkOperationState(operationId: string): Promise<LinkOperationState | undefined> {
      if (typeof UserLinkOperation === 'undefined') return linkOperationFallback.get(operationId);
      try {
        const row = (await UserLinkOperation.findOne({ operationId })) as unknown as
          | (LinkOperationState & { readonly id?: string })
          | undefined;
        if (row === undefined || row === null) {
          // AUTH-P5-004: never use the memory mirror when the durable model
          // exists. A miss is authoritative absence (the mirror may hold a
          // rolled-back write from this process); drop the stale mirror entry
          // and report undefined so callers 404 instead of resurrecting
          // state that never committed.
          linkOperationFallback.delete(operationId);
          return undefined;
        }
        const record = row as unknown as Record<string, unknown>;
        const status = record.status as LinkOperationState['status'];
        if (status !== 'pending' && status !== 'running' && status !== 'completed' && status !== 'failed') {
          throw new AuthorizationAdministrationError(
            'authorization.audit-unavailable',
            503,
            'The link operation state is unavailable.'
          );
        }
        const asStringArray = (value: unknown): readonly string[] =>
          Object.freeze((Array.isArray(value) ? value : []).map(entry => String(entry)));
        const asNumberOrUndefined = (value: unknown): number | undefined =>
          typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
        const asStringOrUndefined = (value: unknown): string | undefined =>
          typeof value === 'string' && value.length > 0 ? value : undefined;
        const state: LinkOperationState = {
          operationId: String(record.operationId ?? operationId),
          brandId: String(record.brandId ?? ''),
          primaryUserId: String(record.primaryUserId ?? ''),
          secondaryUserId: String(record.secondaryUserId ?? ''),
          primaryUsername: String(record.primaryUsername ?? ''),
          secondaryUsername: String(record.secondaryUsername ?? ''),
          secondaryEmail: String(record.secondaryEmail ?? ''),
          status,
          recordsPending: record.recordsPending === true,
          recordsRewritten: Number(record.recordsRewritten ?? 0),
          rolesAdopted: Number(record.rolesAdopted ?? 0),
          rolesRetired: Number(record.rolesRetired ?? 0),
          attemptCount: Number(record.attemptCount ?? 0),
          recordOids: asStringArray(record.recordOids),
          recordsCompletedOids: asStringArray(record.recordsCompletedOids),
          primaryExpectedVersion: asNumberOrUndefined(record.primaryExpectedVersion),
          secondaryExpectedVersion: asNumberOrUndefined(record.secondaryExpectedVersion),
          proofHash: asStringOrUndefined(record.proofHash),
          assignmentSnapshot: Array.isArray(record.assignmentSnapshot)
            ? (Object.freeze(record.assignmentSnapshot.map(entry => String(entry))) as readonly string[])
            : undefined,
          proofActorId: asStringOrUndefined(record.proofActorId),
        };
        linkOperationFallback.set(operationId, state);
        return state;
      } catch (error) {
        if (isAuthorizationAdministrationError(error)) throw error;
        // AUTH-P5-004: durable read errors fail closed when the durable model
        // exists. Falling back to process memory would resurrect stale state
        // or hide a committed operation after restart (and a 404 would invite
        // duplicate links), so surface 503 instead. Only the absent-model
        // reduced runtime (model undefined, handled above) uses the mirror.
        throw new AuthorizationAdministrationError(
          'authorization.audit-unavailable',
          503,
          'The link operation state is unavailable.'
        );
      }
    }

    /**
     * Durable operation persistence with CAS on `attemptCount` + `status`.
     *
     * - When `connection` is supplied (inside Commit 1 / completion
     *   transactions) persistence failures THROW so the transaction rolls back
     *   instead of claiming durability it does not have (fail closed).
     * - Transitions use compare-and-set on the prior attempt count AND the
     *   expected prior status: both are pinned IN the update predicate so
     *   concurrent writers lose with 409 instead of silently overwriting
     *   each other (no pre-read/update-by-id split).
     * - Reduced runtimes without the `UserLinkOperation` model keep the
     *   process-local mirror only (never claimed as durability proof).
     */
    private async writeLinkOperationState(
      state: LinkOperationState,
      connection?: Sails.Connection,
      expectedAttemptCount?: number,
      expectedStatus?: LinkOperationState['status']
    ): Promise<void> {
      // AUTH-P5-004: the memory mirror is updated ONLY after the durable
      // persist succeeds. Mirroring before persistence would let a rolled-back
      // transaction resurrect uncommitted state on the next in-process read.
      // Only the absent-model reduced runtime relies on the mirror.
      if (typeof UserLinkOperation === 'undefined') {
        linkOperationFallback.set(state.operationId, Object.freeze({ ...state }));
        return;
      }
      const values = { ...state, attemptCount: state.attemptCount };
      const casPredicate = (): Record<string, unknown> => {
        const predicate: Record<string, unknown> = { operationId: state.operationId };
        if (expectedAttemptCount !== undefined) predicate.attemptCount = expectedAttemptCount;
        if (expectedStatus !== undefined) predicate.status = expectedStatus;
        return predicate;
      };
      const assertExpectedState = (existing: { readonly attemptCount?: unknown; readonly status?: unknown }): void => {
        if (expectedAttemptCount !== undefined && Number(existing.attemptCount ?? 0) !== expectedAttemptCount) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The link operation changed concurrently.'
          );
        }
        if (expectedStatus !== undefined && existing.status !== expectedStatus) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The link operation changed concurrently.'
          );
        }
      };
      const persist = async (): Promise<void> => {
        if (connection !== undefined) {
          const existing = (await UserLinkOperation.findOne({ operationId: state.operationId }).usingConnection(
            connection
          )) as unknown as
            | { readonly id?: string; readonly attemptCount?: number; readonly status?: unknown }
            | undefined;
          if (existing == null) {
            if (expectedAttemptCount !== undefined && expectedAttemptCount !== 0) {
              throw new AuthorizationAdministrationError(
                'authorization.version-conflict',
                409,
                'The link operation changed concurrently.'
              );
            }
            if (expectedStatus !== undefined) {
              throw new AuthorizationAdministrationError(
                'authorization.version-conflict',
                409,
                'The link operation changed concurrently.'
              );
            }
            await UserLinkOperation.create({ ...values }).usingConnection(connection);
          } else {
            assertExpectedState(existing as { readonly attemptCount?: unknown; readonly status?: unknown });
            // AUTH-P5-004: atomic CAS — the expected prior attempt count
            // AND status are pinned IN the update predicate so concurrent
            // writers abort instead of interleaving (no pre-read/update-by-id
            // split). requireUpdatedRow converts a CAS miss (zero rows) to 409.
            requireUpdatedRow(
              (await UserLinkOperation.updateOne(casPredicate())
                .set({ ...values })
                .usingConnection(connection)) as unknown as Record<string, unknown> | undefined,
              'The link operation changed concurrently.'
            );
          }
        } else {
          const existing = (await UserLinkOperation.findOne({ operationId: state.operationId })) as unknown as
            | { readonly id?: string; readonly attemptCount?: number; readonly status?: unknown }
            | undefined;
          if (existing == null) {
            if (expectedAttemptCount !== undefined && expectedAttemptCount !== 0) {
              throw new AuthorizationAdministrationError(
                'authorization.version-conflict',
                409,
                'The link operation changed concurrently.'
              );
            }
            if (expectedStatus !== undefined) {
              throw new AuthorizationAdministrationError(
                'authorization.version-conflict',
                409,
                'The link operation changed concurrently.'
              );
            }
            await UserLinkOperation.create({ ...values });
          } else {
            assertExpectedState(existing as { readonly attemptCount?: unknown; readonly status?: unknown });
            // AUTH-P5-004: atomic CAS — the expected prior attempt count
            // AND status are pinned IN the update predicate so concurrent
            // writers abort instead of interleaving (no pre-read/update-by-id
            // split).
            requireUpdatedRow(
              (await UserLinkOperation.updateOne(casPredicate()).set({
                ...values,
              })) as unknown as Record<string, unknown> | undefined,
              'The link operation changed concurrently.'
            );
          }
        }
      };
      // Fail closed whenever the model exists: a persistence failure must
      // never be silently swallowed into a false durability claim. Only the
      // absent-model reduced runtime falls back to the process-local mirror.
      // The mirror refreshes only here, after a successful durable persist.
      await persist();
      linkOperationFallback.set(state.operationId, Object.freeze({ ...state }));
    }

    private async findResumableLinkOperation(
      command: LinkUserAccountsCommand,
      secondaryId: string,
      brandId: string
    ): Promise<LinkOperationState | undefined> {
      const stored = await this.readLinkOperationState(this.linkOperationKey(command));
      if (
        stored === undefined ||
        stored.brandId !== brandId ||
        stored.secondaryUserId !== secondaryId ||
        String(command.primaryUserId ?? '') !== stored.primaryUserId
      ) {
        return undefined;
      }
      return stored.status === 'completed' || stored.status === 'pending' ? stored : undefined;
    }

    private async findPendingLinkOperationForPair(
      primaryId: string,
      secondaryId: string,
      brandId: string
    ): Promise<LinkOperationState | undefined> {
      const matches = (state: LinkOperationState): boolean =>
        state.status === 'pending' &&
        state.brandId === brandId &&
        state.primaryUserId === primaryId &&
        state.secondaryUserId === secondaryId;
      if (typeof UserLinkOperation !== 'undefined') {
        // AUTH-P5-004: durable errors fail closed — a failed durable lookup
        // must never silently fall back to process memory and report "no
        // pending operation" when one exists. When the durable model exists
        // its answer is authoritative: the process-local mirror is a
        // reduced-runtime facility only and is never consulted here.
        const rows = (await UserLinkOperation.find({
          brandId,
          secondaryUserId: secondaryId,
          status: 'pending',
        }).limit(10)) as unknown as Record<string, unknown>[];
        for (const row of rows ?? []) {
          if (String(row.primaryUserId ?? '') === primaryId) {
            const stored = await this.readLinkOperationState(String(row.operationId ?? ''));
            if (stored !== undefined && matches(stored)) return stored;
          }
        }
        return undefined;
      }
      for (const stored of linkOperationFallback.values()) {
        if (matches(stored)) return stored;
      }
      return undefined;
    }

    private resumeCompletedLinkOperation(
      stored: LinkOperationState
    ): AuthorizationMutationResult<UserAccountLinkResult> {
      const data = Object.freeze({
        primaryUserId: stored.primaryUserId,
        secondaryUserId: stored.secondaryUserId,
        rolesAdopted: stored.rolesAdopted,
        rolesRetired: stored.rolesRetired,
        recordsRewritten: stored.recordsRewritten,
        recordsPending: stored.recordsPending,
        changed: false,
        linkOperationId: stored.operationId,
      });
      return Object.freeze({
        data,
        version: 1,
        auditEventId: stored.operationId,
        requestId: stored.operationId,
        changed: false,
      });
    }

    private resumeStoredLinkResult(
      command: LinkUserAccountsCommand,
      stored: LinkOperationState,
      changed: boolean
    ): AuthorizationMutationResult<UserAccountLinkResult> {
      void command;
      const data = Object.freeze({
        primaryUserId: stored.primaryUserId,
        secondaryUserId: stored.secondaryUserId,
        rolesAdopted: stored.rolesAdopted,
        rolesRetired: stored.rolesRetired,
        recordsRewritten: stored.recordsRewritten,
        recordsPending: stored.recordsPending,
        changed,
        linkOperationId: stored.operationId,
      });
      return Object.freeze({
        data,
        version: 1,
        auditEventId: stored.operationId,
        requestId: stored.operationId,
        changed,
      });
    }

    private normalizedExternalExpectedState(
      expectedState: readonly ExternalAssignmentExpectedState[] | undefined
    ): ReadonlyMap<string, number> | undefined {
      if (expectedState === undefined) return undefined;
      const pinned = new Map<string, number>();
      for (const entry of expectedState) {
        const roleKey = requiredAuthorizationText(entry.roleKey, 'expectedState[].roleKey', 128);
        const version = positiveVersion(entry.expectedVersion, 'expectedState[].expectedVersion');
        if (pinned.has(roleKey)) {
          throw new AuthorizationAdministrationError(
            'authorization.bulk-invalid',
            422,
            'An external expected role may appear only once.'
          );
        }
        pinned.set(roleKey, version);
      }
      return pinned;
    }

    private assertExternalExpectedState(
      expectedState: ReadonlyMap<string, number> | undefined,
      existing: readonly RoleAssignmentAttributes[],
      rolesById: ReadonlyMap<string, RoleAttributes>
    ): void {
      if (expectedState === undefined) return;
      const liveKeys = new Set<string>();
      for (const assignment of existing) {
        const role = rolesById.get(associationId(assignment.role) ?? '');
        if (role === undefined) continue;
        const key = roleIdentity(role);
        liveKeys.add(key);
        const pinned = expectedState.get(key);
        if (pinned === undefined || assignment.version !== pinned) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The external source state changed since it was read.'
          );
        }
      }
      if (liveKeys.size !== expectedState.size || [...expectedState.keys()].some(key => !liveKeys.has(key))) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The external source state changed since it was read.'
        );
      }
    }

    public async replaceExternalAssignments(
      command: ReplaceExternalAssignmentsCommand
    ): Promise<AuthorizationMutationResult<ExternalReplacementResult>> {
      const auditInput = this.auditInput(command, 'assignment.source-replaced', 'role-assignment', command.principalId);
      // P5-G7: normalization/scope/payload/expected-state denials before the
      // required transaction must still create a denied AuthorizationAudit.
      // Wrap the complete apply boundary in the denied-attempt audit wrapper.
      const prePhase = await this.runAuditedPrePhase(auditInput, async () => {
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
        const expectedState = this.normalizedExternalExpectedState(command.expectedState);
        return { provider, sourceIdentity, roleKeys, expectedState };
      });
      const { provider, sourceIdentity, roleKeys, expectedState } = prePhase;
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
        }
        this.assertExternalExpectedState(expectedState, existing, rolesById);
        type ExternalChange =
          | { readonly kind: 'create'; readonly role: RoleAttributes }
          | { readonly kind: 'reactivate'; readonly role: RoleAttributes; readonly current: RoleAssignmentAttributes }
          | {
              readonly kind: 'mark-present';
              readonly role: RoleAttributes;
              readonly current: RoleAssignmentAttributes;
            }
          | { readonly kind: 'mark-absent'; readonly role: RoleAttributes; readonly current: RoleAssignmentAttributes }
          | { readonly kind: 'revoke'; readonly role: RoleAttributes; readonly current: RoleAssignmentAttributes };
        const changes: ExternalChange[] = [];
        let noOp = 0;
        for (const role of roles) {
          const current = existingByRole.get(role.id);
          if (current === undefined) {
            changes.push({ kind: 'create', role });
          } else if (current.status === 'suppressed') {
            if (!current.sourcePresent) changes.push({ kind: 'mark-present', role, current });
            else noOp += 1;
          } else if (current.status !== 'active' || !current.sourcePresent) {
            changes.push({ kind: 'reactivate', role, current });
          } else noOp += 1;
        }
        const desiredRoleIds = new Set(roles.map(role => role.id));
        for (const current of existing) {
          const roleId = associationId(current.role);
          if (roleId === undefined || desiredRoleIds.has(roleId)) continue;
          const role = rolesById.get(roleId);
          if (role === undefined) continue;
          if (current.status === 'suppressed') {
            if (current.sourcePresent) changes.push({ kind: 'mark-absent', role, current });
            else noOp += 1;
          } else if (current.status !== 'revoked' || current.sourcePresent) {
            changes.push({ kind: 'revoke', role, current });
          } else noOp += 1;
        }
        // Lock only protected roles with a planned change. An identical
        // no-op round trip must not bump Role.version via lockProtectedRole.
        const changedProtectedRoles = new Map<string, RoleAttributes>();
        for (const change of changes) {
          if (change.role.protectedKind === 'brand-admin' || change.role.protectedKind === 'system-admin') {
            changedProtectedRoles.set(change.role.id, change.role);
          }
        }
        for (const role of [...changedProtectedRoles.values()].sort((left, right) => left.id.localeCompare(right.id))) {
          await this.lockProtectedRole(role, this.actorId(command), connection);
        }
        let created = 0;
        let reactivated = 0;
        let revoked = 0;
        let suppressedUpdated = 0;
        for (const change of changes) {
          if (change.kind === 'create') {
            await RoleAssignment.create({
              principalType: 'user',
              principalId: user.id,
              role: change.role.id,
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
          } else if (change.kind === 'reactivate') {
            // Every expected CAS update is required: a lost update surfaces as
            // a version conflict with no counters and no success audit.
            requireUpdatedRow(
              (await RoleAssignment.updateOne({ id: change.current.id, version: change.current.version })
                .set({
                  status: 'active',
                  sourcePresent: true,
                  revokedAt: null,
                  revokedBy: null,
                  assignedAt: this.dependencies.now(),
                  assignedBy: this.actorId(command),
                  version: change.current.version + 1,
                })
                .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
              'The external assignment changed since it was read.'
            );
            reactivated += 1;
          } else if (change.kind === 'mark-present') {
            requireUpdatedRow(
              (await RoleAssignment.updateOne({ id: change.current.id, version: change.current.version })
                .set({ sourcePresent: true, version: change.current.version + 1 })
                .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
              'The external assignment changed since it was read.'
            );
            suppressedUpdated += 1;
          } else if (change.kind === 'mark-absent') {
            requireUpdatedRow(
              (await RoleAssignment.updateOne({ id: change.current.id, version: change.current.version })
                .set({ sourcePresent: false, version: change.current.version + 1 })
                .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
              'The external assignment changed since it was read.'
            );
            suppressedUpdated += 1;
          } else {
            requireUpdatedRow(
              (await RoleAssignment.updateOne({ id: change.current.id, version: change.current.version })
                .set({
                  status: 'revoked',
                  sourcePresent: false,
                  revokedAt: this.dependencies.now(),
                  revokedBy: this.actorId(command),
                  version: change.current.version + 1,
                })
                .usingConnection(connection)) as RoleAssignmentAttributes | undefined,
              'The external assignment changed since it was read.'
            );
            revoked += 1;
          }
        }
        for (const role of changedProtectedRoles.values()) await this.assertAdministratorQuorum(role, connection);
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
      const batchId = command.batchId ?? this.dependencies.randomId();
      const auditInput = this.auditInput(
        { ...command, batchId },
        'assignment.batch-applied',
        'role-assignment',
        command.brandId
      );
      // Scope, payload, preview, and confirmation checks run inside the
      // denied-attempt audit wrapper so malformed, tampered, replayed, and
      // scope-denied attempts are recorded atomically.
      const prePhase = await this.runAuditedPrePhase(auditInput, async () => {
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
        return { rows, previewRows, content };
      });
      return this.runMutation({ ...command, batchId }, auditInput, async connection => {
        const fresh = await this.bulkPreviewRows(command, prePhase.rows, connection);
        if (
          authorizationContentHash({
            rows: fresh.map(row => ({ ...row, row: { ...row.row } })),
            reason: optionalAuthorizationText(command.reason, 1_000),
          }) !== authorizationContentHash(prePhase.content)
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
      const scopeKey = normalizedScopeKeys([command.scopeKey])[0];
      const desired = normalizedScopeKeys([...state.effectiveScopeKeys, scopeKey]);
      return this.scopePreview({ ...command, desiredScopeKeys: desired }, undefined, scopeKey);
    }

    private scopeAdoptionConfirmationContent(
      scopeKey: ScopeKey,
      desiredScopeKeys: readonly ScopeKey[],
      reason: string | undefined,
      affectedAssignments: number,
      dependencies: RoleDependencySummary
    ): Readonly<{
      scopeKey: ScopeKey;
      desiredScopeKeys: readonly ScopeKey[];
      reason?: string;
      affectedAssignments: number;
      dependencies: RoleDependencySummary;
    }> {
      return Object.freeze({
        scopeKey,
        desiredScopeKeys,
        reason: optionalAuthorizationText(reason, 1_000),
        affectedAssignments,
        dependencies,
      });
    }

    public async applyScopeAdoption(
      command: ApplyScopeAdoptionCommand
    ): Promise<AuthorizationMutationResult<RoleAdministrationSnapshot>> {
      const auditInput = this.auditInput(command, 'scope.adopted', 'role', command.roleKey);
      return this.runMutation(command, auditInput, async connection => {
        this.requireScope(command, SYSTEM_MANAGE_SCOPE);
        const expectedVersion = positiveVersion(command.expectedVersion);
        const scopeKey = normalizedScopeKeys([command.scopeKey])[0];
        const fresh = await this.findRole(command.roleKey, undefined, connection);
        const freshState = await this.loadRoleState(fresh, connection);
        const before = this.snapshot(freshState);
        if (before.version !== expectedVersion) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The system role changed since preview.'
          );
        }
        if (fresh.protectedKind !== 'system-admin') {
          throw new AuthorizationAdministrationError(
            'authorization.protected-role',
            409,
            'Scope adoption targets the protected system role.'
          );
        }
        if (freshState.effectiveScopeKeys.includes(scopeKey)) {
          throw new AuthorizationAdministrationError(
            'authorization.preview-stale',
            409,
            'The scope adoption state changed since preview.'
          );
        }
        const desired = normalizedScopeKeys([...freshState.effectiveScopeKeys, scopeKey]);
        const validation = this.dependencies.getRegistry().validateScopeKeys(desired);
        if (validation.inactiveScopeKeys.length || validation.missingScopeKeys.length)
          throw new AuthorizationAdministrationError('authorization.invalid-scope', 400, 'The scope is unavailable.');
        const dependencies = await this.dependencySummary(fresh, connection);
        const activeAssignments = await this.activeAssignmentImpact(fresh, connection);
        if (dependencies.scanIncomplete || activeAssignments.incomplete) {
          throw new AuthorizationAdministrationError(
            'authorization.query-bound-exceeded',
            409,
            'The system-role impact exceeds the bounded operation limit.'
          );
        }
        this.verifyConfirmation(
          command,
          command.confirmationToken,
          'scope-adoption',
          fresh.id,
          expectedVersion,
          this.scopeAdoptionConfirmationContent(
            scopeKey,
            desired,
            command.reason,
            activeAssignments.references,
            dependencies
          )
        );
        const overrides = normalizeRoleScopeOverrides({
          baseScopeKeys: freshState.baseScopeKeys,
          desiredScopeKeys: desired,
        });
        await this.replaceOverrides(fresh.id, overrides, this.actorId(command), command.reason, connection);
        const updated = (await Role.updateOne({ id: fresh.id, version: expectedVersion })
          .set({ version: expectedVersion + 1, updatedBy: this.actorId(command) })
          .usingConnection(connection)) as RoleAttributes | undefined;
        if (updated === undefined) {
          throw new AuthorizationAdministrationError(
            'authorization.version-conflict',
            409,
            'The system role changed since preview.'
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
