import type { ApiRouteDefinition } from '../../api-routes/types';
import type { PoliciesConfig } from '../../config/policies.config';
import { resolveExtensionsV2, type loadInstalledExtensionProvidersV2 } from '../../extensions/v2';
import { bindControllerFactory, type BoundControllerFactory } from '../../http/controllers';
import { recordController } from '../../http/controllers/webservice/RecordController';
import { apiRouteRegistrations } from '../../http/fastify/routes';
import { coreRoutePrecedence } from '../../http/fastify/precedence';
import { nativePolicyNames } from '../../http/fastify/policies';
import { PortalRawHttp } from './rawHttp';
import { datastreamController } from '../../http/controllers/webservice/DatastreamController';
import { progressController } from '../../http/controllers/ProgressController';
import { progressSocketGrantRoute } from '../../http/express/progressOperations';
import { addDataStreamsRoute } from '../../api-routes/groups/records';
import { updateMetaRoute } from '../../api-routes/groups/records';
import type { ExtensionFactory } from '../../extensions';
import type { PortalApplicationContext } from './application';
import { portalHttpPlan, portalHttpSettings } from './httpPlan';
import { portalReferenceControllers } from './referenceHttpPlan';
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
  /** Select the owned Socket.IO progress channel and its grant endpoint. */
  readonly progress?: boolean;
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
  const upload = input.declarations.some(
    route => route.controller === addDataStreamsRoute.controller && route.action === addDataStreamsRoute.action
  );
  // Bind the module offline, but select its resources only after route replacement.
  let raw: PortalRawHttp | undefined;
  const rawDeclaration =
    upload || input.progress || context.config.companion.enabled
      ? {
          name: 'portal-raw-http',
          requires: [
            context.data.records.declaration.name,
            context.data.disks.declaration.name,
            context.data.datastream.declaration.name,
            context.data.progress.declaration.name,
            context.data.users.declaration.name,
          ],
          create: () => raw!,
        }
      : undefined;
  const reference = portalReferenceControllers(context, new Set(input.declarations.map(route => route.controller)));
  const recordFactory = upload ? datastreamController : recordController;
  const coreRoutes = apiRouteRegistrations({
    declarations: [...input.declarations, ...(input.progress ? [{ ...progressSocketGrantRoute, responses: {} }] : [])],
    configuration: plan.policyConfiguration,
    provider: '@researchdatabox/redbox-core',
  } satisfies ProductionApiRouteOptions).map(route => ({
    ...route,
    effectiveCsrf:
      (route.declaration.api?.controller === updateMetaRoute.controller &&
        [updateMetaRoute.action, addDataStreamsRoute.action].includes(route.declaration.api?.action ?? '')) ||
      (input.progress && route.declaration.api?.controller === progressSocketGrantRoute.controller)
        ? 'apiProtect'
        : 'none',
  }));
  const bindings = Object.freeze([
    ...(upload
      ? [
          bindControllerFactory(datastreamController, {
            log: context.log,
            rootContext: context.config.server.rootContext,
            get records() {
              return context.data.records.get();
            },
            get storage() {
              return context.data.storage();
            },
            get recordTypes() {
              return context.data.reference.types.get();
            },
            get workflows() {
              return context.data.reference.workflows.get();
            },
            get schemas() {
              return context.data.reference.schema.get();
            },
            get datastream() {
              return context.data.datastream.get();
            },
            get multipart() {
              return raw!.multipart;
            },
          }),
        ]
      : [bindControllerFactory(recordController, plan.metadata)]),
    ...(input.progress
      ? [
          bindControllerFactory(progressController, {
            get sockets() {
              return raw!.sockets;
            },
            log: context.log,
          }),
        ]
      : []),
    ...reference.bindings,
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
          modules: [...context.plans.map(plan => plan.declaration), ...(rawDeclaration ? [rawDeclaration] : [])],
          controllers: [recordFactory, ...reference.controllers, ...(input.progress ? [progressController] : [])],
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
  // API metadata can be deliberately removed by a complete route replacement.
  // Transport/prelude ownership follows the final executable action target,
  // including inherited actions on a selected controller subclass.
  const routesFor = (target: { readonly controller: string; readonly action: string }) =>
    Object.freeze(
      resolved.routePlan.routes.filter(
        route =>
          !route.effectivePolicies.includes(false) &&
          route.declaration.controller === target.controller &&
          route.declaration.action === target.action
      )
    );
  const httpOwners = Object.freeze({
    uploads: routesFor(addDataStreamsRoute),
    progress: routesFor(progressSocketGrantRoute),
    metadataUpdates: routesFor(updateMetaRoute),
  });
  if (rawDeclaration) raw = new PortalRawHttp(context, httpOwners.uploads.length > 0, httpOwners.progress.length > 0);
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
    raw,
    rawDeclaration,
    httpOwners,
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
