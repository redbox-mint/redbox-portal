import { Services as services } from '../CoreService';
import {
  ROLLOUT_MODES,
  createRouteId,
  createShadowFingerprint,
  normalizeRouteAuthorization,
  validateRouteAuthorizations,
  type AuthorizationContext,
  type AuthorizationDecision,
  type RolloutMode,
  type RouteAuthorization,
  type ScopeRegistry,
} from '../authorization';
import { getMergedApiRoutes, isRecord, normalizeMethod } from '../api-routes';

interface LegacyBrand {
  readonly id: string;
  readonly name: string;
}

interface LegacyRole {
  readonly id: string;
  readonly name?: string;
  readonly branding?: { readonly id?: string; readonly name: string };
}

interface LegacyPathRulesService {
  getRulesFromPath(path: string, brand: LegacyBrand): unknown[] | null;
  canRead(rules: unknown[], roles: LegacyRole[], brandName: string): boolean;
}

interface LegacyBrandingService {
  getBrand(identifier: string): LegacyBrand | undefined;
  getBrandById(identifier: string): LegacyBrand | undefined;
}

interface LegacyRolesService {
  getAdmin(brand: LegacyBrand): LegacyRole | undefined;
}

interface ScopeAuthorizationService {
  authorizeAction(
    context: AuthorizationContext,
    requiredScope: Extract<RouteAuthorization, { kind: 'scope' }>['scope']
  ): AuthorizationDecision;
}

export interface AuthorizationRolloutInput {
  readonly req: Sails.Req;
  readonly context: AuthorizationContext;
  readonly authorization?: RouteAuthorization;
  readonly routeId: string;
  readonly requestId: string;
}

export interface AuthorizationRolloutResult {
  readonly allowed: boolean;
  readonly reasonCode: AuthorizationDecision['reasonCode'];
  readonly mode: RolloutMode;
  readonly enforcedBy: 'legacy' | 'scope' | 'security-fix';
  readonly legacyAllowed?: boolean;
  readonly scopeDecision: AuthorizationDecision;
}

export interface AuthorizationShadowMismatchInput {
  readonly routeId: string;
  readonly brandId?: string;
  readonly principalCategory: AuthorizationContext['principal']['category'];
  readonly legacyAllowed: boolean;
  /**
   * Bounded decision view: only the allowed/reasonCode pair feeds the fingerprint
   * and persisted aggregate, so callers may pass any decision-shaped value.
   */
  readonly decision: Readonly<{ allowed: boolean; reasonCode: AuthorizationDecision['reasonCode'] }>;
  readonly requestId: string;
}

export interface AuthorizationMismatchAcknowledgementInput {
  readonly fingerprint?: unknown;
  readonly acknowledgedBy?: unknown;
  readonly reason?: unknown;
}

export interface AuthorizationMismatchRetentionInput {
  readonly olderThanDays?: unknown;
  readonly limit?: unknown;
}

export interface AuthorizationRolloutDependencies {
  readonly getMode: () => RolloutMode;
  readonly collectLegacyEvidenceInEnforce: () => boolean;
  readonly getRegistry: () => ScopeRegistry;
  readonly authorizeScope: (
    context: AuthorizationContext,
    authorization: Extract<RouteAuthorization, { kind: 'scope' }>
  ) => AuthorizationDecision;
  readonly evaluateLegacy: (req: Sails.Req, context: AuthorizationContext) => boolean;
  readonly persistMismatch: (input: AuthorizationShadowMismatchInput) => Promise<void>;
}

function runtimeService<T>(name: string, predicate: (value: unknown) => value is T): T {
  const service = sails.services[name];
  if (!predicate(service)) throw new Error(`Required service ${name} is unavailable or invalid.`);
  return service;
}

function isLegacyBrandingService(value: unknown): value is LegacyBrandingService {
  return isRecord(value) && typeof value.getBrand === 'function' && typeof value.getBrandById === 'function';
}

function isLegacyRolesService(value: unknown): value is LegacyRolesService {
  return isRecord(value) && typeof value.getAdmin === 'function';
}

function isLegacyPathRulesService(value: unknown): value is LegacyPathRulesService {
  return isRecord(value) && typeof value.getRulesFromPath === 'function' && typeof value.canRead === 'function';
}

function isScopeRegistryService(value: unknown): value is { getRegistry(): ScopeRegistry } {
  return isRecord(value) && typeof value.getRegistry === 'function';
}

function isScopeAuthorizationService(value: unknown): value is ScopeAuthorizationService {
  return isRecord(value) && typeof value.authorizeAction === 'function';
}

