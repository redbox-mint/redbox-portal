import { brandingUploadRoutes, resumableUploadRoutes, uploadDeclarations } from '../../http/uploadRoutes';
import { datastreamReadRoutes } from '../../http/datastreamRoutes';
import { brandingDeliveryRoutes, fontDeliveryRoute, dynamicAssetRoutes } from '../../http/assetRoutes';
import { dynamicAssetController } from '../../http/controllers/AssetControllers';
import { pageRoutes } from '../../http/pageRoutes';
import { authenticationRoutes } from '../../http/authenticationRoutes';
import { namedQueryPageController, reportsPageController } from '../../http/controllers/BrowserControllers';
import { PortalPages, type PortalPageOptions } from './pageHttpPlan';
import { pageController, pageRootController } from '../../http/controllers/PageController';
import { resolveEffectivePolicies } from '../../http/policyConfiguration';
import { integrationDeclarations } from '../../http/integrationRoutes';
import { portalIntegrationControllers } from './integrationHttpPlan';
import { mutationDeclarations } from '../../http/mutationRoutes';
import { portalMutationControllers } from './mutationHttpPlan';
import { portalReadControllers } from './readHttpPlan';
import { portalIdentityControllers } from './identityHttpPlan';
import { identityAdministrationDeclarations } from '../../http/identityRoutes';
import { BrandingDeliveryCache } from '../../http/brandingDeliveryCache';
import { recordQueryReadDeclarations, recordSchemaReadRoutes } from '../../http/readRoutes';
import type { ApiRouteSource } from '../../http/fastify/routes';
import type { PoliciesConfig } from '../../config/policies.config';
import { resolveExtensionsV2, type loadInstalledExtensionProvidersV2 } from '../../extensions/v2';
import { bindControllerFactory, type BoundControllerFactory } from '../../http/controllers';
import { recordController } from '../../http/controllers/webservice/RecordController';
import { coreRouteName, apiRouteRegistrations } from '../../http/fastify/routes';
import { coreRoutePrecedence } from '../../http/fastify/precedence';
import { nativePolicyNames } from '../../http/fastify/policies';
import { PortalRawHttp } from './rawHttp';
import { datastreamController } from '../../http/controllers/webservice/DatastreamController';
import { progressController } from '../../http/controllers/ProgressController';
import { progressSocketGrantRoute, progressOperationRoutes } from '../../http/progressRoutes';
import { addDataStreamsRoute } from '../../api-routes/groups/records';
import { updateMetaRoute } from '../../api-routes/groups/records';
import type { ExtensionFactory } from '../../extensions';
import type { PortalApplicationContext } from './application';
import { portalHttpPlan, portalHttpSettings } from './httpPlan';
import { portalReferenceControllers } from './referenceHttpPlan';
import { coreFallbackReservedPrefixes } from '../../http/fastify/registry';
import { z } from 'zod';
import { portalHttpOwnerDeclarations } from '../../http/ownedRoutes';
import { progressSocketHttpOwners } from '../../http/integrations/progressSockets';
import type {
  ProductionApiRouteOptions,
  ProductionExtensionResolutionOptions,
  ProductionRoutingOptions,
  ProductionNamespaceConfiguration,
} from './compositionInputs';

