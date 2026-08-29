import UrlPattern from 'url-pattern';

import { createRouteId, normalizeRouteAuthorization, type RouteAuthorization } from '../authorization';
import { getMatchedRoutePath, isRecord, normalizeMethod } from './helpers';
import { resolveApiRouteForRequest } from './route-resolution';

export interface ResolvedRouteAuthorization {
  readonly authorization: RouteAuthorization;
  readonly routeId: string;
}

interface ParsedRoutePattern {
  readonly method?: string;
  readonly path: string;
}

function parseRoutePattern(routePattern: string): ParsedRoutePattern {
  const normalized = routePattern.trim();
  if (normalized.startsWith('/')) return { path: normalized };
  const separator = normalized.indexOf(' ');
  if (separator < 1) return { path: normalized };
  return {
    method: normalizeMethod(normalized.slice(0, separator)),
    path: normalized.slice(separator + 1),
  };
}

function metadataFromTarget(
  target: unknown,
  fallback: Omit<ParsedRoutePattern, 'method'> & { method?: string }
): ResolvedRouteAuthorization | undefined {
  if (!isRecord(target) || !isRecord(target.authorization)) return undefined;
  const authorization = normalizeRouteAuthorization(target.authorization);
  const controller = typeof target.controller === 'string' ? target.controller : undefined;
  const action = typeof target.action === 'string' ? target.action : undefined;
  const routeId =
    typeof target.routeId === 'string' && target.routeId.trim().length > 0
      ? target.routeId
      : createRouteId({ ...fallback, controller, action, authorization });
  return Object.freeze({ authorization, routeId });
}

function requestPath(req: Sails.Req): string {
  if (typeof req.path === 'string' && req.path.trim().length > 0) return req.path.trim();
  return typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : '';
}

export function resolveRouteAuthorizationForRequest(req: Sails.Req): ResolvedRouteAuthorization | undefined {
  const direct = metadataFromTarget(req.options, {
    method: req.method,
    path: getMatchedRoutePath(req) ?? requestPath(req),
  });
  if (direct !== undefined) return direct;

  const routeMetadata = metadataFromTarget(req.route, {
    method: req.method,
    path: getMatchedRoutePath(req) ?? requestPath(req),
  });
  if (routeMetadata !== undefined) return routeMetadata;

  const contractRoute = resolveApiRouteForRequest(req);
  if (contractRoute !== undefined) {
    return Object.freeze({
      authorization: contractRoute.authorization,
      routeId: contractRoute.routeId ?? createRouteId(contractRoute),
    });
  }

  const configuredRoutes = sails.config.routes;
  const method = normalizeMethod(req.method);
  const matchedRoutePath = getMatchedRoutePath(req);
  const actualPath = requestPath(req);
  const matches = Object.entries(configuredRoutes).flatMap(([routePattern, target]) => {
    const parsed = parseRoutePattern(routePattern);
    if (parsed.method !== undefined && parsed.method !== method) return [];
    const exactMatch = matchedRoutePath !== undefined && parsed.path === matchedRoutePath;
    const pathMatch = actualPath.length > 0 && new UrlPattern(parsed.path).match(actualPath) != null;
    if (!exactMatch && !pathMatch) return [];
    const metadata = metadataFromTarget(target, parsed);
    return metadata === undefined ? [] : [metadata];
  });

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const unique = new Map(matches.map(match => [match.routeId, match]));
    if (unique.size === 1) return [...unique.values()][0];
    throw new Error(
      `Ambiguous authorization route match for ${String(req.method).toUpperCase()} ${actualPath}: ${[
        ...unique.keys(),
      ].join(', ')}`
    );
  }
  return undefined;
}
