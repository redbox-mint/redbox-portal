import type {
  ActionExecutionMode,
  ActionExecutionOperation,
  ActionExecutionReport,
  ActionExecutionResult,
  ActionExecutionStatus,
} from './types';
import type {
  RecordActionExecutionActionSummary,
  RecordActionExecutionSummary,
} from '@researchdatabox/sails-ng-common';

export type DetachedAuditFinalization = NonNullable<RecordActionExecutionSummary['detachedFinalization']>;
export type RecordHookExecutionAuditAction = RecordActionExecutionActionSummary;
export type RecordHookExecutionAuditSummary = RecordActionExecutionSummary;

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

function totalCounts(
  actions: readonly ActionExecutionReport['actions'][number][]
): Partial<Record<ActionExecutionStatus, number>> {
  const totals: Partial<Record<ActionExecutionStatus, number>> = {};
  for (const action of actions) {
    totals[action.status] = (totals[action.status] ?? 0) + 1;
  }
  return totals;
}

type ProjectableAction = ActionExecutionReport['actions'][number] | ActionExecutionResult;

/**
 * Detached dispatch and terminal reports have the same action identity. Keep
 * this key internal so a terminal result can replace its launch marker without
 * changing the historical phase report.
 */
function actionKey(action: ProjectableAction): string {
  return [action.mode, action.phase, action.index, action.actionId].join('\u0000');
}

function elapsedMs(operation: ActionExecutionOperation): number {
  const lastReport = operation.reports[operation.reports.length - 1];
  const completedAt = new Date(
    operation.detachedCompletedAt ?? lastReport?.completedAt ?? operation.startedAt
  ).getTime();
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
    detachedFinalization?: DetachedAuditFinalization;
    durationMs?: number;
  } = {}
): RecordHookExecutionAuditSummary {
  // Before detached work finishes, the operation log may honestly expose its
  // dispatch entries. A terminal result replaces the matching launch marker
  // even while other detached actions remain pending. The historical reports
  // themselves are never mutated.
  const includeDispatched = operation.detachedPending === undefined || operation.detachedPending > 0;
  const detachedResults = [...(operation.detachedResults ?? [])].sort((left, right) => {
    const phaseOrder: Record<ActionExecutionReport['context']['phase'], number> = { pre: 0, postSync: 1, post: 2 };
    return phaseOrder[left.phase] - phaseOrder[right.phase] || left.index - right.index;
  });
  const terminalByKey = new Map(detachedResults.map(result => [actionKey(result), result]));
  const projectedKeys = new Set<string>();
  const allActions: ProjectableAction[] = [];

  for (const report of operation.reports) {
    for (const action of report.actions) {
      let projected: ProjectableAction | undefined = action;
      if (action.status === 'dispatched') {
        const terminal = terminalByKey.get(actionKey(action));
        if (terminal) {
          projected = terminal;
        } else if (!includeDispatched) {
          projected = undefined;
        }
      }
      if (projected) {
        allActions.push(projected);
        projectedKeys.add(actionKey(projected));
      }
    }
  }

  // Defensive compatibility path: a terminal callback may be observed before
  // its dispatch report is appended. It still contributes exactly once.
  for (const result of detachedResults) {
    if (!projectedKeys.has(actionKey(result))) {
      allActions.push(result);
      projectedKeys.add(actionKey(result));
    }
  }

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
  if (options.detachedFinalization) {
    summary.detachedFinalization = options.detachedFinalization;
  }
  if ((operation.detachedPending ?? 0) > 0) {
    summary.detachedPending = operation.detachedPending;
  }
  return summary;
}
