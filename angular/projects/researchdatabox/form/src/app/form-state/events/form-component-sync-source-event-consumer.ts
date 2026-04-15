import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  createFieldValueChangedEvent,
  FieldValueChangedEvent,
  FormComponentEventType,
  FormComponentEventTypeValue,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import {
  ExpressionsConditionKind,
  FormExpressionsConfigFrame,
  getObjectWithJsonPointer,
} from '@researchdatabox/sails-ng-common';
import { FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';

/**
 * Dedicated value-change consumer for components that declare syncSources.
 *
 * Design intent:
 * - keep the regular value-change consumer unchanged for existing components
 * - make sync-source behaviour opt-in via component config
 * - treat `undefined` template results as "no-op" rather than "clear value"
 *
 * This supports additive contributor-permission sync where typeahead keystrokes
 * must not wipe repeatable rows before the user commits a selection.
 */
export class FormComponentSyncSourceEventConsumer extends FormComponentEventBaseConsumer {
  protected override readonly consumedEventType: FormComponentEventTypeValue =
    FormComponentEventType.FIELD_VALUE_CHANGED;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  /**
   * Delay the initial replay until the wrapper has finished binding the
   * component and seeding query-source state. This keeps initial sync aligned
   * with the "run on first render" behaviour described in the implementation
   * plan without depending on a form-ready event reaching this lazy consumer.
   */
  override bind(options: FormComponentEventBindingOptions): void {
    super.bind(options);
    setTimeout(() => {
      void this.consumeInitialSyncExpressions();
    }, 0);
  }

  protected override async consumeEvent(
    event: FieldValueChangedEvent,
    expression: FormExpressionsConfigFrame
  ): Promise<void> {
    let targetValue: unknown = event.value;
    if (expression.config.hasTemplate) {
      targetValue = await this.evaluateExpressionJSONata(expression, event, 'template');
      if (targetValue === undefined) {
        return;
      }
    }

    if ('target' in expression.config) {
      const exprTarget = expression.config.target || '';
      await this.setTarget(targetValue, exprTarget, event, expression);
    }
  }

  /**
   * Replays the current source-field values through the same consume path used
   * for live `field.value.changed` events.
   *
   * This is intentionally limited to JSONPointer conditions targeting value
   * change events because the sync-source design is declarative documentation on
   * the component config, while the actual runtime behaviour still lives in the
   * existing expression system.
   */
  private async consumeInitialSyncExpressions(): Promise<void> {
    const querySource = this.formComp?.getQuerySource();
    const expressions = this.expressions ?? [];
    if (!querySource || expressions.length === 0) {
      return;
    }

    for (const expression of expressions) {
      if (!expression.config.condition) {
        continue;
      }
      const conditionKind = expression.config.conditionKind || ExpressionsConditionKind.JSONPointer;
      if (conditionKind !== ExpressionsConditionKind.JSONPointer) {
        continue;
      }

      const pointerCondition = this.getEventJSONPointerCondition(expression.config.condition);
      if (pointerCondition.event !== '*' && pointerCondition.event !== FormComponentEventType.FIELD_VALUE_CHANGED) {
        continue;
      }

      const value = getObjectWithJsonPointer(querySource.jsonPointerSource, pointerCondition.jsonPointer);
      const event = {
        ...createFieldValueChangedEvent({
          fieldId: pointerCondition.jsonPointer,
          sourceId: pointerCondition.jsonPointer,
          value: value,
        }),
        timestamp: Date.now(),
      };
      await this.consumeEvent(event, expression);
    }
  }
}
