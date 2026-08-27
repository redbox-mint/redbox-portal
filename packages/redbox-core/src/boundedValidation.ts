import { isRuntimeArray, isRuntimeRecord, readRuntimeProperty, type RuntimeValue } from './runtimeValues';

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
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (
      codeUnit === 0x22 ||
      codeUnit === 0x5c ||
      codeUnit === 0x08 ||
      codeUnit === 0x09 ||
      codeUnit === 0x0a ||
      codeUnit === 0x0c ||
      codeUnit === 0x0d
    ) {
      bytes += 2;
      continue;
    }
    if (codeUnit < 0x20) {
      bytes += 6;
      continue;
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      bytes += 6;
      continue;
    }
    bytes += codeUnit <= 0x7f ? 1 : codeUnit <= 0x7ff ? 2 : 3;
  }
  return bytes;
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

function hasSupportedPrototype(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (isRuntimeArray(value)) {
    return prototype === Array.prototype || prototype === null;
  }
  return prototype === Object.prototype || prototype === null;
}

function readOwnDataProperty(container: object, key: string): PropertyReadResult {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (descriptor === undefined) {
    return Object.freeze({ ok: true, value: undefined });
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    return Object.freeze({ ok: false, reason: 'accessor' });
  }
  return Object.freeze({ ok: true, value: readRuntimeProperty(container, key) });
}

function inspectOwnProperties(
  container: object,
  path: string,
  state: ValidationState,
  limits: BoundedValidationLimits
): PropertyInspectionResult {
  const enumerableKeys: string[] = [];
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
    if (descriptor.enumerable === true) {
      enumerableKeys.push(key);
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
      if (!isRuntimeArray(task.value) && !isRuntimeRecord(task.value)) {
        continue;
      }

      const containerDepth = task.depth + 1;
      if (containerDepth > limits.maxDepth) {
        return failure(task.path, 'depth');
      }
      if (state.activeContainers.has(task.value)) {
        return failure(task.path, 'cycle');
      }
      if (!hasSupportedPrototype(task.value)) {
        return failure(task.path, 'prototype');
      }
      const inspectedProperties = inspectOwnProperties(task.value, task.path, state, limits);
      if (!inspectedProperties.ok) {
        return inspectedProperties;
      }

      if (isRuntimeArray(task.value)) {
        if (task.value.length > limits.arrayCardinalityLimit(task.path)) {
          return failure(task.path, 'cardinality');
        }
        if (!addBytes(state, 2 + Math.max(0, task.value.length - 1), limits.maxBytes)) {
          return failure('$', 'bytes');
        }
        state.activeContainers.add(task.value);
        pending.push({ kind: 'leave', value: task.value });
        for (let index = task.value.length - 1; index >= 0; index -= 1) {
          const child = readOwnDataProperty(task.value, String(index));
          if (!child.ok) {
            return failure(`${task.path}[${index}]`, child.reason);
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

      const keys = inspectedProperties.enumerableKeys;
      if (keys.length > limits.objectCardinalityLimit(task.path)) {
        return failure(task.path, 'cardinality');
      }
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