export interface PortalFastifySelection {
  readonly declarations: readonly ApiRouteSource[];
  /** Institution/core overlaps require named intent, checked against the native router. */
  readonly routePrecedence?: readonly import('../../http/fastify/routes').RoutePrecedence[];
  /** Select the owned Socket.IO progress channel and its grant endpoint. */
  readonly progress?: boolean;
  /** Browser controller families and reusable rendering infrastructure. */
  readonly pages?: PortalPageOptions;
  readonly actions?: Readonly<Record<string, import('../../http/actions/configuredActions').ConfiguredAction>>;
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
  const progress = input.progress || input.declarations.some(route => route.controller === progressController.name);
  const plan = portalHttpPlan(context, input);
  const settings = portalHttpSettings(context.config, input);
  const upload = input.declarations.some(
    route => route.controller === addDataStreamsRoute.controller && route.action === addDataStreamsRoute.action
  );
  const brandingUpload = input.declarations.some(route =>
    brandingUploadRoutes.some(item => item.controller === route.controller && item.action === route.action)
  );
  const tusUpload = input.declarations.some(
    route => route.method === 'all' && resumableUploadRoutes.some(item => item.path === route.path)
  );
  const resumableInput = {
    rootContext: context.config.server.rootContext,
    get resumable() {
      return raw!.resumable;
    },
  };
  const brandingUploadInput: import('../../http/actions/brandingUploads').BrandingUploadInput = {
    log: context.log,
    faceMaxBytes: context.config.branding.typefaceFaceMaxBytes,
    get branding() {
      return context.data.reference.branding.get();
    },
    get logos() {
      return raw!.logos;
    },
    get staging() {
      return context.data.disks.get().stagingDisk();
    },
    get multipart(): import('../../http/integrations/multipart').StreamingMultipart {
      return raw!.multipart;
    },
    audit: (actor: { id: string; username: string }, action: string, details: { brandId: string }) =>
      context.data.users.get().addUserAuditEvent({ ...actor }, action, details),
  };
  // Bind the module offline, but select its resources only after route replacement.
  let raw: PortalRawHttp | undefined;
  let pages: PortalPages | undefined;
  const pageDeclaration = input.pages
    ? {
        name: 'portal-pages',
        requires: [
          context.data.reference.appConfigs.declaration.name,
          context.data.reference.entries.declaration.name,
          context.data.reference.translation.declaration.name,
          context.data.reference.branding.declaration.name,
          context.data.reference.forms.declaration.name,
          context.data.reference.types.declaration.name,
          context.data.reference.workflows.declaration.name,
          context.data.reference.dashboards.declaration.name,
          context.data.reference.reports.declaration.name,
          context.data.records.declaration.name,
          context.data.disks.declaration.name,
          context.data.reference.sanitizer.declaration.name,
          context.data.reference.typeface.declaration.name,
        ],
        create: () => pages!,
      }
    : undefined;
  const pageInput = {
    get rendering() {
      return pages!.rendering;
    },
    csrfToken: (request: import('fastify').FastifyRequest) => pages!.csrfToken(request),
  };
  const browser = input.pages
    ? {
        pages: pageInput,
        get authentication() {
          return pages!.authentication;
        },
      }
    : undefined;
  const rawDeclaration =
    upload || brandingUpload || tusUpload || progress || context.config.companion.enabled
      ? {
          name: 'portal-raw-http',
          requires: [
            context.data.records.declaration.name,
            context.data.disks.declaration.name,
            context.data.datastream.declaration.name,
            context.data.progress.declaration.name,
            context.data.users.declaration.name,
            ...(brandingUpload
              ? [context.data.reference.sanitizer.declaration.name, context.data.reference.branding.declaration.name]
              : []),
          ],
          create: () => raw!,
        }
      : undefined;
  const readTargets = new Set(
    input.declarations
      .filter(route =>
        [...recordQueryReadDeclarations, ...datastreamReadRoutes].some(
          read => read.method === route.method && read.path === route.path
        )
      )
      .map(route => route.controller)
  );
  const uploadInputs = upload
    ? {
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
        get multipart(): import('../../http/integrations/multipart').StreamingMultipart {
          return raw!.multipart;
        },
      }
    : undefined;
  const identityTargets = new Set(
    input.declarations
      .filter(route =>
        identityAdministrationDeclarations.some(
          identity => identity.method === route.method && identity.path === route.path
        )
      )
      .map(route => route.controller)
  );
  const mutationTargets = new Set(
    input.declarations
      .filter(
        route =>
          mutationDeclarations.some(write => write.method === route.method && write.path === route.path) &&
          !(route.controller === updateMetaRoute.controller && route.action === updateMetaRoute.action)
      )
      .map(route => route.controller)
  );
  const integrationTargets = new Set(
    input.declarations
      .filter(route => integrationDeclarations.some(item => item.method === route.method && item.path === route.path))
      .map(route => route.controller)
  );
  if (browser) {
    for (const name of ['RecordController', 'AppConfigController', 'DashboardConfigController', 'ReportController'])
      mutationTargets.add(name);
    for (const name of ['UserController', 'VocabularyController', 'BrandingController']) integrationTargets.add(name);
    identityTargets.add('AdminController');
    for (const name of ['ExportController', 'RecordAuditController']) readTargets.add(name);
  }
  if (tusUpload) mutationTargets.add('RecordController');
  if (brandingUpload)
    for (const route of brandingUploadRoutes)
      if (input.declarations.some(item => item.controller === route.controller))
        integrationTargets.add(route.controller);
  const mutations = portalMutationControllers(
    context,
    mutationTargets,
    input.actions ?? {},
    uploadInputs,
    browser,
    tusUpload ? resumableInput : undefined
  );
  const assetCache = new BrandingDeliveryCache();
  const identities = portalIdentityControllers(
    context,
    new Set([...identityTargets].filter(name => !integrationTargets.has(name))),
    assetCache,
    browser
  );
  const integrations = portalIntegrationControllers(
    context,
    integrationTargets,
    assetCache,
    browser,
    input.pages
      ? {
          get delivery() {
            return pages!.delivery;
          },
        }
      : undefined,
    brandingUpload ? brandingUploadInput : undefined
  );
  const reads = portalReadControllers(
    context,
    new Set(
      [...readTargets].filter(
        name => !identityTargets.has(name) && !mutationTargets.has(name) && !integrationTargets.has(name)
      )
    ),
    uploadInputs,
    browser
  );
  const reference = portalReferenceControllers(
    context,
    new Set(
      input.declarations
        .map(route => route.controller)
        .filter(name => !readTargets.has(name) && !mutationTargets.has(name) && !integrationTargets.has(name))
    )
  );
  const recordFactory = upload ? datastreamController : recordController;
  const metadataOnly =
    input.declarations.some(route => route.controller === recordController.name) &&
    !readTargets.has(recordController.name) &&
    !mutationTargets.has(recordController.name);
  const coreRoutes = [
    ...apiRouteRegistrations({
      declarations: [
        ...input.declarations,
        ...(progress
          ? [...progressOperationRoutes, progressSocketGrantRoute]
              .filter(
                route =>
                  !input.declarations.some(selected => selected.method === route.method && selected.path === route.path)
              )
              .map(route => ({ ...route, responses: {} }))
          : []),
      ],
      configuration: plan.policyConfiguration,
      provider: '@researchdatabox/redbox-core',
    } satisfies ProductionApiRouteOptions).map(route => ({
      ...route,
      effectiveCsrf: uploadDeclarations.some(item => route.declaration.name === coreRouteName(item.method, item.path))
        ? brandingUploadRoutes.some(item => route.declaration.name === coreRouteName(item.method, item.path)) &&
          route.declaration.path.includes('/app/')
          ? 'protect'
          : 'apiProtect'
        : (route.declaration.api?.controller === updateMetaRoute.controller &&
              [updateMetaRoute.action, addDataStreamsRoute.action].includes(route.declaration.api?.action ?? '')) ||
            (progress &&
              route.declaration.api?.controller === progressSocketGrantRoute.controller &&
              route.declaration.method !== 'get')
          ? 'apiProtect'
          : integrationDeclarations.some(item => route.declaration.name === coreRouteName(item.method, item.path))
            ? route.declaration.method === 'get'
              ? 'none'
              : route.declaration.path.includes('/api/')
                ? 'apiProtect'
                : 'protect'
            : mutationDeclarations.some(write => route.declaration.name === coreRouteName(write.method, write.path))
              ? route.declaration.path.includes('/api/')
                ? 'apiProtect'
                : 'protect'
              : identityAdministrationDeclarations.some(
                    identity => route.declaration.name === coreRouteName(identity.method, identity.path)
                  )
                ? route.declaration.controller === 'webservice/AdminController'
                  ? route.declaration.action === 'getAppConfig'
                    ? 'none'
                    : 'apiProtect'
                  : route.declaration.method === 'get'
                    ? 'none'
                    : route.declaration.path.includes('/api/')
                      ? 'apiProtect'
                      : 'protect'
                : recordQueryReadDeclarations.some(
                      read => read.method === 'post' && route.declaration.name === coreRouteName(read.method, read.path)
                    )
                  ? route.declaration.path.includes('/api/')
                    ? 'apiProtect'
                    : 'protect'
                  : 'none',
    })),
    ...(input.pages
      ? [
          ...[...brandingDeliveryRoutes, fontDeliveryRoute, ...dynamicAssetRoutes].map(route => {
            const mandatory =
              route === fontDeliveryRoute
                ? []
                : dynamicAssetRoutes.includes(route as (typeof dynamicAssetRoutes)[number])
                  ? [
                      'nocache',
                      'brandingandportal',
                      'browseractor',
                      ...(route.action === 'get' ? [] : ['browserauthenticated', 'brandactor']),
                      'checkauth',
                    ]
                  : ['brandingandportal', 'browseractor', 'checkauth'];
            return {
              provider: '@researchdatabox/redbox-core',
              declaration: {
                ...route,
                name: coreRouteName(route.method, route.path),
                access: mandatory.length
                  ? { kind: 'policies' as const, names: mandatory as [string, ...string[]] }
                  : { kind: 'public' as const },
              },
              effectivePolicies:
                route === fontDeliveryRoute
                  ? []
                  : [...new Set([...mandatory, ...resolveEffectivePolicies(route, plan.policyConfiguration)])],
              effectiveCsrf: brandingDeliveryRoutes.includes(route as (typeof brandingDeliveryRoutes)[number])
                ? 'protect except GET/HEAD/OPTIONS'
                : 'none',
            };
          }),
          ...authenticationRoutes.map(route => ({
            provider: '@researchdatabox/redbox-core',
            declaration: {
              name: coreRouteName(route.method, route.path),
              ...route,
              access: { kind: 'public' as const },
            },
            effectivePolicies: [],
            effectiveCsrf:
              route.action === 'localLogin' || (route.action === 'logout' && route.method === 'post')
                ? 'protect'
                : 'none',
          })),
          ...pageRoutes.map(route => {
            const mandatory = [
              'nocache',
              'brandingandportal',
              'browseractor',
              ...(route.access === 'public' ? [] : ['browserauthenticated', 'brandactor']),
              'checkauth',
            ];
            const effectivePolicies = [
              ...new Set([...mandatory, ...resolveEffectivePolicies(route, plan.policyConfiguration)]),
            ];
            return {
              provider: '@researchdatabox/redbox-core',
              declaration: {
                name: coreRouteName(route.method, route.path),
                method: route.method,
                path: route.path,
                controller: route.controller,
                action: route.action,
                access: {
                  kind: 'policies' as const,
                  names: [mandatory[0], ...mandatory.slice(1)] as [string, ...string[]],
                },
              },
              effectivePolicies,
              effectiveCsrf: 'protect except GET/HEAD/OPTIONS',
            };
          }),
          {
            provider: '@researchdatabox/redbox-core',
            declaration: {
              name: coreRouteName('all', '/'),
              method: 'all' as const,
              path: '/',
              controller: pageRootController.name,
              action: 'redirect',
              access: { kind: 'public' as const },
            },
            effectivePolicies: [],
            effectiveCsrf: 'none',
          },
        ]
      : []),
  ];
  // Browser pages precede crossed parameterized API aliases in retained Express.
  // Order the selected declarations by the frozen, source-derived precedence
  // graph; the router still proves each named overlap against find-my-way.
  if (input.pages) {
    const remaining = [...coreRoutes];
    const ordered: typeof coreRoutes = [];
    while (remaining.length) {
      const index = remaining.findIndex(
        route =>
          !coreRoutePrecedence.some(
            edge =>
              edge.over === route.declaration.name &&
              remaining.some(candidate => candidate.declaration.name === edge.winner)
          )
      );
      if (index < 0) throw new TypeError('Core browser precedence contains a cycle.');
      ordered.push(...remaining.splice(index, 1));
    }
    coreRoutes.splice(0, coreRoutes.length, ...ordered);
  }
  const bindings = Object.freeze([
    ...(metadataOnly
      ? [
          upload
            ? bindControllerFactory(datastreamController, uploadInputs!)
            : bindControllerFactory(recordController, plan.metadata),
        ]
      : []),
    ...(progress
      ? [
          bindControllerFactory(progressController, {
            get sockets() {
              return raw!.sockets;
            },
            get progress() {
              return context.data.progress.get();
            },
            get records() {
              return context.data.records.get();
            },
            audit: (actor, action, details) =>
              context.data.users.get().addUserAuditEvent({ ...actor }, action, details),
            log: context.log,
          }),
        ]
      : []),
    ...(input.pages
      ? [
          bindControllerFactory(dynamicAssetController, {
            get dynamic() {
              return pages!.dynamic;
            },
          }),
          bindControllerFactory(pageController, pageInput),
          bindControllerFactory(namedQueryPageController, { browser: browser! }),
          bindControllerFactory(reportsPageController, { browser: browser! }),
          bindControllerFactory(pageRootController, {
            rootContext: context.config.server.rootContext,
            landingPath: context.config.page.landingPath,
          }),
        ]
      : []),
    ...reference.bindings,
    ...reads.bindings,
    ...identities.bindings,
    ...mutations.bindings,
    ...integrations.bindings,
    ...(input.bindings?.(context) ?? []),
  ]);
  const selected = new Set(coreRoutes.map(route => route.declaration.name));
  const routing = Object.freeze({
    rootContext: context.config.server.rootContext,
    policyNames: nativePolicyNames,
    legacyOrder: true,
    precedence: Object.freeze([
      ...coreRoutePrecedence.filter(entry => selected.has(entry.winner) && selected.has(entry.over)),
      ...(input.routePrecedence ?? []),
    ]),
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
          modules: [
            ...context.plans.map(plan => plan.declaration),
            ...(rawDeclaration ? [rawDeclaration] : []),
            ...(pageDeclaration ? [pageDeclaration] : []),
          ],
          controllers: [
            ...(input.pages
              ? [
                  pageController,
                  pageRootController,
                  namedQueryPageController,
                  reportsPageController,
                  dynamicAssetController,
                ]
              : []),
            ...(metadataOnly ? [recordFactory] : []),
            ...reads.controllers,
            ...reference.controllers,
            ...identities.controllers,
            ...mutations.controllers,
            ...integrations.controllers,
            ...(progress ? [progressController] : []),
          ],
        },
      },
      ...installed.providers,
    ],
    {
      hookLoadPriority: installed.hookLoadPriority,
      bindings,
      coreRoutes,
      routing,
      orderRoutesByPrecedence: !!input.routePrecedence?.length,
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
    downloads: Object.freeze(
      [...new Set(datastreamReadRoutes.flatMap(routesFor))].filter(route => route.declaration.method !== 'all')
    ),
    uploads: routesFor(addDataStreamsRoute),
    brandingUploads: Object.freeze([...new Set(brandingUploadRoutes.flatMap(routesFor))]),
    resumableUploads: Object.freeze(
      [...new Set(resumableUploadRoutes.flatMap(routesFor))].filter(route => route.declaration.method === 'all')
    ),
    progress: Object.freeze([...new Set([progressSocketGrantRoute, ...progressOperationRoutes].flatMap(routesFor))]),
    metadataUpdates: routesFor(updateMetaRoute),
    schemaReads: Object.freeze(recordSchemaReadRoutes.flatMap(routesFor)),
    mutations: Object.freeze([
      ...new Set(
        mutationDeclarations
          .filter(
            route => !(route.controller === updateMetaRoute.controller && route.action === updateMetaRoute.action)
          )
          .flatMap(routesFor)
      ),
    ]),
    integrations: Object.freeze([...new Set(integrationDeclarations.flatMap(routesFor))]),
    identities: Object.freeze([...new Set(identityAdministrationDeclarations.flatMap(routesFor))]),
  });
  if (input.pages) pages = new PortalPages(context, appPath, resolved, input.pages, assetCache);
  if (rawDeclaration)
    raw = new PortalRawHttp(
      context,
      httpOwners.uploads.length > 0 || httpOwners.brandingUploads.length > 0,
      httpOwners.progress.length > 0,
      httpOwners.resumableUploads.length > 0,
      httpOwners.brandingUploads.length > 0
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
    downloadInput: reads.downloads,
    brandingUploadInput,
    ownership: {
      declarations: portalHttpOwnerDeclarations(context.config, [
        ...progressSocketHttpOwners(new URL(context.config.server.publicUrl).origin, !!raw?.progress),
        ...(context.config.companion.enabled
          ? [
              {
                route: { method: 'all', path: context.config.companion.server.path + '/*transportPath' },
                csrf: 'none' as const,
                actorRequired: false,
                rawTarget: true,
                selected: true,
              },
            ]
          : []),
      ]),
      configuration: plan.policyConfiguration,
    },
    raw,
    pages,
    pageDeclaration,
    assetCache,
    rawDeclaration,
    httpOwners,
    actionPreparation: { applies: integrations.hasPreparation, run: integrations.prepareRequest },
    bindings,
    routing,
    policyConfiguration: plan.policyConfiguration,
    portals: Object.freeze([...settings.portals]),
    fallbackReservedPrefixes,
    namespaceConfiguration,
    hookLoadPriority: Object.freeze([...installed.hookLoadPriority]),
    scope: Object.freeze({
      included: Object.freeze([...selected]),
      excluded: 'All other unselected core families',
    }),
  });
}
export type ResolvedPortalInstallation = Awaited<ReturnType<typeof resolvePortalInstallation>>;
