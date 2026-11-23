/** Safe refusal for request values that could become Mongo query syntax. */
export class NamedQueryParameterError extends Error {
  readonly status = 400;
}

const comparisonAliases = ['>', '>=', '<', '<=', '!=', 'in', 'nin'];
const literalOperandOperators = new Set([
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', ...comparisonAliases,
]);
const namedQueryModifiers = new Set([...comparisonAliases, 'contains', 'startsWith', 'endsWith', 'like']);

// Waterline also accepts these aliases on paths that use its criteria directly.
const legacyWaterlineModifiers = new Set([
  'lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual', 'not', '!', '!==',
]);

export function isNamedQueryOperator(key: string): boolean {
  return key.startsWith('$') || namedQueryModifiers.has(key);
}

export function assertNamedQueryParameterSafe(
  name: string,
  definition: { readonly type?: string; readonly queryType?: string },
  value: unknown
): void {
  const structured = definition.type === 'object' || definition.type === 'array';
  if (structured && literalOperandOperators.has(definition.queryType ?? '')) return;
  const pending = [value];
  const seen = new Set<object>();
  while (pending.length) {
    const input = pending.pop();
    if (input === null || typeof input !== 'object' || seen.has(input)) continue;
    seen.add(input);
    if (!structured) throw new NamedQueryParameterError(`${name} contains an unsafe query parameter`);
    for (const [key, item] of Object.entries(input)) {
      if (isNamedQueryOperator(key) || legacyWaterlineModifiers.has(key) || key.includes('.')) {
        throw new NamedQueryParameterError(`${name} contains an unsafe query parameter`);
      }
      pending.push(item);
    }
  }
}
