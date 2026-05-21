import { apiRoute } from '../route-factory';
import {
  apiErrorResponseSchema,
  listApiResponseSchema,
  objectField,
  oidParams,
  recordAuditEntrySchema,
  responseField,
  stringField,
} from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');
const bodyFallback = ['body'] as const;

export const getIntegrationAuditRoute = apiRoute(
  'get',
  '/:branding/:portal/api/integration-audit/:oid',
  'webservice/IntegrationAuditController',
  'getAuditLog',
  {
    params: oidParams,
    query: objectField({
      status: stringField('Integration status filter'),
      dateFrom: stringField('Start date filter'),
      dateTo: stringField('End date filter'),
      page: stringField('Page number'),
      pageSize: stringField('Page size'),
    }),
    legacyParamFallbacks: {
      status: bodyFallback,
      dateFrom: bodyFallback,
      dateTo: bodyFallback,
      page: bodyFallback,
      pageSize: bodyFallback,
    },
  },
  {
    tags: ['Integration Audit'],
    summary: 'Get integration audit log',
    responses: {
      200: responseField(listApiResponseSchema(recordAuditEntrySchema), 'Integration audit log'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const integrationAuditApiRoutes = [getIntegrationAuditRoute];
