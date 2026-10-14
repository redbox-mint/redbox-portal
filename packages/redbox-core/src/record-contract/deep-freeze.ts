/** Freeze every reachable object once while preserving the original value identity. */
export function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;

  const pending: object[] = [value];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === 'object') pending.push(child);
    }
    Object.freeze(current);
  }
  return value;
}
