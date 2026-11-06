import type { Application } from '../../application';
import type { ResolvedRegistration } from '../../extensions/resolution';
import type { ControllerRegistration } from '../contracts';
import type { BoundControllerFactory } from '../controllers';
import { FastifyHost, type FastifyHostOptions } from './FastifyHost';
import { composeControllers } from './registration';
import { composeRoutes, type RouteGuards, type RouteRegistration } from './routes';

/** Internal prototype inputs, not an extension loader or production host selector. */
export interface ControllerHostOptions extends Omit<FastifyHostOptions, 'prepare'> {
  readonly controllers: readonly ResolvedRegistration<ControllerRegistration>[];
  readonly bindings: readonly BoundControllerFactory[];
  readonly moduleNames?: readonly string[];
  readonly routes: readonly RouteRegistration[];
  readonly routing: Parameters<typeof composeRoutes>[1];
  readonly guards: RouteGuards;
}

/** Resolve declarations offline, then construct actions in the sealed, owned host stage.
 * Guards remain explicit: this stage does not implement the FM-016 security pipeline.
 */
export async function createControllerHost(
  application: Application,
  options: ControllerHostOptions
): Promise<FastifyHost> {
  const { controllers, bindings, moduleNames, routes, routing, guards, ...hostOptions } = options;
  const routePlan = await composeRoutes(routes, routing);
  const controllerPlan = composeControllers(
    controllers,
    bindings,
    routePlan.routes.map(route => route.declaration),
    moduleNames
  );
  return new FastifyHost(application, {
    ...hostOptions,
    prepare: async app => {
      routePlan.install(app, controllerPlan.instantiate(), guards);
    },
  });
}
