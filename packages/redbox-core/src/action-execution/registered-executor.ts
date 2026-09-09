import { isDeepStrictEqual } from 'node:util';
import { Effect } from 'effect';
import {
  actionJsonObjectSchema,
  actionParameterValuesSchema,
  parseActionContext,
  parseActionDefinition,
  parseActionResult,
  validateActionResultForDefinition,
  type ActionContext,
  type ActionHandlerSecrets,
  type ActionJsonObject,
  type ActionJsonValue,
  type ActionOutput,
  type ActionParameterValues,
  type ActionPatchOperation,
  type ActionResult,
  type PriorActionOutput,
} from '../action-registry/contracts';
import type { ActionBindingId, ActionBindingScope } from '../action-registry/identifiers';
import type { ResolvedActionPlan, ResolvedActionPlanBinding } from '../action-registry/plan';
import type { RedboxActionRegistry } from '../action-registry/registration';
import {
  ActionSecretProviderError,
  createActionSecretExecutionBoundary,
  type ActionSecretExecutionBoundary,
  type ActionSecretProvider,
} from '../action-registry/secrets';
import {
  isForbiddenExpressionContextKey,
  projectActionParameterContext,
  projectTextTemplateContext,
} from '../expression-runtime/contexts';
import { ManagedExpressionError } from '../expression-runtime/errors';
import { evaluateManagedJsonata, renderManagedHandlebars } from '../expression-runtime/runtime';
import type { RuntimeValue } from '../runtimeValues';
import {
  ActionConfigurationError,
  ActionDomainFailure,
  ActionInterruptedFailure,
  ActionTimeoutFailure,
  ActionValidationFailure,
} from './failure';
import { legacyHookToEffect, type CancellationCell } from './legacy-result';
import type {
  ActionExecutionAction,
  ActionExecutionContext,
  ActionExecutionDependencies,
  ActionExecutionOperation,
  ActionExecutionPolicy,
  ActionExecutionReport,
  ActionExecutionResult,
  ActionExecutionStatus,
} from './types';
import { createPhaseContext, dispatchDetachedActionPlan, runSequentialActionPlan } from './executor';

interface BindingCompletion {
  readonly status: ActionExecutionStatus;
  readonly safeOutput?: PriorActionOutput;
}

class BindingLatch {
  #completion: BindingCompletion | undefined;
  readonly #waiters: Array<(completion: BindingCompletion) => void> = [];

  current(): BindingCompletion | undefined {
    return this.#completion;
  }

  complete(completion: BindingCompletion): void {
    if (this.#completion !== undefined) {
      return;
    }
    this.#completion = completion;
    for (const waiter of this.#waiters.splice(0)) {
      waiter(completion);
    }
  }

  await(): Effect.Effect<BindingCompletion, never, never> {
    return Effect.async((resume, signal) => {
      const completed = this.#completion;
      if (completed !== undefined) {
        resume(Effect.succeed(completed));
        return;
      }
      const waiter = (completion: BindingCompletion): void => {
        signal.removeEventListener('abort', interrupted);
        resume(Effect.succeed(completion));
      };
      const interrupted = (): void => {
        const index = this.#waiters.indexOf(waiter);
        if (index >= 0) {
          this.#waiters.splice(index, 1);
        }
      };
      this.#waiters.push(waiter);
      signal.addEventListener('abort', interrupted, { once: true });
    });
  }
}

interface BindingRuntimeState {
  readonly latch: BindingLatch;
  projectedOutput?: PriorActionOutput;
}

interface CandidateState {
  candidate?: ActionJsonObject;
}

/** @internal */
export interface RegisteredActionCandidateBoundary {
  normalize(candidate: ActionJsonObject): ActionJsonObject;
}

interface AppliedRegisteredResult {
  readonly candidate?: ActionJsonObject;
  readonly safeOutput?: PriorActionOutput;
}

type ImmutableJsonValue = string | number | boolean | null | readonly ImmutableJsonValue[] | ImmutableJsonObject;

