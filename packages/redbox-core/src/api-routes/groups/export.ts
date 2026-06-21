import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, binaryField, nonEmptyStringField, objectField, responseField, stringField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');

export const downloadRecsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/export/record/download/:format',
  'webservice/ExportController',
  'downloadRecs',
  {
    params: objectField({ format: nonEmptyStringField().openapi({ enum: ['csv', 'json'] }) }, ['format']),
    query: objectField({ recType: stringField(), before: nonEmptyStringField(), after: nonEmptyStringField() }),
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
          'text/json': { schema: binaryField('JSON export file contents') },
          'application/json': { schema: objectField({}, [], 'JSON export payload', true) },
        },
      },
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const exportApiRoutes = [downloadRecsRoute];
