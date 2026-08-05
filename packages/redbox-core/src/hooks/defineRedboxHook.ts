import '../sails';
import type { ApiRouteDefinition } from '../api-routes';

type HookFactoryResult = {
  defaults?: Record<string, unknown>;
  routes?: unknown;
  configure?: () => void;
  initialize?: (done?: (error?: Error) => void) => Promise<void>;
};

export type HookRegistrationMap = Record<string, unknown>;

type HookDone = (error?: Error) => void;
type HookInitializer = (sails: Sails.Application, done: HookDone) => void | Promise<void>;

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
      hook.routes = typeof options.routes === 'function' ? options.routes(sails) : options.routes;
    }

    if (options.configure) {
      hook.configure = (): void => {
        options.configure?.(sails);
      };
    }

    const initializer = options.initialize;
    if (initializer) {
      hook.initialize = async (done?: HookDone): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
          let settled = false;
          const initializerDone = (error?: unknown): void => {
            if (settled) {
              return;
            }
            settled = true;

            if (error !== undefined) {
              const normalizedError = error instanceof Error ? error : new Error(String(error));
              if (done) {
                done(normalizedError);
                resolve();
              } else {
                reject(normalizedError);
              }
              return;
            }

            done?.();
            resolve();
          };

          try {
            const result = initializer(sails, initializerDone);
            if (result && typeof result.then === 'function') {
              void Promise.resolve(result).then(() => initializerDone(), initializerDone);
            }
          } catch (error) {
            initializerDone(error);
          }
        });
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
