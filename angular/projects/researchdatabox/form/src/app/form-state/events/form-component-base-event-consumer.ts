import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEvent, FormComponentEventType, FormComponentEventTypeValue } from './form-component-event.types';
import { FormComponentEventBaseProducerConsumer, FormComponentEventBindingOptions, FormComponentEventQuerySource } from './form-component-base-event-producer-consumer';
import { FormExpressionsConfigFrame, getObjectWithJsonPointer, getLastSegmentFromJSONPointer, ExpressionsConditionKind, ExpressionsConditionKindType } from '@researchdatabox/sails-ng-common';
import jsonata from 'jsonata';
import { isEmpty as _isEmpty } from 'lodash-es';
import { AbstractControl } from '@angular/forms';
/**
 * Options main bag for matching events against conditions
 */
export interface FormComponentEventMatchOptions {
	condition: string;
	conditionKind: ExpressionsConditionKindType;
	event: FormComponentEvent;
	expression: FormExpressionsConfigFrame;
}

export interface FormComponentEventJSONPointerMatchOptions extends FormComponentEventMatchOptions {
	conditionKind: typeof ExpressionsConditionKind.JSONPointer;
	querySource: FormComponentEventQuerySource;
}

export interface FormComponentEventJSONataMatchOptions extends FormComponentEventMatchOptions {
	conditionKind: typeof ExpressionsConditionKind.JSONata;
}

export interface FormComponentEventJSONataQueryMatchOptions extends FormComponentEventMatchOptions {
	conditionKind: typeof ExpressionsConditionKind.JSONataQuery;
	querySource: FormComponentEventQuerySource;
}

/**
 * Base class for form component event consumers.
 * Provides JSONata expression processing and compiled items cache handling.
 */
export abstract class FormComponentEventBaseConsumer extends FormComponentEventBaseProducerConsumer {
	
	/** Cache for the compiled items module */
	protected compiledItemsCache?: { evaluate: (key: (string | number)[], context: unknown, extra?: unknown) => unknown };

	/** The event type this consumer listens to - must be set by subclasses */
	protected abstract readonly consumedEventType: FormComponentEventTypeValue;

	constructor(eventBus: FormComponentEventBus) {
		super(eventBus);
	}

	/**
	 * Connect the consumer to a component instance. Replaces any existing subscription.
	 */
	bind(options: FormComponentEventBindingOptions): void {
		this.destroy();
		try {
			this.setupEventConsumption(options, this.consumedEventType);				
		} catch (error) {
			this.loggerService.error(
				`${this.constructor.name}: Error during setupEventConsumption for event type '${this.consumedEventType}'.`,
				{ error, consumedEventType: this.consumedEventType, options }
			);
			return;
		}
	}

	/**
	 * Tear down active subscriptions.
	 */
	override destroy(): void {
		super.destroy();
		this.control = undefined;
		this.compiledItemsCache = undefined;
	}

	/**
	 * Get the compiled items module, caching the result for subsequent calls.
	 */
	protected async getCompiledItems(): Promise<{ evaluate: (key: (string | number)[], context: unknown, extra?: unknown) => unknown } | undefined> {
		if (this.compiledItemsCache) {
			return this.compiledItemsCache;
		}
		if (!this.formComp) {
			this.loggerService.warn(`${this.constructor.name}: No form component available to get compiled items.`);
			return undefined;
		}
		try {
			this.compiledItemsCache = await this.formComp.getFormCompiledItems();
			return this.compiledItemsCache;
		} catch (error) {
			this.loggerService.error(`${this.constructor.name}: Error getting compiled items.`, error);
			return undefined;
		}
	}

	/**
	 * Build the key for the compiled JSONata expression property.
	 * The key format matches what TemplateFormConfigVisitor produces:
	 * [...lineagePaths.formConfig, 'expressions', expressionIndex, 'config', <property name>]
	 */
	protected buildExpressionPropertyKey(expression: FormExpressionsConfigFrame, propertyName: string): (string | number)[] | undefined {
		if (!this.options?.definition?.lineagePaths?.formConfig) {
			this.loggerService.warn(`${this.constructor.name}: No lineage paths available for building expression's ${propertyName} key.`);
			return undefined;
		}
		const expressionIndex = this.expressions?.indexOf(expression);
		if (expressionIndex === undefined || expressionIndex < 0) {
			this.loggerService.warn(`${this.constructor.name}: Expression not found in expressions array.`, expression);
			return undefined;
		}
		return [
			...(this.options.definition.lineagePaths.formConfig),
			'expressions',
			expressionIndex,
			'config',
			propertyName
		];
	}

