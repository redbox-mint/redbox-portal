import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEventType, FieldValueChangedEvent, FormComponentEventTypeValue } from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import { FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { startsWith as _startsWith, set as _set } from 'lodash-es';

/**
 * Consumes `valueChange` events from the `FormComponentEventBus` and updates the component's form control.
 *
 */
export class FormComponentValueChangeEventConsumer extends FormComponentEventBaseConsumer {
	
	protected override readonly consumedEventType: FormComponentEventTypeValue = FormComponentEventType.FIELD_VALUE_CHANGED;

	constructor(eventBus: FormComponentEventBus) {
		super(eventBus);
	}

  protected override async consumeEvent(event: FieldValueChangedEvent, expression: FormExpressionsConfigFrame): Promise<void> {
		// Compute the expression result 
		let targetValue: unknown = event.value;
		if (expression.config.hasTemplate) {
			// Evaluate the pre-compiled JSONata expression template (CSP-safe)
			targetValue = await this.evaluateExpressionJSONata(expression, event, 'template');
		}
		// Set the target based on the expression config
		/*
		 * model.value --> this.control.setValue
		 * layout.* --> this.options.definition.layout.componentDefinition.config.*
		 * component.* --> this.options.component.*
		 */
		if (expression.config.target == "model.value") {
			if (this.control && this.control.value !== targetValue) {
				this.control.setValue(targetValue, { emitEvent: false });
			}
		} else if (_startsWith(expression.config.target || '', 'layout.')) {
			const layoutPath = expression.config.target!.substring('layout.'.length);
			if (this.options?.definition?.layout?.componentDefinition?.config) {
				_set(this.options.definition.layout.componentDefinition?.config, layoutPath, targetValue);
			}
		} else if (_startsWith(expression.config.target || '', 'component.')) {
			const componentPath = expression.config.target!.substring('component.'.length);
			if (this.options?.definition?.component?.componentDefinition?.config) {
				_set(this.options?.definition?.component?.componentDefinition?.config, componentPath, targetValue);
			}
		} else {
			this.loggerService.warn(`FormComponentValueChangeEventConsumer: Unknown target '${expression.config.target}' in expression config.`, expression);
		}
  }
}
