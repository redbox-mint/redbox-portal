import { AbstractControl } from '@angular/forms';
import {FormValidationGroupsChangeRequestEvent} from "./events";
import {ModifyOptions} from "@researchdatabox/portal-ng-common";
import {guessType} from "@researchdatabox/sails-ng-common";

export type ControlSetValueOptions = ModifyOptions & {
  /** An asynchronous setter must stop applying a superseded source value. */
  isCurrent?: () => boolean;
};

/**
 * A control whose value is replaced by custom logic. An asynchronous setter must
 * pass the `options` object it receives to the control's own methods (such as
 * `setValue` or `push`) for changes made after awaiting. Expression writes use
 * that object to attribute the change to themselves for cycle detection. Check
 * `options.isCurrent` after awaiting before changing component-owned state.
 */
export interface CustomSetValueControl<ValueType = unknown> {
  setCustomValue(value: ValueType, options?: ControlSetValueOptions): Promise<void> | void;
}

export function isCustomSetValueControl<ValueType = unknown>(control: unknown): control is CustomSetValueControl<ValueType> {
  return typeof (control as CustomSetValueControl<ValueType> | undefined)?.setCustomValue === 'function';
}

export function setControlValue<ValueType = unknown>(
  control: AbstractControl<ValueType> | CustomSetValueControl<ValueType> | null | undefined,
  value: ValueType,
  options?: ControlSetValueOptions
): Promise<void> | void {
  if (!control || options?.isCurrent?.() === false) {
    return;
  }
  if (isCustomSetValueControl<ValueType>(control)) {
    return control.setCustomValue(value, options);
  }
  control.setValue(value, options);
}

export type FormValidationGroupsChangeRequestInfo = Pick<FormValidationGroupsChangeRequestEvent, 'initial' | 'groups'>;

export function isTypeFormValidationGroupsChangeRequestInfo(item: unknown): item is FormValidationGroupsChangeRequestInfo {
  if (item === undefined || item === null) {
    return false;
  }

  const guessedType = guessType(item);
  if (typeof item === 'object' && guessedType === "object"){
    return 'groups' in item;
  }

  return false;
}
