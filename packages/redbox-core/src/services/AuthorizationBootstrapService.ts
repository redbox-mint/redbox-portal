import { metrics } from '@opentelemetry/api';
import { Services as services } from '../CoreService';
import {
  GUEST_SCOPE_ALLOWLIST,
  GUEST_SCOPE_FLOOR,
  associationIdentity,
  buildRoleIdentityKey,
  isExactGuestRole,
  isExactSystemAdminRole,
  isScopeKey,
  type DefaultRoleTemplateDefinition,
} from '../authorization';
import { DEFAULT_ROLE_TEMPLATES } from '../authorization/default-role-templates';
import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleScopeOverrideAttributes } from '../waterline-models/RoleScopeOverride';
import type { RoleAssignmentAttributes } from '../waterline-models/RoleAssignment';
import type { RoleTemplateAttributes } from '../waterline-models/RoleTemplate';
import type { UserAttributes } from '../waterline-models/User';
import { runWithRequiredTransaction } from '../utilities/RequiredTransactionUtils';
import type { AuthorizationMigrationIssue, AuthorizationDriftReport } from './AuthorizationMigrationService';
import {
  MIGRATION_LEASE_RENEW_INTERVAL_MS,
  acquireMigrationLease,
  assertMigrationLeaseHeld,
  fenceLeaseInMutationSession,
  isDurableMutationLeaseRequired,
  type MigrationLeaseHandle,
} from './AuthorizationMigrationService';

/** Bootstrap lease threaded into every mutating Guest/system/assignment/audit transaction. */
export type BootstrapMutationLease = Pick<MigrationLeaseHandle, 'owner' | 'fence'>;

const BOOTSTRAP_ACTOR = 'bootstrap:authorization-invariants';
const BOOTSTRAP_SOURCE_KEY = 'bootstrap-parent-administrator';
const RECOVERY_CONFIRMATION = 'RECOVER-SYSTEM-ADMIN';
const RECOVERY_ACTOR = 'operator:system-admin-recovery';

const authorizationBootstrapMeter = metrics.getMeter('redbox.authorization');
const authorizationBootstrapOutcomes = authorizationBootstrapMeter.createCounter(
  'redbox.authorization_bootstrap.outcomes',
  { description: 'Protected authorization bootstrap completions by outcome.', unit: '{bootstrap}' }
);
const authorizationBootstrapRecoveryOutcomes = authorizationBootstrapMeter.createCounter(
  'redbox.authorization_bootstrap.recovery.outcomes',
  { description: 'System administrator recovery attempts by outcome.', unit: '{recovery}' }
);

export interface AuthorizationProtectedBootstrapInput {
  readonly bootstrapUser?: unknown;
}

export interface AuthorizationSystemAdminRecoveryInput {
  /** Exact canonical username or user ID; ambiguity is rejected, never guessed. */
  readonly target?: unknown;
  /** Exact typed confirmation phrase required from the operator. */
  readonly confirmation?: unknown;
  /** Bounded operator reason recorded with the audit event. */
  readonly reason?: unknown;
  /** Bounded operator identity for audit; defaults to the non-HTTP command name. */
  readonly operator?: unknown;
}

export interface AuthorizationSystemAdminRecoveryResult {
  readonly principalId: string;
  readonly roleId: string;
  readonly assignmentCreated: boolean;
  readonly assignmentReactivated: boolean;
  readonly assignmentState: 'created' | 'reactivated' | 'active' | 'blocked';
}

export interface AuthorizationProtectedBootstrapMetrics {
  readonly reconcileBlockers: number;
  readonly conflictsResolved: number;
  readonly transactionFailures: number;
}

export interface AuthorizationProtectedBootstrapResult {
  readonly guestRolesCreated: number;
  readonly guestRolesRepaired: number;
  readonly systemRoleCreated: boolean;
  readonly systemAssignmentCreated: boolean;
  readonly systemAssignmentRepaired: boolean;
  readonly issues: readonly AuthorizationMigrationIssue[];
  readonly drift: AuthorizationDriftReport;
  readonly metrics: AuthorizationProtectedBootstrapMetrics;
}

/**
 * Compare-and-swap criteria for a protected role repair, evaluated against a
 * snapshot re-read inside the repair transaction. Rows carrying a positive
 * version are rewritten only when the version still matches, so a concurrent
 * administrative mutation fails closed instead of being silently clobbered.
 * Versionless legacy rows predate optimistic concurrency: they pin the full
 * expected pre-repair snapshot (identity, name, kind, status, context,
 * revision, brand where present, version, and the actor metadata the repair
 * overwrites) with explicit null/absence semantics, so an id-only predicate
 * cannot overwrite a concurrent change. `version` is pinned explicitly as
 * null/absent for versionless rows so a concurrent version establishment
 * fails closed. Repairs always advance the version so stale clients detect
 * them.
 */
function protectedRoleRepairCriteria(role: RoleAttributes): Record<string, unknown> {
  if (Number.isInteger(role.version) && Number(role.version) >= 1) {
    return { id: role.id, version: role.version };
  }
  // Absence pins as null (matches only null/absent); every present value pins
  // exactly, including empty strings. `version` is pinned explicitly so a
  // concurrent version establishment fails closed.
  const pin = (value: unknown): unknown => (value === undefined ? null : value);
  return {
    id: role.id,
    version: pin(role.version),
    name: pin(role.name),
    branding: pin(associationIdentity(role.branding)),
    template: pin(associationIdentity(role.template)),
    key: pin(role.key),
    identityKey: pin(role.identityKey),
    displayName: pin(role.displayName),
    contextType: pin(role.contextType),
    protectedKind: pin(role.protectedKind),
    status: pin(role.status),
    templateRevision: pin(role.templateRevision),
    createdBy: pin(role.createdBy),
    updatedBy: pin(role.updatedBy),
  };
}

function nextProtectedRoleVersion(role: RoleAttributes): number {
  return Number.isInteger(role.version) && Number(role.version) >= 1 ? Number(role.version) + 1 : 1;
}

/**
 * Canonical active-user predicate shared by recovery pre-validation and the
 * in-transaction revalidation. A recovery target is eligible only when it is
 * not a linked alias by state, carries no dangling `linkedPrimaryUserId`
 * pointer, and is not disabled. Checking the raw pointer (not just the alias
 * state) keeps recovery consistent with canonical readiness resolution, where
 * any non-empty pointer canonicalizes away from the row.
 */
export function canonicalActiveUserRejection(
  user: Pick<UserAttributes, 'accountLinkState' | 'linkedPrimaryUserId' | 'loginDisabled'>
): 'alias' | 'disabled' | undefined {
  if (user.accountLinkState === 'linked-alias' || (user.linkedPrimaryUserId?.trim() ?? '') !== '') {
    return 'alias';
  }
  if (user.loginDisabled === true) return 'disabled';
  return undefined;
}

export function isCanonicalActiveUser(
  user: Pick<UserAttributes, 'accountLinkState' | 'linkedPrimaryUserId' | 'loginDisabled'>
): boolean {
  return canonicalActiveUserRejection(user) === undefined;
}

function errorCode(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('code' in value)) return undefined;
  return value.code;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (errorCode(error) === 'E_UNIQUE' || errorCode(error) === 11_000) return true;
  if (typeof error !== 'object' || error === null) return false;
  for (const nestedKey of ['raw', 'cause', 'details'] as const) {
    const nested: unknown = Reflect.get(error, nestedKey);
    if (errorCode(nested) === 'E_UNIQUE' || errorCode(nested) === 11_000) return true;
  }
  return false;
}

/**
 * Best-effort denied/failed audit for recovery attempts that never reach a
 * mutation transaction. An audit-storage failure never masks the rejection:
 * the operator still receives the exact validation error.
 */
async function auditRecoveryAttempt(
  outcome: 'denied' | 'failed',
  reasonCode: string,
  message: string,
  detail: {
    readonly operator: string;
    readonly reason: string;
    readonly target?: string;
    readonly principalId?: string;
    readonly targetId?: string;
  }
): Promise<void> {
  try {
    const recordAttempt = sails.services.authorizationauditservice.recordAttempt;
    if (typeof recordAttempt !== 'function') return;
    await recordAttempt(
      {
        eventType: 'assignment.reactivated',
        actorType: 'operator',
        actorId: detail.operator,
        authMethod: 'operator',
        targetType: 'role-assignment',
        ...(detail.targetId !== undefined ? { targetId: detail.targetId } : {}),
        reasonCode,
        reason: detail.reason.length > 0 ? detail.reason : message,
        after: {
          source: 'recovery',
          sourceKey: BOOTSTRAP_SOURCE_KEY,
          ...(detail.principalId !== undefined ? { principalId: detail.principalId } : {}),
          ...(detail.target !== undefined ? { target: detail.target } : {}),
        },
      },
      outcome
    );
  } catch {
    // Best-effort only: the rejection below stands regardless.
  }
}

/**
 * Declared migration-service result surface for protected bootstrap. The
 * cross-service call crosses an untyped boundary, so the shape is validated
 * at runtime and rejected fail-closed instead of cast blindly.
 */
interface BrandRoleReconciliation {
  readonly issues: readonly AuthorizationMigrationIssue[];
  readonly metrics: { readonly conflictsResolved: number; readonly transactionFailures: number };
}

function isMigrationIssue(value: unknown): value is AuthorizationMigrationIssue {
  if (typeof value !== 'object' || value === null || !('code' in value)) return false;
  return (
    typeof value.code === 'string' &&
    'severity' in value &&
    (value.severity === 'blocker' || value.severity === 'warning' || value.severity === 'expected') &&
    'entityType' in value &&
    (value.entityType === 'role' ||
      value.entityType === 'user' ||
      value.entityType === 'assignment' ||
      value.entityType === 'protected-state')
  );
}

