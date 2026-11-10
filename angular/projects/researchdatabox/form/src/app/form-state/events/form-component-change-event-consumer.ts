import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FormComponentEventType,
  FormComponentEvent,
  FormComponentEventTypeValue,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import { ExpressionsConditionKind, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { take } from 'rxjs';
import { FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';

/**
 * Consumes `valueChange` events from the `FormComponentEventBus` and updates the component's form control.
 *
 * Supported targets are specified in FormComponentEventBaseConsumer.setTarget.
 */
export class FormComponentValueChangeEventConsumer extends FormComponentEventBaseConsumer {
  protected override readonly consumedEventType: FormComponentEventTypeValue =
    FormComponentEventType.FIELD_VALUE_CHANGED;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  protected override setupEventConsumption(options: FormComponentEventBindingOptions, eventType: FormComponentEventTypeValue) {
    super.setupEventConsumption(options, eventType);
    if (this.formComp?.editMode() !== false || !this.expressions?.some(expr => expr.config.runInViewMode === true)) {
      return;
    }
    // View transforms remove source models, so there may be no initial value
    // event for a JSON Pointer condition. Initialize opted-in rules directly,
    // once per binding, in declaration order after the query source is ready.
    this.subscriptions.set(FormComponentEventType.FORM_DEFINITION_READY,
      this.eventBus.select$(FormComponentEventType.FORM_DEFINITION_READY).pipe(take(1)).subscribe(async event => {
        // The ready notification has no sourceId; the predicate matcher uses
        // this identity to allow form-ready evaluation of JSONata conditions.
        const readyEvent = { ...event, sourceId: FormComponentEventType.FORM_DEFINITION_READY };
        for (const expr of this.expressions ?? []) {
          // The synthetic ready event has no value for template-free copy rules.
          if (expr.config.runInViewMode === true && expr.config.runOnFormReady !== false && expr.config.hasTemplate) {
            const conditionKind = expr.config.conditionKind ?? ExpressionsConditionKind.JSONPointer;
            const isFieldChangeCondition = conditionKind === ExpressionsConditionKind.JSONPointer &&
              typeof expr.config.condition === 'string' &&
              this.getEventJSONPointerCondition(expr.config.condition).event === FormComponentEventType.FIELD_VALUE_CHANGED;
            // Only field-change pointers need the missing-source exception.
            // Other predicates use the same matcher as ordinary change events.
            if (isFieldChangeCondition || await super.getMatchedExpressions(readyEvent, [expr])) {
              await this.consumeEvent(readyEvent, expr);
            }
          }
        }
      }),
    );
  }

  protected override async getMatchedExpressions(event: FormComponentEvent, expressions: FormExpressionsConfigFrame[]) {
    // Modeled siblings also emit initial value events. The direct ready handler
    // above owns templated view initialization, so those events must not run it
    // again. Template-free rules still copy their source's initial value here.
    const candidates = this.formComp?.editMode() === false && event.sourceId === FormComponentEventType.FORM_DEFINITION_READY
      ? expressions.filter(expr => expr.config.runInViewMode !== true || !expr.config.hasTemplate)
      : expressions;
    return super.getMatchedExpressions(event, candidates);
  }

  protected override async consumeEvent(
    event: FormComponentEvent,
    expression: FormExpressionsConfigFrame
  ): Promise<void> {
    // Compute the expression result
    let targetValue: unknown = 'value' in event ? event.value : undefined;
    if (expression.config.hasTemplate) {
      // Evaluate the pre-compiled JSONata expression template (CSP-safe)
      targetValue = await this.evaluateExpressionJSONata(expression, event, 'template');
    }
    // Set the target based on the expression config
    if ('target' in expression.config) {
      const exprTarget = expression.config.target || '';
      await this.setTarget(targetValue, exprTarget, event, expression);
    }
  }
}
