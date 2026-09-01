import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_CONTRACT_LIMITS,
  ACTION_PLAN_SCHEMA_VERSION,
  ActionPlanValidationError,
  actionJsonObjectSchema,
  actionRegistrationSource,
  buildActionRegistry,
  migrateLegacyRecordAction,
  registerRedboxActions,
  resolveActionPlan,
  safeActionIdentifierSchema,
  type ActionActor,
  type ActionBinding,
  type ActionBindingScope,
  type ActionExecutionMode,
  type ActionExecutionPhase,
  type ActionJsonObject,
  type ActionJsonValue,
  type ActionSecretProvider,
  type ActionSecretSlotIdentity,
  type ActionSecretStorage,
  type RedboxActionRegistry,
  type ResolvedActionPlan,
} from '../../action-registry';
import {
  createRegisteredActionExecutor,
  type RegisteredActionExecutionOutcome,
  type RegisteredActionExecutor,
} from '../../action-execution/registered-executor';
import type { ActionExecutionDependencies, ActionExecutionOperation } from '../../action-execution/types';
import { ActionValidationFailure } from '../../action-execution/failure';
import { createActionSecretProvider } from '../../action-registry/secrets';
import { boundedValidationPreflight } from '../../boundedValidation';
import { isRuntimeArray, isRuntimeRecord, type RuntimeRecord, type RuntimeValue } from '../../runtimeValues';

const LIFECYCLE_MODES: readonly ActionExecutionMode[] = ['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow'];
const ACTION_PHASES: readonly ActionExecutionPhase[] = ['pre', 'postSync', 'post'];
const LEGACY_TRANSITION_SCOPE_ID = 'legacy-transition';
const PROTOTYPE_RELATED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

interface JsonProjectionLimits {
  readonly maxArrayItems: number;
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxStringLength: number;
}

const RECORD_CONTEXT_PROJECTION_LIMITS: JsonProjectionLimits = Object.freeze({
  maxArrayItems: ACTION_CONTRACT_LIMITS.maxArrayItems,
  maxBytes: ACTION_CONTRACT_LIMITS.maxJsonBytes,
  maxDepth: ACTION_CONTRACT_LIMITS.maxJsonDepth,
  maxStringLength: ACTION_CONTRACT_LIMITS.maxJsonBytes,
});
const ACTION_PLAN_PROJECTION_LIMITS: JsonProjectionLimits = Object.freeze({
  maxArrayItems: ACTION_CONTRACT_LIMITS.maxPlanBindings,
  maxBytes: ACTION_CONTRACT_LIMITS.maxJsonBytes,
  maxDepth: ACTION_CONTRACT_LIMITS.maxPlanDepth,
  maxStringLength: ACTION_CONTRACT_LIMITS.maxStringValueLength,
});

class ClosedRecordActionSecretStorage implements ActionSecretStorage {
  async replace(_slot: ActionSecretSlotIdentity, _value: string): Promise<void> {
    throw new Error('Persisted record action secrets are unavailable.');
  }

  async clear(_slot: ActionSecretSlotIdentity): Promise<void> {
    throw new Error('Persisted record action secrets are unavailable.');
  }

  async resolve(_slot: ActionSecretSlotIdentity): Promise<string | undefined> {
    throw new Error('Persisted record action secrets are unavailable.');
  }

  async isConfigured(_slot: ActionSecretSlotIdentity): Promise<boolean> {
    return false;
  }
}

const CORE_RECORD_ACTION_REGISTRY = buildActionRegistry([
  actionRegistrationSource('@researchdatabox/redbox-core', 'action-registry/core-actions', registerRedboxActions),
]);
const CLOSED_RECORD_ACTION_SECRET_STORAGE = new ClosedRecordActionSecretStorage();
const CLOSED_RECORD_ACTION_SECRET_PROVIDERS = new WeakMap<RedboxActionRegistry, ActionSecretProvider>();

