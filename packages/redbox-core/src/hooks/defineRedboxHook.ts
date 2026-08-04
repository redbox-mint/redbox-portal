import '../sails';
import type { ApiRouteDefinition } from '../api-routes';

type HookFactoryResult = {
  defaults?: Record<string, unknown>;
  routes?: unknown;
  configure?: () => void;
  initialize?: () => Promise<void>;
};

export type HookRegistrationMap = Record<string, unknown>;

type HookInitializer = {
  (sails: Sails.Application): void | Promise<void>;
  (sails: Sails.Application, done: (error?: Error) => void): void;
};

export type DefineRedboxHookOptions = {
  defaults?: Record<string, unknown>;
  routes?: ((sails: Sails.Application) => unknown) | unknown;
  configure?: (sails: Sails.Application) => void;
  initialize?: HookInitializer;
  registerRedboxConfig?: () => HookRegistrationMap;
  registerHookApiRoutes?: () => readonly ApiRouteDefinition[];
  registerRedboxControllers?: () => HookRegistrationMap;
  registerRedboxWebserviceControllers?: () => HookRegistrationMap;
  registerRedboxServices?: () => HookRegistrationMap;
  registerRedboxFormConfigs?: () => HookRegistrationMap;
  additionalExports?: Record<string, unknown>;
};

type DefinedRedboxHook = ((sails: Sails.Application) => HookFactoryResult) & {
  registerRedboxConfig?: () => HookRegistrationMap;
  registerHookApiRoutes?: () => readonly ApiRouteDefinition[];
  registerRedboxControllers?: () => HookRegistrationMap;
  registerRedboxWebserviceControllers?: () => HookRegistrationMap;
  registerRedboxServices?: () => HookRegistrationMap;
  registerRedboxFormConfigs?: () => HookRegistrationMap;
  registerFormConfig?: () => HookRegistrationMap;
} & Record<string, unknown>;

export function defineRedboxHook(options: DefineRedboxHookOptions): DefinedRedboxHook {
  const hookFactory = ((sails: Sails.Application): HookFactoryResult => {
    const hook: HookFactoryResult = {
      defaults: options.defaults ?? {},
    };

    if (options.routes) {
      hook.routes = typeof options.routes === 'function'
        ? options.routes(sails)
        : options.routes;
    }

    if (options.configure) {
      hook.configure = (): void => {
        options.configure?.(sails);
      };
    }

    if (options.initialize) {
      hook.initialize = async (): Promise<void> => {
        const initializer = options.initialize as HookInitializer;

        // Sails supports Promise-returning initializers, but its default
        // implementation sniffing also supports the older callback form.
        // Keep accepting both forms while always exposing a zero-argument
        // Promise-returning hook to Sails.
        if (initializer.length >= 2) {
          await new Promise<void>((resolve, reject) => {
            const done = (error?: Error): void => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            };

            try {
              initializer(sails, done);
            } catch (error) {
              reject(error);
            }
          });
          return;
        }

        await initializer(sails);
      };
    }

    return hook;
  }) as DefinedRedboxHook;

  if (options.registerRedboxConfig) {
    hookFactory.registerRedboxConfig = options.registerRedboxConfig;
  }

  if (options.registerHookApiRoutes) {
    hookFactory.registerHookApiRoutes = options.registerHookApiRoutes;
  }

  if (options.registerRedboxControllers) {
    hookFactory.registerRedboxControllers = options.registerRedboxControllers;
  }

  if (options.registerRedboxWebserviceControllers) {
    hookFactory.registerRedboxWebserviceControllers = options.registerRedboxWebserviceControllers;
  }

  if (options.registerRedboxServices) {
    hookFactory.registerRedboxServices = options.registerRedboxServices;
  }

  if (options.registerRedboxFormConfigs) {
    hookFactory.registerRedboxFormConfigs = options.registerRedboxFormConfigs;
    hookFactory.registerFormConfig = options.registerRedboxFormConfigs;
  }

  Object.assign(hookFactory, options.additionalExports);

  return hookFactory;
}

export default defineRedboxHook;
