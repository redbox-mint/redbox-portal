import { coercePersistenceScalar } from './scalars';
import { PersistenceError } from './errors';

/** @internal Preserve supplied model timestamps and Waterline's create/patch distinction. */
export function persistenceStringTimestamps(
  values: Record<string, unknown>,
  patch: boolean,
  automaticCreatedAt = true,
  now = new Date().toISOString()
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of automaticCreatedAt ? ['createdAt', 'updatedAt'] : ['updatedAt']) {
    const value = values[field];
    if (value === undefined) {
      if (!patch || field === 'updatedAt') result[field] = now;
    } else {
      // Waterline rejects empty/null auto timestamps before its scalar checker.
      if (value === null || value === '')
        throw new PersistenceError('scalar-validation', 'Automatic timestamps require nonempty scalar strings.');
      result[field] = coercePersistenceScalar(value, 'string');
    }
  }
  return result;
}
