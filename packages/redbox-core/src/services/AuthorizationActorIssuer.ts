import { freezeAuthorizationContext, type AuthorizationContextInput } from '../authorization/context';
import {
  asScopeKey,
  compareScopeKeys,
  type AuthorizationContext,
  type ScopeKey,
  type ScopeRegistry,
} from '../authorization';

/**
 * AUTH-P5-001: non-forgeable server-issued provenance, owned exclusively by
 * this internal issuer module. The WeakSet below plus the issue/verify
 * capability are module-private: nothing here is reachable from the public
 * `src/authorization/index.ts` entry point.
 *
 * Deep-importing this module is the ONLY mint path for system-process and
 * resolver-issued contexts, and it is reserved for genuine server code
 * (`services/AuthorizationService` resolvers and the bounded production
 * callers that previously used the removed public factory). Request code
 * must never mint: controllers pass `req.authorization` through, and
 * writers verify actors only via the `*Internal` predicates below.
 */

export interface AuthorizationIssuerBrandRecord {
  readonly id: string | number;
  readonly name?: string;
}

export interface AuthorizationActorIssuerDependencies {
  readonly getRegistry: () => ScopeRegistry;
  readonly resolveBrand: (identifier: string) => Promise<AuthorizationIssuerBrandRecord | undefined>;
}

export type SystemProcessOperationId = string;
export type SystemProcessBrandIdentifier = string | undefined;
export type SystemProcessAllowedScopes = readonly string[];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIssuerBrandRecord(value: unknown): value is AuthorizationIssuerBrandRecord {
  if (!isRecord(value)) return false;
  return (
    (typeof value.id === 'string' || typeof value.id === 'number') &&
    (value.name === undefined || typeof value.name === 'string')
  );
}

interface ValidatedBrand {
  readonly requestedIdentifier: string;
  readonly id: string;
  readonly name: string;
}

function toValidatedBrand(
  record: AuthorizationIssuerBrandRecord | undefined,
  requestedIdentifier: string
): ValidatedBrand | undefined {
  if (record === undefined || !isIssuerBrandRecord(record)) return undefined;
  const id = String(record.id).trim();
  if (id.length === 0) return undefined;
  return { requestedIdentifier, id, name: record.name ?? requestedIdentifier };
}

function isNonEmptyOperationId(value: string): value is string {
  return value.trim().length > 0;
}

function isSystemScope(scopeKey: ScopeKey): boolean {
  return scopeKey.startsWith('system.');
}

function normalizeScopeCeiling(scopeKeys: readonly string[] | undefined): readonly ScopeKey[] | undefined {
  if (scopeKeys === undefined) return undefined;
  try {
    return Object.freeze([...scopeKeys.map(asScopeKey)].sort(compareScopeKeys));
  } catch {
    return Object.freeze([]);
  }
}

const serverIssuedAuthorizationContexts = new WeakSet<object>();

function markServerIssuedAuthorizationContext<T extends object>(context: T): T {
  if (!Object.isFrozen(context)) {
    throw new Error('Only frozen authorization contexts can carry server-issued provenance.');
  }
  serverIssuedAuthorizationContexts.add(context);
  return context;
}

/**
 * Issues a trusted authorization context from an already-validated input.
 * Reserved for the genuine `AuthorizationService` resolvers
 * (`resolveRolesAndScopes`): every other caller must use
 * `createSystemProcessContextInternal` or re-resolve through the service.
 */
export function issueTrustedAuthorizationContextInternal(input: AuthorizationContextInput): AuthorizationContext {
  return markServerIssuedAuthorizationContext(freezeAuthorizationContext(input));
}

/** Type-guarded predicate: only contexts issued by this module verify. */
export function isTrustedAuthorizationContextInternal(context: unknown): context is AuthorizationContext {
  return (
    typeof context === 'object' &&
    context !== null &&
    Object.isFrozen(context) &&
    serverIssuedAuthorizationContexts.has(context)
  );
}

/** Guarded accessor for trusted writers: forged or unissued contexts fail closed. */
export function requireTrustedAuthorizationContextInternal(context: unknown): AuthorizationContext {
  if (!isTrustedAuthorizationContextInternal(context)) {
    throw new Error('An active authoritative actor context is required.');
  }
  return context;
}

/**
 * Trusted-job factory. Deliberately NOT on the `AuthorizationService` class
 * (and therefore not in `_exportedMethods`, loader shims, or request service
 * globals): only genuine server modules importing this file can choose an
 * internal identity or its scopes.
 */
export async function createSystemProcessContextInternal(
  deps: AuthorizationActorIssuerDependencies,
  operationId: SystemProcessOperationId,
  brandIdentifier: SystemProcessBrandIdentifier,
  allowedScopes: SystemProcessAllowedScopes
): Promise<AuthorizationContext> {
  if (!isNonEmptyOperationId(operationId)) {
    throw new Error('A system-process operation id is required.');
  }
  const registry = deps.getRegistry();
  const validated = registry.validateScopeKeys(normalizeScopeCeiling(allowedScopes) ?? []);
  const brandRecord = brandIdentifier === undefined ? undefined : await deps.resolveBrand(brandIdentifier);
  const resolvedBrand = brandIdentifier === undefined ? undefined : toValidatedBrand(brandRecord, brandIdentifier);
  const brandUsable = brandIdentifier === undefined ? true : resolvedBrand !== undefined;
  const grantedScopeKeys = !brandUsable
    ? []
    : resolvedBrand === undefined
      ? validated.activeScopeKeys.filter(scopeKey => isSystemScope(scopeKey))
      : validated.activeScopeKeys.filter(scopeKey => !isSystemScope(scopeKey));
  const grantedScopeKeySet = new Set(grantedScopeKeys);
  const principal = Object.freeze({
    category: 'system-process' as const,
    authMethod: 'internal' as const,
    active: true,
    operationId,
  });
  return issueTrustedAuthorizationContextInternal({
    contextType: resolvedBrand === undefined ? 'system' : 'brand',
    principal,
    ...(resolvedBrand === undefined
      ? {}
      : {
          brand: Object.freeze({
            requestedIdentifier: resolvedBrand.requestedIdentifier,
            id: resolvedBrand.id,
            name: resolvedBrand.name,
            exists: true,
            authorized: true,
          }),
        }),
    grantedScopeKeys,
    effectiveScopeKeys: grantedScopeKeys,
    resolutionEvidence: {
      expiredAssignmentIds: [],
      ignoredAssignmentIds: [],
      inactiveRoleIds: [],
      ignoredRoleIds: [],
      missingTemplateRevisionRoleIds: [],
      inactiveScopeKeys: validated.inactiveScopeKeys,
      missingScopeKeys: validated.missingScopeKeys,
      rejectedScopeKeys: validated.activeScopeKeys.filter(scopeKey => !grantedScopeKeySet.has(scopeKey)),
    },
  });
}
