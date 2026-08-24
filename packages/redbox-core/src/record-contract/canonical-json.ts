import type { ContractJsonObject, ContractJsonValue } from './types';

export type RedboxCanonicalJsonErrorReason =
  | 'accessor-property'
  | 'cycle'
  | 'non-enumerable-property'
  | 'non-finite-number'
  | 'non-json-type'
  | 'non-plain-object'
  | 'sparse-or-extended-array'
  | 'symbol-property';

/** A value Redbox Canonical JSON v1 cannot represent without silently changing it. */
export class RedboxCanonicalJsonError extends Error {
  public constructor(
    public readonly reason: RedboxCanonicalJsonErrorReason,
    public readonly path: string,
    message: string
  ) {
    super(message);
    this.name = 'RedboxCanonicalJsonError';
  }
}

function compareLexicographically(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function childPath(path: string, key: string): string {
  return `${path}[${JSON.stringify(key)}]`;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const pending: object[] = [value];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === 'object') {
        pending.push(child);
      }
    }
    Object.freeze(current);
  }
  return value;
}

function normalizedArray(
  value: readonly unknown[],
  path: string,
  ancestors: Set<object>
): readonly ContractJsonValue[] {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new RedboxCanonicalJsonError(
      'symbol-property',
      path,
      `${path} contains a symbol property, which Redbox Canonical JSON v1 rejects.`
    );
  }

  const names = Object.getOwnPropertyNames(value);
  const expectedPropertyCount = value.length + 1;
  if (names.length !== expectedPropertyCount || !names.includes('length')) {
    throw new RedboxCanonicalJsonError(
      'sparse-or-extended-array',
      path,
      `${path} is sparse or has extended array properties, which Redbox Canonical JSON v1 rejects.`
    );
  }

  const result: ContractJsonValue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const property = String(index);
    if (!Object.prototype.hasOwnProperty.call(value, property)) {
      throw new RedboxCanonicalJsonError(
        'sparse-or-extended-array',
        path,
        `${path} is sparse, which Redbox Canonical JSON v1 rejects.`
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new RedboxCanonicalJsonError(
        'sparse-or-extended-array',
        `${path}[${index}]`,
        `${path}[${index}] is not an ordinary array item.`
      );
    }
    result.push(normalizeValue(descriptor.value, `${path}[${index}]`, ancestors));
  }
  return result;
}

function normalizedObject(value: object, path: string, ancestors: Set<object>): ContractJsonObject {
  if (!isPlainObject(value)) {
    throw new RedboxCanonicalJsonError(
      'non-plain-object',
      path,
      `${path} is not a plain JSON object, which Redbox Canonical JSON v1 rejects.`
    );
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new RedboxCanonicalJsonError(
      'symbol-property',
      path,
      `${path} contains a symbol property, which Redbox Canonical JSON v1 rejects.`
    );
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, ContractJsonValue> = Object.create(null) as Record<string, ContractJsonValue>;
  for (const key of Object.keys(descriptors).sort(compareLexicographically)) {
    const descriptor = descriptors[key];
    const propertyPath = childPath(path, key);
    if (!descriptor.enumerable) {
      throw new RedboxCanonicalJsonError(
        'non-enumerable-property',
        propertyPath,
        `${propertyPath} is non-enumerable, which Redbox Canonical JSON v1 rejects.`
      );
    }
    if (!('value' in descriptor)) {
      throw new RedboxCanonicalJsonError(
        'accessor-property',
        propertyPath,
        `${propertyPath} is an accessor, which Redbox Canonical JSON v1 rejects without invoking it.`
      );
    }
    result[key] = normalizeValue(descriptor.value, propertyPath, ancestors);
  }
  return result;
}

function normalizeValue(value: unknown, path: string, ancestors: Set<object>): ContractJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RedboxCanonicalJsonError(
        'non-finite-number',
        path,
        `${path} contains a non-finite number, which Redbox Canonical JSON v1 rejects.`
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') {
    throw new RedboxCanonicalJsonError(
      'non-json-type',
      path,
      `${path} contains ${typeof value}, which Redbox Canonical JSON v1 rejects.`
    );
  }
  if (ancestors.has(value)) {
    throw new RedboxCanonicalJsonError(
      'cycle',
      path,
      `${path} contains a cycle, which Redbox Canonical JSON v1 rejects.`
    );
  }

  ancestors.add(value);
  try {
    return Array.isArray(value) ? normalizedArray(value, path, ancestors) : normalizedObject(value, path, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function serializeNormalized(value: ContractJsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeNormalized).join(',')}]`;
  }
  const objectValue = value as ContractJsonObject;
  return `{${Object.keys(objectValue)
    .sort(compareLexicographically)
    .map(key => `${JSON.stringify(key)}:${serializeNormalized(objectValue[key])}`)
    .join(',')}}`;
}

/**
 * Clone and validate a value using Redbox Canonical JSON format v1 rules.
 *
 * V1 accepts only ordinary JSON values, preserves array order, converts -0 to
 * JSON's ordinary `0`, and orders object keys lexicographically by UTF-16 code
 * units. It deliberately rejects every value JSON.stringify would omit or
 * silently rewrite, as well as cycles, accessors, and non-plain objects.
 */
export function normalizeRedboxCanonicalJsonV1(value: unknown): ContractJsonValue {
  return freezeDeep(normalizeValue(value, '$', new Set<object>()));
}

/** Serialize a value as Redbox Canonical JSON format v1. */
export function serializeRedboxCanonicalJsonV1(value: unknown): string {
  return serializeNormalized(normalizeRedboxCanonicalJsonV1(value));
}
