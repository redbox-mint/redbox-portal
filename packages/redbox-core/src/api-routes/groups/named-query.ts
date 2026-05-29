import { apiRoute } from '../route-factory';
import { anyField, objectField, responseField, stringField } from '../schemas/common';

const namedQueryResponse = responseField(
  objectField({ data: anyField('Named query data') }, ['data'], 'Named query response', true),
  'Named query response'
);

const namedQueryBody = objectField({}, [], 'Named query payload', true);

const nameParam = objectField(
  {
    name: stringField('Named query name'),
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
    responses: { 200: namedQueryResponse },
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
    responses: { 200: namedQueryResponse },
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
    responses: { 200: namedQueryResponse },
  }
);

export const createNamedQueryRoute = apiRoute(
  'post',
  '/:branding/:portal/api/named-query',
  'webservice/NamedQueryController',
  'createQuery',
  {
    body: { required: true, content: { 'application/json': { schema: namedQueryBody } } },
  },
  {
    tags: ['NamedQuery'],
    summary: 'Create a new named query',
    responses: { 201: namedQueryResponse },
  }
);

export const updateNamedQueryRoute = apiRoute(
  'put',
  '/:branding/:portal/api/named-query/:name',
  'webservice/NamedQueryController',
  'updateQuery',
  {
    params: nameParam,
    body: { required: true, content: { 'application/json': { schema: namedQueryBody } } },
  },
  {
    tags: ['NamedQuery'],
    summary: 'Update an existing named query',
    responses: { 200: namedQueryResponse },
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
    responses: { 200: namedQueryResponse },
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
