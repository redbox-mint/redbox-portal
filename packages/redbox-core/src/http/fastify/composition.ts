import {
  prepareDatastreamUploads,
  createDatastreamUploadBoundary,
  type DatastreamUploadBoundaryInput,
} from './datastreamUploads';
import type { Application } from '../../application';
import type { ResolvedRegistration } from '../../extensions/resolution';
import type { HttpHookContribution, HttpFallbackContribution, ControllerRegistration } from '../contracts';
import type { BoundControllerFactory } from '../controllers';
import { FastifyHost, type FastifyHostOptions } from './FastifyHost';
import { composeControllers } from './registration';
import { composeRoutes, type ResolvedHttpRoute, type RouteGuards, type RouteRegistration } from './routes';
import { bindNativeRouteSecurity, type NativePolicy } from './policies';
import type { createNativeCsrf } from './csrf';
import { installSafeHttpErrors, type SafeHttpObservers } from './responses';
import { prepareNativeParsers, type NativeParserOptions } from './parsers';
import type { FastifyPreparation } from './preparation';
import { httpReplySubmitted } from './errorBoundary';
import { composeHttpHooks } from './hooks';
import { composeHttpFallbacks } from './fallbacks';
import { validateRouteRequest } from './validation';
import { HttpRouteRegistry, type CoreNamespaceConfiguration } from './registry';

/** Internal prototype inputs, not an extension loader or production host selector. */
export interface ControllerHostOptions extends Omit<FastifyHostOptions, 'prepare'> {
  /** An already validated installation; no second selection/composition occurs. */
  readonly rawUploadRoutes?: readonly ResolvedHttpRoute[];
  /** Canonical production ports; controller replacement cannot replace the host guard. */
  rawUploadInput?(): DatastreamUploadBoundaryInput;
  prepareIntegrations?(server: import('node:http').Server): Promise<void>;
  readonly composition?: Pick<
    Awaited<ReturnType<typeof import('../../extensions/v2').resolveExtensionsV2>>,
    'routePlan' | 'controllerPlan' | 'hookPlan' | 'fallbackPlan' | 'registry'
  >;
  readonly controllers: readonly ResolvedRegistration<ControllerRegistration>[];
  readonly bindings: readonly BoundControllerFactory[];
  readonly moduleNames?: readonly string[];
  readonly routes: readonly RouteRegistration[];
  readonly hooks?: readonly ResolvedRegistration<HttpHookContribution>[];
  readonly fallbacks?: readonly ResolvedRegistration<HttpFallbackContribution>[];
  /** Complete static/asset/integration mount roots, relative to rootContext. */
  readonly fallbackReservedPrefixes?: readonly string[];
  readonly namespaceConfiguration?: CoreNamespaceConfiguration;
  readonly routing: Parameters<typeof composeRoutes>[1];
  /** Additional action preludes; native route security always runs first. */
  readonly guards?: RouteGuards;
  /** Declaration-derived preparation runs once after hooks, before final validation. */
  readonly actionPreparation?: {
    applies(binding: Parameters<RouteGuards>[0]): boolean;
    readonly run: RouteGuards;
  };
  readonly security?: {
    readonly policies: Readonly<Record<string, NativePolicy>>;
    readonly csrf: Pick<ReturnType<typeof createNativeCsrf>, 'protect' | 'apiProtect' | 'token'>;
    readonly observers?: SafeHttpObservers;
    /** Explicit route-specific brand/authentication prelude. Never infers unmatched context. */
    resolveContext?: RouteGuards;
    readonly parsers?: NativeParserOptions;
    /** Session/authentication transport preparation, after application initialization. */
    prepare?(app: FastifyPreparation): Promise<void>;
  };
}

/** Resolve declarations and security offline, then prepare native transport and
 * construct actions in the sealed, owned host stage. */
