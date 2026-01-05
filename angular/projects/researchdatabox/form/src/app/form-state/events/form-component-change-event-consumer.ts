import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEventType, FieldValueChangedEvent } from './form-component-event.types';
import { FormComponentEventBaseProducerConsumer, FormComponentEventOptions } from './form-component-base-event-producer-consumer';
import { FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, map as _map, has } from 'lodash-es';
/**
 * Consumes `valueChange` events from the `FormComponentEventBus` and updates the component's form control.
 *
 */
export class FormComponentValueChangeEventConsumer extends FormComponentEventBaseProducerConsumer {
	

	constructor(eventBus: FormComponentEventBus) {
		super(eventBus);
	}

	/**
	 * Connect the consumer to a component instance. Replaces any existing subscription.
	 */
	bind(options: FormComponentEventOptions): void {
		this.destroy();
		try {
			this.setupEventConsumption(options, FormComponentEventType.FIELD_VALUE_CHANGED);				
		} catch (error) {
			return;
		}
	}

	/**
	 * Tear down active subscriptions.
	 */
	override destroy(): void {
		super.destroy();
		this.control = undefined;
	}

  protected override consumeEvent(event: FieldValueChangedEvent, expression: FormExpressionsConfigFrame): void {
		/*
		 * model.value --> this.control.setValue
		 * layout.* --> this.options.definition.layout.componentDefinition.config.*
		 * component.* --> this.options.component.*
		 */
		if (expression.config.target == "model.value") {
			if (this.control && this.control.value !== event.value) {
				this.control.setValue(event.value, { emitEvent: false });
			}
		}

  }
}
