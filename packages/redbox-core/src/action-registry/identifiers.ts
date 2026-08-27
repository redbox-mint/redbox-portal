import { createHash } from 'node:crypto';
import { z } from 'zod';
import { boundedValidationPreflight } from '../boundedValidation';
import {
  createRuntimeValidator,
  type RuntimeValidationResult,
  type RuntimeValidator,
  type RuntimeValue,
} from '../runtimeValues';
import {
  ActionContractValidationError,
  type ActionContractValidationErrorCode,
  type ActionContractValidationIssue,
} from './errors';
import { ACTION_CONTRACT_LIMITS } from './limits';

const ACTION_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/;
const ACTION_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const ACTION_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const BINDING_ID_PATTERN = /^actb_[a-f0-9]{32}$/;
const SAFE_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

declare const actionDefinitionIdBrand: unique symbol;
declare const actionBindingIdBrand: unique symbol;

export type ActionDefinitionId = string & { readonly [actionDefinitionIdBrand]: true };
export type ActionBindingId = string & { readonly [actionBindingIdBrand]: true };
export type ActionExecutionMode = 'onCreate' | 'onUpdate' | 'onDelete' | 'onTransitionWorkflow';
export type ActionExecutionPhase = 'pre' | 'postSync' | 'post';

export interface RecordLifecycleActionBindingScope {
  readonly context: 'record-lifecycle';
  readonly mode: 'onCreate' | 'onUpdate' | 'onDelete';
  readonly phase: ActionExecutionPhase;
}

export interface TransitionActionBindingScope {
  readonly context: 'workflow-transition';
  readonly mode: 'onTransitionWorkflow';
  readonly phase: ActionExecutionPhase;
  readonly scopeId: string;
}

export interface QueuedActionBindingScope {
  readonly context: 'queued-record-action';
  readonly mode: ActionExecutionMode;
  readonly phase: ActionExecutionPhase;
  readonly scopeId?: string;
}

export type ActionBindingScope =
  RecordLifecycleActionBindingScope | TransitionActionBindingScope | QueuedActionBindingScope;
/** @deprecated Use ActionBindingScope. */
export type ActionBindingAttachment = ActionBindingScope;

const actionDefinitionIdSchemaImplementation = z
  .string()
  .min(1)
  .max(ACTION_CONTRACT_LIMITS.maxActionIdLength)
  .regex(ACTION_ID_PATTERN);
const actionBindingIdSchemaImplementation = z
  .string()
  .min(1)
  .max(ACTION_CONTRACT_LIMITS.maxBindingIdLength)
  .regex(BINDING_ID_PATTERN);
const safeActionIdentifierSchemaImplementation = z
  .string()
  .min(1)
  .max(ACTION_CONTRACT_LIMITS.maxIdentifierLength)
  .regex(SAFE_IDENTITY_PATTERN);
const actionParameterNameSchemaImplementation = z
  .string()
  .min(1)
  .max(ACTION_CONTRACT_LIMITS.maxParameterNameLength)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const actionExecutionModeSchemaImplementation: z.ZodType<ActionExecutionMode, RuntimeValue> = z.enum([
  'onCreate',
  'onUpdate',
  'onDelete',
  'onTransitionWorkflow',
]);
const actionExecutionPhaseSchemaImplementation: z.ZodType<ActionExecutionPhase, RuntimeValue> = z.enum([
  'pre',
  'postSync',
  'post',
]);

const lifecycleActionBindingScopeSchemaImplementation = z
  .object({
    context: z.literal('record-lifecycle'),
    mode: z.enum(['onCreate', 'onUpdate', 'onDelete']),
    phase: actionExecutionPhaseSchemaImplementation,
  })
  .strict();
const transitionActionBindingScopeSchemaImplementation = z
  .object({
    context: z.literal('workflow-transition'),
    mode: z.literal('onTransitionWorkflow'),
    phase: actionExecutionPhaseSchemaImplementation,
    scopeId: safeActionIdentifierSchemaImplementation,
  })
  .strict();
const queuedActionBindingScopeSchemaImplementation = z
  .object({
    context: z.literal('queued-record-action'),
    mode: actionExecutionModeSchemaImplementation,
    phase: actionExecutionPhaseSchemaImplementation,
    scopeId: safeActionIdentifierSchemaImplementation.optional(),
  })
  .strict();
const actionBindingScopeSchemaImplementation: z.ZodType<ActionBindingScope, RuntimeValue> = z.discriminatedUnion(
  'context',
  [
    lifecycleActionBindingScopeSchemaImplementation,
    transitionActionBindingScopeSchemaImplementation,
    queuedActionBindingScopeSchemaImplementation,
  ]
);

