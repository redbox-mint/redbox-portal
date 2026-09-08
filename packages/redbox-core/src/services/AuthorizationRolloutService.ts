import { AuthorizationCollectionHealth } from '../authorization/collection-health';
import { authorizationTelemetry, authorizationLabels, observeAuthorization } from '../authorization/observability';
import { validateRemediationEvidence, remediationEvidenceFingerprint } from '../authorization/shadow-remediation';
import { Services as services } from '../CoreService';
import {
  AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS,
  AUTHORIZATION_MISMATCH_CLASSIFICATIONS,
  AUTHORIZATION_MISMATCH_DEFECT_CLASSIFICATIONS,
  isApprovedMismatchClassification,
  unresolvedShadowMismatchFilter,
  isMismatchClassification,
  ROLLOUT_MODES,
  assertAuthorizationFreeTextSafe,
  createRouteId,
  createShadowFingerprint,
  normalizeRouteAuthorization,
  sanitizeAuthorizationText,
  validateRouteAuthorizations,
  type AuthorizationAuditOutcome,
  type AuthorizationContext,
  type AuthorizationDecision,
  type AuthorizationMismatchClassification,
  type RolloutMode,
  type RouteAuthorization,
  type ScopeRegistry,
} from '../authorization';

export { AUTHORIZATION_MISMATCH_CLASSIFICATIONS, type AuthorizationMismatchClassification };
import { getMergedApiRoutes, isRecord, normalizeMethod } from '../api-routes';
import { runWithRequiredTransaction } from '../utilities/RequiredTransactionUtils';
import type { AuthorizationAuditEventInput } from './AuthorizationAuditService';

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
  /**
   * Bounded triage classification for the acknowledgement. Required: the
   * free-text reason explains the decision, the classification places it in
   * the fixed vocabulary consumed by readiness summaries and audit grouping.
   */
  readonly classification?: unknown;
}

export interface AuthorizationMismatchRemediationInput {
  readonly remediatedBy?: unknown;
  readonly reason?: unknown;
  readonly evidence?: unknown;
}

export interface AuthorizationMismatchRetentionInput {
  readonly olderThanDays?: unknown;
  readonly limit?: unknown;
  readonly retainedBy?: unknown;
  readonly reason?: unknown;
}

export interface AuthorizationShadowMismatchListInput {
  readonly limit?: unknown;
  readonly cursor?: unknown;
}

export interface AuthorizationShadowMismatchListItem {
  readonly fingerprint: string;
  readonly routeId: string;
  readonly brandId?: string;
  readonly legacyOutcome: 'allow' | 'deny';
  readonly scopeOutcome: 'allow' | 'deny';
  readonly reasonCode: AuthorizationDecision['reasonCode'];
  readonly principalCategory: AuthorizationContext['principal']['category'];
  readonly count: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly sampleRequestId?: string;
}

export interface AuthorizationShadowMismatchListResult {
  readonly items: readonly AuthorizationShadowMismatchListItem[];
  readonly nextCursor?: string;
  readonly truncated: boolean;
}

