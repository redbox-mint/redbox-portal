import type { AuthorizationRollbackExposureReport } from '../authorization/rollback-exposure';
import { reportRollbackExposure } from './AuthorizationRollbackExposure';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { Services as services } from '../CoreService';
import {
  AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS,
  unresolvedShadowMismatchCriteria,
  unresolvedShadowMismatchFilter,
  AuthorizationAdministrationError,
  asScopeKey,
  isExactBrandAdminRole,
  isExactSystemAdminRole,
  validateRouteAuthorizations,
  type AuthorizationContext,
  type RolloutMode,
  type ScopeRegistry,
} from '../authorization';
import { getMergedApiRoutes } from '../api-routes';
import { AUTHORIZATION_MIGRATION_NAME, type AuthorizationDriftReport } from './AuthorizationMigrationService';
import { createSystemProcessContextInternal } from './AuthorizationActorIssuer';
import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleAssignmentAttributes } from '../waterline-models/RoleAssignment';
import type { UserAttributes } from '../waterline-models/User';
import type { RequiredTransactionCapabilityProbe } from '../utilities/RequiredTransactionUtils';
import type { AuthorizationApprovalEvidence, AuthorizationReleaseEvidence } from '../config/authorization.config';

const SYSTEM_MANAGE_SCOPE = asScopeKey('system.authorization.manage');
const MAX_READINESS_FINDINGS = 100;
const MAX_READINESS_SUBJECTS = 100;
const MAX_RUNTIME_IDENTITY_LENGTH = 128;

interface ShadowMismatchCollection {
  find(filter: unknown, options?: unknown): { limit(limit: number): { toArray(): Promise<unknown[]> } };
}

interface ShadowMismatchManager {
  collection(name: string): ShadowMismatchCollection;
}

function isShadowMismatchManager(value: unknown): value is ShadowMismatchManager {
  return typeof value === 'object' && value !== null && 'collection' in value && typeof value.collection === 'function';
}

/**
 * Runtime-derived deployment identity for the process that generated the
 * readiness report. Values are observed from the running deployment (build
 * environment variables, OS hostname), never from operator-supplied release
 * evidence. An absent value means the deployment does not expose that
 * identity signal; readiness reports it as missing rather than inferring it.
 */
export interface AuthorizationRuntimeIdentity {
  readonly buildVersion?: string;
  readonly instanceId?: string;
}

function normalizeRuntimeIdentityValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_RUNTIME_IDENTITY_LENGTH) return undefined;
  return normalized;
}

function readFirstNonEmpty(values: readonly unknown[]): string | undefined {
  for (const value of values) {
    const normalized = normalizeRuntimeIdentityValue(value);
    if (normalized !== undefined) return normalized;
  }
  return undefined;
}

/**
 * Resolves the runtime deployment identity without consulting
 * operator-supplied release evidence. Build version prefers explicit build
 * environment signals (`REDBOX_BUILD_VERSION`, `BUILD_VERSION`,
 * `APP_VERSION`); instance identity prefers `REDBOX_INSTANCE_ID`, then
 * `HOSTNAME`, then `os.hostname()`. Every fleet member reports its own
 * values, so fleet verification collects one report per instance.
 */
export function resolveAuthorizationRuntimeIdentity(
  env: NodeJS.ProcessEnv = process.env,
  hostname: () => string = () => os.hostname()
): AuthorizationRuntimeIdentity {
  const buildVersion = readFirstNonEmpty([env.REDBOX_BUILD_VERSION, env.BUILD_VERSION, env.APP_VERSION]);
  let host: string | undefined;
  try {
    host = hostname();
  } catch {
    host = undefined;
  }
  const instanceId = readFirstNonEmpty([env.REDBOX_INSTANCE_ID, env.HOSTNAME, host]);
  return Object.freeze({
    ...(buildVersion === undefined ? {} : { buildVersion }),
    ...(instanceId === undefined ? {} : { instanceId }),
  });
}

export interface AuthorizationReadinessFinding {
  readonly code: string;
  readonly count: number;
  readonly subjects?: readonly string[];
}

