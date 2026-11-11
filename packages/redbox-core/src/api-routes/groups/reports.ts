import { namedQueryExecutionResultSchema } from '../schemas/named-query';
import { apiRoute } from '../route-factory';
import {
  anyField,
  booleanField,
  numberField,
  apiErrorResponseSchema,
  arrayField,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');
const reportConfigBody = objectField(
  {
    name: stringField(),
    title: stringField(),
    reportSource: stringField(),
    databaseQuery: objectField({ queryName: stringField() }).nullable(),
    solrQuery: objectField({ baseQuery: stringField(), searchCore: stringField() }).nullable(),
    filter: arrayField(objectField({}, [], 'Filter object', true)).nullable(),
    columns: arrayField(
      objectField({ label: stringField(), property: stringField() }, [], 'Column object', true)
    ).nullable(),
  },
  ['name', 'title', 'reportSource'],
  'Report configuration payload',
  true
);
const reportConfigRequestBody = { required: true, content: { 'application/json': { schema: reportConfigBody } } };
const reportConfigResponse = responseField(anyField('Report configuration response'), 'Report configuration response');
const reportConfigParams = objectField({ name: stringField('Report name') }, ['name']);

export const executeNamedQueryRoute = apiRoute(
  'get',
  '/:branding/:portal/api/report/namedQuery',
  'webservice/ReportController',
  'executeNamedQuery',
  {
    query: objectField(
      { queryName: stringField(), start: stringField(), rows: stringField() },
      ['queryName'],
      'Named query name, pagination, and configured string filter parameters',
      stringField('Configured named-query parameter value')
    ),
  },
  {
    tags: ['Reports'],
    summary: 'Execute a saved named query',
    description:
      'Supply additional query parameters using the names configured in the named query queryParams or GraphQL consumer bindings. Each filter value must be a scalar string, including empty strings. Objects and arrays are rejected. GraphQL requires authenticated caller context and a lookup-compatible first-page adapter: start must be zero, rows are capped at 25, exact total is null and pagination.hasNextPage is authoritative. Partial data, GraphQL errors and scan/time/size failures are errors. This endpoint does not enable GraphQL reports or CSV.',
    responses: {
      200: responseField(namedQueryExecutionResultSchema, 'Source-specific named query results; GraphQL exact totals are unknown'),
      400: badRequestResponse,
      401: responseField(apiErrorResponseSchema, 'Authenticated GraphQL execution context required'),
      413: responseField(apiErrorResponseSchema, 'GraphQL byte bound exceeded'),
      422: responseField(apiErrorResponseSchema, 'Invalid or unsupported GraphQL execution/result'),
      503: responseField(apiErrorResponseSchema, 'GraphQL deadline exceeded'),
      500: internalServerErrorResponse,
    },
  }
);

export const reportsApiRoutes = [executeNamedQueryRoute];

export const listReportConfigsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/report-config',
  'webservice/ReportController',
  'listConfigs',
  {},
  {
    tags: ['Reports'],
    summary: 'List report configurations',
    responses: { 200: reportConfigResponse, 500: internalServerErrorResponse },
  }
);

export const getReportConfigRoute = apiRoute(
  'get',
  '/:branding/:portal/api/report-config/:name',
  'webservice/ReportController',
  'getConfig',
  { params: reportConfigParams },
  {
    tags: ['Reports'],
    summary: 'Get report configuration',
    responses: { 200: reportConfigResponse, 400: badRequestResponse, 500: internalServerErrorResponse },
  }
);

export const createReportConfigRoute = apiRoute(
  'post',
  '/:branding/:portal/api/report-config',
  'webservice/ReportController',
  'createConfig',
  { body: reportConfigRequestBody },
  {
    tags: ['Reports'],
    summary: 'Create report configuration',
    responses: { 201: reportConfigResponse, 400: badRequestResponse, 500: internalServerErrorResponse },
  }
);

export const updateReportConfigRoute = apiRoute(
  'put',
  '/:branding/:portal/api/report-config/:name',
  'webservice/ReportController',
  'updateConfig',
  { params: reportConfigParams, body: reportConfigRequestBody },
  {
    tags: ['Reports'],
    summary: 'Update report configuration',
    responses: { 200: reportConfigResponse, 400: badRequestResponse, 500: internalServerErrorResponse },
  }
);

export const deleteReportConfigRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/report-config/:name',
  'webservice/ReportController',
  'deleteConfig',
  { params: reportConfigParams },
  {
    tags: ['Reports'],
    summary: 'Delete report configuration',
    responses: { 200: reportConfigResponse, 400: badRequestResponse, 500: internalServerErrorResponse },
  }
);