	/**
	 * Evaluate the JSONata expression template with the provided context.
   * 
   * @param expression - The expression config frame containing the template.
   * @param event - The event that triggered the evaluation.
   * @param propertyName - The property name in the expression config to evaluate (e.g., 'template', 'condition').
   * @returns The result of the evaluated expression.
	 */
	protected async evaluateExpressionJSONata(expression: FormExpressionsConfigFrame, event: FormComponentEvent, propertyName: string, additionalData: object = {}): Promise<unknown> {
		const compiledItems = await this.getCompiledItems();
		if (!compiledItems) {
			return (event as { value?: unknown }).value;
		}

		const templateKey = this.buildExpressionPropertyKey(expression, propertyName);
		if (!templateKey) {
			return (event as { value?: unknown }).value;
		}

		try {
      const dataFieldId = getLastSegmentFromJSONPointer(event.fieldId || '');
			// Build the context for JSONata evaluation
			// Include the event value and any additional data that may be useful
			const context = {
        value: dataFieldId ? this.formComp?.form?.value[dataFieldId] : undefined,
				event: event,
				// Include the current form data if available
				formData: this.formComp?.form?.value ?? {},
        ...additionalData
			};

			const result = await compiledItems.evaluate(templateKey, context, {libraries : {jsonata: jsonata}});
			return result;
		} catch (error) {
			this.loggerService.error(`${this.constructor.name}: Error evaluating expression template.`, error);
			return (event as { value?: unknown }).value;
		}
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
		// Check if the pointer has a match in the query source, broadcasts will fail this check
		const ref = getObjectWithJsonPointer(querySource.jsonPointerSource, pointerCondition.jsonPointer);
		const targetEvent = pointerCondition.event;
		const hasMatchedTargetEvent = targetEvent === '*' || targetEvent === opts.querySource.event.type;
		// Scenarios where it will match if the `targetEvent` matches, that is '*' or the specific event type AND the `sourceId` matches:
		// 1. Scoped - the `pointerCondition.jsonPointer` will match the event.sourceId
		const hasScopedMatch = ref != undefined && pointerCondition.jsonPointer == opts.event.sourceId; 
		// 2. Broadcast - the opts.event.sourceId is '*' indicating broadcast, and the condition's jsonPointer matches path of the `fieldId` of the event OR this is a form ready event and the expression is set to run on form ready
		const eventFieldId = opts.event.fieldId || "";
		const isRunOnFormReady = (opts.event.sourceId == FormComponentEventType.FORM_DEFINITION_READY && opts.expression.config.runOnFormReady !== false);
		// Precise JSON Pointer match: exact match OR path prefix followed by segment delimiter
		const jsonPointer = pointerCondition.jsonPointer;
		const hasPointerMatch = jsonPointer === "" 
			|| eventFieldId === jsonPointer 
			|| eventFieldId.startsWith(jsonPointer + "/");
		let hasBroadcastMatch = ((opts.event.sourceId === '*' || isRunOnFormReady) && hasPointerMatch);
		
		return (hasMatchedTargetEvent && (hasScopedMatch || hasBroadcastMatch));
	}
  /**
   * Sets up event consumption for the specified event type.
   * 
   * @param options 
   * @param eventType 
   */
	protected setupEventConsumption(options: FormComponentEventBindingOptions, eventType: FormComponentEventTypeValue) {
		this.options = options;
	
		const expressions: FormExpressionsConfigFrame[] | undefined  = options.definition?.expressions;
		if (expressions === undefined || _isEmpty(expressions)) {
			const msg = `${this.constructor.name}: No expressions defined for component '${options.component?.formFieldConfigName()}'. Change events will not be consumed.`;
			this.logDebug(msg, options.definition);
			return;
		}
		this.expressions = expressions;
		// FormControl is optional for some components
		const control: AbstractControl | undefined = options.definition?.model?.formControl ?? options.component?.model?.formControl;
		if (!control) {
			this.logDebug(`${this.constructor.name}: No form control found for component '${options.component?.formFieldConfigName()}'. Change events may or may not be properly consumed.`, options.definition);
		} else {
			this.control = control;
		}

		this.setupQuerySourceUpdateListener();

		const sub = this.eventBus.select$(eventType).subscribe(async (event: FormComponentEvent) => {
			const hasConditionMatches = await this.getMatchedExpressions(event, this.expressions!);
			if (hasConditionMatches) {
				for (const expr of hasConditionMatches) {
					await this.consumeEvent(event, expr);
				}
			}
		});
		this.subscriptions.set(eventType, sub);
	}
  /**
   * Returns all expressions that match the event based on their conditions.
   * 
   * @param event 
   * @param expressions 
   * @returns 
   */
	protected async getMatchedExpressions(event: FormComponentEvent, expressions: FormExpressionsConfigFrame[]): Promise<FormExpressionsConfigFrame[] | null> {
		const matchedExpressions: FormExpressionsConfigFrame[] = [];
		for (const expr of expressions) {
			// Will match if condition is undefined
			if (expr.config.condition === undefined || expr.config.condition === null) {
				matchedExpressions.push(expr);
				continue;
			}
			// Will skip if the event is FORM_DEFINITION_READY and the expression is not set to run on form ready
			if (event.sourceId == FormComponentEventType.FORM_DEFINITION_READY && expr.config.runOnFormReady === false) {
				continue;
			} 
			if (event.sourceId == FormComponentEventType.FORM_DEFINITION_READY && !this.componentDefQuerySource) {
				// Ensure the query source is available since this is the first event after form ready
				this.componentDefQuerySource = this.formComp?.getQuerySource();
			}

			const conditionKind = expr.config.conditionKind || ExpressionsConditionKind.JSONPointer;
			let hasMatchedCondition = false;
			
			if (conditionKind === ExpressionsConditionKind.JSONPointer) {
				const matchOpts: FormComponentEventJSONPointerMatchOptions = {
					condition: expr.config.condition || '',
					conditionKind: ExpressionsConditionKind.JSONPointer,
					querySource: this.getEventQuerySource(event)!,
					event: event,
					expression: expr
				};
				hasMatchedCondition = this.hasMatchedJSONPointerCondition(matchOpts);
			} else if (conditionKind === ExpressionsConditionKind.JSONata) {
				const matchOpts: FormComponentEventJSONataMatchOptions = {
					condition: expr.config.condition || '',
					conditionKind: ExpressionsConditionKind.JSONata,
					event: event,
					expression: expr
				};
				hasMatchedCondition = await this.hasMatchedJSONataCondition(matchOpts, expr);
			} else if (conditionKind === ExpressionsConditionKind.JSONataQuery) {
				const matchOpts: FormComponentEventJSONataQueryMatchOptions = {
					condition: expr.config.condition || '',
					conditionKind: ExpressionsConditionKind.JSONataQuery,
					querySource: this.getEventQuerySource(event)!,
					event: event,
					expression: expr
				};
				// The querySource must be updated each time before evaluating the condition. The querySource is updated via subscription to the event bus, set up in `setupQuerySourceUpdateListener()` emitted via FormComponentEventType.FORM_DEFINITION_CHANGED.
				// The challenge is that this may or may not have happened at this point. There's another event that fires that root form listens and recalculates the query source, so at this point should mitigate this risk.

				hasMatchedCondition = await this.hasMatchedJSONataQueryCondition(matchOpts, expr);
      }
			
			if (hasMatchedCondition) {
				matchedExpressions.push(expr);
			}
		}
		return !_isEmpty(matchedExpressions) ? matchedExpressions : null;
	}

