import { FormFieldBaseComponent, FormFieldModel, LoggerService } from '@researchdatabox/portal-ng-common';
import {
  FormExpressionsTargetComponentPrefix,
  FormExpressionsTargetFieldDisabled,
  FormExpressionsTargetFieldVisible,
  FormExpressionsTargetLayoutPrefix,
  FormExpressionsTargetModelDisabled,
  FormExpressionsTargetModelValue,
  FormExpressionsTargetValidationGroups,
  toBoolean,
} from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from './events/form-component-event-bus.service';
import { createFormValidationGroupsChangeRequestEvent } from './events/form-component-event.types';
import { isTypeFormValidationGroupsChangeRequestInfo, setControlValue } from './custom-set-value.control';
import { CustomDisplaySyncComponentLike, syncComponentDisplayFromModel } from './custom-display-sync.control';

/**
 * The pieces of a form field that expression targets can mutate.
 *
 * Component expressions build this from their bound component
 * (`FormComponentBaseEventConsumer`), while form behaviours build it from a
 * resolved `FormFieldCompMapEntry` — both expose the same `model`, `component`
 * and `layout` objects, which is what lets the two features share one target
 * vocabulary.
 */
export interface ExpressionTargetHost {
  model?: FormFieldModel<unknown>;
  component?: FormFieldBaseComponent<unknown>;
  layout?: FormFieldBaseComponent<unknown>;
  /**
   * Component used for display sync after `model.value` writes. Component
   * expressions pass their bound component instance here; defaults to
   * `component` when not provided.
   */
  displayComponent?: CustomDisplaySyncComponentLike | null;
}

export interface ApplyExpressionTargetContext {
  eventBus: Pick<FormComponentEventBus, 'publish'>;
  logger: LoggerService;
  broadcastFormStatus?: () => void;
  /** fieldId attached to published validation-groups change-request events. */
  eventFieldId?: string;
}

/**
 * Apply an expression target mutation to a field host.
 *
 * Supported targets:
 * - `model.value` → the model's form control value (silent write + display sync)
 * - `model.disabled` → the model's disabled state
 * - `layout.[prop]` / `component.[prop]` → arbitrary layout/component property
 * - `field.visible` → convenience: `component.visible` + `layout.visible`
 * - `field.disabled` → convenience: `component.disabled` + `layout.disabled` + `model.disabled`
 * - `form.enabledValidationGroups` → publish a validation-groups change request
 *
 * Callers own any publish gating for `form.enabledValidationGroups` (component
 * expressions only publish for scoped events); this helper publishes
 * unconditionally. A behaviour whose condition matches the published
 * change-request event can re-trigger itself, so behaviour authors should
 * scope conditions accordingly.
 */
export async function applyExpressionTarget(
  target: string,
  targetValue: unknown,
  host: ExpressionTargetHost,
  ctx: ApplyExpressionTargetContext
): Promise<void> {
  if (target === FormExpressionsTargetModelValue) {
    // The model.value property must be handled specially.
    if (host.model?.formControl && host.model.formControl.value !== targetValue) {
      await setControlValue(host.model.formControl, targetValue, { emitEvent: false });
      await syncComponentDisplayFromModel(host.displayComponent ?? host.component);
      // setControlValue with emitEvent:false suppresses Angular's
      // StatusChangeEvent/PristineChangeEvent. Without an explicit re-broadcast,
      // listeners like SaveButtonComponent never see that an expression-driven
      // update flipped the form to valid (e.g. a downstream "required" target
      // becoming populated), and the Save button stays disabled. Re-emit the
      // current form status so signal-effect consumers can re-evaluate.
      ctx.broadcastFormStatus?.();
    }

  } else if (target === FormExpressionsTargetModelDisabled) {
    // The model.disabled property must be handled specially.
    const disabled = toBoolean(targetValue);
    host.model?.setDisabled?.(disabled, { emitEvent: false, onlySelf: true });

  } else if (target.startsWith(FormExpressionsTargetLayoutPrefix)) {
    const name = target.substring(FormExpressionsTargetLayoutPrefix.length);
    host.layout?.setProperty?.(name, targetValue);

  } else if (target.startsWith(FormExpressionsTargetComponentPrefix)) {
    const name = target.substring(FormExpressionsTargetComponentPrefix.length);
    host.component?.setProperty?.(name, targetValue);

  } else if (target === FormExpressionsTargetFieldVisible) {
    const name = 'visible';
    const visible = toBoolean(targetValue);
    host.component?.setProperty?.(name, visible);
    host.layout?.setProperty?.(name, visible);

  } else if (target === FormExpressionsTargetFieldDisabled) {
    const name = 'disabled';
    const disabled = toBoolean(targetValue);
    host.component?.setProperty?.(name, disabled);
    host.layout?.setProperty?.(name, disabled);
    host.model?.setDisabled?.(disabled, { emitEvent: false, onlySelf: true });

  } else if (target === FormExpressionsTargetValidationGroups) {
    if (isTypeFormValidationGroupsChangeRequestInfo(targetValue)) {
      ctx.eventBus.publish(createFormValidationGroupsChangeRequestEvent({
        // Create a broadcast event, as this event is intended as a general broadcast.
        sourceId: '*',
        fieldId: ctx.eventFieldId,
        ...targetValue,
      }));
    } else {
      ctx.logger.error(
        `applyExpressionTarget: Invalid value '${targetValue}' for expression target ${FormExpressionsTargetValidationGroups}, expected {initial?: '[value]', groups: {include?: string[], exclude?: string[]}}.`,
        { target, targetValue }
      );
    }

  } else {
    ctx.logger.warn(`applyExpressionTarget: Unknown target '${target}' in expression config.`, { target, targetValue });
  }
}
