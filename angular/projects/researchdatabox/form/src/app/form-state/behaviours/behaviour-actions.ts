import {
  FieldPathKind,
  FieldPathKindType,
  FormBehaviourActionConfig,
  FormBehaviourActionType,
  FormBehaviourFieldAssignmentInstruction,
  FormBehaviourSetUIPropertyEntry,
  FormBehaviourSetValueActionConfig,
  FormExpressionsTargetModelValue,
  FormExpressionsTargetValidationGroups,
} from '@researchdatabox/sails-ng-common';
import { FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { createFieldValueChangedEvent } from '../events/form-component-event.types';
import { applyExpressionTarget, ApplyExpressionTargetContext, ExpressionTargetHost } from '../apply-expression-target';
import { BehaviourCompiledTemplateEvaluator } from './behaviour-compiled-template-evaluator';
import { BehaviourPipelineContext } from './behaviour-processors';
import { BehaviourFieldResolverContext, ResolvedField, resolveFieldByPointer } from './behaviour-field-resolver';

/**
 * Dependencies shared by action execution.
 *
 * `getLogicalFieldEntry()` is kept external so the handler owns bind-time
 * validation and locking while the action layer stays focused on execution.
 * The optional `entryIndex` addresses nested `values`/`properties` entries.
 *
 * `updatePipelineValue` / `setPipelineContextKey` write back into handler-held
 * state because the handler rebuilds the pipeline context for every action
 * (so `formData` re-snapshots after each mutation); direct writes to the
 * per-action context object would be lost.
 */
export interface BehaviourActionExecutionContext {
  behaviourIndex: number;
  actionIndex: number;
  listName: 'actions' | 'onError';
  eventBus: FormComponentEventBus;
  compiledTemplateEvaluator?: BehaviourCompiledTemplateEvaluator;
  logger: LoggerService;
  broadcastFormStatus?: () => void;
  fieldResolverContext: BehaviourFieldResolverContext;
  getLogicalFieldEntry: (
    listName: 'actions' | 'onError',
    actionIndex: number,
    entryIndex?: number
  ) => FormFieldCompMapEntry | undefined;
  isEntrySkipped?: (listName: 'actions' | 'onError', actionIndex: number, entryIndex: number) => boolean;
  updatePipelineValue?: (value: unknown) => void;
  setPipelineContextKey?: (key: string, value: unknown) => void;
}

/**
 * Path segments addressing an entry config relative to the action root, used
 * to build compiled-template keys that match the template visitor extraction,
 * e.g. `['config']`, `['config', 'values', 0]`, `['config', 'properties', 1]`.
 */
type BehaviourActionConfigKeyPath = (string | number)[];

const ACTION_CONFIG_KEY_PATH: BehaviourActionConfigKeyPath = ['config'];

export async function executeBehaviourAction(
  action: FormBehaviourActionConfig,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  switch (action.type) {
    case FormBehaviourActionType.SetValue:
      await executeSetValueEntry(action.config, ACTION_CONFIG_KEY_PATH, undefined, pipelineContext, ctx);
      return;
    case FormBehaviourActionType.SetValues:
      await executeSetValuesAction(action, pipelineContext, ctx);
      return;
    case FormBehaviourActionType.EmitEvent:
      await executeEmitEventAction(action, pipelineContext, ctx);
      return;
    case FormBehaviourActionType.RunTemplate:
      await executeRunTemplateAction(action, pipelineContext, ctx);
      return;
    case FormBehaviourActionType.SetUIProperty:
      await executeSetUIPropertyAction(action, pipelineContext, ctx);
      return;
    case FormBehaviourActionType.SetUIProperties:
      await executeSetUIPropertiesAction(action, pipelineContext, ctx);
      return;
  }
}

/**
 * Execute one `setValue`-style assignment, shared by the `setValue` action and
 * each `setValues` entry.
 *
 * Important behavioural contract:
 * - uses silent mutation (`emitEvent: false`) to avoid event storms and loops
 * - leaves follow-up event emission to explicit `emitEvent` actions
 * - supports `componentJsonPointer`, `jsonata`, and `logical` target modes
 */
async function executeSetValueEntry(
  entryConfig: FormBehaviourSetValueActionConfig,
  configKeyPath: BehaviourActionConfigKeyPath,
  entryIndex: number | undefined,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  const fieldPathKind = entryConfig.fieldPathKind ?? FieldPathKind.ComponentJsonPointer;
  const resolved =
    fieldPathKind === FieldPathKind.Logical
      ? resolveLogicalField(ctx, entryIndex)
      : await resolveDynamicField(entryConfig, configKeyPath, pipelineContext, ctx, fieldPathKind);

  if (!resolved) {
    ctx.logger.warn('Behaviour action setValue: target field did not resolve.', {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
      entryIndex,
      fieldPathKind,
    });
    return;
  }

  const value = await resolveActionValue(entryConfig, configKeyPath, pipelineContext, ctx);
  resolved.control.setValue(value, { emitEvent: false });
  resolved.control.markAsDirty();
  ctx.broadcastFormStatus?.();
}

/**
 * Execute the `setValues` action: each entry mirrors `setValue` exactly and is
 * applied in order. Entries that fail to resolve are warn-and-skipped
 * individually so the remaining entries still run.
 */
async function executeSetValuesAction(
  action: Extract<FormBehaviourActionConfig, { type: 'setValues' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  for (const [entryIndex, entry] of (action.config.values ?? []).entries()) {
    if (ctx.isEntrySkipped?.(ctx.listName, ctx.actionIndex, entryIndex)) {
      continue;
    }
    await executeSetValueEntry(entry, ['config', 'values', entryIndex], entryIndex, pipelineContext, ctx);
  }
}

/**
 * Execute the `emitEvent` action.
 *
 * This deliberately only emits `field.value.changed` so behaviour-produced
 * events stay within the existing event-bus contract used elsewhere in the
 * form app.
 */
async function executeEmitEventAction(
  action: Extract<FormBehaviourActionConfig, { type: 'emitEvent' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  const value = await resolveActionValue(action.config, ACTION_CONFIG_KEY_PATH, pipelineContext, ctx);
  ctx.eventBus.publish(
    createFieldValueChangedEvent({
      fieldId: action.config.fieldId,
      sourceId: action.config.sourceId,
      value,
    })
  );
}

/**
 * Execute the `runTemplate` action.
 *
 * Result handling (see the config outline for the full contract):
 * - `resultKey` stores the result into handler-held pipeline context extras
 * - otherwise the result replaces the pipeline `value`, unless `applyResults`
 *   consumes it
 * - `applyResults` treats the result as field-assignment instructions
 */
async function executeRunTemplateAction(
  action: Extract<FormBehaviourActionConfig, { type: 'runTemplate' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  const config = action.config;
  if (!config.hasTemplate || !ctx.compiledTemplateEvaluator) {
    ctx.logger.warn('Behaviour action runTemplate: no compiled template available; action skipped.', {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
      hasTemplate: !!config.hasTemplate,
    });
    return;
  }

  const result = await ctx.compiledTemplateEvaluator.evaluate(
    ctx.behaviourIndex,
    [ctx.listName, ctx.actionIndex, 'config', 'template'],
    pipelineContext
  );

  if (config.resultKey) {
    ctx.setPipelineContextKey?.(config.resultKey, result);
  } else if (!config.applyResults) {
    ctx.updatePipelineValue?.(result);
  }

  if (config.applyResults) {
    await applyRunTemplateInstructions(result, pipelineContext, ctx);
  }
}

/**
 * Apply the instruction list produced by a `runTemplate` `applyResults`
 * evaluation. A single object result is wrapped into a one-entry list; each
 * invalid or unresolvable instruction is warn-and-skipped so the rest still
 * apply.
 */
async function applyRunTemplateInstructions(
  result: unknown,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  const instructions = Array.isArray(result) ? result : typeof result === 'object' && result !== null ? [result] : undefined;
  if (!instructions) {
    ctx.logger.warn('Behaviour action runTemplate: applyResults expected an instruction object or array.', {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
      resultType: typeof result,
    });
    return;
  }

  for (const [instructionIndex, candidate] of instructions.entries()) {
    const instruction = (typeof candidate === 'object' && candidate !== null ? candidate : undefined) as
      | FormBehaviourFieldAssignmentInstruction
      | undefined;
    const target = instruction?.target ?? FormExpressionsTargetModelValue;
    const warnContext = {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
      instructionIndex,
      target,
    };
    if (!instruction) {
      ctx.logger.warn('Behaviour action runTemplate: instruction is not an object; skipped.', warnContext);
      continue;
    }

    let host: ExpressionTargetHost = {};
    if (target !== FormExpressionsTargetValidationGroups) {
      if (typeof instruction.fieldPath !== 'string' || !instruction.fieldPath) {
        ctx.logger.warn('Behaviour action runTemplate: instruction fieldPath missing; skipped.', warnContext);
        continue;
      }
      const resolved = resolveFieldByPointer(instruction.fieldPath, ctx.fieldResolverContext);
      if (!resolved) {
        ctx.logger.warn('Behaviour action runTemplate: instruction target field did not resolve; skipped.', {
          ...warnContext,
          fieldPath: instruction.fieldPath,
        });
        continue;
      }
      host = buildTargetHost(resolved.entry);
    }

    await applyExpressionTarget(target, instruction.value, host, buildTargetContext(pipelineContext, ctx));
  }
}

/**
 * Execute the `setUIProperty` action: a single UI-property assignment.
 */
async function executeSetUIPropertyAction(
  action: Extract<FormBehaviourActionConfig, { type: 'setUIProperty' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  await applySingleUIProperty(
    action.config,
    action.config,
    ACTION_CONFIG_KEY_PATH,
    ACTION_CONFIG_KEY_PATH,
    undefined,
    pipelineContext,
    ctx
  );
}

/**
 * Execute the `setUIProperties` action. Entries that do not provide their own
 * `fieldPath` (or `hasFieldPathTemplate`) inherit the action-level defaults,
 * including the default's `fieldPathKind` and compiled-template key.
 */
async function executeSetUIPropertiesAction(
  action: Extract<FormBehaviourActionConfig, { type: 'setUIProperties' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  for (const [entryIndex, entry] of (action.config.properties ?? []).entries()) {
    if (ctx.isEntrySkipped?.(ctx.listName, ctx.actionIndex, entryIndex)) {
      continue;
    }
    const entryKeyPath: BehaviourActionConfigKeyPath = ['config', 'properties', entryIndex];
    const usesOwnFieldPath = entry.fieldPath !== undefined || entry.hasFieldPathTemplate === true;
    await applySingleUIProperty(
      entry,
      usesOwnFieldPath ? entry : action.config,
      usesOwnFieldPath ? entryKeyPath : ACTION_CONFIG_KEY_PATH,
      entryKeyPath,
      usesOwnFieldPath ? entryIndex : undefined,
      pipelineContext,
      ctx
    );
  }
}

/**
 * Apply one UI-property assignment shared by `setUIProperty` and each
 * `setUIProperties` entry.
 *
 * `fieldPathConfig` / `fieldPathKeyPath` may point at the action-level
 * defaults when a plural entry inherits them; `logicalEntryIndex` is only set
 * when the entry owns its (logical) field path so the right bind-time lock is
 * consulted.
 */
async function applySingleUIProperty(
  entry: FormBehaviourSetUIPropertyEntry,
  fieldPathConfig: Pick<FormBehaviourSetUIPropertyEntry, 'fieldPath' | 'fieldPathKind' | 'hasFieldPathTemplate'>,
  fieldPathKeyPath: BehaviourActionConfigKeyPath,
  valueKeyPath: BehaviourActionConfigKeyPath,
  logicalEntryIndex: number | undefined,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  let host: ExpressionTargetHost = {};
  if (entry.target !== FormExpressionsTargetValidationGroups) {
    const fieldPathKind = fieldPathConfig.fieldPathKind ?? FieldPathKind.ComponentJsonPointer;
    const resolved =
      fieldPathKind === FieldPathKind.Logical
        ? resolveLogicalField(ctx, logicalEntryIndex)
        : await resolveDynamicField(fieldPathConfig, fieldPathKeyPath, pipelineContext, ctx, fieldPathKind);
    if (!resolved) {
      ctx.logger.warn('Behaviour action setUIProperty: target field did not resolve.', {
        behaviourIndex: ctx.behaviourIndex,
        actionIndex: ctx.actionIndex,
        listName: ctx.listName,
        target: entry.target,
        fieldPathKind,
      });
      return;
    }
    host = buildTargetHost(resolved.entry);
  }

  const value = await resolveActionValue(entry, valueKeyPath, pipelineContext, ctx, { allowLiteralValue: true });
  await applyExpressionTarget(entry.target, value, host, buildTargetContext(pipelineContext, ctx));
}

function buildTargetHost(entry: FormFieldCompMapEntry): ExpressionTargetHost {
  return {
    model: entry.model,
    component: entry.component,
    layout: entry.layout,
  };
}

function buildTargetContext(
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): ApplyExpressionTargetContext {
  return {
    eventBus: ctx.eventBus,
    logger: ctx.logger,
    broadcastFormStatus: ctx.broadcastFormStatus,
    eventFieldId: (pipelineContext.event as { fieldId?: string } | undefined)?.fieldId,
  };
}

/**
 * Resolve the value supplied to an action or nested entry.
 *
 * Precedence: compiled `valueTemplate` (via `hasValueTemplate`) wins over a
 * literal `value` key (UI-property entries only), which wins over the pipeline
 * `value`. If no template or literal is provided, the current pipeline `value`
 * flows through to the action unchanged.
 */
async function resolveActionValue(
  entryConfig: { hasValueTemplate?: boolean; valueTemplate?: string; value?: unknown },
  configKeyPath: BehaviourActionConfigKeyPath,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext,
  options?: { allowLiteralValue?: boolean }
): Promise<unknown> {
  if (entryConfig.hasValueTemplate) {
    if (ctx.compiledTemplateEvaluator) {
      return ctx.compiledTemplateEvaluator.evaluate(
        ctx.behaviourIndex,
        [ctx.listName, ctx.actionIndex, ...configKeyPath, 'valueTemplate'],
        pipelineContext
      );
    }

    ctx.logger.warn('Behaviour action valueTemplate: compiled evaluator unavailable; falling back to pipeline value.', {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
      configKeyPath,
    });
    return pipelineContext.value;
  }
  if (entryConfig.valueTemplate !== undefined) {
    ctx.logger.warn('Behaviour action valueTemplate: ignored raw template because hasValueTemplate is false; falling back to pipeline value.', {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
      configKeyPath,
    });
    return pipelineContext.value;
  }
  if (options?.allowLiteralValue && 'value' in entryConfig) {
    return entryConfig.value;
  }
  return pipelineContext.value;
}

/**
 * Resolve a non-logical target field at execution time.
 *
 * `jsonata` targeting is primarily intended for same-row repeatable updates,
 * while literal pointer targeting remains the default and simplest option.
 */
async function resolveDynamicField(
  entryConfig: { fieldPath?: string; hasFieldPathTemplate?: boolean },
  configKeyPath: BehaviourActionConfigKeyPath,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext,
  fieldPathKind: FieldPathKindType
): Promise<ResolvedField | undefined> {
  let fieldPath = entryConfig.fieldPath;
  if (fieldPathKind === FieldPathKind.JSONata && entryConfig.hasFieldPathTemplate && ctx.compiledTemplateEvaluator) {
    const evaluatedFieldPath = await ctx.compiledTemplateEvaluator.evaluate(
      ctx.behaviourIndex,
      [ctx.listName, ctx.actionIndex, ...configKeyPath, 'fieldPath'],
      pipelineContext
    );
    fieldPath = typeof evaluatedFieldPath === 'string' ? evaluatedFieldPath : '';
  }

  if (!fieldPath) {
    return undefined;
  }
  return resolveFieldByPointer(fieldPath, ctx.fieldResolverContext);
}

/**
 * Resolve a logical target using the locked repeatable entry identity captured
 * by the handler during binding. `entryIndex` addresses nested
 * `values`/`properties` entries that own their logical field path.
 */
function resolveLogicalField(
  ctx: BehaviourActionExecutionContext,
  entryIndex: number | undefined
): ResolvedField | undefined {
  const lockedEntry = ctx.getLogicalFieldEntry(ctx.listName, ctx.actionIndex, entryIndex);
  const currentPointer = lockedEntry?.lineagePaths?.angularComponentsJsonPointer;
  if (!currentPointer) {
    return undefined;
  }
  return resolveFieldByPointer(currentPointer, ctx.fieldResolverContext);
}
