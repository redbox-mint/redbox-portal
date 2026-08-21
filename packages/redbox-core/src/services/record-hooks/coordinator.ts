import { Effect } from 'effect';
import { cloneDeep, get } from 'lodash';
import {
  createPhaseContext,
  dispatchDetachedActionPlan,
  runSequentialActionPlan,
} from '../../action-execution/executor';
import { legacyHookToEffect } from '../../action-execution/legacy-result';
import { resolveActionId, validateActionExecutionPolicy } from '../../action-execution/policy';
import type {
  ActionExecutionAction,
  ActionExecutionContext,
  ActionExecutionDependencies,
  ActionExecutionMode,
  ActionExecutionOperation,
  ActionExecutionPhase,
  ActionExecutionReport,
} from '../../action-execution/types';
import type { RecordHookDefinition } from '../../config/recordtype.config';

type AnyRecord = Record<string, unknown>;

/** Resolves a configured hook definition to the callable it names. */
export type RecordHookResolver = (hook: unknown, mode: string, phase: string) => (...args: unknown[]) => unknown;

const HOOK_PHASES: readonly ActionExecutionPhase[] = ['pre', 'postSync', 'post'];

export interface RecordHookCoordinatorOptions {
  operation: ActionExecutionOperation;
  dependencies?: ActionExecutionDependencies;
  resolveHook: RecordHookResolver;
}

export interface RecordHookPreResult {
  record: AnyRecord;
  report: ActionExecutionReport;
  terminalCause?: unknown;
}

export interface RecordHookPostSyncResult {
  record: AnyRecord;
  response: AnyRecord;
  report: ActionExecutionReport;
  terminalCause?: unknown;
}

export interface RecordHookDispatchResult {
  report: ActionExecutionReport;
}

export class RecordHookConfigurationError extends Error {
  readonly _tag = 'RecordHookConfigurationError';
  readonly code = 'invalid-hook-configuration';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this._tag;
  }
}

function invalidConfiguration(mode: string, phase: string): never {
  throw new RecordHookConfigurationError(`Invalid ${phase} hook configuration for ${mode}.`);
}

function hookOptions(hook: unknown): AnyRecord {
  const options = get(hook, 'options') as unknown;
  return options && typeof options === 'object' && !Array.isArray(options) ? (options as AnyRecord) : {};
}

function configuredDefinitions(recordType: unknown, mode: string, phase: string): RecordHookDefinition[] {
  const configured = get(recordType, `hooks.${mode}.${phase}`) as unknown;
  if (configured === undefined) {
    return [];
  }
  if (!Array.isArray(configured)) {
    invalidConfiguration(mode, phase);
  }
  return configured as RecordHookDefinition[];
}

/**
 * Resolve one configured phase into ordered action identities, rejecting
 * malformed definitions, unknown policies, and duplicate identifiers. The
 * caller decides whether to execute or merely validate the result.
 */
function planPhase(
  recordType: unknown,
  mode: string,
  phase: ActionExecutionPhase,
  resolveHook: RecordHookResolver
): Array<{ hook: RecordHookDefinition; actionId: string; index: number }> {
  const hooks = configuredDefinitions(recordType, mode, phase);
  const seenIds = new Set<string>();
  return hooks.map((hook, index) => {
    if (!hook || typeof hook !== 'object' || Array.isArray(hook)) {
      invalidConfiguration(mode, phase);
    }
    const expression = String(get(hook, 'function') ?? '').trim();
    if (!expression) {
      invalidConfiguration(mode, phase);
    }
    const actionId = resolveActionId(get(hook, 'id'), mode, phase, index, expression);
    if (seenIds.has(actionId)) {
      throw new RecordHookConfigurationError(`Duplicate ${phase} hook id '${actionId}' for ${mode}.`);
    }
    seenIds.add(actionId);
    validateActionExecutionPolicy(hook.execution);
    resolveHook(hook, mode, phase);
    return { hook, actionId, index };
  });
}

/**
 * Prevalidate every selected mode before a save starts, so malformed hook
 * configuration fails ahead of any side effect.
 */
export function validateRecordHookConfiguration(
  recordType: unknown,
  modes: readonly string[],
  resolveHook: RecordHookResolver
): void {
  for (const mode of modes) {
    for (const phase of HOOK_PHASES) {
      planPhase(recordType, mode, phase, resolveHook);
    }
  }
}

