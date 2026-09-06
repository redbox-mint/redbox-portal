import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  AuthorizationContext,
  ProtectedRoleKind,
  RoleAssignmentSource,
  RoleAssignmentStatus,
  RoleKey,
  RoleScopeOverride,
  ScopeKey,
} from './types';
import { AUTHORIZATION_MAX_SCOPE_SET_SIZE } from './types';
import { AuthorizationAdministrationError } from './errors';
import { sanitizeAuthorizationText } from './persistence-validation';
import { asNewRoleKey, asScopeKey, compareScopeKeys } from './validators';

export const AUTHORIZATION_ADMIN_CONFIRMATION_TTL_MS = 5 * 60 * 1_000;
export const AUTHORIZATION_ADMIN_MAX_BULK_ROWS = 100;
export const AUTHORIZATION_ADMIN_MAX_BULK_BYTES = 256 * 1_024;
export const AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS = 5_000;
export const AUTHORIZATION_ADMIN_MAX_EXPORT_BYTES = 1_024 * 1_024;
export const AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS = 500;
export const AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES = 256 * 1_024;
export const AUTHORIZATION_ADMIN_MAX_IMPACT_ASSIGNMENTS = 1_000;
export const AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_ROWS = 1_000;
export const AUTHORIZATION_ADMIN_MAX_REFERENCE_SCAN_VALUES = 100_000;
export const AUTHORIZATION_ADMIN_DEFAULT_PAGE_SIZE = 50;
export const AUTHORIZATION_ADMIN_MAX_PAGE_SIZE = 100;

export const BRAND_ADMIN_SCOPE_FLOOR: readonly ScopeKey[] = Object.freeze(
  [
    'authorization.assignment.manage',
    'authorization.assignment.read',
    'authorization.role.manage',
    'authorization.role.read',
    'authorization.scope.read',
  ]
    .map(asScopeKey)
    .sort(compareScopeKeys)
);

export const SYSTEM_ADMIN_SCOPE_FLOOR: readonly ScopeKey[] = Object.freeze(
  [...BRAND_ADMIN_SCOPE_FLOOR, asScopeKey('system.authorization.manage')].sort(compareScopeKeys)
);

export const GUEST_SCOPE_FLOOR: readonly ScopeKey[] = Object.freeze([asScopeKey('authorization.self.read')]);

export interface AuthorizationAdministrationCorrelation {
  readonly requestId: string;
  readonly batchId?: string;
  readonly reason?: string;
}

export interface AuthorizationAdministrationCommand extends AuthorizationAdministrationCorrelation {
  readonly actor: AuthorizationContext;
  readonly brandId?: string;
}

export interface CreateRoleCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly key: string;
  readonly displayName: string;
  readonly description?: string;
  readonly templateKey?: string;
  readonly templateRevision?: number;
  readonly cloneRoleKey?: string;
  readonly desiredScopeKeys?: readonly string[];
}

export interface UpdateRoleCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly roleKey: string;
  readonly expectedVersion: number;
  readonly displayName?: string;
  readonly description?: string | null;
}

export interface PreviewRoleScopesCommand extends AuthorizationAdministrationCommand {
  readonly brandId?: string;
  readonly roleKey: string;
  readonly expectedVersion: number;
  readonly desiredScopeKeys: readonly string[];
}

export interface ApplyRoleScopesCommand extends PreviewRoleScopesCommand {
  readonly confirmationToken: string;
}

export interface PreviewTemplateRevisionCommand extends AuthorizationAdministrationCommand {
  readonly templateKey: string;
  readonly expectedVersion: number;
  readonly scopeKeys: readonly string[];
  readonly displayName?: string;
  readonly description?: string;
  readonly notes?: string;
}

export interface PublishTemplateRevisionCommand extends PreviewTemplateRevisionCommand {
  readonly confirmationToken: string;
}

export interface PreviewRoleTemplateUpgradeCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly roleKey: string;
  readonly expectedVersion: number;
  readonly targetRevision: number;
}

export interface ApplyRoleTemplateUpgradeCommand extends PreviewRoleTemplateUpgradeCommand {
  readonly confirmationToken: string;
}

export interface SelectedRoleVersion {
  readonly roleId: string;
  readonly expectedVersion: number;
}

export interface PreviewBulkTemplateUpgradeCommand extends AuthorizationAdministrationCommand {
  readonly templateKey: string;
  readonly targetRevision: number;
  readonly roles: readonly SelectedRoleVersion[];
}

