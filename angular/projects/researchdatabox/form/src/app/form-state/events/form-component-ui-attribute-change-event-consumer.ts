import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEventType, FieldUIAttributeChangedEvent, FormComponentEventTypeValue } from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import { FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';

/**
 * Consumes `field.ui-attribute.changed` events from the `FormComponentEventBus`
 * and applies expression-driven mutations to the component.
 *
 * This mirrors `FormComponentValueChangeEventConsumer` but reacts to UI
 * attribute changes (visibility, readonly, disabled) rather than value changes.
 *
 * Supported targets:
 *   - `model.value`    → sets the form control value
 *   - `layout.*`       → mutates layout component config
 *   - `component.*`    → mutates component config
 */
export class FormComponentUIAttributeChangeEventConsumer extends FormComponentEventBaseConsumer {

  protected override readonly consumedEventType: FormComponentEventTypeValue = FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  protected override async consumeEvent(event: FieldUIAttributeChangedEvent, expression: FormExpressionsConfigFrame): Promise<void> {
    // Default target value is the full meta snapshot; a JSONata template
    // can narrow or transform this.
    let targetValue: unknown = event.meta;
    if (expression.config.hasTemplate) {
      targetValue = await this.evaluateExpressionJSONata(expression, event, 'template');
    }
    // Set the target based on the expression config
    if ('target' in expression.config) {
      const exprTarget = expression.config.target || '';
      await this.setTarget(targetValue, exprTarget, event, expression);
    }
  }
}