function secureContextDecision(context: AuthorizationContext): AuthorizationDecision | undefined {
  if (!context.principal.active) {
    return Object.freeze({ allowed: false, reasonCode: 'principal-inactive', brandId: context.brand?.id });
  }
  if (context.contextType === 'brand' && context.brand?.exists !== true) {
    return Object.freeze({
      allowed: false,
      reasonCode: 'brand-not-found',
      brandId: context.brand?.requestedIdentifier,
    });
  }
  if (context.contextType === 'brand' && context.brand?.authorized !== true) {
    return Object.freeze({ allowed: false, reasonCode: 'brand-not-authorized', brandId: context.brand?.id });
  }
  return undefined;
}

function declarationDecision(
  context: AuthorizationContext,
  authorization: RouteAuthorization | undefined,
  authorizeScope: AuthorizationRolloutDependencies['authorizeScope']
): AuthorizationDecision {
  const securityDecision = secureContextDecision(context);
  if (securityDecision !== undefined) return securityDecision;
  if (authorization === undefined) {
    return Object.freeze({ allowed: false, reasonCode: 'scope-missing', brandId: context.brand?.id });
  }
  if (authorization.kind === 'scope') return authorizeScope(context, authorization);
  return Object.freeze({ allowed: true, reasonCode: 'allowed', brandId: context.brand?.id });
}

function defaultLegacyEvaluation(req: Sails.Req, context: AuthorizationContext): boolean {
  if (secureContextDecision(context) !== undefined) return false;
  const brandIdentifier = context.brand?.id ?? context.brand?.name ?? context.brand?.requestedIdentifier;
  if (brandIdentifier === undefined) return false;
  const brandingService = runtimeService('brandingservice', isLegacyBrandingService);
  const brand = brandingService.getBrandById(brandIdentifier) ?? brandingService.getBrand(brandIdentifier);
  if (brand === undefined) return false;

  const roles: LegacyRole[] = [...context.compatibilityRoles];
  if (context.roles.some(role => role.protectedKind === 'system-admin')) {
    const admin = runtimeService('rolesservice', isLegacyRolesService).getAdmin(brand);
    if (admin !== undefined && !roles.some(role => role.id === admin.id)) roles.push(admin);
  }

  const pathRules = runtimeService('pathrulesservice', isLegacyPathRulesService);
  const rules = pathRules.getRulesFromPath(req.path, brand);
  return rules === null || pathRules.canRead(rules, roles, brand.name);
}

/**
 * Atomically upserts one bounded shadow mismatch aggregate. Shared by the route
 * rollout engine and the navigation visibility comparison; callers must never
 * include actor/resource identifiers or credentials in the route ID.
 */
export async function persistShadowMismatch(input: AuthorizationShadowMismatchInput, now: Date): Promise<void> {
  const observedAt = now.toISOString();
  const routeId = input.routeId.slice(0, 256);
  const brandId = input.brandId?.slice(0, 128);
  const sampleRequestId = input.requestId.slice(0, 128);
  const fingerprint = createShadowFingerprint({
    routeId,
    ...(brandId === undefined ? {} : { brandId }),
    principalCategory: input.principalCategory,
    legacyAllowed: input.legacyAllowed,
    decision: input.decision,
  });
  const collection = mismatchCollection();
  const update = {
    $setOnInsert: {
      fingerprint,
      routeId,
      ...(brandId === undefined ? {} : { brandId }),
      legacyOutcome: input.legacyAllowed ? 'allow' : 'deny',
      scopeOutcome: input.decision.allowed ? 'allow' : 'deny',
      reasonCode: input.decision.reasonCode,
      principalCategory: input.principalCategory,
      firstSeenAt: observedAt,
    },
    $set: { lastSeenAt: observedAt, sampleRequestId },
    $unset: { resolvedAt: '' },
    $inc: { count: 1 },
  };
  try {
    await collection.updateOne({ fingerprint }, update, { upsert: true });
  } catch (error) {
    const duplicateKey = isRecord(error) && error.code === 11000;
    if (!duplicateKey) throw error;
    // Concurrent first observations can race on the unique fingerprint. The
    // winner created the row, so the loser retries as a plain atomic increment.
    const existingRowUpdate = { $set: update.$set, $unset: update.$unset, $inc: update.$inc };
    await collection.updateOne({ fingerprint }, existingRowUpdate, { upsert: false });
  }
}