export interface ApplyBulkTemplateUpgradeCommand extends PreviewBulkTemplateUpgradeCommand {
  readonly confirmationToken: string;
}

export interface BulkTemplateUpgradeRolePreview {
  readonly roleId: string;
  readonly roleKey: RoleKey;
  readonly brandId: string;
  readonly expectedVersion: number;
  readonly currentRevision: number;
  readonly targetRevision: number;
  readonly addedScopeKeys: readonly ScopeKey[];
  readonly removedScopeKeys: readonly ScopeKey[];
  readonly changed: boolean;
}

export interface BulkTemplateUpgradeRoleConflict {
  readonly roleId: string;
  readonly expectedVersion: number;
  readonly targetRevision: number;
  readonly conflict: Readonly<{
    code: string;
    status: number;
  }>;
}

export interface BulkTemplateUpgradePreview {
  readonly operation: 'template-bulk-upgrade';
  readonly templateKey: string;
  readonly targetRevision: number;
  readonly roles: readonly (BulkTemplateUpgradeRolePreview | BulkTemplateUpgradeRoleConflict)[];
  readonly warnings: readonly string[];
  readonly fatalErrors: readonly string[];
  readonly confirmationToken?: string;
}

export interface PreviewRoleLifecycleCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly roleKey: string;
  readonly expectedVersion: number;
}

export interface ApplyRoleLifecycleCommand extends PreviewRoleLifecycleCommand {
  readonly confirmationToken: string;
}

export interface AssignmentSourceTuple {
  readonly source: RoleAssignmentSource;
  readonly sourceKey: string;
}

export interface GrantAssignmentCommand extends AuthorizationAdministrationCommand, AssignmentSourceTuple {
  readonly principalId: string;
  readonly roleKey: string;
  readonly expectedVersion?: number;
  readonly expiresAt?: string;
}

export interface RevokeAssignmentCommand extends AuthorizationAdministrationCommand, AssignmentSourceTuple {
  readonly principalId: string;
  readonly roleKey: string;
  readonly expectedVersion: number;
}

export interface AssignmentByIdCommand extends AuthorizationAdministrationCommand {
  readonly assignmentId: string;
  readonly expectedVersion: number;
}

export interface ReplaceExternalAssignmentsCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly principalId: string;
  readonly provider: string;
  readonly sourceKey: string;
  readonly roleKeys: readonly string[];
  /**
   * Caller-observed source state for compare-and-set. Each entry pins the
   * assignment version the caller saw for that role key. When supplied, every
   * entry must match a live row with the same version and every live row must
   * be pinned; any drift surfaces as `authorization.version-conflict` with no
   * partial counters or success audit. Omission preserves provider-sync flows
   * that reconcile without tracking versions; those writes remain CAS-guarded
   * by per-row version predicates.
   */
  readonly expectedState?: readonly ExternalAssignmentExpectedState[];
}

export interface ExternalAssignmentExpectedState {
  readonly roleKey: string;
  readonly expectedVersion: number;
}

export interface SetUserAccessCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly userId: string;
  readonly disabled: boolean;
  /**
   * Optional optimistic-concurrency guard carrying the caller-observed
   * `loginDisabledVersion`. When supplied it must match or the mutation fails
   * with `authorization.version-conflict`; read-modify-write callers must
   * supply it. Quorum-critical races remain serialized by protected-role
   * locks even when it is omitted.
   */
  readonly expectedVersion?: number;
}

export interface UserAccessResult {
  readonly userId: string;
  readonly disabled: boolean;
  readonly changed: boolean;
}