interface ImmutableJsonObject {
  readonly [key: string]: ImmutableJsonValue;
}

/** @internal */
export interface RegisteredActionExecutionOutcome {
  readonly report: ActionExecutionReport;
  readonly candidate?: ActionJsonObject;
  readonly safeOutputs: readonly PriorActionOutput[];
  readonly terminalCause?: RuntimeValue;
}

/** @internal */
export interface RegisteredActionExecutor {
  preparePlan(plan: RuntimeValue): ResolvedActionPlan;
  runSequential(
    plan: RuntimeValue,
    context: RuntimeValue,
    operation: ActionExecutionOperation
  ): Promise<RegisteredActionExecutionOutcome>;
  dispatchDetached(
    plan: RuntimeValue,
    context: RuntimeValue,
    operation: ActionExecutionOperation
  ): RegisteredActionExecutionOutcome;
}

function cloneJsonValue(value: ImmutableJsonValue): ActionJsonValue {
  return structuredClone(value) as ActionJsonValue;
}

function cloneJsonObject(value: ImmutableJsonObject): ActionJsonObject {
  return structuredClone(value) as ActionJsonObject;
}

function freezeJsonValue(value: ActionJsonValue): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    freezeJsonValue(child);
  }
  Object.freeze(value);
}

function freezeParameterValues(parameters: ActionParameterValues): Readonly<ActionParameterValues> {
  for (const value of Object.values(parameters)) {
    if (value.kind === 'literal') {
      freezeJsonValue(value.value);
    }
    Object.freeze(value);
  }
  return Object.freeze(parameters);
}

function redactedSafeJsonValue(value: ActionJsonValue): ActionJsonValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactedSafeJsonValue);
  }
  const redacted: ActionJsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isForbiddenExpressionContextKey(key)) {
      redacted[key] = redactedSafeJsonValue(child);
    }
  }
  return redacted;
}

function safeOutputForBinding(
  result: Exclude<ActionResult, { readonly kind: 'reject' }>,
  resolvedBinding: ResolvedActionPlanBinding
): PriorActionOutput | undefined {
  if (result.output === undefined) {
    return undefined;
  }
  const fields: ActionJsonObject = {};
  for (const fieldName of resolvedBinding.descriptor.outputSchema.safeFields) {
    if (!isForbiddenExpressionContextKey(fieldName) && Object.hasOwn(result.output.fields, fieldName)) {
      fields[fieldName] = redactedSafeJsonValue(result.output.fields[fieldName]);
    }
  }
  freezeJsonValue(fields);
  const output: ActionOutput = Object.freeze({ schemaVersion: 1, fields });
  return Object.freeze({ bindingId: resolvedBinding.binding.id, output });
}

function decodePatchPath(path: string): readonly string[] {
  return path
    .slice(1)
    .split('/')
    .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function arrayIndex(segment: string, length: number, appendAllowed: boolean): number {
  if (appendAllowed && segment === '-') {
    return length;
  }
  if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) {
    throw new ActionValidationFailure('Registered action patch could not be applied.');
  }
  const index = Number(segment);
  const maximum = appendAllowed ? length : length - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index > maximum) {
    throw new ActionValidationFailure('Registered action patch could not be applied.');
  }
  return index;
}

function patchParent(candidate: ActionJsonObject, segments: readonly string[]): ActionJsonObject | ActionJsonValue[] {
  let current: ActionJsonValue = candidate;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      current = current[arrayIndex(segment, current.length, false)];
    } else if (current !== null && typeof current === 'object' && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      throw new ActionValidationFailure('Registered action patch could not be applied.');
    }
  }
  if (current === null || typeof current !== 'object') {
    throw new ActionValidationFailure('Registered action patch could not be applied.');
  }
  return current;
}