function invalidPlan(path = '$'): ActionPlanValidationError {
  return new ActionPlanValidationError([
    {
      code: 'invalid-action-plan',
      path,
      message: 'Record action plan is invalid.',
    },
  ]);
}

function ownObjectDataValue(container: object, key: string, path: string): RuntimeValue {
  if (isProxy(container)) {
    throw invalidPlan(path);
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(container, key);
  } catch {
    throw invalidPlan(path);
  }
  if (descriptor === undefined) {
    return undefined;
  }
  if (!('value' in descriptor)) {
    throw invalidPlan(path);
  }
  return descriptor.value;
}

function ownDataValue(container: RuntimeValue, key: string, path: string): RuntimeValue {
  if (container === null || typeof container !== 'object') {
    return undefined;
  }
  if (isProxy(container)) {
    throw invalidPlan(path);
  }
  return isRuntimeRecord(container) ? ownObjectDataValue(container, key, path) : undefined;
}

function legacyScope(
  mode: ActionExecutionMode,
  phase: ActionExecutionPhase,
  transitionScopeId: string
): ActionBindingScope {
  if (mode === 'onTransitionWorkflow') {
    return Object.freeze({
      context: 'workflow-transition',
      mode,
      phase,
      scopeId: transitionScopeId,
    });
  }
  return Object.freeze({ context: 'record-lifecycle', mode, phase });
}

function legacyBindings(
  recordType: RuntimeValue,
  recordTypeKey: string,
  transitionScopeId: string
): readonly ActionBinding[] {
  const hooksValue = ownDataValue(recordType, 'hooks', '$.hooks');
  if (hooksValue === undefined || hooksValue === null) {
    return Object.freeze([]);
  }
  const hooks = projectPlanJson(hooksValue, '$.hooks');
  if (!isRuntimeRecord(hooks)) {
    throw invalidPlan('$.hooks');
  }
  const bindings: ActionBinding[] = [];
  for (const mode of LIFECYCLE_MODES) {
    const modeValue = ownDataValue(hooks, mode, `$.hooks.${mode}`);
    if (modeValue === undefined || modeValue === null) {
      continue;
    }
    if (!isRuntimeRecord(modeValue)) {
      throw invalidPlan(`$.hooks.${mode}`);
    }
    for (const phase of ACTION_PHASES) {
      const phaseValue = ownDataValue(modeValue, phase, `$.hooks.${mode}.${phase}`);
      if (phaseValue === undefined || phaseValue === null) {
        continue;
      }
      if (!isRuntimeArray(phaseValue)) {
        throw invalidPlan(`$.hooks.${mode}.${phase}`);
      }
      const phaseLength = ownObjectDataValue(phaseValue, 'length', `$.hooks.${mode}.${phase}.length`);
      if (
        typeof phaseLength !== 'number' ||
        !Number.isSafeInteger(phaseLength) ||
        phaseLength < 0 ||
        phaseLength > ACTION_CONTRACT_LIMITS.maxArrayItems
      ) {
        throw invalidPlan(`$.hooks.${mode}.${phase}`);
      }
      for (let index = 0; index < phaseLength; index += 1) {
        const sourcePath = `$.hooks.${mode}.${phase}[${index}]`;
        const definition = projectPlanJson(ownObjectDataValue(phaseValue, String(index), sourcePath), sourcePath);
        const migration = migrateLegacyRecordAction({
          schemaVersion: 1,
          recordTypeKey,
          scope: legacyScope(mode, phase, transitionScopeId),
          stableKey: `legacy-${mode}-${phase}-${index}`,
          order: index,
          sourcePath,
          definition,
        });
        if (migration.kind === 'automatic-transition') {
          continue;
        }
        bindings.push(...migration.bindings);
      }
    }
  }
  return Object.freeze(bindings);
}

