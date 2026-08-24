import type { RecordContractPointer } from './types';

const INVALID_ESCAPE = /~(?:[^01]|$)/;

/** Escape one reference token according to RFC 6901 section 4. */
export function escapeRecordContractPointerToken(value: string | number): string {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

/** Return whether a value is a syntactically valid RFC 6901 JSON Pointer. */
export function isRecordContractPointer(value: unknown): value is RecordContractPointer {
  if (typeof value !== 'string') {
    return false;
  }
  if (value === '') {
    return true;
  }
  if (!value.startsWith('/')) {
    return false;
  }
  return value
    .slice(1)
    .split('/')
    .every(token => !INVALID_ESCAPE.test(token));
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
  if (tokens.length === 0) {
    return recordContractPointer('');
  }
  return recordContractPointer(`/${tokens.map(escapeRecordContractPointerToken).join('/')}`);
}

/** Decode a validated pointer into unescaped reference tokens. */
export function recordContractPointerTokens(pointer: RecordContractPointer): string[] {
  if (pointer === '') {
    return [];
  }
  return pointer
    .slice(1)
    .split('/')
    .map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** Append unescaped tokens to an existing pointer. */
export function joinRecordContractPointer(
  base: RecordContractPointer,
  ...tokens: readonly (string | number)[]
): RecordContractPointer {
  if (tokens.length === 0) {
    return base;
  }
  const suffix = tokens.map(escapeRecordContractPointerToken).join('/');
  return recordContractPointer(`${base}/${suffix}`);
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