function applyPatchOperation(candidate: ActionJsonObject, operation: ActionPatchOperation): void {
  const segments = decodePatchPath(operation.path);
  const segment = segments[segments.length - 1];
  if (segment === undefined) {
    throw new ActionValidationFailure('Registered action patch could not be applied.');
  }
  const parent = patchParent(candidate, segments);
  if (Array.isArray(parent)) {
    const index = arrayIndex(segment, parent.length, operation.op === 'add');
    if (operation.op === 'add') {
      parent.splice(index, 0, cloneJsonValue(operation.value));
    } else if (operation.op === 'replace') {
      parent[index] = cloneJsonValue(operation.value);
    } else {
      parent.splice(index, 1);
    }
    return;
  }
  if (operation.op === 'add') {
    parent[segment] = cloneJsonValue(operation.value);
    return;
  }
  if (!Object.hasOwn(parent, segment)) {
    throw new ActionValidationFailure('Registered action patch could not be applied.');
  }
  if (operation.op === 'replace') {
    parent[segment] = cloneJsonValue(operation.value);
  } else {
    delete parent[segment];
  }
}

function patchedCandidate(
  candidate: ActionJsonObject | undefined,
  operations: readonly ActionPatchOperation[]
): ActionJsonObject {
  if (candidate === undefined) {
    throw new ActionValidationFailure('Registered action patch requires a candidate.');
  }
  const patched = cloneJsonObject(candidate);
  for (const operation of operations) {
    applyPatchOperation(patched, operation);
  }
  const validation = actionJsonObjectSchema.safeParse(patched);
  if (!validation.success) {
    throw new ActionValidationFailure('Registered action patch produced an invalid candidate.');
  }
  return cloneJsonObject(validation.data);
}

function validatedRegisteredResult(value: RuntimeValue, resolvedBinding: ResolvedActionPlanBinding): ActionResult {
  try {
    const result = parseActionResult(value);
    const definition = parseActionDefinition({
      ...resolvedBinding.descriptor,
      handler: resolvedBinding.handler,
    });
    validateActionResultForDefinition(result, definition, resolvedBinding.binding.scope);
    return result;
  } catch {
    throw new ActionValidationFailure('Registered action returned an invalid result.');
  }
}

function applyRegisteredResult(
  value: RuntimeValue,
  resolvedBinding: ResolvedActionPlanBinding,
  candidate: ActionJsonObject | undefined,
  applyCandidateChanges: boolean
): AppliedRegisteredResult {
  const result = validatedRegisteredResult(value, resolvedBinding);
  if (result.kind === 'reject') {
    throw new ActionDomainFailure('Registered action rejected the candidate.', result.code, result.message);
  }

  let nextCandidate = candidate;
  if (result.kind === 'patch') {
    const validatedCandidate = patchedCandidate(candidate, result.patch);
    if (applyCandidateChanges) {
      nextCandidate = validatedCandidate;
    }
  } else if (result.kind === 'replace') {
    const replacement = actionJsonObjectSchema.safeParse(result.candidate);
    if (!replacement.success) {
      throw new ActionValidationFailure('Registered action replacement is invalid.');
    }
    if (applyCandidateChanges) {
      nextCandidate = cloneJsonObject(replacement.data);
    }
  }
  const safeOutput = safeOutputForBinding(result, resolvedBinding);
  return {
    ...(nextCandidate === undefined ? {} : { candidate: nextCandidate }),
    ...(safeOutput === undefined ? {} : { safeOutput }),
  };
}

function sameScope(left: ActionBindingScope, right: ActionBindingScope): boolean {
  return (
    left.context === right.context &&
    left.mode === right.mode &&
    left.phase === right.phase &&
    ('scopeId' in left ? (left.scopeId ?? '') : '') === ('scopeId' in right ? (right.scopeId ?? '') : '')
  );
}

function bindingsForContext(plan: ResolvedActionPlan, context: ActionContext): readonly ResolvedActionPlanBinding[] {
  return plan.bindings.filter(binding => sameScope(binding.binding.scope, context.scope));
}

