import type { PoliciesConfig } from '../config/policies.config';
import type { BoundControllerFactory } from '../http/controllers';
import type { ControllerRegistration, PortalHttpMethod, RouteAccess } from '../http/contracts';
import { composeHttpHooks } from '../http/fastify/hooks';
import { composeHttpFallbacks } from '../http/fastify/fallbacks';
import { HttpRouteRegistry, type CoreNamespaceConfiguration } from '../http/fastify/registry';
import { composeControllers } from '../http/fastify/registration';
import { apiRouteRegistrations, composeRoutes, coreRouteName, type RouteRegistration } from '../http/fastify/routes';
import type { RedboxExtension, RedboxExtensionV2 } from './contract';
import { ExtensionError, inspectInstalledExtensionProviders } from './loading';
import { orderExtensionProviders, resolveExtensions, type ExtensionProvider } from './resolution';

export interface ExtensionProviderV2 extends Omit<ExtensionProvider, 'declaration'> {
  readonly declaration: RedboxExtensionV2;
}

const migration =
  'https://github.com/redbox-mint/redbox-portal/blob/feature/fastify-migration/support/specs/fastify-migration/extension-api2.md';

function fail(provider: string, message: string): never {
  throw new ExtensionError(provider, message);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function accessIdentity(access: RouteAccess | undefined): string {
  return JSON.stringify([access?.kind, access?.kind === 'policies' ? access.names : undefined]);
}

/** Shared data validation/ordering stays in the existing resolver. Never translate HTTP declarations. */
function contributions(provider: { name: string; root: string; declaration: unknown }): ExtensionProvider {
  const value = provider.declaration;
  if (!object(value)) fail(provider.name, `expected apiVersion 2 declaration; convert using ${migration}`);
  const legacy = ['handlers', 'middleware', 'integrations'].filter(field => field in value);
  if (Array.isArray(value.routes) && value.routes.some(route => object(route) && 'handler' in route))
    legacy.push('routes[].handler');
  if (value.apiVersion !== 2 || legacy.length)
    fail(
      provider.name,
      `expected apiVersion 2; found ${legacy.length ? `API1 HTTP construct(s): ${legacy.join(', ')}` : `apiVersion ${String(value.apiVersion)}`}. ` +
        'Return apiVersion: 2; replace handlers with controllers using defineController({ name, actions, create }), ' +
        'map routes to controller/action and explicit access: { kind: "public" | "policies" | "deny" }; ' +
        'replace middleware with scoped hooks/fallbacks, and move raw-server integrations to qualified core owners. ' +
        `Keep non-HTTP fields unchanged. Migration: ${migration}`
    );
  if (value.controllers !== undefined && !Array.isArray(value.controllers))
    fail(provider.name, 'controllers must be an array');
  for (const controller of value.controllers ?? []) {
    if (
      !object(controller) ||
      Object.keys(controller).some(key => !['name', 'actions', 'create', 'requires', 'replaces'].includes(key))
    )
      fail(
        provider.name,
        'controller factories accept name/actions/create/requires/replaces only; change access with an explicit route replacement'
      );
  }
  if (value.routes !== undefined && !Array.isArray(value.routes)) fail(provider.name, 'routes must be an array');
  for (const route of value.routes ?? []) {
    if (
      !object(route) ||
      Object.keys(route).some(
        key => !['name', 'method', 'path', 'controller', 'action', 'access', 'csrf', 'replaces', 'api'].includes(key)
      ) ||
      typeof route.method !== 'string' ||
      !['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(route.method)
    )
      fail(provider.name, 'invalid API2 route; use a supported method and HttpRouteDeclaration fields');
  }
  for (const field of ['hooks', 'fallbacks'])
    if (value[field] !== undefined && !Array.isArray(value[field])) fail(provider.name, `${field} must be an array`);
  const { controllers: _controllers, routes: _routes, hooks: _hooks, fallbacks: _fallbacks, ...data } = value;
  return { ...provider, declaration: { ...data, apiVersion: 1 } as RedboxExtension };
}

/** Version-checked CommonJS/ESM import and async registration, without running factories/work.
 * Trusted extension entrypoints must themselves be offline; this is not a JS sandbox.
 */
export async function loadInstalledExtensionProvidersV2(
  appPath: string,
  options: { includeDevDependencies?: boolean; core?: RedboxExtensionV2 } = {}
) {
  const installed = await inspectInstalledExtensionProviders(appPath, options);
  const providers = [
    ...(options.core ? [{ name: 'core', root: appPath, declaration: options.core }] : []),
    ...installed.providers,
  ];
  const ordered = orderExtensionProviders(providers.map(contributions), installed.hookLoadPriority);
  const byName = new Map(providers.map(provider => [provider.name, provider]));
  // The version/shape check above is the only unknown-declaration narrowing boundary.
  return {
    ...installed,
    providers: ordered.map(provider => byName.get(provider.name)!) as ExtensionProviderV2[],
  };
}

export interface ExtensionResolutionV2Options {
  readonly hookLoadPriority?: readonly string[];
  readonly bindings: readonly BoundControllerFactory[];
  readonly routing: Parameters<typeof composeRoutes>[1];
  /** Retain normalized core API security sources without copying schemas. */
  readonly coreRoutes?: readonly RouteRegistration[];
  readonly apiConfiguration?: PoliciesConfig;
  readonly fallbackReservedPrefixes?: readonly string[];
  readonly namespaceConfiguration?: CoreNamespaceConfiguration;
}

/** Inherit owned metadata before normalizing explicit API2 changes. Alias ownership
 * stays frozen to its source declaration; composeRoutes still validates all names,
 * replacements and overlaps and generates the actual method/precedence bindings.
 */
function routeRegistrationsV2(
  providers: readonly ExtensionProviderV2[],
  options: ExtensionResolutionV2Options
): RouteRegistration[] {
  const registrations = [...(options.coreRoutes ?? [])];
  const sources = new Map<string, RouteRegistration>();
  const aliases = new Map<string, { owner: string; method: PortalHttpMethod }>();
  const remember = (registration: RouteRegistration) => {
    const route = registration.declaration;
    const alias = aliases.get(route.name);
    sources.set(route.name, registration);
    if (
      route.name !== coreRouteName(route.method, route.path) ||
      (route.method === 'get' && alias && sources.get(alias.owner)?.declaration.method === 'all')
    )
      return;
    const methods: readonly PortalHttpMethod[] =
      route.method === 'all'
        ? ['get', 'head', 'post', 'put', 'patch', 'delete', 'options']
        : route.method === 'get'
          ? ['head']
          : [];
    for (const method of methods) {
      const name = coreRouteName(method, route.path);
      if (!sources.has(name)) aliases.set(name, { owner: route.name, method });
    }
  };
  registrations.forEach(remember);
  for (const provider of providers)
    for (const declaration of provider.declaration.routes ?? []) {
      const alias = aliases.get(declaration.name);
      const owner = alias && sources.get(alias.owner);
      const previous =
        sources.get(declaration.name) ??
        (owner && {
          ...owner,
          declaration: {
            ...owner.declaration,
            name: declaration.name,
            method: alias!.method,
            head: undefined,
            // A GET API's HEAD reservation retains its input contract, but is not
            // itself that GET API source (whose method must continue to match).
            api: undefined,
            validation: owner.declaration.api?.request ?? owner.declaration.validation,
          },
        });
      const accessChanged =
        previous && accessIdentity(previous.declaration.access) !== accessIdentity(declaration.access);
      const merged = {
        // Required API2 fields and the explicit replacement flag belong to this
        // provider. Inherit only metadata the public shape cannot express and
        // the optional source/CSRF fields; never fill an incomplete declaration.
        ...(previous
          ? {
              head: previous.declaration.head,
              validation: previous.declaration.validation,
              api: previous.declaration.api,
              csrf: previous.declaration.csrf,
            }
          : {}),
        ...declaration,
        // Equivalent author objects may spell kind/names in either key order.
        // Keep the source's normalized shape for FM-010's API source check.
        access: previous && !accessChanged ? previous.declaration.access : declaration.access,
        // A complete access replacement can deliberately remove the old API
        // contract. Unchanged access inherits its executable security source.
        ...(accessChanged && !Object.hasOwn(declaration, 'api') ? { api: undefined, validation: undefined } : {}),
      };
      const normalized =
        merged.api &&
        apiRouteRegistrations({
          declarations: [merged.api],
          provider: provider.name,
          configuration: options.apiConfiguration ?? previous?.apiConfiguration,
        })[0];
      const csrfChanged =
        previous &&
        Object.hasOwn(declaration, 'csrf') &&
        (declaration.csrf !== previous.declaration.csrf || (accessChanged && typeof declaration.csrf === 'boolean'));
      const registration: RouteRegistration = {
        ...previous,
        ...normalized,
        provider: provider.name,
        effectivePolicies: normalized
          ? normalized.effectivePolicies
          : accessChanged
            ? undefined
            : previous?.effectivePolicies,
        effectiveCsrf: csrfChanged ? undefined : previous?.effectiveCsrf,
        declaration: {
          ...merged,
          // API-derived HEAD metadata must survive the public declaration merge;
          // the author's stable name must survive normalization's generated name.
          ...(normalized ? { head: normalized.declaration.head } : {}),
          ...(Object.hasOwn(declaration, 'api') &&
          (declaration.api === undefined || declaration.api !== previous?.declaration.api)
            ? { validation: declaration.api?.request }
            : {}),
        },
      };
      registrations.push(registration);
      remember(registration);
    }
  return registrations;
}

/** Complete offline composition, including missing bindings and security/overlap checks.
 * Plans defer construction/installation to owned HTTP preparation. Non-HTTP selection
 * uses the same resolver as production, without ever projecting HTTP into API1.
 */
export async function resolveExtensionsV2(
  providers: readonly ExtensionProviderV2[],
  options: ExtensionResolutionV2Options
) {
  const data = resolveExtensions(providers.map(contributions), options.hookLoadPriority);
  const byName = new Map(providers.map(provider => [provider.name, provider]));
  const ordered = data.providers.map(provider => byName.get(provider.name)!);
  const controllerRegistrations = ordered.flatMap(provider =>
    (provider.declaration.controllers ?? []).map((declaration: ControllerRegistration) => ({
      provider: provider.name,
      declaration,
    }))
  );
  const routeRegistrations = routeRegistrationsV2(ordered, options);
  const routePlan = await composeRoutes(routeRegistrations, options.routing);
  const hookRegistrations = ordered.flatMap(provider =>
    (provider.declaration.hooks ?? []).map(declaration => ({ provider: provider.name, declaration }))
  );
  const fallbackRegistrations = ordered.flatMap(provider =>
    (provider.declaration.fallbacks ?? []).map(declaration => ({ provider: provider.name, declaration }))
  );
  const registry = new HttpRouteRegistry(
    options.routing.rootContext,
    options.fallbackReservedPrefixes,
    options.namespaceConfiguration,
    routePlan.targets
  );
  const fallbackPlan = composeHttpFallbacks(fallbackRegistrations, routePlan, options.routing, registry);
  const hookPlan = composeHttpHooks(hookRegistrations, routePlan.targets);
  const moduleNames = Object.freeze(data.modules.map(module => module.declaration.name));
  const controllerPlan = composeControllers(
    controllerRegistrations,
    options.bindings,
    [...routePlan.routes, ...fallbackPlan.routes].map(route => route.declaration),
    moduleNames
  );
  const {
    handlers: _handlers,
    integrations: _integrations,
    middleware: _middleware,
    routes: _routes,
    ...nonHttp
  } = data;
  return {
    ...nonHttp,
    providers: ordered,
    controllerRegistrations,
    routeRegistrations,
    controllerPlan,
    routePlan,
    hookRegistrations,
    fallbackRegistrations,
    hookPlan,
    fallbackPlan,
    registry,
    moduleNames,
  };
}
