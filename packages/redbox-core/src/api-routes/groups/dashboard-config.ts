import { apiRoute } from '../route-factory';
import { anyField, nonEmptyStringField, objectField, patternStringField, responseField, stringField } from '../schemas/common';

const dashboardConfigResponse = responseField(
  objectField({ data: anyField('Dashboard configuration data') }, ['data'], 'Dashboard configuration response', true),
  'Dashboard configuration response'
);

const dashboardConfigBody = objectField({}, [], 'Dashboard configuration payload', true);

const workflowStateDashboardConfigBody = objectField(
  {
    dashboardType: nonEmptyStringField('Dashboard type name'),
    tableConfig: objectField({}, [], 'Dashboard table configuration', true),
  },
  ['dashboardType'],
  'Workflow state dashboard configuration',
  false
);

const dashboardConfigDefaultsQuery = objectField({
  recordType: patternStringField('^[A-Za-z0-9_-]+$', 'Record type name'),
  workflowStage: patternStringField('^[A-Za-z0-9_-]+$', 'Workflow stage name'),
  viewName: patternStringField('^[A-Za-z0-9_-]+$', 'Dashboard view name'),
  stepName: patternStringField('^[A-Za-z0-9_-]+$', 'Dashboard view step name'),
  dashboardType: patternStringField('^[A-Za-z0-9_-]+$', 'Dashboard type name'),
});

const recordWorkflowParams = objectField(
  {
    recordType: patternStringField('^[A-Za-z0-9_-]+$', 'Record type name'),
    workflowStage: patternStringField('^[A-Za-z0-9_-]+$', 'Workflow stage name'),
  },
  ['recordType', 'workflowStage']
);

const dashboardViewStepParams = objectField(
  {
    viewName: patternStringField('^[A-Za-z0-9_-]+$', 'Dashboard view name'),
    stepName: patternStringField('^[A-Za-z0-9_-]+$', 'Dashboard view step name'),
  },
  ['viewName', 'stepName']
);

const dashboardTypeParams = objectField(
  {
    dashboardType: patternStringField('^[A-Za-z0-9_-]+$', 'Dashboard type name'),
  },
  ['dashboardType']
);

export const getDashboardConfigInfoRoute = apiRoute(
  'get',
  '/:branding/:portal/api/dashboard-config/info',
  'webservice/DashboardConfigController',
  'getConfigInfo',
  {},
  {
    tags: ['DashboardConfig'],
    summary: 'Get dashboard configuration info',
    responses: { 200: dashboardConfigResponse },
  }
);

export const getDashboardConfigDefaultsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/dashboard-config/defaults',
  'webservice/DashboardConfigController',
  'getDefaults',
  { query: dashboardConfigDefaultsQuery },
  {
    tags: ['DashboardConfig'],
    summary: 'Get dashboard configuration defaults',
    responses: { 200: dashboardConfigResponse },
  }
);

export const getDashboardConfigOverridesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/dashboard-config/overrides',
  'webservice/DashboardConfigController',
  'getOverrides',
  {},
  {
    tags: ['DashboardConfig'],
    summary: 'Get dashboard configuration overrides',
    responses: { 200: dashboardConfigResponse },
  }
);

export const saveDashboardConfigOverridesRoute = apiRoute(
  'put',
  '/:branding/:portal/api/dashboard-config/overrides',
  'webservice/DashboardConfigController',
  'saveOverrides',
  {
    body: { required: true, content: { 'application/json': { schema: dashboardConfigBody } } },
  },
  {
    tags: ['DashboardConfig'],
    summary: 'Save dashboard configuration overrides',
    responses: { 200: dashboardConfigResponse },
  }
);

export const getMergedDashboardConfigRoute = apiRoute(
  'get',
  '/:branding/:portal/api/dashboard-config/merged/:recordType/:workflowStage',
  'webservice/DashboardConfigController',
  'getMergedConfig',
  { params: recordWorkflowParams },
  {
    tags: ['DashboardConfig'],
    summary: 'Get merged dashboard configuration',
    responses: { 200: dashboardConfigResponse },
  }
);

export const saveWorkflowStateDashboardConfigRoute = apiRoute(
  'put',
  '/:branding/:portal/api/dashboard-config/merged/:recordType/:workflowStage',
  'webservice/DashboardConfigController',
  'saveWorkflowStateDashboardConfig',
  {
    params: recordWorkflowParams,
    body: { required: true, content: { 'application/json': { schema: workflowStateDashboardConfigBody } } },
  },
  {
    tags: ['DashboardConfig'],
    summary: 'Save workflow state dashboard configuration',
    responses: { 200: dashboardConfigResponse },
  }
);

export const getMergedDashboardViewConfigRoute = apiRoute(
  'get',
  '/:branding/:portal/api/dashboard-config/merged-view/:viewName/:stepName',
  'webservice/DashboardConfigController',
  'getMergedViewConfig',
  { params: dashboardViewStepParams },
  {
    tags: ['DashboardConfig'],
    summary: 'Get merged dashboard view configuration',
    responses: { 200: dashboardConfigResponse },
  }
);

export const saveDashboardViewStepConfigRoute = apiRoute(
  'put',
  '/:branding/:portal/api/dashboard-config/merged-view/:viewName/:stepName',
  'webservice/DashboardConfigController',
  'saveDashboardViewStepConfig',
  {
    params: dashboardViewStepParams,
    body: { required: true, content: { 'application/json': { schema: workflowStateDashboardConfigBody } } },
  },
  {
    tags: ['DashboardConfig'],
    summary: 'Save dashboard view step configuration',
    responses: { 200: dashboardConfigResponse },
  }
);

export const getMergedDashboardTypeFormatRulesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/dashboard-config/merged-type/:dashboardType',
  'webservice/DashboardConfigController',
  'getMergedTypeFormatRules',
  { params: dashboardTypeParams },
  {
    tags: ['DashboardConfig'],
    summary: 'Get merged dashboard type format rules',
    responses: { 200: dashboardConfigResponse },
  }
);

export const dashboardConfigApiRoutes = [
  getDashboardConfigInfoRoute,
  getDashboardConfigDefaultsRoute,
  getDashboardConfigOverridesRoute,
  saveDashboardConfigOverridesRoute,
  getMergedDashboardConfigRoute,
  saveWorkflowStateDashboardConfigRoute,
  getMergedDashboardViewConfigRoute,
  saveDashboardViewStepConfigRoute,
  getMergedDashboardTypeFormatRulesRoute,
];
