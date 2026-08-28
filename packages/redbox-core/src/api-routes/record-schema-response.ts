import type { RecordSchemaProblem } from '../model/record-contract';
import { RECORD_SCHEMA_PROBLEM_CODES, type RecordSchemaProblemCode } from '../record-contract/codes';

export const RECORD_SCHEMA_RESPONSE_MEDIA_TYPE = 'application/schema+json' as const;
export const RECORD_SCHEMA_PROBLEM_MEDIA_TYPE = 'application/problem+json' as const;
export const RECORD_SCHEMA_RESPONSE_CACHE_CONTROL = 'private, no-cache' as const;
export const RECORD_SCHEMA_RESPONSE_VARY = 'Authorization' as const;
export const RECORD_SCHEMA_ETAG_RESPONSE_HEADER = 'ETag' as const;
export const RECORD_SCHEMA_REVALIDATION_REQUEST_HEADER = 'If-None-Match' as const;

const RECORD_SCHEMA_API_PATH = '/api/records/schemas' as const;
const RECORD_SCHEMA_TYPED_ROUTE_SCOPE = `/:branding/:portal${RECORD_SCHEMA_API_PATH}` as const;
const RECORD_SCHEMA_PUBLIC_ROUTE_TEMPLATE_SCOPE = `{rootContext}/{branding}/{portal}${RECORD_SCHEMA_API_PATH}` as const;

export const RECORD_SCHEMA_CREATE_ROUTE_PATH = `${RECORD_SCHEMA_TYPED_ROUTE_SCOPE}/create/:recordType` as const;
export const RECORD_SCHEMA_UPDATE_ROUTE_PATH = `${RECORD_SCHEMA_TYPED_ROUTE_SCOPE}/update/:oid` as const;
export const RECORD_SCHEMA_IMMUTABLE_ROUTE_PATH = `${RECORD_SCHEMA_TYPED_ROUTE_SCOPE}/:digest` as const;

/**
 * `rootContext` follows `BrandingService.getRootContext()`: it is either empty
 * or starts with `/`, so substituting it keeps the template origin-relative in
 * both root-mounted and sub-path deployments.
 */
export const RECORD_SCHEMA_CREATE_RESOLVER_ROUTE_TEMPLATE =
  `${RECORD_SCHEMA_PUBLIC_ROUTE_TEMPLATE_SCOPE}/create/{recordType}` as const;
export const RECORD_SCHEMA_UPDATE_RESOLVER_ROUTE_TEMPLATE =
  `${RECORD_SCHEMA_PUBLIC_ROUTE_TEMPLATE_SCOPE}/update/{oid}` as const;

type RecordSchemaProblemDescriptor = Pick<RecordSchemaProblem, 'type' | 'title' | 'status' | 'detail' | 'code'>;

export const RECORD_SCHEMA_INVALID_REQUEST_PROBLEM_DESCRIPTOR = {
  type: 'https://redboxresearchdata.com/problems/record-schema-invalid-request',
  title: 'Record schema request is invalid',
  status: 400,
  detail: 'The record schema request is malformed.',
  code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
} as const satisfies RecordSchemaProblemDescriptor;

export const RECORD_SCHEMA_FORBIDDEN_PROBLEM_DESCRIPTOR = {
  type: 'https://redboxresearchdata.com/problems/record-schema-forbidden',
  title: 'Record schema request is not authorized',
  status: 403,
  detail: 'The record schema request is not authorized.',
  code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
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

export function buildRecordSchemaForbiddenProblem(instance: string): RecordSchemaProblem {
  return {
    ...RECORD_SCHEMA_FORBIDDEN_PROBLEM_DESCRIPTOR,
    instance,
  };
}

export function recordSchemaCanonicalLink(canonicalUrl: string): string {
  return `<${canonicalUrl}>; rel="canonical"; type="${RECORD_SCHEMA_RESPONSE_MEDIA_TYPE}"`;
}

export function recordSchemaDescribedByLink(immutableUrl: string): string {
  return `<${immutableUrl}>; rel="describedby"; type="${RECORD_SCHEMA_RESPONSE_MEDIA_TYPE}"`;
}

function trimOuterSlashes(value: string): string {
  let startIndex = 0;
  let endIndex = value.length;

  while (startIndex < endIndex && value[startIndex] === '/') {
    startIndex += 1;
  }
  while (endIndex > startIndex && value[endIndex - 1] === '/') {
    endIndex -= 1;
  }

  return value.slice(startIndex, endIndex);
}

function recordSchemaScopeUrl(branding: string, portal: string, rootContext: string): string {
  const normalizedRootContext = trimOuterSlashes(rootContext.trim());
  const rootContextPrefix = normalizedRootContext ? `/${normalizedRootContext}` : '';
  return `${rootContextPrefix}/${encodeURIComponent(branding)}/${encodeURIComponent(portal)}${RECORD_SCHEMA_API_PATH}`;
}

export function recordSchemaImmutableUrl(branding: string, portal: string, digest: string, rootContext = ''): string {
  return `${recordSchemaScopeUrl(branding, portal, rootContext)}/${encodeURIComponent(digest)}`;
}

export function recordSchemaCreateResolverUrl(
  branding: string,
  portal: string,
  recordType: string,
  rootContext = ''
): string {
  return `${recordSchemaScopeUrl(branding, portal, rootContext)}/create/${encodeURIComponent(recordType)}`;
}

export function recordSchemaUpdateResolverUrl(branding: string, portal: string, oid: string, rootContext = ''): string {
  return `${recordSchemaScopeUrl(branding, portal, rootContext)}/update/${encodeURIComponent(oid)}`;
}
