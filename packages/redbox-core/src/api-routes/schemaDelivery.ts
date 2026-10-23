import type { Services as RecordSchemas } from '../recordSchema/RecordSchema';
import type { RecordSchemaProblem, RecordSchemaProblemStatus } from '../model';
import {
  RECORD_SCHEMA_PROBLEM_CODES,
  type RecordSchemaProblemCode,
  type RecordJsonSchemaEtag,
} from '../record-contract';
import {
  buildRecordSchemaInvalidRequestProblem,
  recordSchemaCanonicalLink,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
} from './record-schema-response';
type RecordSchemaResolver = Pick<RecordSchemas.RecordSchema, 'resolveCreate' | 'resolveUpdate' | 'resolveImmutable'>;
type ResolveCreateFailure = Exclude<
  Awaited<ReturnType<RecordSchemaResolver['resolveCreate']>>,
  { readonly kind: 'resolved' | 'partial' }
>;
type ResolveUpdateFailure = Exclude<
  Awaited<ReturnType<RecordSchemaResolver['resolveUpdate']>>,
  { readonly kind: 'resolved' | 'partial' }
>;
type ResolveImmutableFailure = Exclude<
  Awaited<ReturnType<RecordSchemaResolver['resolveImmutable']>>,
  { readonly kind: 'resolved' | 'not-modified' }
>;
export type RecordSchemaProblemKind =
  | 'invalid-request'
  | 'authentication-required'
  | 'forbidden'
  | 'not-found'
  | 'not-resolvable'
  | 'limit-exceeded'
  | 'invalid-contract'
  | 'unavailable';

type RecordSchemaMappedProblemKind = Exclude<RecordSchemaProblemKind, 'invalid-request'>;
export type RecordSchemaControllerLogContext = 'controller-create' | 'controller-update' | 'controller-immutable';

interface RecordSchemaProblemDescriptor {
  readonly type: string;
  readonly title: string;
  readonly status: RecordSchemaProblemStatus;
  readonly detail: string;
  readonly code: RecordSchemaProblemCode;
}

const RECORD_SCHEMA_PROBLEMS: Readonly<Record<RecordSchemaMappedProblemKind, RecordSchemaProblemDescriptor>> = {
  'authentication-required': {
    type: 'https://redboxresearchdata.com/problems/record-schema-authentication-required',
    title: 'Authentication is required',
    status: 401,
    detail: 'Authentication is required to resolve a record schema.',
    code: RECORD_SCHEMA_PROBLEM_CODES.AUTHENTICATION_REQUIRED,
  },
  forbidden: {
    type: 'https://redboxresearchdata.com/problems/record-schema-forbidden',
    title: 'Record schema request is not authorized',
    status: 403,
    detail: 'The record schema request is not authorized.',
    code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
  },
  'not-found': {
    type: 'https://redboxresearchdata.com/problems/record-schema-not-found',
    title: 'Record schema was not found',
    status: 404,
    detail: 'No accessible record schema or resolution context was found.',
    code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
  },
  'not-resolvable': {
    type: 'https://redboxresearchdata.com/problems/record-schema-not-resolvable',
    title: 'Record schema could not be resolved',
    status: 409,
    detail: 'The record schema could not be resolved from the authoritative context.',
    code: RECORD_SCHEMA_PROBLEM_CODES.NOT_RESOLVABLE,
  },
  'limit-exceeded': {
    type: 'https://redboxresearchdata.com/problems/record-schema-limit-exceeded',
    title: 'Record schema limit exceeded',
    status: 413,
    detail: 'The record schema exceeds configured complexity or output limits.',
    code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
  },
  'invalid-contract': {
    type: 'https://redboxresearchdata.com/problems/record-schema-invalid-contract',
    title: 'Record schema contract is invalid',
    status: 422,
    detail: 'The record schema contract is invalid.',
    code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
  },
  unavailable: {
    type: 'https://redboxresearchdata.com/problems/record-schema-unavailable',
    title: 'Record schema is unavailable',
    status: 503,
    detail: 'The record schema capability is temporarily unavailable.',
    code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
  },
};

function assertNever(value: never): never {
  throw new Error(`Unexpected record schema result kind: ${String(value)}`);
}

export function schemaProblem(
  kind: RecordSchemaProblemKind,
  instance: string,
  code?: RecordSchemaProblemCode
): RecordSchemaProblem {
  if (kind === 'invalid-request') {
    return buildRecordSchemaInvalidRequestProblem(instance, code);
  }

  return {
    ...RECORD_SCHEMA_PROBLEMS[kind],
    instance,
    code: code === undefined ? RECORD_SCHEMA_PROBLEMS[kind].code : code,
  };
}
export function createSchemaFailure(instance: string, result: ResolveCreateFailure) {
  switch (result.kind) {
    case 'context-failed':
      return schemaProblem(result.failureKind, instance);
    case 'compiler-failed':
    case 'meta-validation-failed':
      return schemaProblem('invalid-contract', instance, result.code);
    case 'limit-exceeded':
      return schemaProblem('limit-exceeded', instance, result.code);
    case 'storage-failed':
    case 'unavailable':
      return schemaProblem('unavailable', instance, result.code);
    default:
      return assertNever(result);
  }
}
export function updateSchemaFailure(instance: string, result: ResolveUpdateFailure) {
  switch (result.kind) {
    case 'context-failed':
      return schemaProblem(result.failureKind, instance);
    case 'denied':
    case 'missing-oid':
      return schemaProblem('not-found', instance);
    case 'invalid-precondition':
      return schemaProblem('invalid-request', instance, result.code);
    case 'precondition-failed':
      return schemaProblem('not-resolvable', instance, result.code);
    case 'compiler-failed':
    case 'meta-validation-failed':
      return schemaProblem('invalid-contract', instance, result.code);
    case 'limit-exceeded':
      return schemaProblem('limit-exceeded', instance, result.code);
    case 'storage-failed':
    case 'unavailable':
      return schemaProblem('unavailable', instance, result.code);
    default:
      return assertNever(result);
  }
}
export function immutableSchemaFailure(instance: string, result: ResolveImmutableFailure) {
  switch (result.kind) {
    case 'invalid-request':
      return schemaProblem('invalid-request', instance, result.problem.code);
    case 'forbidden':
    case 'not-found':
      return schemaProblem('not-found', instance);
    case 'not-resolvable':
      return schemaProblem('not-resolvable', instance, result.problem.code);
    case 'limit-exceeded':
      return schemaProblem('limit-exceeded', instance, result.problem.code);
    case 'invalid-contract':
      if (result.authorization !== 'authorized') {
        return schemaProblem('not-found', instance);
      }
      return schemaProblem('invalid-contract', instance, result.problem.code);
    case 'unavailable':
      return schemaProblem('unavailable', instance, result.problem.code);
    default:
      return assertNever(result);
  }
}
export function schemaResponseHeaders(etag: RecordJsonSchemaEtag, canonicalUrl?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ETag: etag,
    'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
    Vary: RECORD_SCHEMA_RESPONSE_VARY,
  };
  if (canonicalUrl !== undefined) {
    headers.Link = recordSchemaCanonicalLink(canonicalUrl);
  }
  return headers;
}
