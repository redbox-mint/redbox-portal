import { z } from '../zod-openapi';
import type { ZodRawShape, ZodType } from 'zod';

import { ApiSchemaField } from '../types';

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
export const nonEmptyStringField = (description?: string): ApiSchemaField => withDescription(z.string().min(1), description);
export const numberField = (description?: string): ApiSchemaField => withDescription(z.number(), description);
export const integerField = (description?: string): ApiSchemaField => withDescription(z.number().int(), description);
export const nonNegativeIntegerField = (description?: string): ApiSchemaField =>
  withDescription(z.number().int().min(0), description);
export const userSearchByField = (description?: string): ApiSchemaField =>
  withDescription(z.enum(['id', 'username', 'email', 'name', 'oidcSub', 'apiToken']), description);
export const recordTypeNameField = (description?: string): ApiSchemaField =>
  withDescription(z.enum(['rdmp', 'dataPublication']), description);
export const vocabularyTypeField = (description?: string): ApiSchemaField =>
  withDescription(z.enum(['flat', 'tree']), description);
export const booleanField = (description?: string): ApiSchemaField => withDescription(z.boolean(), description);
export const binaryField = (description?: string): ApiSchemaField =>
  withOpenApi(z.string(), { type: 'string', format: 'binary', description });
export const anyField = (description?: string): ApiSchemaField =>
  withOpenApi(z.unknown(), { type: 'object', description });
// Enforces the supplied pattern at runtime (Zod regex) in addition to publishing
// it as OpenAPI metadata, so contract validation actually rejects values that do
// not match. A bare `.openapi({ pattern })` only documents the constraint.
export const patternStringField = (pattern: string, description?: string): ApiSchemaField =>
  withOpenApi(z.string().regex(new RegExp(pattern)), description ? { description, pattern } : { pattern });

export function objectField(
  properties: Record<string, ApiSchemaField>,
  required: readonly string[] = [],
  description?: string,
  additionalProperties: boolean | ApiSchemaField = false
): ApiSchemaField {
  const requiredSet = new Set(required);
  const shape = Object.entries(properties).reduce((acc, [key, schema]) => {
    acc[key] = requiredSet.has(key) ? schema : schema.optional();
    return acc;
  }, {} as Record<string, ApiSchemaField>) as ZodRawShape;

  const objectSchema = additionalProperties === true ? z.object(shape).passthrough() : z.object(shape).strict();
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
    oid: patternStringField('^[A-Za-z0-9_.-]+$', 'Record OID'),
  },
  ['oid']
);

export const idParams = objectField(
  {
    id: patternStringField('^[A-Za-z0-9_.-]+$', 'Identifier'),
  },
  ['id']
);

export const recordTypeParams = objectField(
  {
    recordType: recordTypeNameField('Record type name'),
  },
  ['recordType']
);

export const targetStepParams = objectField(
  {
    targetStep: nonEmptyStringField('Workflow step name'),
  },
  ['targetStep']
);

export const datastreamParams = objectField(
  {
    oid: patternStringField('^[A-Za-z0-9_.-]+$', 'Record OID'),
    datastreamId: patternStringField('^[A-Za-z0-9_.-]+$', 'Datastream identifier'),
  },
  ['oid', 'datastreamId']
);

export const userSearchQuery = objectField({
  page: nonNegativeIntegerField('Page number'),
  pageSize: nonNegativeIntegerField('Page size'),
  searchBy: userSearchByField('Field to search by'),
  query: nonEmptyStringField('Search query'),
  includeDisabled: booleanField('Include disabled users'),
});

export const recordSearchQuery = objectField({
  type: stringField('Record type'),
  workflow: stringField('Workflow name'),
  searchStr: stringField('Search string'),
  core: stringField('Search core'),
  exactNames: objectField({}, [], 'Exact match field values keyed by field name', true),
  facetNames: objectField({}, [], 'Facet field values keyed by field name', true),
  rows: nonNegativeIntegerField('Rows per page'),
  page: nonNegativeIntegerField('Page number'),
});

export const recordListQuery = objectField({
  editOnly: booleanField('Only include records the user can edit'),
  recordType: stringField('Record type filter'),
  state: stringField('Workflow state filter'),
  start: nonNegativeIntegerField('Result offset'),
  // Mirrors sails.config.api.max_requests (default 20); the controller rejects
  // larger page sizes with a 400, so document the upper bound here.
  rows: withDescription(z.number().int().min(0).max(20), 'Result count (max 20)'),
  packageType: stringField('Package type filter'),
  sort: stringField('Sort expression'),
  filterFields: stringField('Comma separated filter field names'),
  filter: stringField('Comma separated filter values'),
});

export const recordAuditQuery = objectField({
  dateFrom: stringField('Start date filter'),
  dateTo: stringField('End date filter'),
});

export const recordUpdateQuery = objectField({
  merge: booleanField('Merge arrays instead of replacing them'),
  datastreams: booleanField('Process datastream metadata updates'),
});

export const recordHarvestQuery = objectField({
  updateMode: nonEmptyStringField('Harvest update mode'),
});

export const recordDownloadQuery = objectField({
  fileName: nonEmptyStringField('Override download filename'),
});

export const brandingDraftBody = objectField({
  variables: objectField({}, [], 'Branding variables', true),
});

export const brandingPublishBody = objectField({
  expectedVersion: nonNegativeIntegerField('Expected version'),
});

export const logoUploadBody = objectField({ logo: binaryField('Branding logo file') }, ['logo'], 'Multipart logo upload body');

export const datastreamUploadBody = objectField(
  { attachmentFields: arrayField(binaryField('Datastream file')) },
  ['attachmentFields'],
  'Multipart datastream upload body'
);

export const notificationBody = objectField(
  {
    to: anyField('Recipient(s)'),
    template: nonEmptyStringField('Template name'),
    from: anyField('Sender'),
    cc: anyField('CC recipients'),
    bcc: anyField('BCC recipients'),
    subject: stringField('Email subject'),
    format: stringField('Email format'),
    data: anyField('Template data'),
  },
  ['to', 'template']
);
