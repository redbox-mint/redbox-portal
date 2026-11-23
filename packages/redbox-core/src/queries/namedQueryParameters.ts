/** Safe refusal for request values that could become Mongo query syntax. */
export class NamedQueryParameterError extends Error {
  readonly status = 400;
}

const literalOperandOperators = new Set([
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
  '>', '>=', '<', '<=', '!=', 'in', 'nin',
]);

export function assertNamedQueryParameterSafe(
  name: string,
  definition: { readonly type?: string; readonly queryType?: string },
  value: unknown
): void {
  if ((definition.type === 'object' || definition.type === 'array') && literalOperandOperators.has(definition.queryType ?? '')) return;
  const pending = [value];
  const seen = new Set<object>();
  while (pending.length) {
    const input = pending.pop();
    if (input === null || typeof input !== 'object' || seen.has(input)) continue;
    seen.add(input);
    if (!Array.isArray(input)) throw new NamedQueryParameterError(`${name} contains an unsafe query parameter`);
    for (const [key, item] of Object.entries(input)) {
      if (key.startsWith('$') || key.includes('.')) throw new NamedQueryParameterError(`${name} contains an unsafe query parameter`);
      pending.push(item);
    }
  }
}
