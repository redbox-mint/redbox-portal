import type { ApiRequestInput } from './types';
import UrlPattern from 'url-pattern';

import { getMatchedRoutePath, normalizeMethod, routeKey } from './helpers';
import { ApiRouteDefinition } from './types';

function matchRoutePath(routePath: string, requestPath: string): boolean {
  return new UrlPattern(routePath).match(requestPath) != null;
}

function getContractAliasPath(routePath: string): string | undefined {
  const reportConfigAdminPath = '/:branding/:portal/admin/report-config';
  if (routePath === reportConfigAdminPath || routePath.startsWith(`${reportConfigAdminPath}/`)) {
    return routePath.replace('/admin/report-config', '/api/report-config');
  }
  return undefined;
}

/** Per-composition resolution; no process cache or implicit runtime configuration. */
export function createApiRouteResolver(routes: readonly ApiRouteDefinition[]) {
  const snapshot = [...routes];
  const routeMap = new Map(snapshot.map(route => [routeKey(route.method, route.path), route]));
  return (req: ApiRequestInput): ApiRouteDefinition | undefined => {
    const method = normalizeMethod(req.method ?? '');
    const matchedRoutePath = getMatchedRoutePath(req);

    if (matchedRoutePath) {
      const matchedRoute = routeMap.get(routeKey(method, matchedRoutePath));
      if (matchedRoute) {
        return matchedRoute;
      }
      const aliasPath = getContractAliasPath(matchedRoutePath);
      if (aliasPath) {
        const aliasedRoute = routeMap.get(routeKey(method, aliasPath));
        if (aliasedRoute) {
          return aliasedRoute;
        }
      }
    }

    const requestPath =
      typeof req.path === 'string' && req.path.trim() !== ''
        ? req.path.trim()
        : typeof req.originalUrl === 'string'
          ? req.originalUrl.split('?')[0]
          : '';
    const matchingRoutes = snapshot.filter(route => route.method === method && matchRoutePath(route.path, requestPath));

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
  };
}