export interface LinkUserAccountsCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly primaryUserId: string;
  readonly secondaryUserId: string;
  /**
   * DEPRECATED wire fallback, no longer consumed for progress accounting.
   * Progress is durable truth (`recordsCompletedOids.length` on the stored
   * operation); caller-supplied counts are never trusted. Retained on the
   * wire shape only so older clients still validate.
   */
  readonly recordsRewritten?: number;
  /**
   * AUTH-LINK-PROOF-001 pair-bound server proof: caller-observed secondary
   * `loginDisabledVersion` (missing reads as 1 for legacy rows). REQUIRED:
   * when omitted the link fails with `authorization.version-conflict` so
   * callers must prove a recent read of BOTH identities (see
   * `primaryExpectedVersion`). Any drift fails closed before any write.
   */
  readonly secondaryExpectedVersion?: number;
  /**
   * AUTH-LINK-PROOF-001 caller-observed primary `loginDisabledVersion`.
   * REQUIRED alongside `secondaryExpectedVersion`.
   */
  readonly primaryExpectedVersion?: number;
  /**
   * AUTH-LINK-PROOF-001 server-bound pair confirmation token issued by
   * `previewLinkAccounts`. Binds actor + brand + primary/secondary pair +
   * both expected versions + content hash with a short expiry. REQUIRED: the
   * writer re-verifies the token before any write so preview/confirmation
   * cannot be bypassed or replayed across pairs.
   */
  readonly linkConfirmationToken?: string;
  /**
   * AUTH-TXN-001 stable idempotency key for the durable link operation. When
   * supplied, the writer records `pending/running/completed/failed`
   * transitions against it so a retry of the same operation resumes instead
   * of conflicting with its own prior commit.
   */
  readonly linkOperationId?: string;
}

/**
 * AUTH-P5-006: canonical mandatory link DTO. The wire
 * `LinkUserAccountsCommand` keeps proof fields optional so legacy callers
 * fail closed at runtime (never at the type boundary); writers normalize to
 * this mandatory family via `normalizeLinkUserAccountsRequest` immediately
 * after the scope gate, and every downstream proof/operation check consumes
 * only this shape. Publicly exported as the single contract for
 * preview → apply → retry (operation ID, both expected versions, and the
 * pair-bound confirmation token are all required).
 */
export interface LinkUserAccountsRequest extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly primaryUserId: string;
  readonly secondaryUserId: string;
  readonly secondaryExpectedVersion: number;
  readonly primaryExpectedVersion: number;
  readonly linkConfirmationToken: string;
  readonly linkOperationId: string;
  readonly recordsRewritten?: number;
}

/**
 * AUTH-P5-006 mandatory retry DTO. Retries re-prove the full preview
 * contract — operation ID, both account versions, and the pair-bound
 * confirmation token are ALL required and are verified against the STORED
 * durable proof (versions, snapshot, proof hash) before only the record
 * phase resumes. The authorization commit is never re-executed on resume.
 */
export interface RetryLinkOperationCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly primaryUserId: string;
  readonly secondaryUserId: string;
  readonly primaryExpectedVersion: number;
  readonly secondaryExpectedVersion: number;
  readonly linkConfirmationToken: string;
  readonly linkOperationId: string;
  readonly requestId: string;
  readonly reason?: string;
}

function positiveLinkVersion(value: number | undefined, field: string): number {
  if (value === undefined) {
    throw new AuthorizationAdministrationError(
      'authorization.version-conflict',
      409,
      'Both primaryExpectedVersion and secondaryExpectedVersion are required to link accounts.'
    );
  }
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new AuthorizationAdministrationError(
      'authorization.version-conflict',
      409,
      `${field} must be a positive integer.`
    );
  }
  return Number(value);
}

/**
 * AUTH-P5-006: normalize the legacy wire command to the canonical mandatory
 * request. Omitted/invalid proof fails closed with the stable link codes
 * (409 version-conflict for versions, 409 preview-stale for the
 * token/operation ID) so preview/confirmation cannot be bypassed.
 */
export function normalizeLinkUserAccountsRequest(command: LinkUserAccountsCommand): LinkUserAccountsRequest {
  const primaryExpectedVersion = positiveLinkVersion(command.primaryExpectedVersion, 'primaryExpectedVersion');
  const secondaryExpectedVersion = positiveLinkVersion(command.secondaryExpectedVersion, 'secondaryExpectedVersion');
  const linkConfirmationToken = typeof command.linkConfirmationToken === 'string' ? command.linkConfirmationToken : '';
  if (linkConfirmationToken.length === 0) {
    throw new AuthorizationAdministrationError(
      'authorization.preview-stale',
      409,
      'A link preview confirmation token is required to link accounts.'
    );
  }
  const linkOperationId = typeof command.linkOperationId === 'string' ? command.linkOperationId.trim() : '';
  if (linkOperationId.length === 0) {
    throw new AuthorizationAdministrationError(
      'authorization.preview-stale',
      409,
      'A link operation ID from preview is required to link accounts.'
    );
  }
  return Object.freeze({
    ...command,
    primaryExpectedVersion,
    secondaryExpectedVersion,
    linkConfirmationToken,
    linkOperationId,
  });
}

