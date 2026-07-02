import { z } from '../zod-openapi';
import type { ZodRawShape, ZodType } from 'zod';

import { ApiSchemaField } from '../types';
import { brandingThemeAllowedVariableNames } from '../../services/BrandingThemeTokens';

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
export const nonEmptyStringField = (description?: string): ApiSchemaField => {
  const schema = z.string().trim().min(1).refine(
    (val) => !val.includes('\0'),
    { message: 'String must not contain null bytes' }
  );
  return withOpenApi(schema, description ? { description, pattern: '.*\\S.*' } : { pattern: '.*\\S.*' });
};
export const numberField = (description?: string): ApiSchemaField => withDescription(z.number(), description);
// zod's `.int()` only accepts JS safe integers at runtime; publish the matching bounds so the
// OpenAPI contract advertises a `maximum`/`minimum` and clients (and fuzzers) don't generate
// int64 values that the server would reject with "Too big".
export const integerField = (description?: string): ApiSchemaField =>
  withDescription(z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), description);
export const nonNegativeIntegerField = (description?: string): ApiSchemaField =>
  withDescription(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), description);
export const pageNumberField = (description?: string): ApiSchemaField =>
  withDescription(z.number().int().min(1).max(10000), description);
export const pageSizeField = (description?: string): ApiSchemaField =>
  withDescription(z.number().int().min(1).max(100), description);
export const userSearchByField = (description?: string): ApiSchemaField =>
  withDescription(z.enum(['id', 'username', 'email', 'name', 'oidcSub', 'apiToken']), description);
export const recordTypeNameField = (description?: string): ApiSchemaField =>
  patternStringField('^[A-Za-z0-9_-]+$', description);
export const vocabularyTypeField = (description?: string): ApiSchemaField =>
  withDescription(z.enum(['flat', 'tree']), description);
export const integrationAuditStatusField = (description?: string): ApiSchemaField =>
  withDescription(z.enum(['started', 'success', 'failed']), description);
export const contentFormatField = (description?: string): ApiSchemaField =>
  withDescription(z.enum(['plain', 'html']), description || 'Content format');
export const booleanField = (description?: string): ApiSchemaField => withDescription(z.boolean(), description);
export const booleanQueryField = (description?: string): ApiSchemaField =>
  withDescription(z.union([z.boolean(), z.enum(['true', 'false'])]).transform(value => value === true || value === 'true'), description);
export const binaryField = (description?: string): ApiSchemaField =>
  withOpenApi(z.string(), { type: 'string', format: 'binary', description });
export const anyField = (description?: string): ApiSchemaField =>
  withOpenApi(z.unknown(), { type: 'object', description });
// Enforces the supplied pattern at runtime (Zod regex) in addition to publishing
// it as OpenAPI metadata, so contract validation actually rejects values that do
// not match. A bare `.openapi({ pattern })` only documents the constraint.
export const patternStringField = (pattern: string, description?: string): ApiSchemaField =>
  withOpenApi(z.string().regex(new RegExp(pattern)), description ? { description, pattern } : { pattern });
export const dateTimeStringField = (description?: string): ApiSchemaField =>
  withOpenApi(z.string().datetime({ offset: true }), { description, format: 'date-time' });