export interface AuthorizationRolloutDependencies {
  readonly getBuildVersion: () => string | undefined;
  readonly getMode: () => RolloutMode;
  readonly collectLegacyEvidenceInEnforce: () => boolean;
  readonly getRegistry: () => ScopeRegistry;
  readonly authorizeScope: (
    context: AuthorizationContext,
    authorization: Extract<RouteAuthorization, { kind: 'scope' }>
  ) => AuthorizationDecision;
  readonly evaluateLegacy: (req: Sails.Req, context: AuthorizationContext) => boolean;
  readonly persistMismatch: (input: AuthorizationShadowMismatchInput) => Promise<void>;
  /**
   * Append-only operator audit writer. Backed by the existing
   * AuthorizationAuditService succeeded-event mechanism
   * (actorType=operator, authMethod=operator); acknowledgement and retention
   * summaries must flow through here so operator evidence is never silent.
   */
  readonly appendAuditEvent: (
    input: AuthorizationAuditEventInput,
    outcome: AuthorizationAuditOutcome,
    connection?: Sails.Connection
  ) => Promise<void>;
  /**
   * Transaction runner coupling the native mismatch mutation with the
   * append-only audit insert. Production uses the required-transaction
   * mechanism (session-bound native collection plus audit insert in ONE
   * transaction); an audit failure aborts the mutation so mismatch state is
   * unchanged.
   */
  readonly runAtomic: <T>(work: (connection: Sails.Connection) => Promise<T>) => Promise<T>;
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

function credentialCeilingDecision(
  context: AuthorizationContext,
  authorization: RouteAuthorization | undefined
): AuthorizationDecision | undefined {
  // A credential ceiling restricts legacy path grants too, even when another
  // scope-engine denial (such as a missing role grant) masks the ceiling denial.
  if (
    authorization?.kind === 'scope' &&
    context.tokenScopeCeiling !== undefined &&
    !context.tokenScopeCeiling.includes(authorization.scope)
  ) {
    return Object.freeze({
      allowed: false,
      reasonCode: 'token-scope-ceiling',
      requiredScope: authorization.scope,
      brandId: context.brand?.id,
    });
  }
  return undefined;
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
    // A recurring fingerprint is automatically reopened. Clear every stale
    // resolution field so old approval evidence cannot survive new evidence.
    $unset: {
      resolvedAt: '',
      resolvedBy: '',
      resolutionReason: '',
      resolutionClassification: '',
      remediationStatus: '',
      remediationEvidenceFingerprint: '',
      remediationVerifiedAt: '',
    },
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

/**
 * Canonical operator free-text validation shared by acknowledgement and
 * retention. Canonicalizes/sanitizes ONCE before any native mutation using
 * the existing persistence-validation helpers, rejects control characters
 * and credential-like text, and returns the single canonical value that must
 * flow to both the aggregate row and the append-only audit event.
 */
function canonicalOperatorIdentity(value: unknown, operation: string): string {
  if (
    typeof value === 'string' &&
    Array.from(value).some(character => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })
  ) {
    throw new Error(`${operation} operator identity must not contain control characters.`);
  }
  const sanitized = sanitizeAuthorizationText(value, 128);
  if (sanitized === undefined) {
    throw new Error(`${operation} requires a bounded operator identity.`);
  }
  assertAuthorizationFreeTextSafe(sanitized, 'operatorIdentity');
  return sanitized;
}

// Retention age is a documented bounded safe integer: 1-36500 days (~100
// years). The upper bound keeps the derived cutoff inside the valid Date
// range and rejects unsafe/overflow dates; fractional, scientific-notation,
// Infinity, and non-digit string forms are never accepted.
const RETENTION_DAYS_MIN = 1;
const RETENTION_DAYS_MAX = 36_500;
const INTEGER_TEXT_PATTERN = /^\d+$/;

function parseRetentionOlderThanDays(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < RETENTION_DAYS_MIN || value > RETENTION_DAYS_MAX) {
      throw new Error(
        `Retention requires olderThanDays as a bounded safe integer between ${RETENTION_DAYS_MIN} and ${RETENTION_DAYS_MAX}.`
      );
    }
    return value;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!INTEGER_TEXT_PATTERN.test(text)) {
      throw new Error(
        `Retention requires olderThanDays as a bounded safe integer between ${RETENTION_DAYS_MIN} and ${RETENTION_DAYS_MAX}.`
      );
    }
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < RETENTION_DAYS_MIN || parsed > RETENTION_DAYS_MAX) {
      throw new Error(
        `Retention requires olderThanDays as a bounded safe integer between ${RETENTION_DAYS_MIN} and ${RETENTION_DAYS_MAX}.`
      );
    }
    return parsed;
  }
  throw new Error(
    `Retention requires olderThanDays as a bounded safe integer between ${RETENTION_DAYS_MIN} and ${RETENTION_DAYS_MAX}.`
  );
}

