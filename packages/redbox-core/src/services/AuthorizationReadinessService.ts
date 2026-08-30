import { Services as services } from '../CoreService';
import {
  AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS,
  AuthorizationAdministrationError,
  validateRouteAuthorizations,
  type AuthorizationContext,
  type RolloutMode,
  type ScopeKey,
  type ScopeRegistry,
} from '../authorization';
import { getMergedApiRoutes } from '../api-routes';
import { AUTHORIZATION_MIGRATION_NAME, type AuthorizationDriftReport } from './AuthorizationMigrationService';
import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleAssignmentAttributes } from '../waterline-models/RoleAssignment';
import type { UserAttributes } from '../waterline-models/User';
import type { RequiredTransactionCapabilityProbe } from '../utilities/RequiredTransactionUtils';

const SYSTEM_MANAGE_SCOPE = 'system.authorization.manage' as ScopeKey;
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
  readonly blockers: readonly AuthorizationReadinessFinding[];
  readonly warnings: readonly AuthorizationReadinessFinding[];
}

export interface AuthorizationReadinessDependencies {
  readonly now: () => Date;
  readonly getMode: () => RolloutMode;
  readonly getRegistry: () => ScopeRegistry;
  readonly validateRoutes: (registry: ScopeRegistry) => { readonly routeCount: number; readonly valid: boolean };
  readonly reportDrift: () => Promise<AuthorizationDriftReport>;
  readonly probeTransactions: () => Promise<RequiredTransactionCapabilityProbe>;
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
      return Object.freeze({ routeCount: routes.length, valid: true });
    },
    reportDrift: () => AuthorizationMigrationService.reportDrift(MAX_READINESS_FINDINGS),
    probeTransactions: () => AuthorizationAuditService.probeTransactions(),
  };
}

export namespace Services {
  export class AuthorizationReadinessService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['getReport'];

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
        const validSystemRole =
          role.protectedKind === 'system-admin' && role.contextType === 'system' && roleBrandId === undefined;
        const validBrandRole =
          role.protectedKind === 'brand-admin' &&
          role.contextType === 'brand' &&
          roleBrandId !== undefined &&
          knownBrandIds.has(roleBrandId);
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
        if (
          role.protectedKind === 'system-admin' &&
          role.contextType === 'system' &&
          roleBrandId === undefined &&
          assignmentBrandId === undefined
        ) {
          systemAdministrators.add(assignment.principalId);
        } else if (
          role.protectedKind === 'brand-admin' &&
          role.contextType === 'brand' &&
          roleBrandId !== undefined &&
          roleBrandId === assignmentBrandId
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
      let routes: AuthorizationReadinessReport['routes'] = Object.freeze({ routeCount: 0, valid: false });
      try {
        routes = this.dependencies.validateRoutes(registry);
      } catch (_error) {
        blockers.push(this.finding('authorization-readiness.route-declarations-invalid', 1));
      }
      if (!routes.valid || !Number.isSafeInteger(routes.routeCount) || routes.routeCount < 1) {
        routes = Object.freeze({
          routeCount: Number.isSafeInteger(routes.routeCount) && routes.routeCount >= 0 ? routes.routeCount : 0,
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
        blockers: Object.freeze(blockers.slice(0, MAX_READINESS_FINDINGS)),
        warnings: Object.freeze(warnings.slice(0, MAX_READINESS_FINDINGS)),
      });
    }
  }
}

declare global {
  let AuthorizationReadinessService: Services.AuthorizationReadinessService;
}