export interface UserAccountLinkResult {
  readonly primaryUserId: string;
  readonly secondaryUserId: string;
  readonly rolesAdopted: number;
  readonly rolesRetired: number;
  readonly recordsRewritten: number;
  /**
   * AUTH-TXN-001: true when the authorization commit succeeded but the
   * separate Record-datastore rewrite phase did not complete (partial or
   * skipped). Operators must reconcile via the `user.link-records-pending`
   * audit event; the authorization commit is NOT rolled back because the two
   * datastores share no transaction.
   */
  readonly recordsPending: boolean;
  readonly changed: boolean;
  /**
   * AUTH-TXN-001 stable operation key for the durable link operation
   * (`pending/running/completed/failed`). Mandatory end-to-end: every link
   * result carries it so clients always poll/retry idempotently.
   */
  readonly linkOperationId: string;
}

export interface PreviewLinkAccountsCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly primaryUserId: string;
  readonly secondaryUserId: string;
}

export interface LinkAccountsPreview {
  readonly primaryUserId: string;
  readonly secondaryUserId: string;
  readonly primaryExpectedVersion: number;
  readonly secondaryExpectedVersion: number;
  readonly primaryUsername: string;
  readonly secondaryUsername: string;
  readonly rolesToAdopt: number;
  readonly rolesToRetire: number;
  readonly confirmationToken: string;
  readonly linkOperationId: string;
}

export interface RoleSetGrant {
  readonly roleKey: string;
  readonly expectedVersion?: number;
  readonly sourceKey?: string;
  readonly expiresAt?: string;
}

export interface RoleSetRemoval {
  readonly roleKey: string;
  readonly assignmentId?: string;
  readonly source?: string;
  readonly sourceKey?: string;
  readonly expectedVersion: number;
}

export interface ApplyUserRoleSetCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly principalId: string;
  readonly grants: readonly RoleSetGrant[];
  readonly removals: readonly RoleSetRemoval[];
  /**
   * AUTH-P5-002: caller-observed user-row version. When supplied, the writer
   * pins it against the user row and bumps it in the SAME required
   * transaction as the assignment writes (atomic CAS): a concurrent
   * disable/link/profile commit aborts the whole set with 409 instead of
   * interleaving with role changes.
   */
  readonly userExpectedVersion?: number;
}

export interface UserRoleSetResult {
  readonly principalId: string;
  readonly granted: number;
  readonly revoked: number;
  readonly suppressed: number;
  readonly noOp: number;
  readonly changed: boolean;
}

export type BulkAssignmentAction = 'grant' | 'revoke';

export interface BulkAssignmentRow {
  readonly action: BulkAssignmentAction;
  readonly principalId: string;
  readonly roleKey: string;
  readonly sourceKey?: string;
  readonly expiresAt?: string;
  readonly expectedVersion?: number;
}

export interface PreviewBulkAssignmentsCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly rows: readonly BulkAssignmentRow[] | string;
  readonly format?: 'json' | 'csv';
}

export interface ApplyBulkAssignmentsCommand extends PreviewBulkAssignmentsCommand {
  readonly confirmationToken: string;
}

export interface PreviewScopeAdoptionCommand extends AuthorizationAdministrationCommand {
  readonly roleKey: string;
  readonly expectedVersion: number;
  readonly scopeKey: string;
}

export interface ApplyScopeAdoptionCommand extends PreviewScopeAdoptionCommand {
  readonly confirmationToken: string;
}

export interface AuthorizationMutationResult<T> {
  readonly data: T;
  readonly version: number;
  readonly auditEventId: string;
  readonly requestId: string;
  readonly batchId?: string;
  readonly changed: boolean;
}

export interface RoleCatalogQuery {
  readonly actor: AuthorizationContext;
  readonly brandId: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly protectedKind?: ProtectedRoleKind;
  readonly search?: string;
  readonly status?: 'active' | 'inactive';
  readonly templateKey?: string;
  readonly requestId?: string;
}

export interface RoleCatalogItem {
  readonly id: string;
  readonly key: RoleKey;
  readonly displayName: string;
  readonly description?: string;
  readonly contextType: 'brand';
  readonly brandId: string;
  readonly protectedKind: ProtectedRoleKind;
  readonly status: 'active' | 'inactive';
  readonly templateKey?: RoleKey;
  readonly templateRevision?: number;
  readonly version: number;
}

