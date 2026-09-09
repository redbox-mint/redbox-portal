import { isPromise, isProxy } from 'node:util/types';
import {
  parseActionDefinition,
  type ActionDefinition,
  type ActionHandler,
  type ActionJsonValue,
  type DeepReadonly,
} from './contracts';
import { compareCodeUnits } from './identifiers';
import { boundedValidationPreflight } from '../boundedValidation';
import { ACTION_CONTRACT_LIMITS } from './limits';
import {
  hasOwnRuntimeProperty,
  isRuntimeArray,
  isRuntimeRecord,
  readRuntimeProperty,
  runtimeFunction,
  type RuntimeFunction,
  type RuntimeValue,
} from '../runtimeValues';

export type ActionRegistrationDescriptor = Omit<ActionDefinition, 'provenance' | 'availability'> & {
  readonly availability?: ActionDefinition['availability'];
};
export type { DeepReadonly } from './contracts';

type MutableActionDescriptorMetadata = Omit<ActionDefinition, 'handler'>;
export type ActionDescriptorMetadata = DeepReadonly<MutableActionDescriptorMetadata>;
export type RegisterRedboxActions = () => readonly ActionRegistrationDescriptor[];

export interface ActionRegistrationSource {
  readonly packageName: string;
  readonly moduleName: string;
  readonly registerRedboxActions: RuntimeFunction;
}

export type ActionRegistryRegistrationErrorCode =
  | 'asynchronous-action-registration'
  | 'duplicate-action-id'
  | 'inconsistent-action-contract-version'
  | 'invalid-action-registration';

export class ActionRegistryRegistrationError extends Error {
  readonly code: ActionRegistryRegistrationErrorCode;

  constructor(code: ActionRegistryRegistrationErrorCode, message: string, cause?: Error) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ActionRegistryRegistrationError';
    this.code = code;
  }
}

interface RegisteredAction {
  readonly descriptor: ActionDescriptorMetadata;
  readonly handler: ActionHandler;
}

function registrationCollection(value: RuntimeValue): readonly RuntimeValue[] {
  // Reject even revoked proxies before Array.isArray or any reflection.
  if (isProxy(value) || !isRuntimeArray(value)) throw new Error('Invalid collection.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) throw new Error('Invalid collection.');
  const length = value.length;
  if (length > ACTION_CONTRACT_LIMITS.maxValidationWork) throw new Error('Invalid collection.');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) throw new Error('Invalid collection.');
  const registrations: RuntimeValue[] = [];
  // Read only own data descriptors, never the supplied iterator or element getters.
  // Exact key count plus dense indices excludes extra, hidden and symbol keys.
  for (let index = 0; index < length; index += 1) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (property === undefined || !property.enumerable || !Object.hasOwn(property, 'value')) {
      throw new Error('Invalid collection.');
    }
    registrations.push(property.value);
  }
  return registrations;
}

export interface AvailableActionRegistryLookup {
  readonly status: 'available';
  readonly descriptor: ActionDescriptorMetadata;
  readonly handler: ActionHandler;
}

export interface RetiredActionRegistryLookup {
  readonly status: 'retired';
  readonly descriptor: ActionDescriptorMetadata;
}

export interface UnsupportedActionRegistryLookup {
  readonly status: 'unsupported';
  readonly descriptor: ActionDescriptorMetadata;
  readonly requestedContractVersion: number;
  readonly supportedContractVersion: number;
}

export interface UnknownActionRegistryLookup {
  readonly status: 'unknown';
}

export type ActionRegistryLookup =
  | AvailableActionRegistryLookup
  | RetiredActionRegistryLookup
  | UnsupportedActionRegistryLookup
  | UnknownActionRegistryLookup;

function sourceLabel(source: ActionRegistrationSource): string {
  return `${source.packageName}:${source.moduleName}`;
}

export function actionRegistrationSourceFromModule(
  moduleExports: RuntimeValue,
  packageName: string,
  moduleName: string
): ActionRegistrationSource {
  const exportName = 'registerRedboxActions';
  if (!hasOwnRuntimeProperty(moduleExports, exportName)) {
    throw new ActionRegistryRegistrationError(
      'invalid-action-registration',
      `Hook ${packageName} has 'hasActions: true' but no direct '${exportName}' function export.`
    );
  }
  return actionRegistrationSource(packageName, moduleName, readRuntimeProperty(moduleExports, exportName));
}

