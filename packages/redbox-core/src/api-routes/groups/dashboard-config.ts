import { apiRoute } from '../route-factory';
import { anyField, arrayField, booleanField, integerField, objectField, responseField, stringField } from '../schemas/common';

const controller = 'webservice/DashboardConfigController';
const tags = ['DashboardConfig'];

const targetField = objectField(
  {
    kind: stringField('"workflow" or "view"'),
    recordType: stringField('Record type name (workflow targets)'),
    stage: stringField('Workflow stage name (workflow targets)'),
    view: stringField('Dashboard view name (view targets)'),
    step: stringField('Dashboard view step name (view targets)'),
  },
  ['kind'],
  'Dashboard target: { kind: "workflow", recordType, stage } or { kind: "view", view, step }'
);

const settingsField = objectField(
  {
    searchable: booleanField('Show the search box (workflow stage dashboards)'),
    showStageTitle: booleanField('Show the stage title heading'),
    tableConfig: objectField(
      {
        rowConfig: arrayField(anyField('Column'), 'Columns, including templates and column sorting'),
        rowRulesConfig: arrayField(anyField('Rule set'), 'Named row action rule sets'),
        groupRowConfig: arrayField(anyField('Group row column'), 'Group row columns'),
        groupRowRulesConfig: arrayField(anyField('Rule set'), 'Named group row rule sets'),
        formatRules: objectField(
          {
            filterBy: anyField('Editable record filter'),
            queryFilters: anyField('Search filter fields keyed by record type'),
            sortBy: stringField('Overall sort used when no column declares a sort, e.g. "metaMetadata.lastSaveDate:-1"'),
            groupBy: stringField('"", "groupedByRelationships" or "groupedByRecordType"'),
            sortGroupBy: arrayField(anyField('Group level'), 'Group levels'),
          },
          [],
          'Filtering, sorting and grouping',
          true
        ),
      },
      ['rowConfig', 'rowRulesConfig', 'groupRowConfig', 'groupRowRulesConfig', 'formatRules'],
      'Table settings',
      true
    ),
  },
  ['searchable', 'showStageTitle', 'tableConfig'],
  'Complete, independent dashboard settings for one target',
  true
);

const copyGroupsField = arrayField(stringField('columnsAndActions | filtersAndSearch | grouping | all'), 'Settings groups to copy. Selected groups replace the destination values completely.');

const dataResponse = (description: string) =>
  responseField(objectField({ data: anyField(description) }, ['data'], description, true), description);

const errorsDescription =
  '400 invalid request or settings; 404 target not available in this brand; 409 stale revision/preview or warnings that must be acknowledged (findings in meta); 503 configuration not initialised or migration incomplete.';

const workflowParams = objectField({ recordType: stringField('Record type name'), stage: stringField('Workflow stage name') }, ['recordType', 'stage']);
const viewParams = objectField({ view: stringField('Dashboard view name'), step: stringField('Dashboard view step name') }, ['view', 'step']);

const saveBody = objectField(
  {
    expectedRevision: integerField('Brand configuration revision the settings were based on'),
    settings: settingsField,
    validationFingerprint: stringField('Fingerprint from a validation response; required when acknowledging warnings'),
    acknowledgedWarningIds: arrayField(stringField('Warning id'), 'Warnings the administrator reviewed'),
  },
  ['expectedRevision', 'settings'],
  'Replace one target\'s complete settings'
);

const copyBody = objectField(
  { source: targetField, destinations: arrayField(targetField, 'Destination targets'), groups: copyGroupsField },
  ['source', 'destinations', 'groups'],
  'Bulk copy request'
);

const applyBody = objectField(
  {
    source: targetField,
    destinations: arrayField(targetField, 'Destination targets'),
    groups: copyGroupsField,
    expectedRevision: integerField('Revision returned by the preview'),
    previewFingerprint: stringField('Fingerprint returned by the preview'),
    acknowledgedWarningIds: arrayField(stringField('Warning id'), 'Reviewed warnings'),
  },
  ['source', 'destinations', 'groups', 'expectedRevision', 'previewFingerprint'],
  'Apply a reviewed copy preview atomically'
);

