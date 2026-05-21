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
          'text/json': { schema: binaryField('JSON export file contents') },
        },
      },
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const exportApiRoutes = [downloadRecsRoute];
