import { recordTypeApiRoutes } from '../api-routes/groups/recordtypes';
import { dashboardConfigApiRoutes } from '../api-routes/groups/dashboard-config';
import { getAppConfigByIdRoute } from '../api-routes/groups/appconfig';
import { listEntriesRoute, getEntryRoute, getBundleRoute } from '../api-routes/groups/translation';
import { formApiRoutes } from '../api-routes/groups/forms';
const browserReads = [
  ['/record/type', 'RecordController', 'getAllTypes'],
  ['/record/type/:recordType', 'RecordController', 'getType'],
  ['/record/wfSteps/:recordType', 'RecordController', 'getWorkflowSteps'],
  ['/dashboard/type', 'RecordController', 'getAllDashboardTypes'],
  ['/dashboard/type/:dashboardType', 'RecordController', 'getDashboardType'],
  ['/dashboard/view/:dashboardView', 'RecordController', 'getDashboardView'],
  ['/dashboard/settings/workflow/:recordType', 'RecordController', 'getDashboardWorkflowSettings'],
  ['/dashboard/settings/view/:dashboardView', 'RecordController', 'getDashboardViewSettings'],
  ['/workspaces/types', 'WorkspaceTypesController', 'get'],
  ['/workspaces/types/:name', 'WorkspaceTypesController', 'getOne'],
  ['/locales', 'TranslationController', 'getLanguages'],
  ['/locales/:lng/translation.json', 'TranslationController', 'getNamespace'],
  ['/locales/:lng/:ns.json', 'TranslationController', 'getNamespace'],
  ['/app/i18n/entries', 'TranslationController', 'listEntriesApp'],
  ['/app/i18n/bundles/:locale/:namespace', 'TranslationController', 'getBundleApp'],
] as const;

const dashboardReads = dashboardConfigApiRoutes.filter(route => route.method === 'get');
export const metadataReadRoutes = [
  ...browserReads.map(([path, controller, action]) => ({
    method: 'get' as const,
    path: '/:branding/:portal' + path,
    controller,
    action,
  })),
  ...dashboardReads,
  ...dashboardReads
    .filter(route => route.action !== 'retiredOperation' && route.action !== 'migrationPreflight')
    .map(route => ({
      ...route,
      path: route.path.replace('/api/', '/admin/'),
      controller: 'DashboardConfigController',
    })),
];

export const appConfigFormReadRoute = {
  method: 'get' as const,
  path: '/:branding/:portal/appconfig/form/:appConfigId',
  controller: 'AppConfigController',
  action: 'getAppConfigForm',
};

export const configurationReadRoutes = [
  getAppConfigByIdRoute,
  listEntriesRoute,
  getEntryRoute,
  getBundleRoute,
  ...formApiRoutes,
];

export const formDeliveryRoutes = ['/record/form/:name', '/record/form/:name/:oid'].map(path => ({
  method: 'get' as const,
  path: '/:branding/:portal' + path,
  controller: 'RecordController',
  action: 'getForm',
}));

/** FM-002's complete FM-023 selection, derived from the executable declarations. */
export const referenceReadDeclarations = [
  ...recordTypeApiRoutes,
  ...metadataReadRoutes,
  ...configurationReadRoutes,
  ...formDeliveryRoutes,
  appConfigFormReadRoute,
];