export function actionRegistrationSource(
  packageName: string,
  moduleName: string,
  registrationExport: RuntimeValue
): ActionRegistrationSource {
  const registrationFunction = runtimeFunction(registrationExport);
  if (registrationFunction === undefined) {
    throw new ActionRegistryRegistrationError(
      'invalid-action-registration',
      `Action source ${packageName}:${moduleName} must provide a direct registerRedboxActions function.`
    );
  }
  return { packageName, moduleName, registerRedboxActions: registrationFunction };
}

function freezeActionJsonValue(value: ActionJsonValue): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    freezeActionJsonValue(child);
  }
  Object.freeze(value);
}

function freezeDescriptorMetadata(descriptor: MutableActionDescriptorMetadata): ActionDescriptorMetadata {
  for (const parameter of descriptor.parameterSchema.parameters) {
    if (parameter.ui !== undefined) {
      Object.freeze(parameter.ui);
    }
    if (parameter.kind === 'enum') {
      for (const option of parameter.options) {
        Object.freeze(option);
      }
      Object.freeze(parameter.options);
    }
    if (parameter.kind === 'array') {
      if (parameter.items.kind === 'enum') {
        for (const option of parameter.items.options) {
          Object.freeze(option);
        }
        Object.freeze(parameter.items.options);
      }
      Object.freeze(parameter.items);
      if (parameter.defaultValue !== undefined) {
        freezeActionJsonValue(parameter.defaultValue);
      }
    }
    if (parameter.kind === 'object' && parameter.defaultValue !== undefined) {
      freezeActionJsonValue(parameter.defaultValue);
    }
    Object.freeze(parameter);
  }
  Object.freeze(descriptor.parameterSchema.parameters);
  Object.freeze(descriptor.parameterSchema);

  for (const field of descriptor.outputSchema.fields) {
    Object.freeze(field);
  }
  Object.freeze(descriptor.outputSchema.fields);
  Object.freeze(descriptor.outputSchema.safeFields);
  Object.freeze(descriptor.outputSchema);

  Object.freeze(descriptor.resultContract.allowedKinds);
  if (descriptor.resultContract.patch !== undefined) {
    Object.freeze(descriptor.resultContract.patch.allowedPathPrefixes);
    Object.freeze(descriptor.resultContract.patch);
  }
  Object.freeze(descriptor.resultContract);
  Object.freeze(descriptor.executionPolicy.timeout);
  Object.freeze(descriptor.executionPolicy.retry);
  Object.freeze(descriptor.executionPolicy);
  Object.freeze(descriptor.provenance);
  Object.freeze(descriptor.contexts);
  Object.freeze(descriptor.modes);
  Object.freeze(descriptor.phases);
  return Object.freeze(descriptor);
}

function toRegisteredAction(definition: ActionDefinition): RegisteredAction {
  const { handler, ...metadata } = definition;
  return {
    descriptor: freezeDescriptorMetadata(metadata),
    handler,
  };
}

export class RedboxActionRegistry {
  readonly descriptorMetadata: readonly ActionDescriptorMetadata[];
  readonly size: number;
  readonly #actions: ReadonlyMap<string, RegisteredAction>;

  constructor(actions: ReadonlyMap<string, RegisteredAction>) {
    const copiedActions = new Map<string, RegisteredAction>();
    for (const [actionId, action] of actions) {
      const definition = parseActionDefinition({ ...action.descriptor, handler: action.handler });
      if (actionId !== definition.id) {
        throw new ActionRegistryRegistrationError(
          'invalid-action-registration',
          `Action registry key ${actionId} does not match descriptor ID ${definition.id}.`
        );
      }
      copiedActions.set(actionId, toRegisteredAction(definition));
    }
    this.#actions = copiedActions;
    this.descriptorMetadata = Object.freeze(
      Array.from(copiedActions.values(), action => action.descriptor).sort((left, right) =>
        compareCodeUnits(left.id, right.id)
      )
    );
    this.size = copiedActions.size;
    Object.freeze(this);
  }

  getDescriptor(actionId: string): ActionDescriptorMetadata | undefined {
    return this.#actions.get(actionId)?.descriptor;
  }

