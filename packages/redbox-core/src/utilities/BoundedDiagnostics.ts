import type { RuntimeValue } from '../runtimeValues';

export type BoundedDiagnosticPrimitive = string | number | boolean | null;
export type BoundedDiagnosticValue =
  | BoundedDiagnosticPrimitive
  | readonly BoundedDiagnosticValue[]
  | BoundedDiagnosticObject;

export interface BoundedDiagnosticObject {
  readonly [key: string]: BoundedDiagnosticValue;
}

const MAX_DIAGNOSTIC_BYTES = 4_096;
const MAX_DIAGNOSTIC_DEPTH = 4;
const MAX_DIAGNOSTIC_ENTRIES = 16;
const MAX_DIAGNOSTIC_STRING_LENGTH = 160;
const MAX_DIAGNOSTIC_WORK = 128;
const REDACTED = '[REDACTED]' as const;
const TRUNCATED = '[TRUNCATED]' as const;
const SENSITIVE_KEY = /auth|token|secret|password|credential|api[_-]?key|cookie|session/i;
const CREDENTIAL_VALUE =
  /^(?:Bearer\s+|sk_(?:live|test)_|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$)|\/\/[^:\s]+:[^@\s]+@/i;

interface DiagnosticState {
  work: number;
  readonly seen: WeakSet<object>;
}

function boundedString(value: string): string {
  if (CREDENTIAL_VALUE.test(value.trim())) {
    return REDACTED;
  }
  return value.length <= MAX_DIAGNOSTIC_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_DIAGNOSTIC_STRING_LENGTH)}${TRUNCATED}`;
}

function project(value: RuntimeValue, state: DiagnosticState, depth: number): BoundedDiagnosticValue {
  state.work += 1;
  if (state.work > MAX_DIAGNOSTIC_WORK || depth > MAX_DIAGNOSTIC_DEPTH) {
    return TRUNCATED;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return boundedString(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'function') {
    return '[FUNCTION]';
  }
  if (typeof value !== 'object') {
    return `[${(typeof value).toUpperCase()}]`;
  }
  if (state.seen.has(value)) {
    return '[CIRCULAR]';
  }
  state.seen.add(value);
  try {
    if (value instanceof Error) {
      return Object.freeze({ name: 'Error' });
    }
  } catch {
    return '[UNAVAILABLE]';
  }
  if (Array.isArray(value)) {
    const projected = value.slice(0, MAX_DIAGNOSTIC_ENTRIES).map(child => project(child, state, depth + 1));
    if (value.length > MAX_DIAGNOSTIC_ENTRIES) {
      projected.push(TRUNCATED);
    }
    return Object.freeze(projected);
  }
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return '[UNAVAILABLE]';
  }
  const result = Object.create(null) as Record<string, BoundedDiagnosticValue>;
  const descriptorEntries = Object.entries(descriptors);
  const entries = descriptorEntries.slice(0, MAX_DIAGNOSTIC_ENTRIES);
  for (const [key, descriptor] of entries) {
    const safeKey = boundedString(key);
    if (!('value' in descriptor)) {
      result[safeKey] = '[ACCESSOR]';
    } else if (SENSITIVE_KEY.test(key)) {
      result[safeKey] = REDACTED;
    } else {
      result[safeKey] = project(descriptor.value as RuntimeValue, state, depth + 1);
    }
  }
  if (descriptorEntries.length > MAX_DIAGNOSTIC_ENTRIES) {
    result.truncated = true;
  }
  return Object.freeze(result);
}

export function boundedDiagnosticValue(value: RuntimeValue): BoundedDiagnosticValue {
  const projected = project(value, { work: 0, seen: new WeakSet<object>() }, 0);
  return Buffer.byteLength(JSON.stringify(projected), 'utf8') <= MAX_DIAGNOSTIC_BYTES ? projected : TRUNCATED;
}
