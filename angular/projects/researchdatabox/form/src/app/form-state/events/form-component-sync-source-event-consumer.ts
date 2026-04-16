import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FieldValueChangedEvent,
  FormComponentEventType,
  FormComponentEventTypeValue,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import {
  FormExpressionsConfigFrame,
} from '@researchdatabox/sails-ng-common';
import { FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';

/**
 * Dedicated value-change consumer for components that declare syncSources.
 *
 * Design intent:
 * - keep the regular value-change consumer unchanged for existing components
 * - make sync-source behaviour opt-in via component config
 * - treat `undefined` template results as "no-op" rather than "clear value"
 *
 * This supports additive contributor-permission sync where typeahead keystrokes
 * must not wipe repeatable rows before the user commits a selection.
 */
export class FormComponentSyncSourceEventConsumer extends FormComponentEventBaseConsumer {
  protected override readonly consumedEventType: FormComponentEventTypeValue =
    FormComponentEventType.FIELD_VALUE_CHANGED;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  override bind(options: FormComponentEventBindingOptions): void {
    super.bind(options);    
  }

  protected override async consumeEvent(
    event: FieldValueChangedEvent,
    expression: FormExpressionsConfigFrame
  ): Promise<void> {
    let targetValue: unknown = event.value;
    if (expression.config.hasTemplate) {
      targetValue = await this.evaluateExpressionJSONata(expression, event, 'template');
      if (targetValue === undefined) {
        return;
      }
    }

    if ('target' in expression.config) {
      const exprTarget = expression.config.target || '';
      await this.setTarget(targetValue, exprTarget, event, expression);
    }
  }

}
