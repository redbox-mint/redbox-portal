import { FieldPathKind, FormBehaviourActionConfig, FormBehaviourActionType } from '@researchdatabox/sails-ng-common';
import { FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { createFieldValueChangedEvent } from '../events/form-component-event.types';
import { BehaviourCompiledTemplateEvaluator } from './behaviour-compiled-template-evaluator';
import { BehaviourPipelineContext } from './behaviour-processors';
import { BehaviourFieldResolverContext, resolveFieldByPointer } from './behaviour-field-resolver';

/**
 * Dependencies shared by action execution.
 *
 * `getLogicalFieldEntry()` is kept external so the handler owns bind-time
 * validation and locking while the action layer stays focused on execution.
 */
export interface BehaviourActionExecutionContext {
  behaviourIndex: number;
  actionIndex: number;
  listName: 'actions' | 'onError';
  eventBus: FormComponentEventBus;
  compiledTemplateEvaluator?: BehaviourCompiledTemplateEvaluator;
  logger: LoggerService;
  fieldResolverContext: BehaviourFieldResolverContext;
  getLogicalFieldEntry: (listName: 'actions' | 'onError', actionIndex: number) => FormFieldCompMapEntry | undefined;
}

export async function executeBehaviourAction(
  action: FormBehaviourActionConfig,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<boolean> {
  switch (action.type) {
    case FormBehaviourActionType.SetValue:
      return await executeSetValueAction(action, pipelineContext, ctx);
    case FormBehaviourActionType.EmitEvent:
      await executeEmitEventAction(action, pipelineContext, ctx);
      return false;
  }
  return false;
}

/**
 * Execute the v1 `setValue` action.
 *
 * Important behavioural contract:
 * - uses silent mutation (`emitEvent: false`) to avoid event storms and loops
 * - leaves follow-up event emission to explicit `emitEvent` actions
 * - supports `componentJsonPointer`, `jsonata`, and `logical` target modes
 */
async function executeSetValueAction(
  action: Extract<FormBehaviourActionConfig, { type: 'setValue' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<boolean> {
  const config = action.config;
  const fieldPathKind = config.fieldPathKind ?? FieldPathKind.ComponentJsonPointer;
  const resolved =
    fieldPathKind === FieldPathKind.Logical
      ? resolveLogicalField(ctx)
      : await resolveDynamicField(action, pipelineContext, ctx, fieldPathKind);

  if (!resolved) {
    ctx.logger.warn('Behaviour action setValue: target field did not resolve.', {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
      fieldPathKind,
    });
    return false;
  }

  const value = await resolveActionValue(action, pipelineContext, ctx);
  resolved.control.setValue(value, { emitEvent: false });
  resolved.control.markAsDirty();
  return true;
}

/**
 * Execute the v1 `emitEvent` action.
 *
 * v1 deliberately only emits `field.value.changed` so behaviour-produced events
 * stay within the existing event-bus contract used elsewhere in the form app.
 */
async function executeEmitEventAction(
  action: Extract<FormBehaviourActionConfig, { type: 'emitEvent' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<void> {
  const value = await resolveActionValue(action, pipelineContext, ctx);
  ctx.eventBus.publish(
    createFieldValueChangedEvent({
      fieldId: action.config.fieldId,
      sourceId: action.config.sourceId,
      value,
    })
  );
}

/**
 * Resolve the value supplied to an action.
 *
 * If no template is provided, the current pipeline `value` flows through to the
 * action unchanged.
 */
async function resolveActionValue(
  action: FormBehaviourActionConfig,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext
): Promise<unknown> {
  const config = action.config as { hasValueTemplate?: boolean; valueTemplate?: string };
  if (config.hasValueTemplate) {
    if (ctx.compiledTemplateEvaluator) {
      return ctx.compiledTemplateEvaluator.evaluate(
        ctx.behaviourIndex,
        [ctx.listName, ctx.actionIndex, 'config', 'valueTemplate'],
        pipelineContext
      );
    }

    ctx.logger.warn('Behaviour action valueTemplate: compiled evaluator unavailable; falling back to pipeline value.', {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
    });
    return pipelineContext.value;
  }
  if (config.valueTemplate !== undefined) {
    ctx.logger.warn('Behaviour action valueTemplate: ignored raw template because hasValueTemplate is false; falling back to pipeline value.', {
      behaviourIndex: ctx.behaviourIndex,
      actionIndex: ctx.actionIndex,
      listName: ctx.listName,
    });
    return pipelineContext.value;
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
  action: Extract<FormBehaviourActionConfig, { type: 'setValue' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourActionExecutionContext,
  fieldPathKind: string
) {
  let fieldPath = action.config.fieldPath;
  if (fieldPathKind === FieldPathKind.JSONata && action.config.hasFieldPathTemplate && ctx.compiledTemplateEvaluator) {
    const evaluatedFieldPath = await ctx.compiledTemplateEvaluator.evaluate(
      ctx.behaviourIndex,
      [ctx.listName, ctx.actionIndex, 'config', 'fieldPath'],
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
 * by the handler during binding.
 */
function resolveLogicalField(ctx: BehaviourActionExecutionContext) {
  const lockedEntry = ctx.getLogicalFieldEntry(ctx.listName, ctx.actionIndex);
  const currentPointer = lockedEntry?.lineagePaths?.angularComponentsJsonPointer;
  if (!currentPointer) {
    return undefined;
  }
  return resolveFieldByPointer(currentPointer, ctx.fieldResolverContext);
}
