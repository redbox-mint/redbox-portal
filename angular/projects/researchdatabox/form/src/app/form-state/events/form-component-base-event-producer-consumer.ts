
import { Subscription } from 'rxjs';
import { inject } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { ScopedEventBus, FormComponentEventBus } from './form-component-event-bus.service';

export interface FormComponentEventOptions {
	component: FormFieldBaseComponent<unknown>;
	definition?: FormFieldCompMapEntry;
}

export abstract class FormComponentEventBaseProducerConsumer {
	protected readonly eventBus: FormComponentEventBus;
	protected scopedBus?: ScopedEventBus;
	protected fieldId?: string;
	protected loggerService: LoggerService = inject(LoggerService);
	protected subscriptions: Map<string, Subscription> = new Map();

	constructor(eventBus: FormComponentEventBus) {
		this.eventBus = eventBus;
	}

	abstract bind(options: FormComponentEventOptions): void;

	/**
	 * Tear down active subscriptions.
	 */
	destroy(): void {
		this.subscriptions.forEach((sub) => sub.unsubscribe());
		this.subscriptions.clear();
		this.scopedBus = undefined;
		this.fieldId = undefined;
	}
  /**
   * Helper to resolve field ID from options
   * 
   * @param options 
   * @returns 
   */
	protected resolveFieldId(options: FormComponentEventOptions): string | undefined {
		return (
			options.definition?.compConfigJson?.name ||
			options.definition?.name ||
			options.component.formFieldConfigName()
		);
	}
}