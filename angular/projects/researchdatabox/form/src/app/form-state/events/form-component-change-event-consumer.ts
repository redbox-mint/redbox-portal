import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FormComponentEventType,
  FieldValueChangedEvent,
  FormComponentEventTypeValue,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import {
  FormExpressionsConfigFrame,
  FormExpressionsTargetModelValue,
  PublishDataLocationSelectorModelName,
} from '@researchdatabox/sails-ng-common';
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
    const importsValue = event.recordImport !== undefined && target === FormExpressionsTargetModelValue;
    if (importsValue && event.recordImport === 'no-import') return;

    const control = this.model?.formControl;
    const importsRows = importsValue && expression.config.hasTemplate &&
      control instanceof FormArray && isCustomSetValueControl(control);
    // Reselecting the linked record leaves the current rows and their save proofs intact.
    if (importsRows && event.recordImport === 'same-selection') return;

    let targetValue: unknown = event.value;
    if (expression.config.hasTemplate) {
      targetValue = importsValue
        ? await this.evaluateExpressionJSONata(expression, event, 'template', {}, failedImport)
        : await this.evaluateExpressionJSONata(expression, event, 'template');
    }
    if (targetValue === failedImport) throw new Error('Could not evaluate the linked record import.');

    if (importsValue && this.model?.fieldConfig.class === PublishDataLocationSelectorModelName) {
      // JSONata's $map collapses one result to an object and zero results to undefined.
      if (targetValue == null) targetValue = [];
      else if (Array.isArray(targetValue)) targetValue = [...targetValue];
      else if (isPlainObject(targetValue)) targetValue = [targetValue];
      else throw new Error('Expected a list of publication data locations.');
    } else if (importsRows && event.recordImport === 'changed-selection') {
      if (targetValue == null) return;
      if (isPlainObject(targetValue)) targetValue = [targetValue];
      if (!Array.isArray(targetValue)) throw new Error('Expected a list of linked record rows.');
      await this.setTarget(targetValue, target, event, expression, { emitEvent: false, replaceImportedRows: true });
      return;
    } else if (importsValue && targetValue === undefined) {
      return;
    }
    await this.setTarget(targetValue, target, event, expression);
  }
}
