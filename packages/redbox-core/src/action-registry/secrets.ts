import { createHash } from 'node:crypto';
import type {
  ActionBinding,
  ActionContext,
  ActionDefinition,
  ActionHandlerSecrets,
  DeepReadonly,
  ResolvedActionSecret,
} from './contracts';
import {
  actionBindingIdSchema,
  actionParameterNameSchema,
  safeActionIdentifierSchema,
  type ActionBindingId,
  type ActionDefinitionId,
} from './identifiers';
import type { RuntimeValue } from '../runtimeValues';

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

export interface ActionSecretBindingReference {
  readonly id: ActionBindingId;
  readonly actionId: ActionDefinitionId;
  readonly contractVersion: number;
}

export interface ActionSecretDescriptorReference {
  readonly id: ActionDefinitionId;
  readonly contractVersion: number;
  readonly parameterSchema: ActionDefinition['parameterSchema'];
}

export interface ActionSecretHandlerResolutionRequest extends ActionSecretSlotAccess {
  readonly binding: ActionSecretBindingReference;
  readonly descriptor: ActionSecretDescriptorReference;
}

export type ActionSecretWriteResult = 'retained' | 'replaced';

export type ActionSecretProviderErrorCode =
  | 'invalid-secret-slot'
  | 'invalid-secret-value'
  | 'cross-brand-secret-access'
  | 'handler-secret-access-denied'
  | 'required-secret-not-configured'
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

function assertCanonicalSlot(slot: ActionSecretSlotIdentity): void {
  if (deriveStableActionSecretSlotId(slot) !== slot.id) {
    throw providerError('invalid-secret-slot');
  }
}

function assertAccess(request: ActionSecretSlotAccess): void {
  assertCanonicalSlot(request.slot);
  if (
    !safeActionIdentifierSchema.safeParse(request.requesterBrandId).success ||
    request.requesterBrandId !== request.slot.brandId
  ) {
    throw providerError('cross-brand-secret-access');
  }
}

function validSecretValue(value: RuntimeValue): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, 'utf8') <= ACTION_SECRET_LIMITS.maxSecretBytes
  );
}

function assertHandlerDeclaration(request: ActionSecretHandlerResolutionRequest): void {
  const parameter = request.descriptor.parameterSchema.parameters.find(
    candidate => candidate.name === request.slot.parameterName
  );
  if (
    request.binding.id !== request.slot.bindingId ||
    request.binding.actionId !== request.descriptor.id ||
    request.binding.contractVersion !== request.descriptor.contractVersion ||
    parameter?.kind !== 'secret' ||
    parameter.writeOnly !== true
  ) {
    throw providerError('handler-secret-access-denied');
  }
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

async function storageOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch {
    throw providerError('secret-provider-failure');
  }
}

class ProtectedActionSecretProvider implements ActionSecretProvider {
  readonly #storage: ActionSecretStorage;

  constructor(storage: ActionSecretStorage) {
    this.#storage = storage;
  }

  async write(request: ActionSecretWriteRequest): Promise<ActionSecretWriteResult> {
    assertAccess(request);
    const value = request.value;
    if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
      return 'retained';
    }
    await this.replace({ ...request, value });
    return 'replaced';
  }

  async replace(request: ActionSecretReplaceRequest): Promise<void> {
    assertAccess(request);
    if (!validSecretValue(request.value)) {
      throw providerError('invalid-secret-value');
    }
    await storageOperation(() => this.#storage.replace(request.slot, request.value));
  }

  async clear(request: ActionSecretSlotAccess): Promise<void> {
    assertAccess(request);
    await storageOperation(() => this.#storage.clear(request.slot));
  }

  async resolveForHandler(request: ActionSecretHandlerResolutionRequest): Promise<ResolvedActionSecret | undefined> {
    assertAccess(request);
    assertHandlerDeclaration(request);
    const value = await storageOperation(() => this.#storage.resolve(request.slot));
    if (value === undefined) {
      return undefined;
    }
    if (!validSecretValue(value)) {
      throw providerError('secret-provider-failure');
    }
    return new ProviderResolvedActionSecret(value);
  }

  async isConfigured(request: ActionSecretSlotAccess): Promise<boolean> {
    assertAccess(request);
    const configured = await storageOperation(() => this.#storage.isConfigured(request.slot));
    return configured === true;
  }
}

export function createActionSecretProvider(storage: ActionSecretStorage): ActionSecretProvider {
  return Object.freeze(new ProtectedActionSecretProvider(storage));
}

function bindingReference(binding: DeepReadonly<ActionBinding>): ActionSecretBindingReference {
  return Object.freeze({
    id: binding.id,
    actionId: binding.actionId,
    contractVersion: binding.contractVersion,
  });
}

/**
 * Resolves only descriptor-declared secret parameters for one handler call.
 * Required slots fail closed; optional unconfigured slots are omitted.
 */
export async function resolveActionHandlerSecrets(
  provider: ActionSecretProvider,
  context: Pick<ActionContext, 'brandId' | 'recordTypeKey'>,
  binding: DeepReadonly<ActionBinding>,
  descriptor: ActionSecretDescriptorReference
): Promise<Readonly<ActionHandlerSecrets>> {
  if (
    context.recordTypeKey.trim().length === 0 ||
    binding.actionId !== descriptor.id ||
    binding.contractVersion !== descriptor.contractVersion
  ) {
    throw providerError('handler-secret-access-denied');
  }

  const resolved: Record<string, ResolvedActionSecret> = {};
  const reference = bindingReference(binding);
  for (const parameter of descriptor.parameterSchema.parameters) {
    if (parameter.kind !== 'secret') {
      continue;
    }
    const slot = createActionSecretSlotIdentity({
      brandId: context.brandId,
      recordTypeKey: context.recordTypeKey,
      bindingId: binding.id,
      parameterName: parameter.name,
    });
    const value = await provider.resolveForHandler({
      requesterBrandId: context.brandId,
      slot,
      binding: reference,
      descriptor,
    });
    if (value !== undefined) {
      resolved[parameter.name] = value;
    } else if (parameter.required) {
      throw providerError('required-secret-not-configured');
    }
  }
  return Object.freeze(resolved);
}
