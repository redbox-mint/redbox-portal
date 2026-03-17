import { AbstractControl } from '@angular/forms';

export type ControlSetValueOptions = { emitEvent?: boolean; onlySelf?: boolean };

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
