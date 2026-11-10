import { apiRoute } from '../route-factory';
import { anyField, arrayField, objectField, responseField, stringField } from '../schemas/common';

const namedQueryResponse = responseField(
  objectField({ data: anyField('Named query data') }, ['data'], 'Named query response', true),
  'Named query response'
);

const consumer = objectField({
  type: stringField('Consumer kind: report, dashboard, vocabulary, form or configuration'),
  name: stringField('Consumer display name or translation key'),
  path: stringField('Link relative to the current brand and portal'),
}, ['type', 'name', 'path']);
const queryWithUsage = objectField({ usedBy: arrayField(consumer, 'Configured consumers in this brand') }, ['usedBy'], 'Named query definition with usage metadata', true);
const listWithUsageResponse = responseField(objectField({ data: arrayField(queryWithUsage) }, ['data']), 'Brand named queries with usage');
const queryWithUsageResponse = responseField(objectField({ data: queryWithUsage }, ['data']), 'Named query with usage');
const inUseResponse = responseField(objectField({
  meta: objectField({ usedBy: arrayField(consumer) }, ['usedBy']),
  errors: arrayField(anyField('Error explaining that configured references must be removed first')),
}, ['meta', 'errors']), 'Query is in use; deletion refused');

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
    description: 'Admin-only. Includes usedBy consumers, aggregated once for the whole list. Links are relative to the current brand/portal. Runtime API callers are not tracked.',
    responses: { 200: listWithUsageResponse },
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
    description: 'Admin-only, brand-scoped definition including current configured usedBy consumers.',
    responses: { 200: queryWithUsageResponse },
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
    description: 'Admin-only. Rechecks brand-scoped usage and refuses an in-use query with 409 and meta.usedBy. No force override: remove the references first.',
    responses: { 200: namedQueryResponse, 409: inUseResponse },
  }
);

// Keep editor operations below a namespace so existing URL-safe query names remain valid.
const assistanceQuery = objectField(
  {
    collectionName: stringField('Collection name').optional(),
    recordType: stringField('Optional record type for guidance').optional(),
    stage: stringField('Optional workflow stage for guidance').optional(),
  },
  [],
  'Ephemeral field guidance',
  true
);

export const namedQueryEditorRoutes = [
  apiRoute(
    'get',
    '/:branding/:portal/api/named-query/editor/schema-targets',
    'webservice/NamedQueryController',
    'schemaTargets',
    {},
    {
      tags: ['NamedQuery'],
      summary: 'Discover caller-authorized record schema targets',
      responses: { 200: namedQueryResponse },
    }
  ),
  apiRoute(
    'get',
    '/:branding/:portal/api/named-query/editor/fields',
    'webservice/NamedQueryController',
    'describeFields',
    { query: assistanceQuery },
    {
      tags: ['NamedQuery'],
      summary: 'Describe stored query fields and mapping context',
      responses: { 200: namedQueryResponse },
    }
  ),
  ...(['validate', 'describe', 'preview'] as const).map(operation => ({
    ...apiRoute(
      'post',
      `/:branding/:portal/api/named-query/editor/${operation}`,
      'webservice/NamedQueryController',
      `${operation}Draft`,
      {
        body: { required: true, content: { 'application/json': { schema: namedQueryBody } } },
      },
      {
        tags: ['NamedQuery'],
        summary: `${operation} an unsaved named query`,
        responses: { 200: namedQueryResponse, 400: namedQueryResponse },
      }
    ),
    csrf: true,
  })),
  apiRoute(
    'get',
    '/:branding/:portal/api/named-query/:name/description',
    'webservice/NamedQueryController',
    'describeSaved',
    { params: nameParam, query: assistanceQuery },
    {
      tags: ['NamedQuery'],
      summary: 'Describe the brand-effective saved named query',
      responses: { 200: namedQueryResponse },
    }
  ),
  // Report authors use their own feature's brand path rules for this saved read.
  apiRoute(
    'get',
    '/:branding/:portal/api/report-config/named-query/:name/description',
    'webservice/ReportController',
    'describeQuery',
    {
      params: nameParam,
      query: objectField({
        recordType: stringField(),
        stage: stringField(),
        property: stringField(),
        multivalue: stringField(),
      }),
    },
    {
      tags: ['NamedQuery'],
      operationId: 'describeReportNamedQuery',
      summary: 'Describe a brand-effective saved named query for report authoring',
      description:
        'Extends the saved-query description with separate display and CSV templateContexts. Optional property (lodash lookup syntax) and multivalue=true select an ephemeral report column. Scalar display recordTableMeta.val is undefined; CSV val is the selected value. Uses report-config authorization.',
      responses: { 200: namedQueryResponse },
    }
  ),
];

export const namedQueryApiRoutes = [
  ...namedQueryEditorRoutes,
  listNamedQueriesRoute,
  getNamedQueryCollectionsRoute,
  getNamedQueryRoute,
  createNamedQueryRoute,
  updateNamedQueryRoute,
  deleteNamedQueryRoute,
];