export class RecordHookCoordinator {
  private readonly options: RecordHookCoordinatorOptions;

  constructor(options: RecordHookCoordinatorOptions) {
    this.options = options;
  }

  private get dependencies(): ActionExecutionDependencies {
    return this.options.dependencies ?? {};
  }

  private phaseContext(mode: string, phase: ActionExecutionPhase): ActionExecutionContext {
    return createPhaseContext(this.options.operation, phase, this.dependencies, mode as ActionExecutionMode);
  }

  private append(report: ActionExecutionReport): void {
    this.options.operation.reports.push(report);
    if (report.context.phase === 'pre') {
      this.options.operation.completedThrough = 'pre';
    } else if (report.context.phase === 'postSync') {
      this.options.operation.completedThrough = 'postSync';
    } else if (report.context.phase === 'post') {
      this.options.operation.completedThrough = 'post-dispatch';
    }
  }

  /**
   * Build the generic actions for one phase. `invoke` supplies the legacy
   * calling convention; the mutable cancellation cell lets the adapter report
   * whether the value it returned can actually be cancelled.
   */
  private actions(
    recordType: unknown,
    mode: string,
    phase: ActionExecutionPhase,
    invoke: (hook: RecordHookDefinition, index: number) => unknown
  ): ActionExecutionAction[] {
    return planPhase(recordType, mode, phase, this.options.resolveHook).map(({ hook, actionId, index }) => {
      return this.action(hook, actionId, mode, phase, index, invoke);
    });
  }

  private action(
    hook: RecordHookDefinition,
    actionId: string,
    mode: string,
    phase: ActionExecutionPhase,
    index: number,
    invoke: (hook: RecordHookDefinition, index: number) => unknown
  ): ActionExecutionAction {
    const cancellation = { value: true };
    return {
      actionId,
      mode: mode as ActionExecutionMode,
      phase,
      index,
      policy: hook.execution,
      cooperativeCancellation: () => cancellation.value,
      invoke: () => legacyHookToEffect(() => invoke(hook, index), cancellation),
    };
  }

  /**
   * Detached hooks historically skipped a malformed entry and continued with
   * later entries. Save-time prevalidation still blocks malformed configuration
   * before persistence; this path preserves the public fire-and-forget method's
   * per-entry compatibility behaviour.
   */
  private detachedActions(
    recordType: unknown,
    mode: string,
    invoke: (hook: RecordHookDefinition, index: number) => unknown
  ): ActionExecutionAction[] {
    const configured = get(recordType, `hooks.${mode}.post`) as unknown;
    if (!Array.isArray(configured)) {
      return [];
    }
    const seenIds = new Set<string>();
    const actions: ActionExecutionAction[] = [];
    configured.forEach((hook, index) => {
      try {
        if (!hook || typeof hook !== 'object' || Array.isArray(hook)) {
          throw new RecordHookConfigurationError('Invalid post hook configuration.');
        }
        const expression = String(get(hook, 'function') ?? '').trim();
        if (!expression) {
          throw new RecordHookConfigurationError('Invalid post hook configuration.');
        }
        const actionId = resolveActionId(get(hook, 'id'), mode, 'post', index, expression);
        if (seenIds.has(actionId)) {
          throw new RecordHookConfigurationError('Duplicate post hook id.');
        }
        validateActionExecutionPolicy(get(hook, 'execution'));
        this.options.resolveHook(hook, mode, 'post');
        seenIds.add(actionId);
        actions.push(this.action(hook as RecordHookDefinition, actionId, mode, 'post', index, invoke));
      } catch (_error) {
        const fields: Record<string, unknown> = {
          execution_id: this.options.operation.executionId,
          hook_mode: mode,
          hook_phase: 'post',
          action_index: index,
          failure_kind: 'configuration',
          failure_code: 'invalid-hook-configuration',
        };
        if (this.options.operation.requestId) {
          fields.request_id = this.options.operation.requestId;
        }
        if (this.options.operation.recordOid) {
          fields.record_oid = this.options.operation.recordOid;
        }
        this.dependencies.logger?.warn?.('record_hook_detached_action_skipped', fields);
      }
    });
    return actions;
  }

