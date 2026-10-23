import type { CacheEntryWrite, JsonValue } from './CacheEntryRepository';

/** Messages describe structure only; never include persisted payloads. */
export class InvalidCacheEntryError extends TypeError {
  readonly code = 'invalid-cache-entry';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidCacheEntryError';
  }
}

/** Validate without invoking toJSON, accessors or any serialization/coercion. */
export function assertJsonValue(value: unknown): asserts value is JsonValue {
  const ancestors = new Set<object>();
  const visit = (item: unknown): void => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || item === null) {
      throw new InvalidCacheEntryError('Cache data must contain only finite JSON values');
    }
    const array = Array.isArray(item);
    if (array && Object.getPrototypeOf(item) !== Array.prototype) {
      throw new InvalidCacheEntryError('Cache arrays must be plain arrays');
    }
    if (!array && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new InvalidCacheEntryError('Cache data must contain only plain objects and arrays');
    }
    if (ancestors.has(item)) throw new InvalidCacheEntryError('Cache data must not contain cycles');
    ancestors.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors);
    if (array && keys.length !== item.length + 1) {
      throw new InvalidCacheEntryError('Cache arrays must be dense and contain no extra properties');
    }
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
        throw new InvalidCacheEntryError('Cache data members must be enumerable string data properties');
      }
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length)) {
        throw new InvalidCacheEntryError('Cache arrays must contain only indexed values');
      }
      visit(descriptor.value);
    }
    ancestors.delete(item);
  };
  visit(value);
}

/** Preserve structural legacy reads, including names that cannot be written anew. */
export function assertCacheEntryRecord(entry: unknown): asserts entry is CacheEntryWrite {
  if (typeof entry !== 'object' || entry === null) throw new InvalidCacheEntryError('Cache write must be an object');
  const fields = Object.getOwnPropertyDescriptors(entry);
  if (!fields.name || !('value' in fields.name) || typeof fields.name.value !== 'string') {
    throw new InvalidCacheEntryError('Cache name must be a string');
  }
  if (
    !fields.ts_added ||
    !('value' in fields.ts_added) ||
    typeof fields.ts_added.value !== 'number' ||
    !Number.isFinite(fields.ts_added.value)
  ) {
    throw new InvalidCacheEntryError('Cache ts_added must be finite numeric epoch seconds');
  }
  if (fields.data) {
    if (!('value' in fields.data)) throw new InvalidCacheEntryError('Cache data must be a data property');
    assertJsonValue(fields.data.value);
  }
}

/** Absence of data is allowed; submitted names follow Waterline's required string rule. */
export function assertCacheEntryWrite(entry: unknown): asserts entry is CacheEntryWrite {
  assertCacheEntryRecord(entry);
  if (entry.name.length === 0) throw new InvalidCacheEntryError('Cache name must be a non-empty string');
}
