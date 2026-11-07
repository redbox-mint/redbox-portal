import type { Application } from '../../application';
import type { ResolvedRegistration } from '../../extensions/resolution';
import type { ControllerRegistration } from '../contracts';
import type { BoundControllerFactory } from '../controllers';
import { FastifyHost, type FastifyHostOptions } from './FastifyHost';
import { composeControllers } from './registration';
import { composeRoutes, type RouteGuards, type RouteRegistration } from './routes';
import { bindNativeRouteSecurity, type NativePolicy } from './policies';
import type { createNativeCsrf } from './csrf';
import { installSafeHttpErrors, type SafeHttpObservers } from './responses';
import { prepareNativeParsers, type NativeParserOptions } from './parsers';
import type { FastifyPreparation } from './preparation';
import { httpReplySubmitted } from './errorBoundary';

/** Internal prototype inputs, not an extension loader or production host selector. */
export interface ControllerHostOptions extends Omit<FastifyHostOptions, 'prepare'> {
  readonly controllers: readonly ResolvedRegistration<ControllerRegistration>[];
  readonly bindings: readonly BoundControllerFactory[];
  readonly moduleNames?: readonly string[];
  readonly routes: readonly RouteRegistration[];
  readonly routing: Parameters<typeof composeRoutes>[1];
  /** Additional action preludes; native route security always runs first. */
  readonly guards?: RouteGuards;
  readonly security?: {
    readonly policies: Readonly<Record<string, NativePolicy>>;
    readonly csrf: Pick<ReturnType<typeof createNativeCsrf>, 'protect' | 'apiProtect' | 'token'>;
    readonly observers?: SafeHttpObservers;
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
  const { controllers, bindings, moduleNames, routes, routing, guards, security, ...hostOptions } = options;
  const routePlan = await composeRoutes(routes, routing);
  if (
    !security &&
    routePlan.routes.some(
      route =>
        route.effectivePolicies.length ||
        route.declaration.csrf ||
        (route.effectiveCsrf && route.effectiveCsrf !== 'none')
    )
  )
    throw new TypeError('Protected controller routes require native security bindings.');
  const securityGuard = security && bindNativeRouteSecurity(routePlan, security.policies, security.csrf);
  const controllerPlan = composeControllers(
    controllers,
    bindings,
    routePlan.routes.map(route => route.declaration),
    moduleNames
  );
  return new FastifyHost(application, {
    ...hostOptions,
    prepare: async app => {
      // Public-only compositions need the same safe parser/error boundary.
      installSafeHttpErrors(app, security?.observers);
      prepareNativeParsers(app, security?.parsers);
      await security?.prepare?.(app);
      routePlan.install(app, controllerPlan.instantiate(), async (binding, request, reply) => {
        await securityGuard?.(binding, request, reply);
        if (httpReplySubmitted(reply)) return reply;
        await guards?.(binding, request, reply);
        if (httpReplySubmitted(reply)) return reply;
      });
    },
  });
}