const jsonBody = (schema: ReturnType<typeof objectField>) => ({ required: true, content: { 'application/json': { schema } } });

export const listDashboardConfigTargetsRoute = apiRoute('get', '/:branding/:portal/api/dashboard-config/targets', controller, 'listTargets', {}, {
  tags,
  summary: 'List dashboard targets',
  description: 'Workflow stages (including hidden stages, flagged) and dashboard-view steps that own independent dashboard settings in this brand.',
  responses: { 200: dataResponse('Targets and catalogue fingerprint') },
});

export const getWorkflowDashboardConfigRoute = apiRoute('get', '/:branding/:portal/api/dashboard-config/workflows/:recordType/:stage', controller, 'getWorkflowTarget', { params: workflowParams }, {
  tags,
  summary: 'Get workflow stage dashboard settings',
  description: `Complete settings and brand revision. ${errorsDescription}`,
  responses: { 200: dataResponse('{ target, settings, revision, schemaVersion, hidden }') },
});

export const saveWorkflowDashboardConfigRoute = apiRoute('put', '/:branding/:portal/api/dashboard-config/workflows/:recordType/:stage', controller, 'saveWorkflowTarget', { params: workflowParams, body: jsonBody(saveBody) }, {
  tags,
  summary: 'Replace workflow stage dashboard settings',
  description: `Revision-checked replacement of the complete settings. ${errorsDescription}`,
  responses: { 200: dataResponse('Saved settings and new revision') },
});

export const getViewDashboardConfigRoute = apiRoute('get', '/:branding/:portal/api/dashboard-config/views/:view/:step', controller, 'getViewTarget', { params: viewParams }, {
  tags,
  summary: 'Get dashboard view step settings',
  description: `Complete settings and brand revision. ${errorsDescription}`,
  responses: { 200: dataResponse('{ target, settings, revision, schemaVersion, hidden }') },
});

export const saveViewDashboardConfigRoute = apiRoute('put', '/:branding/:portal/api/dashboard-config/views/:view/:step', controller, 'saveViewTarget', { params: viewParams, body: jsonBody(saveBody) }, {
  tags,
  summary: 'Replace dashboard view step settings',
  description: `Revision-checked replacement of the complete settings. ${errorsDescription}`,
  responses: { 200: dataResponse('Saved settings and new revision') },
});

export const validateDashboardConfigRoute = apiRoute('post', '/:branding/:portal/api/dashboard-config/validate', controller, 'validateSettings', {
  body: jsonBody(objectField({ target: targetField, expectedRevision: integerField('Base revision'), settings: settingsField }, ['target', 'expectedRevision', 'settings'], 'Proposed settings')),
}, {
  tags,
  summary: 'Validate proposed dashboard settings',
  description: `Read-only. Returns errors, warnings and a validation fingerprint used to acknowledge warnings on save. ${errorsDescription}`,
  responses: { 200: dataResponse('{ target, expectedRevision, errors, warnings, validationFingerprint }') },
});

export const previewDashboardConfigCopyRoute = apiRoute('post', '/:branding/:portal/api/dashboard-config/copy/preview', controller, 'previewCopy', { body: jsonBody(copyBody) }, {
  tags,
  summary: 'Preview copying saved settings to other targets',
  description: `Read-only. Calculates the resulting settings for every destination, readable differences and findings. ${errorsDescription}`,
  responses: { 200: dataResponse('{ expectedRevision, previewFingerprint, source, destinations, groups, changes, errors, warnings }') },
});

