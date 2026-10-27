import { PersistenceError } from './errors';
import { normalizePersistenceField } from './scalars';

/** Schema order makes field diagnostics stable; callbacks own domain/enum rules. */
export function normalizePersistenceFields(
  fields: Record<string, { type: string; required?: boolean; nullable?: boolean; default?: unknown }>,
  values: Record<string, unknown>,
  patch: boolean
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, spec] of Object.entries(fields)) {
    try {
      const value = normalizePersistenceField(values[field], spec, patch);
      if (value !== undefined) result[field] = value;
    } catch {
      throw new PersistenceError(
        patch ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
        `Invalid persistence field: ${field}.`
      );
    }
  }
  return result;
}
