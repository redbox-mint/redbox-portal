import { isProxy } from 'node:util/types';
import { isRuntimeArray, isRuntimeRecord, type RuntimeValue } from './runtimeValues';

export interface BoundedValidationLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxStringLength: number;
  readonly maxPropertyNameLength: number;
  readonly maxWork: number;
  readonly arrayCardinalityLimit: (path: string) => number;
  readonly objectCardinalityLimit: (path: string) => number;
}

export interface BoundedValidationSuccess {
  readonly ok: true;
}

export interface BoundedValidationFailure {
  readonly ok: false;
  readonly path: string;
  readonly reason:
    | 'accessor'
    | 'bytes'
    | 'cardinality'
    | 'cycle'
    | 'depth'
    | 'inspection'
    | 'property-name'
    | 'prototype'
    | 'string'
    | 'work';
}

export type BoundedValidationResult = BoundedValidationSuccess | BoundedValidationFailure;

interface ValueTask {
  readonly kind: 'value';
  readonly value: RuntimeValue;
  readonly path: string;
  readonly depth: number;
  readonly arrayElement: boolean;
}

interface LeaveTask {
  readonly kind: 'leave';
  readonly value: object;
}

type ValidationTask = ValueTask | LeaveTask;

interface ValidationState {
  serializedBytes: number;
  work: number;
  readonly activeContainers: WeakSet<object>;
}

interface PropertyReadSuccess {
  readonly ok: true;
  readonly present: boolean;
  readonly value: RuntimeValue;
}

interface PropertyReadFailure {
  readonly ok: false;
  readonly reason: 'accessor' | 'inspection';
}

type PropertyReadResult = PropertyReadSuccess | PropertyReadFailure;

interface PropertyInspectionSuccess {
  readonly ok: true;
  readonly enumerableKeys: readonly string[];
}

type PropertyInspectionResult = PropertyInspectionSuccess | BoundedValidationFailure;

const safePathSegmentPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function failure(path: string, reason: BoundedValidationFailure['reason']): BoundedValidationFailure {
  return Object.freeze({ ok: false, path, reason });
}

function addBytes(state: ValidationState, bytes: number, maximum: number): boolean {
  if (bytes > maximum - state.serializedBytes) {
    return false;
  }
  state.serializedBytes += bytes;
  return true;
}

export function serializedStringByteLength(value: string): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function childObjectPath(path: string, key: string): string {
  return safePathSegmentPattern.test(key) ? `${path}.${key}` : `${path}.[invalid-key]`;
}

function serializedScalarBytes(task: ValueTask): number | undefined {
  const value = task.value;
  if (value === null) {
    return 4;
  }
  if (typeof value === 'string') {
    return serializedStringByteLength(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value).length : 4;
  }
  if (typeof value === 'boolean') {
    return value ? 4 : 5;
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return task.arrayElement ? 4 : 0;
  }
  return undefined;
}

function hasSupportedPrototype(value: object, arrayValue: boolean): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (arrayValue) {
    return prototype === Array.prototype || prototype === null;
  }
  return prototype === Object.prototype || prototype === null;
}

function readOwnDataProperty(container: object, key: string): PropertyReadResult {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (descriptor === undefined) {
    return Object.freeze({ ok: true, present: false, value: undefined });
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    return Object.freeze({ ok: false, reason: 'accessor' });
  }
  return Object.freeze({ ok: true, present: true, value: descriptor.value });
}

function inspectOwnProperties(
  container: object,
  path: string,
  state: ValidationState,
  limits: BoundedValidationLimits,
  cardinalityLimit: number
): PropertyInspectionResult {
  const enumerableKeys: string[] = [];

  // `for...in` lets the cardinality/work bounds stop a very large enumerable
  // object without first allocating an equally large key array. It also makes
  // inherited enumerable pollution visible without reading any property.
  for (const key in container) {
    state.work += 1;
    if (state.work > limits.maxWork) {
      return failure(path, 'work');
    }
    if (!Object.hasOwn(container, key)) {
      return failure(childObjectPath(path, key), 'prototype');
    }
    const descriptor = Object.getOwnPropertyDescriptor(container, key);
    if (descriptor === undefined) {
      return failure(childObjectPath(path, key), 'inspection');
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return failure(childObjectPath(path, key), 'accessor');
    }
    enumerableKeys.push(key);
    if (enumerableKeys.length > cardinalityLimit) {
      return failure(path, 'cardinality');
    }
  }

  // Validators can address known non-enumerable properties directly. Inspect
  // those descriptors too, but only after enumerable cardinality has passed.
  for (const key of Object.getOwnPropertyNames(container)) {
    state.work += 1;
    if (state.work > limits.maxWork) {
      return failure(path, 'work');
    }
    const descriptor = Object.getOwnPropertyDescriptor(container, key);
    if (descriptor === undefined) {
      return failure(childObjectPath(path, key), 'inspection');
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return failure(childObjectPath(path, key), 'accessor');
    }
  }
  return Object.freeze({ ok: true, enumerableKeys });
}