export interface RoleCatalogPage {
  readonly items: readonly RoleCatalogItem[];
  readonly nextCursor?: RoleKey;
}

export interface RoleAdministrationSnapshot {
  readonly id: string;
  readonly key: RoleKey;
  readonly displayName: string;
  readonly description?: string;
  readonly contextType: 'brand' | 'system';
  readonly brandId?: string;
  readonly protectedKind: ProtectedRoleKind;
  readonly status: 'active' | 'inactive';
  readonly templateKey?: RoleKey;
  readonly templateRevision?: number;
  readonly baseScopeKeys: readonly ScopeKey[];
  readonly effectiveScopeKeys: readonly ScopeKey[];
  readonly overrides: readonly RoleScopeOverride[];
  readonly version: number;
}

export interface AssignmentAdministrationSnapshot {
  readonly id: string;
  readonly principalId: string;
  readonly roleId: string;
  readonly roleKey: RoleKey;
  readonly brandId?: string;
  readonly source: RoleAssignmentSource;
  readonly sourceKey: string;
  readonly status: RoleAssignmentStatus;
  readonly sourcePresent: boolean;
  readonly assignedBy: string;
  readonly assignedAt: string;
  readonly expiresAt?: string;
  readonly revokedBy?: string;
  readonly revokedAt?: string;
  readonly suppressedBy?: string;
  readonly suppressedAt?: string;
  readonly reason?: string;
  readonly version: number;
}

export const ASSIGNMENT_EXPIRY_FILTERS = ['expired', 'unexpired', 'never'] as const;
export type AssignmentExpiryFilter = (typeof ASSIGNMENT_EXPIRY_FILTERS)[number];

export interface AssignmentCatalogQuery {
  readonly actor: AuthorizationContext;
  readonly brandId: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly principalId?: string;
  readonly roleKey?: string;
  readonly source?: RoleAssignmentSource;
  readonly status?: RoleAssignmentStatus;
  readonly sourcePresent?: boolean;
  readonly expiry?: AssignmentExpiryFilter;
}

export interface AssignmentCatalogPage {
  readonly items: readonly AssignmentAdministrationSnapshot[];
  readonly nextCursor?: string;
}

export interface RoleDependencySummary {
  readonly assignmentRows: number;
  readonly legacyUserAssociations: number;
  readonly activeRecords: number;
  readonly deletedRecords: number;
  readonly storedConfigReferences: number;
  readonly runtimeConfigReferences: number;
  readonly scanIncomplete: boolean;
  readonly templatePinned: boolean;
}

export interface AuthorizationPreviewResult<T> {
  readonly operation: string;
  readonly current: T;
  readonly proposed?: T;
  readonly addedScopeKeys: readonly ScopeKey[];
  readonly removedScopeKeys: readonly ScopeKey[];
  readonly affectedAssignments: number;
  readonly dependencies?: RoleDependencySummary;
  readonly warnings: readonly string[];
  readonly fatalErrors: readonly string[];
  readonly confirmationToken?: string;
}

export interface BulkAssignmentRowPreview {
  readonly index: number;
  readonly row: BulkAssignmentRow;
  readonly normalizedPrincipalId?: string;
  readonly assignmentId?: string;
  readonly assignmentVersion?: number;
  readonly outcome: 'grant' | 'revoke' | 'no-op' | 'invalid';
  readonly errorCode?: string;
}

export interface BulkAssignmentPreview {
  readonly rows: readonly BulkAssignmentRowPreview[];
  readonly grantCount: number;
  readonly revokeCount: number;
  readonly noOpCount: number;
  readonly invalidCount: number;
  readonly confirmationToken?: string;
}

export interface ExternalReplacementResult {
  readonly created: number;
  readonly reactivated: number;
  readonly revoked: number;
  readonly suppressedUpdated: number;
  readonly noOp: number;
}

export interface BulkMutationResult {
  readonly appliedCount: number;
  readonly noOpCount: number;
  readonly rowResults: readonly BulkAssignmentRowPreview[];
}

export interface AuthorizationConfigurationTemplateRevision {
  readonly revision: number;
  readonly scopeKeys: readonly string[];
  readonly notes?: string;
}

export interface AuthorizationConfigurationTemplate {
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  readonly protectedKind: ProtectedRoleKind;
  readonly status: 'active' | 'inactive';
  /** Optimistic-concurrency version of the exported template. */
  readonly version: number;
  readonly revisions: readonly AuthorizationConfigurationTemplateRevision[];
}

