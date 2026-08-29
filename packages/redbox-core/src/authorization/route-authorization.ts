import type { ScopeRegistry } from './scope-registry';
import type { AuthorizationContext, RouteAuthorization, ScopeKey } from './types';
import { asScopeKey } from './validators';

const MAX_ROUTE_ID_LENGTH = 256;
const MAX_REASON_LENGTH = 256;

export interface AuthorizableRoute {
  readonly method?: string;
  readonly path: string;
  readonly controller?: string;
  readonly action?: string;
  readonly authorization?: RouteAuthorization;
  readonly routeId?: string;
}

export function scopeAuthorization(scope: string | ScopeKey): RouteAuthorization {
  return Object.freeze({ kind: 'scope', scope: asScopeKey(scope) });
}

export function publicAuthorization(reason: string): RouteAuthorization {
  return Object.freeze({ kind: 'public', reason: validateReason(reason, 'public') });
}

export function preAuthAuthorization(reason: string): RouteAuthorization {
  return Object.freeze({ kind: 'pre-auth', reason: validateReason(reason, 'pre-auth') });
}

function validateReason(reason: string, kind: 'public' | 'pre-auth'): string {
  const normalized = reason.trim();
  if (normalized.length === 0 || normalized.length > MAX_REASON_LENGTH) {
    throw new Error(`${kind} route authorization reason must contain 1-${MAX_REASON_LENGTH} characters.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeRouteAuthorization(value: unknown): RouteAuthorization {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new Error('Route authorization declaration must be an object with a valid kind.');
  }

  switch (value.kind) {
    case 'scope': {
      if (typeof value.scope !== 'string') {
        throw new Error('Scoped route authorization must declare a scope key.');
      }
      return scopeAuthorization(value.scope);
    }
    case 'public': {
      if (typeof value.reason !== 'string') {
        throw new Error('Public route authorization must declare a reason.');
      }
      return publicAuthorization(value.reason);
    }
    case 'pre-auth': {
      if (typeof value.reason !== 'string') {
        throw new Error('Pre-auth route authorization must declare a reason.');
      }
      return preAuthAuthorization(value.reason);
    }
    default:
      throw new Error('Route authorization declaration kind is invalid.');
  }
}

/** Fail-closed controller seam for actions that pass request authority into a resource gate. */
export function requireRequestAuthorizationContext(req: Sails.Req): AuthorizationContext {
  if (req.authorization === undefined) {
    throw new Error('The request did not pass authorization context resolution.');
  }
  return req.authorization;
}

export function createRouteId(route: AuthorizableRoute): string {
  const method = route.method?.trim().toUpperCase() || '*';
  const target = [route.controller?.trim(), route.action?.trim()].filter(Boolean).join('#') || 'policy-only';
  const routeId = `${method} ${route.path.trim()} (${target})`;
  if (routeId.length > MAX_ROUTE_ID_LENGTH) {
    throw new Error(`Route identity exceeds ${MAX_ROUTE_ID_LENGTH} characters: ${routeId}`);
  }
  return routeId;
}

export function validateRouteAuthorizations(
  routes: readonly AuthorizableRoute[],
  registry: ScopeRegistry,
  context = 'merged route table'
): void {
  const issues: string[] = [];
  const routeIds = new Set<string>();

  for (const route of routes) {
    const routeId = route.routeId ?? createRouteId(route);
    if (routeIds.has(routeId)) {
      issues.push(`Duplicate route identity: ${routeId}`);
    }
    routeIds.add(routeId);

    if (route.authorization === undefined) {
      issues.push(`Missing authorization declaration: ${routeId}`);
      continue;
    }

    try {
      const authorization = normalizeRouteAuthorization(route.authorization);
      if (authorization.kind === 'scope' && !registry.has(authorization.scope)) {
        issues.push(`Unknown authorization scope ${authorization.scope}: ${routeId}`);
      }
      if (
        authorization.kind === 'scope' &&
        registry.has(authorization.scope) &&
        !registry.isActive(authorization.scope)
      ) {
        issues.push(`Inactive authorization scope ${authorization.scope}: ${routeId}`);
      }
    } catch (error) {
      issues.push(`${error instanceof Error ? error.message : String(error)} Route: ${routeId}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Authorization route validation failed for ${context}:\n- ${issues.join('\n- ')}`);
  }
}