/** @internal */
export function resolveRecordActionPlan(
  registry: RedboxActionRegistry,
  recordType: RuntimeValue,
  recordTypeKey: string,
  transitionScopeId = LEGACY_TRANSITION_SCOPE_ID,
  resolve: (value: RuntimeValue) => ResolvedActionPlan = value => resolveActionPlan(registry, value)
): ResolvedActionPlan {
  const explicitPlan = ownDataValue(recordType, 'actionPlan', '$.actionPlan');
  const planValue: RuntimeValue =
    explicitPlan === undefined
      ? {
          schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
          recordTypeKey,
          bindings: legacyBindings(recordType, recordTypeKey, transitionScopeId),
        }
      : projectPlanJson(explicitPlan, '$.actionPlan');
  return resolve(planValue);
}

function safeIdentifier(value: RuntimeValue): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const normalized = String(value).trim();
  return safeActionIdentifierSchema.safeParse(normalized).success ? normalized : undefined;
}

function actorRole(value: RuntimeValue): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return safeIdentifier(value);
  }
  return safeIdentifier(ownDataValue(value, 'name', '$.actor.roles[].name'));
}

/** @internal */
export function projectRecordActionActor(value: RuntimeValue): ActionActor | null {
  if (value !== null && typeof value === 'object' && isProxy(value)) {
    throw new ActionValidationFailure('Registered action actor context is invalid.');
  }
  if (!isRuntimeRecord(value)) {
    return null;
  }
  const usernameValue = ownDataValue(value, 'username', '$.actor.username');
  const normalizedUsername = typeof usernameValue === 'string' ? usernameValue.trim() : '';
  const username = normalizedUsername.length > 0 && normalizedUsername.length <= 256 ? normalizedUsername : undefined;
  const id =
    safeIdentifier(ownDataValue(value, 'id', '$.actor.id')) ??
    safeIdentifier(username) ??
    (username === undefined ? undefined : `actor-${createHash('sha256').update(username).digest('hex').slice(0, 32)}`);
  if (id === undefined) {
    return null;
  }
  const rolesValue = ownDataValue(value, 'roles', '$.actor.roles');
  const roles: string[] = [];
  if (rolesValue !== null && typeof rolesValue === 'object' && isProxy(rolesValue)) {
    throw new ActionValidationFailure('Registered action actor context is invalid.');
  }
  if (isRuntimeArray(rolesValue)) {
    const length = ownObjectDataValue(rolesValue, 'length', '$.actor.roles.length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length > ACTION_CONTRACT_LIMITS.maxRoleCount) {
      throw new ActionValidationFailure('Registered action actor context is invalid.');
    }
    for (let index = 0; index < length; index += 1) {
      const projected = actorRole(ownObjectDataValue(rolesValue, String(index), `$.actor.roles[${index}]`));
      if (projected !== undefined) {
        roles.push(projected);
      }
    }
  }
  const uniqueRoles = Array.from(new Set(roles));
  Object.freeze(uniqueRoles);
  return Object.freeze({
    id,
    ...(username === undefined ? {} : { username }),
    roles: uniqueRoles,
  });
}

function projectActionJson(
  value: RuntimeValue,
  seen: WeakSet<object>,
  limits: JsonProjectionLimits
): ActionJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value !== 'object') {
    throw new ActionValidationFailure('Registered action record context is invalid.');
  }
  if (seen.has(value)) {
    throw new ActionValidationFailure('Registered action record context is invalid.');
  }
  seen.add(value);
  try {
    if (isRuntimeArray(value)) {
      const projected: ActionJsonValue[] = [];
      const length = ownObjectDataValue(value, 'length', '$.record.length');
      if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > limits.maxArrayItems) {
        throw new ActionValidationFailure('Registered action record context is invalid.');
      }
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !('value' in descriptor)) {
          throw new ActionValidationFailure('Registered action record context is invalid.');
        }
        const child = projectActionJson(descriptor.value, seen, limits);
        if (child === undefined) {
          throw new ActionValidationFailure('Registered action record context is invalid.');
        }
        projected.push(child);
      }
      return projected;
    }
    const projected: ActionJsonObject = {};
    for (const key of Object.keys(value)) {
      if (key.split('.').some(segment => PROTOTYPE_RELATED_KEYS.has(segment))) {
        throw new ActionValidationFailure('Registered action record context is invalid.');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new ActionValidationFailure('Registered action record context is invalid.');
      }
      const child = projectActionJson(descriptor.value, seen, limits);
      if (child !== undefined) {
        Object.defineProperty(projected, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: child,
        });
      }
    }
    return projected;
  } catch (error) {
    if (error instanceof ActionValidationFailure) {
      throw error;
    }
    throw new ActionValidationFailure('Registered action record context is invalid.');
  } finally {
    seen.delete(value);
  }
}