export interface AuthorizationConfigurationRole {
  readonly brandId?: string;
  readonly key: string;
  readonly displayName: string;
  readonly description?: string;
  readonly protectedKind: ProtectedRoleKind;
  readonly status: 'active' | 'inactive';
  readonly templateKey?: string;
  readonly templateRevision?: number;
  readonly effectiveScopeKeys: readonly string[];
  /** Optimistic-concurrency version of the exported role. */
  readonly version: number;
}

export interface AuthorizationConfigurationAssignment {
  readonly principalId: string;
  readonly brandId?: string;
  readonly roleKey: string;
  readonly source: RoleAssignmentSource;
  readonly sourceKey: string;
  readonly status: RoleAssignmentStatus;
  readonly sourcePresent: boolean;
  readonly expiresAt?: string;
  /** Optimistic-concurrency version of the exported assignment source tuple. */
  readonly version: number;
}

export interface AuthorizationConfigurationDocument {
  readonly schemaVersion: 1;
  readonly generatedAt?: string;
  readonly templates: readonly AuthorizationConfigurationTemplate[];
  readonly roles: readonly AuthorizationConfigurationRole[];
  readonly assignments?: readonly AuthorizationConfigurationAssignment[];
}

export interface ExportAuthorizationConfigurationCommand extends AuthorizationAdministrationCommand {
  readonly includeAssignments?: boolean;
  readonly includeSystemAssignments?: boolean;
  readonly confirmationToken?: string;
}

export interface PreviewAuthorizationConfigurationImportCommand extends AuthorizationAdministrationCommand {
  readonly document: AuthorizationConfigurationDocument | string;
}

export interface ApplyAuthorizationConfigurationImportCommand extends PreviewAuthorizationConfigurationImportCommand {
  readonly confirmationToken: string;
}

export interface AuthorizationConfigurationImportPreview {
  readonly operation: 'config-import';
  readonly documentHash: string;
  readonly templateChanges: number;
  readonly roleChanges: number;
  readonly assignmentChanges: number;
  readonly noOpCount: number;
  readonly fatalErrors: readonly string[];
  readonly confirmationToken?: string;
}

export interface AuthorizationConfigurationExportPreview {
  readonly operation: 'config-export-sensitive';
  readonly includeAssignments: true;
  readonly includeSystemAssignments: boolean;
  readonly templateCount: number;
  readonly roleCount: number;
  readonly assignmentCount: number;
  readonly documentHash: string;
  readonly confirmationToken: string;
}

export interface AuthorizationConfigurationImportResult {
  readonly data: Readonly<{
    templateChanges: number;
    roleChanges: number;
    assignmentChanges: number;
    noOpCount: number;
    documentHash: string;
  }>;
  readonly version: 1;
  readonly auditEventId: string;
  readonly requestId: string;
  readonly batchId: string;
  readonly changed: true;
}

export const AUTHORIZATION_CONFIRMATION_OPERATIONS = [
  'role-scopes',
  'template-publish',
  'template-upgrade',
  'template-bulk-upgrade',
  'role-inactivate',
  'role-delete',
  'assignment-bulk',
  'scope-adoption',
  'config-export-sensitive',
  'config-import',
  'account-link',
] as const;

export type AuthorizationConfirmationOperation = (typeof AUTHORIZATION_CONFIRMATION_OPERATIONS)[number];

export interface AuthorizationConfirmationClaims {
  readonly version: 1;
  readonly operation: AuthorizationConfirmationOperation;
  readonly target: string;
  readonly actorId: string;
  readonly brandId?: string;
  readonly expectedVersion?: number;
  readonly contentHash: string;
  readonly nonce: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = stableValue(entry);
    }
    return result;
  }
  return value;
}

