import { isProxy } from 'node:util/types';
import { isRuntimeArray, isRuntimeRecord, type RuntimeValue } from './runtimeValues';

export interface BoundedValidationLimits {
  /** Functions are rejected unless this trusted caller policy permits their exact path. */
  readonly allowFunctionAtPath?: (path: string) => boolean;
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
  cardinalityLimit: number,
  arrayValue = false
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
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return failure(childObjectPath(path, key), 'prototype');
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

  // JavaScript has no incremental own-key reflection API. Keep the early
  // enumerable bound above, then reject unsupported own keys before parsing.
  // Only arrays may have a non-enumerable property: their intrinsic length.
  const ownKeys = Reflect.ownKeys(container);
  if (ownKeys.length > cardinalityLimit + (arrayValue ? 1 : 0)) {
    return failure(path, 'cardinality');
  }
  for (const key of ownKeys) {
    state.work += 1;
    if (state.work > limits.maxWork) {
      return failure(path, 'work');
    }
    if (typeof key !== 'string') {
      return failure(path, 'inspection');
    }
    const descriptor = Object.getOwnPropertyDescriptor(container, key);
    if (descriptor === undefined) {
      return failure(childObjectPath(path, key), 'inspection');
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return failure(childObjectPath(path, key), 'accessor');
    }
    if (arrayValue && key === 'length') {
      continue;
    }
    if (!descriptor.enumerable) {
      return failure(childObjectPath(path, key), 'inspection');
    }
    if (arrayValue && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= 4_294_967_295)) {
      return failure(childObjectPath(path, key), 'inspection');
    }
  }
  return Object.freeze({ ok: true, enumerableKeys });
}

// Capture the intrinsic async prototype without inspecting caller input.
const asyncFunctionPrototype: object = Object.getPrototypeOf(async () => {});

function inspectHandler(value: object, path: string): BoundedValidationFailure | undefined {
  // isProxy also recognizes revoked callable proxies without invoking traps.
  if (isProxy(value)) return failure(path, 'inspection');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Function.prototype && prototype !== asyncFunctionPrototype) {
    return failure(path, 'prototype');
  }
  // Only intrinsic function metadata is supported. As with object keys, the
  // engine's atomic enumeration is outside the work budget; descriptor reads
  // are bounded by five, regardless of the caller's property count.
  const keys = Reflect.ownKeys(value);
  if (keys.length > 5) return failure(path, 'cardinality');
  for (const key of keys) {
    if (typeof key !== 'string' || !['length', 'name', 'prototype', 'arguments', 'caller'].includes(key)) {
      return failure(path, 'inspection');
    }
    const property = readOwnDataProperty(value, key);
    if (!property.ok) return failure(path, property.reason);
    if (
      key === 'length' &&
      (typeof property.value !== 'number' || !Number.isSafeInteger(property.value) || property.value < 0)
    ) {
      return failure(path, 'inspection');
    }
    if (key === 'name' && typeof property.value !== 'string') return failure(path, 'inspection');
    if ((key === 'arguments' || key === 'caller') && property.value !== null) return failure(path, 'inspection');
    if (key === 'prototype') {
      const instancePrototype = property.value;
      if (instancePrototype === null || typeof instancePrototype !== 'object' || isProxy(instancePrototype)) {
        return failure(path, 'inspection');
      }
      if (Object.getPrototypeOf(instancePrototype) !== Object.prototype) return failure(path, 'prototype');
      const prototypeKeys = Reflect.ownKeys(instancePrototype);
      if (prototypeKeys.length !== 1 || prototypeKeys[0] !== 'constructor') return failure(path, 'inspection');
      const constructor = readOwnDataProperty(instancePrototype, 'constructor');
      if (!constructor.ok) return failure(path, constructor.reason);
      if (constructor.value !== value) return failure(path, 'inspection');
    }
  }
  return undefined;
}

function serializedObjectProperty(value: RuntimeValue): boolean {
  return value !== undefined && typeof value !== 'function' && typeof value !== 'symbol';
}

/**
 * Inspects untrusted object graphs iteratively before a recursive validator is
 * allowed to see them. Accessors and custom prototypes are rejected so later
 * parsing cannot execute caller-controlled property reads. Objects must have
 * enumerable string data properties; arrays allow only enumerable indices and
 * intrinsic length. Symbols and other hidden properties are unsupported.
 * Functions are rejected by default; explicitly permitted handlers must have
 * intrinsic prototypes and data-only intrinsic metadata. Handler code is never
 * invoked by preflight. Work bounds cover traversal, not the engine's atomic own-key enumeration.
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
      if (typeof task.value === 'function') {
        if (!limits.allowFunctionAtPath?.(task.path)) return failure(task.path, 'inspection');
        const handlerFailure = inspectHandler(task.value, task.path);
        if (handlerFailure !== undefined) return handlerFailure;
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
        const inspectedProperties = inspectOwnProperties(task.value, task.path, state, limits, cardinalityLimit, true);
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
      let serializedProperties = 0;
      for (const key of keys) {
        if (key.length > limits.maxPropertyNameLength) {
          return failure(task.path, 'property-name');
        }
        const child = readOwnDataProperty(task.value, key);
        if (!child.ok) {
          return failure(childObjectPath(task.path, key), child.reason);
        }
        entries.push([key, child.value]);
        if (serializedObjectProperty(child.value)) serializedProperties += 1;
      }
      let objectBytes = 2 + Math.max(0, serializedProperties - 1);
      for (const [key, child] of entries) {
        if (serializedObjectProperty(child)) objectBytes += serializedStringByteLength(key) + 1;
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