function hasSafeActionContractShape(value: RuntimeValue): boolean {
  return boundedValidationPreflight(value, {
    maxBytes: ACTION_CONTRACT_LIMITS.maxContractBytes,
    maxDepth: ACTION_CONTRACT_LIMITS.maxPlanDepth,
    maxStringLength: ACTION_CONTRACT_LIMITS.maxStringValueLength,
    maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
    maxWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxArrayItems,
    objectCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxObjectProperties,
  }).ok;
}

function validationResult<Value>(
  schema: z.ZodType<Value, RuntimeValue>,
  value: RuntimeValue
): RuntimeValidationResult<Value> {
  if (!hasSafeActionContractShape(value)) {
    return Object.freeze({ success: false });
  }
  const result = schema.safeParse(value);
  return result.success ? Object.freeze({ success: true, data: result.data }) : Object.freeze({ success: false });
}

function runtimeValidator<Value>(schema: z.ZodType<Value, RuntimeValue>): RuntimeValidator<Value> {
  return createRuntimeValidator((value: RuntimeValue): RuntimeValidationResult<Value> =>
    validationResult(schema, value)
  );
}

function isActionDefinitionId(value: RuntimeValue): value is ActionDefinitionId {
  return (
    hasSafeActionContractShape(value) &&
    typeof value === 'string' &&
    actionDefinitionIdSchemaImplementation.safeParse(value).success
  );
}

function isActionBindingId(value: RuntimeValue): value is ActionBindingId {
  return (
    hasSafeActionContractShape(value) &&
    typeof value === 'string' &&
    actionBindingIdSchemaImplementation.safeParse(value).success
  );
}

export const actionDefinitionIdSchema: RuntimeValidator<ActionDefinitionId> = createRuntimeValidator(
  (value: RuntimeValue): RuntimeValidationResult<ActionDefinitionId> =>
    isActionDefinitionId(value) ? Object.freeze({ success: true, data: value }) : Object.freeze({ success: false })
);
export const actionBindingIdSchema: RuntimeValidator<ActionBindingId> = createRuntimeValidator(
  (value: RuntimeValue): RuntimeValidationResult<ActionBindingId> =>
    isActionBindingId(value) ? Object.freeze({ success: true, data: value }) : Object.freeze({ success: false })
);
export const safeActionIdentifierSchema: RuntimeValidator<string> = runtimeValidator(
  safeActionIdentifierSchemaImplementation
);
export const actionParameterNameSchema: RuntimeValidator<string> = runtimeValidator(
  actionParameterNameSchemaImplementation
);

export const ACTION_INVOCATION_CONTEXTS: readonly ['record-lifecycle', 'workflow-transition', 'queued-record-action'] =
  ['record-lifecycle', 'workflow-transition', 'queued-record-action'];
export type ActionInvocationContextKind = (typeof ACTION_INVOCATION_CONTEXTS)[number];

export const actionExecutionModeSchema: RuntimeValidator<ActionExecutionMode> = runtimeValidator(
  actionExecutionModeSchemaImplementation
);
export const actionExecutionPhaseSchema: RuntimeValidator<ActionExecutionPhase> = runtimeValidator(
  actionExecutionPhaseSchemaImplementation
);
export const actionBindingScopeSchema: RuntimeValidator<ActionBindingScope> = runtimeValidator(
  actionBindingScopeSchemaImplementation
);
/** @deprecated Use actionBindingScopeSchema. */
export const actionBindingAttachmentSchema: RuntimeValidator<ActionBindingScope> = actionBindingScopeSchema;

const stableActionBindingIdentitySchema = z
  .object({
    recordTypeKey: safeActionIdentifierSchemaImplementation,
    scope: actionBindingScopeSchemaImplementation,
    actionId: actionDefinitionIdSchemaImplementation,
    contractVersion: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxContractVersion),
    stableKey: safeActionIdentifierSchemaImplementation,
  })
  .strict();

export interface StableActionBindingIdentity {
  readonly recordTypeKey: string;
  readonly scope: ActionBindingScope;
  readonly actionId: string;
  readonly contractVersion: number;
  /** Stable semantic key supplied by code or migration; never an array index. */
  readonly stableKey: string;
}

function issuePath(issue: z.core.$ZodIssue): string {
  if (issue.path.length === 0) {
    return '$';
  }
  return issue.path.reduce<string>((path, segment) => {
    if (typeof segment === 'number') {
      return `${path}[${segment}]`;
    }
    const key = String(segment);
    return path === '$' ? `$.${key}` : `${path}.${key}`;
  }, '$');
}