export function authorizationContentHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function parseClaims(encoded: string): AuthorizationConfirmationClaims {
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch (_error) {
    throw new AuthorizationAdministrationError(
      'authorization.preview-stale',
      409,
      'The authorization confirmation token is invalid.'
    );
  }
  if (
    typeof claims !== 'object' ||
    claims === null ||
    Array.isArray(claims) ||
    (claims as Record<string, unknown>).version !== 1 ||
    !AUTHORIZATION_CONFIRMATION_OPERATIONS.includes(
      (claims as Record<string, unknown>).operation as AuthorizationConfirmationOperation
    ) ||
    typeof (claims as Record<string, unknown>).target !== 'string' ||
    typeof (claims as Record<string, unknown>).actorId !== 'string' ||
    typeof (claims as Record<string, unknown>).contentHash !== 'string' ||
    typeof (claims as Record<string, unknown>).nonce !== 'string' ||
    typeof (claims as Record<string, unknown>).issuedAt !== 'number' ||
    typeof (claims as Record<string, unknown>).expiresAt !== 'number'
  ) {
    throw new AuthorizationAdministrationError(
      'authorization.preview-stale',
      409,
      'The authorization confirmation token is invalid.'
    );
  }
  return claims as AuthorizationConfirmationClaims;
}

export function createAuthorizationConfirmationToken(claims: AuthorizationConfirmationClaims, secret: string): string {
  if (secret.length < 32) {
    throw new Error('Authorization confirmation signing requires at least 32 characters of secret material.');
  }
  const encoded = Buffer.from(JSON.stringify(stableValue(claims)), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyAuthorizationConfirmationToken(
  token: string,
  secret: string,
  now: Date
): AuthorizationConfirmationClaims {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new AuthorizationAdministrationError(
      'authorization.preview-stale',
      409,
      'The authorization confirmation token is invalid.'
    );
  }
  const [encoded, suppliedSignature] = parts;
  const expectedSignature = createHmac('sha256', secret).update(encoded).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch (_error) {
    actualSignature = Buffer.alloc(0);
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw new AuthorizationAdministrationError(
      'authorization.preview-stale',
      409,
      'The authorization confirmation token signature is invalid.'
    );
  }
  const claims = parseClaims(encoded);
  if (claims.expiresAt <= now.getTime() || claims.issuedAt > now.getTime() + 30_000) {
    throw new AuthorizationAdministrationError(
      'authorization.preview-stale',
      409,
      'The authorization confirmation token has expired.'
    );
  }
  return Object.freeze({ ...claims });
}

export function normalizedNewRoleKey(value: string): RoleKey {
  return asNewRoleKey(value.trim().toLowerCase());
}

export function normalizedScopeKeys(values: readonly string[]): readonly ScopeKey[] {
  if (values.length > AUTHORIZATION_MAX_SCOPE_SET_SIZE) {
    throw new AuthorizationAdministrationError(
      'authorization.invalid-scope',
      400,
      `A role scope set cannot contain more than ${AUTHORIZATION_MAX_SCOPE_SET_SIZE} entries.`
    );
  }
  return Object.freeze([...new Set(values.map(value => asScopeKey(value.trim())))].sort(compareScopeKeys));
}

export function requiredAuthorizationText(value: unknown, field: string, maxLength: number): string {
  const text = sanitizeAuthorizationText(value, maxLength);
  if (text === undefined) {
    throw new AuthorizationAdministrationError('authorization.invalid-role', 400, `${field} is required.`);
  }
  return text;
}

export function optionalAuthorizationText(value: unknown, maxLength: number): string | undefined {
  return sanitizeAuthorizationText(value, maxLength);
}

function parseCsvRecords(payload: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quotedFieldClosed = false;
  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (quoted) {
      if (character === '"' && payload[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quotedFieldClosed = true;
      } else {
        field += character;
      }
      continue;
    }
    if (quotedFieldClosed && character !== ',' && character !== '\n' && character !== '\r') {
      throw new Error('A closing CSV quote must be followed by a delimiter or line ending.');
    }
    if (character === '"') {
      if (field.length !== 0) throw new Error('A quoted CSV field must begin at the start of a field.');
      quoted = true;
      quotedFieldClosed = false;
    } else if (character === ',') {
      row.push(field);
      field = '';
      quotedFieldClosed = false;
    } else if (character === '\n') {
      row.push(field.replace(/\r$/u, ''));
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = '';
      quotedFieldClosed = false;
    } else if (quotedFieldClosed && character === '\r') {
      if (payload[index + 1] !== '\n') throw new Error('A CSV carriage return must be followed by a line feed.');
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('The CSV payload contains an unterminated quoted field.');
  row.push(field.replace(/\r$/u, ''));
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

function isBulkAssignmentAction(value: unknown): value is BulkAssignmentAction {
  return value === 'grant' || value === 'revoke';
}

const BULK_ASSIGNMENT_ROW_FIELDS = new Set([
  'action',
  'principalId',
  'roleKey',
  'sourceKey',
  'expiresAt',
  'expectedVersion',
]);

function normalizeBulkRow(value: unknown, fromCsv: boolean): BulkAssignmentRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Each assignment row must be an object.');
  }
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(field => !BULK_ASSIGNMENT_ROW_FIELDS.has(field))) {
    throw new Error('Assignment rows contain an unknown field.');
  }
  if (!isBulkAssignmentAction(row.action) || typeof row.principalId !== 'string' || typeof row.roleKey !== 'string') {
    throw new Error('Each assignment row requires action, principalId, and roleKey.');
  }
  const sourceKey =
    fromCsv && row.sourceKey === ''
      ? undefined
      : row.sourceKey === undefined
        ? undefined
        : requiredAuthorizationText(row.sourceKey, 'sourceKey', 128);
  const expiresAt =
    fromCsv && row.expiresAt === ''
      ? undefined
      : row.expiresAt === undefined
        ? undefined
        : requiredAuthorizationText(row.expiresAt, 'expiresAt', 64);
  if (row.action === 'revoke' && expiresAt !== undefined) {
    throw new Error('Revoke rows cannot supply expiresAt.');
  }
  const expectedVersion =
    fromCsv && typeof row.expectedVersion === 'string' && row.expectedVersion.trim().length > 0
      ? Number(row.expectedVersion)
      : fromCsv && row.expectedVersion === ''
        ? undefined
        : row.expectedVersion;
  if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1)) {
    throw new Error('Assignment expectedVersion must be a positive integer.');
  }
  return Object.freeze({
    action: row.action,
    principalId: requiredAuthorizationText(row.principalId, 'principalId', 128),
    roleKey: requiredAuthorizationText(row.roleKey, 'roleKey', 128),
    ...(sourceKey === undefined ? {} : { sourceKey }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(expectedVersion === undefined ? {} : { expectedVersion: Number(expectedVersion) }),
  });
}

