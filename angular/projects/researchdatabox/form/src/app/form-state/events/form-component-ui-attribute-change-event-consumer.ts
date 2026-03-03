import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEventType, FieldUIAttributeChangedEvent, FormComponentEventTypeValue } from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import { FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { startsWith as _startsWith, set as _set } from 'lodash-es';

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

    /*
     * model.value     → this.control.setValue
     * layout.*        → this.options.definition.layout.componentDefinition.config.*
     * component.*     → this.options.definition.component.componentDefinition.config.*
     */
    if (expression.config.target === 'model.value') {
      if (this.control && this.control.value !== targetValue) {
        this.control.setValue(targetValue, { emitEvent: false });
      }
    } else if (_startsWith(expression.config.target || '', 'layout.')) {
      const layoutPath = expression.config.target!.substring('layout.'.length);
      if (this.options?.definition?.layout?.componentDefinition?.config) {
        _set(this.options.definition.layout.componentDefinition.config, layoutPath, targetValue);
      }
    } else if (_startsWith(expression.config.target || '', 'component.')) {
      const componentPath = expression.config.target!.substring('component.'.length);
      if (this.options?.definition?.component?.componentDefinition?.config) {
        _set(this.options.definition.component.componentDefinition.config, componentPath, targetValue);
      }
    } else {
      this.loggerService.warn(
        `FormComponentUIAttributeChangeEventConsumer: Unknown target '${expression.config.target}' in expression config.`,
        expression
      );
    }
  }
}
