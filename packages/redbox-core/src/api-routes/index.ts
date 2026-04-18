export * from './types';
export * from './define';
export * from './helpers';
export * from './request-extraction';
export * from './validation';
export * from './openapi';
export * from './apib';
export * from './schemas/common';

export * from './groups/records';
export * from './groups/users';
export * from './groups/search';
export * from './groups/forms';
export * from './groups/vocabulary';
export * from './groups/recordtypes';
export * from './groups/admin';
export * from './groups/appconfig';
export * from './groups/branding';
export * from './groups/translation';
export * from './groups/reports';
export * from './groups/export';
export * from './groups/notifications';

import { buildApiBlueprint } from './apib';
import { buildOpenApiDocument } from './openapi';
import { buildSailsRouteConfig, ensureUniqueApiRoutes, isRecord, toRouteMap, validateApiRouteConsistency } from './helpers';
import { ApiRouteDefinition, type ApiRouteProvider } from './types';
import { appConfigApiRoutes } from './groups/appconfig';
import { adminApiRoutes } from './groups/admin';
import { brandingApiRoutes } from './groups/branding';
import { exportApiRoutes } from './groups/export';
import { formApiRoutes } from './groups/forms';
import { notificationApiRoutes } from './groups/notifications';
import { recordApiRoutes } from './groups/records';
import { recordTypeApiRoutes } from './groups/recordtypes';
import { reportsApiRoutes } from './groups/reports';
import { searchApiRoutes } from './groups/search';
import { translationApiRoutes } from './groups/translation';
import { userApiRoutes } from './groups/users';
import { vocabularyApiRoutes } from './groups/vocabulary';

const apiDocumentInfo = {
  title: 'ReDBox Portal API',
  version: '1.0.0',
  description: 'Contract-first API routes for the ReDBox Portal',
} as const;

const coreApiRouteGroups = [
  recordApiRoutes,
  userApiRoutes,
  searchApiRoutes,
  formApiRoutes,
  vocabularyApiRoutes,
  recordTypeApiRoutes,
  adminApiRoutes,
  appConfigApiRoutes,
  brandingApiRoutes,
  translationApiRoutes,
  reportsApiRoutes,
  exportApiRoutes,
  notificationApiRoutes,
] as const;

export function registerCoreApiRoutes(): ApiRouteDefinition[] {
  return [...ensureUniqueApiRoutes(coreApiRouteGroups.flat(), 'core API routes')];
}

export function registerHookApiRoutes(): ApiRouteDefinition[] {
  const sailsConfig =
    typeof sails === 'undefined' ? {} : ((sails as unknown as { config?: Record<string, unknown> }).config ?? {});
  const hookProviders = sailsConfig['apiRoutesHooks'] as ApiRouteProvider[] | undefined;
  if (!Array.isArray(hookProviders)) {
    return [];
  }
  const routes = hookProviders
    .flatMap(provider => {
      if (typeof provider === 'function') {
        const providedRoutes = provider();
        return Array.isArray(providedRoutes) ? providedRoutes : [];
      }
      return [];
    })
    .filter((route): route is ApiRouteDefinition => typeof route === 'object' && route !== null && 'path' in route);
  return [...ensureUniqueApiRoutes(routes, 'hook API routes')];
}

function getRuntimeRouteTable(): Record<string, unknown> | undefined {
  const sailsConfig =
    typeof sails === 'undefined' ? {} : ((sails as unknown as { config?: Record<string, unknown> }).config ?? {});
  const runtimeRoutes = sailsConfig['routes'];
  return isRecord(runtimeRoutes) ? runtimeRoutes : undefined;
}

export function getMergedApiRoutes(): ApiRouteDefinition[] {
  const routes = [...ensureUniqueApiRoutes([...registerCoreApiRoutes(), ...registerHookApiRoutes()], 'merged API routes')];
  const runtimeRoutes = getRuntimeRouteTable();
  if (runtimeRoutes) {
    validateApiRouteConsistency(routes, runtimeRoutes, 'merged runtime route table');
  }
  return routes;
}

export function getCoreApiRouteMap() {
  return toRouteMap(registerCoreApiRoutes());
}

export function buildCoreApiRouteConfig() {
  return buildSailsRouteConfig(registerCoreApiRoutes());
}

export function buildMergedApiRouteConfig() {
  return buildSailsRouteConfig(getMergedApiRoutes());
}

function buildApiOpenApiDocumentForRoutes(
  routes: readonly ApiRouteDefinition[],
  options: { branding?: string; portal?: string } = {}
) {
  return buildOpenApiDocument(routes, apiDocumentInfo, options);
}

function buildApiBlueprintForRoutes(
  routes: readonly ApiRouteDefinition[],
  options: { branding?: string; portal?: string } = {}
) {
  return buildApiBlueprint(routes, options);
}

export function buildCoreApiOpenApiDocument(options: { branding?: string; portal?: string } = {}) {
  return buildApiOpenApiDocumentForRoutes(registerCoreApiRoutes(), options);
}

export function buildMergedApiOpenApiDocument(options: { branding?: string; portal?: string } = {}) {
  return buildApiOpenApiDocumentForRoutes(getMergedApiRoutes(), options);
}

export function buildCoreApiBlueprint(options: { branding?: string; portal?: string } = {}) {
  return buildApiBlueprintForRoutes(registerCoreApiRoutes(), options);
}

export function buildMergedApiBlueprint(options: { branding?: string; portal?: string } = {}) {
  return buildApiBlueprintForRoutes(getMergedApiRoutes(), options);
}
