import { apiRoute } from '../route-factory';
import { anyField, apiErrorResponseSchema, arrayField, genericObjectSchema, listApiResponseSchema, namedQueryResponseRecordSchema, nonEmptyStringField, objectField, patternStringField, responseField, stringField } from '../schemas/common';
import { z } from '../zod-openapi';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');
const reportConfigBody = objectField(
  {
    // Constraints below mirror ReportsService.validateMutableConfig; create/update/preview
    // all run that validator, so the request contract must match it exactly.
    name: patternStringField('^[A-Za-z0-9_-]+$', 'URL-safe report name'),
    title: nonEmptyStringField(),
    // Only 'database' is accepted on create/update/preview (403 otherwise).
    reportSource: z.enum(['database']).openapi({ description: 'Report data source (only database reports are user-editable)' }),
    // A named query is mandatory for database reports and must reference an existing one.
    databaseQuery: objectField({ queryName: nonEmptyStringField('Existing named query name') }, ['queryName']),
    solrQuery: objectField({ baseQuery: nonEmptyStringField(), searchCore: nonEmptyStringField() }).nullable(),
    filter: arrayField(objectField({}, [], 'Filter object', true)),
    // Each column requires a non-empty label and property (validator rejects empties).
    columns: arrayField(objectField({ label: nonEmptyStringField(), property: nonEmptyStringField() }, ['label', 'property'], 'Column object', true)),
  },
  ['name', 'title', 'reportSource', 'databaseQuery'],
  'Report configuration payload'
);
const reportConfigRequestBody = { required: true, content: { 'application/json': { schema: reportConfigBody } } };
const reportConfigResponse = responseField(anyField('Report configuration response'), 'Report configuration response');
const reportConfigListResponse = responseField(arrayField(genericObjectSchema), 'Report configuration list');
const reportConfigParams = objectField({ name: patternStringField('^[A-Za-z0-9_-]+$', 'Report name') }, ['name']);

export const executeNamedQueryRoute = apiRoute(
  'get',
  '/:branding/:portal/api/report/namedQuery',
  'webservice/ReportController',
  'executeNamedQuery',
  {
    query: objectField({ queryName: patternStringField('^[A-Za-z][A-Za-z0-9_/-]+$'), start: stringField(), rows: stringField() }, ['queryName']),
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
    responses: { 200: reportConfigListResponse, 500: internalServerErrorResponse },
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
    responses: { 201: reportConfigResponse, 400: badRequestResponse, 409: responseField(apiErrorResponseSchema, 'Conflict'), 500: internalServerErrorResponse },
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
