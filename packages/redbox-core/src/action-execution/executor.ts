import { Effect } from 'effect';
import * as Cause from 'effect/Cause';
import * as Fiber from 'effect/Fiber';
import { randomUUID } from 'node:crypto';
import { ActionInterruptedFailure, ActionTimeoutFailure, normalizeActionFailure } from './failure';
import { retryDelayMs, validateActionExecutionPolicy } from './policy';
import type {
  ActionExecutionAction,
  ActionExecutionContext,
  ActionExecutionDependencies,
  ActionExecutionCounts,
  ActionExecutionOperation,
  ActionExecutionOutcome,
  ActionExecutionReport,
  ActionExecutionResult,
  ActionExecutionStatus,
  ActionFailureKind,
  ActionSkippedReason,
  SafeActionFailure,
} from './types';
import { EMPTY_ACTION_COUNTS } from './types';

/** A single attempt that fulfilled. */
interface AttemptSuccess {
  ok: true;
  value: unknown;
}

/** A single attempt that failed, keeping the raw cause for the legacy adapter. */
interface AttemptFailure {
  ok: false;
  failure: SafeActionFailure;
  cause: unknown;
}

type Attempt = AttemptSuccess | AttemptFailure;

/** An action after all of its attempts, paired with its serializable result. */
interface ExecutedAction {
  attempt: Attempt;
  result: ActionExecutionResult;
}

/**
 * A failed action is reported as its own status when the executor itself ended
 * the attempt; everything else is an ordinary failure.
 */
const STATUS_BY_FAILURE_KIND: Partial<Record<ActionFailureKind, ActionExecutionStatus>> = {
  timeout: 'timed_out',
  interrupted: 'interrupted',
};

function statusForFailure(failure: SafeActionFailure): ActionExecutionStatus {
  return STATUS_BY_FAILURE_KIND[failure.kind] ?? 'failed';
}

function now(dependencies: ActionExecutionDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function iso(value: Date): string {
  return value.toISOString();
}

function newId(dependencies: ActionExecutionDependencies): string {
  return dependencies.uuid?.() ?? randomUUID();
}

function durationMs(startedAt: string, completedAt: string): number {
  return Math.max(0, Math.round(new Date(completedAt).getTime() - new Date(startedAt).getTime()));
}

function countByStatus(results: readonly ActionExecutionResult[]): ActionExecutionCounts {
  const counts = { ...EMPTY_ACTION_COUNTS };
  for (const result of results) {
    counts[result.status] += 1;
  }
  return counts;
}

function isCooperativelyCancellable(action: ActionExecutionAction): boolean {
  if (typeof action.cooperativeCancellation === 'function') {
    return action.cooperativeCancellation();
  }
  return action.cooperativeCancellation !== false;
}

function maxAttempts(action: Pick<ActionExecutionAction, 'policy'>): number {
  return action.policy?.retry?.maxAttempts ?? 1;
}

type LoggableAction = Pick<ActionExecutionAction, 'actionId' | 'mode' | 'phase' | 'index' | 'policy'>;

function commonFields(
  context: ActionExecutionContext,
  action: LoggableAction,
  attempt?: number
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    execution_id: context.executionId,
    phase_execution_id: context.phaseExecutionId,
  };
  if (context.requestId) {
    fields.request_id = context.requestId;
  }
  if (context.recordOid) {
    fields.record_oid = context.recordOid;
  }
  fields.hook_mode = context.mode;
  fields.hook_phase = context.phase;
  fields.action_id = action.actionId;
  fields.action_index = action.index;
  if (attempt !== undefined) {
    fields.attempt = attempt;
  }
  fields.max_attempts = maxAttempts(action);
  return fields;
}

function finalEventName(status: ActionExecutionStatus, detached: boolean): string {
  if (status === 'succeeded' || status === 'dispatched') {
    return detached ? 'record_hook_detached_action_completed' : 'record_hook_action_completed';
  }
  if (status === 'timed_out') {
    return 'record_hook_action_timed_out';
  }
  return detached ? 'record_hook_detached_action_failed' : 'record_hook_action_failed';
}

function logActionResult(
  dependencies: ActionExecutionDependencies,
  context: ActionExecutionContext,
  action: LoggableAction,
  result: ActionExecutionResult,
  detached: boolean
): void {
  const fields = commonFields(context, action, result.attempts);
  fields.status = result.status;
  fields.duration_ms = result.durationMs;
  if (result.failure) {
    fields.failure_kind = result.failure.kind;
    fields.failure_code = result.failure.code;
    if (result.failure.cancellationCooperative !== undefined) {
      fields.cancellation_cooperative = result.failure.cancellationCooperative;
    }
  }

  const event = finalEventName(result.status, detached);
  if (!result.failure) {
    dependencies.logger?.info?.(event, fields);
    return;
  }
  // Only a genuinely unexpected failure is an operator error; everything else
  // is a hook reporting a problem it already knows about.
  const level = result.failure.kind === 'unexpected' ? 'error' : 'warn';
  dependencies.logger?.[level]?.(event, fields);
}

