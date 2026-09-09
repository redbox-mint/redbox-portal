import type { ErrorObject } from 'ajv';
import { RECORD_SCHEMA_PROBLEM_CODES } from './codes';
import { isRecordContractPointer, joinRecordContractPointer, recordContractPointer } from './json-pointer';
import type { RecordContractPointer } from './types';

const MAX_PUBLIC_POINTER_LENGTH = 2_048;
const MAX_PUBLIC_POINTER_TOKEN_LENGTH = 256;
const MAX_KEYWORD_LENGTH = 64;

type AjvValidationError = Omit<ErrorObject, 'schemaPath'> & { readonly schemaPath?: string };

export type RecordSchemaExpectedJsonType = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';

export interface RecordSchemaValidationExpectedShape {
  readonly type: RecordSchemaExpectedJsonType;
}

export type RecordSchemaValidationProblemCode =
  | typeof RECORD_SCHEMA_PROBLEM_CODES.TYPE
  | typeof RECORD_SCHEMA_PROBLEM_CODES.ARRAY_ITEM
  | typeof RECORD_SCHEMA_PROBLEM_CODES.ENUM
  | typeof RECORD_SCHEMA_PROBLEM_CODES.ADDITIONAL_PROPERTY
  | typeof RECORD_SCHEMA_PROBLEM_CODES.REQUIRED
  | typeof RECORD_SCHEMA_PROBLEM_CODES.VALIDATION_GENERIC;

/** Safe structural problem suitable for later adaptation to a record-save issue. */
export interface RecordSchemaValidationProblem {
  readonly code: RecordSchemaValidationProblemCode;
  readonly pointer: RecordContractPointer;
  readonly expected?: RecordSchemaValidationExpectedShape;
}

export type RecordSchemaValidationProblemMappingResult =
  | {
      readonly problems: readonly RecordSchemaValidationProblem[];
      readonly truncated: false;
    }
  | {
      readonly problems: readonly RecordSchemaValidationProblem[];
      readonly truncated: true;
    };

export class RecordSchemaValidationProblemMapperConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RecordSchemaValidationProblemMapperConfigurationError';
  }
}

const ROOT_POINTER = recordContractPointer('');
const EXPECTED_JSON_TYPES: ReadonlySet<string> = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);

function assertMaxDiagnostics(maxDiagnostics: number): void {
  if (!Number.isFinite(maxDiagnostics) || !Number.isInteger(maxDiagnostics) || maxDiagnostics <= 0) {
    throw new RecordSchemaValidationProblemMapperConfigurationError(
      'maxDiagnostics must be a finite positive integer.'
    );
  }
}

function safeKeyword(error: AjvValidationError): string | undefined {
  const keyword = error.keyword;
  return typeof keyword === 'string' && keyword.length <= MAX_KEYWORD_LENGTH ? keyword : undefined;
}

function safeInstancePointer(error: AjvValidationError): RecordContractPointer {
  const instancePath = error.instancePath;
  if (
    typeof instancePath !== 'string' ||
    instancePath.length > MAX_PUBLIC_POINTER_LENGTH ||
    containsUnsafePointerText(instancePath) ||
    !isRecordContractPointer(instancePath)
  ) {
    return ROOT_POINTER;
  }
  return recordContractPointer(instancePath);
}

function containsUnsafePointerText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) {
      return true;
    }
  }
  return false;
}

function safePointerToken(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length <= MAX_PUBLIC_POINTER_TOKEN_LENGTH &&
    !containsUnsafePointerText(value)
    ? value
    : undefined;
}

function safeParameter(error: AjvValidationError, name: string): unknown {
  return error.params[name];
}

function appendSafeParameterPointer(
  pointer: RecordContractPointer,
  error: AjvValidationError,
  parameterName: 'additionalProperty' | 'missingProperty' | 'unevaluatedProperty'
): RecordContractPointer {
  const token = safePointerToken(safeParameter(error, parameterName));
  if (token === undefined) {
    return pointer;
  }
  const candidate = joinRecordContractPointer(pointer, token);
  return candidate.length <= MAX_PUBLIC_POINTER_LENGTH ? candidate : pointer;
}

function isExpectedJsonType(value: unknown): value is RecordSchemaExpectedJsonType {
  return typeof value === 'string' && EXPECTED_JSON_TYPES.has(value);
}

function expectedType(error: AjvValidationError): RecordSchemaValidationExpectedShape | undefined {
  const type = safeParameter(error, 'type');
  if (!isExpectedJsonType(type)) {
    return undefined;
  }
  return Object.freeze({ type });
}

function isItemsFalseSchemaError(error: AjvValidationError, keyword: string | undefined): boolean {
  if (keyword !== 'false schema') {
    return false;
  }
  const schemaPath = error.schemaPath;
  return (
    typeof schemaPath === 'string' &&
    schemaPath.length <= MAX_PUBLIC_POINTER_LENGTH &&
    /\/(?:items|prefixItems)(?:\/|$)/.test(schemaPath)
  );
}

function mappedProblem(error: AjvValidationError): RecordSchemaValidationProblem {
  const keyword = safeKeyword(error);
  const instancePointer = safeInstancePointer(error);

  switch (keyword) {
    case 'type': {
      const expected = expectedType(error);
      return Object.freeze({
        code: RECORD_SCHEMA_PROBLEM_CODES.TYPE,
        pointer: instancePointer,
        ...(expected ? { expected } : {}),
      });
    }
    case 'items':
    case 'prefixItems':
      return Object.freeze({
        code: RECORD_SCHEMA_PROBLEM_CODES.ARRAY_ITEM,
        pointer: instancePointer,
      });
    case 'enum':
      return Object.freeze({
        code: RECORD_SCHEMA_PROBLEM_CODES.ENUM,
        pointer: instancePointer,
      });
    case 'additionalProperties':
      return Object.freeze({
        code: RECORD_SCHEMA_PROBLEM_CODES.ADDITIONAL_PROPERTY,
        pointer: appendSafeParameterPointer(instancePointer, error, 'additionalProperty'),
      });
    case 'unevaluatedProperties':
      return Object.freeze({
        code: RECORD_SCHEMA_PROBLEM_CODES.ADDITIONAL_PROPERTY,
        pointer: appendSafeParameterPointer(instancePointer, error, 'unevaluatedProperty'),
      });
    case 'required':
      return Object.freeze({
        code: RECORD_SCHEMA_PROBLEM_CODES.REQUIRED,
        pointer: appendSafeParameterPointer(instancePointer, error, 'missingProperty'),
      });
    default:
      return Object.freeze({
        code: isItemsFalseSchemaError(error, keyword)
          ? RECORD_SCHEMA_PROBLEM_CODES.ARRAY_ITEM
          : RECORD_SCHEMA_PROBLEM_CODES.VALIDATION_GENERIC,
        pointer: instancePointer,
      });
  }
}

/**
 * Map AJV errors without exposing messages, schema fragments, submitted values,
 * or arbitrary parameter bags. Input order is retained.
 */
export function mapAjvErrorsToRecordSchemaProblems(
  errors: readonly AjvValidationError[] | null | undefined,
  maxDiagnostics: number
): RecordSchemaValidationProblemMappingResult {
  assertMaxDiagnostics(maxDiagnostics);
  const source = errors ?? [];
  const problems = source.slice(0, maxDiagnostics).map(mappedProblem);
  const frozenProblems = Object.freeze(problems);
  if (source.length > maxDiagnostics) {
    return Object.freeze({ problems: frozenProblems, truncated: true });
  }
  return Object.freeze({ problems: frozenProblems, truncated: false });
}