export interface AuthorizationReadinessReport {
  readonly generatedAt: string;
  readonly mode: RolloutMode;
  readonly readyForEnforce: boolean;
  readonly registry: Readonly<{
    generation: string;
    declaredScopeCount: number;
    persistedScopeCount: number;
    orphanedScopeCount: number;
  }>;
  readonly routes: Readonly<{
    routeCount: number;
    configuredRouteCount: number;
    valid: boolean;
  }>;
  readonly migration: Readonly<{
    name: string;
    completed: boolean;
    driftTruncated: boolean;
    blockerCount: number;
    warningCount: number;
  }>;
  readonly rollbackExposure: AuthorizationRollbackExposureReport;
  readonly transactions: RequiredTransactionCapabilityProbe;
  readonly shadow: Readonly<{
    /** Open/unapproved aggregates excluding separately verified defect closures. */
    unresolvedMismatchCount: number;
    /**
     * Bounded grouped summaries over shadow mismatch evidence. `byRoute`,
     * `byReason`, and `byBrand` group unresolved aggregates; `byClassification`
     * groups resolved aggregates and verified defect closures by their triage
     * classification (plus `unclassified` for rows resolved before typed
     * classifications existed). Observational only: grouping never gates
     * readiness, and `groupsTruncated` reports incomplete evidence from scan
     * or group limits, or a failed summary read.
     */
    byRoute: readonly AuthorizationShadowGroupCount[];
    byReason: readonly AuthorizationShadowGroupCount[];
    byBrand: readonly AuthorizationShadowGroupCount[];
    byClassification: readonly AuthorizationShadowGroupCount[];
    groupsTruncated: boolean;
  }>;
  /**
   * Runtime-derived deployment identity observed from this reporting
   * process (build environment, OS hostname). Reported alongside mode and
   * registry generation for per-instance/fleet verification; never sourced
   * from operator-supplied release evidence.
   */
  readonly deploymentIdentity: Readonly<{
    complete: boolean;
    buildVersion?: string;
    instanceId?: string;
  }>;
  readonly administrators: Readonly<{
    brandCount: number;
    brandsWithoutAdministratorCount: number;
    brandsWithoutAdministrator: readonly string[];
    systemAdministratorCount: number;
    requiredSystemAdministratorCount: 2;
  }>;
  readonly releaseGates: Readonly<{
    navigationParity: boolean;
    approvedSecurityDifferences: boolean;
    performance: boolean;
    identity: Readonly<{
      complete: boolean;
      buildVersion?: string;
      instanceId?: string;
      expectedBuildVersion?: string;
      expectedInstanceId?: string;
      match: boolean;
    }>;
    shadowWindow: boolean;
    rollback: boolean;
    approvals: Readonly<{
      product: boolean;
      security: boolean;
      operations: boolean;
      hookOwners: boolean;
      integrators: boolean;
    }>;
    durableFingerprint: boolean;
  }>;
  readonly blockers: readonly AuthorizationReadinessFinding[];
  readonly warnings: readonly AuthorizationReadinessFinding[];
}

/**
 * One bounded group within a shadow mismatch summary: a display key (route
 * identifier, reason code, brand identifier or `unbranded`, acknowledgement
 * classification or `unclassified`) and the number of aggregates it covers.
 */
export interface AuthorizationShadowGroupCount {
  readonly key: string;
  readonly count: number;
}

export interface AuthorizationShadowSummary {
  readonly byRoute: readonly AuthorizationShadowGroupCount[];
  readonly byReason: readonly AuthorizationShadowGroupCount[];
  readonly byBrand: readonly AuthorizationShadowGroupCount[];
  readonly byClassification: readonly AuthorizationShadowGroupCount[];
  readonly truncated: boolean;
}

export interface AuthorizationReadinessDependencies {
  readonly now: () => Date;
  readonly getMode: () => RolloutMode;
  readonly getRegistry: () => ScopeRegistry;
  readonly summarizeShadow: () => Promise<AuthorizationShadowSummary>;
  readonly getCollectionEvidenceGap: () => boolean;
  readonly validateRoutes: (registry: ScopeRegistry) => {
    readonly routeCount: number;
    readonly configuredRouteCount: number;
    readonly valid: boolean;
  };
  readonly reportRollbackExposure: (registry: ScopeRegistry, now: Date) => Promise<AuthorizationRollbackExposureReport>;
  readonly reportDrift: () => Promise<AuthorizationDriftReport>;
  readonly probeTransactions: () => Promise<RequiredTransactionCapabilityProbe>;
  readonly getReleaseEvidence: () => AuthorizationReleaseEvidence | undefined;
  readonly getRuntimeIdentity: () => AuthorizationRuntimeIdentity;
}

const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/u;

function validEvidence(value: AuthorizationApprovalEvidence | undefined, reportTime: number): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    value?.approved === true &&
    typeof value.fingerprint === 'string' &&
    SHA256_FINGERPRINT.test(value.fingerprint) &&
    typeof value.approvedAt === 'string' &&
    Number.isFinite(Date.parse(value.approvedAt)) &&
    Date.parse(value.approvedAt) <= reportTime
  );
}

/**
 * Canonicalizes a JSON-encodable value with recursively sorted object keys so
 * the release-evidence fingerprint is stable regardless of key insertion
 * order. `undefined` object members are dropped (matching `JSON.stringify`
 * semantics); array order is preserved because it carries meaning.
 */
function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (typeof value === 'object' && value !== null) {
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) canonical[key] = canonicalizeJsonValue(entry);
    }
    return canonical;
  }
  return value;
}

