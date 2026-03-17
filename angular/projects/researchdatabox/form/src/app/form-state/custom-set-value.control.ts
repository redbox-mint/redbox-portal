export interface CustomSetValueControl<ValueType = unknown> {
  setCustomValue(value: ValueType, options?: { emitEvent?: boolean; onlySelf?: boolean }): Promise<void> | void;
}

export function isCustomSetValueControl<ValueType = unknown>(control: unknown): control is CustomSetValueControl<ValueType> {
  return typeof (control as CustomSetValueControl<ValueType> | undefined)?.setCustomValue === 'function';
}
