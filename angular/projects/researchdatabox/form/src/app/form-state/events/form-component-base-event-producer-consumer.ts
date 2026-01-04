
import { Subscription } from 'rxjs';
import { inject } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { ScopedEventBus, FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEventBase, FormComponentEventType } from './form-component-event.types';
import { getObjectWithJsonPointer, JSONataQuerySource, ExpressionsConditionKindType } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../../form.component';

/**
 * Options for binding event consumers/producers to components.
 */
export interface FormComponentEventOptions {
	component: FormFieldBaseComponent<unknown>;
	definition?: FormFieldCompMapEntry;
	formComponent?: FormComponent;
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
 * Options for matching events against JSON Pointer conditions.
 */
export interface FormComponentEventJSONPointerMatchOptions {
	condition: string;
	conditionKind: ExpressionsConditionKindType;
	querySource: FormComponentEventQuerySource;
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
	protected options?: FormComponentEventOptions;

	constructor(eventBus: FormComponentEventBus) {
		this.eventBus = eventBus;
	}

	abstract bind(options: FormComponentEventOptions): void;

	public set componentQuerySource(source: JSONataQuerySource | undefined) {
		this.componentDefQuerySource = source;
	}

	public set formComponent(component: FormComponent | undefined) {
		this.formComp = component;
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
	protected resolveFieldId(options: FormComponentEventOptions): string | undefined {
		return (
			options.definition?.compConfigJson?.name ||
			options.definition?.name ||
			options.component.formFieldConfigName()
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
	 * Checks if the event matches the JSON Pointer condition.
	 * 
	 * @param opts 
	 * @returns 
	 */
	protected hasMatchedJSONPointerCondition(opts: FormComponentEventJSONPointerMatchOptions): boolean {
		const querySource = opts.querySource;
		if (!querySource) {
			return false;
		}
		const pointerCondition = this.getEventJSONPointerCondition(opts.condition);
		// Check if the pointer has a match in the query source
		const ref = getObjectWithJsonPointer(querySource.jsonPointerSource, pointerCondition.jsonPointer);
		if (ref === undefined) {
			return false;
		}
		const targetEvent = pointerCondition.event;
		if (targetEvent === '*' || targetEvent === opts.querySource.event.type) {
			return true;
		}
		return false;
	}

	protected getEventQuerySource(event: FormComponentEventBase): FormComponentEventQuerySource | undefined {
		if (!this.componentDefQuerySource) {
			return undefined;
		}
		return {
			...this.componentDefQuerySource,
			event
		};
	}	

	protected setupQuerySourceUpdateLister(): void {
		if (this.formComp) {
			this.subscriptions.set('componentQuerySourceReady', this.eventBus
				.select$(FormComponentEventType.FORM_DEFINITION_READY)
				.subscribe(() => {
					this.componentDefQuerySource = this.formComp?.componentQuerySource;
				}));
			this.subscriptions.set('componentQuerySourceUpdated', this.eventBus
				.select$(FormComponentEventType.FORM_DEFINITION_CHANGED)
				.subscribe(() => {
					this.componentDefQuerySource = this.formComp?.componentQuerySource;
				}));
		}
	}
}