/**
 * Recomputes the durable fingerprint for a complete release-evidence bundle.
 * The fingerprint is the SHA-256 hex digest of the canonical JSON encoding of
 * the bundle EXCLUDING `durableFingerprint` itself (which would otherwise make
 * the hash self-referential). Returns `undefined` when the bundle is absent
 * or cannot be canonically encoded, so callers fail closed.
 */
export function computeAuthorizationReleaseEvidenceFingerprint(
  evidence: AuthorizationReleaseEvidence | undefined
): string | undefined {
  if (typeof evidence !== 'object' || evidence === null) return undefined;
  try {
    const { durableFingerprint: _ignored, ...bundle } = evidence;
    return createHash('sha256')
      .update(JSON.stringify(canonicalizeJsonValue(bundle)))
      .digest('hex');
  } catch {
    return undefined;
  }
}

export const MAX_SHADOW_SUMMARY_GROUPS = 20;
export const MAX_SHADOW_SUMMARY_SCAN = 1_000;

const INCOMPLETE_SHADOW_SUMMARY: AuthorizationShadowSummary = Object.freeze({
  byRoute: Object.freeze([]),
  byReason: Object.freeze([]),
  byBrand: Object.freeze([]),
  byClassification: Object.freeze([]),
  truncated: true,
});

function toGroupCounts(counts: ReadonlyMap<string, number>): {
  readonly groups: readonly AuthorizationShadowGroupCount[];
  readonly truncated: boolean;
} {
  const sorted = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  // The 20-group cap is observational but lossy: discarding any distinct
  // group must be reported so triage never mistakes a bounded summary for a
  // complete one. Output stays bounded; only the flag records the loss.
  const truncated = sorted.length > MAX_SHADOW_SUMMARY_GROUPS;
  return {
    groups: Object.freeze(sorted.slice(0, MAX_SHADOW_SUMMARY_GROUPS).map(entry => Object.freeze(entry))),
    truncated,
  };
}

function boundedGroupKey(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  return value.slice(0, maxLength);
}

/**
 * Default bounded shadow mismatch summarizer. Scans at most
 * `MAX_SHADOW_SUMMARY_SCAN + 1` unresolved rows (grouped by route, reason,
 * and brand) and the same bound of resolved rows (grouped by acknowledgement
 * classification), then keeps the top `MAX_SHADOW_SUMMARY_GROUPS` entries per
 * dimension. Observational only: a datastore failure yields an empty truncated
 * summary rather than blocking readiness, while the authoritative unresolved
 * total still comes from `AuthorizationShadowMismatch.count`.
 */
/**
 * Exported for regression coverage: the bounded production shadow
 * summarizer used by `defaultDependencies()`. Tests mock the
 * `AuthorizationShadowMismatch` datastore collection and assert the
 * 20-group cap reports truncation while keeping output bounded.
 */