function logActionStart(
  dependencies: ActionExecutionDependencies,
  context: ActionExecutionContext,
  action: LoggableAction,
  attempt: number,
  detached: boolean
): void {
  const fields = commonFields(context, action, attempt);
  fields.detached = detached;
  dependencies.logger?.debug?.('record_hook_action_started', fields);
}

/**
 * Extract the value the legacy adapter needs to rethrow. Defects and
 * interruptions are converted to branded failures so normalization stays
 * deterministic.
 */
function failureCause(cause: Cause.Cause<unknown>): unknown {
  const failure = Cause.failureOrCause(cause);
  if (failure._tag === 'Left') {
    return failure.left;
  }
  if (Cause.isInterruptedOnly(cause)) {
    return new ActionInterruptedFailure(true);
  }
  return Cause.squash(failure.right);
}

function runAttempt(action: ActionExecutionAction) {
  return Effect.gen(function* () {
    // suspend is deliberate: the legacy adapter invokes the resolved function
    // only when the attempt starts, so retries receive the same live arguments.
    let effect: Effect.Effect<unknown, unknown, never> = Effect.suspend(() => action.invoke());
    if (action.policy?.timeoutMs !== undefined) {
      effect = effect.pipe(
        Effect.timeoutFail({
          duration: `${action.policy.timeoutMs} millis`,
          onTimeout: () => new ActionTimeoutFailure(isCooperativelyCancellable(action)),
        })
      );
    }

    const exit = yield* Effect.exit(effect);
    if (exit._tag === 'Success') {
      return { ok: true, value: exit.value } satisfies AttemptSuccess;
    }
    const cause = failureCause(exit.cause);
    return {
      ok: false,
      cause,
      failure: normalizeActionFailure(cause, isCooperativelyCancellable(action)),
    } satisfies AttemptFailure;
  });
}

function shouldRetry(action: ActionExecutionAction, attemptNumber: number, failure: SafeActionFailure): boolean {
  const retry = action.policy?.retry;
  if (!retry || attemptNumber >= retry.maxAttempts) {
    return false;
  }
  // An opaque Promise keeps running after Effect times out. Retrying it here
  // would overlap the original side effect with a second invocation. The
  // idempotent acknowledgement alone is not enough to make that safe.
  if ((failure.kind === 'timeout' || failure.kind === 'interrupted') && failure.cancellationCooperative === false) {
    return false;
  }
  return (retry.retryOn ?? ['transient']).includes(failure.kind);
}

/**
 * Run one action to completion, including retries and backoff. The reported
 * duration deliberately spans every attempt and every delay between them.
 *
 * `project` lets the caller consume a successful value while the action is
 * still open: if projecting the value fails, the action itself is reported as
 * failed rather than the phase silently continuing.
 */
function executeAction(
  action: ActionExecutionAction,
  dependencies: ActionExecutionDependencies,
  context: ActionExecutionContext,
  detached = false,
  project?: (value: unknown) => void
): Effect.Effect<ExecutedAction, never, never> {
  return Effect.gen(function* () {
    const startedAt = iso(now(dependencies));
    let attemptNumber = 0;
    let attempt: Attempt;

    for (;;) {
      attemptNumber += 1;
      logActionStart(dependencies, context, action, attemptNumber, detached);
      attempt = yield* runAttempt(action);
      if (attempt.ok) {
        const successFields = commonFields(context, action, attemptNumber);
        successFields.status = 'succeeded';
        dependencies.logger?.debug?.('record_hook_action_attempt_succeeded', successFields);
      }
      if (attempt.ok || !shouldRetry(action, attemptNumber, attempt.failure)) {
        break;
      }
      const delay = retryDelayMs(action.policy?.retry?.schedule, attemptNumber, dependencies.random);
      const retryFields = commonFields(context, action, attemptNumber);
      retryFields.failure_kind = attempt.failure.kind;
      retryFields.failure_code = attempt.failure.code;
      retryFields.delay_ms = delay;
      dependencies.logger?.warn?.('record_hook_action_retry_scheduled', retryFields);
      if (delay > 0) {
        yield* (dependencies.sleep?.(delay) ?? Effect.sleep(`${delay} millis`));
      }
    }

    if (attempt.ok && project) {
      try {
        project(attempt.value);
      } catch (error) {
        attempt = {
          ok: false,
          cause: error,
          failure: normalizeActionFailure(error, isCooperativelyCancellable(action)),
        };
      }
    }

    const completedAt = iso(now(dependencies));
    const result: ActionExecutionResult = {
      actionId: action.actionId,
      mode: action.mode,
      phase: action.phase,
      index: action.index,
      status: attempt.ok ? 'succeeded' : statusForFailure(attempt.failure),
      attempts: attemptNumber,
      startedAt,
      completedAt,
      durationMs: durationMs(startedAt, completedAt),
    };
    if (!attempt.ok) {
      result.failure = attempt.failure;
    }
    logActionResult(dependencies, context, action, result, detached);
    return { attempt, result };
  });
}

