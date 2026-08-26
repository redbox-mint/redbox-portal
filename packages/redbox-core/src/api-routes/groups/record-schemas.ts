import { z } from '../zod-openapi';

import { apiRoute } from '../route-factory';
import {
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../record-schema-response';
import { objectField, recordOperationQuery, stringField } from '../schemas/common';
import type { ApiResponseDefinition, ApiSchemaField } from '../types';

const RECORD_SCHEMA_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const RECORD_SCHEMA_ETAG_PATTERN = /^"sha256:[0-9a-f]{64}"$/;
const RECORD_SCHEMA_REQUEST_ETAG_PATTERN = /^[\t ]*"sha256:[0-9a-f]{64}"[\t ]*$/;
const RECORD_SCHEMA_CANONICAL_LINK_PATTERN =
  /^<\/(?:[^\s<>/]+\/)?[^\s<>/]+\/[^\s<>/]+\/api\/records\/schemas\/[0-9a-f]{64}>; rel="canonical"; type="application\/schema\+json"$/;
const RECORD_SCHEMA_CONDITIONAL_HEADER_MAX_LENGTH = 128;

const recordSchemaDigestField = z
  .string({ error: 'record-schema-digest-invalid' })
  .regex(RECORD_SCHEMA_DIGEST_PATTERN, { error: 'record-schema-digest-invalid' })
  .openapi({
    description: 'Lowercase SHA-256 digest identifying an immutable record schema',
    pattern: RECORD_SCHEMA_DIGEST_PATTERN.source,
    example: 'a'.repeat(64),
  });

const recordSchemaIfNoneMatchField = z
  .string({ error: 'record-schema-if-none-match-invalid' })
  .max(RECORD_SCHEMA_CONDITIONAL_HEADER_MAX_LENGTH, { error: 'record-schema-if-none-match-invalid' })
  .regex(RECORD_SCHEMA_REQUEST_ETAG_PATTERN, { error: 'record-schema-if-none-match-invalid' })
  .openapi({
    description: 'Strong record-schema ETag used for authorized cache revalidation',
    pattern: RECORD_SCHEMA_ETAG_PATTERN.source,
    example: `"sha256:${'a'.repeat(64)}"`,
  });

const recordSchemaEtagResponseField = z
  .string()
  .regex(RECORD_SCHEMA_ETAG_PATTERN)
  .openapi({
    description: 'Strong ETag for the returned record-schema representation',
    pattern: RECORD_SCHEMA_ETAG_PATTERN.source,
    example: `"sha256:${'a'.repeat(64)}"`,
  });

const recordSchemaCacheControlResponseField = z.literal(RECORD_SCHEMA_RESPONSE_CACHE_CONTROL).openapi({
  description: 'Private revalidation cache policy',
  example: RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
});

const recordSchemaVaryResponseField = z.literal(RECORD_SCHEMA_RESPONSE_VARY).openapi({
  description: 'Authentication input that affects the caller-effective representation',
  example: RECORD_SCHEMA_RESPONSE_VARY,
});

const recordSchemaCanonicalLinkResponseField = z
  .string()
  .regex(RECORD_SCHEMA_CANONICAL_LINK_PATTERN)
  .openapi({
    description: 'Canonical immutable record-schema link',
    pattern: RECORD_SCHEMA_CANONICAL_LINK_PATTERN.source,
    example: `</default/rdmp/api/records/schemas/${'a'.repeat(64)}>; rel="canonical"; type="${RECORD_SCHEMA_RESPONSE_MEDIA_TYPE}"`,
  });

const recordSchemaRequestHeaders = objectField({
  'If-None-Match': recordSchemaIfNoneMatchField,
});

const recordSchemaScopeFields = {
  branding: stringField('Branding identifier'),
  portal: stringField('Portal identifier'),
};

const createRecordSchemaParams = objectField(
  {
    ...recordSchemaScopeFields,
    recordType: stringField('Record type name'),
  },
  ['branding', 'portal', 'recordType']
);

const updateRecordSchemaParams = objectField(
  {
    ...recordSchemaScopeFields,
    oid: stringField('Record OID'),
  },
  ['branding', 'portal', 'oid']
);

const immutableRecordSchemaParams = objectField(
  {
    ...recordSchemaScopeFields,
    digest: recordSchemaDigestField,
  },
  ['branding', 'portal', 'digest']
);

const recordSchemaDocument = objectField({}, [], 'Caller-effective JSON Schema draft 2020-12 document', true);

const recordSchemaResponseHeaders = {
  ETag: recordSchemaEtagResponseField,
  'Cache-Control': recordSchemaCacheControlResponseField,
  Vary: recordSchemaVaryResponseField,
};

const recordSchemaCanonicalResponseHeaders = {
  ...recordSchemaResponseHeaders,
  Link: recordSchemaCanonicalLinkResponseField,
};

function schemaResponse(description: string, headers: Record<string, ApiSchemaField>): ApiResponseDefinition {
  return {
    description,
    content: {
      [RECORD_SCHEMA_RESPONSE_MEDIA_TYPE]: {
        schema: recordSchemaDocument,
      },
    },
    headers,
  };
}

function notModifiedResponse(headers: Record<string, ApiSchemaField>): ApiResponseDefinition {
  return {
    description: 'Authorized schema representation has not changed',
    headers,
  };
}

function problemResponse(
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 503,
  description: string
): ApiResponseDefinition {
  const recordSchemaProblem = objectField(
    {
      type: stringField('URI identifying the Problem Details type'),
      title: stringField('Short, stable problem title'),
      status: z.literal(status).openapi({ description: 'HTTP status code', example: status }),
      detail: stringField('Safe explanation of the failure'),
      instance: stringField('Request URI for this problem occurrence'),
      code: stringField('Stable ReDBox record-schema problem code'),
    },
    ['type', 'title', 'status', 'detail', 'instance', 'code'],
    'RFC 9457 Problem Details for a record-schema request'
  );
  return {
    description,
    content: {
      [RECORD_SCHEMA_PROBLEM_MEDIA_TYPE]: {
        schema: recordSchemaProblem,
      },
    },
  };
}

const recordSchemaProblemResponses: Record<number, ApiResponseDefinition> = {
  400: problemResponse(400, 'Malformed record-schema request'),
  401: problemResponse(401, 'Authentication is required'),
  403: problemResponse(403, 'Record-schema request is not authorized'),
  404: problemResponse(404, 'Record schema or authorized resolution context was not found'),
  409: problemResponse(409, 'Record schema could not be resolved from the authoritative context'),
  413: problemResponse(413, 'Record schema exceeds configured complexity or output limits'),
  422: problemResponse(422, 'Record form or contributor contract is invalid'),
  503: problemResponse(503, 'Record-schema compiler or storage capability is unavailable'),
};

const recordSchemaSecurity = [{ bearerAuth: [] }] as const;

export const resolveCreateRecordSchemaRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/schemas/create/:recordType',
  'webservice/RecordSchemaController',
  'create',
  {
    params: createRecordSchemaParams,
    query: recordOperationQuery,
    headers: recordSchemaRequestHeaders,
  },
  {
    tags: ['Record Schemas'],
    summary: 'Resolve a create record schema',
    operationId: 'resolveCreateRecordSchema',
    includeDefaultResponses: false,
    security: recordSchemaSecurity,
    responses: {
      200: schemaResponse('Caller-effective create metadata schema', recordSchemaCanonicalResponseHeaders),
      304: notModifiedResponse(recordSchemaCanonicalResponseHeaders),
      ...recordSchemaProblemResponses,
    },
  }
);

export const resolveUpdateRecordSchemaRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/schemas/update/:oid',
  'webservice/RecordSchemaController',
  'update',
  {
    params: updateRecordSchemaParams,
    query: recordOperationQuery,
    headers: recordSchemaRequestHeaders,
  },
  {
    tags: ['Record Schemas'],
    summary: 'Resolve an update record schema',
    operationId: 'resolveUpdateRecordSchema',
    includeDefaultResponses: false,
    security: recordSchemaSecurity,
    responses: {
      200: schemaResponse('Caller-effective partial-update metadata schema', recordSchemaCanonicalResponseHeaders),
      304: notModifiedResponse(recordSchemaCanonicalResponseHeaders),
      ...recordSchemaProblemResponses,
    },
  }
);

export const getImmutableRecordSchemaRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/schemas/:digest',
  'webservice/RecordSchemaController',
  'immutable',
  {
    params: immutableRecordSchemaParams,
    headers: recordSchemaRequestHeaders,
  },
  {
    tags: ['Record Schemas'],
    summary: 'Get an immutable record schema',
    operationId: 'getImmutableRecordSchema',
    includeDefaultResponses: false,
    security: recordSchemaSecurity,
    responses: {
      200: schemaResponse('Authorized immutable record schema', recordSchemaResponseHeaders),
      304: notModifiedResponse(recordSchemaResponseHeaders),
      ...recordSchemaProblemResponses,
    },
  }
);

export const recordSchemaApiRoutes = [
  resolveCreateRecordSchemaRoute,
  resolveUpdateRecordSchemaRoute,
  getImmutableRecordSchemaRoute,
];
