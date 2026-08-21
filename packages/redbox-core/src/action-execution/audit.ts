import type {
  ActionExecutionMode,
  ActionExecutionOperation,
  ActionExecutionPhase,
  ActionExecutionReport,
  ActionExecutionStatus,
  ActionFailureKind,
  ActionSkippedReason,
} from './types';

export interface RecordHookExecutionAuditAction {
  actionId: string;
  mode: ActionExecutionMode;
  phase: ActionExecutionPhase;
  status: ActionExecutionStatus;
  attempts: number;
  durationMs: number;
  failureKind?: ActionFailureKind;
  failureCode?: string;
  skippedReason?: ActionSkippedReason;
}

export interface RecordHookExecutionAuditSummary {
  schemaVersion: 1;
  executionId: string;
  requestId?: string;
  trigger: 'record-hook';
  operation: 'create' | 'update' | 'delete' | 'transition';
  partial: boolean;
  completedThrough?: 'pre' | 'persistence' | 'postSync' | 'post-dispatch';
  durationMs: number;
  totalActions: number;
  counts: Partial<Record<ActionExecutionStatus, number>>;
  actions: RecordHookExecutionAuditAction[];
  truncated: boolean;
}

/** The design caps a persisted summary at the first 100 actions. */
const MAX_AUDIT_ACTIONS = 100;

const OPERATION_BY_MODE: Record<ActionExecutionMode, RecordHookExecutionAuditSummary['operation']> = {
  onCreate: 'create',
  onUpdate: 'update',
  onDelete: 'delete',
  onTransitionWorkflow: 'transition',
};

function projectAction(action: ActionExecutionReport['actions'][number]): RecordHookExecutionAuditAction {
  const projected: RecordHookExecutionAuditAction = {
    actionId: action.actionId,
    mode: action.mode,
    phase: action.phase,
    status: action.status,
    attempts: action.attempts,
    durationMs: Math.max(0, Math.round(action.durationMs)),
  };
  if (action.failure?.kind) {
    projected.failureKind = action.failure.kind;
  }
  if (action.failure?.code) {
    projected.failureCode = action.failure.code;
  }
  if (action.skippedReason) {
    projected.skippedReason = action.skippedReason;
  }
  return projected;
}

function totalCounts(actions: readonly ActionExecutionReport['actions'][number][]): Partial<Record<ActionExecutionStatus, number>> {
  const totals: Partial<Record<ActionExecutionStatus, number>> = {};
  for (const action of actions) {
    totals[action.status] = (totals[action.status] ?? 0) + 1;
  }
  return totals;
}

function elapsedMs(operation: ActionExecutionOperation): number {
  const lastReport = operation.reports[operation.reports.length - 1];
  const completedAt = new Date(operation.detachedCompletedAt ?? lastReport?.completedAt ?? operation.startedAt).getTime();
  return Math.max(0, Math.round(completedAt - new Date(operation.startedAt).getTime()));
}

/**
 * Project the in-memory execution reports onto the bounded, whitelisted shape
 * that is safe to persist. Aggregate counts always describe the complete
 * report even when the action list is truncated.
 */
export function projectRecordHookExecutionAuditSummary(
  operation: ActionExecutionOperation,
  options: {
    partial?: boolean;
    completedThrough?: RecordHookExecutionAuditSummary['completedThrough'];
    durationMs?: number;
  } = {}
): RecordHookExecutionAuditSummary {
  // Before detached work finishes, the operation log may honestly expose its
  // dispatch entries. The durable audit is projected after pending detached
  // actions reach terminal results, at which point those launch markers are
  // replaced by the compact completed results below.
  const includeDispatched = operation.detachedPending === undefined || operation.detachedPending > 0;
  const phaseActions = operation.reports.flatMap(report =>
    report.actions.filter(action => includeDispatched || action.status !== 'dispatched')
  );
  const detachedResults = [...(operation.detachedResults ?? [])].sort((left, right) => {
    const phaseOrder: Record<ActionExecutionReport['context']['phase'], number> = { pre: 0, postSync: 1, post: 2 };
    return phaseOrder[left.phase] - phaseOrder[right.phase] || left.index - right.index;
  });
  const allActions = [...phaseActions, ...detachedResults];
  const summary: RecordHookExecutionAuditSummary = {
    schemaVersion: 1,
    executionId: operation.executionId,
    trigger: 'record-hook',
    operation: OPERATION_BY_MODE[operation.mode],
    partial: options.partial === true,
    durationMs: options.durationMs ?? elapsedMs(operation),
    totalActions: allActions.length,
    counts: totalCounts(allActions),
    actions: allActions.slice(0, MAX_AUDIT_ACTIONS).map(projectAction),
    truncated: allActions.length > MAX_AUDIT_ACTIONS,
  };
  if (operation.requestId) {
    summary.requestId = operation.requestId;
  }
  if (options.completedThrough ?? operation.completedThrough) {
    summary.completedThrough = options.completedThrough ?? operation.completedThrough;
  }
  return summary;
}
