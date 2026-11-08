import type { ApiRouteDefinition } from '../../api-routes/types';
import type { PoliciesConfig } from '../../config/policies.config';
import { resolveExtensionsV2, type loadInstalledExtensionProvidersV2 } from '../../extensions/v2';
import { bindControllerFactory, type BoundControllerFactory } from '../../http/controllers';
import { recordController } from '../../http/controllers/webservice/RecordController';
import { apiRouteRegistrations } from '../../http/fastify/routes';
import { coreRoutePrecedence } from '../../http/fastify/precedence';
import { nativePolicyNames } from '../../http/fastify/policies';
import { updateMetaRoute } from '../../api-routes/groups/records';
import type { ExtensionFactory } from '../../extensions';
import type { PortalApplicationContext } from './application';
import { portalHttpPlan, portalHttpSettings } from './httpPlan';
import { coreFallbackReservedPrefixes } from '../../http/fastify/registry';
import { z } from 'zod';
import type {
  ProductionApiRouteOptions,
  ProductionExtensionResolutionOptions,
  ProductionRoutingOptions,
  ProductionNamespaceConfiguration,
} from './compositionInputs';

export interface PortalFastifySelection {
  readonly declarations: readonly ApiRouteDefinition[];
  readonly policyConfiguration?: PoliciesConfig;
  readonly portals?: readonly string[];
  /** Bind concrete inputs offline; getters borrow initialized domain instances later. */
  bindings?(context: PortalApplicationContext): readonly BoundControllerFactory[];
}
/** One offline selection, shared unchanged with the host and application lifecycle. */
export async function resolvePortalInstallation(
  installed: Awaited<ReturnType<typeof loadInstalledExtensionProvidersV2>>,
  context: PortalApplicationContext & { readonly plans: readonly { readonly declaration: ExtensionFactory }[] },
  input: PortalFastifySelection,
  appPath: string
) {
  if (!Array.isArray(input.declarations) || !input.declarations.length)
    throw new TypeError('Native portal assembly requires an explicit nonempty conversion scope.');
  const plan = portalHttpPlan(context, input);
  const settings = portalHttpSettings(context.config, input);
  const coreRoutes = apiRouteRegistrations({
    declarations: input.declarations,
    configuration: plan.policyConfiguration,
    provider: '@researchdatabox/redbox-core',
  } satisfies ProductionApiRouteOptions).map(route => ({
    ...route,
    effectiveCsrf:
      route.declaration.api?.controller === updateMetaRoute.controller &&
      route.declaration.api?.action === updateMetaRoute.action
        ? 'apiProtect'
        : 'none',
  }));
  const bindings = Object.freeze([
    bindControllerFactory(recordController, plan.metadata),
    ...(input.bindings?.(context) ?? []),
  ]);
  const selected = new Set(coreRoutes.map(route => route.declaration.name));
  const routing = Object.freeze({
    rootContext: context.config.server.rootContext,
    policyNames: nativePolicyNames,
    legacyOrder: true,
    precedence: Object.freeze(
      coreRoutePrecedence.filter(entry => selected.has(entry.winner) && selected.has(entry.over))
    ),
  } satisfies ProductionRoutingOptions);
  // Reserve configured integration namespaces even while their transports are
  // outside this conversion scope. Never silently reserve the default paths.
  const namespaceConfiguration = z
    .object({
      companion: z.object({ route: z.string(), server: z.object({ path: z.string() }) }),
    })
    .parse({ companion: context.config.companion }) satisfies ProductionNamespaceConfiguration;
  const fallbackReservedPrefixes = coreFallbackReservedPrefixes(namespaceConfiguration);
  const resolved = await resolveExtensionsV2(
    [
      {
        name: 'core',
        root: appPath,
        declaration: {
          apiVersion: 2,
          modules: context.plans.map(plan => plan.declaration),
          controllers: [recordController],
        },
      },
      ...installed.providers,
    ],
    {
      hookLoadPriority: installed.hookLoadPriority,
      bindings,
      coreRoutes,
      routing,
      apiConfiguration: plan.policyConfiguration,
      fallbackReservedPrefixes,
      namespaceConfiguration,
    } satisfies ProductionExtensionResolutionOptions
  );
  // Seal declaration/plan data in place to retain exact factory identities.
  // Class instances (Zod schemas and the request registry) own their runtime state;
  // bindings close over borrowed inputs, which are never traversed or frozen.
  const seen = new WeakSet<object>();
  function seal(value: unknown): void {
    if (
      !value ||
      typeof value !== 'object' ||
      seen.has(value) ||
      (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    )
      return;
    seen.add(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
      if ('value' in descriptor) seal(descriptor.value);
    Object.freeze(value);
  }
  seal(resolved);
  for (const binding of bindings) Object.freeze(binding);
  seal(plan.policyConfiguration);
  seal(namespaceConfiguration);
  return Object.freeze({
    ...resolved,
    bindings,
    routing,
    policyConfiguration: plan.policyConfiguration,
    portals: Object.freeze([...settings.portals]),
    fallbackReservedPrefixes,
    namespaceConfiguration,
    hookLoadPriority: Object.freeze([...installed.hookLoadPriority]),
    scope: Object.freeze({
      included: Object.freeze([...selected]),
      excluded: 'All other core families, including the unresolved FM-034 TUS GET/fallthrough splits',
    }),
  });
}
export type ResolvedPortalInstallation = Awaited<ReturnType<typeof resolvePortalInstallation>>;
