import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, listApiResponseSchema, objectField, recordTypeSchema, responseField, stringField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');

export const getRecordTypeRoute = apiRoute(
  'get',
  '/:branding/:portal/api/recordtypes/get',
  'webservice/RecordTypeController',
  'getRecordType',
  { query: objectField({ name: stringField() }, ['name']) },
  {
    tags: ['RecordTypes'],
    summary: 'Get record type',
    responses: {
      200: responseField(recordTypeSchema, 'Record type'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const listRecordTypesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/recordtypes',
  'webservice/RecordTypeController',
  'listRecordTypes',
  {},
  {
    tags: ['RecordTypes'],
    summary: 'List record types',
    responses: {
      200: responseField(listApiResponseSchema(recordTypeSchema), 'List record types'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const recordTypeApiRoutes = [getRecordTypeRoute, listRecordTypesRoute];