function validateExecutionRequest(
  plan: ResolvedActionPlan,
  contextValue: RuntimeValue,
  operation: ActionExecutionOperation,
  detached: boolean
): ActionContext {
  const context = parseActionContext(contextValue);
  const modeMatchesOperation =
    context.scope.mode === operation.mode ||
    (context.scope.mode === 'onTransitionWorkflow' &&
      (operation.mode === 'onCreate' || operation.mode === 'onUpdate')) ||
    (operation.mode === 'onTransitionWorkflow' &&
      (context.scope.mode === 'onCreate' || context.scope.mode === 'onUpdate'));
  if (
    context.recordTypeKey !== plan.recordTypeKey ||
    context.executionId !== operation.executionId ||
    !modeMatchesOperation ||
    (detached ? context.scope.phase !== 'post' : context.scope.phase === 'post') ||
    context.priorOutputs.length !== 0 ||
    (operation.requestId !== undefined && context.requestId !== operation.requestId) ||
    (operation.recordOid !== undefined && context.record.oid !== operation.recordOid)
  ) {
    throw new ActionConfigurationError('Registered action execution context does not match the operation.');
  }
  return context;
}

function actionPolicy(resolvedBinding: ResolvedActionPlanBinding): ActionExecutionPolicy {
  const bounds = resolvedBinding.descriptor.executionPolicy;
  const overrides = resolvedBinding.binding.policyOverrides;
  const policy: ActionExecutionPolicy = {
    timeoutMs: overrides?.timeoutMs ?? bounds.timeout.defaultMs,
  };
  if (bounds.retry.allowed) {
    const configured = overrides?.retry;
    const maxAttempts = configured?.maxAttempts ?? bounds.retry.defaultMaxAttempts;
    if (maxAttempts > 1 || configured !== undefined) {
      policy.retry = {
        maxAttempts,
        retryOn: configured?.retryOn === undefined ? ['transient'] : [...configured.retryOn],
        schedule:
          configured?.schedule === undefined
            ? undefined
            : configured.schedule.type === 'fixed'
              ? { ...configured.schedule }
              : { ...configured.schedule },
        idempotent: true,
      };
    }
  }
  return policy;
}

function interruptiblePromiseEffect<Value extends RuntimeValue>(
  invoke: (signal: AbortSignal) => Promise<Value>
): Effect.Effect<Value, RuntimeValue, never> {
  return Effect.tryPromise({ try: invoke, catch: error => error as RuntimeValue });
}

function expressionFailure(cause: RuntimeValue): RuntimeValue {
  if (!(cause instanceof ManagedExpressionError)) {
    return new ActionValidationFailure('Registered action parameter evaluation failed.');
  }
  if (cause.diagnostic.kind === 'timeout') {
    return new ActionTimeoutFailure(cause.diagnostic.workerTerminated);
  }
  if (cause.diagnostic.kind === 'interrupted') {
    return new ActionInterruptedFailure(cause.diagnostic.workerTerminated);
  }
  return new ActionValidationFailure('Registered action parameter evaluation failed.');
}

function evaluatedParameters(
  resolvedBinding: ResolvedActionPlanBinding,
  context: ActionContext
): Effect.Effect<Readonly<ActionParameterValues>, RuntimeValue, never> {
  return Effect.gen(function* () {
    const parameters: ActionParameterValues = {};
    for (const [name, value] of Object.entries(resolvedBinding.binding.parameters)) {
      if (value.kind === 'literal') {
        parameters[name] = { kind: 'literal', value: cloneJsonValue(value.value) };
        continue;
      }
      if (value.kind === 'secret') {
        parameters[name] = { kind: 'secret', configured: value.configured };
        continue;
      }
      const prepared = resolvedBinding.preparedParameters[name];
      if (value.kind === 'jsonata' && prepared?.kind === 'jsonata') {
        const evaluated = yield* interruptiblePromiseEffect(signal =>
          evaluateManagedJsonata(prepared.expression, projectActionParameterContext(context), { signal })
        ).pipe(Effect.mapError(expressionFailure));
        if (evaluated === undefined) {
          return yield* Effect.fail(new ActionValidationFailure('Registered action parameter returned no value.'));
        }
        parameters[name] = { kind: 'literal', value: cloneJsonValue(evaluated) };
        continue;
      }
      if (value.kind === 'handlebars' && prepared?.kind === 'handlebars') {
        const rendered = yield* interruptiblePromiseEffect(signal =>
          renderManagedHandlebars(prepared.template, projectTextTemplateContext(context), { signal })
        ).pipe(Effect.mapError(expressionFailure));
        parameters[name] = { kind: 'literal', value: rendered };
        continue;
      }
      return yield* Effect.fail(new ActionValidationFailure('Registered action parameter is not prepared.'));
    }
    if (!actionParameterValuesSchema.safeParse(parameters).success) {
      return yield* Effect.fail(new ActionValidationFailure('Registered action parameters are invalid.'));
    }
    return freezeParameterValues(parameters);
  });
}

