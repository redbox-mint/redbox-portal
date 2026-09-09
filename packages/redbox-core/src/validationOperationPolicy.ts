/**
 * Apply one validation-operation restriction layer.
 *
 * Omission inherits the existing restriction, while an explicit empty list is
 * retained and therefore denies every value. More-specific layers may only
 * narrow the effective policy.
 */
export function intersectValidationOperationRestrictions(
  existing: readonly string[] | undefined,
  next: readonly string[] | undefined
): string[] | undefined {
  if (next === undefined) return existing === undefined ? undefined : [...existing];
  if (existing === undefined) return [...next];
  const allowed = new Set(next);
  return existing.filter(item => allowed.has(item));
}
