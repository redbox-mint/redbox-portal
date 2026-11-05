import { isPromise } from 'node:util/types';
import { ExtensionError } from '../../extensions/loading';
import type { ResolvedRegistration } from '../../extensions/resolution';
import type {
  ControllerAction,
  ControllerRegistration,
  ControllerTarget,
  ForbiddenControllerAction,
} from '../contracts';
import type { BoundControllerFactory } from '../controllers';

const forbiddenActions: ReadonlySet<ForbiddenControllerAction | string> = new Set([
  'constructor',
  'prototype',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
]);
const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
const actionIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]{0,99}$/;

function fail(provider: string, detail: string): never {
  throw new ExtensionError(provider, detail);
}

function validate({ provider, declaration }: ResolvedRegistration<ControllerRegistration>): void {
  if (
    !declaration ||
    typeof declaration.name !== 'string' ||
    !identifier.test(declaration.name) ||
    typeof declaration.create !== 'function'
  )
    fail(provider, 'controller requires a bounded name and factory');
  if (!Array.isArray(declaration.actions))
    fail(provider, `controller ${declaration.name} requires an action allowlist`);
  const actions = new Set<string>();
  for (const action of declaration.actions) {
    if (typeof action !== 'string' || !actionIdentifier.test(action) || forbiddenActions.has(action))
      fail(provider, `controller ${declaration.name} has a forbidden action`);
    if (actions.has(action)) fail(provider, `controller ${declaration.name} has duplicate actions`);
    actions.add(action);
  }
  if (declaration.replaces !== undefined && declaration.replaces !== true)
    fail(provider, `controller ${declaration.name} has invalid replaces`);
  if (
    declaration.requires !== undefined &&
    (!Array.isArray(declaration.requires) ||
      declaration.requires.some(name => typeof name !== 'string' || !identifier.test(name)))
  )
    fail(provider, `controller ${declaration.name} has invalid module prerequisites`);
}

/** Look up only explicitly declared names, including deliberate inheritance. Never invoke accessors. */
function bindAction(instance: object, action: string, provider: string, controller: string): ControllerAction {
  let current: object | null = instance;
  while (current && current !== Object.prototype && current !== Function.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(current, action);
    if (descriptor) {
      const value: unknown = descriptor.value;
      if (typeof value !== 'function') break;
      // The sole action-signature erasure boundary. The selected instance supplies `this`;
      // author-side fixtures verify concrete Fastify route generics before collection erasure.
      return (value as ControllerAction).bind(instance);
    }
    current = Object.getPrototypeOf(current);
  }
  return fail(provider, `controller ${controller} action ${action} is missing or non-callable`);
}

export interface ResolvedControllerInstance extends ResolvedRegistration<ControllerRegistration> {
  readonly instance: object;
  readonly actions: ReadonlyMap<string, ControllerAction>;
}

export interface ControllerInstances {
  readonly controllers: readonly ResolvedControllerInstance[];
  action(target: ControllerTarget): ControllerAction;
}

export interface ControllerComposition {
  readonly controllers: readonly ResolvedRegistration<ControllerRegistration>[];
  /** Invoke after application initialization, before Fastify ready/listen. Joined, including failure. */
  instantiate(): ControllerInstances;
}

/**
 * Internal composition for the new host. Registrations arrive in resolved low-to-high
 * provider order (core first). API2 loading/provider ordering and route normalization
 * are separate stages; this function does not load extensions or install routes.
 */
export function composeControllers(
  registrations: readonly ResolvedRegistration<ControllerRegistration>[],
  bindings: readonly BoundControllerFactory[],
  targets: readonly ControllerTarget[],
  moduleNames: readonly string[] = []
): ControllerComposition {
  const selected = new Map<string, ResolvedRegistration<ControllerRegistration>>();
  const declarations = new Set<ControllerRegistration>();
  const providerNames = new Map<string, Set<string>>();
  for (const registration of registrations) {
    validate(registration);
    const { provider, declaration } = registration;
    const names = providerNames.get(provider) ?? new Set<string>();
    if (names.has(declaration.name)) fail(provider, `duplicate controller ${declaration.name} in provider`);
    names.add(declaration.name);
    providerNames.set(provider, names);
    declarations.add(declaration);
    const previous = selected.get(declaration.name);
    if (!!previous !== !!declaration.replaces)
      fail(
        provider,
        previous
          ? `controller ${declaration.name} requires replaces: true`
          : `controller ${declaration.name} replacement has no target`
      );
    if (
      previous &&
      (previous.declaration.actions.length !== declaration.actions.length ||
        previous.declaration.actions.some(action => !declaration.actions.includes(action)))
    )
      fail(provider, `controller ${declaration.name} replacement must preserve action exposure`);
    selected.set(declaration.name, registration);
  }
  const bound = new Map<ControllerRegistration, BoundControllerFactory>();
  for (const binding of bindings) {
    if (typeof binding !== 'function' || !declarations.has(binding.factory))
      fail('host', 'unknown controller binding; bind the declared factory descriptor');
    if (bound.has(binding.factory)) fail('host', `duplicate controller binding ${binding.factory.name}`);
    bound.set(binding.factory, binding);
  }
  for (const { provider, declaration } of selected.values()) {
    if (!bound.has(declaration)) fail(provider, `missing controller binding ${declaration.name}`);
    for (const dependency of declaration.requires ?? [])
      if (!moduleNames.includes(dependency))
        fail(provider, `controller ${declaration.name} requires missing module ${dependency}`);
  }
  const checkTarget = (target: ControllerTarget) => {
    const registration = selected.get(target.controller);
    if (!registration) fail('host', `missing controller ${target.controller}`);
    if (forbiddenActions.has(target.action))
      fail(registration.provider, `controller ${target.controller} has a forbidden action target`);
    if (!registration.declaration.actions.includes(target.action))
      fail(registration.provider, `controller ${target.controller} action ${target.action} is unlisted`);
  };
  targets.forEach(checkTarget);

  const controllers = [...selected.values()];
  let outcome: { result: ControllerInstances } | { error: unknown } | undefined;
  let preparing = false;
  return {
    controllers,
    instantiate() {
      if (outcome) {
        if ('result' in outcome) return outcome.result;
        throw outcome.error;
      }
      if (preparing) fail('host', 'controller preparation is already running');
      preparing = true;
      try {
        const instances = controllers.map(registration => {
          const { provider, declaration } = registration;
          const instance = bound.get(declaration)!();
          if (!instance || typeof instance !== 'object' || Array.isArray(instance) || isPromise(instance))
            fail(provider, `controller ${declaration.name} factory must return an instance synchronously`);
          const actions = new Map(
            declaration.actions.map(action => [action, bindAction(instance, action, provider, declaration.name)])
          );
          return { ...registration, instance, actions };
        });
        const byName = new Map(instances.map(instance => [instance.declaration.name, instance]));
        const result: ControllerInstances = {
          controllers: instances,
          action(target) {
            checkTarget(target);
            return byName.get(target.controller)!.actions.get(target.action)!;
          },
        };
        outcome = { result };
        return result;
      } catch (error) {
        outcome = { error };
        throw error;
      } finally {
        preparing = false;
      }
    },
  };
}