  async runPre(
    oid: string | null,
    record: AnyRecord,
    recordType: unknown,
    mode: string,
    user: unknown
  ): Promise<RecordHookPreResult> {
    // Each hook receives the record produced by the previous one.
    let currentRecord = record;
    const actions = this.actions(recordType, mode, 'pre', hook => {
      const fn = this.options.resolveHook(hook, mode, 'pre');
      return fn(oid, currentRecord, hookOptions(hook), user);
    });
    const context = this.phaseContext(mode, 'pre');
    const outcome = await Effect.runPromise(
      runSequentialActionPlan(actions, context, this.dependencies, value => {
        currentRecord = value as AnyRecord;
      })
    );
    this.append(outcome.report);
    return { record: currentRecord, report: outcome.report, terminalCause: outcome.terminalCause };
  }

  async runPostSync(
    oid: string | null,
    record: AnyRecord,
    recordType: unknown,
    mode: string,
    user: unknown,
    initialResponse: AnyRecord
  ): Promise<RecordHookPostSyncResult> {
    let currentRecord = record;
    let response = initialResponse;
    // Each hook is handed its own clone of the response so far, and keeps that
    // same clone across retries. Hooks are allowed to mutate it in place.
    const hookInputs = new Map<number, AnyRecord>();
    const actions = this.actions(recordType, mode, 'postSync', (hook, index) => {
      const fn = this.options.resolveHook(hook, mode, 'postSync');
      let hookInput = hookInputs.get(index);
      if (hookInput === undefined) {
        hookInput = cloneDeep(response) as AnyRecord;
        hookInputs.set(index, hookInput);
      }
      return fn(oid, currentRecord, hookOptions(hook), user, hookInput);
    });

    const hooks = configuredDefinitions(recordType, mode, 'postSync');
    // A hook that returns the wrong shape fails its own action, so the phase
    // stops here and the partial report is still reported to the caller.
    const applyResult = (value: unknown, index: number): void => {
      const options = hookOptions(hooks[index]);
      const returnType = options.returnType === undefined ? 'record' : options.returnType;
      if (returnType === 'record') {
        if (!value || typeof value !== 'object') {
          throw new Error('Post-save record hook did not return a record');
        }
        currentRecord = value as AnyRecord;
      } else if (value && typeof value === 'object') {
        response = mergeLegacyHookResponse(response, value as AnyRecord);
      }
      response = mergeWorkspaceFields(response, hookInputs.get(index));
    };

    const context = this.phaseContext(mode, 'postSync');
    const outcome = await Effect.runPromise(runSequentialActionPlan(actions, context, this.dependencies, applyResult));
    this.append(outcome.report);
    return { record: currentRecord, response, report: outcome.report, terminalCause: outcome.terminalCause };
  }

  dispatchPost(
    oid: string | null,
    record: AnyRecord,
    recordType: unknown,
    mode: string,
    user: unknown
  ): RecordHookDispatchResult {
    const actions = this.detachedActions(recordType, mode, hook => {
      const fn = this.options.resolveHook(hook, mode, 'post');
      return fn(oid, record, hookOptions(hook), user);
    });
    const context = this.phaseContext(mode, 'post');
    const outcome = dispatchDetachedActionPlan(actions, context, this.dependencies);
    this.append(outcome.report);
    return { report: outcome.report };
  }
}

/** Only the legacy response-field whitelist is merged back into the response. */
function mergeLegacyHookResponse(response: AnyRecord, returned: AnyRecord): AnyRecord {
  const merged: AnyRecord = { ...response };
  if (typeof returned.success === 'boolean') {
    merged.success = returned.success;
  }
  if (typeof returned.message === 'string') {
    merged.message = returned.message;
  }
  if (Object.hasOwn(returned, 'data')) {
    merged.data = returned.data;
  }
  if (Object.hasOwn(returned, 'metadata')) {
    merged.metadata = returned.metadata;
  }
  return merged;
}

/** Workspace fields are read back from the response clone the hook mutated. */
function mergeWorkspaceFields(response: AnyRecord, hookInput: AnyRecord | undefined): AnyRecord {
  if (!hookInput) {
    return response;
  }
  const merged: AnyRecord = { ...response };
  if (typeof hookInput.workspaceOid === 'string' && hookInput.workspaceOid.trim()) {
    merged.workspaceOid = hookInput.workspaceOid;
  }
  if (Object.hasOwn(hookInput, 'workspaceData')) {
    merged.workspaceData = hookInput.workspaceData;
  }
  return merged;
}
