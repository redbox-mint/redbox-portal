import { assertJsonValue } from './cache/validation';
import { PersistenceError } from './errors';

/** Explicit scalar codecs for the persisted domain contract. */
export function coercePersistenceScalar(value: unknown, type: string): unknown {
  if (type === 'json') {
    assertJsonValue(value);
    return structuredClone(value);
  }
  if (type === 'string') {
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toJSON();
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
  }
  if (type === 'number') {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return Number(value);
    if (typeof value === 'string' && value !== '' && !/\s/.test(value) && Number.isFinite(Number(value)))
      return Number(value);
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
  }
  throw new PersistenceError('scalar-validation', 'Persistence scalar does not match the qualified attribute type.');
}

/** @internal One value codec for qualified model fields, independent of ORM/model loading. */
export function normalizePersistenceField(
  value: unknown,
  spec: { type: string; required?: boolean; nullable?: boolean; default?: unknown },
  patch: boolean
): unknown {
  if (value === undefined) {
    if (patch) return undefined;
    if (spec.required) throw new PersistenceError('scalar-validation', 'A required persistence field is missing.');
    value = Object.hasOwn(spec, 'default')
      ? structuredClone(spec.default)
      : spec.nullable || spec.type === 'json' || spec.type === 'id'
        ? null
        : spec.type === 'string'
          ? ''
          : spec.type === 'number'
            ? 0
            : false;
  }
  if (spec.required && (value === null || value === ''))
    throw new PersistenceError('scalar-validation', 'A required persistence field is missing.');
  if (spec.type === 'id') return value === '' ? null : value;
  if (value === null && spec.nullable) return null;
  if (spec.type === 'json') {
    assertJsonValue(value);
    return structuredClone(value);
  }
  const scalar = coercePersistenceScalar(value, spec.type);
  if (typeof scalar !== spec.type || (spec.type === 'number' && !Number.isFinite(scalar)))
    throw new PersistenceError('scalar-validation', 'Persistence scalars must match their finite qualified types.');
  return scalar;
}

/** Query null is a comparison value, independent of a model's write nullability. */
export function coercePersistenceQueryScalar(value: unknown, type: string): unknown {
  return value === null ? null : coercePersistenceScalar(value, type);
}
/** Normalize only scalar arguments of explicit domain queries; no operators or collections. */
export function persistenceQueryFields(values: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => [field, coercePersistenceQueryScalar(value, 'string')])
  );
}
/** The typed time-bound shape shared by harvest and SIEM list/count operations. */
export function persistenceStringBounds(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  const invalid = (): never => {
    throw new PersistenceError(
      'scalar-validation',
      'Use a nonempty time-bound dictionary with >= or <= scalar comparisons.'
    );
  };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid();
  const entries = Object.entries(value as object);
  if (!entries.length) invalid();
  return Object.fromEntries(
    entries.map(([operator, bound]) => {
      if (!['>=', '<='].includes(operator) || bound === undefined || bound === null) invalid();
      return [operator === '>=' ? '$gte' : '$lte', coercePersistenceQueryScalar(bound, 'string')];
    })
  );
}

/** Validate a native patch without applying model coercion, defaults or timestamp behavior. */
export function assertPersistencePatch(values: unknown): void {
  const invalid = (): never => {
    throw new PersistenceError(
      'scalar-validation',
      'Native persistence patches require plain finite JSON dictionaries.'
    );
  };
  if (
    !values ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(values))
  )
    invalid();
  try {
    assertJsonValue(values);
  } catch {
    invalid();
  }
}