function skippedResult(
  action: ActionExecutionAction,
  reason: ActionSkippedReason,
  dependencies: ActionExecutionDependencies
): ActionExecutionResult {
  const timestamp = iso(now(dependencies));
  return {
    actionId: action.actionId,
    mode: action.mode,
    phase: action.phase,
    index: action.index,
    status: 'skipped',
    attempts: 0,
    startedAt: timestamp,
    completedAt: timestamp,
    durationMs: 0,
    skippedReason: reason,
  };
}

/**
 * Validate every configured policy before any side effect runs, so an invalid
 * policy is a plain configuration error at the plan boundary rather than a
 * failure discovered halfway through a phase.
 */
function validatedPlan(actions: readonly ActionExecutionAction[]): ActionExecutionAction[] {
  return actions.map(action => ({ ...action, policy: validateActionExecutionPolicy(action.policy) }));
}

export function createActionExecutionOperation(
  mode: ActionExecutionOperation['mode'],
  requestId?: string,
  recordOid?: string,
  dependencies: ActionExecutionDependencies = {}
): ActionExecutionOperation {
  const operation: ActionExecutionOperation = {
    executionId: newId(dependencies),
    trigger: 'record-hook',
    mode,
    reports: [],
    startedAt: iso(now(dependencies)),
  };
  if (requestId) {
    operation.requestId = requestId;
  }
  if (recordOid) {
    operation.recordOid = recordOid;
  }
  return operation;
}

/**
 * Owns detached fibers for the lifetime of a service. A Sails `lower` hook can
 * interrupt the set so shutdown does not leave post-save work running against
 * a closed datastore.
 */
export function createActionExecutionSupervisor(): ActionExecutionDependencies['supervisor'] {
  const fibers = new Set<Fiber.Fiber<unknown, unknown>>();
  return {
    register(fiber: unknown): void {
      if (fiber !== null && typeof fiber === 'object') {
        fibers.add(fiber as Fiber.Fiber<unknown, unknown>);
      }
    },
    unregister(fiber: unknown): void {
      if (fiber !== null && typeof fiber === 'object') {
        fibers.delete(fiber as Fiber.Fiber<unknown, unknown>);
      }
    },
    interruptAll(): void {
      const active = Array.from(fibers);
      fibers.clear();
      for (const fiber of active) {
        Effect.runFork(Fiber.interruptFork(fiber));
      }
    },
  };
}

export function createPhaseContext(
  operation: ActionExecutionOperation,
  phase: ActionExecutionContext['phase'],
  dependencies: ActionExecutionDependencies = {},
  mode: ActionExecutionContext['mode'] = operation.mode
): ActionExecutionContext {
  const context: ActionExecutionContext = {
    executionId: operation.executionId,
    phaseExecutionId: newId(dependencies),
    trigger: 'record-hook',
    mode,
    phase,
  };
  if (operation.requestId) {
    context.requestId = operation.requestId;
  }
  if (operation.recordOid) {
    context.recordOid = operation.recordOid;
  }
  return context;
}

function makeReport(
  context: ActionExecutionContext,
  results: ActionExecutionResult[],
  startedAt: string,
  dependencies: ActionExecutionDependencies,
  status: ActionExecutionReport['status']
): ActionExecutionReport {
  const completedAt = iso(now(dependencies));
  const report: ActionExecutionReport = {
    schemaVersion: 1,
    executionId: context.executionId,
    phaseExecutionId: context.phaseExecutionId,
    context,
    status,
    startedAt,
    completedAt,
    durationMs: durationMs(startedAt, completedAt),
    actions: results,
    counts: countByStatus(results),
  };

  const fields = commonFields(context, { actionId: 'phase', mode: context.mode, phase: context.phase, index: -1 });
  fields.status = status;
  fields.duration_ms = report.durationMs;
  fields.total_actions = results.length;
  dependencies.logger?.info?.('record_hook_phase_completed', fields);
  return report;
}

/**
 * Sequential fail-fast strategy, used for the awaited `pre` and `postSync`
 * phases. `onSuccess` lets the caller thread record/response state between
 * actions without teaching the executor anything about records.
 */