function asBrandRoleReconciliation(value: unknown): BrandRoleReconciliation {
  if (typeof value !== 'object' || value === null || !('issues' in value) || !('metrics' in value)) {
    throw new Error('Brand role reconciliation returned an invalid result shape.');
  }
  if (!Array.isArray(value.issues) || !value.issues.every(isMigrationIssue)) {
    throw new Error('Brand role reconciliation returned invalid issues.');
  }
  const metrics = value.metrics;
  if (
    typeof metrics !== 'object' ||
    metrics === null ||
    !('conflictsResolved' in metrics) ||
    !('transactionFailures' in metrics) ||
    typeof metrics.conflictsResolved !== 'number' ||
    typeof metrics.transactionFailures !== 'number'
  ) {
    throw new Error('Brand role reconciliation returned invalid metrics.');
  }
  return {
    issues: value.issues,
    metrics: {
      conflictsResolved: metrics.conflictsResolved,
      transactionFailures: metrics.transactionFailures,
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Typed global-model read behind a runtime guard instead of a blind cast. */
function readGlobalModel(name: string): Record<string, unknown> | undefined {
  const candidate: unknown = Reflect.get(globalThis, name);
  return isObject(candidate) ? candidate : undefined;
}

function isRoleRecord(value: unknown): value is RoleAttributes {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value;
}

/** Checked adapter for role rows crossing the untyped Waterline boundary. */
function asRoleRecords(value: unknown, operation: string): RoleAttributes[] {
  if (!Array.isArray(value)) {
    throw new Error(`${operation} returned a non-array page; failing closed.`);
  }
  const rows = value.filter(isRoleRecord);
  if (rows.length !== value.length) {
    throw new Error(`${operation} returned a malformed role row; failing closed.`);
  }
  return rows;
}

function isUserRecord(value: unknown): value is UserAttributes {
  return typeof value === 'object' && value !== null && 'id' in value;
}

/** Checked adapter for user rows crossing the untyped Waterline boundary. */
function asUserRecords(value: unknown, operation: string): UserAttributes[] {
  if (!Array.isArray(value)) {
    throw new Error(`${operation} returned a non-array candidate set; failing closed.`);
  }
  const rows = value.filter(isUserRecord);
  if (rows.length !== value.length) {
    throw new Error(`${operation} returned a malformed user row; failing closed.`);
  }
  return rows;
}

/**
 * Single-shot `limit(n)` query behind runtime shape guards. Rejects when the
 * adapter exposes no bounded limit surface or returns a non-array page,
 * instead of casting the chain blindly.
 */
async function limitQueryToArray(chain: unknown, limit: number, operation: string): Promise<unknown[]> {
  if (!isObject(chain) || typeof chain.limit !== 'function') {
    throw new Error(`${operation} has no bounded limit surface; failing closed.`);
  }
  const limited: unknown = await Reflect.apply(chain.limit, chain, [limit]);
  if (!Array.isArray(limited)) {
    throw new Error(`${operation} returned a non-array page; failing closed.`);
  }
  return limited;
}

function isAssignmentRecord(value: unknown): value is RoleAssignmentAttributes {
  // Presence guard only: downstream recovery/bootstrap logic classifies
  // field-level validity per row (principal/role/source mismatches surface
  // as blocker issues or repair predicates), so the adapter only proves the
  // row is an object with an id. Non-object or id-less rows fail closed.
  return isObject(value) && (typeof value.id === 'string' || typeof value.id === 'number');
}
/** Checked adapter for assignment rows crossing the untyped Waterline boundary. */
function asAssignmentRecords(value: unknown, operation: string): RoleAssignmentAttributes[] {
  if (!Array.isArray(value)) {
    throw new Error(`${operation} returned a non-array page; failing closed.`);
  }
  const rows = value.filter(isAssignmentRecord);
  if (rows.length !== value.length) {
    throw new Error(`${operation} returned a malformed assignment row; failing closed.`);
  }
  return rows;
}

/** Registry read surface behind a runtime shape guard instead of a blind cast. */
function asScopeRegistrySurface(value: unknown, operation: string): { isActive(scope: string): boolean } {
  if (!isObject(value) || typeof value.isActive !== 'function') {
    throw new Error(`${operation} is unavailable: scope registry has no isActive surface; failing closed.`);
  }
  const isActive = value.isActive;
  return {
    isActive: (scope: string): boolean => Reflect.apply(isActive, value, [scope]) === true,
  };
}

function isBrandRow(value: unknown): value is { id: string | number } {
  return isObject(value) && (typeof value.id === 'string' || typeof value.id === 'number');
}

function isOverrideRecord(value: unknown): value is RoleScopeOverrideAttributes {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'scopeKey' in value &&
    'effect' in value &&
    (value.effect === 'add' || value.effect === 'remove')
  );
}

/** Checked adapter for scope-override rows crossing the untyped Waterline boundary. */
function asOverrideRecords(value: unknown, operation: string): RoleScopeOverrideAttributes[] {
  if (!Array.isArray(value)) {
    throw new Error(`${operation} did not return a page; failing closed.`);
  }
  const rows = value.filter(isOverrideRecord);
  if (rows.length !== value.length) {
    throw new Error(`${operation} returned a malformed override row; failing closed.`);
  }
  return rows;
}

/** Best-effort timer `unref` behind a runtime shape guard instead of a blind cast. */
function unrefTimer(handle: unknown): void {
  if (!isObject(handle) || typeof handle.unref !== 'function') return;
  Reflect.apply(handle.unref, handle, []);
}

/** Checked adapter for the drift report crossing the untyped service boundary. */
function asDriftReport(value: unknown): AuthorizationDriftReport {
  if (!isObject(value)) {
    throw new Error('Drift report returned an unreadable result; failing closed.');
  }
  if (
    typeof value.generatedAt !== 'string' ||
    !Array.isArray(value.issues) ||
    typeof value.truncated !== 'boolean' ||
    !isObject(value.summary)
  ) {
    throw new Error('Drift report returned a malformed result; failing closed.');
  }
  const issues = value.issues.filter(isMigrationIssue);
  if (issues.length !== value.issues.length) {
    throw new Error('Drift report returned invalid issues; failing closed.');
  }
  const summary = value.summary;
  const blocker = summary.blocker;
  const warning = summary.warning;
  const expected = summary.expected;
  if (typeof blocker !== 'number' || typeof warning !== 'number' || typeof expected !== 'number') {
    throw new Error('Drift report returned a malformed summary; failing closed.');
  }
  const continuation = value.continuation;
  if (continuation !== undefined && typeof continuation !== 'string') {
    throw new Error('Drift report returned a malformed continuation; failing closed.');
  }
  return {
    generatedAt: value.generatedAt,
    issues,
    truncated: value.truncated,
    summary: { blocker, warning, expected },
    ...(continuation === undefined ? {} : { continuation }),
  };
}

/** Checked adapter for a single assignment row crossing the untyped Waterline boundary. */
function asAssignmentRecord(value: unknown, operation: string): RoleAssignmentAttributes | undefined {
  if (value == null) return undefined;
  if (!isAssignmentRecord(value)) {
    throw new Error(`${operation} returned a malformed assignment row; failing closed.`);
  }
  return value;
}

/** `findOne(...).usingConnection(...)` behind runtime shape guards. */
async function findOneOnConnection(
  model: Record<string, unknown>,
  criteria: unknown,
  connection: unknown,
  operation: string
): Promise<unknown> {
  if (typeof model.findOne !== 'function') {
    throw new Error(`${operation} is unavailable: model has no findOne; failing closed.`);
  }
  const chain: unknown = Reflect.apply(model.findOne, model, [criteria]);
  if (!isObject(chain) || typeof chain.usingConnection !== 'function') {
    throw new Error(`${operation} returned a malformed query chain; failing closed.`);
  }
  return Reflect.apply(chain.usingConnection, chain, [connection]);
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
  eventType: 'role.created' | 'role.updated' | 'role.noop' | 'role.scopes-updated' | 'assignment.created',
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
 * The system assignment is brandless with required metadata/version state: a
 * branded row, missing version, wrong principal/role/source tuple, or missing
 * actor metadata is noncanonical and blocks, never accepted as effective.
 */
export function protectedSystemAssignmentBootstrapIssue(
  assignment: Pick<
    RoleAssignmentAttributes,
    | 'expiresAt'
    | 'sourcePresent'
    | 'status'
    | 'branding'
    | 'version'
    | 'principalType'
    | 'principalId'
    | 'role'
    | 'source'
    | 'sourceKey'
    | 'assignedBy'
    | 'assignedAt'
  >,
  now: Date,
  expected?: { readonly principalId?: string; readonly roleId?: string }
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
  if (assignment.status !== 'active' || assignment.sourcePresent !== true) {
    return 'bootstrap-system-assignment-noncanonical';
  }
  // Exact brandless system identity: system assignments carry no brand.
  if (assignment.branding != null) return 'bootstrap-system-assignment-noncanonical';
  if (!(Number.isInteger(assignment.version) && Number(assignment.version) >= 1)) {
    return 'bootstrap-system-assignment-noncanonical';
  }
  if (assignment.principalType !== 'user') return 'bootstrap-system-assignment-noncanonical';
  if (assignment.source !== 'recovery' || assignment.sourceKey !== BOOTSTRAP_SOURCE_KEY) {
    return 'bootstrap-system-assignment-noncanonical';
  }
  if (typeof assignment.assignedBy !== 'string' || assignment.assignedBy.trim().length === 0) {
    return 'bootstrap-system-assignment-noncanonical';
  }
  if (assignment.assignedAt == null) return 'bootstrap-system-assignment-noncanonical';
  if (expected?.principalId !== undefined && String(assignment.principalId) !== expected.principalId) {
    return 'bootstrap-system-assignment-noncanonical';
  }
  if (expected?.roleId !== undefined && String(associationIdentity(assignment.role)) !== expected.roleId) {
    return 'bootstrap-system-assignment-noncanonical';
  }
  return undefined;
}

/**
 * A Guest override may stay only when it is expressible and safe: an addition
 * must name a scope on the reviewed Guest allowlist, and a removal must never
 * strip the Guest scope floor (`authorization.self.read`). Any override
 * naming a scope the deployed registry no longer declares is dropped, because
 * it can never grant anything and would otherwise linger as unexplained
 * configuration. Floor-removal rows are deleted here and also block readiness
 * via drift (see `reportDrift` guest-override scan).
 */
function isRetainableGuestOverride(override: RoleScopeOverrideAttributes): boolean {
  const registry = asScopeRegistrySurface(
    sails.services.authorizationscopeservice.getRegistry(),
    'Guest override retainability check'
  );
  // A malformed scope key can never be expressible: drop it instead of
  // branding it valid by cast.
  if (typeof override.scopeKey !== 'string' || !isScopeKey(override.scopeKey)) {
    return false;
  }
  const scopeKey = override.scopeKey;
  if (!registry.isActive(scopeKey)) {
    return false;
  }
  if (override.effect === 'remove') {
    // GUEST_SCOPE_FLOOR removals are never retainable: the effective Guest
    // baseline must always grant the floor.
    if ((GUEST_SCOPE_FLOOR as readonly string[]).includes(String(scopeKey))) return false;
    return true;
  }
  return GUEST_SCOPE_ALLOWLIST.has(scopeKey);
}

/** True when a Guest override removes a protected floor scope and must block readiness. */
export function isGuestFloorRemovalOverride(
  override: Pick<RoleScopeOverrideAttributes, 'scopeKey' | 'effect'>
): boolean {
  return override.effect === 'remove' && (GUEST_SCOPE_FLOOR as readonly string[]).includes(String(override.scopeKey));
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
    // Canonical link-chain resolution shared with migration: a row whose
    // state is `linked-alias` is an alias even when its primary pointer is
    // dangling/empty, and any non-empty pointer canonicalizes away from the
    // row. Accepting an alias without a pointer would grant authority to the
    // wrong principal. Fail closed on both shapes.
    const pointer = current.linkedPrimaryUserId?.trim() ?? '';
    if (current.accountLinkState === 'linked-alias' && pointer === '') {
      issues.push({ code: 'bootstrap-user-alias-missing-primary', severity: 'blocker', entityType: 'protected-state' });
      return undefined;
    }
    if (!pointer) {
      if (current.loginDisabled === true) {
        issues.push({ code: 'bootstrap-user-disabled', severity: 'blocker', entityType: 'protected-state' });
        return undefined;
      }
      return current;
    }
    current = await User.findOne({ id: pointer });
  }
  issues.push({ code: 'bootstrap-user-primary-missing', severity: 'blocker', entityType: 'protected-state' });
  return undefined;
}

export namespace Services {
  export class AuthorizationBootstrapService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['bootstrap', 'recoverSystemAdministrator'];

    private async ensureGuestRoles(
      issues: AuthorizationMigrationIssue[],
      lease?: BootstrapMutationLease
    ): Promise<{ created: number; repaired: number }> {
      const definition = templateDefinition('guest');
      const template = await templateRecord('guest');
      // Bounded brand scan: page with limit+1 before materialization and
      // ensure each page inline so startup never accumulates the whole brand
      // table in process memory. Fail-closed when the adapter exposes no bound.
      let created = 0;
      let repaired = 0;
      let lastBrandId: string | undefined;
      for (;;) {
        const criteria = lastBrandId === undefined ? {} : { id: { '>': lastBrandId } };
        const chain: unknown = BrandingConfig.find(criteria).sort('id ASC');
        if (!isObject(chain) || typeof chain.limit !== 'function') {
          issues.push({
            code: 'brand-scan-incomplete',
            severity: 'blocker',
            entityType: 'protected-state',
          });
          break;
        }
        const rawPage: unknown = await Reflect.apply(chain.limit, chain, [501]);
        if (!Array.isArray(rawPage)) throw new Error('Brand scan did not return a page.');
        const brandRows = rawPage.filter(isBrandRow);
        if (brandRows.length !== rawPage.length) throw new Error('Brand scan returned a malformed row.');
        const page = brandRows.map(brand => String(brand.id));
        const cursor: string | undefined = lastBrandId;
        const filtered = cursor === undefined ? page : page.filter(id => id > cursor);
        // Full raw page with no post-cursor progress proves the adapter
        // ignored the range predicate: fail closed, preserve the cursor,
        // and never mark the brand scan complete.
        if (cursor !== undefined && page.length > 500 && filtered.length === 0) {
          issues.push({
            code: 'brand-scan-incomplete',
            severity: 'blocker',
            entityType: 'protected-state',
          });
          break;
        }
        const batch = filtered.slice(0, 500);
        for (const brandId of batch) {
          const outcome = await this.ensureGuestRoleForBrand(brandId, definition, template, issues, false, lease);
          created += outcome.created;
          repaired += outcome.repaired;
        }
        if (page.length <= 500) break;
        const lastBrand = batch[batch.length - 1];
        if (lastBrand === undefined) break;
        lastBrandId = lastBrand;
      }
      return { created, repaired };
    }

    /**
     * Ensures one brand Guest role. The candidate snapshot is re-read inside
     * the repair transaction so a concurrent mutation cannot slip between the
     * read and the write. A unique-constraint failure on create means a
     * concurrent lift won the race: the body runs once more in a fresh
     * transaction, adopts the winner only when its identity matches the
     * protected Guest exactly, and reports identity drift otherwise.
     */
    private async ensureGuestRoleForBrand(
      brandId: string,
      definition: DefaultRoleTemplateDefinition,
      template: RoleTemplateAttributes,
      issues: AuthorizationMigrationIssue[],
      raceAdopted: boolean,
      lease?: BootstrapMutationLease
    ): Promise<{ created: number; repaired: number }> {
      try {
        return await runWithRequiredTransaction(Role.getDatastore(), async connection => {
          // Session-bound conditional owner+fence+unexpired lease write fence:
          // a TTL takeover between bootstrap start and this commit aborts the
          // Guest create/repair instead of mutating past a lost lease. On
          // durable topologies an absent lease rejects here before any Guest
          // write; pure unit-test doubles with no holder anywhere keep the
          // historical leaseless path.
          if (lease !== undefined) {
            await fenceLeaseInMutationSession(lease, connection, `bootstrap guest role '${brandId}'`);
          } else if (isDurableMutationLeaseRequired()) {
            throw new Error(
              `Protected authorization bootstrap guest role '${brandId}' rejected: no lease held; acquire the migration lease first.`
            );
          }
          // Adapter-bounded candidate scan: limit+1 probe detects ambiguity
          // without materializing an unbounded brand role table. Fail-closed
          // when the adapter exposes no bound.
          const candidateChain: unknown = Role.find({
            branding: brandId,
            or: [{ protectedKind: 'guest' }, { name: definition.legacyRoleName }],
          })
            .sort('id ASC')
            .usingConnection(connection);
          // Adapter-bounded limit+1 probe; fail closed when the adapter
          // exposes no bound, and propagate malformed pages fail-closed.
          if (!isObject(candidateChain) || typeof candidateChain.limit !== 'function') {
            issues.push({
              code: 'protected-guest-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
              entityId: brandId,
            });
            return { created: 0, repaired: 0 };
          }
          const candidates = asRoleRecords(
            await limitQueryToArray(candidateChain, 3, 'Protected Guest role scan'),
            'Protected Guest role scan'
          );
          if (candidates.length > 1) {
            issues.push({
              code: 'protected-guest-ambiguous',
              severity: 'blocker',
              entityType: 'protected-state',
              entityId: brandId,
            });
            return { created: 0, repaired: 0 };
          }
          let created = 0;
          let repaired = 0;
          let role = candidates[0];
          if (role === undefined) {
            role = await Role.create({
              name: definition.legacyRoleName,
              key: definition.legacyRoleName,
              identityKey: buildRoleIdentityKey('brand', String(definition.legacyRoleName), brandId),
              displayName: definition.displayName,
              description: definition.description,
              contextType: 'brand',
              branding: brandId,
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
            await bootstrapAudit('role.created', 'role', role.id, { protectedKind: 'guest' }, connection, brandId);
            created += 1;
          } else {
            const expectedIdentity = buildRoleIdentityKey('brand', role.name, brandId);
            // Exact persisted key is required: a missing key never falls back
            // to `name`, so a keyless Guest row blocks as key drift.
            if (role.key !== role.name) {
              issues.push({
                code: 'protected-guest-key-drift',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              return { created, repaired };
            }
            if (raceAdopted && !isExactGuestRole(role, brandId)) {
              // The concurrent winner owns this identity but is not the
              // protected Guest: adopting or repairing it would launder an
              // unrelated role into protected state.
              issues.push({
                code: 'protected-guest-identity-drift',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              return { created, repaired };
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
              version: nextProtectedRoleVersion(role),
              updatedBy: BOOTSTRAP_ACTOR,
            };
            const changed =
              role.key !== role.name ||
              role.identityKey !== expectedIdentity ||
              !(typeof role.displayName === 'string' && role.displayName.trim().length > 0) ||
              role.contextType !== 'brand' ||
              associationIdentity(role.branding) !== brandId ||
              role.protectedKind !== 'guest' ||
              role.status !== 'active' ||
              !(Number.isInteger(role.version) && Number(role.version) >= 1) ||
              associationIdentity(role.template) !== template.id ||
              role.templateRevision !== definition.revision;
            if (changed) {
              const updated = await Role.updateOne(protectedRoleRepairCriteria(role))
                .set(changes)
                .meta({ skipAllLifecycleCallbacks: true })
                .usingConnection(connection);
              if (updated == null) throw new Error(`Guest role '${role.id}' changed concurrently.`);
              await bootstrapAudit('role.updated', 'role', role.id, { protectedKind: 'guest' }, connection, brandId);
              repaired += 1;
            } else if (raceAdopted) {
              // The concurrent winner is already the exact protected Guest:
              // adopting it is a no-op, but the adoption must still be audited
              // in this same fresh transaction rather than silently absorbed.
              await bootstrapAudit(
                'role.noop',
                'role',
                role.id,
                { protectedKind: 'guest', state: 'active-adopted' },
                connection,
                brandId
              );
            }
          }
          // Guest scopes remain administrator-configurable, so normalization removes
          // only the overrides that are unsafe, unusable, or floor-removing:
          // additions outside the reviewed Guest allowlist, removals of the
          // protected Guest floor, and any override naming a scope the
          // deployed registry no longer declares. Valid non-floor removals
          // and allowlisted additions are preserved. Paged to exhaustion
          // ordered by id in bounded mutation batches so neither the scan
          // state nor a single destroy accumulates unbounded IDs;
          // fail-closed when the adapter exposes no bound.
          let lastOverrideId: string | undefined;
          let removedUnsafeOverrideCount = 0;
          for (;;) {
            const pageCriteria =
              lastOverrideId === undefined ? { role: role.id } : { role: role.id, id: { '>': lastOverrideId } };
            const pageChain: unknown = RoleScopeOverride.find(pageCriteria).sort('id ASC').usingConnection(connection);
            if (!isObject(pageChain) || typeof pageChain.limit !== 'function') {
              issues.push({
                code: 'protected-guest-overrides-scan-incomplete',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              // Commit-guarding fence: the Guest role create/repair and audit
              // writes above (plus any override destroys from earlier pages)
              // must not commit past a lease lost mid-transaction. This
              // bounded-scan failure returns a success-shaped value that
              // commits, so it fences exactly like the normal pre-commit path.
              // On durable topologies an absent lease rejects here rather than
              // committing Guest state unfenced (post-write takeover guard).
              if (lease !== undefined) {
                await fenceLeaseInMutationSession(lease, connection, `bootstrap guest role '${brandId}' (pre-commit)`);
              } else if (isDurableMutationLeaseRequired()) {
                throw new Error(
                  `Protected authorization bootstrap guest role '${brandId}' rejected: no lease held; acquire the migration lease first.`
                );
              }
              return { created, repaired };
            }
            const rawOverrides: unknown = await Reflect.apply(pageChain.limit, pageChain, [501]);
            if (!Array.isArray(rawOverrides)) throw new Error('Guest override scan did not return a page.');
            const page = asOverrideRecords(rawOverrides, 'Guest override scan');
            const filtered =
              lastOverrideId === undefined
                ? page
                : page.filter(override => String(override.id) > String(lastOverrideId));
            // Full raw page with no post-cursor progress proves the adapter
            // ignored the range predicate: fail closed, preserve the cursor,
            // and never treat the override scan as complete.
            if (lastOverrideId !== undefined && page.length > 500 && filtered.length === 0) {
              issues.push({
                code: 'protected-guest-overrides-scan-incomplete',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              // Commit-guarding fence: same post-write commit path as above —
              // a stalled cursor after role writes must still prove the lease
              // before the transaction commits. On durable topologies an
              // absent lease rejects here (post-write takeover guard).
              if (lease !== undefined) {
                await fenceLeaseInMutationSession(lease, connection, `bootstrap guest role '${brandId}' (pre-commit)`);
              } else if (isDurableMutationLeaseRequired()) {
                throw new Error(
                  `Protected authorization bootstrap guest role '${brandId}' rejected: no lease held; acquire the migration lease first.`
                );
              }
              return { created, repaired };
            }
            const batch = filtered;
            const unsafePageIds: Array<string | number> = [];
            let floorRemovalInPage = 0;
            for (const override of batch.slice(0, 500)) {
              if (!isRetainableGuestOverride(override)) {
                unsafePageIds.push(override.id);
                // Persist the protected-guest floor removal as a readiness
                // blocker BEFORE deletion: drift runs after bootstrap and can
                // never observe a deleted row. The blocker survives in the
                // bootstrap readiness result even though the row is repaired.
                if (isGuestFloorRemovalOverride(override)) floorRemovalInPage += 1;
              }
            }
            if (floorRemovalInPage > 0) {
              issues.push({
                code: 'protected-guest-floor-removed',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
            }
            if (unsafePageIds.length > 0) {
              await RoleScopeOverride.destroy({ id: unsafePageIds }).usingConnection(connection);
              removedUnsafeOverrideCount += unsafePageIds.length;
            }
            if (page.length <= 500) break;
            const last = batch[Math.min(batch.length, 500) - 1];
            if (last === undefined) break;
            lastOverrideId = String(last.id);
          }
          if (removedUnsafeOverrideCount > 0) {
            const floorRemoved = issues.some(
              issue => issue.code === 'protected-guest-floor-removed' && issue.entityId === String(role.id)
            );
            await bootstrapAudit(
              'role.scopes-updated',
              'role',
              role.id,
              floorRemoved
                ? { removedUnsafeOverrideCount, protectedGuestFloorRemoved: true }
                : { removedUnsafeOverrideCount },
              connection,
              brandId
            );
          }
          // Commit-guarding fence: the Guest create/repair/override writes and
          // their audits above must not commit past a lease lost
          // mid-transaction. (Candidate drift/ambiguity early returns above
          // perform no writes and need no fence; the override-scan failure
          // returns above are fenced inline for the same reason as here.)
          // On durable topologies an absent lease rejects here (post-write
          // takeover guard) rather than committing Guest state unfenced.
          if (lease !== undefined) {
            await fenceLeaseInMutationSession(lease, connection, `bootstrap guest role '${brandId}' (pre-commit)`);
          } else if (isDurableMutationLeaseRequired()) {
            throw new Error(
              `Protected authorization bootstrap guest role '${brandId}' rejected: no lease held; acquire the migration lease first.`
            );
          }
          return { created, repaired };
        });
      } catch (error) {
        if (!raceAdopted && isUniqueConstraintError(error)) {
          // A concurrent lift created the Guest first: reread the winner in a
          // fresh transaction and adopt it only on exact protected identity.
          // The lease propagates so the retry stays fenced; a lease lost in
          // between fails closed instead of adopting.
          return this.ensureGuestRoleForBrand(brandId, definition, template, issues, true, lease);
        }
        throw error;
      }
    }

    private async ensureSystemRole(
      issues: AuthorizationMigrationIssue[],
      raceAdopted = false,
      lease?: BootstrapMutationLease
    ): Promise<{ role?: RoleAttributes; created: boolean }> {
      const definition = templateDefinition('system-admin');
      const template = await templateRecord('system-admin');
      try {
        return await runWithRequiredTransaction(Role.getDatastore(), async connection => {
          // Session-bound lease write fence shared with the Guest path: a
          // takeover between bootstrap start and this commit aborts the
          // system-role create/repair. On durable topologies an absent lease
          // rejects here before any system-role write.
          if (lease !== undefined) {
            await fenceLeaseInMutationSession(lease, connection, 'bootstrap system role');
          } else if (isDurableMutationLeaseRequired()) {
            throw new Error(
              'Protected authorization bootstrap system role rejected: no lease held; acquire the migration lease first.'
            );
          }
          // Re-read inside the transaction: a snapshot taken before the lease
          // cannot authorize a repair. Adapter-bounded limit+1 probe; fail
          // closed when the adapter exposes no bound.
          const systemChain: unknown = Role.find({
            or: [{ identityKey: 'system:system-admin' }, { contextType: 'system' }, { protectedKind: 'system-admin' }],
          })
            .sort('id ASC')
            .usingConnection(connection);
          // Adapter-bounded limit+1 probe; fail closed when the adapter
          // exposes no bound, and propagate malformed pages fail-closed.
          if (!isObject(systemChain) || typeof systemChain.limit !== 'function') {
            issues.push({
              code: 'system-admin-role-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            });
            return { created: false };
          }
          const candidates = asRoleRecords(
            await limitQueryToArray(systemChain, 3, 'System administrator role scan'),
            'System administrator role scan'
          );
          if (candidates.length > 1) {
            issues.push({ code: 'system-admin-role-ambiguous', severity: 'blocker', entityType: 'protected-state' });
            return { created: false };
          }
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
            // Commit-guarding fence: the create+audit above must not commit
            // past a lease lost mid-transaction (post-write takeover guard).
            if (lease !== undefined) {
              await fenceLeaseInMutationSession(lease, connection, 'bootstrap system role (pre-commit)');
            } else if (isDurableMutationLeaseRequired()) {
              throw new Error(
                'Protected authorization bootstrap system role rejected: no lease held; acquire the migration lease first.'
              );
            }
            return { role, created: true };
          }
          // Exact protected persisted identity: malformed key, displayName,
          // version, or branded/system shape is never accepted silently.
          // Key drift blocks; displayName/version/brandless shape is repaired
          // when the row is otherwise the protected identity, otherwise it
          // blocks as identity drift (see below).
          if (role.name !== 'system-admin' || role.key !== 'system-admin') {
            issues.push({
              code: 'system-admin-role-key-drift',
              severity: 'blocker',
              entityType: 'role',
              entityId: role.id,
            });
            return { created: false };
          }
          if (
            typeof role.displayName !== 'string' ||
            role.displayName.trim().length === 0 ||
            !(Number.isInteger(role.version) && Number(role.version) >= 1) ||
            role.branding != null ||
            role.identityKey !== 'system:system-admin' ||
            role.contextType !== 'system' ||
            role.protectedKind !== 'system-admin'
          ) {
            // Malformed persisted identity that is not a key/name drift: the
            // repair below restores the exact brandless identity, required
            // metadata, and version state. When the row cannot be repaired
            // (concurrent change), the CAS fails closed.
            if (role.branding != null) {
              issues.push({
                code: 'system-admin-role-identity-drift',
                severity: 'blocker',
                entityType: 'role',
                entityId: role.id,
              });
              return { created: false };
            }
          }
          if (raceAdopted && !isExactSystemAdminRole(role)) {
            // The concurrent winner owns the unique identity but is not the
            // protected system role: adopting it would launder authority.
            issues.push({
              code: 'system-admin-role-identity-drift',
              severity: 'blocker',
              entityType: 'role',
              entityId: role.id,
            });
            return { created: false };
          }
          const changed =
            !isExactSystemAdminRole(role) ||
            role.status !== 'active' ||
            role.key !== 'system-admin' ||
            associationIdentity(role.template) !== template.id ||
            role.templateRevision !== definition.revision;
          if (changed) {
            const updated = await Role.updateOne(protectedRoleRepairCriteria(role))
              .set({
                key: 'system-admin',
                identityKey: 'system:system-admin',
                displayName: role.displayName?.trim() ? role.displayName : definition.displayName,
                contextType: 'system',
                template: template.id,
                templateRevision: definition.revision,
                protectedKind: 'system-admin',
                status: 'active',
                version: nextProtectedRoleVersion(role),
                updatedBy: BOOTSTRAP_ACTOR,
              })
              .meta({ skipAllLifecycleCallbacks: true })
              .usingConnection(connection);
            if (updated == null) throw new Error(`System administrator role '${role.id}' changed concurrently.`);
            role = updated;
            await bootstrapAudit('role.updated', 'role', role.id, { protectedKind: 'system-admin' }, connection);
          } else if (raceAdopted) {
            // The concurrent winner is already the exact protected system
            // role: adopting it is a no-op, but the adoption must still be
            // audited in this same fresh transaction.
            await bootstrapAudit(
              'role.noop',
              'role',
              role.id,
              { protectedKind: 'system-admin', state: 'active-adopted' },
              connection
            );
          }
          // Commit-guarding fence: the repair/noop-audit above must not commit
          // past a lease lost mid-transaction. (Ambiguity/drift early returns
          // above perform no writes and need no fence.) On durable topologies
          // an absent lease rejects here (post-write takeover guard).
          if (lease !== undefined) {
            await fenceLeaseInMutationSession(lease, connection, 'bootstrap system role (pre-commit)');
          } else if (isDurableMutationLeaseRequired()) {
            throw new Error(
              'Protected authorization bootstrap system role rejected: no lease held; acquire the migration lease first.'
            );
          }
          return { role, created: false };
        });
      } catch (error) {
        if (!raceAdopted && isUniqueConstraintError(error)) {
          // A concurrent lift created the system role first: reread the
          // winner in a fresh transaction and adopt it only on exact identity.
          // The lease propagates so the retry stays fenced.
          return this.ensureSystemRole(issues, true, lease);
        }
        throw error;
      }
    }

    private async ensureSystemAssignment(
      role: RoleAttributes,
      principal: UserAttributes,
      issues: AuthorizationMigrationIssue[],
      lease?: BootstrapMutationLease
    ): Promise<{ created: boolean; repaired: boolean }> {
      const principalId = String(principal.id);
      const selector = {
        principalType: 'user',
        principalId,
        role: role.id,
        source: 'recovery',
        sourceKey: BOOTSTRAP_SOURCE_KEY,
      };
      // Creation plus its success audit commit atomically in an isolated
      // transaction; the duplicate-race reread runs in a subsequent fresh
      // transaction (never inside the aborted one), adopts only the canonical
      // identical winner, and audits the outcome (created vs adopted-noop).
      // The canonical principal is reloaded and revalidated inside the
      // transaction, and all rows for the protected source/key are scanned
      // first so a noncanonical tuple cannot be bypassed silently.
      try {
        return await runWithRequiredTransaction(RoleAssignment.getDatastore(), async connection => {
          // Session-bound lease write fence: a takeover between bootstrap
          // start and this commit aborts the system-assignment
          // create/adopt instead of granting authority past a lost lease. On
          // durable topologies an absent lease rejects here before any
          // assignment write.
          if (lease !== undefined) {
            await fenceLeaseInMutationSession(lease, connection, 'bootstrap system assignment');
          } else if (isDurableMutationLeaseRequired()) {
            throw new Error(
              'Protected authorization bootstrap system assignment rejected: no lease held; acquire the migration lease first.'
            );
          }
          const userModel = readGlobalModel('User');
          if (userModel === undefined || typeof userModel.findOne !== 'function') {
            issues.push({
              code: 'bootstrap-user-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            });
            throw new Error(
              `Bootstrap system assignment principal '${principalId}' cannot be revalidated: User model unavailable.`
            );
          }
          const rawPrincipal: unknown = await findOneOnConnection(
            userModel,
            { id: principalId },
            connection,
            'Bootstrap system assignment principal reread'
          );
          if (rawPrincipal == null) {
            throw new Error(
              `Bootstrap system assignment principal '${principalId}' changed during bootstrap; retry with the canonical user.`
            );
          }
          if (!isUserRecord(rawPrincipal) || String(rawPrincipal.id) !== principalId) {
            throw new Error(
              `Bootstrap system assignment principal '${principalId}' changed during bootstrap; retry with the canonical user.`
            );
          }
          const freshPrincipal = rawPrincipal;
          const pointer = freshPrincipal.linkedPrimaryUserId?.trim() ?? '';
          if (freshPrincipal.accountLinkState === 'linked-alias' || pointer !== '') {
            issues.push({
              code: 'bootstrap-user-alias-missing-primary',
              severity: 'blocker',
              entityType: 'protected-state',
            });
            throw new Error(
              `Bootstrap system assignment principal '${principalId}' is a linked alias; resolve the canonical primary first.`
            );
          }
          if (freshPrincipal.loginDisabled === true) {
            issues.push({ code: 'bootstrap-user-disabled', severity: 'blocker', entityType: 'protected-state' });
            throw new Error(`Bootstrap system assignment principal '${principalId}' is disabled.`);
          }
          // Bounded ordered limit+1 pagination over the protected source/key:
          // pages of 500 ordered by id with a 501 probe, client-side
          // post-cursor filtering as the authoritative progress check, and
          // stall detection when a full raw page yields no post-cursor rows
          // (predicate-ignoring adapter). Any unavailable model, query/bound
          // failure, non-array page, or stall records an entity-scoped
          // blocker and aborts fail-closed: the canonical row is never
          // accepted/created while hidden protected rows may be omitted, and
          // no narrow exact-tuple fallback narrows the scan.
          const assignmentModel = readGlobalModel('RoleAssignment');
          if (assignmentModel === undefined || typeof assignmentModel.find !== 'function') {
            issues.push({
              code: 'bootstrap-system-assignment-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            });
            throw new Error(
              `Bootstrap system assignment scan for source '${BOOTSTRAP_SOURCE_KEY}' is unavailable: RoleAssignment model missing.`
            );
          }
          let protectedRows: RoleAssignmentAttributes[] = [];
          let assignmentCursor: string | undefined;
          for (;;) {
            const criteria =
              assignmentCursor === undefined
                ? { source: 'recovery', sourceKey: BOOTSTRAP_SOURCE_KEY }
                : { source: 'recovery', sourceKey: BOOTSTRAP_SOURCE_KEY, id: { '>': assignmentCursor } };
            const chain: unknown = RoleAssignment.find(criteria).sort('id ASC').usingConnection(connection);
            if (!isObject(chain) || typeof chain.limit !== 'function') {
              issues.push({
                code: 'bootstrap-system-assignment-scan-incomplete',
                severity: 'blocker',
                entityType: 'protected-state',
              });
              throw new Error(
                `Bootstrap system assignment scan for source '${BOOTSTRAP_SOURCE_KEY}' has no bounded limit surface.`
              );
            }
            let raw: unknown;
            try {
              if (!isObject(chain) || typeof chain.limit !== 'function') {
                throw new Error(
                  `Bootstrap system assignment scan for source '${BOOTSTRAP_SOURCE_KEY}' has no bounded limit surface.`
                );
              }
              raw = await Reflect.apply(chain.limit, chain, [501]);
            } catch (error) {
              issues.push({
                code: 'bootstrap-system-assignment-scan-incomplete',
                severity: 'blocker',
                entityType: 'protected-state',
              });
              throw error instanceof Error
                ? error
                : new Error(`Bootstrap system assignment scan for source '${BOOTSTRAP_SOURCE_KEY}' failed.`);
            }
            if (!Array.isArray(raw)) {
              issues.push({
                code: 'bootstrap-system-assignment-scan-incomplete',
                severity: 'blocker',
                entityType: 'protected-state',
              });
              throw new Error(
                `Bootstrap system assignment scan for source '${BOOTSTRAP_SOURCE_KEY}' returned a non-array page.`
              );
            }
            const page = asAssignmentRecords(
              raw,
              `Bootstrap system assignment scan for source '${BOOTSTRAP_SOURCE_KEY}'`
            );
            const filtered =
              assignmentCursor === undefined ? page : page.filter(row => String(row.id) > String(assignmentCursor));
            if (assignmentCursor !== undefined && page.length > 500 && filtered.length === 0) {
              issues.push({
                code: 'bootstrap-system-assignment-scan-incomplete',
                severity: 'blocker',
                entityType: 'protected-state',
              });
              throw new Error(
                `Bootstrap system assignment scan for source '${BOOTSTRAP_SOURCE_KEY}' stalled: adapter ignored the range predicate.`
              );
            }
            protectedRows = protectedRows.concat(filtered.slice(0, 500));
            if (page.length <= 500) break;
            const last = filtered.slice(0, 500)[filtered.slice(0, 500).length - 1];
            if (last === undefined) break;
            const nextCursor = String(last.id);
            if (nextCursor <= String(assignmentCursor ?? '')) {
              issues.push({
                code: 'bootstrap-system-assignment-scan-incomplete',
                severity: 'blocker',
                entityType: 'protected-state',
              });
              throw new Error(
                `Bootstrap system assignment scan for source '${BOOTSTRAP_SOURCE_KEY}' made no forward progress.`
              );
            }
            assignmentCursor = nextCursor;
          }
          for (const row of protectedRows ?? []) {
            const issueCode = protectedSystemAssignmentBootstrapIssue(row, new Date(), {
              principalId,
              roleId: String(role.id),
            });
            if (issueCode !== undefined) {
              issues.push({
                code: issueCode,
                severity: 'blocker',
                entityType: 'assignment',
                entityId: row.id,
              });
            }
          }
          const existing = (protectedRows ?? []).find(
            row => String(row.principalId) === principalId && String(associationIdentity(row.role)) === String(role.id)
          );
          if (existing != null) {
            const issueCode = protectedSystemAssignmentBootstrapIssue(existing, new Date(), {
              principalId,
              roleId: String(role.id),
            });
            if (issueCode !== undefined) {
              return { created: false, repaired: false };
            }
            return { created: false, repaired: false };
          }
          // A noncanonical protected row exists for another tuple: report
          // above and still ensure the canonical row, so the deployment
          // converges while the anomaly stays visible as a blocker.
          const created = asAssignmentRecord(
            await sails.services.authorizationpersistenceservice.createRoleAssignment(
              {
                principalType: 'user',
                principalId,
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
            ),
            'Bootstrap system assignment creation'
          );
          if (created === undefined) {
            throw new Error(
              `Bootstrap system assignment creation for principal '${principalId}' returned no row; failing closed.`
            );
          }
          await bootstrapAudit(
            'assignment.created',
            'role-assignment',
            created.id,
            { source: 'recovery', sourceKey: BOOTSTRAP_SOURCE_KEY },
            connection
          );
          // Commit-guarding fence: the assignment create+audit above must not
          // commit past a lease lost mid-transaction (post-write takeover
          // guard). On durable topologies an absent lease rejects here.
          if (lease !== undefined) {
            await fenceLeaseInMutationSession(lease, connection, 'bootstrap system assignment (pre-commit)');
          } else if (isDurableMutationLeaseRequired()) {
            throw new Error(
              'Protected authorization bootstrap system assignment rejected: no lease held; acquire the migration lease first.'
            );
          }
          return { created: true, repaired: false };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        // Concurrent lift won the race: reread the winner, validate it
        // exactly, and record the adopt-noop audit in ONE fresh required
        // transaction after the failed creation transaction (which is
        // aborted/ended and unusable). A split reread/audit could record an
        // adoption the reread never validated; an outside-transaction audit
        // could survive a reread that a retry would contradict.
        return await runWithRequiredTransaction(RoleAssignment.getDatastore(), async freshConnection => {
          // The lease propagates into the retry: adopting the winner past a
          // lost lease would grant authority the fence no longer owns.
          if (lease !== undefined) {
            await fenceLeaseInMutationSession(lease, freshConnection, 'bootstrap system assignment (conflict retry)');
          }
          const winner = asAssignmentRecord(
            await RoleAssignment.findOne(selector).usingConnection(freshConnection),
            'Bootstrap conflict winner reread'
          );
          if (
            winner == null ||
            String(winner.principalId) !== principalId ||
            String(associationIdentity(winner.role)) !== String(role.id) ||
            protectedSystemAssignmentBootstrapIssue(winner, new Date(), {
              principalId,
              roleId: String(role.id),
            }) !== undefined
          ) {
            throw error;
          }
          await sails.services.authorizationauditservice.createSucceededEvent(
            {
              eventType: 'assignment.noop',
              actorType: 'system-process',
              actorId: BOOTSTRAP_ACTOR,
              authMethod: 'internal',
              targetType: 'role-assignment',
              targetId: String(winner.id),
              after: { source: 'recovery', sourceKey: BOOTSTRAP_SOURCE_KEY, state: 'active-adopted' },
              reasonCode: 'authorization-protected-bootstrap',
            },
            freshConnection
          );
          // Commit-guarding fence for the conflict retry: adopting the winner
          // past a lost lease must still fail closed.
          if (lease !== undefined) {
            await fenceLeaseInMutationSession(
              lease,
              freshConnection,
              'bootstrap system assignment (conflict retry pre-commit)'
            );
          }
          return { created: false, repaired: false };
        });
      }
    }

    public async bootstrap(
      input: AuthorizationProtectedBootstrapInput = {}
    ): Promise<AuthorizationProtectedBootstrapResult> {
      // Concurrency-safe contract for checkpointed reconciliation: the shared
      // durable migration lease serializes concurrent startups so two lifts
      // can never reconcile protected roles, repair Guest/system state, or
      // advance migration checkpoints against each other. A live lease held
      // by another lift fails this startup closed; the heartbeat renews the
      // lease across the multi-phase run and latches on failure so later
      // phases stop instead of mutating past a lost lease. Release retains
      // the fencing tombstone, keeping the fence sequence monotonic for the
      // next owner.
      const lease = await acquireMigrationLease(
        `bootstrap:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
      );
      let leaseRenewalFailure: Error | undefined;
      const heartbeat = setInterval(() => {
        lease.renew().catch((error: unknown) => {
          if (leaseRenewalFailure === undefined) {
            leaseRenewalFailure = error instanceof Error ? error : new Error(String(error));
          }
          sails.log.error(
            `${this.logHeader} Protected authorization lease renewal failed for owner '${lease.owner}': ${String(error)}`
          );
        });
      }, MIGRATION_LEASE_RENEW_INTERVAL_MS);
      // Do not keep the lift alive on the heartbeat alone.
      unrefTimer(heartbeat);
      const requireLiveLease = async (phase: string): Promise<void> => {
        if (leaseRenewalFailure !== undefined) {
          throw new Error(
            `Protected authorization bootstrap ${phase} rejected; migration lease renewal already failed ` +
              `for owner '${lease.owner}' (fence ${lease.fence}): ${leaseRenewalFailure.message}`
          );
        }
        await assertMigrationLeaseHeld(lease);
      };
      try {
        const issues: AuthorizationMigrationIssue[] = [];
        // Validate the freshly acquired lease before any catalog work: scope
        // bootstrap and brand-role reconciliation below must never run
        // unguarded when another lift already holds the shared durable lease
        // or this lease failed to persist.
        await requireLiveLease('catalog reconciliation');
        // The acquired bootstrap lease threads into every catalog/template
        // mutation below: each scope/template transaction carries the
        // session-bound conditional owner+fence+unexpired write fence, so a
        // takeover mid-bootstrap aborts instead of reconciling past the lease.
        await sails.services.authorizationscopeservice.bootstrap(undefined, {
          owner: lease.owner,
          fence: lease.fence,
        });
        await requireLiveLease('reconciliation');
        // Reconciliation blockers belong to protected readiness: a brand role the
        // migration cannot project must surface here and in the readiness report,
        // never be silently discarded.
        let reconcileConflicts = 0;
        let reconcileFailures = 0;
        let reconcileBlockers = 0;
        try {
          const reconciled = asBrandRoleReconciliation(
            await sails.services.authorizationmigrationservice.reconcileBrandRoles(undefined, {
              owner: lease.owner,
              fence: lease.fence,
            })
          );
          issues.push(...reconciled.issues);
          reconcileConflicts = reconciled.metrics.conflictsResolved;
          reconcileFailures = reconciled.metrics.transactionFailures;
          reconcileBlockers = reconciled.issues.filter(issue => issue.severity === 'blocker').length;
        } catch (error) {
          reconcileFailures += 1;
          authorizationBootstrapOutcomes.add(1, { outcome: 'reconcile-failed' });
          sails.log.info(`${this.logHeader} Protected authorization reconcile failed`, {
            reconcileBlockers,
            conflictsResolved: reconcileConflicts,
            transactionFailures: reconcileFailures,
          });
          throw error;
        }
        await requireLiveLease('protected-role repair');
        // The acquired bootstrap lease threads into every Guest-role,
        // system-role, and system-assignment mutation below; each transaction
        // carries the session-bound lease write fence. Lease propagation
        // through reconcileBrandRoles and migrateUserAssignments is preserved
        // via the explicit owner+fence arguments.
        const bootstrapLease: BootstrapMutationLease = { owner: lease.owner, fence: lease.fence };
        const guest = await this.ensureGuestRoles(issues, bootstrapLease);
        const system = await this.ensureSystemRole(issues, false, bootstrapLease);
        const principal = await resolveCanonicalBootstrapUser(userId(input.bootstrapUser), issues);
        let assignment = { created: false, repaired: false };
        if (principal !== undefined && system.role !== undefined) {
          await requireLiveLease('system-assignment repair');
          await sails.services.authorizationmigrationservice.migrateUserAssignments(100, [String(principal.id)], {
            owner: lease.owner,
            fence: lease.fence,
          });
          assignment = await this.ensureSystemAssignment(system.role, principal, issues, bootstrapLease);
        }
        await requireLiveLease('drift reporting');
        const drift = asDriftReport(await sails.services.authorizationmigrationservice.reportDrift());
        // Renewal-latch checks after drift and immediately before the success
        // audit/readiness publication: drift scans can outlast the lease TTL,
        // and a heartbeat renewal failure during drift (or between drift and
        // publication) must reject instead of reporting success. Without
        // these gates a stale lift would publish readiness it no longer owns.
        await requireLiveLease('post-drift');
        const result: AuthorizationProtectedBootstrapResult = Object.freeze({
          guestRolesCreated: guest.created,
          guestRolesRepaired: guest.repaired,
          systemRoleCreated: system.created,
          systemAssignmentCreated: assignment.created,
          systemAssignmentRepaired: assignment.repaired,
          issues: Object.freeze([...issues]),
          drift,
          metrics: Object.freeze({
            reconcileBlockers,
            conflictsResolved: reconcileConflicts,
            transactionFailures: reconcileFailures,
          }),
        });
        await requireLiveLease('readiness publication');
        await runWithRequiredTransaction(AuthorizationAudit.getDatastore(), async connection => {
          // Lease gate on entry plus the session-bound conditional write fence
          // after the audit write, immediately before the transaction commits:
          // a lease lost at any point up to and including the audit write
          // aborts instead of recording success past the lease.
          await requireLiveLease('success audit');
          await fenceLeaseInMutationSession(bootstrapLease, connection, 'bootstrap success audit');
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
                blockerCount:
                  result.issues.filter(issue => issue.severity === 'blocker').length + drift.summary.blocker,
                warningCount:
                  result.issues.filter(issue => issue.severity === 'warning').length + drift.summary.warning,
              },
              reasonCode: 'authorization-protected-bootstrap',
            },
            connection
          );
          // Commit-guarding fence: the success audit above must not commit
          // past a lease lost while it was being recorded.
          await fenceLeaseInMutationSession(bootstrapLease, connection, 'bootstrap success audit (pre-commit)');
        });
        // Final renewal latch immediately before publication: the success-audit
        // transaction above can outlast the lease TTL (or a heartbeat renewal
        // failure can land while it commits), so the exact owner+fence lease
        // must be re-proven after the transaction and before any observable
        // readiness publication. Without this gate a stale lift would publish
        // readiness it no longer owns.
        await requireLiveLease('readiness publication (final)');
        sails.config.authorizationReadiness = result;
        authorizationBootstrapOutcomes.add(1, { outcome: 'completed' });
        sails.log.info(`${this.logHeader} Protected authorization readiness`, {
          blockerCount: result.issues.filter(issue => issue.severity === 'blocker').length + drift.summary.blocker,
          warningCount: result.issues.filter(issue => issue.severity === 'warning').length + drift.summary.warning,
          reconcileBlockers: result.metrics.reconcileBlockers,
          conflictsResolved: result.metrics.conflictsResolved,
          transactionFailures: result.metrics.transactionFailures,
        });
        return result;
      } finally {
        clearInterval(heartbeat);
        await lease.release();
      }
    }

    /**
     * Non-HTTP operator recovery for a lost system administrator. Requires the
     * exact canonical target, a typed confirmation phrase, and an operator
     * reason; never touches credentials and never runs through an HTTP route.
     */
    public async recoverSystemAdministrator(
      input: AuthorizationSystemAdminRecoveryInput
    ): Promise<AuthorizationSystemAdminRecoveryResult> {
      const operator =
        typeof input.operator === 'string' && input.operator.trim().length > 0
          ? input.operator.trim().slice(0, 128)
          : RECOVERY_ACTOR;
      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      const target = typeof input.target === 'string' ? input.target.trim() : '';
      const reject = async (
        outcome: 'denied' | 'failed',
        reasonCode: string,
        message: string,
        detail?: { principalId?: string; targetId?: string }
      ): Promise<never> => {
        authorizationBootstrapRecoveryOutcomes.add(1, { outcome: 'rejected' });
        await auditRecoveryAttempt(outcome, reasonCode, message, {
          operator,
          reason: reason.length > 0 ? reason : message,
          target: target.length > 0 ? target : undefined,
          principalId: detail?.principalId,
          targetId: detail?.targetId,
        });
        throw new Error(message);
      };

      if (input.confirmation !== RECOVERY_CONFIRMATION) {
        return reject(
          'denied',
          'recovery.confirmation-mismatch',
          'Recovery requires the exact typed confirmation phrase.'
        );
      }
      if (reason.length === 0 || reason.length > 1_000) {
        return reject(
          'denied',
          'recovery.reason-invalid',
          'Recovery requires a non-empty operator reason of at most 1,000 characters.'
        );
      }
      if (target.length === 0) {
        return reject(
          'denied',
          'recovery.target-missing',
          'Recovery requires the exact canonical username or user ID.'
        );
      }

      const candidates = asUserRecords(
        await User.find({
          or: [{ id: target }, { username: target }],
        }).limit(2),
        'Recovery target lookup'
      );
      if (candidates.length === 0) {
        return reject('denied', 'recovery.target-not-found', 'Recovery target was not found.');
      }
      if (candidates.length > 1) {
        return reject(
          'denied',
          'recovery.target-ambiguous',
          'Recovery target is ambiguous; supply the exact canonical user ID.'
        );
      }
      const principal = candidates[0];
      const preRejection = canonicalActiveUserRejection(principal);
      if (preRejection === 'alias') {
        return reject(
          'denied',
          'recovery.target-alias',
          'Recovery target is a linked alias; recover the canonical primary account instead.',
          { principalId: String(principal.id) }
        );
      }
      if (preRejection === 'disabled') {
        return reject(
          'denied',
          'recovery.target-disabled',
          'Recovery target is disabled; enable the account before recovery.',
          {
            principalId: String(principal.id),
          }
        );
      }

      // Operator lease: recovery mutates the protected system role/assignment
      // outside lift bootstrap, so it acquires the same shared durable
      // migration lease and fences every mutation transaction below with the
      // session-bound conditional owner+fence+unexpired write fence. A lift
      // holding a live lease fails recovery closed instead of racing it; a
      // takeover mid-recovery aborts the repair instead of granting authority
      // past a lost lease. Denied pre-validation paths above stay lease-free.
      const recoveryLease = await acquireMigrationLease(
        `recovery:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
      );
      const recoveryFence: BootstrapMutationLease = { owner: recoveryLease.owner, fence: recoveryLease.fence };
      try {
        return await this.recoverSystemAssignmentWithLease(operator, reason, target, principal, recoveryFence, reject);
      } finally {
        await recoveryLease.release();
      }
    }

    /**
     * Lease-fenced recovery body: every system-role/assignment mutation below
     * carries the operator lease fence. Split from `recoverSystemAdministrator`
     * so lease acquisition/release wraps the whole repair exactly once.
     */
    private async recoverSystemAssignmentWithLease(
      operator: string,
      reason: string,
      target: string,
      principal: UserAttributes,
      recoveryFence: BootstrapMutationLease,
      reject: (
        outcome: 'denied' | 'failed',
        reasonCode: string,
        message: string,
        detail?: { principalId?: string; targetId?: string }
      ) => Promise<never>
    ): Promise<AuthorizationSystemAdminRecoveryResult> {
      const issues: AuthorizationMigrationIssue[] = [];
      const ensured = await this.ensureSystemRole(issues, false, recoveryFence);
      if (ensured.role === undefined) {
        return reject(
          'failed',
          'recovery.role-unavailable',
          'The protected system administrator role is unavailable; resolve readiness blockers first.',
          { principalId: String(principal.id) }
        );
      }
      const role = ensured.role;
      const principalId = String(principal.id);

      const repairCriteria = (existing: RoleAssignmentAttributes): Record<string, unknown> => {
        if (Number.isInteger(existing.version) && Number(existing.version) >= 1) {
          return { id: existing.id, version: existing.version };
        }
        // Versionless rows predate optimistic concurrency: pin the full
        // expected pre-write snapshot — every field the repair overwrites
        // (status, presence, expiry, revocation/suppression metadata,
        // actor/time, reason, version) plus the tuple identity — with explicit
        // null/absence semantics. Absence pins as `{ field: null }` (matches
        // only null/absent); a concurrent field change then matches zero rows
        // and fails closed instead of being silently clobbered. `version` is
        // pinned explicitly so a concurrent version establishment fails closed.
        const pin = (value: unknown): unknown => (value === undefined ? null : value);
        return {
          id: existing.id,
          version: pin(existing.version),
          principalType: pin(existing.principalType),
          principalId: pin(existing.principalId),
          role: pin(associationIdentity(existing.role)),
          branding: pin(associationIdentity(existing.branding)),
          source: pin(existing.source),
          sourceKey: pin(existing.sourceKey),
          status: pin(existing.status),
          sourcePresent: pin(existing.sourcePresent),
          assignedBy: pin(existing.assignedBy),
          assignedAt: pin(existing.assignedAt),
          expiresAt: pin(existing.expiresAt),
          revokedBy: pin(existing.revokedBy),
          revokedAt: pin(existing.revokedAt),
          suppressedBy: pin(existing.suppressedBy),
          suppressedAt: pin(existing.suppressedAt),
          reason: pin(existing.reason),
        };
      };

      try {
        return await runWithRequiredTransaction(RoleAssignment.getDatastore(), async connection => {
          // Operator-lease session fence: a takeover between acquisition and
          // this commit aborts the repair instead of granting authority past
          // a lost lease.
          await fenceLeaseInMutationSession(recoveryFence, connection, 'system-admin recovery');
          // Target revalidation inside the transaction: the operator's target
          // must still resolve to the same canonical, enabled principal before
          // any repair mutates authority.
          const rawFreshPrincipal: unknown = await User.findOne({ id: principalId }).usingConnection(connection);
          if (rawFreshPrincipal == null || !isUserRecord(rawFreshPrincipal)) {
            throw new Error('Recovery target changed during recovery; restart with the canonical user ID.');
          }
          const freshPrincipal = rawFreshPrincipal;
          if (String(freshPrincipal.id) !== principalId) {
            throw new Error('Recovery target changed during recovery; restart with the canonical user ID.');
          }
          const inTxRejection = canonicalActiveUserRejection(freshPrincipal);
          if (inTxRejection === 'alias') {
            throw new Error('Recovery target is a linked alias; recover the canonical primary account instead.');
          }
          if (inTxRejection === 'disabled') {
            throw new Error('Recovery target is disabled; enable the account before recovery.');
          }

          const existing = asAssignmentRecord(
            await RoleAssignment.findOne({
              principalType: 'user',
              principalId,
              role: role.id,
              source: 'recovery',
              sourceKey: BOOTSTRAP_SOURCE_KEY,
            }).usingConnection(connection),
            'Recovery assignment reread'
          );

          // Active means authoritatively active with exact brandless system
          // identity: unexpired, source-present, brandless, versioned, and
          // matching the expected principal/role/source tuple.
          if (
            existing !== undefined &&
            protectedSystemAssignmentBootstrapIssue(existing, new Date(), {
              principalId,
              roleId: String(role.id),
            }) === undefined
          ) {
            await sails.services.authorizationauditservice.createSucceededEvent(
              {
                eventType: 'assignment.noop',
                actorType: 'operator',
                actorId: operator,
                authMethod: 'operator',
                targetType: 'role-assignment',
                targetId: String(existing.id),
                reason,
                reasonCode: 'system-admin-recovery',
                after: { source: 'recovery', sourceKey: BOOTSTRAP_SOURCE_KEY, role: role.id, state: 'active' },
              },
              connection
            );
            // Commit-guarding fence: the active-noop audit above must not
            // commit past a lease lost while it was being recorded.
            await fenceLeaseInMutationSession(recoveryFence, connection, 'system-admin recovery (pre-commit)');
            authorizationBootstrapRecoveryOutcomes.add(1, { outcome: 'active' });
            return Object.freeze({
              principalId,
              roleId: role.id,
              assignmentCreated: false,
              assignmentReactivated: false,
              assignmentState: 'active' as const,
            });
          }

          if (existing === undefined) {
            // Creation plus its success audit commit in this transaction. A
            // duplicate-key failure aborts this transaction, so the winner
            // reread/audit below runs outside (in fresh transactions), never
            // inside the aborted session.
            const created = asAssignmentRecord(
              await sails.services.authorizationpersistenceservice.createRoleAssignment(
                {
                  principalType: 'user',
                  principalId,
                  role: role.id,
                  source: 'recovery',
                  sourceKey: BOOTSTRAP_SOURCE_KEY,
                  status: 'active',
                  sourcePresent: true,
                  assignedBy: operator,
                  assignedAt: new Date(),
                  reason,
                  version: 1,
                },
                connection
              ),
              'Recovery assignment creation'
            );
            if (created === undefined) {
              throw new Error('Recovery assignment creation returned no row; failing closed.');
            }
            await sails.services.authorizationauditservice.createSucceededEvent(
              {
                eventType: 'assignment.created',
                actorType: 'operator',
                actorId: operator,
                authMethod: 'operator',
                targetType: 'role-assignment',
                targetId: String(created.id),
                reason,
                after: { source: 'recovery', sourceKey: BOOTSTRAP_SOURCE_KEY, role: role.id },
              },
              connection
            );
            // Commit-guarding fence: the create+audit above must not commit
            // past a lease lost while they were being recorded.
            await fenceLeaseInMutationSession(recoveryFence, connection, 'system-admin recovery (pre-commit)');
            authorizationBootstrapRecoveryOutcomes.add(1, { outcome: 'created' });
            return Object.freeze({
              principalId,
              roleId: role.id,
              assignmentCreated: true,
              assignmentReactivated: false,
              assignmentState: 'created' as const,
            });
          }

          // Operator-only repair of the exact unique tuple: a revoked,
          // suppressed, expired, or source-absent row is reactivated
          // transactionally with CAS, the operator reason, and an audit event.
          // The CAS predicate pins the read version so a concurrent
          // administrative change fails closed instead of being clobbered.
          const repaired = asAssignmentRecord(
            await RoleAssignment.updateOne(repairCriteria(existing))
              .set({
                status: 'active',
                sourcePresent: true,
                assignedBy: operator,
                assignedAt: new Date(),
                expiresAt: null,
                revokedBy: null,
                revokedAt: null,
                suppressedBy: null,
                suppressedAt: null,
                reason,
                version:
                  Number.isInteger(existing.version) && Number(existing.version) >= 1
                    ? Number(existing.version) + 1
                    : 1,
              })
              .usingConnection(connection),
            'Recovery assignment repair'
          );
          if (repaired == null) {
            throw new Error('The recovery assignment changed concurrently; restart recovery to revalidate the target.');
          }
          await sails.services.authorizationauditservice.createSucceededEvent(
            {
              eventType: 'assignment.reactivated',
              actorType: 'operator',
              actorId: operator,
              authMethod: 'operator',
              targetType: 'role-assignment',
              targetId: String(existing.id),
              reason,
              reasonCode: 'system-admin-recovery',
              before: { status: existing.status, sourcePresent: existing.sourcePresent },
              after: { source: 'recovery', sourceKey: BOOTSTRAP_SOURCE_KEY, role: role.id, state: 'active' },
            },
            connection
          );
          // Commit-guarding fence: the repair+audit above must not commit past
          // a lease lost while they were being recorded.
          await fenceLeaseInMutationSession(recoveryFence, connection, 'system-admin recovery (pre-commit)');
          authorizationBootstrapRecoveryOutcomes.add(1, { outcome: 'reactivated' });
          return Object.freeze({
            principalId,
            roleId: role.id,
            assignmentCreated: false,
            assignmentReactivated: true,
            assignmentState: 'reactivated' as const,
          });
        });
      } catch (error) {
        // A concurrent operator may win the exact-tuple creation race: the
        // failed creation transaction is aborted/ended, so reread the winner,
        // validate it exactly, and record the adopt-noop audit in ONE fresh
        // required transaction outside it — never inside the aborted session
        // and never as an outside-transaction audit. All other in-transaction
        // failures roll back and are audited as failed.
        if (isUniqueConstraintError(error)) {
          const adopted = await runWithRequiredTransaction(RoleAssignment.getDatastore(), async freshConnection => {
            // The lease propagates into the conflict retry so a winner adopted
            // past a lost lease still fails closed.
            await fenceLeaseInMutationSession(recoveryFence, freshConnection, 'system-admin recovery (conflict retry)');
            const winner = asAssignmentRecord(
              await RoleAssignment.findOne({
                principalType: 'user',
                principalId,
                role: role.id,
                source: 'recovery',
                sourceKey: BOOTSTRAP_SOURCE_KEY,
              }).usingConnection(freshConnection),
              'Recovery conflict winner reread'
            );
            if (
              winner == null ||
              String(winner.principalId) !== principalId ||
              String(associationIdentity(winner.role)) !== String(role.id) ||
              protectedSystemAssignmentBootstrapIssue(winner, new Date(), {
                principalId,
                roleId: String(role.id),
              }) !== undefined
            ) {
              return undefined;
            }
            await sails.services.authorizationauditservice.createSucceededEvent(
              {
                eventType: 'assignment.noop',
                actorType: 'operator',
                actorId: operator,
                authMethod: 'operator',
                targetType: 'role-assignment',
                targetId: String(winner.id),
                reason,
                reasonCode: 'system-admin-recovery',
                after: {
                  source: 'recovery',
                  sourceKey: BOOTSTRAP_SOURCE_KEY,
                  role: role.id,
                  state: 'active-adopted',
                },
              },
              freshConnection
            );
            // Commit-guarding fence for the conflict retry: the adopted-noop
            // audit above must not commit past a lost lease.
            await fenceLeaseInMutationSession(
              recoveryFence,
              freshConnection,
              'system-admin recovery (conflict retry pre-commit)'
            );
            return winner;
          });
          if (adopted !== undefined) {
            authorizationBootstrapRecoveryOutcomes.add(1, { outcome: 'active' });
            return Object.freeze({
              principalId,
              roleId: role.id,
              assignmentCreated: false,
              assignmentReactivated: false,
              assignmentState: 'active' as const,
            });
          }
        }
        authorizationBootstrapRecoveryOutcomes.add(1, { outcome: 'failed' });
        await auditRecoveryAttempt(
          'failed',
          'recovery.transaction-failed',
          error instanceof Error ? error.message : String(error),
          {
            operator,
            reason,
            target,
            principalId,
          }
        );
        throw error;
      }
    }
  }
}

declare global {
  let AuthorizationBootstrapService: Services.AuthorizationBootstrapService;
}