export function parseBulkAssignmentRows(
  input: readonly BulkAssignmentRow[] | string,
  format: 'json' | 'csv' = 'json'
): readonly BulkAssignmentRow[] {
  let parsed: unknown;
  let fromCsv = false;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > AUTHORIZATION_ADMIN_MAX_BULK_BYTES) {
      throw new AuthorizationAdministrationError(
        'authorization.bulk-invalid',
        422,
        `Assignment payloads cannot exceed ${AUTHORIZATION_ADMIN_MAX_BULK_BYTES} bytes.`
      );
    }
    try {
      if (format === 'json') {
        parsed = JSON.parse(input);
      } else {
        fromCsv = true;
        const records = parseCsvRecords(input);
        if (records.length === 0) parsed = [];
        else {
          const headers = records[0].map(header => header.trim());
          const expectedHeaders = new Set([
            'action',
            'principalId',
            'roleKey',
            'sourceKey',
            'expiresAt',
            'expectedVersion',
          ]);
          if (new Set(headers).size !== headers.length || headers.some(header => !expectedHeaders.has(header))) {
            throw new Error('CSV headers are invalid or duplicated.');
          }
          if (!['action', 'principalId', 'roleKey'].every(header => headers.includes(header))) {
            throw new Error('CSV headers must include action, principalId, and roleKey.');
          }
          if (records.slice(1).some(record => record.length !== headers.length)) {
            throw new Error('Each CSV row must contain exactly one value for every header.');
          }
          parsed = records
            .slice(1)
            .map(record => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
        }
      }
    } catch (error) {
      throw new AuthorizationAdministrationError(
        'authorization.bulk-invalid',
        422,
        error instanceof Error ? error.message : 'The assignment payload is malformed.'
      );
    }
  } else {
    parsed = input;
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > AUTHORIZATION_ADMIN_MAX_BULK_ROWS) {
    throw new AuthorizationAdministrationError(
      'authorization.bulk-invalid',
      422,
      `Assignment batches must contain between 1 and ${AUTHORIZATION_ADMIN_MAX_BULK_ROWS} rows.`
    );
  }
  try {
    return Object.freeze(parsed.map(row => normalizeBulkRow(row, fromCsv)));
  } catch (error) {
    throw new AuthorizationAdministrationError(
      'authorization.bulk-invalid',
      422,
      error instanceof Error ? error.message : 'The assignment payload is invalid.'
    );
  }
}
