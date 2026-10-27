import { buildApiBlueprint } from './apib';
import { buildOpenApiDocument } from './openapi';
import { getRedboxRoleExtension, type AuthRuleLike, ensureUniqueApiRoutes, toRouteMap } from './helpers';
import { ApiRouteDefinition, type ApiRouteProvider } from './types';
import { appConfigApiRoutes } from './groups/appconfig';
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
import { siemApiRoutes } from './groups/siem';

const apiDocumentInfo = {
  title: 'ReDBox Portal API',
  version: '1.0.0',
  description: 'Contract-first API routes for the ReDBox Portal',
} as const;

const coreApiRouteGroups = [
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
  siemApiRoutes,
] as const;

export function registerCoreApiRoutes(): ApiRouteDefinition[] {
  return [...ensureUniqueApiRoutes(coreApiRouteGroups.flat(), 'core API routes')];
}

export interface ApiRouteConfiguration {
  readonly auth?: { readonly rules?: readonly AuthRuleLike[] };
  readonly apiRoutesHooks?: readonly ApiRouteProvider[];
}

export function registerHookApiRoutes(configuration?: ApiRouteConfiguration): ApiRouteDefinition[] {
  const hookProviders = configuration?.apiRoutesHooks;
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

export function getMergedApiRoutes(configuration?: ApiRouteConfiguration): ApiRouteDefinition[] {
  const routes = [
    ...ensureUniqueApiRoutes(
      [...registerCoreApiRoutes(), ...registerHookApiRoutes(configuration)],
      'merged API routes'
    ),
  ];
  const rules = configuration?.auth?.rules;
  if (!rules) return routes;
  return routes.map(route => {
    const { ['x-redbox-roles']: _oldRoles, ...extensions } = route.extensions ?? {};
    return { ...route, extensions: { ...extensions, ...getRedboxRoleExtension(route.path, rules) } };
  });
}

export function getCoreApiRouteMap() {
  return toRouteMap(registerCoreApiRoutes());
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

export function buildMergedApiOpenApiDocument(
  options: { branding?: string; portal?: string } = {},
  configuration?: ApiRouteConfiguration
) {
  return buildApiOpenApiDocumentForRoutes(getMergedApiRoutes(configuration), options);
}

export function buildCoreApiBlueprint(options: { branding?: string; portal?: string } = {}) {
  return buildApiBlueprintForRoutes(registerCoreApiRoutes(), options);
}

export function buildMergedApiBlueprint(
  options: { branding?: string; portal?: string } = {},
  configuration?: ApiRouteConfiguration
) {
  return buildApiBlueprintForRoutes(getMergedApiRoutes(configuration), options);
}
