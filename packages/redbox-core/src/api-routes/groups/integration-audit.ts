import { apiRoute } from '../route-factory';
import {
  apiErrorResponseSchema,
  dateTimeStringField,
  integrationAuditStatusField,
  listApiResponseSchema,
  objectField,
  oidParams,
  pageNumberField,
  pageSizeField,
  recordAuditEntrySchema,
  responseField,
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
      status: integrationAuditStatusField('Integration status filter'),
      dateFrom: dateTimeStringField('Start date filter'),
      dateTo: dateTimeStringField('End date filter'),
      page: pageNumberField('Page number'),
      pageSize: pageSizeField('Page size'),
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
