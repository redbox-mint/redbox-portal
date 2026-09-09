import '../sails';
import type { ApiRouteDefinition } from '../api-routes';
import type { RegisterRedboxActions } from '../action-registry';
import type { RuntimeRecord, RuntimeValue } from '../runtimeValues';

type HookRoutes = RuntimeRecord | RuntimeValue[];

type HookFactoryResult = {
  defaults?: HookRegistrationMap;
  routes?: HookRoutes;
  configure?: () => void;
  initialize?: () => Promise<void>;
};

export type HookRegistrationMap = Record<string, RuntimeValue>;

type HookDone = (error?: Error) => void;

// A single signature, not an overload pair: TypeScript lets an author supply a function that
// declares fewer parameters, so `(sails) => Promise<void>` and `(sails, done) => void` are
// both assignable. An overload pair would reject the callback style outright.
type HookInitializer = (sails: Sails.Application, done: HookDone) => void | Promise<void>;

function normalizeError(error: RuntimeValue): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Declares the capabilities contributed by an installable ReDBox hook.
 *
 * @extensionPoint Pass registration functions to `defineRedboxHook`; the loader calls them during static shim discovery. Registration functions must be deterministic and must not require a lifted Sails application.
 * @remarks Service and controller maps use the core registry names when replacing a core implementation. Hook initializers may use either Promise or callback completion.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Redbox-Loader
 */
export type DefineRedboxHookOptions<AdditionalExports extends HookRegistrationMap = HookRegistrationMap> = {
  defaults?: HookRegistrationMap;
  routes?: ((sails: Sails.Application) => HookRoutes) | HookRoutes;
  configure?: (sails: Sails.Application) => void;
  initialize?: HookInitializer;
  registerRedboxConfig?: () => HookRegistrationMap;
  registerHookApiRoutes?: () => readonly ApiRouteDefinition[];
  registerRedboxControllers?: () => HookRegistrationMap;
  registerRedboxWebserviceControllers?: () => HookRegistrationMap;
  registerRedboxServices?: () => HookRegistrationMap;
  registerRedboxFormConfigs?: () => HookRegistrationMap;
  registerRedboxActions?: RegisterRedboxActions;
  additionalExports?: AdditionalExports;
};

/** The callable hook factory returned by {@link defineRedboxHook}. */
export interface DefinedRedboxHook {
  (sails: Sails.Application): HookFactoryResult;
  registerRedboxConfig?: () => HookRegistrationMap;
  registerHookApiRoutes?: () => readonly ApiRouteDefinition[];
  registerRedboxControllers?: () => HookRegistrationMap;
  registerRedboxWebserviceControllers?: () => HookRegistrationMap;
  registerRedboxServices?: () => HookRegistrationMap;
  registerRedboxFormConfigs?: () => HookRegistrationMap;
  registerRedboxActions?: RegisterRedboxActions;
  registerFormConfig?: () => HookRegistrationMap;
}

export function defineRedboxHook<AdditionalExports extends HookRegistrationMap>(
  options: DefineRedboxHookOptions<AdditionalExports> & { readonly additionalExports: AdditionalExports }
): DefinedRedboxHook & AdditionalExports;
export function defineRedboxHook(options: DefineRedboxHookOptions): DefinedRedboxHook;
export function defineRedboxHook(options: DefineRedboxHookOptions): DefinedRedboxHook {
  const hookFactory: DefinedRedboxHook = (sails: Sails.Application): HookFactoryResult => {
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
      hook.initialize = async (): Promise<void> => {
        // Sails sees a zero-argument Promise initializer, so it never hands the wrapper a
        // callback of its own. Internally the bridge always supplies `done` and also honours a
        // returned promise, so both author styles work without sniffing Function.length -
        // which is inaccurate for default and rest parameters.
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const done = (error?: RuntimeValue): void => {
            if (settled) {
              return;
            }
            settled = true;
            if (error) {
              reject(normalizeError(error));
            } else {
              resolve();
            }
          };

          void new Promise<void>(resolveInvocation => {
            const result = initializer(sails, done);
            if (result && typeof result.then === 'function') {
              void Promise.resolve(result).then(() => done(), done);
            }
            resolveInvocation();
          }).then(undefined, done);
        });
      };
    }

    return hook;
  };

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

  if (options.registerRedboxActions) {
    hookFactory.registerRedboxActions = options.registerRedboxActions;
  }

  return Object.assign(hookFactory, options.additionalExports);
}

export default defineRedboxHook;
