import { AbstractControl } from '@angular/forms';
import {FormValidationGroupsChangeRequestEvent} from "./events";
import {ModifyOptions} from "@researchdatabox/portal-ng-common";
import {guessType} from "@researchdatabox/sails-ng-common";

export type ControlSetValueOptions = ModifyOptions;

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
  if (!control) {
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
