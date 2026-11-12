/** Read metadata tokens literally, using only the object's own properties. */
export function readRelatedReference(value: unknown, tokens: readonly string[]): unknown {
  for (const token of tokens) {
    if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, token)) return undefined;
    value = (value as Record<string, unknown>)[token];
  }
  return value;
}

/** Normalize scalar/object references; path interpretation belongs to the caller.
 * referenceIndices[i] lists every original position for the deduplicated values[i].
 */
export function normalizeRelatedReferenceValues(raw: unknown, readIdentifier?: (value: object) => unknown) {
  const references = new Map<string, number[]>();
  const invalidIndices: number[] = [];
  (Array.isArray(raw) ? raw : [raw]).forEach((value, index) => {
    if (value == null || value === '') return;
    const identifier = typeof value === 'string' ? value
      : typeof value === 'object' && !Array.isArray(value) ? readIdentifier?.(value) : undefined;
    if (typeof identifier !== 'string') invalidIndices.push(index);
    else if (identifier.trim()) {
      const key = identifier.trim();
      const indices = references.get(key);
      if (indices) indices.push(index);
      else references.set(key, [index]);
    }
  });
  // Keep every original position, including duplicates, for issue correlation and refresh identity.
  return { values: [...references.keys()], invalidIndices, referenceIndices: [...references.values()] };
}