  lookup(actionId: string, contractVersion: number): ActionRegistryLookup {
    const action = this.#actions.get(actionId);
    if (action === undefined) {
      return Object.freeze({ status: 'unknown' });
    }
    if (action.descriptor.contractVersion !== contractVersion) {
      return Object.freeze({
        status: 'unsupported',
        descriptor: action.descriptor,
        requestedContractVersion: contractVersion,
        supportedContractVersion: action.descriptor.contractVersion,
      });
    }
    if (action.descriptor.availability === 'retired') {
      return Object.freeze({ status: 'retired', descriptor: action.descriptor });
    }
    return Object.freeze({ status: 'available', descriptor: action.descriptor, handler: action.handler });
  }

  getHandler(actionId: string, contractVersion: number): ActionHandler | undefined {
    const lookup = this.lookup(actionId, contractVersion);
    return lookup.status === 'available' ? lookup.handler : undefined;
  }

  serializeDescriptorMetadata(): string {
    return JSON.stringify(this.descriptorMetadata);
  }
}

export function buildActionRegistry(sources: readonly ActionRegistrationSource[]): RedboxActionRegistry {
  const actions = new Map<string, RegisteredAction>();

  for (const source of sources) {
    let registrations: RuntimeValue;
    try {
      registrations = source.registerRedboxActions.invoke();
    } catch {
      throw new ActionRegistryRegistrationError(
        'invalid-action-registration',
        `Action registration failed for ${sourceLabel(source)}.`
      );
    }

    // Native brand checks do not inspect prototypes or invoke proxy traps.
    if (isPromise(registrations)) {
      try {
        // Only ordinary native Promises can be drained without reading custom
        // catch/then/constructor accessors or subclass species hooks.
        if (Object.getPrototypeOf(registrations) === Promise.prototype && Reflect.ownKeys(registrations).length === 0) {
          Promise.prototype.then.call(registrations, undefined, () => undefined);
        }
      } catch {
        // Do not retain private rejection/inspection details.
      }
      throw new ActionRegistryRegistrationError(
        'asynchronous-action-registration',
        `registerRedboxActions() must be synchronous for ${sourceLabel(source)}.`
      );
    }
    let collection: readonly RuntimeValue[];
    try {
      collection = registrationCollection(registrations);
    } catch {
      throw new ActionRegistryRegistrationError(
        'invalid-action-registration',
        `registerRedboxActions() must return a safe array for ${sourceLabel(source)}.`
      );
    }

    for (const registration of collection) {
      let definition: ActionDefinition;
      try {
        // Validate the original graph before spreading: copying would invoke getters
        // and erase hidden properties before the descriptor validator can reject them.
        const preflight = boundedValidationPreflight(registration, {
          allowFunctionAtPath: path => path === '$.handler',
          maxBytes: ACTION_CONTRACT_LIMITS.maxContractBytes,
          maxDepth: ACTION_CONTRACT_LIMITS.maxPlanDepth,
          maxStringLength: ACTION_CONTRACT_LIMITS.maxStringValueLength,
          maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
          maxWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
          arrayCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxArrayItems,
          objectCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxObjectProperties,
        });
        if (!preflight.ok || !isRuntimeRecord(registration)) {
          throw new Error('Invalid registration descriptor graph.');
        }
        definition = parseActionDefinition({
          ...registration,
          provenance: {
            packageName: source.packageName,
            moduleName: source.moduleName,
          },
        });
      } catch {
        throw new ActionRegistryRegistrationError(
          'invalid-action-registration',
          `Invalid action descriptor from ${sourceLabel(source)}.`
        );
      }

      const existing = actions.get(definition.id);
      if (existing !== undefined) {
        if (existing.descriptor.contractVersion !== definition.contractVersion) {
          throw new ActionRegistryRegistrationError(
            'inconsistent-action-contract-version',
            `Action ${definition.id} has inconsistent contract versions ${existing.descriptor.contractVersion} and ${definition.contractVersion}.`
          );
        }
        throw new ActionRegistryRegistrationError(
          'duplicate-action-id',
          `Duplicate action ID ${definition.id} from ${sourceLabel(source)}; first registered by ${existing.descriptor.provenance.packageName}:${existing.descriptor.provenance.moduleName}.`
        );
      }

      actions.set(definition.id, toRegisteredAction(definition));
    }
  }

  return new RedboxActionRegistry(actions);
}
