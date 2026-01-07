
import { Subscription, concatMap } from 'rxjs';
import { AbstractControl } from '@angular/forms';
import { inject } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { ScopedEventBus, FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEvent, FormComponentEventBase, FormComponentEventType, FormComponentEventTypeValue } from './form-component-event.types';
import { getObjectWithJsonPointer, JSONataQuerySource, ExpressionsConditionKindType, FormExpressionsConfigFrame, ExpressionsConditionKind } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../../form.component';
import { isEmpty as _isEmpty } from 'lodash-es';
import _ from 'lodash';

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
	event: FormComponentEvent;
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
	protected control?: AbstractControl;
	protected expressions?: FormExpressionsConfigFrame[];

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
		if (ref === undefined || ref.key != opts.event.sourceId) {
			return false;
		}
		const targetEvent = pointerCondition.event;
		if (targetEvent === '*' || targetEvent === opts.querySource.event.type) {
			return true;
		}
		return false;
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
	
	protected setupEventConsumption(options: FormComponentEventOptions, eventType: FormComponentEventTypeValue) {
		this.options = options;
	
		const expressions: FormExpressionsConfigFrame[] | undefined  = options.definition?.expressions;
		if (expressions === undefined || _isEmpty(expressions)) {
			const msg = `FormComponentValueChangeEventConsumer: No expressions defined for component '${options.component.formFieldConfigName()}'. Change events will not be consumed.`;
			this.loggerService.debug(msg, options.definition);
			throw new Error(msg);
		}	
		this.expressions = expressions;
		// FormControl is optional for some components
		const control: AbstractControl | undefined = options.definition?.model?.formControl ?? options.component.model?.formControl;
		if (!control) {
			this.loggerService.debug(`FormComponentValueChangeEventConsumer: No form control found for component '${options.component.formFieldConfigName()}'. Change events may or may not be properly consumed.`, options.definition);
		} else {
			this.control = control;
		}

		this.setupQuerySourceUpdateListener();

		const sub = this.eventBus.select$(eventType).pipe(
			concatMap(async (event: FormComponentEvent) => {
				const hasConditionMatch = this.getMatchedExpressions(event, this.expressions!);
				if (hasConditionMatch) {
					for (const expr of hasConditionMatch) {
						await this.consumeEvent(event, expr);
					}
				}
			})
		).subscribe();
		this.subscriptions.set(eventType, sub);
	}

	protected getMatchedExpressions(event: FormComponentEvent, expressions: FormExpressionsConfigFrame[]): FormExpressionsConfigFrame[] | null {
		const matchedExpressions: FormExpressionsConfigFrame[] = [];
		for (const expr of expressions) {
			if (expr.config.conditionKind == ExpressionsConditionKind.JSONPointer) {
				const matchOpts: FormComponentEventJSONPointerMatchOptions = {
					condition: expr.config.condition || '',
					conditionKind: expr.config.conditionKind,
					querySource: this.getEventQuerySource(event)!,
					event: event
				};
				if (this.hasMatchedJSONPointerCondition(matchOpts)) {
					matchedExpressions.push(expr);
				}
			}	
		}
		return !_isEmpty(matchedExpressions) ? matchedExpressions : null;
	}

	protected consumeEvent(event: FormComponentEvent, expression: FormExpressionsConfigFrame): Promise<void> {
		throw new Error(`FormComponentEventBaseProducerConsumer: consumeEvent not implemented for event type '${event.type}'.`);
	}

}