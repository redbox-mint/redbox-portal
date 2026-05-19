import { apiRoute } from '../route-factory';
import {
  apiObjectActionResponseSchema,
  searchResultsSchema,
  objectField,
  recordSearchQuery,
  responseField,
  stringField,
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
    responses: { 200: responseField(searchResultsSchema, 'Search results') },
  }
);

export const indexRecordRoute = apiRoute(
  'get',
  '/:branding/:portal/api/search/index',
  'webservice/SearchController',
  'index',
  { query: objectField({ oid: stringField() }, ['oid']) },
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