	protected async hasMatchedJSONataCondition(opts: FormComponentEventJSONataMatchOptions, expression: FormExpressionsConfigFrame): Promise<boolean> {
    // JSONata will only match on broadcast events, not on scoped, or the form ready event is not set to run on form ready
		const isRunOnFormReady = (opts.event.sourceId == FormComponentEventType.FORM_DEFINITION_READY && expression.config.runOnFormReady !== false);
    if (opts.event.sourceId !== '*' && !isRunOnFormReady) {
      return false;
    }
		const result = await this.evaluateExpressionJSONata(expression, opts.event, 'condition');
		return !!result;
	}

	protected async hasMatchedJSONataQueryCondition(opts: FormComponentEventJSONataQueryMatchOptions, expression: FormExpressionsConfigFrame): Promise<boolean> {
    // JSONataQuery will only match on broadcast events, not on scoped
		const isRunOnFormReady = (opts.event.sourceId == FormComponentEventType.FORM_DEFINITION_READY && expression.config.runOnFormReady !== false);
    if (opts.event.sourceId !== '*' && !isRunOnFormReady) {
      return false;
    }
		const result = await this.evaluateExpressionJSONata(expression, opts.event, 'condition', opts.querySource?.querySource);
		return !!result;
	}


  /**
   * 
   * @param event 
   * @param expression 
   */
	protected abstract consumeEvent(event: FormComponentEvent, expression: FormExpressionsConfigFrame): Promise<void>;
}