export async function defaultSummarizeShadow(): Promise<AuthorizationShadowSummary> {
  try {
    const manager: unknown = AuthorizationShadowMismatch.getDatastore().manager;
    if (!isShadowMismatchManager(manager)) {
      throw new Error('Authorization shadow mismatch datastore manager is unavailable.');
    }
    const collection = manager.collection(AuthorizationShadowMismatch.tableName);
    const [unresolvedRows, resolvedRows] = await Promise.all([
      collection
        .find(unresolvedShadowMismatchFilter(), { projection: { _id: 0, routeId: 1, reasonCode: 1, brandId: 1 } })
        .limit(MAX_SHADOW_SUMMARY_SCAN + 1)
        .toArray(),
      collection
        .find(
          { $or: [{ resolvedAt: { $ne: null } }, { remediationStatus: 'verified' }] },
          { projection: { _id: 0, resolutionClassification: 1 } }
        )
        .limit(MAX_SHADOW_SUMMARY_SCAN + 1)
        .toArray(),
    ]);
    const scanTruncated =
      unresolvedRows.length > MAX_SHADOW_SUMMARY_SCAN || resolvedRows.length > MAX_SHADOW_SUMMARY_SCAN;
    const unresolved = unresolvedRows.slice(0, MAX_SHADOW_SUMMARY_SCAN);
    const resolved = resolvedRows.slice(0, MAX_SHADOW_SUMMARY_SCAN);
    const byRoute = new Map<string, number>();
    const byReason = new Map<string, number>();
    const byBrand = new Map<string, number>();
    for (const row of unresolved) {
      if (typeof row !== 'object' || row === null) continue;
      const record = row as Record<string, unknown>;
      const routeKey = boundedGroupKey(record.routeId, 'unknown-route', 256);
      const reasonKey = boundedGroupKey(record.reasonCode, 'unknown-reason', 128);
      const brandKey = boundedGroupKey(record.brandId, 'unbranded', 128);
      byRoute.set(routeKey, (byRoute.get(routeKey) ?? 0) + 1);
      byReason.set(reasonKey, (byReason.get(reasonKey) ?? 0) + 1);
      byBrand.set(brandKey, (byBrand.get(brandKey) ?? 0) + 1);
    }
    const byClassification = new Map<string, number>();
    for (const row of resolved) {
      if (typeof row !== 'object' || row === null) continue;
      const key = boundedGroupKey((row as Record<string, unknown>).resolutionClassification, 'unclassified', 64);
      byClassification.set(key, (byClassification.get(key) ?? 0) + 1);
    }
    const routeGroups = toGroupCounts(byRoute);
    const reasonGroups = toGroupCounts(byReason);
    const brandGroups = toGroupCounts(byBrand);
    const classificationGroups = toGroupCounts(byClassification);
    // Bounded output is retained (at most 20 entries per dimension), but the
    // flag must report ANY loss: a bounded-scan overflow that may hide unseen
    // groups, or the 20-group cap discarding a distinct group in any
    // dimension.
    const truncated =
      scanTruncated ||
      routeGroups.truncated ||
      reasonGroups.truncated ||
      brandGroups.truncated ||
      classificationGroups.truncated;
    return Object.freeze({
      byRoute: routeGroups.groups,
      byReason: reasonGroups.groups,
      byBrand: brandGroups.groups,
      byClassification: classificationGroups.groups,
      truncated,
    });
  } catch {
    return INCOMPLETE_SHADOW_SUMMARY;
  }
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function releaseGateState(
  evidence: AuthorizationReleaseEvidence | undefined,
  runtimeIdentity: AuthorizationRuntimeIdentity,
  reportTime: number
): AuthorizationReadinessReport['releaseGates'] {
  const performance = evidence?.performance;
  const shadow = evidence?.shadowWindow;
  const shadowStartedAt = shadow === undefined ? Number.NaN : Date.parse(shadow.startedAt);
  const shadowCompletedAt = shadow === undefined ? Number.NaN : Date.parse(shadow.completedAt);
  const shadowDurationHours = (shadowCompletedAt - shadowStartedAt) / 3_600_000;
  const approvals = evidence?.approvals;
  // Runtime identity is the observed deployment signal; operator-supplied
  // release evidence only carries optional expected values for comparison.
  // A non-empty expected value never completes the gate by itself.
  const runtimeBuildVersion = nonEmptyString(runtimeIdentity.buildVersion);
  const runtimeInstanceId = nonEmptyString(runtimeIdentity.instanceId);
  const expectedBuildVersion = nonEmptyString(evidence?.identity?.buildVersion);
  const expectedInstanceId = nonEmptyString(evidence?.identity?.instanceId);
  const match =
    (expectedBuildVersion === undefined || expectedBuildVersion === runtimeBuildVersion) &&
    (expectedInstanceId === undefined || expectedInstanceId === runtimeInstanceId);
  const identityComplete = runtimeBuildVersion !== undefined && runtimeInstanceId !== undefined && match;
  return Object.freeze({
    navigationParity: validEvidence(evidence?.navigationParity, reportTime),
    approvedSecurityDifferences: validEvidence(evidence?.approvedSecurityDifferences, reportTime),
    performance:
      performance !== undefined &&
      validEvidence(performance, reportTime) &&
      isFiniteNonNegativeNumber(performance.baselineP95Ms) &&
      isFiniteNonNegativeNumber(performance.baselineP99Ms) &&
      performance.baselineP99Ms >= performance.baselineP95Ms &&
      isFiniteNonNegativeNumber(performance.maximumOverheadP95Ms) &&
      isFiniteNonNegativeNumber(performance.maximumOverheadP99Ms) &&
      isFiniteNonNegativeNumber(performance.observedOverheadP95Ms) &&
      isFiniteNonNegativeNumber(performance.observedOverheadP99Ms) &&
      performance.observedOverheadP95Ms <= performance.maximumOverheadP95Ms &&
      performance.observedOverheadP99Ms <= performance.maximumOverheadP99Ms &&
      isFiniteNonNegativeInteger(performance.baselineQueryCount) &&
      isFiniteNonNegativeInteger(performance.maximumQueryCount) &&
      isFiniteNonNegativeInteger(performance.observedQueryCount) &&
      performance.observedQueryCount <= performance.maximumQueryCount,
    identity: Object.freeze({
      complete: identityComplete,
      ...(runtimeBuildVersion === undefined ? {} : { buildVersion: runtimeBuildVersion }),
      ...(runtimeInstanceId === undefined ? {} : { instanceId: runtimeInstanceId }),
      ...(expectedBuildVersion === undefined ? {} : { expectedBuildVersion }),
      ...(expectedInstanceId === undefined ? {} : { expectedInstanceId }),
      match,
    }),
    shadowWindow:
      shadow !== undefined &&
      validEvidence(shadow, reportTime) &&
      Number.isFinite(shadowDurationHours) &&
      shadowStartedAt < shadowCompletedAt &&
      shadowCompletedAt <= reportTime &&
      shadow.minimumHours > 0 &&
      shadowDurationHours >= shadow.minimumHours,
    rollback: validEvidence(evidence?.rollback, reportTime),
    approvals: Object.freeze({
      product: validEvidence(approvals?.product, reportTime),
      security: validEvidence(approvals?.security, reportTime),
      operations: validEvidence(approvals?.operations, reportTime),
      hookOwners: validEvidence(approvals?.hookOwners, reportTime),
      integrators: validEvidence(approvals?.integrators, reportTime),
    }),
    durableFingerprint:
      typeof evidence?.durableFingerprint === 'string' &&
      SHA256_FINGERPRINT.test(evidence.durableFingerprint) &&
      computeAuthorizationReleaseEvidenceFingerprint(evidence) === evidence.durableFingerprint,
  });
}

function associationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = value.id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return undefined;
}

