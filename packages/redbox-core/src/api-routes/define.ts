import { ApiRouteDefinition } from './types';

export function defineApiRoute(route: ApiRouteDefinition): ApiRouteDefinition {
  return Object.freeze({
    ...route,
    tags: route.tags ? [...route.tags] : undefined,
    security: route.security ? route.security.map(entry => ({ ...entry })) : undefined,
    responses: route.responses ? { ...route.responses } : undefined,
    request: route.request
      ? {
        ...route.request,
        files: route.request.files ? { ...route.request.files } : undefined,
        legacyParamFallbacks: route.request.legacyParamFallbacks
          ? Object.fromEntries(
            Object.entries(route.request.legacyParamFallbacks).map(([fieldName, fallbacks]) => [
              fieldName,
              [...(fallbacks ?? [])],
            ])
          )
          : undefined,
      }
      : undefined,
    extensions: route.extensions ? { ...route.extensions } : undefined,
  });
}

export function defineApiRoutes(routes: readonly ApiRouteDefinition[]): readonly ApiRouteDefinition[] {
  return routes.map(route => defineApiRoute(route));
}
