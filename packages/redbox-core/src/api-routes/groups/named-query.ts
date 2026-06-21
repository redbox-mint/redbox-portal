import { apiRoute } from '../route-factory';
import { z } from '../zod-openapi';
import { anyField, apiErrorResponseSchema, arrayField, genericObjectSchema, nonEmptyStringField, objectField, patternStringField, responseField, stringField } from '../schemas/common';

const namedQueryDataResponse = responseField(anyField('Named query response data'), 'Named query response');
const namedQueryListResponse = responseField(arrayField(genericObjectSchema), 'Named query definitions');
const namedQueryCollectionsResponse = responseField(arrayField(stringField()), 'Named query collection names');

const namedQueryDefinitionBody = {
  collectionName: z.enum(['record', 'user']).openapi({ description: 'Collection name' }),
  resultObjectMapping: objectField({}, [], 'Result object mapping', true),
  mongoQuery: objectField({}, [], 'Mongo query', true),
  queryParams: objectField({}, [], 'Query parameters', true),
};

const createNamedQueryBody = objectField(
  {
    name: patternStringField('^[A-Za-z0-9_-]+$', 'Named query name'),
    ...namedQueryDefinitionBody,
  },
  ['name', 'collectionName', 'resultObjectMapping', 'mongoQuery', 'queryParams'],
  'Named query payload',
  true
);

const updateNamedQueryBody = objectField(
  {
    name: patternStringField('^[A-Za-z0-9_-]+$', 'Named query name'),
    ...namedQueryDefinitionBody,
  },
  ['collectionName', 'resultObjectMapping', 'mongoQuery', 'queryParams'],
  'Named query payload',
  true
);

const nameParam = objectField(
  {
    name: patternStringField('^[A-Za-z0-9_-]+$', 'Named query name'),
  },
  ['name']
);

export const listNamedQueriesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/named-query',
  'webservice/NamedQueryController',
  'listQueries',
  {},
  {
    tags: ['NamedQuery'],
    summary: 'List all named queries for the brand',
    responses: { 200: namedQueryListResponse },
  }
);

export const getNamedQueryCollectionsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/named-query/collections',
  'webservice/NamedQueryController',
  'getCollections',
  {},
  {
    tags: ['NamedQuery'],
    summary: 'List the collections that may be used when defining a named query',
    responses: { 200: namedQueryCollectionsResponse },
  }
);

export const getNamedQueryRoute = apiRoute(
  'get',
  '/:branding/:portal/api/named-query/:name',
  'webservice/NamedQueryController',
  'getQuery',
  { params: nameParam },
  {
    tags: ['NamedQuery'],
    summary: 'Get a named query by name',
    responses: { 200: namedQueryDataResponse },
  }
);

export const createNamedQueryRoute = apiRoute(
  'post',
  '/:branding/:portal/api/named-query',
  'webservice/NamedQueryController',
  'createQuery',
  {
    body: { required: true, content: { 'application/json': { schema: createNamedQueryBody } } },
  },
  {
    tags: ['NamedQuery'],
    summary: 'Create a new named query',
    responses: {
      201: namedQueryDataResponse,
      409: responseField(apiErrorResponseSchema, 'Named query already exists'),
    },
  }
);

export const updateNamedQueryRoute = apiRoute(
  'put',
  '/:branding/:portal/api/named-query/:name',
  'webservice/NamedQueryController',
  'updateQuery',
  {
    params: nameParam,
    body: { required: true, content: { 'application/json': { schema: updateNamedQueryBody } } },
  },
  {
    tags: ['NamedQuery'],
    summary: 'Update an existing named query',
    responses: { 200: namedQueryDataResponse },
  }
);

export const deleteNamedQueryRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/named-query/:name',
  'webservice/NamedQueryController',
  'deleteQuery',
  { params: nameParam },
  {
    tags: ['NamedQuery'],
    summary: 'Delete a named query',
    responses: { 200: namedQueryDataResponse },
  }
);

export const namedQueryApiRoutes = [
  listNamedQueriesRoute,
  getNamedQueryCollectionsRoute,
  getNamedQueryRoute,
  createNamedQueryRoute,
  updateNamedQueryRoute,
  deleteNamedQueryRoute,
];
