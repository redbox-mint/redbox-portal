import { RECORD_SCHEMA_PROBLEM_CODES } from './codes';
import { isRecordContractPointer, joinRecordContractPointer, recordContractPointer } from './json-pointer';
import type { RecordContractPointer } from './types';

const MAX_PUBLIC_POINTER_LENGTH = 2_048;
const MAX_PUBLIC_POINTER_TOKEN_LENGTH = 256;
const MAX_KEYWORD_LENGTH = 64;

interface StructuralValidationErrorSnapshot {
  readonly instancePath?: unknown;
  readonly schemaPath?: unknown;
  readonly keyword?: unknown;
  readonly params?: unknown;
}

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

function ownDataProperty(value: unknown, property: string): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function safeErrorArrayLength(errors: unknown): number {
  try {
    if (!Array.isArray(errors)) {
      return 0;
    }
    const length = ownDataProperty(errors, 'length');
    return typeof length === 'number' && Number.isSafeInteger(length) && length >= 0 ? length : 0;
  } catch {
    return 0;
  }
}

function safeArrayEntry(errors: unknown, index: number): unknown {
  return ownDataProperty(errors, String(index));
}

function snapshotStructuralValidationError(value: unknown): StructuralValidationErrorSnapshot {
  return Object.freeze({
    instancePath: ownDataProperty(value, 'instancePath'),
    schemaPath: ownDataProperty(value, 'schemaPath'),
    keyword: ownDataProperty(value, 'keyword'),
    params: ownDataProperty(value, 'params'),
  });
}

function safeKeyword(error: StructuralValidationErrorSnapshot): string | undefined {
  const keyword = ownDataProperty(error, 'keyword');
  return typeof keyword === 'string' && keyword.length <= MAX_KEYWORD_LENGTH ? keyword : undefined;
}

function safeInstancePointer(error: StructuralValidationErrorSnapshot): RecordContractPointer {
  const instancePath = ownDataProperty(error, 'instancePath');
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

function safeParameter(error: StructuralValidationErrorSnapshot, name: string): unknown {
  return ownDataProperty(ownDataProperty(error, 'params'), name);
}

function appendSafeParameterPointer(
  pointer: RecordContractPointer,
  error: StructuralValidationErrorSnapshot,
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

function expectedType(error: StructuralValidationErrorSnapshot): RecordSchemaValidationExpectedShape | undefined {
  const type = safeParameter(error, 'type');
  if (!isExpectedJsonType(type)) {
    return undefined;
  }
  return Object.freeze({ type });
}

function isItemsFalseSchemaError(error: StructuralValidationErrorSnapshot, keyword: string | undefined): boolean {
  if (keyword !== 'false schema') {
    return false;
  }
  const schemaPath = ownDataProperty(error, 'schemaPath');
  return (
    typeof schemaPath === 'string' &&
    schemaPath.length <= MAX_PUBLIC_POINTER_LENGTH &&
    /\/(?:items|prefixItems)(?:\/|$)/.test(schemaPath)
  );
}

function mappedProblem(value: unknown): RecordSchemaValidationProblem {
  const error = snapshotStructuralValidationError(value);
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
 * Map untrusted AJV-like errors without exposing messages, schema fragments,
 * submitted values, or arbitrary parameter bags. Input order is retained and
 * truncation is applied after exactly maxDiagnostics entries.
 */
export function mapAjvErrorsToRecordSchemaProblems(
  errors: unknown,
  maxDiagnostics: number
): RecordSchemaValidationProblemMappingResult {
  assertMaxDiagnostics(maxDiagnostics);
  const length = safeErrorArrayLength(errors);
  const selectedLength = Math.min(length, maxDiagnostics);
  const problems: RecordSchemaValidationProblem[] = [];
  for (let index = 0; index < selectedLength; index += 1) {
    problems.push(mappedProblem(safeArrayEntry(errors, index)));
  }
  const frozenProblems = Object.freeze(problems);
  if (length > maxDiagnostics) {
    return Object.freeze({ problems: frozenProblems, truncated: true });
  }
  return Object.freeze({ problems: frozenProblems, truncated: false });
}
