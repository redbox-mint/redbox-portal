import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FormComponentEventType,
  FieldValueChangedEvent,
  FormComponentEventTypeValue,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import {  FormExpressionsConfigFrame} from '@researchdatabox/sails-ng-common';

/**
 * Consumes `valueChange` events from the `FormComponentEventBus` and updates the component's form control.
 */
export class FormComponentValueChangeEventConsumer extends FormComponentEventBaseConsumer {
  protected override readonly consumedEventType: FormComponentEventTypeValue =
    FormComponentEventType.FIELD_VALUE_CHANGED;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  protected override async consumeEvent(
    event: FieldValueChangedEvent,
    expression: FormExpressionsConfigFrame
  ): Promise<void> {
    // Compute the expression result
    let targetValue: unknown = event.value;
    if (expression.config.hasTemplate) {
      // Evaluate the pre-compiled JSONata expression template (CSP-safe)
      targetValue = await this.evaluateExpressionJSONata(expression, event, 'template');
    }
    // Set the target based on the expression config
    if ('target' in expression.config) {
      const exprTarget = expression.config.target || '';
      await this.setTarget(targetValue, exprTarget, event, expression);
    }
  }
}
