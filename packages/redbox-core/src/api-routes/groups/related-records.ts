import { z } from '../zod-openapi';
import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, oidParams, responseField } from '../schemas/common';

const relationId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(value => !['__proto__', 'constructor', 'prototype'].includes(value));
export const relatedRelationIdsSchema = z
  .array(relationId)
  .min(1)
  .max(8)
  .refine(ids => new Set(ids).size === ids.length);
const references = z.record(relationId, z.unknown());
export const relatedRefreshBodySchema = z.union([
  z
    .object({
      oid: z.string().trim().min(1).max(1024),
      relations: relatedRelationIdsSchema,
      references: references.optional(),
    })
    .strict(),
  z.object({ recordType: z.string().trim().min(1).max(128), relations: relatedRelationIdsSchema, references }).strict(),
]);
const issue = z.object({
  code: z.enum([
    'unavailable',
    'invalid-reference',
    'cardinality',
    'limit-exceeded',
    'unsupported-relation',
    'field-absent',
    'configuration-error',
    'source-read-failed',
  ]),
  referenceIndex: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Zero-based original relation reference position; scalars use 0'),
  recordIndex: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Zero-based position in this entry's returned records array"),
  fieldPointer: z.string().optional(),
});
export const relatedMetadataSchema = z.record(
  z.string(),
  z.object({
    status: z.enum(['resolved', 'empty', 'partial', 'unavailable', 'invalid', 'failed']),
    records: z.array(
      z.object({
        redboxOid: z.string(),
        metaMetadata: z.object({ type: z.string(), brandId: z.string() }),
        metadata: z.record(z.string(), z.unknown()),
        revision: z.number().optional(),
      })
    ),
    issues: z.array(issue),
  })
);
const safeRecord = z.object({
  redboxOid: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  metaMetadata: z.object({ type: z.string(), brandId: z.string() }),
  relatedMetadata: relatedMetadataSchema,
});
const response = (data: typeof safeRecord | z.ZodObject<{ relatedMetadata: typeof relatedMetadataSchema }>) => ({
  ...responseField(z.object({ data }), 'Fresh related metadata; no multi-record snapshot guarantee'),
  headers: { 'Cache-Control': z.literal('private, no-store') },
});
const errors = {
  400: responseField(apiErrorResponseSchema, 'Malformed input or unknown relation'),
  403: responseField(apiErrorResponseSchema, 'Access denied'),
  404: responseField(apiErrorResponseSchema, 'Root unavailable'),
  500: responseField(apiErrorResponseSchema, 'Resolution configuration or operation failed'),
};
export const getResolvedRecordRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/resolved/:oid',
  'webservice/RecordController',
  'getResolved',
  {
    params: oidParams,
    query: z
      .object({ relations: z.string().refine(value => relatedRelationIdsSchema.safeParse(value.split(',')).success) })
      .strict(),
  },
  {
    tags: ['Records'],
    summary: 'Read a record with fresh related metadata',
    responses: { 200: response(safeRecord), ...errors },
  }
);
export const refreshRelatedMetadataRoute = {
  ...apiRoute(
    'post',
    '/:branding/:portal/record/relatedMetadata/resolve',
    'RecordController',
    'resolveRelatedMetadata',
    {
      // CSRF is enforced by the Sails security hook via `csrf: true` (when enabled for the deployment),
      // matching other browser POST routes; a schema-level header requirement would break CSRF-disabled deployments.
      body: { required: true, content: { 'application/json': { schema: relatedRefreshBodySchema } } },
    },
    {
      tags: ['Records'],
      summary: 'Resolve unsaved declared references without saving',
      security: [{ sessionAuth: [] }],
      responses: { 200: response(z.object({ relatedMetadata: relatedMetadataSchema })), ...errors },
    }
  ),
  csrf: true,
};
export const relatedRecordsApiRoutes = [getResolvedRecordRoute, refreshRelatedMetadataRoute];