function projectBoundedJson(value: RuntimeValue, limits: JsonProjectionLimits): ActionJsonValue {
  const preflight = boundedValidationPreflight(value, {
    maxBytes: limits.maxBytes,
    maxDepth: limits.maxDepth,
    maxStringLength: limits.maxStringLength,
    maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
    maxWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => limits.maxArrayItems,
    objectCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxObjectProperties,
  });
  if (!preflight.ok) {
    throw new ActionValidationFailure('Registered action record context is invalid.');
  }
  const projected = projectActionJson(value, new WeakSet(), limits);
  if (projected === undefined) {
    throw new ActionValidationFailure('Registered action record context is invalid.');
  }
  return projected;
}

function projectPlanJson(value: RuntimeValue, path: string): ActionJsonValue {
  try {
    return projectBoundedJson(value, ACTION_PLAN_PROJECTION_LIMITS);
  } catch {
    throw invalidPlan(path);
  }
}

function actionRecord(value: RuntimeValue): ActionJsonObject {
  const projected = projectBoundedJson(value, RECORD_CONTEXT_PROJECTION_LIMITS);
  const parsed = actionJsonObjectSchema.safeParse(projected);
  if (!parsed.success) {
    throw new ActionValidationFailure('Registered action record context is invalid.');
  }
  return parsed.data;
}

/** Project a record through the same bounded immutable context boundary used by registered actions. @internal */
export function projectRecordActionCandidate(value: RuntimeValue): ActionJsonObject {
  return actionRecord(value);
}

/** @internal */
export class RecordActionIdentityFailure extends Error {
  constructor() {
    super('A registered action changed the authoritative record identity.');
    this.name = 'RecordActionIdentityFailure';
  }
}

function normalizeActionCandidateIdentity(candidate: ActionJsonObject, authoritativeOid?: string): ActionJsonObject {
  if (authoritativeOid === undefined) {
    return candidate;
  }
  const suppliedOid = candidate.redboxOid;
  if (
    suppliedOid !== undefined &&
    suppliedOid !== null &&
    suppliedOid !== '' &&
    (typeof suppliedOid !== 'string' || suppliedOid.trim() !== authoritativeOid)
  ) {
    throw new RecordActionIdentityFailure();
  }
  return { ...candidate, redboxOid: authoritativeOid };
}

/** @internal */
export interface RecordActionTransitionContext {
  readonly scopeId: string;
  readonly sourceStage: string;
  readonly targetStage: string;
}

/** @internal */
export interface RegisteredRecordActionCoordinatorOptions {
  readonly registry: RedboxActionRegistry;
  readonly secretProvider: ActionSecretProvider;
  readonly recordType: RuntimeValue;
  readonly recordTypeKey: string;
  readonly brandId: string;
  readonly actor: ActionActor | null;
  readonly current?: RuntimeValue;
  readonly transition?: RecordActionTransitionContext;
  readonly operation: ActionExecutionOperation;
  readonly dependencies?: ActionExecutionDependencies;
}

function scopeFor(
  mode: ActionExecutionMode,
  phase: ActionExecutionPhase,
  transition: RecordActionTransitionContext | undefined
): ActionBindingScope {
  if (mode === 'onTransitionWorkflow') {
    if (transition === undefined) {
      throw new ActionValidationFailure('Registered transition action context is unavailable.');
    }
    return Object.freeze({ context: 'workflow-transition', mode, phase, scopeId: transition.scopeId });
  }
  return Object.freeze({ context: 'record-lifecycle', mode, phase });
}

