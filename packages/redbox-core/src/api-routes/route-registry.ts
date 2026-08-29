import { buildApiBlueprint } from './apib';
import { buildOpenApiDocument } from './openapi';
import {
  buildSailsRouteConfig,
  ensureUniqueApiRoutes,
  isRecord,
  toRouteMap,
  validateApiRouteConsistency,
} from './helpers';
import { ApiRouteDefinition, type ApiRouteProvider, type HttpMethod } from './types';
import { normalizeRouteAuthorization } from '../authorization';
import { appConfigApiRoutes } from './groups/appconfig';
import { authorizationApiRoutes } from './groups/authorization';
import { adminApiRoutes } from './groups/admin';
import { brandingApiRoutes } from './groups/branding';
import { dashboardConfigApiRoutes } from './groups/dashboard-config';
import { exportApiRoutes } from './groups/export';
import { figshareCrosswalkApiRoutes } from './groups/figshare-crosswalks';
import { figshareVocabularyApiRoutes } from './groups/figshare-vocabulary';
import { formApiRoutes } from './groups/forms';
import { harvestRunApiRoutes } from './groups/harvest-runs';
import { integrationAuditApiRoutes } from './groups/integration-audit';
import { notificationApiRoutes } from './groups/notifications';
import { recordApiRoutes } from './groups/records';
import { recordSchemaApiRoutes } from './groups/record-schemas';
import { recordTypeApiRoutes } from './groups/recordtypes';
import { reportsApiRoutes } from './groups/reports';
import { searchApiRoutes } from './groups/search';
import { translationApiRoutes } from './groups/translation';
import { userApiRoutes } from './groups/users';
import { vocabularyApiRoutes } from './groups/vocabulary';
import { namedQueryApiRoutes } from './groups/named-query';

const apiDocumentInfo = {
  title: 'ReDBox Portal API',
  version: '1.0.0',
  description: 'Contract-first API routes for the ReDBox Portal',
} as const;

const HTTP_METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'head'];

function isHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === 'string' && HTTP_METHODS.some(method => method === value);
}

const coreApiRouteGroups = [
  authorizationApiRoutes,
  recordApiRoutes,
  recordSchemaApiRoutes,
  userApiRoutes,
  searchApiRoutes,
  formApiRoutes,
  harvestRunApiRoutes,
  vocabularyApiRoutes,
  figshareVocabularyApiRoutes,
  figshareCrosswalkApiRoutes,
  recordTypeApiRoutes,
  adminApiRoutes,
  appConfigApiRoutes,
  brandingApiRoutes,
  dashboardConfigApiRoutes,
  translationApiRoutes,
  reportsApiRoutes,
  integrationAuditApiRoutes,
  exportApiRoutes,
  notificationApiRoutes,
  namedQueryApiRoutes,
] as const;

export function registerCoreApiRoutes(): ApiRouteDefinition[] {
  return [...ensureUniqueApiRoutes(coreApiRouteGroups.flat(), 'core API routes')];
}

function configuredHookProviders(): readonly ApiRouteProvider[] {
  const hookProviders = typeof sails === 'undefined' ? undefined : sails.config.apiRoutesHooks;
  if (!Array.isArray(hookProviders)) {
    return [];
  }
  return hookProviders;
}

export function registerHookApiRoutes(
  hookProviders: readonly ApiRouteProvider[] = configuredHookProviders()
): ApiRouteDefinition[] {
  const routes = hookProviders.flatMap((provider, providerIndex) => {
    if (typeof provider !== 'function') {
      throw new Error(`Hook API route provider at index ${providerIndex} must be a synchronous function.`);
    }
    const providedRoutes: unknown = provider();
    if (!Array.isArray(providedRoutes)) {
      throw new Error(`Hook API route provider at index ${providerIndex} must synchronously return an array.`);
    }
    return providedRoutes.map((route: unknown, routeIndex): ApiRouteDefinition => {
      if (
        !isRecord(route) ||
        !isHttpMethod(route.method) ||
        typeof route.path !== 'string' ||
        !route.path.startsWith('/') ||
        typeof route.controller !== 'string' ||
        route.controller.trim().length === 0 ||
        typeof route.action !== 'string' ||
        route.action.trim().length === 0
      ) {
        throw new Error(
          `Hook API route provider at index ${providerIndex} returned an invalid route at index ${routeIndex}.`
        );
      }
      return {
        ...route,
        method: route.method,
        path: route.path,
        controller: route.controller,
        action: route.action,
        authorization: normalizeRouteAuthorization(route.authorization),
      };
    });
  });
  return [...ensureUniqueApiRoutes(routes, 'hook API routes')];
}

function getRuntimeRouteTable(): Record<string, unknown> | undefined {
  const runtimeRoutes = typeof sails === 'undefined' ? undefined : sails.config.routes;
  return isRecord(runtimeRoutes) ? runtimeRoutes : undefined;
}

function mergedApiRoutes(hookProviders: readonly ApiRouteProvider[]): ApiRouteDefinition[] {
  return [
    ...ensureUniqueApiRoutes(
      [...registerCoreApiRoutes(), ...registerHookApiRoutes(hookProviders)],
      'merged API routes'
    ),
  ];
}

export function getMergedApiRoutes(
  hookProviders: readonly ApiRouteProvider[] = configuredHookProviders()
): ApiRouteDefinition[] {
  const routes = mergedApiRoutes(hookProviders);
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

export function buildMergedApiRouteConfig(hookProviders?: readonly ApiRouteProvider[]) {
  return buildSailsRouteConfig(hookProviders === undefined ? getMergedApiRoutes() : mergedApiRoutes(hookProviders));
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
