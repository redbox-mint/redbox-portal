import { createHash } from 'node:crypto';
import type { ActionContext, ActionHandlerSecrets, ResolvedActionSecret } from './contracts';
import {
  actionBindingIdSchema,
  actionParameterNameSchema,
  safeActionIdentifierSchema,
  type ActionBindingId,
} from './identifiers';
import type { RuntimeValue } from '../runtimeValues';
import { resolveActionPlan, type ResolvedActionPlan, type ResolvedActionPlanBinding } from './plan';
import type { RedboxActionRegistry } from './registration';

const ACTION_SECRET_SLOT_ID_PATTERN = /^acts_[a-f0-9]{32}$/;
const ACTION_SECRET_REDACTION = '[REDACTED]' as const;

export const ACTION_SECRET_LIMITS: Readonly<{ maxSecretBytes: 65_536 }> = Object.freeze({
  maxSecretBytes: 65_536,
});

declare const actionSecretSlotIdBrand: unique symbol;

export type ActionSecretSlotId = string & { readonly [actionSecretSlotIdBrand]: true };

export interface ActionSecretSlotIdentityInput {
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly bindingId: ActionBindingId;
  readonly parameterName: string;
}

export interface ActionSecretSlotIdentity extends ActionSecretSlotIdentityInput {
  readonly id: ActionSecretSlotId;
}

export interface ActionSecretSlotAccess {
  /** Brand resolved from the authenticated request or runtime context. */
  readonly requesterBrandId: string;
  readonly slot: ActionSecretSlotIdentity;
}

export interface ActionSecretWriteRequest extends ActionSecretSlotAccess {
  /** Omitted and blank input retain the current slot value. */
  readonly value?: string;
}

export interface ActionSecretReplaceRequest extends ActionSecretSlotAccess {
  readonly value: string;
}

export interface ActionSecretHandlerResolutionRequest extends ActionSecretSlotAccess {
  /** Exact binding emitted by the trusted action-execution boundary. */
  readonly resolvedBinding: ResolvedActionPlanBinding;
}

export type ActionSecretWriteResult = 'retained' | 'replaced';

export type ActionSecretProviderErrorCode =
  | 'invalid-secret-slot'
  | 'invalid-secret-value'
  | 'cross-brand-secret-access'
  | 'handler-secret-access-denied'
  | 'required-secret-not-configured'
  | 'secret-configured-state-mismatch'
  | 'secret-provider-failure';

export interface ActionSecretProviderProblem {
  readonly name: 'ActionSecretProviderError';
  readonly code: ActionSecretProviderErrorCode;
  readonly message: string;
}

const ACTION_SECRET_ERROR_MESSAGES: Readonly<Record<ActionSecretProviderErrorCode, string>> = Object.freeze({
  'invalid-secret-slot': 'The action secret slot is invalid.',
  'invalid-secret-value': 'The action secret value is invalid.',
  'cross-brand-secret-access': 'Action secret access is denied.',
  'handler-secret-access-denied': 'Handler access to the action secret is denied.',
  'required-secret-not-configured': 'A required action secret is not configured.',
  'secret-configured-state-mismatch': 'The action secret configured state does not match protected storage.',
  'secret-provider-failure': 'The action secret provider could not complete the operation.',
});

/** Fixed-message provider error; submitted values and adapter causes are never retained. */
export class ActionSecretProviderError extends Error {
  readonly code: ActionSecretProviderErrorCode;

  constructor(code: ActionSecretProviderErrorCode) {
    const safeCode = Object.hasOwn(ACTION_SECRET_ERROR_MESSAGES, code) ? code : 'secret-provider-failure';
    super(ACTION_SECRET_ERROR_MESSAGES[safeCode]);
    this.name = 'ActionSecretProviderError';
    this.code = safeCode;
  }

  toJSON(): ActionSecretProviderProblem {
    return Object.freeze({ name: 'ActionSecretProviderError', code: this.code, message: this.message });
  }
}

