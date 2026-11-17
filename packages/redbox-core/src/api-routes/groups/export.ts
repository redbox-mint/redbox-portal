import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, binaryField, objectField, responseField, stringField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');

export const downloadRecsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/export/record/download/:format',
  'webservice/ExportController',
  'downloadRecs',
  {
    params: objectField({ format: stringField() }, ['format']),
    query: objectField({ recType: stringField(), before: stringField(), after: stringField() }),
  },
  {
    tags: ['Export'],
    summary: 'Download records export',
    responses: {
      200: {
        description: 'Records export file',
        headers: {
          'Content-Disposition': stringField('Attachment filename'),
        },
        content: {
          'text/csv': { schema: binaryField('CSV export file contents') },
          'application/json': { schema: binaryField('JSON export file contents') },
        },
      },
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

const cancelledExportJobSchema = z.object({
  id: z.string(),
  recordType: z.string(),
  format: z.literal('csv'),
  modifiedBefore: z.string().nullable(),
  modifiedAfter: z.string().nullable(),
  status: z.literal('cancelled'),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string(),
  expiresAt: z.string(),
  filename: z.string(),
  byteLength: z.number().nullable(),
  downloadUrl: z.null(),
  errorCode: z.null(),
  errorMessage: z.null(),
});

/** Session endpoint: retain CSRF, unlike bearer-only REST routes. */
export const cancelExportJobRoute = defineApiRoute({
  method: 'post',
  path: '/:branding/:portal/export/jobs/:id/cancel',
  controller: 'ExportController',
  action: 'cancelJob',
  csrf: true,
  request: { params: z.object({ id: z.uuid() }), headers: z.object({ 'x-csrf-token': z.string().optional() }) },
  extensions: { 'x-redbox-roles': ['Admin'] },
  tags: ['Export'],
  summary: 'Cancel an owned queued or preparing export (Admin only)',
  description:
    'Brand, portal and effective-user scoped. No request body. Session callers must send a CSRF token. Returns 409 if completion or another terminal transition wins. Storage cleanup is cooperative and may finish after the response.',
  responses: {
    200: responseField(
      z.union([
        cancelledExportJobSchema,
        z.object({ data: cancelledExportJobSchema, meta: z.object({}).passthrough() }),
      ]),
      'Cancelled export (v1 DTO or v2 data envelope)'
    ),
    400: badRequestResponse,
    401: responseField(apiErrorResponseSchema, 'Sign in required'),
    403: responseField(apiErrorResponseSchema, 'Admin permission or CSRF token required'),
    404: responseField(apiErrorResponseSchema, 'Export not found in the caller scope'),
    409: responseField(apiErrorResponseSchema, 'Export already terminal'),
    500: internalServerErrorResponse,
  },
});

export const exportApiRoutes = [downloadRecsRoute, cancelExportJobRoute];
