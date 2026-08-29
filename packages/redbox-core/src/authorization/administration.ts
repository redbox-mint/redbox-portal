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

export interface ExpireAssignmentCommand extends AssignmentByIdCommand {
  readonly expiresAt?: string;
}

export interface ReplaceExternalAssignmentsCommand extends AuthorizationAdministrationCommand {
  readonly brandId: string;
  readonly principalId: string;
  readonly provider: string;
  readonly sourceKey: string;
  readonly roleKeys: readonly string[];
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
  readonly expiresAt?: string;
  readonly version: number;
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
  readonly documentHash: string;
  readonly templateChanges: number;
  readonly roleChanges: number;
  readonly assignmentChanges: number;
  readonly fatalErrors: readonly string[];
  readonly confirmationToken?: string;
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
  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (quoted) {
      if (character === '"' && payload[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field.length !== 0) throw new Error('A quoted CSV field must begin at the start of a field.');
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/u, ''));
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = '';
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

function normalizeBulkRow(value: unknown): BulkAssignmentRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Each assignment row must be an object.');
  }
  const row = value as Record<string, unknown>;
  if (!isBulkAssignmentAction(row.action) || typeof row.principalId !== 'string' || typeof row.roleKey !== 'string') {
    throw new Error('Each assignment row requires action, principalId, and roleKey.');
  }
  const expectedVersion =
    typeof row.expectedVersion === 'string' && row.expectedVersion.trim().length > 0
      ? Number(row.expectedVersion)
      : row.expectedVersion;
  if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1)) {
    throw new Error('Assignment expectedVersion must be a positive integer.');
  }
  return Object.freeze({
    action: row.action,
    principalId: requiredAuthorizationText(row.principalId, 'principalId', 128),
    roleKey: requiredAuthorizationText(row.roleKey, 'roleKey', 128),
    ...(typeof row.sourceKey === 'string' && row.sourceKey.trim().length > 0
      ? { sourceKey: requiredAuthorizationText(row.sourceKey, 'sourceKey', 128) }
      : {}),
    ...(typeof row.expiresAt === 'string' && row.expiresAt.trim().length > 0
      ? { expiresAt: row.expiresAt.trim() }
      : {}),
    ...(expectedVersion === undefined ? {} : { expectedVersion: Number(expectedVersion) }),
  });
}

export function parseBulkAssignmentRows(
  input: readonly BulkAssignmentRow[] | string,
  format: 'json' | 'csv' = 'json'
): readonly BulkAssignmentRow[] {
  let parsed: unknown;
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
    return Object.freeze(parsed.map(normalizeBulkRow));
  } catch (error) {
    if (error instanceof AuthorizationAdministrationError) throw error;
    throw new AuthorizationAdministrationError(
      'authorization.bulk-invalid',
      422,
      error instanceof Error ? error.message : 'The assignment payload is invalid.'
    );
  }
}
