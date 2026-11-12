/** Public refusal for client values that could become executable predicates. */
export class NamedQueryParameterError extends Error {
  readonly status = 400;
}
// Mongo comparison operands and membership elements are literal data. Mongo
// still rejects some membership shapes (e.g. a leading-$ document); leave those
// to its unchanged validation/error path rather than rewriting the predicate.
// Keep aliases in the same allowlist as their supported persistence operators.
// $all (which accepts $elemMatch), $not, $elemMatch, $expr, $where and text/
// predicate operators deliberately stay out of this literal-operand boundary.
const literalOperandOperators = new Set([
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
  '>', '>=', '<', '<=', '!=', 'in', 'nin',
]);
/** Inspect only: resolution, templates and conversions belong to the retained pipeline. */
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
    if (!Array.isArray(input))
      throw new NamedQueryParameterError(`${name} contains an unsafe query parameter`);
    for (const [key, item] of Object.entries(input)) {
      // Outside a literal operand, client keys must never become query syntax.
      if (key.startsWith('$') || key.includes('.'))
        throw new NamedQueryParameterError(`${name} contains an unsafe query parameter`);
      pending.push(item);
    }
  }
}
