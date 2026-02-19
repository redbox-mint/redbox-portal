
import { Subscription } from 'rxjs';
import { AbstractControl } from '@angular/forms';
import { inject } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { ScopedEventBus, FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEventBase, FormComponentEventType } from './form-component-event.types';
import { JSONataQuerySource, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../../form.component';

/**
 * Options for binding event consumers/producers to components.
 */
export interface FormComponentEventBindingOptions {
	component?: FormFieldBaseComponent<unknown>;
	definition?: FormFieldCompMapEntry;
	formComponent?: FormComponent;
	customHandlerFn?: (event: FormComponentEventBase) => Promise<void>;
}
/**
 * Extended JSONata query source that includes event information.
 */
export interface FormComponentEventQuerySource extends JSONataQuerySource {
	event: FormComponentEventBase;
}
/**
 * Condition based on JSON Pointer and event type.
 */
export interface FormComponentEventJSONPointerCondition {
	jsonPointer: string;
	event: string;
}
/**
 * Base class for form component event producers and consumers.
 */
export abstract class FormComponentEventBaseProducerConsumer {
	protected readonly eventBus: FormComponentEventBus;
	protected scopedBus?: ScopedEventBus;
	protected fieldId?: string;
	protected loggerService: LoggerService = inject(LoggerService);
	protected subscriptions: Map<string, Subscription> = new Map();
	protected componentDefQuerySource?: JSONataQuerySource;
	protected formComp?: FormComponent;
	protected options?: FormComponentEventBindingOptions;
	protected control?: AbstractControl;
	protected expressions?: FormExpressionsConfigFrame[];

	constructor(eventBus: FormComponentEventBus) {
		this.eventBus = eventBus;
	}

	abstract bind(options: FormComponentEventBindingOptions): void;

	public set componentQuerySource(source: JSONataQuerySource | undefined) {
		this.componentDefQuerySource = source;
	}

	public set formComponent(component: FormComponent | undefined) {
		this.formComp = component;
	}

	public get formComponent(): FormComponent | undefined {
		return this.formComp;
	}
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
	protected resolveFieldId(options: FormComponentEventBindingOptions): string | undefined {
		return (
			options.definition?.lineagePaths?.angularComponentsJsonPointer ||
			options.definition?.compConfigJson?.name ||
			options.definition?.name ||
			options.component?.formFieldConfigName()
		);
	}
	/**
	 * Returns the JSON pointer and event type from a condition string. The format is 'jsonPointer::eventType'. If the event type is omitted, it defaults to '*'.
	 * 
	 * @param condition - the condition string in the format 'jsonPointer::eventType'
	 * @returns 
	 */
	protected getEventJSONPointerCondition(condition: string): FormComponentEventJSONPointerCondition {
		const parts = condition.split('::');
		return {
			jsonPointer: parts[0],
			event: parts[1] || '*'
		};
	} 
	/**
	 * 
	 * Combines the component query source with the event.
	 * 
	 * @param event 
	 * @returns 
	 */
	protected getEventQuerySource(event: FormComponentEventBase): FormComponentEventQuerySource | undefined {
		if (!this.componentDefQuerySource) {
			return undefined;
		}
		return {
			...this.componentDefQuerySource,
			event
		};
	}	
	/**
	 * Sets up listeners to update the component query source when the form definition changes.
	 */
	protected setupQuerySourceUpdateListener(): void {
		if (this.formComp) {
			// Clean up existing subscriptions before creating new ones
			this.subscriptions.get('componentQuerySourceReady')?.unsubscribe();
			this.subscriptions.get('componentQuerySourceUpdated')?.unsubscribe();

			this.subscriptions.set('componentQuerySourceReady', this.eventBus
				.select$(FormComponentEventType.FORM_DEFINITION_READY)
				.subscribe(() => {
					this.componentDefQuerySource = this.formComp?.getQuerySource();
				}));
			this.subscriptions.set('componentQuerySourceUpdated', this.eventBus
				.select$(FormComponentEventType.FORM_DEFINITION_CHANGED)
				.subscribe(() => {
					this.componentDefQuerySource = this.formComp?.getQuerySource();
				}));
		}
	}

	/**
	 * Helper to debug messages 
	 */
	protected logDebug(message: string, ...optionalParams: any[]) {
		if (this.formComp?.config['debugEvents'] == "true") {
			this.loggerService.debug(message, ...optionalParams);
		}
	}
}