function secretFailure(cause: RuntimeValue): RuntimeValue {
  return cause instanceof ActionSecretProviderError
    ? new ActionDomainFailure('Registered action secret resolution failed.', cause.code)
    : new ActionDomainFailure('Registered action secret resolution failed.');
}

function invocationEffect(
  resolvedBinding: ResolvedActionPlanBinding,
  context: ActionContext,
  secretBoundary: ActionSecretExecutionBoundary,
  cancellation: CancellationCell
): Effect.Effect<RuntimeValue, RuntimeValue, never> {
  return Effect.gen(function* () {
    cancellation.value = true;
    const parameters = yield* evaluatedParameters(resolvedBinding, context);
    let secrets: Readonly<ActionHandlerSecrets> | undefined;
    if (resolvedBinding.descriptor.parameterSchema.parameters.some(parameter => parameter.kind === 'secret')) {
      cancellation.value = false;
      const resolved = yield* legacyHookToEffect(
        () => secretBoundary.resolveHandlerSecrets(context, resolvedBinding),
        cancellation
      ).pipe(Effect.mapError(secretFailure));
      secrets = resolved as Readonly<ActionHandlerSecrets>;
      cancellation.value = true;
    }
    return yield* legacyHookToEffect(() => resolvedBinding.handler(context, parameters, secrets), cancellation);
  });
}

function dependencyRuns(
  resolvedBinding: ResolvedActionPlanBinding,
  states: ReadonlyMap<ActionBindingId, BindingRuntimeState>
): Effect.Effect<boolean, never, never> {
  return Effect.gen(function* () {
    for (const dependency of resolvedBinding.binding.dependencies ?? []) {
      const source = states.get(dependency.bindingId);
      if (source === undefined) {
        return false;
      }
      const completion = yield* source.latch.await();
      if (completion.status !== 'succeeded') {
        return false;
      }
      if (dependency.condition === 'output-equals') {
        const fields = completion.safeOutput?.output.fields;
        if (
          fields === undefined ||
          !Object.hasOwn(fields, dependency.field) ||
          !isDeepStrictEqual(fields[dependency.field], dependency.value)
        ) {
          return false;
        }
      }
    }
    return true;
  });
}

function selectedPriorOutputs(
  resolvedBinding: ResolvedActionPlanBinding,
  states: ReadonlyMap<ActionBindingId, BindingRuntimeState>
): readonly PriorActionOutput[] {
  const selected: PriorActionOutput[] = [];
  for (const access of resolvedBinding.priorOutputs) {
    const output = states.get(access.bindingId)?.latch.current()?.safeOutput;
    if (output === undefined) {
      continue;
    }
    const fields: ActionJsonObject = {};
    for (const fieldName of access.fields) {
      if (Object.hasOwn(output.output.fields, fieldName)) {
        fields[fieldName] = cloneJsonValue(output.output.fields[fieldName]);
      }
    }
    freezeJsonValue(fields);
    selected.push(
      Object.freeze({
        bindingId: access.bindingId,
        output: Object.freeze({ schemaVersion: 1, fields }),
      })
    );
  }
  return Object.freeze(selected);
}

