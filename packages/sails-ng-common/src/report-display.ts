/** Screen-only formatting. CSV always receives the original value. */
export type ReportDisplayFormat = 'text' | 'date' | 'datetime';
export interface ReportDisplayOptions {
  format?: ReportDisplayFormat;
  valueLabels?: { value: string; label: string }[];
}

/** Also used by the explorer. Unknown choices retain their original value. */
export function choiceValue<T>(
  choices: { value: string; label: string }[] | undefined,
  value: T
): T | string | unknown[] {
  if (Array.isArray(value)) return value.map(item => choiceValue(choices, item));
  if (value == null || typeof value === 'object') return value;
  return choices?.find(choice => choice.value === String(value))?.label ?? value;
}

export function reportDisplayValue(value: unknown, column: ReportDisplayOptions, locale = 'en-AU'): unknown {
  if (Array.isArray(value)) return value.map(item => reportDisplayValue(item, column, locale));
  const labelled = choiceValue(column.valueLabels, value);
  if (!['date', 'datetime'].includes(column.format ?? '') || value == null || value === '') return labelled;
  // Reject non-date text instead of letting Date.parse guess codes and numbers.
  if (!(value instanceof Date) && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)))
    return labelled;
  const date = value instanceof Date ? value : new Date(value as string);
  if (!Number.isFinite(date.getTime())) return labelled;
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
    ...(column.format === 'datetime' ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
  // English locales disagree on Jun/June, Jul/July and Sep/Sept. Use fixed short
  // month names while retaining the locale's date order, time and punctuation.
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date);
  return formatter
    .formatToParts(date)
    .map(part => (part.type === 'month' && /^en(?:-|$)/i.test(locale) ? month : part.value))
    .join('');
}
