import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import {
  apiErrorResponseSchema,
  responseField,
  objectField,
  integerField,
  booleanField,
  stringField,
} from '../schemas/common';

export const deletionFiltersSchema = z.object({
  deletedWithin: z.enum(['', 'any', '7', '30']).optional(),
  deletedBy: z.string().trim().max(256).optional(),
});
export const deletedRecordListQuery = objectField({
  editOnly: booleanField(),
  recordType: stringField(),
  state: stringField(),
  start: integerField(),
  rows: integerField(),
  packageType: stringField(),
  sort: stringField(),
  filterFields: stringField(),
  filter: stringField(),
  filterMode: stringField(),
  ...deletionFiltersSchema.shape,
});
export const bulkDeletedRecordsBody = z
  .object({
    action: z.enum(['restore', 'destroy']),
    items: z
      .array(
        z
          .object({
            oid: z.string().trim().min(1).max(256),
            entityTag: z.string().min(1).max(512),
          })
          .strict()
      )
      .min(1)
      .max(100)
      .refine(items => new Set(items.map(item => item.oid)).size === items.length, 'Duplicate record ids'),
  })
  .strict();
export const bulkDeletedRecordsResponse = z.object({
  results: z.array(
    z.object({
      oid: z.string(),
      status: z.enum(['succeeded', 'failed', 'unknown']),
      reason: z.enum([
        'completed',
        'not-found-or-forbidden',
        'invalid-precondition',
        'record-changed',
        'unsuccessful',
        'outcome-unknown',
      ]),
    })
  ),
});

export const bulkDeletedRecordsRoute = defineApiRoute({
  method: 'post',
  path: '/:branding/:portal/admin/deletedRecords/bulk',
  controller: 'RecordController',
  action: 'bulkDeletedRecords',
  csrf: true,
  request: {
    body: { required: true, content: { 'application/json': { schema: bulkDeletedRecordsBody } } },
    headers: z.object({ 'x-csrf-token': z.string().optional() }),
  },
  extensions: { 'x-redbox-roles': ['Admin'] },
  tags: ['Records'],
  summary: 'Restore or permanently delete up to 100 deleted records (Admin only)',
  description:
    'Session and CSRF protected. Each item requires the opaque entity tag of its selected deleted representation. Applies the single-record brand and edit authorization and lifecycle checks independently. Unknown outcomes must be verified before retrying.',
  responses: {
    200: responseField(
      z.union([
        bulkDeletedRecordsResponse,
        z.object({ data: bulkDeletedRecordsResponse, meta: z.object({}).passthrough() }),
      ]),
      'Per-record outcomes; failures do not stop the batch'
    ),
    400: responseField(apiErrorResponseSchema, 'Invalid action, batch, duplicate ids or missing preconditions'),
    401: responseField(apiErrorResponseSchema, 'Sign in required'),
    403: responseField(apiErrorResponseSchema, 'Admin permission or CSRF required'),
  },
});
const deletedRecordSessionListResponse = z.object({
  items: z.array(
    z
      .object({
        oid: z.string(),
        recordType: z.string(),
        recordTypeLabel: z.string().optional(),
        deletedBy: z.object({ id: z.string().optional(), username: z.string().optional() }).nullable(),
      })
      .passthrough()
  ),
  totalItems: z.number(),
  currentPage: z.number(),
  noItems: z.number(),
});

export const deletedRecordSessionListRoute = defineApiRoute({
  method: 'get',
  path: '/:branding/:portal/listDeletedRecords',
  controller: 'RecordController',
  action: 'getDeletedRecordList',
  csrf: true,
  request: { query: deletedRecordListQuery },
  extensions: { 'x-redbox-roles': ['Admin'] },
  tags: ['Records'],
  summary: 'List deleted records for the admin table',
  description:
    'Brand and permission scoped. deletedWithin accepts 7, 30 or any (default); deletedBy is an exact username. Both filters run before counting and pagination. Rows include recordType, an optional translated recordTypeLabel, deletedBy (id/username or null for legacy records), dateDeleted and the selected revision.',
  responses: {
    200: responseField(
      z.union([
        deletedRecordSessionListResponse,
        z.object({ data: deletedRecordSessionListResponse, meta: z.object({}).passthrough() }),
      ]),
      'Paged deleted records'
    ),
    400: responseField(apiErrorResponseSchema, 'Invalid filter'),
    403: responseField(apiErrorResponseSchema, 'Admin permission required'),
  },
});
export const deletedRecordsApiRoutes = [bulkDeletedRecordsRoute, deletedRecordSessionListRoute];