function boundedSubjects(values: readonly string[]): readonly string[] | undefined {
  const subjects = [...new Set(values)].sort().slice(0, MAX_READINESS_SUBJECTS);
  return subjects.length === 0 ? undefined : Object.freeze(subjects);
}

function isCanonicalActiveUser(user: UserAttributes): boolean {
  return user.loginDisabled !== true && user.accountLinkState !== 'linked-alias' && !user.linkedPrimaryUserId?.trim();
}

function defaultDependencies(): AuthorizationReadinessDependencies {
  return {
    now: () => new Date(),
    getMode: () => sails.config.authorization.mode,
    getRegistry: () => AuthorizationScopeService.getRegistry(),
    validateRoutes: registry => {
      const routes = getMergedApiRoutes();
      validateRouteAuthorizations(routes, registry, 'merged contract API routes');
      AuthorizationRolloutService.validateRouteConfiguration();
      const configuredRouteCount = Object.keys(sails.config.routes ?? {}).length;
      return Object.freeze({ routeCount: routes.length, configuredRouteCount, valid: true });
    },
    reportRollbackExposure,
    reportDrift: () => AuthorizationMigrationService.reportDrift(MAX_READINESS_FINDINGS),
    probeTransactions: () => AuthorizationAuditService.probeTransactions(),
    getReleaseEvidence: () => sails.config.authorization.releaseEvidence,
    getRuntimeIdentity: () => resolveAuthorizationRuntimeIdentity(),
    summarizeShadow: () => defaultSummarizeShadow(),
    getCollectionEvidenceGap: () => {
      const health = AuthorizationRolloutService.getCollectionHealth();
      return health.evidenceGap !== false || health.telemetryFailures !== 0 || health.telemetryRejections !== 0;
    },
  };
}

export namespace Services {
  export class AuthorizationReadinessService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['getReport', 'getOperatorReport'];

    private readonly dependencies: AuthorizationReadinessDependencies;

    public constructor(dependencies: Partial<AuthorizationReadinessDependencies> = {}) {
      super();
      this.logHeader = 'AuthorizationReadinessService::';
      this.dependencies = { ...defaultDependencies(), ...dependencies };
    }

    private requireSystemActor(actor: AuthorizationContext): void {
      const actorId = actor.principal.userId ?? actor.principal.operationId;
      if (!actor.principal.active || actorId === undefined) {
        throw new AuthorizationAdministrationError(
          'authorization.authentication-required',
          401,
          'An active authoritative actor context is required.'
        );
      }
      if (!actor.effectiveScopeKeys.includes(SYSTEM_MANAGE_SCOPE)) {
        throw new AuthorizationAdministrationError(
          'authorization.scope-denied',
          403,
          'System authorization management authority is required.'
        );
      }
    }

    private finding(code: string, count: number, subjects: readonly string[] = []): AuthorizationReadinessFinding {
      const bounded = boundedSubjects(subjects);
      return Object.freeze({ code, count, ...(bounded === undefined ? {} : { subjects: bounded }) });
    }

