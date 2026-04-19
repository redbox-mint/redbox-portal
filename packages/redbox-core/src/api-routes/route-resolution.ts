import UrlPattern from 'url-pattern';

import { getMatchedRoutePath, normalizeMethod, routeKey } from './helpers';
import { getMergedApiRoutes } from './route-registry';
import { ApiRouteDefinition } from './types';

let cachedRouteMap: Map<string, ApiRouteDefinition> | null = null;
let cachedRoutes: readonly ApiRouteDefinition[] | null = null;

function getCachedRoutes(): readonly ApiRouteDefinition[] {
  if (cachedRoutes == null) {
    cachedRoutes = getMergedApiRoutes();
  }
  return cachedRoutes;
}

function getCachedRouteMap(): Map<string, ApiRouteDefinition> {
  if (cachedRouteMap == null) {
    cachedRouteMap = new Map(getCachedRoutes().map(route => [routeKey(route.method, route.path), route]));
  }
  return cachedRouteMap;
}

function matchRoutePath(routePath: string, requestPath: string): boolean {
  return new UrlPattern(routePath).match(requestPath) != null;
}

export function resetResolvedApiRouteCache(): void {
  cachedRouteMap = null;
  cachedRoutes = null;
}

export function resolveApiRouteForRequest(req: Sails.Req): ApiRouteDefinition | undefined {
  const method = normalizeMethod(req.method);
  const matchedRoutePath = getMatchedRoutePath(req);

  if (matchedRoutePath) {
    const matchedRoute = getCachedRouteMap().get(routeKey(method, matchedRoutePath));
    if (matchedRoute) {
      return matchedRoute;
    }
  }

  const requestPath = typeof req.path === 'string' && req.path.trim() !== ''
    ? req.path.trim()
    : typeof req.originalUrl === 'string'
      ? req.originalUrl.split('?')[0]
      : '';
  const matchingRoutes = getCachedRoutes().filter(route => route.method === method && matchRoutePath(route.path, requestPath));

  if (matchingRoutes.length === 1) {
    return matchingRoutes[0];
  }

  if (matchingRoutes.length > 1) {
    throw new Error(
      `Ambiguous contract-first API route match for ${String(req.method).toUpperCase()} ${requestPath}: ${matchingRoutes
        .map(route => `${route.controller}#${route.action} ${route.path}`)
        .join(', ')}`
    );
  }

  return undefined;
}
