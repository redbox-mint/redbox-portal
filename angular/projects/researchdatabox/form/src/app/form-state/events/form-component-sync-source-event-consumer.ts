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
 * Unlike the default value change consumer, it skips updates when a template
 * evaluates to undefined so keystroke noise does not clear or replace values.
 */
export class FormComponentSyncSourceEventConsumer extends FormComponentEventBaseConsumer {
  protected override readonly consumedEventType: FormComponentEventTypeValue =
    FormComponentEventType.FIELD_VALUE_CHANGED;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

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
