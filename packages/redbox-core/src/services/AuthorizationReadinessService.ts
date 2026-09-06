import { Services as services } from '../CoreService';
import {
  AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS,
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
  readonly transactions: RequiredTransactionCapabilityProbe;
  readonly shadow: Readonly<{ unresolvedMismatchCount: number }>;
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
    identity: Readonly<{ complete: boolean; buildVersion?: string; instanceId?: string }>;
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

export interface AuthorizationReadinessDependencies {
  readonly now: () => Date;
  readonly getMode: () => RolloutMode;
  readonly getRegistry: () => ScopeRegistry;
  readonly validateRoutes: (registry: ScopeRegistry) => {
    readonly routeCount: number;
    readonly configuredRouteCount: number;
    readonly valid: boolean;
  };
  readonly reportDrift: () => Promise<AuthorizationDriftReport>;
  readonly probeTransactions: () => Promise<RequiredTransactionCapabilityProbe>;
  readonly getReleaseEvidence: () => AuthorizationReleaseEvidence | undefined;
}

const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/u;

function validEvidence(value: AuthorizationApprovalEvidence | undefined): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    value?.approved === true &&
    typeof value.fingerprint === 'string' &&
    SHA256_FINGERPRINT.test(value.fingerprint) &&
    typeof value.approvedAt === 'string' &&
    Number.isFinite(Date.parse(value.approvedAt))
  );
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
  evidence: AuthorizationReleaseEvidence | undefined
): AuthorizationReadinessReport['releaseGates'] {
  const performance = evidence?.performance;
  const shadow = evidence?.shadowWindow;
  const shadowDurationHours =
    shadow === undefined ? -1 : (Date.parse(shadow.completedAt) - Date.parse(shadow.startedAt)) / 3_600_000;
  const approvals = evidence?.approvals;
  const buildVersion = nonEmptyString(evidence?.identity?.buildVersion);
  const instanceId = nonEmptyString(evidence?.identity?.instanceId);
  return Object.freeze({
    navigationParity: validEvidence(evidence?.navigationParity),
    approvedSecurityDifferences: validEvidence(evidence?.approvedSecurityDifferences),
    performance:
      performance !== undefined &&
      validEvidence(performance) &&
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
      complete: buildVersion !== undefined && instanceId !== undefined,
      ...(buildVersion === undefined ? {} : { buildVersion }),
      ...(instanceId === undefined ? {} : { instanceId }),
    }),
    shadowWindow:
      shadow !== undefined &&
      validEvidence(shadow) &&
      Number.isFinite(shadowDurationHours) &&
      shadow.minimumHours > 0 &&
      shadowDurationHours >= shadow.minimumHours,
    rollback: validEvidence(evidence?.rollback),
    approvals: Object.freeze({
      product: validEvidence(approvals?.product),
      security: validEvidence(approvals?.security),
      operations: validEvidence(approvals?.operations),
      hookOwners: validEvidence(approvals?.hookOwners),
      integrators: validEvidence(approvals?.integrators),
    }),
    durableFingerprint: SHA256_FINGERPRINT.test(evidence?.durableFingerprint ?? ''),
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
    reportDrift: () => AuthorizationMigrationService.reportDrift(MAX_READINESS_FINDINGS),
    probeTransactions: () => AuthorizationAuditService.probeTransactions(),
    getReleaseEvidence: () => sails.config.authorization.releaseEvidence,
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
      const transactionProbe = await this.dependencies.probeTransactions();
      const transactions: RequiredTransactionCapabilityProbe =
        transactionProbe.available === true
          ? Object.freeze({ available: true })
          : Object.freeze({ available: false, code: 'authorization.transaction-unavailable' });
      if (!transactions.available) blockers.push(this.finding('authorization-readiness.transactions-unavailable', 1));
      const unresolvedMismatchCount = await AuthorizationShadowMismatch.count({ resolvedAt: null });
      if (unresolvedMismatchCount > 0) {
        blockers.push(this.finding('authorization-readiness.unresolved-shadow-mismatches', unresolvedMismatchCount));
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
      const releaseGates = releaseGateState(this.dependencies.getReleaseEvidence());
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
        shadow: Object.freeze({ unresolvedMismatchCount }),
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