function serializedObjectProperty(value: RuntimeValue): boolean {
  return value !== undefined && typeof value !== 'function' && typeof value !== 'symbol';
}

/**
 * Inspects untrusted object graphs iteratively before a recursive validator is
 * allowed to see them. Accessors and custom prototypes are rejected so later
 * parsing cannot execute caller-controlled property reads.
 */
export function boundedValidationPreflight(
  value: RuntimeValue,
  limits: BoundedValidationLimits
): BoundedValidationResult {
  const state: ValidationState = {
    serializedBytes: 0,
    work: 0,
    activeContainers: new WeakSet<object>(),
  };
  const pending: ValidationTask[] = [{ kind: 'value', value, path: '$', depth: 0, arrayElement: false }];

  try {
    while (pending.length > 0) {
      const task = pending.pop();
      if (task === undefined) {
        continue;
      }
      if (task.kind === 'leave') {
        state.activeContainers.delete(task.value);
        continue;
      }

      state.work += 1;
      if (state.work > limits.maxWork) {
        return failure(task.path, 'work');
      }
      if (typeof task.value === 'string' && task.value.length > limits.maxStringLength) {
        return failure(task.path, 'string');
      }
      const scalarBytes = serializedScalarBytes(task);
      if (scalarBytes !== undefined) {
        if (!addBytes(state, scalarBytes, limits.maxBytes)) {
          return failure('$', 'bytes');
        }
        continue;
      }
      if (task.value === null || typeof task.value !== 'object') {
        continue;
      }
      if (isProxy(task.value)) {
        return failure(task.path, 'inspection');
      }
      const arrayValue = isRuntimeArray(task.value);
      if (!arrayValue && !isRuntimeRecord(task.value)) {
        continue;
      }

      const containerDepth = task.depth + 1;
      if (containerDepth > limits.maxDepth) {
        return failure(task.path, 'depth');
      }
      if (state.activeContainers.has(task.value)) {
        return failure(task.path, 'cycle');
      }
      if (!hasSupportedPrototype(task.value, arrayValue)) {
        return failure(task.path, 'prototype');
      }

      if (arrayValue) {
        const lengthProperty = readOwnDataProperty(task.value, 'length');
        if (
          !lengthProperty.ok ||
          !lengthProperty.present ||
          typeof lengthProperty.value !== 'number' ||
          !Number.isSafeInteger(lengthProperty.value) ||
          lengthProperty.value < 0
        ) {
          return failure(`${task.path}.length`, lengthProperty.ok ? 'inspection' : lengthProperty.reason);
        }
        const length = lengthProperty.value;
        const cardinalityLimit = limits.arrayCardinalityLimit(task.path);
        if (length > cardinalityLimit) {
          return failure(task.path, 'cardinality');
        }
        const inspectedProperties = inspectOwnProperties(task.value, task.path, state, limits, cardinalityLimit);
        if (!inspectedProperties.ok) {
          return inspectedProperties;
        }
        if (!addBytes(state, 2 + Math.max(0, length - 1), limits.maxBytes)) {
          return failure('$', 'bytes');
        }
        state.activeContainers.add(task.value);
        pending.push({ kind: 'leave', value: task.value });
        for (let index = length - 1; index >= 0; index -= 1) {
          const child = readOwnDataProperty(task.value, String(index));
          if (!child.ok) {
            return failure(`${task.path}[${index}]`, child.reason);
          }
          if (!child.present) {
            return failure(`${task.path}[${index}]`, 'inspection');
          }
          pending.push({
            kind: 'value',
            value: child.value,
            path: `${task.path}[${index}]`,
            depth: containerDepth,
            arrayElement: true,
          });
        }
        continue;
      }

      const inspectedProperties = inspectOwnProperties(
        task.value,
        task.path,
        state,
        limits,
        limits.objectCardinalityLimit(task.path)
      );
      if (!inspectedProperties.ok) {
        return inspectedProperties;
      }
      const keys = inspectedProperties.enumerableKeys;
      const entries: Array<readonly [string, RuntimeValue]> = [];
      for (const key of keys) {
        if (key.length > limits.maxPropertyNameLength) {
          return failure(task.path, 'property-name');
        }
        const child = readOwnDataProperty(task.value, key);
        if (!child.ok) {
          return failure(childObjectPath(task.path, key), child.reason);
        }
        if (serializedObjectProperty(child.value)) {
          entries.push([key, child.value]);
        }
      }
      let objectBytes = 2 + Math.max(0, entries.length - 1);
      for (const [key] of entries) {
        objectBytes += serializedStringByteLength(key) + 1;
      }
      if (!addBytes(state, objectBytes, limits.maxBytes)) {
        return failure('$', 'bytes');
      }
      state.activeContainers.add(task.value);
      pending.push({ kind: 'leave', value: task.value });
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry !== undefined) {
          pending.push({
            kind: 'value',
            value: entry[1],
            path: childObjectPath(task.path, entry[0]),
            depth: containerDepth,
            arrayElement: false,
          });
        }
      }
    }
  } catch {
    return failure('$', 'inspection');
  }

  return Object.freeze({ ok: true });
}
