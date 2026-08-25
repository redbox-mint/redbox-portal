import { z } from '../zod-openapi';
import type { ZodRawShape, ZodType } from 'zod';

import { ApiSchemaField } from '../types';
import {
  RECORD_ENTITY_TAG_MAX_LENGTH,
  RECORD_ENTITY_TAG_PATTERN,
  RECORD_SAVE_REQUEST_ID_MAX_LENGTH,
  VALIDATION_OPERATION_NAME_MAX_LENGTH,
  VALIDATION_OPERATION_NAME_PATTERN,
} from '@researchdatabox/sails-ng-common';

export * from './responses';

function withOpenApi<T extends ZodType>(schema: T, metadata: Record<string, unknown>): T {
  return (schema as unknown as { openapi: (metadata: Record<string, unknown>) => T }).openapi(metadata);
}

function withDescription<T extends ZodType>(schema: T, description?: string): T {
  if (!description) {
    return schema;
  }
  return withOpenApi(schema, { description });
}

export const stringField = (description?: string): ApiSchemaField => withDescription(z.string(), description);
export const numberField = (description?: string): ApiSchemaField => withDescription(z.number(), description);
export const integerField = (description?: string): ApiSchemaField => withDescription(z.number().int(), description);
export const booleanField = (description?: string): ApiSchemaField => withDescription(z.boolean(), description);
export const binaryField = (description?: string): ApiSchemaField =>
  withOpenApi(z.string(), { type: 'string', format: 'binary', description });
export const anyField = (description?: string): ApiSchemaField =>
  withOpenApi(z.unknown(), { type: 'object', description });

export const validationOperationQueryField: ApiSchemaField = withOpenApi(
  z
    .string({ error: 'record-validation-operation-invalid' })
    .trim()
    .max(VALIDATION_OPERATION_NAME_MAX_LENGTH, { error: 'record-validation-operation-invalid' })
    .regex(VALIDATION_OPERATION_NAME_PATTERN, { error: 'record-validation-operation-invalid' }),
  {
    description: 'Case-sensitive server validation operation identifier',
    example: 'submit',
  }
);

/**
 * Keep semantic header parsing in RecordHttpConcurrency so weak, wildcard,
 * list, and wrong-record tags receive the same bounded controller error. The
 * OpenAPI pattern still describes the strong entity tags clients must send.
 */