export const applyDashboardConfigCopyRoute = apiRoute('post', '/:branding/:portal/api/dashboard-config/copy/apply', controller, 'applyCopy', { body: jsonBody(applyBody) }, {
  tags,
  summary: 'Apply a reviewed copy',
  description: `Recomputes the preview and updates every destination in one atomic write, or none. ${errorsDescription}`,
  responses: { 200: dataResponse('{ updated, revision, destinations }') },
});

export const getWorkflowDashboardFieldsRoute = apiRoute('get', '/:branding/:portal/api/dashboard-config/workflows/:recordType/:stage/fields', controller, 'getWorkflowFields', { params: workflowParams }, {
  tags,
  summary: 'Record fields available to a workflow stage dashboard',
  description: 'Field paths from the stage\'s record JSON schema, as seen by the caller, plus ReDBox-maintained fields. `status` is complete, partial or unavailable; an unavailable schema never blocks editing.',
  responses: { 200: dataResponse('{ status, reason?, recordType, workflowStage, fields, openPrefixes }') },
});

export const getViewDashboardFieldsRoute = apiRoute('get', '/:branding/:portal/api/dashboard-config/views/:view/:step/fields', controller, 'getViewFields', { params: viewParams }, {
  tags,
  summary: 'Record fields available to a dashboard view step',
  description: 'As for workflow stages, using the view step\'s source record type and stage.',
  responses: { 200: dataResponse('{ status, reason?, recordType, workflowStage, fields, openPrefixes }') },
});

export const dashboardConfigMigrationPreflightRoute = apiRoute('get', '/:branding/:portal/api/dashboard-config/migration/preflight', controller, 'migrationPreflight', {}, {
  tags,
  summary: 'Legacy dashboard migration preflight',
  description: 'Read-only report for the brand in the route, showing how its v5.0.1 dashboard profiles, overrides and tables convert to independent settings. Includes the input fingerprint and findings that need resolution.',
  responses: { 200: dataResponse('{ reports }') },
});

const retiredDescription = 'Retired: dashboard profiles, defaults and overrides were replaced by independent per-target settings. Returns 410 with code "legacy-operation-retired".';
const retired = (method: 'get' | 'put' | 'post' | 'delete', path: string, summary: string, request = {}) =>
  apiRoute(method, `/:branding/:portal/api/dashboard-config${path}`, controller, 'retiredOperation', request, {
    tags,
    summary: `${summary} (retired)`,
    description: retiredDescription,
    responses: { 410: responseField(objectField({ errors: anyField('Retirement error') }, ['errors'], 'Operation retired', true), 'Operation retired') },
  });

export const retiredDashboardConfigRoutes = [
  retired('get', '/info', 'Get dashboard configuration info'),
  retired('get', '/defaults', 'Get dashboard configuration defaults'),
  retired('get', '/overrides', 'Get dashboard configuration overrides'),
  retired('put', '/overrides', 'Save dashboard configuration overrides'),
  retired('get', '/merged/:recordType/:workflowStage', 'Get merged dashboard configuration'),
  retired('put', '/merged/:recordType/:workflowStage', 'Save workflow state dashboard configuration'),
  retired('get', '/merged-view/:viewName/:stepName', 'Get merged dashboard view configuration'),
  retired('put', '/merged-view/:viewName/:stepName', 'Save dashboard view step configuration'),
  retired('get', '/merged-type/:dashboardType', 'Get merged dashboard type format rules'),
];

export const dashboardConfigApiRoutes = [
  listDashboardConfigTargetsRoute,
  getWorkflowDashboardConfigRoute,
  saveWorkflowDashboardConfigRoute,
  getViewDashboardConfigRoute,
  saveViewDashboardConfigRoute,
  validateDashboardConfigRoute,
  previewDashboardConfigCopyRoute,
  applyDashboardConfigCopyRoute,
  getWorkflowDashboardFieldsRoute,
  getViewDashboardFieldsRoute,
  dashboardConfigMigrationPreflightRoute,
  ...retiredDashboardConfigRoutes,
];
