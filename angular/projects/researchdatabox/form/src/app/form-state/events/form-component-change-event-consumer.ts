import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FormComponentEventType,
  FormComponentEvent,
  FormComponentEventTypeValue,
  recordImportApplications,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import {
  ExpressionsConditionKind,
  FormExpressionsConfigFrame,
  FormExpressionsTargetModelValue,
  PublishDataLocationSelectorModelName,
} from '@researchdatabox/sails-ng-common';
import { FormArray, FormControl } from '@angular/forms';
import { isPlainObject } from 'lodash-es';
import { isCustomSetValueControl } from '../custom-set-value.control';

import { take } from 'rxjs';
import { FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';

const failedImport = Symbol('failedImport');

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
    if (!('target' in expression.config)) return;
    const target = expression.config.target || '';
    const isModelUpdate = target === FormExpressionsTargetModelValue;
    const fieldEvent = event.type === FormComponentEventType.FIELD_VALUE_CHANGED ? event : undefined;
    const recordImport = isModelUpdate ? fieldEvent?.recordImport : undefined;
    if (recordImport === 'no-import') return;
    const application = isModelUpdate ? fieldEvent?.[recordImportApplications] : undefined;

    const control = this.model?.formControl;
    const importsRows = recordImport && expression.config.hasTemplate &&
      control instanceof FormArray && isCustomSetValueControl(control);
    // Reselecting the linked record leaves the current rows and their save proofs intact.
    if (importsRows && recordImport === 'same-selection') return;

    let targetValue: unknown = fieldEvent?.value;
    if (expression.config.hasTemplate) {
      targetValue = application
        ? await this.evaluateExpressionJSONata(expression, event, 'template', {}, failedImport)
        : await this.evaluateExpressionJSONata(expression, event, 'template');
    }
    if (targetValue === failedImport) throw new Error('Could not evaluate the linked record import.');

    if (recordImport && this.model?.fieldConfig.class === PublishDataLocationSelectorModelName) {
      // JSONata's $map collapses one result to an object and zero results to undefined.
      if (targetValue == null) targetValue = [];
      else if (Array.isArray(targetValue)) targetValue = [...targetValue];
      else if (isPlainObject(targetValue)) targetValue = [targetValue];
      else throw new Error('Expected a list of publication data locations.');
    } else if (importsRows && recordImport === 'changed-selection') {
      if (targetValue == null) targetValue = [];
      // Keep manual and previously stored creators when no replacement contributors are supplied.
      const onlyImportedRows = Array.isArray(targetValue) && !targetValue.length &&
        expression.name === 'dataPublication-creators-from-dataRecord';
      if (isPlainObject(targetValue)) targetValue = [targetValue];
      if (!Array.isArray(targetValue)) throw new Error('Expected a list of linked record rows.');
      await this.setTarget(targetValue, target, event, expression, { emitEvent: false, replaceImportedRows: true, ...(onlyImportedRows ? { onlyImportedRows } : {}) });
      return;
    } else if (application && targetValue === undefined) {
      if (!application.changedSelection || !(control instanceof FormControl)) return;
      // Serialize a clear explicitly so a form save removes the previous selection's value.
      targetValue = null;
    }
    await this.setTarget(targetValue, target, event, expression);
  }
}
