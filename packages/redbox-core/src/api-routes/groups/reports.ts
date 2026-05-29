import { apiRoute } from '../route-factory';
import { anyField, apiErrorResponseSchema, arrayField, listApiResponseSchema, namedQueryResponseRecordSchema, objectField, responseField, stringField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');
const reportConfigBody = objectField(
  {
    name: stringField(),
    title: stringField(),
    reportSource: stringField(),
    databaseQuery: objectField({ queryName: stringField() }),
    solrQuery: objectField({ baseQuery: stringField(), searchCore: stringField() }),
    filter: arrayField(objectField({}, [], 'Filter object', true)),
    columns: arrayField(objectField({ label: stringField(), property: stringField() }, [], 'Column object', true)),
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
    query: objectField({ queryName: stringField(), start: stringField(), rows: stringField() }, ['queryName']),
  },
  {
    tags: ['Reports'],
    summary: 'Execute named query report',
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

export const previewReportConfigRoute = apiRoute(
  'post',
  '/:branding/:portal/api/report-config/preview',
  'webservice/ReportController',
  'previewConfig',
  { body: reportConfigRequestBody },
  {
    tags: ['Reports'],
    summary: 'Preview report configuration',
    responses: { 200: reportConfigResponse, 400: badRequestResponse, 500: internalServerErrorResponse },
  }
);

reportsApiRoutes.push(
  listReportConfigsRoute,
  previewReportConfigRoute,
  getReportConfigRoute,
  createReportConfigRoute,
  updateReportConfigRoute,
  deleteReportConfigRoute
);
