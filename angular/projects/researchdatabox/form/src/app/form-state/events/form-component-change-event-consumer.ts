import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentEventType, FieldValueChangedEvent } from './form-component-event.types';
import { FormComponentEventBaseProducerConsumer, FormComponentEventOptions } from './form-component-base-event-producer-consumer';
import { FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, map as _map, startsWith as _startsWith, set as _set } from 'lodash-es';
import jsonata from 'jsonata';
/**
 * Consumes `valueChange` events from the `FormComponentEventBus` and updates the component's form control.
 *
 */
export class FormComponentValueChangeEventConsumer extends FormComponentEventBaseProducerConsumer {
	
	/** Cache for the compiled items module */
	private compiledItemsCache?: { evaluate: (key: (string | number)[], context: unknown, extra?: unknown) => unknown };

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
		this.compiledItemsCache = undefined;
	}

	/**
	 * Get the compiled items module, caching the result for subsequent calls.
	 */
	private async getCompiledItems(): Promise<{ evaluate: (key: (string | number)[], context: unknown, extra?: unknown) => unknown } | undefined> {
		if (this.compiledItemsCache) {
			return this.compiledItemsCache;
		}
		if (!this.formComp) {
			this.loggerService.warn(`FormComponentValueChangeEventConsumer: No form component available to get compiled items.`);
			return undefined;
		}
		try {
			this.compiledItemsCache = await this.formComp.getCompiledItem();
			return this.compiledItemsCache;
		} catch (error) {
			this.loggerService.error(`FormComponentValueChangeEventConsumer: Error getting compiled items.`, error);
			return undefined;
		}
	}

	/**
	 * Build the key for the compiled JSONata expression template.
	 * The key format matches what TemplateFormConfigVisitor produces:
	 * [...lineagePaths.formConfig, 'expressions', expressionIndex, 'config', 'template']
	 */
	private buildExpressionTemplateKey(expression: FormExpressionsConfigFrame): (string | number)[] | undefined {
		if (!this.options?.definition?.lineagePaths?.formConfig) {
			this.loggerService.warn(`FormComponentValueChangeEventConsumer: No lineage paths available for building expression key.`);
			return undefined;
		}
		const expressionIndex = this.expressions?.indexOf(expression);
		if (expressionIndex === undefined || expressionIndex < 0) {
			this.loggerService.warn(`FormComponentValueChangeEventConsumer: Expression not found in expressions array.`, expression);
			return undefined;
		}
		return [
			...(this.options.definition.lineagePaths.formConfig),
			'expressions',
			expressionIndex,
			'config',
			'template'
		];
	}

	/**
	 * Evaluate the JSONata expression template with the provided context.
	 */
	private async evaluateExpressionTemplate(expression: FormExpressionsConfigFrame, event: FieldValueChangedEvent): Promise<unknown> {
		const compiledItems = await this.getCompiledItems();
		if (!compiledItems) {
			return event.value;
		}

		const templateKey = this.buildExpressionTemplateKey(expression);
		if (!templateKey) {
			return event.value;
		}

		try {
			// Build the context for JSONata evaluation
			// Include the event value and any additional data that may be useful
			const context = {
				value: event.value,
				event: {
					type: event.type,
					fieldId: event.fieldId,
					value: event.value
				},
				// Include the current form data if available
				formData: this.formComp?.form?.value ?? {}
			};

			const result = await compiledItems.evaluate(templateKey, context, {libraries : {jsonata: jsonata}});
			return result;
		} catch (error) {
			this.loggerService.error(`FormComponentValueChangeEventConsumer: Error evaluating expression template.`, error);
			return event.value;
		}
	}

  protected override async consumeEvent(event: FieldValueChangedEvent, expression: FormExpressionsConfigFrame): Promise<void> {
		// Compute the expression result 
		let targetValue: unknown = event.value;
		if (expression.config.hasTemplate) {
			// Evaluate the pre-compiled JSONata expression template (CSP-safe)
			targetValue = await this.evaluateExpressionTemplate(expression, event);
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
			if (this.options?.definition?.layout) {
				_set(this.options.definition.layout, layoutPath, targetValue);
			}
		} else if (_startsWith(expression.config.target || '', 'component.')) {
			const componentPath = expression.config.target!.substring('component.'.length);
			if (this.options?.component) {
				_set(this.options.component, componentPath, targetValue);
			}
		} else {
			this.loggerService.warn(`FormComponentValueChangeEventConsumer: Unknown target '${expression.config.target}' in expression config.`, expression);
		}
  }
}