function parseRetentionListLimit(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
      throw new Error('Retention requires a bounded per-invocation limit of at most 10,000.');
    }
    return value;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!INTEGER_TEXT_PATTERN.test(text)) {
      throw new Error('Retention requires a bounded per-invocation limit of at most 10,000.');
    }
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) {
      throw new Error('Retention requires a bounded per-invocation limit of at most 10,000.');
    }
    return parsed;
  }
  throw new Error('Retention requires a bounded per-invocation limit of at most 10,000.');
}

function canonicalOperatorReason(value: unknown, operation: string): string {
  if (
    typeof value === 'string' &&
    Array.from(value).some(character => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })
  ) {
    throw new Error(`${operation} operator reason must not contain control characters.`);
  }
  const sanitized = sanitizeAuthorizationText(value, 1_000);
  if (sanitized === undefined) {
    throw new Error(`${operation} requires a bounded operator reason.`);
  }
  assertAuthorizationFreeTextSafe(sanitized, 'reason');
  return sanitized;
}

/**
 * Parses the bounded acknowledgement classification. Only the exact enum
 * values are accepted; free-text triage labels are rejected so readiness
 * summaries and audit consumers can group on a closed vocabulary.
 */
function parseMismatchClassification(value: unknown): AuthorizationMismatchClassification {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (isMismatchClassification(normalized)) {
    return normalized;
  }
  throw new Error(
    `Acknowledgement requires a bounded mismatch classification: ${AUTHORIZATION_MISMATCH_CLASSIFICATIONS.join(', ')}.`
  );
}

interface TransactionCollectionProvider {
  readonly collection: (name: string, options?: unknown) => unknown;
}

function isTransactionCollectionProvider(value: unknown): value is TransactionCollectionProvider {
  return isRecord(value) && typeof value.collection === 'function';
}

function transactionBoundCollection(connection: Sails.Connection, tableName: string): unknown {
  if (!isTransactionCollectionProvider(connection)) {
    throw new Error(
      'Authorization shadow mismatch mutation requires a transaction-bound connection exposing collection().'
    );
  }
  return connection.collection(tableName);
}

