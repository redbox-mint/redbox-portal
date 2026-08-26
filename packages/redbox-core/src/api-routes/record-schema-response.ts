import type { RecordSchemaProblem } from '../model/record-contract';
import { RECORD_SCHEMA_PROBLEM_CODES, type RecordSchemaProblemCode } from '../record-contract/codes';

export const RECORD_SCHEMA_RESPONSE_MEDIA_TYPE = 'application/schema+json' as const;
export const RECORD_SCHEMA_PROBLEM_MEDIA_TYPE = 'application/problem+json' as const;
export const RECORD_SCHEMA_RESPONSE_CACHE_CONTROL = 'private, no-cache' as const;
export const RECORD_SCHEMA_RESPONSE_VARY = 'Authorization' as const;

type RecordSchemaProblemDescriptor = Pick<RecordSchemaProblem, 'type' | 'title' | 'status' | 'detail' | 'code'>;

export const RECORD_SCHEMA_INVALID_REQUEST_PROBLEM_DESCRIPTOR = {
  type: 'https://redboxresearchdata.com/problems/record-schema-invalid-request',
  title: 'Record schema request is invalid',
  status: 400,
  detail: 'The record schema request is malformed.',
  code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
} as const satisfies RecordSchemaProblemDescriptor;

export function buildRecordSchemaInvalidRequestProblem(
  instance: string,
  code: RecordSchemaProblemCode = RECORD_SCHEMA_INVALID_REQUEST_PROBLEM_DESCRIPTOR.code
): RecordSchemaProblem {
  return {
    ...RECORD_SCHEMA_INVALID_REQUEST_PROBLEM_DESCRIPTOR,
    instance,
    code,
  };
}

export function recordSchemaCanonicalLink(canonicalUrl: string): string {
  return `<${canonicalUrl}>; rel="canonical"; type="${RECORD_SCHEMA_RESPONSE_MEDIA_TYPE}"`;
}

export function recordSchemaDescribedByLink(immutableUrl: string): string {
  return `<${immutableUrl}>; rel="describedby"; type="${RECORD_SCHEMA_RESPONSE_MEDIA_TYPE}"`;
}

function recordSchemaScopeUrl(branding: string, portal: string): string {
  return `/${encodeURIComponent(branding)}/${encodeURIComponent(portal)}/api/records/schemas`;
}

export function recordSchemaImmutableUrl(branding: string, portal: string, digest: string): string {
  return `${recordSchemaScopeUrl(branding, portal)}/${encodeURIComponent(digest)}`;
}

export function recordSchemaCreateResolverUrl(branding: string, portal: string, recordType: string): string {
  return `${recordSchemaScopeUrl(branding, portal)}/create/${encodeURIComponent(recordType)}`;
}

export function recordSchemaUpdateResolverUrl(branding: string, portal: string, oid: string): string {
  return `${recordSchemaScopeUrl(branding, portal)}/update/${encodeURIComponent(oid)}`;
}
