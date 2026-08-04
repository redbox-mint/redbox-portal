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
type PromiseHookInitializer = (sails: Sails.Application) => void | Promise<void>;
type CallbackHookInitializer = (sails: Sails.Application, done: HookDone) => void | Promise<void>;
type HookInitializer = PromiseHookInitializer | CallbackHookInitializer;

const FUNCTION_COMMENT_RX = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm;

function getFunctionParameterList(initializer: HookInitializer): string | undefined {
  const source = Function.prototype.toString.call(initializer).replace(FUNCTION_COMMENT_RX, '');
  const openingParenthesis = source.indexOf('(');
  const arrow = source.indexOf('=>');

  if (openingParenthesis === -1 || (arrow !== -1 && arrow < openingParenthesis)) {
    return undefined;
  }

  let depth = 0;
  let quote: string | undefined;
  let escaped = false;

  for (let index = openingParenthesis; index < source.length; index++) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
    } else if (character === '(') {
      depth++;
    } else if (character === ')') {
      depth--;
      if (depth === 0) {
        return source.slice(openingParenthesis + 1, index);
      }
    }
  }

  return undefined;
}

function hasMultipleParameters(parameterList: string): boolean {
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  let parameterCount = 0;
  let hasParameterText = false;

  for (const character of parameterList) {
    if (quote) {
      hasParameterText = true;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      hasParameterText = true;
    } else if (character === '(' || character === '[' || character === '{') {
      depth++;
      hasParameterText = true;
    } else if (character === ')' || character === ']' || character === '}') {
      depth--;
      hasParameterText = true;
    } else if (character === ',' && depth === 0) {
      if (hasParameterText) {
        parameterCount++;
      }
      hasParameterText = false;
    } else if (!/\s/.test(character)) {
      hasParameterText = true;
    }
  }

  if (hasParameterText) {
    parameterCount++;
  }

  return parameterCount >= 2;
}

function isCallbackInitializer(initializer: HookInitializer): initializer is CallbackHookInitializer {
  if (initializer.length >= 2) {
    return true;
  }

  const parameterList = getFunctionParameterList(initializer);
  return parameterList !== undefined && hasMultipleParameters(parameterList);
}

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
        // Sails supports Promise-returning initializers, but its default
        // implementation sniffing also supports the older callback form.
        // Keep accepting both forms while exposing an async hook that also
        // completes the callback supplied by traditional Sails.
        try {
          if (isCallbackInitializer(initializer)) {
            await new Promise<void>((resolve, reject) => {
              const initializerDone = (error?: Error): void => {
                if (error) {
                  reject(error);
                } else {
                  resolve();
                }
              };

              try {
                const result = initializer(sails, initializerDone);
                void Promise.resolve(result).catch(reject);
              } catch (error) {
                reject(error);
              }
            });
          } else {
            await (initializer as PromiseHookInitializer)(sails);
          }
        } catch (error) {
          if (done) {
            done(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          throw error;
        }

        done?.();
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