export function runSequentialActionPlan(
  actions: readonly ActionExecutionAction[],
  context: ActionExecutionContext,
  dependencies: ActionExecutionDependencies = {},
  onSuccess?: (value: unknown, actionIndex: number) => void
): Effect.Effect<ActionExecutionOutcome, never, never> {
  const plan = validatedPlan(actions);
  return Effect.gen(function* () {
    const startedAt = iso(now(dependencies));
    const values: unknown[] = [];
    const results: ActionExecutionResult[] = [];
    let terminalCause: unknown;
    let failed = false;

    for (const [index, action] of plan.entries()) {
      const executed = yield* executeAction(action, dependencies, context, false, value => {
        onSuccess?.(value, index);
        values.push(value);
      });
      results.push(executed.result);
      if (executed.attempt.ok) {
        continue;
      }
      failed = true;
      terminalCause = executed.attempt.cause;
      for (const remaining of plan.slice(index + 1)) {
        results.push(skippedResult(remaining, 'prior_action_failed', dependencies));
      }
      break;
    }

    const report = makeReport(context, results, startedAt, dependencies, failed ? 'failed' : 'completed');
    const outcome: ActionExecutionOutcome = { report, values };
    if (terminalCause !== undefined) {
      outcome.terminalCause = terminalCause;
    }
    return outcome;
  });
}

/**
 * Detached dispatch strategy, used for `post`. Each action is forked in
 * configuration order and its terminal result is delivered through the
 * optional completion callback; the dispatch report itself remains an honest
 * record of launch rather than being rewritten after the fact.
 */
export function dispatchDetachedActionPlan(
  actions: readonly ActionExecutionAction[],
  context: ActionExecutionContext,
  dependencies: ActionExecutionDependencies = {}
): ActionExecutionOutcome {
  const plan = validatedPlan(actions);
  const startedAt = iso(now(dependencies));
  const results: ActionExecutionResult[] = [];

  for (const action of plan) {
    const timestamp = iso(now(dependencies));
    results.push({
      actionId: action.actionId,
      mode: action.mode,
      phase: action.phase,
      index: action.index,
      status: 'dispatched',
      attempts: 0,
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
    });
    const fields = commonFields(context, action);
    fields.status = 'dispatched';
    fields.duration_ms = 0;
    dependencies.logger?.info?.('record_hook_action_dispatched', fields);
    // runFork starts the fiber immediately, so the first legacy invocation of
    // each action still happens in configuration order.
    const fiber = Effect.runFork(
      executeAction(action, dependencies, context, true).pipe(
        Effect.tap(executed =>
          Effect.sync(() => dependencies.onDetachedActionComplete?.(context, executed.result))
        ),
        Effect.onExit(exit => {
          if (exit._tag === 'Failure') {
            const interrupted = Cause.isInterruptedOnly(exit.cause);
            const interruptedFields = commonFields(context, action, 1);
            const failure = interrupted
              ? normalizeActionFailure(
                  new ActionInterruptedFailure(isCooperativelyCancellable(action)),
                  isCooperativelyCancellable(action)
                )
              : normalizeActionFailure(failureCause(exit.cause), isCooperativelyCancellable(action));
            const result: ActionExecutionResult = {
              actionId: action.actionId,
              mode: action.mode,
              phase: action.phase,
              index: action.index,
              status: statusForFailure(failure),
              attempts: 1,
              startedAt: iso(now(dependencies)),
              completedAt: iso(now(dependencies)),
              durationMs: 0,
              failure,
            };
            dependencies.onDetachedActionComplete?.(context, result);
            interruptedFields.status = result.status;
            interruptedFields.failure_kind = failure.kind;
            interruptedFields.failure_code = failure.code;
            interruptedFields.cancellation_cooperative = failure.cancellationCooperative;
            interruptedFields.duration_ms = 0;
            dependencies.logger?.warn?.('record_hook_detached_action_failed', interruptedFields);
          }
          return Effect.void;
        })
      )
    );
    dependencies.supervisor?.register?.(fiber);
    // Awaiting the fiber from a separate watcher avoids retaining completed
    // fibers in the supervisor set while keeping shutdown interruption cheap.
    if (dependencies.supervisor?.unregister) {
      Effect.runFork(
        Fiber.await(fiber).pipe(
          Effect.flatMap(() => Effect.sync(() => dependencies.supervisor?.unregister?.(fiber))),
          Effect.catchAll(() => Effect.sync(() => dependencies.supervisor?.unregister?.(fiber)))
        )
      );
    }
  }

  return { report: makeReport(context, results, startedAt, dependencies, 'dispatched'), values: [] };
}

/** Promise bridge for callers outside an Effect program. */
export async function runActionPlan(
  actions: readonly ActionExecutionAction[],
  context: ActionExecutionContext,
  dependencies: ActionExecutionDependencies = {}
): Promise<ActionExecutionOutcome> {
  return Effect.runPromise(runSequentialActionPlan(actions, context, dependencies));
}
