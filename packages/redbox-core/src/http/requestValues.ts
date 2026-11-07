/** Request data is not a coercible value: qs/JSON objects may shadow toString.
 * Copy string arrays before negotiation so their own methods are never invoked. */
export function requestStrings(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return undefined;
  const strings: string[] = [];
  for (let index = 0; index < value.length; index++) {
    if (typeof value[index] !== 'string') return undefined;
    strings.push(value[index]);
  }
  return strings;
}

export function requestString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function requestText(value: unknown): string | undefined {
  const strings = requestStrings(value);
  return Array.isArray(strings) ? strings.join(',') : strings;
}