export const emailStringField = (description?: string): ApiSchemaField =>
  patternStringField('^(?:[A-Za-z0-9][A-Za-z0-9._%+-]*[A-Za-z0-9]|[A-Za-z0-9])@(?:[A-Za-z0-9-]*[A-Za-z][A-Za-z0-9-]*\\.)+[A-Za-z]{2,}$', description);

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

  const objectSchema =
    additionalProperties === true
      ? z.object(shape).passthrough()
      : additionalProperties === false
        ? z.object(shape).strict()
        : z.object(shape).catchall(additionalProperties);
  return description
    ? withOpenApi(
      objectSchema,
      additionalProperties === true
        ? { description, additionalProperties: true }
        : additionalProperties === false
          ? { description, additionalProperties: false }
          : { description }
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

export const userSearchQuery = objectField(
  {
    page: pageNumberField('Page number'),
    pageSize: pageSizeField('Page size'),
    searchBy: userSearchByField('Field to search by'),
    query: nonEmptyStringField('Search query'),
    includeDisabled: booleanQueryField('Include disabled users'),
  },
  []
);

export const recordSearchQuery = objectField({
  type: nonEmptyStringField('Record type'),
  workflow: patternStringField('^[A-Za-z0-9_.-]+$', 'Workflow name'),
  searchStr: patternStringField('^[^\\x00-\\x1F\\x7F]*\\S[^\\x00-\\x1F\\x7F]*$', 'Search string'),
  core: patternStringField('^(?!__proto__$|prototype$)[A-Za-z0-9_.-]+$', 'Search core'),
  exactNames: z.record(z.string().regex(/^[A-Za-z0-9_.-]+$/), z.string()).openapi({
    description: 'Exact match field values keyed by field name',
  }),
  facetNames: z.record(z.string().regex(/^[A-Za-z0-9_.-]+$/), z.string()).openapi({
    description: 'Facet field values keyed by field name',
  }),
  rows: pageSizeField('Rows per page'),
  page: pageNumberField('Page number'),
}, [], undefined, true);

export const recordListQuery = objectField({
  editOnly: booleanQueryField('Only include records the user can edit'),
  recordType: recordTypeNameField('Record type filter'),
  state: patternStringField('^[A-Za-z0-9_-]+$', 'Workflow state filter'),
  start: nonNegativeIntegerField('Result offset'),
  // Mirrors sails.config.api.max_requests (default 20); the controller rejects
  // larger page sizes with a 400, so document the upper bound here.
  rows: withDescription(z.number().int().min(0).max(20), 'Result count (max 20)'),
  packageType: patternStringField('^[A-Za-z0-9_,.-]+$', 'Package type filter'),
  sort: patternStringField('^[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*[ \\t]+(asc|desc|ASC|DESC)$', 'Sort expression, e.g. date_object_modified desc'),
  filterFields: patternStringField('^(?!.*(?:^|,)__proto__(?:,|$))(?!.*(?:^|,)constructor(?:,|$))(?!.*(?:^|,)prototype(?:,|$))[A-Za-z0-9_,.-]+$', 'Comma separated filter field names'),
  filter: patternStringField('^[A-Za-z0-9_,. -]+$', 'Comma separated filter values'),
});

export const recordAuditQuery = objectField({
  dateFrom: dateTimeStringField('Start date filter'),
  dateTo: dateTimeStringField('End date filter'),
});

export const recordUpdateQuery = objectField({
  merge: booleanQueryField('Merge arrays instead of replacing them'),
  datastreams: booleanQueryField('Process datastream metadata updates'),
});

export const recordHarvestQuery = objectField({
  updateMode: withDescription(z.enum(['create', 'update', 'merge', 'ignore', 'override']), 'Harvest update mode'),
});

export const recordDownloadQuery = objectField({
  fileName: nonEmptyStringField('Override download filename'),
});

// Branding variables are keyed by an editable theme token (optionally `$`-prefixed, which the
// service strips) and valued with a 3- or 6-digit hex colour. Modelling these constraints
// explicitly keeps the contract aligned with BrandingThemeCssService's validation.
const brandingVariableValueField = patternStringField(
  '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
  'Hex colour value (#rgb or #rrggbb)'
);
const brandingVariableProperties = brandingThemeAllowedVariableNames
  .flatMap(name => [name, `$${name}`])
  .reduce((acc, key) => {
    acc[key] = brandingVariableValueField;
    return acc;
  }, {} as Record<string, ApiSchemaField>);
export const brandingDraftBody = objectField({
  variables: objectField(brandingVariableProperties, [], 'Branding theme variables keyed by editable token name', false),
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
    to: z.union([emailStringField(), z.array(emailStringField()).min(1)]).openapi({ description: 'Recipient(s)' }),
    template: z.enum(['test']).openapi({ description: 'Template name' }),
    from: emailStringField('Sender'),
    cc: z.union([emailStringField(), z.array(emailStringField()).min(1).max(5)]).optional().openapi({ description: 'CC recipients' }),
    bcc: z.union([emailStringField(), z.array(emailStringField()).min(1).max(5)]).optional().openapi({ description: 'BCC recipients' }),
    subject: stringField('Email subject'),
    format: z.enum(['html', 'text']).optional().openapi({ description: 'Email format' }),
    data: objectField({ data: stringField('Template data value') }, ['data'], 'Template data'),
  },
  ['to', 'template', 'data']
);