    private async administratorReadiness(now: Date): Promise<AuthorizationReadinessReport['administrators']> {
      const brands = (await BrandingConfig.find({})
        .sort('id ASC')
        .limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)) as Array<{ readonly id: string }>;
      const roles = (await Role.find({
        status: 'active',
        protectedKind: ['brand-admin', 'system-admin'],
      }).limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)) as RoleAttributes[];
      const assignments = (await RoleAssignment.find({
        role: roles.map(role => role.id),
        status: 'active',
        sourcePresent: true,
        or: [{ expiresAt: null }, { expiresAt: { '>': now } }],
      }).limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)) as RoleAssignmentAttributes[];
      if (
        brands.length > AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS ||
        roles.length > AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS ||
        assignments.length > AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'Administrator readiness state exceeds the bounded scan limit.'
        );
      }
      const brandIds = brands.map(brand => String(brand.id));
      const knownBrandIds = new Set(brandIds);
      const protectedRoleIdentities = new Set<string>();
      let systemRoleCount = 0;
      for (const role of roles) {
        const roleBrandId = associationId(role.branding);
        // Shared exact validators: key/identity/display/context/brand/version
        // must all be exact; a count alone cannot prove protected identity.
        const validSystemRole = isExactSystemAdminRole(role);
        const validBrandRole =
          roleBrandId !== undefined && knownBrandIds.has(roleBrandId) && isExactBrandAdminRole(role, roleBrandId);
        if (!validSystemRole && !validBrandRole) {
          throw new Error('Administrator readiness encountered malformed protected-role ownership.');
        }
        const identity = validSystemRole ? 'system-admin' : `brand-admin:${roleBrandId}`;
        if (protectedRoleIdentities.has(identity)) {
          throw new Error('Administrator readiness encountered duplicate protected-role ownership.');
        }
        protectedRoleIdentities.add(identity);
        if (validSystemRole) systemRoleCount += 1;
      }
      if (systemRoleCount !== 1) {
        throw new Error('Administrator readiness requires exactly one protected system-administrator role.');
      }
      const principalIds = [...new Set(assignments.map(assignment => assignment.principalId))];
      const users = principalIds.length
        ? ((await User.find({ id: principalIds, loginDisabled: { '!=': true } }).limit(
            AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS
          )) as UserAttributes[])
        : [];
      const activeUsers = new Set(users.filter(isCanonicalActiveUser).map(user => String(user.id)));
      const roleById = new Map(roles.map(role => [String(role.id), role]));
      const brandAdministrators = new Map<string, Set<string>>();
      const systemAdministrators = new Set<string>();
      for (const assignment of assignments) {
        if (!activeUsers.has(assignment.principalId)) continue;
        const roleId = associationId(assignment.role);
        const role = roleId === undefined ? undefined : roleById.get(roleId);
        if (role === undefined) {
          throw new Error('Administrator readiness encountered an assignment with a missing role.');
        }
        const roleBrandId = associationId(role.branding);
        const assignmentBrandId = associationId(assignment.branding);
        if (isExactSystemAdminRole(role) && roleBrandId === undefined && assignmentBrandId === undefined) {
          systemAdministrators.add(assignment.principalId);
        } else if (
          roleBrandId !== undefined &&
          roleBrandId === assignmentBrandId &&
          isExactBrandAdminRole(role, roleBrandId)
        ) {
          const principals = brandAdministrators.get(roleBrandId) ?? new Set<string>();
          principals.add(assignment.principalId);
          brandAdministrators.set(roleBrandId, principals);
        } else {
          throw new Error('Administrator readiness encountered malformed protected-role ownership.');
        }
      }
      const brandsWithoutAdministrator = brandIds.filter(brandId => (brandAdministrators.get(brandId)?.size ?? 0) < 1);
      return Object.freeze({
        brandCount: brandIds.length,
        brandsWithoutAdministratorCount: brandsWithoutAdministrator.length,
        brandsWithoutAdministrator: Object.freeze(brandsWithoutAdministrator.slice(0, MAX_READINESS_SUBJECTS)),
        systemAdministratorCount: systemAdministrators.size,
        requiredSystemAdministratorCount: 2 as const,
      });
    }

    public async getReport(actor: AuthorizationContext): Promise<AuthorizationReadinessReport> {
      this.requireSystemActor(actor);
      const now = this.dependencies.now();
      const mode = this.dependencies.getMode();
      if (mode !== 'legacy' && mode !== 'shadow' && mode !== 'enforce') {
        throw new Error('Authorization readiness encountered an invalid rollout mode.');
      }
      const registry = this.dependencies.getRegistry();
      const blockers: AuthorizationReadinessFinding[] = [];
      const warnings: AuthorizationReadinessFinding[] = [];
      let routes: AuthorizationReadinessReport['routes'] = Object.freeze({
        routeCount: 0,
        configuredRouteCount: 0,
        valid: false,
      });
      try {
        routes = this.dependencies.validateRoutes(registry);
      } catch (_error) {
        blockers.push(this.finding('authorization-readiness.route-declarations-invalid', 1));
      }
      if (
        !routes.valid ||
        !Number.isSafeInteger(routes.routeCount) ||
        routes.routeCount < 1 ||
        !Number.isSafeInteger(routes.configuredRouteCount) ||
        routes.configuredRouteCount < routes.routeCount
      ) {
        routes = Object.freeze({
          routeCount: Number.isSafeInteger(routes.routeCount) && routes.routeCount >= 0 ? routes.routeCount : 0,
          configuredRouteCount:
            Number.isSafeInteger(routes.configuredRouteCount) && routes.configuredRouteCount >= 0
              ? routes.configuredRouteCount
              : 0,
          valid: false,
        });
        if (!blockers.some(blocker => blocker.code === 'authorization-readiness.route-declarations-invalid')) {
          blockers.push(this.finding('authorization-readiness.route-declarations-invalid', 1));
        }
      }
      const persistedScopeCount = await AuthorizationScope.count({});
      const orphanedScopeCount = await AuthorizationScope.count({ status: 'orphaned' });
      if (persistedScopeCount !== registry.all.length) {
        blockers.push(
          this.finding(
            'authorization-readiness.registry-projection-mismatch',
            Math.abs(persistedScopeCount - registry.all.length)
          )
        );
      }
      if (orphanedScopeCount > 0) {
        blockers.push(this.finding('authorization-readiness.orphaned-scopes', orphanedScopeCount));
      }
      const migration = await Migration.findOne({ name: AUTHORIZATION_MIGRATION_NAME });
      const drift = await this.dependencies.reportDrift();
      if (migration == null) blockers.push(this.finding('authorization-readiness.migration-incomplete', 1));
      if (drift.truncated) blockers.push(this.finding('authorization-readiness.drift-scan-truncated', 1));
      if (drift.summary.blocker > 0) {
        blockers.push(
          this.finding(
            'authorization-readiness.persistence-drift',
            drift.summary.blocker,
            drift.issues.filter(issue => issue.severity === 'blocker').map(issue => issue.code)
          )
        );
      }
      if (drift.summary.warning > 0) {
        warnings.push(
          this.finding(
            'authorization-readiness.persistence-warning',
            drift.summary.warning,
            drift.issues.filter(issue => issue.severity === 'warning').map(issue => issue.code)
          )
        );
      }
      // Persisted bootstrap issues: `AuthorizationBootstrapService.bootstrap`
      // stores its result (reconcile + protected invariant issues) at
      // `sails.config.authorizationReadiness`. Readiness must consume those
      // persisted issues, otherwise a bootstrap blocker would never block
      // enforce readiness.
      try {
        const sailsGlobal = (globalThis as Record<string, unknown>).sails as
          | { config?: { authorizationReadiness?: { issues?: unknown } } }
          | undefined;
        const persistedIssues = sailsGlobal?.config?.authorizationReadiness?.issues;
        if (Array.isArray(persistedIssues)) {
          const bootstrapBlockers = persistedIssues.filter(
            (issue): issue is { code: string } =>
              typeof issue === 'object' &&
              issue !== null &&
              (issue as { severity?: unknown }).severity === 'blocker' &&
              typeof (issue as { code?: unknown }).code === 'string'
          );
          if (bootstrapBlockers.length > 0) {
            blockers.push(
              this.finding(
                'authorization-readiness.bootstrap-invariants-blocked',
                bootstrapBlockers.length,
                bootstrapBlockers.map(issue => issue.code)
              )
            );
          }
          const bootstrapWarnings = persistedIssues.filter(
            (issue): issue is { code: string } =>
              typeof issue === 'object' &&
              issue !== null &&
              (issue as { severity?: unknown }).severity === 'warning' &&
              typeof (issue as { code?: unknown }).code === 'string'
          );
          if (bootstrapWarnings.length > 0) {
            warnings.push(
              this.finding(
                'authorization-readiness.bootstrap-invariants-warning',
                bootstrapWarnings.length,
                bootstrapWarnings.map(issue => issue.code)
              )
            );
          }
        }
      } catch {
        // Persisted-issue consumption is observational: a malformed persisted
        // result must not crash readiness, but drift/migration blockers above
        // still gate enforce.
      }
      let rollbackExposure: AuthorizationRollbackExposureReport;
      try {
        rollbackExposure = await this.dependencies.reportRollbackExposure(registry, now);
      } catch {
        rollbackExposure = {
          complete: false,
          incompleteReasons: ['query-failed'],
          affectedUserCount: 0,
          affectedRoleCount: 0,
          affectedCapabilityCount: 0,
          items: [],
        };
      }
      if (!rollbackExposure.complete) {
        blockers.push(
          this.finding('authorization-readiness.rollback-exposure-incomplete', 1, rollbackExposure.incompleteReasons)
        );
      }
      if (rollbackExposure.affectedUserCount > 0) {
        warnings.push(
          this.finding('authorization-readiness.rollback-custom-scope-exposure', rollbackExposure.affectedUserCount)
        );
      }
      let collectionEvidenceGap = true;
      try {
        collectionEvidenceGap = this.dependencies.getCollectionEvidenceGap() !== false;
      } catch {
        /* Missing evidence blocks readiness. */
      }
      if (collectionEvidenceGap) blockers.push(this.finding('authorization-readiness.collection-evidence-gap', 1));
      const transactionProbe = await this.dependencies.probeTransactions();
      const transactions: RequiredTransactionCapabilityProbe =
        transactionProbe.available === true
          ? Object.freeze({ available: true })
          : Object.freeze({ available: false, code: 'authorization.transaction-unavailable' });
      if (!transactions.available) blockers.push(this.finding('authorization-readiness.transactions-unavailable', 1));
      // Use Waterline criteria, including legacy approvals and an explicit
      // null branch for rows predating classification. One count avoids
      // double-counting rows or racing separate total/approved counts.
      const unresolvedMismatchCount = await AuthorizationShadowMismatch.count(unresolvedShadowMismatchCriteria());
      if (unresolvedMismatchCount > 0) {
        blockers.push(this.finding('authorization-readiness.unresolved-shadow-mismatches', unresolvedMismatchCount));
      }
      // Grouped summaries are observational evidence for triage: they never
      // gate readiness, so a summarizer failure yields an empty truncated
      // summary instead of blocking enforce.
      let shadowSummary: AuthorizationShadowSummary;
      try {
        shadowSummary = await this.dependencies.summarizeShadow();
      } catch {
        shadowSummary = INCOMPLETE_SHADOW_SUMMARY;
      }
      const administrators = await this.administratorReadiness(now);
      if (administrators.brandsWithoutAdministratorCount > 0) {
        blockers.push(
          this.finding(
            'authorization-readiness.brand-administrator-missing',
            administrators.brandsWithoutAdministratorCount,
            administrators.brandsWithoutAdministrator
          )
        );
      }
      if (administrators.systemAdministratorCount < administrators.requiredSystemAdministratorCount) {
        blockers.push(
          this.finding(
            'authorization-readiness.system-administrator-quorum-low',
            administrators.requiredSystemAdministratorCount - administrators.systemAdministratorCount
          )
        );
      }
      const runtimeIdentity = this.dependencies.getRuntimeIdentity();
      const releaseGates = releaseGateState(this.dependencies.getReleaseEvidence(), runtimeIdentity, now.getTime());
      const runtimeBuildVersion = nonEmptyString(runtimeIdentity.buildVersion);
      const runtimeInstanceId = nonEmptyString(runtimeIdentity.instanceId);
      const deploymentIdentity = Object.freeze({
        complete: runtimeBuildVersion !== undefined && runtimeInstanceId !== undefined,
        ...(runtimeBuildVersion === undefined ? {} : { buildVersion: runtimeBuildVersion }),
        ...(runtimeInstanceId === undefined ? {} : { instanceId: runtimeInstanceId }),
      });
      const releaseGateFindings: ReadonlyArray<readonly [boolean, string]> = [
        [releaseGates.navigationParity, 'authorization-readiness.navigation-parity-evidence-missing'],
        [releaseGates.approvedSecurityDifferences, 'authorization-readiness.security-differences-approval-missing'],
        [releaseGates.performance, 'authorization-readiness.performance-evidence-missing'],
        [releaseGates.identity.complete, 'authorization-readiness.deployment-identity-missing'],
        [releaseGates.shadowWindow, 'authorization-readiness.shadow-window-evidence-missing'],
        [releaseGates.rollback, 'authorization-readiness.rollback-rehearsal-evidence-missing'],
        [Object.values(releaseGates.approvals).every(Boolean), 'authorization-readiness.release-approvals-missing'],
        [releaseGates.durableFingerprint, 'authorization-readiness.durable-fingerprint-missing'],
      ];
      for (const [satisfied, code] of releaseGateFindings) {
        if (!satisfied) blockers.push(this.finding(code, 1));
      }
      return Object.freeze({
        generatedAt: now.toISOString(),
        mode,
        readyForEnforce: blockers.length === 0,
        registry: Object.freeze({
          generation: registry.generation,
          declaredScopeCount: registry.all.length,
          persistedScopeCount,
          orphanedScopeCount,
        }),
        routes,
        migration: Object.freeze({
          name: AUTHORIZATION_MIGRATION_NAME,
          completed: migration != null,
          driftTruncated: drift.truncated,
          blockerCount: drift.summary.blocker,
          warningCount: drift.summary.warning,
        }),
        transactions,
        rollbackExposure,
        shadow: Object.freeze({
          unresolvedMismatchCount,
          byRoute: shadowSummary.byRoute,
          byReason: shadowSummary.byReason,
          byBrand: shadowSummary.byBrand,
          byClassification: shadowSummary.byClassification,
          groupsTruncated: shadowSummary.truncated,
        }),
        deploymentIdentity,
        administrators,
        releaseGates,
        blockers: Object.freeze(blockers.slice(0, MAX_READINESS_FINDINGS)),
        warnings: Object.freeze(warnings.slice(0, MAX_READINESS_FINDINGS)),
      });
    }

    /**
     * Non-HTTP operator entry point for the readiness command. Builds the
     * privileged system-process context internally so callers cannot supply a
     * hand-rolled actor; mirrors the controller path through getReport.
     */
    public async getOperatorReport(): Promise<AuthorizationReadinessReport> {
      // Brand-less operator report: only `system.*` scopes survive issuance,
      // and `resolveBrand` is unreachable with an undefined brand identifier.
      const actor = await createSystemProcessContextInternal(
        { getRegistry: this.dependencies.getRegistry, resolveBrand: async () => undefined },
        'authorization-readiness',
        undefined,
        [SYSTEM_MANAGE_SCOPE]
      );
      return this.getReport(actor);
    }
  }
}

declare global {
  let AuthorizationReadinessService: Services.AuthorizationReadinessService;
}
