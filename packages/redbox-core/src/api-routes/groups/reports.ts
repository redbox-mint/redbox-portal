import { apiRoute } from '../route-factory';
import {
  anyField,
  apiErrorResponseSchema,
  arrayField,
  listApiResponseSchema,
  namedQueryResponseRecordSchema,
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
    summary: 'Execute named query report',
    description:
      'Supply additional query parameters using the names configured in the named query queryParams. Each filter value must be a scalar string, including empty strings. Objects and arrays are rejected.',
    responses: {
      200: responseField(listApiResponseSchema(namedQueryResponseRecordSchema), 'Named query results'),
      400: badRequestResponse,
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
      responses: { 200: reportConfigResponse, 400: badRequestResponse, 500: internalServerErrorResponse },
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
      responses: { 200: reportConfigResponse, 400: badRequestResponse },
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
