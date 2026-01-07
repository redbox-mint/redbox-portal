import { AbstractControl } from '@angular/forms';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { createFieldValueChangedEvent, FormComponentEventType } from './form-component-event.types';
import { FormComponentEventBaseProducerConsumer, FormComponentEventOptions } from './form-component-base-event-producer-consumer';

/**
 * Wires `FormFieldBaseComponent` instances to the `FormComponentEventBus`.
 *
 * Designed to be owned by `FormBaseWrapperComponent`, which creates components dynamically.
 * 
 * Currently, it will emit the following:
 *
 * 'valueChange' events when the value of the form control changes. These events will be published in both general channel, and in the specific channel for the component, identified by the `name` config property.
 *
 * TODO:
 *
 * 'metadataChange' events when the metadata of the form control changes. These events will be published in both general channel, and in the specific channel for the component, identified by the `name` config property.
 */
export class FormComponentValueChangeEventProducer extends FormComponentEventBaseProducerConsumer {
	private previousValue: unknown;

	constructor(eventBus: FormComponentEventBus) {
		super(eventBus);
		this.previousValue = undefined;
	}
	/**
	 * Connect the producer to a component instance. Replaces any existing subscription.
	 */
	bind(options: FormComponentEventOptions): void {
		this.destroy();
		this.options = options;
		const control: AbstractControl | undefined = options.definition?.model?.formControl ?? options.component.model?.formControl;
		if (!control) {
			this.loggerService.debug(`FormComponentChangeEventProducer: No form control found for component '${options.component.formFieldConfigName()}'. Change events will not be published.`, options.definition);
			return;
		}

		const fieldId = this.resolveFieldId(options);
		if (!fieldId) {
			this.loggerService.debug(`FormComponentChangeEventProducer: Unable to resolve field ID for component '${options.component.formFieldConfigName()}'. Change events will not be published.`, options.definition);
			return;
		}

		this.fieldId = fieldId;
		this.scopedBus = this.eventBus.scoped(fieldId);
		this.previousValue = control.value;

		const sub = control.valueChanges.subscribe((value: unknown) => {
			this.publishValueChanged(value);
		});
		this.subscriptions.set(FormComponentEventType.FIELD_VALUE_CHANGED, sub);
	}
	/**
	 * Tear down active subscriptions.
	 */
	override destroy(): void {
		super.destroy();
		this.previousValue = undefined;
	}
	/**
	 * 
	 * Publishes value changed events to both the general and scoped event buses.
	 * 
	 * @param value 
	 * @returns 
	 */
	private publishValueChanged(value: unknown): void {
		if (!this.fieldId) {
			return;
		}

		const previousValue = this.previousValue;
		const baseEvent = createFieldValueChangedEvent({
			fieldId: this.fieldId,
			value,
			previousValue,
			sourceId: this.fieldId
		});

		this.eventBus.publish(baseEvent);

		const scopedEvent = createFieldValueChangedEvent({
			fieldId: this.fieldId,
			value,
			previousValue
		});

		this.scopedBus?.publish(scopedEvent);
		this.previousValue = value;
	}
}