function handlerContext(
  base: ActionContext,
  resolvedBinding: ResolvedActionPlanBinding,
  candidate: ActionJsonObject | undefined,
  states: ReadonlyMap<ActionBindingId, BindingRuntimeState>
): ActionContext {
  return parseActionContext({
    schemaVersion: base.schemaVersion,
    executionId: base.executionId,
    correlationId: base.correlationId,
    ...(base.requestId === undefined ? {} : { requestId: base.requestId }),
    timestamp: base.timestamp,
    brandId: base.brandId,
    recordTypeKey: base.recordTypeKey,
    scope: resolvedBinding.binding.scope,
    actor: base.actor,
    record: {
      ...(base.record.oid === undefined ? {} : { oid: base.record.oid }),
      ...(base.record.current === undefined ? {} : { current: base.record.current }),
      ...(candidate === undefined ? {} : { candidate }),
    },
    ...(base.transition === undefined ? {} : { transition: base.transition }),
    priorOutputs: selectedPriorOutputs(resolvedBinding, states),
  });
}

function runtimeStates(bindings: readonly ResolvedActionPlanBinding[]): Map<ActionBindingId, BindingRuntimeState> {
  return new Map(bindings.map(binding => [binding.binding.id, { latch: new BindingLatch() }]));
}

function registeredActions(
  bindings: readonly ResolvedActionPlanBinding[],
  baseContext: ActionContext,
  candidateState: CandidateState,
  states: ReadonlyMap<ActionBindingId, BindingRuntimeState>,
  secretBoundary: ActionSecretExecutionBoundary,
  applyCandidateChanges: boolean,
  candidateBoundary?: RegisteredActionCandidateBoundary
): ActionExecutionAction[] {
  return bindings.map(resolvedBinding => {
    const state = states.get(resolvedBinding.binding.id);
    if (state === undefined) {
      throw new ActionConfigurationError('Registered action execution state is incomplete.');
    }
    const cancellation: CancellationCell = { value: true };
    return {
      actionId: resolvedBinding.binding.actionId,
      mode: resolvedBinding.binding.scope.mode,
      phase: resolvedBinding.binding.scope.phase,
      index: resolvedBinding.sourceIndex,
      policy: actionPolicy(resolvedBinding),
      cooperativeCancellation: () => cancellation.value,
      shouldRun: () =>
        dependencyRuns(resolvedBinding, states).pipe(
          Effect.tap(runs => (runs ? Effect.void : Effect.sync(() => state.latch.complete({ status: 'skipped' }))))
        ),
      skippedReason: 'trigger_disabled',
      project: value => {
        const applied = applyRegisteredResult(value, resolvedBinding, candidateState.candidate, applyCandidateChanges);
        candidateState.candidate =
          applyCandidateChanges && applied.candidate !== undefined && candidateBoundary !== undefined
            ? candidateBoundary.normalize(applied.candidate)
            : applied.candidate;
        state.projectedOutput = applied.safeOutput;
        if (applyCandidateChanges) {
          state.latch.complete({ status: 'succeeded', safeOutput: applied.safeOutput });
        }
      },
      invoke: () => {
        const context = handlerContext(baseContext, resolvedBinding, candidateState.candidate, states);
        return invocationEffect(resolvedBinding, context, secretBoundary, cancellation);
      },
    };
  });
}

function appendReport(operation: ActionExecutionOperation, report: ActionExecutionReport): void {
  operation.reports.push(report);
  if (report.context.phase === 'pre') {
    operation.completedThrough = 'pre';
  } else if (report.context.phase === 'postSync') {
    operation.completedThrough = 'postSync';
  } else {
    operation.completedThrough = 'post-dispatch';
  }
}

function candidateSnapshot(candidate: ActionJsonObject | undefined): ActionJsonObject | undefined {
  return candidate === undefined ? undefined : cloneJsonObject(candidate);
}

