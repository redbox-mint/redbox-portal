import {
  ExpressionsConditionKind,
  ExpressionsConditionKindType,
  FormBehaviourConfigFrame,
  getObjectWithJsonPointer,
} from '@researchdatabox/sails-ng-common';
import { FormComponentEvent } from '../events/form-component-event.types';
import {
  FormComponentEventQuerySource,
  getEventJSONPointerCondition,
} from '../events/form-component-base-event-producer-consumer';
import { BehaviourCompiledTemplateEvaluator } from './behaviour-compiled-template-evaluator';

/**
 * Inputs required to evaluate a behaviour condition without depending on
 * component instance state.
 *
 * The matcher was intentionally extracted from expression consumers so the
 * behaviour runtime can share identical condition semantics while operating at
 * form scope.
 */
export interface BehaviourConditionMatchContext {
  querySource: FormComponentEventQuerySource | undefined;
  compiledTemplateEvaluator: BehaviourCompiledTemplateEvaluator;
  behaviourIndex: number;
  formValue: Record<string, unknown>;
  requestParams: Record<string, unknown>;
}

export async function matchBehaviourCondition(
  condition: string,
  conditionKind: ExpressionsConditionKindType,
  event: FormComponentEvent,
  behaviourConfig: FormBehaviourConfigFrame,
  ctx: BehaviourConditionMatchContext
): Promise<boolean> {
  switch (conditionKind) {
    case ExpressionsConditionKind.JSONPointer:
      return matchJSONPointerCondition(condition, event, behaviourConfig, ctx.querySource);
    case ExpressionsConditionKind.JSONata:
      return matchJSONataCondition(event, behaviourConfig, ctx, false);
    case ExpressionsConditionKind.JSONataQuery:
      return matchJSONataCondition(event, behaviourConfig, ctx, true);
    default:
      return false;
  }
}

/**
 * Applies the same JSONPointer matching rules used by component expressions.
 *
 * Important behaviour preserved from the plan:
 * - scoped events can match exact pointers
 * - broadcast events can match descendants by pointer prefix
 * - `runOnFormReady === false` suppresses ready-time execution
 */
function matchJSONPointerCondition(
  condition: string,
  event: FormComponentEvent,
  behaviourConfig: FormBehaviourConfigFrame,
  querySource: FormComponentEventQuerySource | undefined
): boolean {
  if (!querySource) {
    return false;
  }
  if (event.sourceId === 'form.definition.ready' && behaviourConfig.runOnFormReady === false) {
    return false;
  }

  const pointerCondition = getEventJSONPointerCondition(condition);
  const ref = getObjectWithJsonPointer(querySource.jsonPointerSource, pointerCondition.jsonPointer);
  const hasMatchedTargetEvent = pointerCondition.event === '*' || pointerCondition.event === querySource.event.type;
  const hasScopedMatch = ref !== undefined && pointerCondition.jsonPointer === event.sourceId;
  const eventFieldId = event.fieldId || '';
  const isRunOnFormReady = event.sourceId === 'form.definition.ready' && behaviourConfig.runOnFormReady !== false;
  const hasPointerMatch =
    pointerCondition.jsonPointer === '' ||
    eventFieldId === pointerCondition.jsonPointer ||
    eventFieldId.startsWith(pointerCondition.jsonPointer + '/');
  const hasBroadcastMatch = (event.sourceId === '*' || isRunOnFormReady) && hasPointerMatch;

  return hasMatchedTargetEvent && (hasScopedMatch || hasBroadcastMatch);
}

/**
 * Applies the broadcast-only JSONata gating rule from the existing expression
 * runtime. This is deliberate: JSONata conditions are evaluated against richer
 * runtime context and are not intended to run for every scoped field event.
 *
 * Future work could broaden this contract, but doing so would change behaviour
 * semantics and performance characteristics, so v1 keeps parity with existing
 * expression matching rules.
 */
async function matchJSONataCondition(
  event: FormComponentEvent,
  behaviourConfig: FormBehaviourConfigFrame,
  ctx: BehaviourConditionMatchContext,
  includeQuerySource: boolean
): Promise<boolean> {
  const isRunOnFormReady = event.sourceId === 'form.definition.ready' && behaviourConfig.runOnFormReady !== false;
  // A runOnFormReady behaviour must only fire for the form-ready event itself.
  // Without this guard, any later broadcast event (sourceId="*") would also
  // pass the gate, re-evaluate the condition, and restart the pipeline in a loop.
  if (behaviourConfig.runOnFormReady && !isRunOnFormReady) {
    return false;
  }
  if (event.sourceId !== '*' && !isRunOnFormReady) {
    return false;
  }

  const requestParams = ctx.requestParams;
  const runtimeContext = ctx.querySource?.runtimeContext ?? { requestParams };
  const result = await ctx.compiledTemplateEvaluator.evaluate(ctx.behaviourIndex, ['condition'], {
    value: (event as { value?: unknown }).value,
    event,
    formData: ctx.formValue,
    requestParams,
    runtimeContext,
    ...(includeQuerySource ? { querySource: ctx.querySource?.querySource } : {}),
  });
  return !!result;
}