export const previewReportConfigRoute = {
  ...apiRoute(
    'post',
    '/:branding/:portal/api/report-config/preview',
    'webservice/ReportController',
    'previewConfig',
    { body: reportConfigRequestBody },
    {
      tags: ['Reports'],
      summary: 'Preview report configuration',
      description:
        'Executes the unsaved database report using its brand-effective saved query. Retains total, pageNum, recordsPerPage, records and success; adds valid, diagnostics, renderedRows (cells with untrustedDisplayHtml and export text), truncated, truncationReasons, deadlineEnforced and server-owned limits. At most 100 rows and 524288 response bytes. Bind untrustedDisplayHtml through Angular [innerHTML] exactly like the live report, without any trust bypass. User/custom collections, related filters and relation expansion retain legacy execution with deadlineEnforced:false; rendering and response limits still apply. Export samples use actual CSV value casts after formula protection and before quoting; CSV templates receive native values.',
      responses: {
        200: reportConfigResponse,
        400: badRequestResponse,
        403: badRequestResponse,
        408: badRequestResponse,
        413: badRequestResponse,
        500: internalServerErrorResponse,
      },
    }
  ),
  csrf: true,
};

export const validateReportConfigRoute = {
  ...apiRoute(
    'post',
    '/:branding/:portal/api/report-config/validate',
    'webservice/ReportController',
    'validateConfig',
    { body: { required: true, content: { 'application/json': { schema: anyField('Unsaved report configuration') } } } },
    {
      tags: ['Reports'],
      summary: 'Validate report bindings, columns and templates without executing or saving',
      description:
        'Uses current brand report-config roles, without requiring named-query administration. Requires CSRF and an unsaved report JSON body. Guidance is advisory: unknown bindings, output fields and template references return warnings without rewriting edits. Structural errors return valid:false and diagnostics at HTTP 200. Date database.fromProperty/toProperty values are query parameter keys, not stored record paths. No execution or persistence; responses are no-store. API v1 returns the DTO; v2 wraps data/meta.',
      responses: {
        200: reportConfigResponse,
        400: badRequestResponse,
        403: badRequestResponse,
        413: badRequestResponse,
      },
    }
  ),
  csrf: true,
};

reportsApiRoutes.push(
  listReportConfigsRoute,
  previewReportConfigRoute,
  validateReportConfigRoute,
  getReportConfigRoute,
  createReportConfigRoute,
  updateReportConfigRoute,
  deleteReportConfigRoute
);

// Session report routes retain CSRF protection and the existing Librarians authorization rules.
const reportSortQuery = objectField(
  {
    name: stringField('Report name'),
    start: stringField(),
    rows: stringField(),
    sortField: anyField(
      'Column property from getReport with sortable=true; unsupported values retain default ordering'
    ),
    sortDirection: anyField('asc or desc; invalid values retain default ordering'),
  },
  ['name'],
  'Report filters, pagination and optional server-side sort',
  anyField('Configured filter value')
);

const reportViewResponse = objectField(
  {
    name: stringField(),
    title: stringField(),
    reportSource: stringField('database or solr'),
    databaseQuery: objectField({ queryName: stringField() }, ['queryName']).nullable(),
    filter: arrayField(anyField()),
    columns: arrayField(
      objectField(
        { property: stringField(), label: stringField(), sortable: booleanField() },
        ['property', 'label', 'sortable'],
        'Report column',
        true
      )
    ),
  },
  ['name', 'title', 'reportSource', 'databaseQuery', 'filter', 'columns']
);
const resultResponse = objectField(
  {
    records: arrayField(anyField()),
    total: numberField(),
    pageNum: numberField(),
    recordsPerPage: numberField(),
    success: booleanField(),
  },
  ['records', 'total', 'pageNum', 'recordsPerPage', 'success']
);

reportsApiRoutes.push(
  {
    ...apiRoute(
      'get',
      '/:branding/:portal/admin/getReport',
      'ReportController',
      'get',
      { query: objectField({ name: stringField() }, ['name']) },
      {
        tags: ['Reports'],
        summary: 'Get report viewer metadata',
        description:
          'Requires an authenticated session with report access (Librarians or administrators). Exposes source type, named-query name and column sort capabilities. Query bodies are omitted.',
        responses: { 200: responseField(reportViewResponse, 'Safe report metadata') },
      }
    ),
    csrf: true,
  },
  {
    ...apiRoute(
      'get',
      '/:branding/:portal/admin/getReportResults',
      'ReportController',
      'getResults',
      { query: reportSortQuery },
      {
        tags: ['Reports'],
        summary: 'Get report results',
        description:
          'Requires report access. Applies a validated sortField and sortDirection before pagination for database and Solr reports. Unsupported columns or malformed sort input retain the existing default order.',
        responses: { 200: responseField(resultResponse, 'Report page') },
      }
    ),
    csrf: true,
  },
  {
    ...apiRoute(
      'get',
      '/:branding/:portal/admin/downloadReportCSV',
      'ReportController',
      'downloadCSV',
      { query: reportSortQuery },
      {
        tags: ['Reports'],
        summary: 'Download sorted report CSV',
        description:
          'Requires report access. Accepts the same filters and validated sort as report results, exporting all matching rows in that order.',
        responses: { 200: { description: 'CSV report', content: { 'text/csv': { schema: stringField() } } } },
      }
    ),
    csrf: true,
  }
);