function asMismatchCollection(
  raw: unknown,
  operation: 'list' | 'acknowledge' | 'retention'
): {
  updateOne(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  find(filter: unknown, options?: unknown): { limit(limit: number): { toArray(): Promise<unknown[]> } };
  deleteMany(filter: unknown): Promise<{ deletedCount?: number }>;
} {
  if (!isRecord(raw)) {
    throw new Error('Authorization shadow mismatch collection does not support atomic updates.');
  }
  const collection = raw as {
    updateOne?: (filter: unknown, update: unknown, options?: unknown) => Promise<unknown>;
    find?: (filter: unknown, options?: unknown) => { limit(limit: number): { toArray(): Promise<unknown[]> } };
    deleteMany?: (filter: unknown) => Promise<{ deletedCount?: number }>;
  };
  const missingRequiredMethod =
    typeof collection.find !== 'function' ||
    (operation === 'acknowledge' && typeof collection.updateOne !== 'function') ||
    (operation === 'retention' && typeof collection.deleteMany !== 'function');
  if (missingRequiredMethod) {
    throw new Error('Authorization shadow mismatch collection does not support acknowledgement or retention.');
  }
  return {
    updateOne: (filter, update, options) => collection.updateOne!(filter, update, options),
    find: (filter, options) => collection.find!(filter, options),
    deleteMany: filter => collection.deleteMany!(filter),
  };
}

function mismatchCollection(
  connection?: Sails.Connection,
  operation: 'list' | 'acknowledge' | 'retention' = 'list'
): {
  updateOne(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  find(filter: unknown, options?: unknown): { limit(limit: number): { toArray(): Promise<unknown[]> } };
  deleteMany(filter: unknown): Promise<{ deletedCount?: number }>;
} {
  // Fail closed on the transaction path: acknowledge/retention mutations must
  // run on the session-bound native collection obtained from the transaction
  // connection (see sessionBoundConnection in RequiredTransactionUtils). Falling
  // back to getDatastore().manager here would mutate outside the transaction
  // while the audit insert uses the transaction connection, so a missing
  // collection() capability is a hard error, never a fallback.
  if (operation === 'acknowledge' || operation === 'retention') {
    if (connection === undefined || connection === null) {
      throw new Error(
        'Authorization shadow mismatch mutation requires a transaction-bound connection exposing collection().'
      );
    }
    return asMismatchCollection(
      transactionBoundCollection(connection, AuthorizationShadowMismatch.tableName),
      operation
    );
  }
  if (connection === undefined || connection === null) {
    return asMismatchCollection(
      AuthorizationShadowMismatch.getDatastore().manager.collection(AuthorizationShadowMismatch.tableName),
      operation
    );
  }
  return asMismatchCollection(transactionBoundCollection(connection, AuthorizationShadowMismatch.tableName), operation);
}

function isAuditService(value: unknown): value is {
  createSucceededEvent(input: AuthorizationAuditEventInput, connection: Sails.Connection): Promise<unknown>;
} {
  return isRecord(value) && typeof value.createSucceededEvent === 'function';
}

function defaultAppendAuditEvent(
  input: AuthorizationAuditEventInput,
  outcome: AuthorizationAuditOutcome,
  connection?: Sails.Connection
): Promise<void> {
  if (outcome !== 'succeeded') {
    throw new Error('Shadow mismatch operator audit only records succeeded outcomes.');
  }
  const auditService = runtimeService('authorizationauditservice', isAuditService);
  if (connection !== undefined) {
    return auditService.createSucceededEvent(input, connection).then(() => undefined);
  }
  return runWithRequiredTransaction(AuthorizationAudit.getDatastore(), nested =>
    auditService.createSucceededEvent(input, nested).then(() => undefined)
  );
}

function defaultDependencies(): AuthorizationRolloutDependencies {
  return {
    getMode: () => sails.config.authorization.mode,
    getBuildVersion: () =>
      [process.env.REDBOX_BUILD_VERSION, process.env.BUILD_VERSION, process.env.APP_VERSION]
        .find(value => value?.trim())
        ?.trim(),
    collectLegacyEvidenceInEnforce: () => sails.config.authorization.collectLegacyEvidenceInEnforce,
    getRegistry: () => runtimeService('authorizationscopeservice', isScopeRegistryService).getRegistry(),
    authorizeScope: (context, authorization) =>
      runtimeService('authorizationservice', isScopeAuthorizationService).authorizeAction(context, authorization.scope),
    evaluateLegacy: defaultLegacyEvaluation,
    persistMismatch: input => persistShadowMismatch(input, new Date()),
    appendAuditEvent: (input, outcome, connection) => defaultAppendAuditEvent(input, outcome, connection),
    runAtomic: work => runWithRequiredTransaction(AuthorizationShadowMismatch.getDatastore(), work),
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
    protected override _exportedMethods: string[] = [
      'evaluateRequest',
      'recordShadowMismatch',
      'getCollectionHealth',
      'validateRouteConfiguration',
      'listUnresolvedShadowMismatches',
      'acknowledgeShadowMismatch',
      'closeRemediatedShadowMismatch',
      'retainResolvedShadowMismatches',
    ];

    private readonly dependencies: AuthorizationRolloutDependencies;
    private readonly collectionHealth: AuthorizationCollectionHealth;

    public constructor(
      dependencies: Partial<AuthorizationRolloutDependencies> = {},
      collectionHealth = new AuthorizationCollectionHealth()
    ) {
      super();
      this.dependencies = { ...defaultDependencies(), ...dependencies };
      this.collectionHealth = collectionHealth;
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

    public getCollectionHealth() {
      return Object.freeze({
        ...this.collectionHealth.snapshot(),
        telemetryFailures: authorizationTelemetry.failures,
        telemetryRejections: authorizationTelemetry.rejected,
      });
    }

    /** Shared non-blocking evidence boundary for request and navigation comparisons. */
    public recordShadowMismatch(input: AuthorizationShadowMismatchInput): void {
      const completed = (success: boolean) =>
        observeAuthorization(() => {
          const transition = this.collectionHealth.observe(success);
          authorizationTelemetry.emit('shadow_collection', 1, {
            mode: this.dependencies.getMode(),
            outcome: success ? 'success' : 'error',
          });
          if (transition) {
            authorizationTelemetry.emit('collection_transitions', 1, { source: 'collection', outcome: transition });
            // No route, request, exception or credential data. Log each fail/recover/fail transition.
            if (transition === 'failed')
              this.logger.error('Authorization shadow mismatch persistence failed.', {
                errorCode: 'persistence-failed',
              });
            else this.logger.info('Authorization shadow mismatch persistence recovered.');
          }
        });
      // Includes synchronous adapter throws; persistence remains independent of the decision.
      try {
        void Promise.resolve(this.dependencies.persistMismatch(input)).then(
          () => completed(true),
          () => completed(false)
        );
      } catch {
        completed(false);
      }
    }

    /**
     * Operator listing of unresolved or unapproved shadow mismatches with bounded
     * fingerprint-ordered pagination. Read-only operational evidence: the
     * output carries only bounded aggregate fields (never actor, resource, or
     * credential data) and never writes to the append-only authorization audit.
     */
    public async listUnresolvedShadowMismatches(
      input: AuthorizationShadowMismatchListInput = {}
    ): Promise<AuthorizationShadowMismatchListResult> {
      const limit = Number(input.limit ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new Error('Listing requires a bounded per-invocation limit between 1 and 200.');
      }
      const rawCursor = typeof input.cursor === 'string' ? input.cursor.trim() : '';
      const cursor = rawCursor.length === 0 ? undefined : rawCursor;
      if (cursor !== undefined && !/^[a-f0-9]{64}$/u.test(cursor)) {
        throw new Error('Listing cursor must be an exact 64-character mismatch fingerprint.');
      }
      const collection = mismatchCollection(undefined, 'list');
      const filter = {
        ...unresolvedShadowMismatchFilter(),
        ...(cursor === undefined ? {} : { fingerprint: { $gt: cursor } }),
      };
      const rows = (await collection
        .find(filter, {
          projection: {
            _id: 0,
            fingerprint: 1,
            routeId: 1,
            brandId: 1,
            legacyOutcome: 1,
            scopeOutcome: 1,
            reasonCode: 1,
            principalCategory: 1,
            count: 1,
            firstSeenAt: 1,
            lastSeenAt: 1,
            sampleRequestId: 1,
          },
          sort: { fingerprint: 1 },
        })
        .limit(limit + 1)
        .toArray()) as Array<Record<string, unknown>>;
      const page = rows.slice(0, limit);
      const items = page.map(row =>
        Object.freeze({
          fingerprint: String(row.fingerprint ?? ''),
          routeId: String(row.routeId ?? '').slice(0, 256),
          ...(typeof row.brandId === 'string' && row.brandId.length > 0 ? { brandId: row.brandId.slice(0, 128) } : {}),
          legacyOutcome: row.legacyOutcome === 'allow' ? ('allow' as const) : ('deny' as const),
          scopeOutcome: row.scopeOutcome === 'allow' ? ('allow' as const) : ('deny' as const),
          reasonCode: row.reasonCode as AuthorizationShadowMismatchListItem['reasonCode'],
          principalCategory: row.principalCategory as AuthorizationShadowMismatchListItem['principalCategory'],
          count: Number.isSafeInteger(row.count) ? Number(row.count) : 1,
          firstSeenAt: String(row.firstSeenAt ?? ''),
          lastSeenAt: String(row.lastSeenAt ?? ''),
          ...(typeof row.sampleRequestId === 'string' && row.sampleRequestId.length > 0
            ? { sampleRequestId: row.sampleRequestId.slice(0, 128) }
            : {}),
        })
      );
      const truncated = rows.length > limit;
      const nextCursor = truncated && items.length > 0 ? items[items.length - 1].fingerprint : undefined;
      return Object.freeze({
        items: Object.freeze(items),
        ...(nextCursor === undefined ? {} : { nextCursor }),
        truncated,
      });
    }

    /**
     * Operator acknowledgement of one unresolved or unapproved shadow mismatch. The bounded
     * operator identity, reason, and typed classification are canonicalized
     * once before any mutation and stored durably on the aggregate row, and a
     * typed `shadow.mismatch-acknowledged` event carrying the SAME canonical
     * values is appended to the append-only authorization audit
     * (actorType=operator, authMethod=operator, succeeded outcome). The row
     * mutation and the audit insert run in ONE required transaction: an audit
     * failure aborts the acknowledgement so mismatch state is unchanged.
     * Defects/investigation retain a null resolvedAt and continue to block
     * readiness; only an approved classification resolves the aggregate. Append-only
     * audit evidence is never deleted or edited.
     * Historical unapproved rows can be re-triaged even with a resolution timestamp;
     * existing approved resolutions remain unchanged until a new observation reopens them.
     */
    public async acknowledgeShadowMismatch(
      input: AuthorizationMismatchAcknowledgementInput
    ): Promise<{ fingerprint: string; resolvedAt: string | null }> {
      const fingerprint = typeof input.fingerprint === 'string' ? input.fingerprint.trim() : '';
      if (!/^[a-f0-9]{64}$/u.test(fingerprint)) {
        throw new Error('Acknowledgement requires the exact 64-character mismatch fingerprint.');
      }
      // Canonicalize BEFORE any native write: the same values below flow to
      // both the aggregate row and the audit event.
      const acknowledgedBy = canonicalOperatorIdentity(input.acknowledgedBy, 'Acknowledgement');
      const reason = canonicalOperatorReason(input.reason, 'Acknowledgement');
      const classification = parseMismatchClassification(input.classification);
      return this.dependencies.runAtomic(async connection => {
        const collection = mismatchCollection(connection, 'acknowledge');
        // Triage is not approval: investigation and defect classifications
        // stay open even when an operator has acknowledged them.
        const resolvedAt = isApprovedMismatchClassification(classification) ? new Date().toISOString() : null;
        // The native driver resolves updateOne to an UpdateResult even when nothing
        // matches; matchedCount is the only reliable no-match signal.
        const updated = (await collection.updateOne(
          { ...unresolvedShadowMismatchFilter(), fingerprint },
          {
            $set: {
              resolvedAt,
              resolvedBy: acknowledgedBy,
              resolutionReason: reason,
              resolutionClassification: classification,
            },
          }
        )) as { matchedCount?: number } | null | undefined;
        if (updated === null || updated === undefined || Number(updated.matchedCount ?? 0) < 1) {
          throw new Error('No unresolved shadow mismatch matches that fingerprint.');
        }
        // Same-transaction audit: a failure aborts the resolve above, so the
        // mismatch stays unresolved instead of diverging from audit evidence.
        await this.dependencies.appendAuditEvent(
          {
            actorType: 'operator',
            actorId: acknowledgedBy,
            authMethod: 'operator',
            eventType: 'shadow.mismatch-acknowledged',
            targetType: 'authorization-shadow-mismatch',
            targetId: fingerprint,
            after: { fingerprint, resolvedAt, resolvedBy: acknowledgedBy, classification },
            reasonCode: 'shadow-mismatch-acknowledged',
            reason,
          },
          'succeeded',
          connection
        );
        return Object.freeze({ fingerprint, resolvedAt });
      });
    }

    /**
     * Close a repaired defect using completed verification evidence. The exact
     * observed count/time is a compare-and-swap guard: any recurrence during
     * verification invalidates closure. Triage and historical observations stay
     * intact; the complete evidence is retained in the append-only audit.
     */
    public async closeRemediatedShadowMismatch(
      input: AuthorizationMismatchRemediationInput
    ): Promise<{ fingerprint: string; remediationEvidenceFingerprint: string }> {
      const remediatedBy = canonicalOperatorIdentity(input.remediatedBy, 'Remediation');
      const reason = canonicalOperatorReason(input.reason, 'Remediation');
      const evidence = validateRemediationEvidence(input.evidence, new Date());
      if (
        this.dependencies.getBuildVersion() !== evidence.buildVersion ||
        this.dependencies.getRegistry().generation !== evidence.registryGeneration
      ) {
        throw new Error('Remediation evidence must match the running build and registry generation.');
      }
      const evidenceFingerprint = remediationEvidenceFingerprint(evidence);
      return this.dependencies.runAtomic(async connection => {
        const collection = mismatchCollection(connection, 'acknowledge');
        const rows = await collection.find({ fingerprint: evidence.fingerprint }).limit(2).toArray();
        const row = rows.length === 1 && isRecord(rows[0]) ? rows[0] : undefined;
        if (
          row === undefined ||
          !AUTHORIZATION_MISMATCH_DEFECT_CLASSIFICATIONS.some(value => value === row.resolutionClassification)
        ) {
          throw new Error('Remediation requires an existing classified defect.');
        }
        const verifiedAt = new Date().toISOString();
        const updated = await collection.updateOne(
          {
            ...unresolvedShadowMismatchFilter(),
            fingerprint: evidence.fingerprint,
            count: evidence.observedCount,
            lastSeenAt: evidence.lastSeenAt,
            resolutionClassification: row.resolutionClassification,
          },
          {
            $set: {
              remediationStatus: 'verified',
              remediationEvidenceFingerprint: evidenceFingerprint,
              remediationVerifiedAt: verifiedAt,
            },
          }
        );
        if (!isRecord(updated) || updated.matchedCount !== 1) {
          throw new Error('Remediation observation changed or defect is already closed; reverify before closure.');
        }
        await this.dependencies.appendAuditEvent(
          {
            actorType: 'operator',
            actorId: remediatedBy,
            authMethod: 'operator',
            eventType: 'shadow.mismatch-remediated',
            targetType: 'authorization-shadow-mismatch',
            targetId: evidence.fingerprint,
            before: {
              classification: row.resolutionClassification,
              count: row.count,
              lastSeenAt: row.lastSeenAt,
              resolvedAt: row.resolvedAt ?? null,
              resolvedBy: row.resolvedBy ?? null,
              resolutionReason: row.resolutionReason ?? null,
            },
            after: {
              remediationStatus: 'verified',
              remediationEvidenceFingerprint: evidenceFingerprint,
              remediationVerifiedAt: verifiedAt,
              evidence,
            },
            reasonCode: 'shadow-mismatch-remediated',
            reason,
          },
          'succeeded',
          connection
        );
        return Object.freeze({
          fingerprint: evidence.fingerprint,
          remediationEvidenceFingerprint: evidenceFingerprint,
        });
      });
    }

    /**
     * Bounded retention of approved, already-resolved aggregates. Unresolved,
     * investigation and defect evidence is never deleted, including historical
     * rows incorrectly marked resolved. Deletion is bounded per invocation. The deletion and
     * its typed `shadow.retention.completed` audit summary (actorType=operator,
     * authMethod=operator, succeeded outcome, carrying the canonical operator
     * identity, reason, and outcome) commit in ONE required transaction so an
     * audit failure leaves resolved rows undeleted. Append-only audit evidence
     * itself is never deleted.
     */
    public async retainResolvedShadowMismatches(
      input: AuthorizationMismatchRetentionInput = {}
    ): Promise<{ deleted: number; truncated: boolean }> {
      const olderThanDays = parseRetentionOlderThanDays(input.olderThanDays);
      const limit = input.limit === undefined ? 1_000 : parseRetentionListLimit(input.limit);
      // Canonicalize BEFORE any native write: the same values below flow to
      // both the deletion scope and the audit summary.
      const retainedBy = canonicalOperatorIdentity(input.retainedBy, 'Retention');
      const reason = canonicalOperatorReason(input.reason, 'Retention');
      const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
      return this.dependencies.runAtomic(async connection => {
        const collection = mismatchCollection(connection, 'retention');
        const resolvedFilter = {
          resolvedAt: { $ne: null },
          resolutionClassification: { $in: [...AUTHORIZATION_MISMATCH_APPROVED_CLASSIFICATIONS] },
          lastSeenAt: { $lt: cutoff },
        };
        // Fetch one row past the limit so truncation is observed, not assumed:
        // `stale.length === limit` alone cannot distinguish "exactly limit" from
        // "more than limit". Only the first `limit` rows are deleted.
        const stale = (await collection
          .find(resolvedFilter, { projection: { _id: 1 } })
          .limit(limit + 1)
          .toArray()) as Array<{ _id?: unknown }>;
        if (stale.length === 0) {
          await this.dependencies.appendAuditEvent(
            {
              actorType: 'operator',
              actorId: retainedBy,
              authMethod: 'operator',
              eventType: 'shadow.retention.completed',
              targetType: 'authorization-shadow-mismatch',
              after: { deleted: 0, truncated: false, olderThanDays, limit, cutoff },
              reasonCode: 'shadow-retention-completed',
              reason,
            },
            'succeeded',
            connection
          );
          return Object.freeze({ deleted: 0, truncated: false });
        }
        const truncated = stale.length > limit;
        const ids = stale
          .slice(0, limit)
          .map(row => row._id)
          .filter(id => id !== undefined);
        // The audit summary carries only the driver-confirmed deletedCount:
        // a concurrent delete racing this invocation must be reported as
        // observed, not as assumed. A missing/invalid count fails closed so
        // the audit never records a synthetic ids.length estimate.
        const deletion = (await collection.deleteMany({ ...resolvedFilter, _id: { $in: ids } })) as
          | { deletedCount?: unknown }
          | null
          | undefined;
        if (
          deletion === null ||
          deletion === undefined ||
          !Number.isSafeInteger(deletion.deletedCount) ||
          Number(deletion.deletedCount) < 0
        ) {
          throw new Error('Authorization shadow mismatch retention did not return a valid deletedCount.');
        }
        const confirmed = Number(deletion.deletedCount);
        const result = Object.freeze({ deleted: confirmed, truncated });
        // Same-transaction audit: a failure aborts the deletion above, so
        // resolved rows are never removed without audit evidence.
        await this.dependencies.appendAuditEvent(
          {
            actorType: 'operator',
            actorId: retainedBy,
            authMethod: 'operator',
            eventType: 'shadow.retention.completed',
            targetType: 'authorization-shadow-mismatch',
            after: { ...result, olderThanDays, limit, cutoff },
            reasonCode: 'shadow-retention-completed',
            reason,
          },
          'succeeded',
          connection
        );
        return result;
      });
    }

    public evaluateRequest(input: AuthorizationRolloutInput): AuthorizationRolloutResult {
      const result = this.evaluateRequestInternal(input);
      observeAuthorization(() => {
        const labels = {
          ...authorizationLabels(input.req),
          mode: result.mode,
          category: input.context.principal.category,
        };
        authorizationTelemetry.emit('decisions', 1, {
          ...labels,
          outcome: result.allowed ? 'allow' : 'deny',
          reason: result.reasonCode,
        });
      });
      return result;
    }

    private evaluateRequestInternal(input: AuthorizationRolloutInput): AuthorizationRolloutResult {
      const mode = this.dependencies.getMode();
      if (!ROLLOUT_MODES.some(candidate => candidate === mode)) {
        throw new Error(`Invalid authorization rollout mode: ${String(mode)}`);
      }

      const scopeDecision = declarationDecision(input.context, input.authorization, this.dependencies.authorizeScope);
      const securityDecision =
        secureContextDecision(input.context) ?? credentialCeilingDecision(input.context, input.authorization);
      const compareEngines =
        mode === 'shadow' || (mode === 'enforce' && this.dependencies.collectLegacyEvidenceInEnforce());
      const evaluateLegacy = mode !== 'enforce' || compareEngines;
      const legacyAllowed = evaluateLegacy ? this.dependencies.evaluateLegacy(input.req, input.context) : undefined;
      if (compareEngines && legacyAllowed !== undefined && legacyAllowed !== scopeDecision.allowed) {
        this.recordShadowMismatch({
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