export const recordIfMatchHeaderField: ApiSchemaField = withOpenApi(
  z.string().max(RECORD_ENTITY_TAG_MAX_LENGTH, { error: 'record-if-match-invalid' }),
  {
    description: 'Exact strong ETag returned by the latest authorized individual record read',
    pattern: RECORD_ENTITY_TAG_PATTERN.source,
    example: '"rb-record-v1.7.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  }
);

const recordResolutionField: ApiSchemaField = withOpenApi(z.string().max(64), {
  description: 'Diagnostic resolution label; never authorization or a precondition bypass',
  enum: ['direct', 'client-auto-merged', 'client-manually-resolved'],
});

const recordResolutionRequestIdField: ApiSchemaField = withOpenApi(z.string().max(RECORD_SAVE_REQUEST_ID_MAX_LENGTH), {
  description: 'Canonical UUID of the conflict response this resolution follows',
  format: 'uuid',
});

const recordSaveRequestIdField: ApiSchemaField = withOpenApi(z.string().max(RECORD_SAVE_REQUEST_ID_MAX_LENGTH), {
  description: 'Optional canonical UUID used to correlate this save attempt',
  format: 'uuid',
});

export function objectField(
  properties: Record<string, ApiSchemaField>,
  required: readonly string[] = [],
  description?: string,
  additionalProperties: boolean | ApiSchemaField = false
): ApiSchemaField {
  const requiredSet = new Set(required);
  const shape = Object.entries(properties).reduce(
    (acc, [key, schema]) => {
      acc[key] = requiredSet.has(key) ? schema : schema.optional();
      return acc;
    },
    {} as Record<string, ApiSchemaField>
  ) as ZodRawShape;

  const objectSchema = additionalProperties === true ? z.object(shape).passthrough() : z.object(shape);
  return description
    ? withOpenApi(
        objectSchema,
        additionalProperties === true ? { description, additionalProperties: true } : { description }
      )
    : objectSchema;
}

export function arrayField(items: ApiSchemaField, description?: string): ApiSchemaField {
  return withDescription(z.array(items), description);
}

export function responseField(
  schema: ApiSchemaField,
  description: string
): { description: string; content: Record<string, { schema: ApiSchemaField }> } {
  return {
    description,
    content: {
      'application/json': { schema },
    },
  };
}

export const brandPortalParams = objectField(
  {
    branding: stringField('Branding identifier'),
    portal: stringField('Portal identifier'),
  },
  ['branding', 'portal']
);

export const oidParams = objectField(
  {
    oid: stringField('Record OID'),
  },
  ['oid']
);

/**
 * Public API mutations are form-independent, so they never carry the browser
 * form fingerprint; only the browser routes bind to a generated form.
 */
export const recordMutationHeaderFields = {
  'If-Match': recordIfMatchHeaderField,
  'X-ReDBox-Save-Request-Id': recordSaveRequestIdField,
  'X-ReDBox-Concurrency-Resolution': recordResolutionField,
  'X-ReDBox-Resolution-Of-Request-Id': recordResolutionRequestIdField,
};

export const recordMutationHeaders = objectField(recordMutationHeaderFields);

export const idParams = objectField(
  {
    id: stringField('Identifier'),
  },
  ['id']
);

export const recordTypeParams = objectField(
  {
    recordType: stringField('Record type name'),
  },
  ['recordType']
);

export const targetStepParams = objectField(
  {
    targetStep: stringField('Workflow step name'),
  },
  ['targetStep']
);

export const datastreamParams = objectField(
  {
    oid: stringField('Record OID'),
    datastreamId: stringField('Datastream identifier'),
  },
  ['oid', 'datastreamId']
);

export const userSearchQuery = objectField({
  page: integerField('Page number'),
  pageSize: integerField('Page size'),
  searchBy: stringField('Field to search by'),
  query: stringField('Search query'),
  includeDisabled: booleanField('Include disabled users'),
});

export const recordSearchQuery = objectField({
  type: stringField('Record type'),
  workflow: stringField('Workflow name'),
  searchStr: stringField('Search string'),
  core: stringField('Search core'),
  exactNames: objectField({}, [], 'Exact match field values keyed by field name', true),
  facetNames: objectField({}, [], 'Facet field values keyed by field name', true),
  rows: integerField('Rows per page'),
  page: integerField('Page number'),
});

export const recordListQuery = objectField({
  editOnly: booleanField('Only include records the user can edit'),
  recordType: stringField('Record type filter'),
  state: stringField('Workflow state filter'),
  start: integerField('Result offset'),
  rows: integerField('Result count'),
  packageType: stringField('Package type filter'),
  sort: stringField('Sort expression'),
  filterFields: stringField('Comma separated filter field names'),
  filter: stringField('Comma separated filter values'),
});

export const recordAuditQuery = objectField({
  dateFrom: stringField('Start date filter'),
  dateTo: stringField('End date filter'),
});

const recordUpdateCompatibilityQueryFields = {
  merge: booleanField('Merge arrays instead of replacing them'),
  datastreams: booleanField('Process datastream metadata updates'),
};

export const recordUpdateQuery = objectField({
  ...recordUpdateCompatibilityQueryFields,
  operation: validationOperationQueryField,
});

export const legacyRecordUpdateQuery = objectField(recordUpdateCompatibilityQueryFields);

export const recordOperationQuery = objectField({
  operation: validationOperationQueryField,
});

export const recordDeleteQuery = objectField({
  permanent: withOpenApi(z.enum(['true', 'false']), {
    description: 'Permanently purge the record and its datastreams instead of retaining a tombstone',
  }),
});

export const recordHarvestQuery = objectField({
  updateMode: stringField('Harvest update mode'),
});

export const recordDownloadQuery = objectField({
  fileName: stringField('Override download filename'),
});

export const brandingDraftBody = objectField({
  variables: objectField({}, [], 'Branding variables', true),
});

export const brandingPublishBody = objectField({
  expectedVersion: integerField('Expected version'),
});

export const logoUploadBody = objectField({}, [], 'Multipart logo upload body', true);

export const faviconUploadBody = objectField({}, [], 'Multipart favicon upload body', true);

export const datastreamUploadBody = objectField({}, [], 'Multipart datastream upload body', true);

export const notificationBody = objectField(
  {
    to: anyField('Recipient(s)'),
    template: stringField('Template name'),
    from: anyField('Sender'),
    cc: anyField('CC recipients'),
    bcc: anyField('BCC recipients'),
    subject: stringField('Email subject'),
    format: stringField('Email format'),
    data: anyField('Template data'),
  },
  []
);
