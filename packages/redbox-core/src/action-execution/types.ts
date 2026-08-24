import { Effect } from 'effect';

export type ActionFailureKind =
  | 'configuration'
  | 'validation'
  | 'domain'
  | 'transient'
  | 'timeout'
  | 'interrupted'
  | 'unexpected';

export type ActionExecutionStatus = 'succeeded' | 'failed' | 'timed_out' | 'interrupted' | 'skipped' | 'dispatched';

export type ActionSkippedReason =
  | 'prior_action_failed'
  | 'phase_not_reached'
  | 'save_not_persisted'
  | 'trigger_disabled';

export type ActionExecutionMode = 'onCreate' | 'onUpdate' | 'onDelete' | 'onTransitionWorkflow';

export type ActionExecutionPhase = 'pre' | 'postSync' | 'post';

export interface ActionExecutionContext {
  executionId: string;
  phaseExecutionId: string;
  trigger: 'record-hook';
  mode: ActionExecutionMode;
  phase: ActionExecutionPhase;
  requestId?: string;
  recordOid?: string;
}

export interface SafeActionFailure {
  kind: ActionFailureKind;
  code: string;
  summary?: string;
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

export interface ActionExecutionCounts {
  succeeded: number;
  failed: number;
  timed_out: number;
  interrupted: number;
  skipped: number;
  dispatched: number;
}

export interface ActionExecutionReport {
  schemaVersion: 1;
  executionId: string;
  phaseExecutionId: string;
  context: ActionExecutionContext;
  status: 'completed' | 'failed' | 'partial' | 'dispatched';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  actions: ActionExecutionResult[];
  counts: ActionExecutionCounts;
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
  /** Injectable wall-clock scheduling for bounded save-side handoffs. */
  schedule?: (durationMs: number, task: () => void) => unknown;
  cancelSchedule?: (handle: unknown) => void;
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
  register?: (fiber: unknown) => void;
  unregister?: (fiber: unknown) => void;
  interruptAll?: () => void;
}

export interface ActionExecutionAction<A = unknown> {
  actionId: string;
  mode: ActionExecutionMode;
  phase: ActionExecutionPhase;
  index: number;
  policy?: ActionExecutionPolicy;
  /** Legacy Promise work is not cancellable even when the wait is timed out. */
  cooperativeCancellation?: boolean | (() => boolean);
  invoke: () => Effect.Effect<A, unknown, never>;
}

export interface ActionExecutionOutcome<A = unknown> {
  report: ActionExecutionReport;
  values: A[];
  /** Kept in memory only for the compatibility adapter. */
  terminalCause?: unknown;
}

export interface ActionExecutionOperation {
  executionId: string;
  trigger: 'record-hook';
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
  detachedAuditTimer?: unknown;
  cancelDetachedAuditTimer?: (handle: unknown) => void;
  operationCompletedLogged?: boolean;
}

export const EMPTY_ACTION_COUNTS: ActionExecutionCounts = {
  succeeded: 0,
  failed: 0,
  timed_out: 0,
  interrupted: 0,
  skipped: 0,
  dispatched: 0,
};