/** Protected persistence seam implemented by B08. */
export interface ActionSecretStorage {
  replace(slot: ActionSecretSlotIdentity, value: string): Promise<void>;
  clear(slot: ActionSecretSlotIdentity): Promise<void>;
  resolve(slot: ActionSecretSlotIdentity): Promise<string | undefined>;
  isConfigured(slot: ActionSecretSlotIdentity): Promise<boolean>;
}

export interface ActionSecretProvider {
  write(request: ActionSecretWriteRequest): Promise<ActionSecretWriteResult>;
  replace(request: ActionSecretReplaceRequest): Promise<void>;
  clear(request: ActionSecretSlotAccess): Promise<void>;
  resolveForHandler(request: ActionSecretHandlerResolutionRequest): Promise<ResolvedActionSecret | undefined>;
  isConfigured(request: ActionSecretSlotAccess): Promise<boolean>;
}

function providerError(code: ActionSecretProviderErrorCode): ActionSecretProviderError {
  return new ActionSecretProviderError(code);
}

function validSlotInput(input: ActionSecretSlotIdentityInput): boolean {
  return (
    safeActionIdentifierSchema.safeParse(input.brandId).success &&
    safeActionIdentifierSchema.safeParse(input.recordTypeKey).success &&
    actionBindingIdSchema.safeParse(input.bindingId).success &&
    actionParameterNameSchema.safeParse(input.parameterName).success
  );
}

function canonicalSlotParts(input: ActionSecretSlotIdentityInput): readonly string[] {
  return ['action-secret-slot-v1', input.brandId, input.recordTypeKey, input.bindingId, input.parameterName];
}

function lengthPrefix(parts: readonly string[]): string {
  return parts.map(part => `${Buffer.byteLength(part, 'utf8')}:${part}`).join('|');
}

export function parseActionSecretSlotId(value: string): ActionSecretSlotId {
  if (!ACTION_SECRET_SLOT_ID_PATTERN.test(value)) {
    throw providerError('invalid-secret-slot');
  }
  return value as ActionSecretSlotId;
}

/** Stable, non-reversible slot ID derived from every ownership component. */
export function deriveStableActionSecretSlotId(input: ActionSecretSlotIdentityInput): ActionSecretSlotId {
  if (!validSlotInput(input)) {
    throw providerError('invalid-secret-slot');
  }
  const digest = createHash('sha256')
    .update(lengthPrefix(canonicalSlotParts(input)))
    .digest('hex');
  return parseActionSecretSlotId(`acts_${digest.slice(0, 32)}`);
}

export function createActionSecretSlotIdentity(input: ActionSecretSlotIdentityInput): ActionSecretSlotIdentity {
  return Object.freeze({ ...input, id: deriveStableActionSecretSlotId(input) });
}

function canonicalAccess(request: ActionSecretSlotAccess): ActionSecretSlotAccess {
  const requesterBrandId = request.requesterBrandId;
  const submittedSlot = request.slot;
  const submittedId = submittedSlot.id;
  const slot = createActionSecretSlotIdentity({
    brandId: submittedSlot.brandId,
    recordTypeKey: submittedSlot.recordTypeKey,
    bindingId: submittedSlot.bindingId,
    parameterName: submittedSlot.parameterName,
  });
  if (slot.id !== submittedId) {
    throw providerError('invalid-secret-slot');
  }
  if (!safeActionIdentifierSchema.safeParse(requesterBrandId).success || requesterBrandId !== slot.brandId) {
    throw providerError('cross-brand-secret-access');
  }
  return Object.freeze({ requesterBrandId, slot });
}

function validSecretValue(value: RuntimeValue): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, 'utf8') <= ACTION_SECRET_LIMITS.maxSecretBytes
  );
}

interface HandlerSecretDeclaration {
  readonly required: boolean;
  readonly configured: boolean;
}

