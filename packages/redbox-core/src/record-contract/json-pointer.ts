import type { RecordContractPointer } from './types';
import { escapeComponent, formatJsonPointer, parseJsonPointer, validateJsonPointer } from '@jsonjoy.com/json-pointer';

/** Escape one reference token according to RFC 6901 section 4. */
export function escapeRecordContractPointerToken(value: string | number): string {
  return escapeComponent(String(value));
}

/** Return whether a value is a syntactically valid RFC 6901 JSON Pointer. */
export function isRecordContractPointer(value: unknown): value is RecordContractPointer {
  if (typeof value !== 'string' || /~(?![01])/u.test(value)) {
    return false;
  }
  try {
    validateJsonPointer(value);
    return true;
  } catch {
    return false;
  }
}

/** Validate and brand a pointer at the public construction boundary. */
export function recordContractPointer(value: string): RecordContractPointer {
  if (!isRecordContractPointer(value)) {
    throw new Error(`Invalid RFC 6901 JSON Pointer: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Build a pointer from unescaped property/index tokens. */
export function recordContractPointerFromTokens(tokens: readonly (string | number)[]): RecordContractPointer {
  return recordContractPointer(formatJsonPointer(tokens.map(String)));
}

/** Decode a validated pointer into unescaped reference tokens. */
export function recordContractPointerTokens(pointer: RecordContractPointer): string[] {
  return parseJsonPointer(pointer).map(String);
}

/** Append unescaped tokens to an existing pointer. */
export function joinRecordContractPointer(
  base: RecordContractPointer,
  ...tokens: readonly (string | number)[]
): RecordContractPointer {
  return tokens.length === 0
    ? base
    : recordContractPointer(formatJsonPointer([...parseJsonPointer(base), ...tokens.map(String)]));
}

/** Append an already-encoded relative pointer to an existing pointer. */
export function appendRecordContractPointer(
  base: RecordContractPointer,
  relative: RecordContractPointer
): RecordContractPointer {
  return recordContractPointerFromTokens([
    ...recordContractPointerTokens(base),
    ...recordContractPointerTokens(relative),
  ]);
}

/** Return a pointer's parent, retaining the root pointer at the root. */
export function parentRecordContractPointer(pointer: RecordContractPointer): RecordContractPointer {
  if (pointer === '') {
    return pointer;
  }
  const lastSeparator = pointer.lastIndexOf('/');
  return recordContractPointer(pointer.slice(0, lastSeparator));
}

/** True when two pointers identify the same location or an ancestor/descendant pair. */
export function recordContractPointersOverlap(left: RecordContractPointer, right: RecordContractPointer): boolean {
  return left === right || left === '' || right === '' || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
