import { Effect } from 'effect';
import type { RuntimeFiber } from 'effect/Fiber';

export const ACTION_FAILURE_KINDS = [
  'configuration',
  'validation',
  'domain',
  'transient',
  'timeout',
  'interrupted',
  'unexpected',
] as const;

export type ActionFailureKind = (typeof ACTION_FAILURE_KINDS)[number];

export const ACTION_EXECUTION_STATUSES = [
  'succeeded',
  'failed',
  'timed_out',
  'interrupted',
  'skipped',
  'dispatched',
] as const;

export type ActionExecutionStatus = (typeof ACTION_EXECUTION_STATUSES)[number];

export const ACTION_SKIPPED_REASONS = ['prior_action_failed'] as const;

export type ActionSkippedReason = (typeof ACTION_SKIPPED_REASONS)[number];

export type ActionExecutionMode = 'onCreate' | 'onUpdate' | 'onDelete' | 'onTransitionWorkflow';

export type ActionExecutionPhase = 'pre' | 'postSync' | 'post';

export interface ActionExecutionContext {
  executionId: string;
  phaseExecutionId: string;
  mode: ActionExecutionMode;
  phase: ActionExecutionPhase;
  requestId?: string;
  recordOid?: string;
}

export interface SafeActionFailure {
  kind: ActionFailureKind;
  code: string;
  cancellationCooperative?: boolean;
}

export interface ActionExecutionResult {
  actionId: string;
  mode: ActionExecutionMode;
  phase: ActionExecutionPhase;
  index: number;
  status: ActionExecutionStatus;
  attempts: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  failure?: SafeActionFailure;
  skippedReason?: ActionSkippedReason;
}

export interface ActionExecutionReport {
  context: ActionExecutionContext;
  status: 'completed' | 'failed' | 'partial' | 'dispatched';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  actions: ActionExecutionResult[];
}

export interface ActionExecutionPolicy {
  timeoutMs?: number;
  /**
   * Retries only this hook action. `idempotent: true` does not make the
   * enclosing record request replayable and never authorizes a CAS retry.
   */
  retry?: {
    maxAttempts: number;
    retryOn?: ActionFailureKind[];
    schedule?: RetryScheduleConfig;
    idempotent: true;
  };
}

export type RetryScheduleConfig =
  | {
      type: 'fixed';
      delayMs: number;
      jitter?: boolean;
    }
  | {
      type: 'exponential';
      delayMs: number;
      maxDelayMs: number;
      jitter?: boolean;
    };

export interface ActionExecutionDependencies {
  now?: () => Date;
  random?: () => number;
  /** Injectable backoff sleep. Defaults to Effect's live Clock service. */
  sleep?: (durationMs: number) => Effect.Effect<void>;
  uuid?: () => string;
  logger?: ActionExecutionLogger;
  supervisor?: ActionExecutionSupervisor;
  /** Receives the terminal result of each detached action. */
  onDetachedActionComplete?: (context: ActionExecutionContext, result: ActionExecutionResult) => void;
}

export interface ActionExecutionLogger {
  debug?: (message: string, fields?: Record<string, unknown>) => void;
  info?: (message: string, fields?: Record<string, unknown>) => void;
  warn?: (message: string, fields?: Record<string, unknown>) => void;
  error?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface ActionExecutionSupervisor {
  register?: (fiber: RuntimeFiber<unknown, unknown>) => void;
  interruptAll?: () => void;
}

export interface ActionExecutionAction<A = unknown> {
  actionId: string;
  mode: ActionExecutionMode;
  phase: ActionExecutionPhase;
  index: number;
  policy?: ActionExecutionPolicy;
  /** Legacy Promise work is not cancellable even when the wait is timed out. */
  cooperativeCancellation?: () => boolean;
  invoke: () => Effect.Effect<A, unknown, never>;
}

export interface ActionExecutionOutcome {
  report: ActionExecutionReport;
  /** Kept in memory only for the compatibility adapter. */
  terminalCause?: unknown;
}

export interface ActionExecutionOperation {
  executionId: string;
  mode: ActionExecutionMode;
  requestId?: string;
  recordOid?: string;
  reports: ActionExecutionReport[];
  startedAt: string;
  completedThrough?: 'pre' | 'persistence' | 'postSync' | 'post-dispatch';
  /** In-memory lifecycle state for detached actions; never persisted directly. */
  detachedPending?: number;
  detachedResults?: ActionExecutionResult[];
  onDetachedComplete?: () => void;
  detachedCompletedAt?: string;
  /** In-memory guard/state for the exactly-once audit handoff. */
  detachedAuditFinalized?: boolean;
  operationCompletedLogged?: boolean;
}