function sameScope(left: ActionBindingScope, right: ActionBindingScope): boolean {
  return (
    left.context === right.context &&
    left.mode === right.mode &&
    left.phase === right.phase &&
    ('scopeId' in left ? (left.scopeId ?? '') : '') === ('scopeId' in right ? (right.scopeId ?? '') : '')
  );
}

/** @internal */
export class RegisteredRecordActionCoordinator {
  readonly #plan: ResolvedActionPlan;
  readonly #executor: RegisteredActionExecutor;
  readonly #options: RegisteredRecordActionCoordinatorOptions;
  readonly #current?: ActionJsonObject;

  constructor(options: RegisteredRecordActionCoordinatorOptions) {
    const transitionScopeId = options.transition?.scopeId ?? LEGACY_TRANSITION_SCOPE_ID;
    const inferredRecordTypeKey = safeIdentifier(options.recordTypeKey) ?? 'record';
    this.#executor = createRegisteredActionExecutor(options.registry, options.secretProvider, options.dependencies, {
      normalize: candidate => normalizeActionCandidateIdentity(candidate, options.operation.recordOid),
    });
    this.#plan = resolveRecordActionPlan(
      options.registry,
      options.recordType,
      inferredRecordTypeKey,
      transitionScopeId,
      value => this.#executor.preparePlan(value)
    );
    this.#options = options;
    this.#current = options.current === undefined ? undefined : actionRecord(options.current);
  }

  hasBindings(mode: ActionExecutionMode, phase: ActionExecutionPhase): boolean {
    const selectedScope = scopeFor(mode, phase, this.#options.transition);
    return this.#plan.bindings.some(binding => sameScope(binding.binding.scope, selectedScope));
  }

  private context(candidate: RuntimeValue, mode: ActionExecutionMode, phase: ActionExecutionPhase): RuntimeRecord {
    const operation = this.#options.operation;
    const transition = this.#options.transition;
    return {
      schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
      executionId: operation.executionId,
      correlationId: operation.requestId ?? operation.executionId,
      ...(operation.requestId === undefined ? {} : { requestId: operation.requestId }),
      timestamp: new Date().toISOString(),
      brandId: safeIdentifier(this.#options.brandId) ?? 'default',
      recordTypeKey: this.#plan.recordTypeKey,
      scope: scopeFor(mode, phase, transition),
      actor: this.#options.actor,
      record: {
        ...(operation.recordOid === undefined ? {} : { oid: operation.recordOid }),
        ...(this.#current === undefined ? {} : { current: this.#current }),
        candidate: actionRecord(candidate),
      },
      ...(mode !== 'onTransitionWorkflow' || transition === undefined ? {} : { transition }),
      priorOutputs: [],
    };
  }

  runSequential(
    candidate: RuntimeValue,
    mode: ActionExecutionMode,
    phase: Exclude<ActionExecutionPhase, 'post'>
  ): Promise<RegisteredActionExecutionOutcome> {
    return this.#executor.runSequential(this.#plan, this.context(candidate, mode, phase), this.#options.operation);
  }

  dispatchPost(candidate: RuntimeValue, mode: ActionExecutionMode): RegisteredActionExecutionOutcome {
    return this.#executor.dispatchDetached(this.#plan, this.context(candidate, mode, 'post'), this.#options.operation);
  }
}

/** @internal */
export function coreRecordActionRegistry(): RedboxActionRegistry {
  return CORE_RECORD_ACTION_REGISTRY;
}

/** @internal */
export function closedRecordActionSecretProvider(registry: RedboxActionRegistry): ActionSecretProvider {
  const existing = CLOSED_RECORD_ACTION_SECRET_PROVIDERS.get(registry);
  if (existing !== undefined) {
    return existing;
  }
  const provider = createActionSecretProvider(CLOSED_RECORD_ACTION_SECRET_STORAGE);
  CLOSED_RECORD_ACTION_SECRET_PROVIDERS.set(registry, provider);
  return provider;
}
