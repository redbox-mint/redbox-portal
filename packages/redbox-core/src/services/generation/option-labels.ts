/** Resolve display text without changing the stored values; optionally keep only selected values. */
export function resolveOptionLabels(
  options: Array<{ value: string; label?: string; labelKey?: string }> | undefined,
  translate: (key: string) => string = key => key,
  selectedValues?: unknown[],
): Array<{ value: string; label: string }> | undefined {
  return options?.filter(option => selectedValues === undefined || selectedValues.includes(option.value))
    .map(option => ({ value: option.value, label: option.label || (option.labelKey ? translate(option.labelKey) : option.value) }));
}