function completedSafeOutputs(
  bindings: readonly ResolvedActionPlanBinding[],
  states: ReadonlyMap<ActionBindingId, BindingRuntimeState>
): readonly PriorActionOutput[] {
  const outputs: PriorActionOutput[] = [];
  for (const binding of bindings) {
    const output = states.get(binding.binding.id)?.latch.current()?.safeOutput;
    if (output !== undefined) {
      outputs.push(output);
    }
  }
  return Object.freeze(outputs);
}

type DetachedCompletionObserver = 'action' | 'operation';

function reportDetachedObserverFailure(
  dependencies: ActionExecutionDependencies,
  context: ActionExecutionContext,
  result: ActionExecutionResult,
  observer: DetachedCompletionObserver
): void {
  const fields: Record<string, RuntimeValue> = {
    execution_id: context.executionId,
    phase_execution_id: context.phaseExecutionId,
    hook_mode: context.mode,
    hook_phase: context.phase,
    action_id: result.actionId,
    action_index: result.index,
    status: result.status,
    observer,
  };
  try {
    dependencies.logger?.error?.('record_hook_detached_completion_observer_failed', fields);
  } catch {
    // Logging is diagnostic only and must never regain completion authority.
  }
}

function notifyDetachedActionObserver(
  observer: ActionExecutionDependencies['onDetachedActionComplete'],
  dependencies: ActionExecutionDependencies,
  context: ActionExecutionContext,
  result: ActionExecutionResult
): void {
  if (observer === undefined) {
    return;
  }
  try {
    void Promise.resolve(observer(context, result)).catch(() => {
      reportDetachedObserverFailure(dependencies, context, result, 'action');
    });
  } catch {
    reportDetachedObserverFailure(dependencies, context, result, 'action');
  }
}

function notifyDetachedOperationObserver(
  observer: (() => void) | undefined,
  dependencies: ActionExecutionDependencies,
  context: ActionExecutionContext,
  result: ActionExecutionResult
): void {
  if (observer === undefined) {
    return;
  }
  try {
    void Promise.resolve(observer()).catch(() => {
      reportDetachedObserverFailure(dependencies, context, result, 'operation');
    });
  } catch {
    reportDetachedObserverFailure(dependencies, context, result, 'operation');
  }
}

class InternalRegisteredActionExecutor implements RegisteredActionExecutor {
  readonly #secretBoundary: ActionSecretExecutionBoundary;
  readonly #preparedPlans = new WeakSet<object>();
  readonly #dependencies: ActionExecutionDependencies;
  readonly #candidateBoundary?: RegisteredActionCandidateBoundary;

  constructor(
    registry: RedboxActionRegistry,
    provider: ActionSecretProvider,
    dependencies: ActionExecutionDependencies,
    candidateBoundary?: RegisteredActionCandidateBoundary
  ) {
    this.#secretBoundary = createActionSecretExecutionBoundary(provider, registry);
    this.#dependencies = dependencies;
    this.#candidateBoundary = candidateBoundary;
  }

  preparePlan(value: RuntimeValue): ResolvedActionPlan {
    const plan = this.#secretBoundary.resolvePlan(value);
    this.#preparedPlans.add(plan);
    return plan;
  }

  private resolvedPlan(value: RuntimeValue): ResolvedActionPlan {
    return value !== null && typeof value === 'object' && this.#preparedPlans.has(value)
      ? (value as ResolvedActionPlan)
      : this.preparePlan(value);
  }

