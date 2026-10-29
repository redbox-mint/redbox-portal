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
      description:
        'Uses named-query feature permissions and current brand/caller workflow access. Guidance is advisory editor state; selecting a target never changes query predicates. Responses are no-store.',
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
      description:
        'Returns precision/completeness and separate stored-record and mapping fields. Schema title becomes metadata.title for predicates and record.metadata.title for mappings. Partial or unavailable guidance leaves manual editing enabled; authorization denial never reveals a fallback tree.',
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
        description:
          'Accepts {definition, guidance?, parameters?}; guidance is ephemeral and parameters are used only by explicit preview. Requires named-query permission and CSRF. Validation/description do not execute or persist. Completed validation and preview refusals return 200 with valid:false and diagnostics. Preview executes real data, forcibly brand-scoped, with server-owned limits: 131072 input bytes, depth 24, 4000 nodes, 1024 mapping aliases, 256 template expressions, 100 sample rows, 1000 scan rows, 524288 response bytes and 5000 ms query/render budget. Mongo count/find receive remaining maxTimeMS. Inspect truncated/truncationReasons (rows/bytes). User/custom collections, related filters and relation expansion refuse draft preview with PREVIEW_DEADLINE_UNSUPPORTED; editing/saving remains supported. API v1 returns DTOs; v2 wraps data/meta. Responses are no-store.',
        responses: {
          200: namedQueryResponse,
          400: namedQueryResponse,
          403: namedQueryResponse,
          408: namedQueryResponse,
          413: namedQueryResponse,
        },
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
      description:
        'Uses named-query administration permission and the current brand-effective saved definition. Output mapping alias projectTitle appears at metadata.projectTitle in result fields. Direct lookups may retain known source types; template mappings generally produce strings and dynamic output remains unknown. Responses are no-store.',
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