function mismatchCollection(): {
  updateOne(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  find(filter: unknown, options?: unknown): { limit(limit: number): { toArray(): Promise<unknown[]> } };
  deleteMany(filter: unknown): Promise<{ deletedCount?: number }>;
} {
  const raw: unknown = AuthorizationShadowMismatch.getDatastore().manager.collection(
    AuthorizationShadowMismatch.tableName
  );
  if (!isRecord(raw)) {
    throw new Error('Authorization shadow mismatch collection does not support atomic updates.');
  }
  const collection = raw as {
    updateOne?: (filter: unknown, update: unknown, options?: unknown) => Promise<unknown>;
    find?: (filter: unknown, options?: unknown) => { limit(limit: number): { toArray(): Promise<unknown[]> } };
    deleteMany?: (filter: unknown) => Promise<{ deletedCount?: number }>;
  };
  if (
    typeof collection.updateOne !== 'function' ||
    typeof collection.find !== 'function' ||
    typeof collection.deleteMany !== 'function'
  ) {
    throw new Error('Authorization shadow mismatch collection does not support acknowledgement or retention.');
  }
  return {
    updateOne: (filter, update, options) => collection.updateOne!(filter, update, options),
    find: (filter, options) => collection.find!(filter, options),
    deleteMany: filter => collection.deleteMany!(filter),
  };
}

function defaultDependencies(): AuthorizationRolloutDependencies {
  return {
    getMode: () => sails.config.authorization.mode,
    collectLegacyEvidenceInEnforce: () => sails.config.authorization.collectLegacyEvidenceInEnforce,
    getRegistry: () => runtimeService('authorizationscopeservice', isScopeRegistryService).getRegistry(),
    authorizeScope: (context, authorization) =>
      runtimeService('authorizationservice', isScopeAuthorizationService).authorizeAction(context, authorization.scope),
    evaluateLegacy: defaultLegacyEvaluation,
    persistMismatch: input => persistShadowMismatch(input, new Date()),
  };
}

function parsedRuntimeRoute(routePattern: string, target: unknown) {
  const separator = routePattern.indexOf(' ');
  const hasMethod = !routePattern.trim().startsWith('/') && separator > 0;
  const method = hasMethod ? normalizeMethod(routePattern.slice(0, separator)) : undefined;
  const path = hasMethod ? routePattern.slice(separator + 1) : routePattern;
  const routeTarget = isRecord(target) ? target : {};
  const controller = typeof routeTarget.controller === 'string' ? routeTarget.controller : undefined;
  const action = typeof routeTarget.action === 'string' ? routeTarget.action : undefined;
  const authorization =
    routeTarget.authorization === undefined ? undefined : normalizeRouteAuthorization(routeTarget.authorization);
  const routeId =
    typeof routeTarget.routeId === 'string'
      ? routeTarget.routeId
      : createRouteId({ method, path, controller, action, authorization });
  return { method, path, controller, action, authorization, routeId };
}

export namespace Services {
  export class AuthorizationRolloutService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['evaluateRequest', 'validateRouteConfiguration'];

    private readonly dependencies: AuthorizationRolloutDependencies;
    private shadowPersistenceFailureLogged = false;

    public constructor(dependencies: Partial<AuthorizationRolloutDependencies> = {}) {
      super();
      this.dependencies = { ...defaultDependencies(), ...dependencies };
    }

    public validateRouteConfiguration(): void {
      const mode = this.dependencies.getMode();
      if (!ROLLOUT_MODES.some(candidate => candidate === mode)) {
        throw new Error(`Invalid authorization rollout mode: ${String(mode)}`);
      }
      const registry = this.dependencies.getRegistry();
      validateRouteAuthorizations(getMergedApiRoutes(), registry, 'merged contract API routes');
      const runtimeRoutes = Object.entries(sails.config.routes).map(([pattern, target]) =>
        parsedRuntimeRoute(pattern, target)
      );
      validateRouteAuthorizations(runtimeRoutes, registry, 'merged Sails route table');
    }

    private recordMismatch(input: AuthorizationShadowMismatchInput): void {
      void this.dependencies.persistMismatch(input).catch(() => {
        if (this.shadowPersistenceFailureLogged) return;
        this.shadowPersistenceFailureLogged = true;
        this.logger.error('Authorization shadow mismatch persistence failed.', {
          routeId: input.routeId.slice(0, 256),
          errorCode: 'persistence-failed',
        });
      });
    }

    /**
     * Operator acknowledgement of one unresolved shadow mismatch. The bounded
     * operator identity and reason are stored durably on the aggregate row; this
     * is operational evidence and never enters the append-only audit.
     */
    public async acknowledgeShadowMismatch(
      input: AuthorizationMismatchAcknowledgementInput
    ): Promise<{ fingerprint: string; resolvedAt: string }> {
      const fingerprint = typeof input.fingerprint === 'string' ? input.fingerprint.trim() : '';
      if (!/^[a-f0-9]{64}$/u.test(fingerprint)) {
        throw new Error('Acknowledgement requires the exact 64-character mismatch fingerprint.');
      }
      const acknowledgedBy =
        typeof input.acknowledgedBy === 'string' && input.acknowledgedBy.trim().length > 0
          ? input.acknowledgedBy.trim().slice(0, 128)
          : '';
      if (acknowledgedBy.length === 0) {
        throw new Error('Acknowledgement requires a bounded operator identity.');
      }
      const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 1_000) : '';
      if (reason.length === 0) {
        throw new Error('Acknowledgement requires a bounded operator reason.');
      }
      const collection = mismatchCollection();
      const resolvedAt = new Date().toISOString();
      // The native driver resolves updateOne to an UpdateResult even when nothing
      // matches; matchedCount is the only reliable no-match signal.
      const updated = (await collection.updateOne(
        { fingerprint, resolvedAt: null },
        { $set: { resolvedAt, resolvedBy: acknowledgedBy, resolutionReason: reason } }
      )) as { matchedCount?: number } | null | undefined;
      if (updated === null || updated === undefined || Number(updated.matchedCount ?? 0) < 1) {
        throw new Error('No unresolved shadow mismatch matches that fingerprint.');
      }
      return Object.freeze({ fingerprint, resolvedAt });
    }

    /**
     * Bounded retention of already-resolved aggregates. Unresolved evidence is
     * never deleted and deletion is bounded per invocation.
     */
    public async retainResolvedShadowMismatches(
      input: AuthorizationMismatchRetentionInput = {}
    ): Promise<{ deleted: number; truncated: boolean }> {
      const olderThanDays = Number(input.olderThanDays);
      if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
        throw new Error('Retention requires olderThanDays of at least 1.');
      }
      const limit = Number(input.limit ?? 1_000);
      if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
        throw new Error('Retention requires a bounded per-invocation limit of at most 10,000.');
      }
      const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
      const collection = mismatchCollection();
      const stale = (await collection
        .find({ resolvedAt: { $ne: null }, lastSeenAt: { $lt: cutoff } }, { projection: { _id: 1 } })
        .limit(limit)
        .toArray()) as Array<{ _id?: unknown }>;
      if (stale.length === 0) {
        return Object.freeze({ deleted: 0, truncated: false });
      }
      const ids = stale.map(row => row._id).filter(id => id !== undefined);
      await collection.deleteMany({ _id: { $in: ids } });
      return Object.freeze({ deleted: ids.length, truncated: stale.length >= limit });
    }

    public evaluateRequest(input: AuthorizationRolloutInput): AuthorizationRolloutResult {
      const mode = this.dependencies.getMode();
      if (!ROLLOUT_MODES.some(candidate => candidate === mode)) {
        throw new Error(`Invalid authorization rollout mode: ${String(mode)}`);
      }

      const scopeDecision = declarationDecision(input.context, input.authorization, this.dependencies.authorizeScope);
      const securityDecision = secureContextDecision(input.context);
      const compareEngines =
        mode === 'shadow' || (mode === 'enforce' && this.dependencies.collectLegacyEvidenceInEnforce());
      const evaluateLegacy = mode !== 'enforce' || compareEngines;
      const legacyAllowed = evaluateLegacy ? this.dependencies.evaluateLegacy(input.req, input.context) : undefined;
      if (compareEngines && legacyAllowed !== undefined && legacyAllowed !== scopeDecision.allowed) {
        this.recordMismatch({
          routeId: input.routeId,
          ...(input.context.brand?.id === undefined ? {} : { brandId: input.context.brand.id }),
          principalCategory: input.context.principal.category,
          legacyAllowed,
          decision: scopeDecision,
          requestId: input.requestId,
        });
      }

      if (securityDecision !== undefined) {
        return Object.freeze({
          allowed: false,
          reasonCode: securityDecision.reasonCode,
          mode,
          enforcedBy: 'security-fix',
          ...(legacyAllowed === undefined ? {} : { legacyAllowed }),
          scopeDecision,
        });
      }

      if (mode === 'enforce') {
        return Object.freeze({
          allowed: scopeDecision.allowed,
          reasonCode: scopeDecision.reasonCode,
          mode,
          enforcedBy: 'scope',
          ...(legacyAllowed === undefined ? {} : { legacyAllowed }),
          scopeDecision,
        });
      }

      if (legacyAllowed === undefined) {
        throw new Error(`Legacy authorization result is unavailable in ${mode} mode.`);
      }

      return Object.freeze({
        allowed: legacyAllowed,
        reasonCode: legacyAllowed ? 'allowed' : 'legacy-path-denied',
        mode,
        enforcedBy: 'legacy',
        legacyAllowed,
        scopeDecision,
      });
    }
  }
}

declare global {
  const AuthorizationRolloutService: Services.AuthorizationRolloutService;
}
