import { PersistenceError } from './errors';

/** Inspect descriptors before copying; never evaluate getters or admit symbol keys. */
export function suppliedDataProperties(input: object, errorCode: string): Record<string, unknown> {
  const invalid = (): never => {
    throw new PersistenceError(errorCode, 'Persistence writes require plain data properties.');
  };
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    invalid();
  const values: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) invalid();
    if (descriptor.value !== undefined)
      Object.defineProperty(values, key, { value: descriptor.value, enumerable: true });
  }
  return values;
}
