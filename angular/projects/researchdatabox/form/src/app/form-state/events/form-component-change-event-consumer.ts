import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FormComponentEventType,
  FieldValueChangedEvent,
  FormComponentEventTypeValue,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import { FormExpressionsConfigFrame, FormExpressionsTargetModelValue } from '@researchdatabox/sails-ng-common';
import { FormArray } from '@angular/forms';
import { isPlainObject } from 'lodash-es';
import { isCustomSetValueControl } from '../custom-set-value.control';

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

  protected override async consumeEvent(
    event: FieldValueChangedEvent,
    expression: FormExpressionsConfigFrame
  ): Promise<void> {
    if (!('target' in expression.config)) return;
    const target = expression.config.target || '';
    const control = this.model?.formControl;
    const importsRows = event.recordImport && expression.config.hasTemplate &&
      target === FormExpressionsTargetModelValue && control instanceof FormArray && isCustomSetValueControl(control);
    // Reselecting the linked record leaves the current rows and their save proofs intact.
    if (importsRows && event.recordImport === 'same-selection') return;
    let targetValue: unknown = event.value;
    if (expression.config.hasTemplate) {
      // Evaluate the pre-compiled JSONata expression template (CSP-safe)
      targetValue = importsRows
        ? await this.evaluateExpressionJSONata(expression, event, 'template', {}, failedImport)
        : await this.evaluateExpressionJSONata(expression, event, 'template');
    }
    if (importsRows) {
      // A successful expression with no data leaves the current rows intact.
      if (targetValue === undefined || targetValue === null) return;
      if (isPlainObject(targetValue)) targetValue = [targetValue];
      if (!Array.isArray(targetValue)) throw new Error('Could not evaluate the linked record import.');
      await this.setTarget(targetValue, target, event, expression, { emitEvent: false, replaceImportedRows: true });
      return;
    }
    await this.setTarget(targetValue, target, event, expression);
  }
}