export async function createControllerHost(
  application: Application,
  options: ControllerHostOptions
): Promise<FastifyHost> {
  const {
    composition,
    rawUploadRoutes = [],
    rawUploadInput,
    prepareIntegrations,
    controllers,
    bindings,
    moduleNames,
    routes,
    routing,
    guards,
    actionPreparation,
    security,
    hooks = [],
    fallbacks = [],
    fallbackReservedPrefixes,
    namespaceConfiguration,
    ...hostOptions
  } = options;
  const routePlan = composition?.routePlan ?? (await composeRoutes(routes, routing));
  const uploads = new Set(rawUploadRoutes);
  if (uploads.size && !rawUploadInput) throw new TypeError('Raw uploads require host-owned production inputs.');
  const uploadBoundary = rawUploadInput && createDatastreamUploadBoundary(rawUploadInput);
  const registry =
    composition?.registry ??
    new HttpRouteRegistry(routing.rootContext, fallbackReservedPrefixes, namespaceConfiguration, routePlan.targets);
  const fallbackPlan = composition?.fallbackPlan ?? composeHttpFallbacks(fallbacks, routePlan, routing, registry);
  const allRoutes = [...routePlan.routes, ...fallbackPlan.routes];
  const hookPlan = composition?.hookPlan ?? composeHttpHooks(hooks, routePlan.targets);
  if (
    !security &&
    allRoutes.some(
      route =>
        route.effectivePolicies.length ||
        route.declaration.csrf ||
        (route.effectiveCsrf && route.effectiveCsrf !== 'none')
    )
  )
    throw new TypeError('Protected controller routes require native security bindings.');
  const securityGuard = security && bindNativeRouteSecurity({ routes: allRoutes }, security.policies, security.csrf);
  const controllerPlan =
    composition?.controllerPlan ??
    composeControllers(
      controllers,
      bindings,
      allRoutes.map(route => route.declaration),
      moduleNames
    );
  return new FastifyHost(application, {
    ...hostOptions,
    routeRegistry: registry,
    prepare: async (root, server) => {
      await prepareIntegrations?.(server);
      // An explicit encapsulation prefix gives this composition its own 404 owner.
      // The root host retains its safe default for requests outside this owner.
      root.register(
        async app => {
          // Public-only compositions need the same safe parser/error boundary.
          installSafeHttpErrors(app, security?.observers);
          prepareNativeParsers(app, security?.parsers);
          const instances = controllerPlan.instantiate();
          if (uploadBoundary) app.addHook('onSend', uploadBoundary.onSend);
          const names = new WeakMap<object, string>();
          const unmatched = new WeakSet<object>();
          const selections = new WeakMap<object, ReturnType<typeof fallbackPlan.select>>();
          hookPlan.install(
            app,
            request =>
              names.get(request) ??
              registry.routeName(request) ??
              (request.routeOptions.config as { redboxRoute?: { route: { declaration: { name: string } } } })
                .redboxRoute?.route.declaration.name
          );
          const afterAuthentication = async (
            name: string,
            binding: Parameters<RouteGuards>[0] | undefined,
            request: Parameters<RouteGuards>[1],
            reply: Parameters<RouteGuards>[2]
          ) => {
            names.set(request, name);
            if (binding && binding.kind !== 'automatic-options')
              await security?.resolveContext?.(binding, request, reply);
            if (httpReplySubmitted(reply)) return reply;
            await hookPlan.run('afterAuthentication', name, request, reply);
            if (httpReplySubmitted(reply)) return reply;
          };
          const guard: RouteGuards = async (binding, request, reply) => {
            await securityGuard?.(binding, request, reply);
            if (httpReplySubmitted(reply)) return reply;
            await guards?.(binding, request, reply);
            if (httpReplySubmitted(reply)) return reply;
            const declaration = binding.route.declaration;
            if (uploads.has(binding.route)) {
              await uploadBoundary!.prelude(request, reply);
              if (httpReplySubmitted(reply)) return reply;
            } else if (!actionPreparation?.applies(binding) && (declaration.api || declaration.validation)) {
              const contract = declaration.api?.request ?? declaration.validation;
              await validateRouteRequest(request, reply, {
                request: contract,
              });
              if (httpReplySubmitted(reply)) return reply;
            }
          };
          const beforeAction = async (
            name: string,
            binding: Parameters<RouteGuards>[0] | undefined,
            request: Parameters<RouteGuards>[1],
            reply: Parameters<RouteGuards>[2]
          ) => {
            try {
              await hookPlan.run('beforeAction', name, request, reply);
            } catch (error) {
              await uploadBoundary?.finish(request, reply);
              throw error;
            }
            if (httpReplySubmitted(reply)) {
              await uploadBoundary?.finish(request, reply);
              return reply;
            }
            if (
              binding &&
              (binding.kind === 'action' || binding.kind === 'implicit-head') &&
              !uploads.has(binding.route) &&
              actionPreparation?.applies(binding)
            ) {
              await actionPreparation.run(binding, request, reply);
              if (httpReplySubmitted(reply)) return reply;
              // Prepared declarations validate the live post-hook inputs here,
              // including for replacement controllers. Other shared actions derive
              // and validate their own live inputs at dispatch, as on Express.
              const declaration = binding.route.declaration;
              if (declaration.api || declaration.validation)
                await validateRouteRequest(request, reply, {
                  request: declaration.api?.request ?? declaration.validation,
                });
            }
          };
          const prepareUnmatched = async (request: Parameters<RouteGuards>[1], reply: Parameters<RouteGuards>[2]) => {
            if (names.has(request) || unmatched.has(request)) return;
            unmatched.add(request);
            const selected = fallbackPlan.select(request);
            selections.set(request, selected);
            if (selected)
              return afterAuthentication(selected.binding.route.declaration.name, selected.binding, request, reply);
            await hookPlan.run('afterAuthentication', undefined, request, reply);
            if (httpReplySubmitted(reply)) return reply;
          };
          registry.bindPipeline({
            unmatched: prepareUnmatched,
            afterAuthentication: (route, binding, request, reply) =>
              afterAuthentication(route.name, binding, request, reply),
            beforeAction: (route, binding, request, reply) => beforeAction(route.name, binding, request, reply),
          });
          await security?.prepare?.(app);
          prepareDatastreamUploads(app, {
            plan: routePlan,
            routes: rawUploadRoutes,
            controllers: {
              action: route => {
                const action = instances.action(route);
                return uploadBoundary && rawUploadRoutes.some(owner => owner.declaration === route)
                  ? uploadBoundary.wrap(action)
                  : action;
              },
            },
            guards: guard,
          });
          app.setNotFoundHandler(async (request, reply) => {
            // A route/fallback may callNotFound; never re-enter accepted portal dispatch.
            await prepareUnmatched(request, reply);
            if (httpReplySubmitted(reply)) return reply;
            const selected = selections.get(request);
            selections.delete(request);
            if (selected) {
              await guard(selected.binding, request, reply);
              if (httpReplySubmitted(reply)) return reply;
              await beforeAction(selected.binding.route.declaration.name, selected.binding, request, reply);
              if (httpReplySubmitted(reply)) return reply;
              return instances.action(selected.binding.route.declaration)(request, reply);
            }
            if (httpReplySubmitted(reply)) return reply;
            return reply.code(404).send({ error: 'not-found' });
          });
        },
        { prefix: '/' }
      );
    },
  });
}
