import { apiRoute } from '../route-factory';
import {
  apiErrorResponseSchema,
  apiObjectActionResponseSchema,
  patternStringField,
  searchResultsSchema,
  objectField,
  recordSearchQuery,
  responseField,
} from '../schemas/common';
import { normalizeSearchQuery } from './search-query';

export const searchRecordsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/search',
  'webservice/SearchController',
  'search',
  {
    query: recordSearchQuery,
    queryExtractor: req => normalizeSearchQuery((req as unknown as { query?: unknown }).query),
  },
  {
    tags: ['Search'],
    summary: 'Search records',
    responses: {
      200: responseField(searchResultsSchema, 'Search results'),
      400: responseField(apiErrorResponseSchema, 'Bad request'),
      401: responseField(apiErrorResponseSchema, 'Unauthorized'),
      403: responseField(apiErrorResponseSchema, 'Forbidden'),
      404: responseField(apiErrorResponseSchema, 'Not found'),
      409: responseField(apiErrorResponseSchema, 'Conflict'),
      500: responseField(apiErrorResponseSchema, 'Internal server error'),
    },
  }
);

export const indexRecordRoute = apiRoute(
  'get',
  '/:branding/:portal/api/search/index',
  'webservice/SearchController',
  'index',
  { query: objectField({ oid: patternStringField('^[A-Za-z0-9_.-]+$', 'Record OID') }, ['oid']) },
  {
    tags: ['Search'],
    summary: 'Queue record indexing',
    responses: { 200: responseField(apiObjectActionResponseSchema, 'Record indexing queued') },
  }
);

export const indexAllRecordsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/search/indexAll',
  'webservice/SearchController',
  'indexAll',
  {},
  {
    tags: ['Search'],
    summary: 'Queue all records for indexing',
    responses: { 200: responseField(apiObjectActionResponseSchema, 'All record indexing queued') },
  }
);

export const removeAllIndexedRoute = apiRoute(
  'get',
  '/:branding/:portal/api/search/removeAll',
  'webservice/SearchController',
  'removeAll',
  {},
  {
    tags: ['Search'],
    summary: 'Remove all indexed records',
    responses: { 200: responseField(apiObjectActionResponseSchema, 'All indexed records removed') },
  }
);

export const searchApiRoutes = [searchRecordsRoute, indexRecordRoute, indexAllRecordsRoute, removeAllIndexedRoute];
