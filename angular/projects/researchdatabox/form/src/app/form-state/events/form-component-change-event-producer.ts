import { AbstractControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import { ScopedEventBus, FormComponentEventBus } from './form-component-event-bus.service';
import { createFieldValueChangedEvent } from './form-component-event.types';

export interface FormComponentChangeEventProducerOptions {
	component: FormFieldBaseComponent<unknown>;
	definition?: FormFieldCompMapEntry;
}

/**
 * Wires `FormFieldBaseComponent` instances to the `FormComponentEventBus`.
 *
 * Designed to be owned by `FormBaseWrapperComponent`, which creates components dynamically.
 * 
 * Currently,it will emit the following:
 *
 * 'valueChange' events when the value of the form control changes. These events will be published in both general channel, and in the specific channel for the component, identified by the `name` config property.
 *
 * TODO:
 *
 * 'metadataChange' events when the metadata of the form control changes. These events will be published in both general channel, and in the specific channel for the component, identified by the `name` config property.
 */
export class FormComponentChangeEventProducer {
	private readonly eventBus: FormComponentEventBus;
	private valueChangeSub?: Subscription;
	private scopedBus?: ScopedEventBus;
	private fieldId?: string;
	private previousValue: unknown;

	constructor(eventBus: FormComponentEventBus) {
		this.eventBus = eventBus;
		this.previousValue = undefined;
	}

	/**
	 * Connect the producer to a component instance. Replaces any existing subscription.
	 */
	bind(options: FormComponentChangeEventProducerOptions): void {
		this.destroy();

			const control: AbstractControl | undefined =
				options.definition?.model?.formControl ?? options.component.model?.formControl;
		if (!control) {
			return;
		}

		const fieldId = this.resolveFieldId(options);
		if (!fieldId) {
			return;
		}

		this.fieldId = fieldId;
		this.scopedBus = this.eventBus.scoped(fieldId);
		this.previousValue = control.value;

		this.valueChangeSub = control.valueChanges.subscribe((value: unknown) => {
			this.publishValueChanged(value);
		});
	}

	/**
	 * Tear down active subscriptions.
	 */
	destroy(): void {
		this.valueChangeSub?.unsubscribe();
		this.valueChangeSub = undefined;
		this.scopedBus = undefined;
		this.fieldId = undefined;
		this.previousValue = undefined;
	}

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

	private resolveFieldId(options: FormComponentChangeEventProducerOptions): string | undefined {
		return (
			options.definition?.compConfigJson?.name ||
			options.definition?.name ||
			options.component.formFieldConfigName()
		);
	}
}
