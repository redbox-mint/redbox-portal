import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FormComponentEventType,
  FieldValueChangedEvent,
  FormComponentEventTypeValue, createFormValidationChangeRequestEvent,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import {
  FormExpressionsConfigFrame,
  FormExpressionsTargetComponentPrefix,
  FormExpressionsTargetLayoutPrefix,
  FormExpressionsTargetModelValue, FormExpressionsTargetValidationGroups
} from '@researchdatabox/sails-ng-common';
import { set as _set } from 'lodash-es';
import { setControlValue } from '../custom-set-value.control';
import { syncComponentDisplayFromModel } from '../custom-display-sync.control';

/**
 * Consumes `valueChange` events from the `FormComponentEventBus` and updates the component's form control.
 *
 * Supported targets:
 * - `model.value` → this.control.setValue
 * - `layout.* →` this.options.definition.layout.componentDefinition.config.*
 * - `component.* →` this.options.definition.component.componentDefinition.config.*
 * - `form.enabledValidationGroups` → create an event indicating the change
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
    const exprTarget = expression.config.target || '';
    if (exprTarget === FormExpressionsTargetModelValue) {
      if (this.control && this.control.value !== targetValue) {
        await setControlValue(this.control, targetValue, { emitEvent: false });
        await syncComponentDisplayFromModel(this.options?.component);
      }
    } else if (exprTarget.startsWith(FormExpressionsTargetLayoutPrefix)) {
      const layoutPath = exprTarget.substring(FormExpressionsTargetLayoutPrefix.length);
      const container = this.options?.definition?.layout?.componentDefinition?.config;
      if (container) {
        _set(container, layoutPath, targetValue);
      }
    } else if (exprTarget.startsWith(FormExpressionsTargetComponentPrefix)) {
      const componentPath = exprTarget.substring(FormExpressionsTargetComponentPrefix.length);
      const container = this.options?.definition?.component?.componentDefinition?.config;
      if (container) {
        _set(container, componentPath, targetValue);
      }
    } else if (exprTarget === FormExpressionsTargetValidationGroups) {
      createFormValidationChangeRequestEvent({
        sourceId: '',
        fieldId: '',
        initial: '',
        groups: {          enable: [],          disable: [],        },
      })
    } else {
      this.loggerService.warn(
        `FormComponentValueChangeEventConsumer: Unknown target '${exprTarget}' in expression config.`,
        expression
      );
    }
  }
}
