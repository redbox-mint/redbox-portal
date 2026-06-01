import { apiRoute } from '../route-factory';
import {
  apiErrorResponseSchema,
  harvestRunDetailResponseSchema,
  harvestRunEventSchema,
  harvestRunSummarySchema,
  idParams,
  listApiResponseSchema,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');
const notFoundResponse = responseField(apiErrorResponseSchema, 'Harvest run not found');
const bodyFallback = ['body'] as const;

export const listHarvestRunsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/harvest-runs',
  'webservice/HarvestRunController',
  'listRuns',
  {
    query: objectField({
      status: stringField('Run status filter'),
      recordType: stringField('Record type filter'),
      sourceName: stringField('Source name filter'),
      dateFrom: stringField('Start date filter'),
      dateTo: stringField('End date filter'),
      page: stringField('Page number'),
      pageSize: stringField('Page size'),
    }),
    legacyParamFallbacks: {
      status: bodyFallback,
      recordType: bodyFallback,
      sourceName: bodyFallback,
      dateFrom: bodyFallback,
      dateTo: bodyFallback,
      page: bodyFallback,
      pageSize: bodyFallback,
    },
  },
  {
    tags: ['Harvest Runs'],
    summary: 'List harvest runs',
    responses: {
      200: responseField(listApiResponseSchema(harvestRunSummarySchema), 'Harvest run list'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const getHarvestRunRoute = apiRoute(
  'get',
  '/:branding/:portal/api/harvest-runs/:id',
  'webservice/HarvestRunController',
  'getRun',
  {
    params: idParams,
  },
  {
    tags: ['Harvest Runs'],
    summary: 'Get harvest run detail',
    responses: {
      200: responseField(harvestRunDetailResponseSchema, 'Harvest run detail'),
      400: badRequestResponse,
      404: notFoundResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const listHarvestRunEventsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/harvest-runs/:id/events',
  'webservice/HarvestRunController',
  'listRunEvents',
  {
    params: idParams,
    query: objectField({
      outcome: stringField('Event outcome filter'),
      operation: stringField('Event operation filter'),
      harvestId: stringField('Harvest identifier filter'),
      oid: stringField('Record oid filter'),
      page: stringField('Page number'),
      pageSize: stringField('Page size'),
    }),
    legacyParamFallbacks: {
      outcome: bodyFallback,
      operation: bodyFallback,
      harvestId: bodyFallback,
      oid: bodyFallback,
      page: bodyFallback,
      pageSize: bodyFallback,
    },
  },
  {
    tags: ['Harvest Runs'],
    summary: 'List harvest run events',
    responses: {
      200: responseField(listApiResponseSchema(harvestRunEventSchema), 'Harvest run event list'),
      400: badRequestResponse,
      404: notFoundResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const harvestRunApiRoutes = [listHarvestRunsRoute, getHarvestRunRoute, listHarvestRunEventsRoute];