  async runSequential(
    planValue: RuntimeValue,
    contextValue: RuntimeValue,
    operation: ActionExecutionOperation
  ): Promise<RegisteredActionExecutionOutcome> {
    const plan = this.resolvedPlan(planValue);
    const context = validateExecutionRequest(plan, contextValue, operation, false);
    const bindings = bindingsForContext(plan, context);
    const states = runtimeStates(bindings);
    const candidateState: CandidateState = {
      ...(context.record.candidate === undefined ? {} : { candidate: cloneJsonObject(context.record.candidate) }),
    };
    const actions = registeredActions(
      bindings,
      context,
      candidateState,
      states,
      this.#secretBoundary,
      true,
      this.#candidateBoundary
    );
    const executionContext = createPhaseContext(operation, context.scope.phase, this.#dependencies, context.scope.mode);
    const outcome = await Effect.runPromise(runSequentialActionPlan(actions, executionContext, this.#dependencies));
    appendReport(operation, outcome.report);
    return {
      report: outcome.report,
      ...(candidateState.candidate === undefined ? {} : { candidate: candidateSnapshot(candidateState.candidate) }),
      safeOutputs: completedSafeOutputs(bindings, states),
      ...(outcome.terminalCause === undefined ? {} : { terminalCause: outcome.terminalCause }),
    };
  }

  dispatchDetached(
    planValue: RuntimeValue,
    contextValue: RuntimeValue,
    operation: ActionExecutionOperation
  ): RegisteredActionExecutionOutcome {
    const plan = this.resolvedPlan(planValue);
    const context = validateExecutionRequest(plan, contextValue, operation, true);
    const bindings = bindingsForContext(plan, context);
    const states = runtimeStates(bindings);
    const candidateState: CandidateState = {
      ...(context.record.candidate === undefined ? {} : { candidate: cloneJsonObject(context.record.candidate) }),
    };
    const actions = registeredActions(bindings, context, candidateState, states, this.#secretBoundary, false);
    operation.detachedPending = (operation.detachedPending ?? 0) + actions.length;
    const detachedResults = operation.detachedResults ?? [];
    operation.detachedResults = detachedResults;
    const existingCompletion = this.#dependencies.onDetachedActionComplete;
    const completedActionIndexes = new Set<number>();
    const dispatchDependencies: ActionExecutionDependencies = {
      ...this.#dependencies,
      onDetachedActionComplete: (completedContext, result: ActionExecutionResult) => {
        if (completedActionIndexes.has(result.index)) {
          return;
        }
        completedActionIndexes.add(result.index);
        const binding = bindings.find(candidate => candidate.sourceIndex === result.index);
        detachedResults.push(result);
        operation.detachedPending = Math.max(0, (operation.detachedPending ?? 1) - 1);
        operation.detachedCompletedAt = result.completedAt;
        if (binding !== undefined) {
          const state = states.get(binding.binding.id);
          state?.latch.complete({ status: result.status, safeOutput: state.projectedOutput });
        }
        let onDetachedComplete: (() => void) | undefined;
        if (operation.detachedPending === 0) {
          onDetachedComplete = operation.onDetachedComplete;
          operation.onDetachedComplete = undefined;
        }
        notifyDetachedActionObserver(existingCompletion, this.#dependencies, completedContext, result);
        notifyDetachedOperationObserver(onDetachedComplete, this.#dependencies, completedContext, result);
      },
    };
    const executionContext = createPhaseContext(operation, context.scope.phase, this.#dependencies, context.scope.mode);
    const outcome = dispatchDetachedActionPlan(actions, executionContext, dispatchDependencies);
    appendReport(operation, outcome.report);
    return {
      report: outcome.report,
      ...(candidateState.candidate === undefined ? {} : { candidate: candidateSnapshot(candidateState.candidate) }),
      safeOutputs: Object.freeze([]),
    };
  }
}

/**
 * Package-internal A08 entry point. The public barrels intentionally omit this
 * factory so callers cannot manufacture the provider-bound A06 authority.
 *
 * @internal
 */
export function createRegisteredActionExecutor(
  registry: RedboxActionRegistry,
  provider: ActionSecretProvider,
  dependencies: ActionExecutionDependencies = {},
  candidateBoundary?: RegisteredActionCandidateBoundary
): RegisteredActionExecutor {
  return Object.freeze(new InternalRegisteredActionExecutor(registry, provider, dependencies, candidateBoundary));
}