function handlerSecretDeclaration(
  request: ActionSecretHandlerResolutionRequest,
  slot: ActionSecretSlotIdentity,
  trustedRecordTypeKey: string | undefined
): HandlerSecretDeclaration {
  const resolvedBinding = request.resolvedBinding;
  if (trustedRecordTypeKey === undefined || trustedRecordTypeKey !== slot.recordTypeKey) {
    throw providerError('handler-secret-access-denied');
  }
  const binding = resolvedBinding.binding;
  const descriptor = resolvedBinding.descriptor;
  const parameter = descriptor.parameterSchema.parameters.find(candidate => candidate.name === slot.parameterName);
  if (
    binding.id !== slot.bindingId ||
    binding.actionId !== descriptor.id ||
    binding.contractVersion !== descriptor.contractVersion ||
    parameter?.kind !== 'secret' ||
    parameter.writeOnly !== true
  ) {
    throw providerError('handler-secret-access-denied');
  }
  const marker = binding.parameters[parameter.name];
  if (marker !== undefined && marker.kind !== 'secret') {
    throw providerError('handler-secret-access-denied');
  }
  return Object.freeze({ required: parameter.required, configured: marker?.configured === true });
}

class ProviderResolvedActionSecret implements ResolvedActionSecret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): '[REDACTED]' {
    return ACTION_SECRET_REDACTION;
  }

  toString(): '[REDACTED]' {
    return ACTION_SECRET_REDACTION;
  }
}

Object.freeze(ProviderResolvedActionSecret.prototype);

async function storageOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch {
    throw providerError('secret-provider-failure');
  }
}

interface ActionSecretProviderExecutionState {
  readonly trustedBindingRecordTypeKeys: WeakMap<object, string>;
  registry?: RedboxActionRegistry;
  boundary?: ActionSecretExecutionBoundary;
}

const actionSecretProviderExecutionStates = new WeakMap<object, ActionSecretProviderExecutionState>();

class ProtectedActionSecretProvider implements ActionSecretProvider {
  readonly #storage: ActionSecretStorage;

  constructor(storage: ActionSecretStorage) {
    this.#storage = storage;
    actionSecretProviderExecutionStates.set(this, {
      trustedBindingRecordTypeKeys: new WeakMap<object, string>(),
    });
  }

  async write(request: ActionSecretWriteRequest): Promise<ActionSecretWriteResult> {
    const access = canonicalAccess(request);
    const value = request.value;
    if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
      return 'retained';
    }
    if (!validSecretValue(value)) {
      throw providerError('invalid-secret-value');
    }
    await storageOperation(() => this.#storage.replace(access.slot, value));
    return 'replaced';
  }

