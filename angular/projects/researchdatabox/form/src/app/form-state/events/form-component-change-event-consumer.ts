import { AbstractControl } from '@angular/forms';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEventType, FieldValueChangedEvent } from './form-component-event.types';
import { FormComponentEventBaseProducerConsumer, FormComponentEventOptions } from './form-component-base-event-producer-consumer';

/**
 * Consumes `valueChange` events from the `FormComponentEventBus` and updates the component's form control.
 *
 * Designed to be owned by `FormBaseWrapperComponent`.
 */
export class FormComponentValueChangeEventConsumer extends FormComponentEventBaseProducerConsumer {
	private control?: AbstractControl;

	constructor(eventBus: FormComponentEventBus) {
		super(eventBus);
	}

	/**
	 * Connect the consumer to a component instance. Replaces any existing subscription.
	 */
	bind(options: FormComponentEventOptions): void {
		this.destroy();

		const control: AbstractControl | undefined = options.definition?.model?.formControl ?? options.component.model?.formControl;
		if (!control) {
			this.loggerService.warn(`FormComponentValueChangeEventConsumer: No form control found for component '${options.component.formFieldConfigName()}'. Change events will not be consumed.`, options.definition);
			return;
		}
		this.control = control;

		const fieldId = this.resolveFieldId(options);
		if (!fieldId) {
			this.loggerService.warn(`FormComponentValueChangeEventConsumer: Unable to resolve field ID for component '${options.component.formFieldConfigName()}'. Change events will not be consumed.`, options.definition);
			return;
		}

		this.fieldId = fieldId;
		this.scopedBus = this.eventBus.scoped(fieldId);
		
		const sub = this.eventBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe((event: FieldValueChangedEvent) => {
			if (event.fieldId === this.fieldId && event.sourceId !== this.fieldId) {
			  this.loggerService.debug(`FormComponentValueChangeEventConsumer: Updating value of field '${this.fieldId}' to '${event.value}' from event source '${event.sourceId}'.`);
        this.consumeEvent(event);
			}
		});
		
		this.subscriptions.set(FormComponentEventType.FIELD_VALUE_CHANGED, sub);
	}

	/**
	 * Tear down active subscriptions.
	 */
	override destroy(): void {
		super.destroy();
		this.control = undefined;
	}

  protected consumeEvent(event: FieldValueChangedEvent): void {
    if (this.control && this.control.value !== event.value) {
			this.control.setValue(event.value, { emitEvent: false });
		}
  }
}
