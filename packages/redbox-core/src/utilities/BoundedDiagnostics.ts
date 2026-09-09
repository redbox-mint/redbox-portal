import { isProxy } from 'node:util/types';
import type { RuntimeValue } from '../runtimeValues';

export type BoundedDiagnosticCategory =
  | 'array'
  | 'bigint'
  | 'boolean'
  | 'function'
  | 'null'
  | 'number'
  | 'object'
  | 'string'
  | 'symbol'
  | 'undefined'
  | 'unavailable';

export type BoundedDiagnosticCode =
  | 'EAI_AGAIN'
  | 'EAUTH'
  | 'ECONNECTION'
  | 'ECONNABORTED'
  | 'ECONNREFUSED'
  | 'ECONNRESET'
  | 'EDNS'
  | 'EENVELOPE'
  | 'EHOSTUNREACH'
  | 'EMESSAGE'
  | 'ENETUNREACH'
  | 'ENOTFOUND'
  | 'ESOCKET'
  | 'ESTREAM'
  | 'ETIMEDOUT'
  | 'ERR_CANCELED'
  | 'ERR_INVALID_ARG_TYPE'
  | 'ERR_TLS_CERT_ALTNAME_INVALID';

export interface BoundedDiagnosticValue {
  readonly category: BoundedDiagnosticCategory;
  readonly code?: BoundedDiagnosticCode;
  readonly status?: number;
}

type PropertyReadResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'value'; readonly value: RuntimeValue };

const SAFE_DIAGNOSTIC_CODES: readonly BoundedDiagnosticCode[] = Object.freeze([
  'EAI_AGAIN',
  'EAUTH',
  'ECONNECTION',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EDNS',
  'EENVELOPE',
  'EHOSTUNREACH',
  'EMESSAGE',
  'ENETUNREACH',
  'ENOTFOUND',
  'ESOCKET',
  'ESTREAM',
  'ETIMEDOUT',
  'ERR_CANCELED',
  'ERR_INVALID_ARG_TYPE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const MAX_SAFE_DIAGNOSTIC_CODE_LENGTH = SAFE_DIAGNOSTIC_CODES.reduce(
  (maximumLength, code) => Math.max(maximumLength, code.length),
  0
);

const ARRAY_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'array' });
const BIGINT_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'bigint' });
const BOOLEAN_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'boolean' });
const FUNCTION_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'function' });
const NULL_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'null' });
const NUMBER_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'number' });
const OBJECT_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'object' });
const STRING_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'string' });
const SYMBOL_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'symbol' });
const UNDEFINED_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'undefined' });
const UNAVAILABLE_DIAGNOSTIC: BoundedDiagnosticValue = Object.freeze({ category: 'unavailable' });

function readOwnDataProperty(value: object, propertyKey: string): PropertyReadResult {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, propertyKey);
    if (descriptor === undefined || !('value' in descriptor)) {
      return { kind: 'absent' };
    }
    return { kind: 'value', value: descriptor.value as RuntimeValue };
  } catch {
    return { kind: 'unavailable' };
  }
}

function allowlistedCode(value: RuntimeValue): BoundedDiagnosticCode | undefined {
  if (typeof value !== 'string' || value.length > MAX_SAFE_DIAGNOSTIC_CODE_LENGTH) {
    return undefined;
  }
  const normalized = value.toUpperCase();
  return SAFE_DIAGNOSTIC_CODES.find(code => code === normalized);
}

function validatedStatus(value: RuntimeValue): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

function objectDiagnostic(value: object): BoundedDiagnosticValue {
  if (isProxy(value)) {
    return UNAVAILABLE_DIAGNOSTIC;
  }

  try {
    if (Array.isArray(value)) {
      return ARRAY_DIAGNOSTIC;
    }
  } catch {
    return UNAVAILABLE_DIAGNOSTIC;
  }

  const codeProperty = readOwnDataProperty(value, 'code');
  const statusProperty = readOwnDataProperty(value, 'status');
  const statusCodeProperty = readOwnDataProperty(value, 'statusCode');
  if (
    codeProperty.kind === 'unavailable' ||
    statusProperty.kind === 'unavailable' ||
    statusCodeProperty.kind === 'unavailable'
  ) {
    return UNAVAILABLE_DIAGNOSTIC;
  }

  const code = codeProperty.kind === 'value' ? allowlistedCode(codeProperty.value) : undefined;
  const explicitStatus = statusProperty.kind === 'value' ? validatedStatus(statusProperty.value) : undefined;
  const statusCode = statusCodeProperty.kind === 'value' ? validatedStatus(statusCodeProperty.value) : undefined;
  const status = explicitStatus ?? statusCode;

  if (code !== undefined && status !== undefined) {
    return Object.freeze({ category: 'object', code, status });
  }
  if (code !== undefined) {
    return Object.freeze({ category: 'object', code });
  }
  if (status !== undefined) {
    return Object.freeze({ category: 'object', status });
  }
  return OBJECT_DIAGNOSTIC;
}

function projectDiagnostic(value: RuntimeValue): BoundedDiagnosticValue {
  if (value === null) {
    return NULL_DIAGNOSTIC;
  }
  switch (typeof value) {
    case 'bigint':
      return BIGINT_DIAGNOSTIC;
    case 'boolean':
      return BOOLEAN_DIAGNOSTIC;
    case 'function':
      return FUNCTION_DIAGNOSTIC;
    case 'number':
      return NUMBER_DIAGNOSTIC;
    case 'object':
      return objectDiagnostic(value);
    case 'string':
      return STRING_DIAGNOSTIC;
    case 'symbol':
      return SYMBOL_DIAGNOSTIC;
    case 'undefined':
      return UNDEFINED_DIAGNOSTIC;
  }
}

/**
 * Projects an untrusted failure into fixed, non-sensitive diagnostic metadata.
 * This function is a last-resort logging boundary and must never throw.
 */
export function boundedDiagnosticValue(value: RuntimeValue): BoundedDiagnosticValue {
  try {
    return projectDiagnostic(value);
  } catch {
    return UNAVAILABLE_DIAGNOSTIC;
  }
}
