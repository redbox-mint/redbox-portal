import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, listApiResponseSchema, namedQueryResponseRecordSchema, objectField, responseField, stringField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');

export const executeNamedQueryRoute = apiRoute(
  'get',
  '/:branding/:portal/api/report/namedQuery',
  'webservice/ReportController',
  'executeNamedQuery',
  {
    query: objectField({ queryName: stringField(), start: stringField(), rows: stringField() }, ['queryName']),
  },
  {
    tags: ['Reports'],
    summary: 'Execute named query report',
    responses: {
      200: responseField(listApiResponseSchema(namedQueryResponseRecordSchema), 'Named query results'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const reportsApiRoutes = [executeNamedQueryRoute];
