/** Read metadata tokens literally, using only the object's own properties. */
export function readRelatedReference(value: unknown, tokens: readonly string[]): unknown {
  for (const token of tokens) {
    if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, token)) return undefined;
    value = (value as Record<string, unknown>)[token];
  }
  return value;
}

/** Normalize scalar/object references; path interpretation belongs to the caller. */
export function normalizeRelatedReferenceValues(raw: unknown, readIdentifier?: (value: object) => unknown) {
  const values = new Set<string>();
  const invalidIndices: number[] = [];
  (Array.isArray(raw) ? raw : [raw]).forEach((value, index) => {
    if (value == null || value === '') return;
    const identifier = typeof value === 'string' ? value
      : typeof value === 'object' && !Array.isArray(value) ? readIdentifier?.(value) : undefined;
    if (typeof identifier !== 'string') invalidIndices.push(index);
    else if (identifier.trim()) values.add(identifier.trim());
  });
  return { values: [...values], invalidIndices };
}