  async replace(request: ActionSecretReplaceRequest): Promise<void> {
    const access = canonicalAccess(request);
    const value = request.value;
    if (!validSecretValue(value)) {
      throw providerError('invalid-secret-value');
    }
    await storageOperation(() => this.#storage.replace(access.slot, value));
  }

  async clear(request: ActionSecretSlotAccess): Promise<void> {
    const access = canonicalAccess(request);
    await storageOperation(() => this.#storage.clear(access.slot));
  }

  async resolveForHandler(request: ActionSecretHandlerResolutionRequest): Promise<ResolvedActionSecret | undefined> {
    const access = canonicalAccess(request);
    const declaration = handlerSecretDeclaration(
      request,
      access.slot,
      actionSecretProviderExecutionStates.get(this)?.trustedBindingRecordTypeKeys.get(request.resolvedBinding)
    );
    if (!declaration.configured) {
      if (declaration.required) {
        throw providerError('required-secret-not-configured');
      }
      return undefined;
    }
    const value = await storageOperation(() => this.#storage.resolve(access.slot));
    if (value === undefined) {
      throw providerError(declaration.required ? 'required-secret-not-configured' : 'secret-configured-state-mismatch');
    }
    if (!validSecretValue(value)) {
      throw providerError('secret-provider-failure');
    }
    return new ProviderResolvedActionSecret(value);
  }

  async isConfigured(request: ActionSecretSlotAccess): Promise<boolean> {
    const access = canonicalAccess(request);
    const configured = await storageOperation(() => this.#storage.isConfigured(access.slot));
    return configured === true;
  }
}

export function createActionSecretProvider(storage: ActionSecretStorage): ActionSecretProvider {
  return Object.freeze(new ProtectedActionSecretProvider(storage));
}

/**
 * Server-only bridge for A07 executor wiring. It binds one provider to the
 * loader-selected application registry and is intentionally absent from the
 * public barrel and emitted declarations.
 *
 * @internal
 */
export interface ActionSecretExecutionBoundary {
  resolvePlan(value: RuntimeValue): ResolvedActionPlan;
  resolveHandlerSecrets(
    context: Pick<ActionContext, 'brandId' | 'recordTypeKey'>,
    resolvedBinding: ResolvedActionPlanBinding
  ): Promise<Readonly<ActionHandlerSecrets>>;
}

/** @internal */
export function createActionSecretExecutionBoundary(
  provider: ActionSecretProvider,
  applicationRegistry: RedboxActionRegistry
): ActionSecretExecutionBoundary {
  const state = actionSecretProviderExecutionStates.get(provider);
  if (state === undefined) {
    throw providerError('handler-secret-access-denied');
  }
  if (state.registry !== undefined && state.registry !== applicationRegistry) {
    throw providerError('handler-secret-access-denied');
  }
  if (state.boundary !== undefined) {
    return state.boundary;
  }

  state.registry = applicationRegistry;
  const resolvePlan = (value: RuntimeValue): ResolvedActionPlan => {
    const plan = resolveActionPlan(applicationRegistry, value);
    for (const resolvedBinding of plan.bindings) {
      state.trustedBindingRecordTypeKeys.set(resolvedBinding, plan.recordTypeKey);
    }
    return plan;
  };
  const resolveHandlerSecrets = (
    context: Pick<ActionContext, 'brandId' | 'recordTypeKey'>,
    resolvedBinding: ResolvedActionPlanBinding
  ): Promise<Readonly<ActionHandlerSecrets>> => resolveActionHandlerSecrets(provider, context, resolvedBinding);
  state.boundary = Object.freeze({ resolvePlan, resolveHandlerSecrets });
  return state.boundary;
}

/**
 * Resolves only descriptor-declared secret parameters for one handler call.
 * Required slots fail closed; optional unconfigured slots are omitted.
 */
export async function resolveActionHandlerSecrets(
  provider: ActionSecretProvider,
  context: Pick<ActionContext, 'brandId' | 'recordTypeKey'>,
  resolvedBinding: ResolvedActionPlanBinding
): Promise<Readonly<ActionHandlerSecrets>> {
  const brandId = context.brandId;
  const recordTypeKey = context.recordTypeKey;
  const binding = resolvedBinding.binding;
  const descriptor = resolvedBinding.descriptor;
  if (
    recordTypeKey.trim().length === 0 ||
    binding.actionId !== descriptor.id ||
    binding.contractVersion !== descriptor.contractVersion
  ) {
    throw providerError('handler-secret-access-denied');
  }

  const resolved: Record<string, ResolvedActionSecret> = {};
  for (const parameter of descriptor.parameterSchema.parameters) {
    if (parameter.kind !== 'secret') {
      continue;
    }
    const slot = createActionSecretSlotIdentity({
      brandId,
      recordTypeKey,
      bindingId: binding.id,
      parameterName: parameter.name,
    });
    const value = await provider.resolveForHandler({
      requesterBrandId: brandId,
      slot,
      resolvedBinding,
    });
    if (value !== undefined) {
      resolved[parameter.name] = value;
    } else if (parameter.required) {
      throw providerError('required-secret-not-configured');
    }
  }
  return Object.freeze(resolved);
}