function validationError(
  code: ActionContractValidationErrorCode,
  message: string,
  issues: readonly z.core.$ZodIssue[]
): ActionContractValidationError {
  const normalized: ActionContractValidationIssue[] = issues
    .slice(0, ACTION_CONTRACT_LIMITS.maxPlanValidationIssues)
    .map(issue => ({
      path: issuePath(issue),
      code: issue.code,
      message: issue.message,
    }));
  return new ActionContractValidationError(code, message, normalized);
}

export function parseActionDefinitionId(value: string): ActionDefinitionId {
  const result = actionDefinitionIdSchemaImplementation.safeParse(value);
  if (!result.success || !isActionDefinitionId(value)) {
    throw validationError(
      'invalid-action-definition-id',
      'Action definition ID is not a safe namespaced identifier.',
      result.success ? [] : result.error.issues
    );
  }
  return value;
}

export function parseActionBindingId(value: string): ActionBindingId {
  const result = actionBindingIdSchemaImplementation.safeParse(value);
  if (!result.success || !isActionBindingId(value)) {
    throw validationError(
      'invalid-action-binding-id',
      'Action binding ID is not a valid stable identifier.',
      result.success ? [] : result.error.issues
    );
  }
  return value;
}

export function createActionDefinitionId(namespace: string, name: string): ActionDefinitionId {
  const namespaceResult = z
    .string()
    .min(1)
    .max(ACTION_CONTRACT_LIMITS.maxActionIdLength)
    .regex(ACTION_NAMESPACE_PATTERN)
    .safeParse(namespace);
  const nameResult = z.string().min(1).max(64).regex(ACTION_NAME_PATTERN).safeParse(name);
  if (!namespaceResult.success) {
    throw validationError(
      'invalid-action-definition-id',
      'Action definition namespace is invalid.',
      namespaceResult.error.issues
    );
  }
  if (!nameResult.success) {
    throw validationError(
      'invalid-action-definition-id',
      'Action definition name is invalid.',
      nameResult.error.issues
    );
  }
  return parseActionDefinitionId(`${namespaceResult.data}.${nameResult.data}`);
}

function canonicalIdentityParts(identity: StableActionBindingIdentity): readonly string[] {
  const scopeId = 'scopeId' in identity.scope ? (identity.scope.scopeId ?? '') : '';
  return [
    'action-binding-v1',
    identity.recordTypeKey,
    identity.scope.context,
    identity.scope.mode,
    identity.scope.phase,
    scopeId,
    identity.actionId,
    String(identity.contractVersion),
    identity.stableKey,
  ];
}

function lengthPrefix(parts: readonly string[]): string {
  return parts.map(part => `${Buffer.byteLength(part, 'utf8')}:${part}`).join('|');
}

/**
 * Derives an order-independent stable identity for a configured binding. The
 * caller-provided stable key distinguishes deliberate repeats of one action.
 */
export function deriveStableActionBindingId(identity: StableActionBindingIdentity): ActionBindingId {
  if (!hasSafeActionContractShape(identity)) {
    throw new ActionContractValidationError(
      'invalid-action-binding-id',
      'Cannot derive an action binding ID from an invalid identity.',
      [{ path: '$', code: 'bounded-input', message: 'Input exceeds safe validation limits.' }]
    );
  }
  const result = stableActionBindingIdentitySchema.safeParse(identity);
  if (!result.success) {
    throw validationError(
      'invalid-action-binding-id',
      'Cannot derive an action binding ID from an invalid identity.',
      result.error.issues
    );
  }
  const digest = createHash('sha256')
    .update(lengthPrefix(canonicalIdentityParts(identity)))
    .digest('hex');
  return parseActionBindingId(`actb_${digest.slice(0, 32)}`);
}

export interface SortableActionBinding {
  readonly id: ActionBindingId;
  readonly order: number;
  readonly scope: ActionBindingScope;
}

/** Compares strings by JavaScript UTF-16 code units, independent of host locale. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function scopeSortKey(scope: ActionBindingScope): string {
  const scopeId = 'scopeId' in scope ? (scope.scopeId ?? '') : '';
  return lengthPrefix([scope.context, scope.mode, scope.phase, scopeId]);
}

/** Returns a new, deterministic execution-order view without mutating configuration. */
export function sortActionBindings<T extends SortableActionBinding>(bindings: readonly T[]): T[] {
  return [...bindings].sort((left, right) => {
    const leftScope = scopeSortKey(left.scope);
    const rightScope = scopeSortKey(right.scope);
    const scopeComparison = compareCodeUnits(leftScope, rightScope);
    if (scopeComparison !== 0) {
      return scopeComparison;
    }
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return compareCodeUnits(left.id, right.id);
  });
}
