import { recordApiRoutes } from '../api-routes/groups/records';
import { appConfigApiRoutes } from '../api-routes/groups/appconfig';
import { translationApiRoutes } from '../api-routes/groups/translation';
import { dashboardConfigApiRoutes } from '../api-routes/groups/dashboard-config';
import { namedQueryApiRoutes } from '../api-routes/groups/named-query';
import { reportsApiRoutes } from '../api-routes/groups/reports';

const actions = new Set([
  'create',
  'updateMeta',
  'updateObjectMeta',
  'deleteRecord',
  'restoreRecord',
  'destroyDeletedRecord',
  'transitionWorkflow',
  'addUserEdit',
  'removeUserEdit',
  'addUserView',
  'removeUserView',
  'addRoleEdit',
  'removeRoleEdit',
  'addRoleView',
  'removeRoleView',
]);
const browserRoutes = [
  ['post', '/recordmeta/:recordType', 'create'],
  ['put', '/recordmeta/:oid', 'update'],
  ['delete', '/record/delete/:oid', 'delete'],
  ['put', '/record/delete/:oid', 'restoreRecord'],
  ['delete', '/record/destroy/:oid', 'destroyDeletedRecord'],
  ['post', '/record/workflow/step/:targetStep/:oid', 'stepTo'],
] as const;
export const recordMutationRoutes = [
  ...recordApiRoutes.filter(route => actions.has(route.action)),
  ...browserRoutes.map(([method, path, action]) => ({
    method,
    path: '/:branding/:portal' + path,
    controller: 'RecordController',
    action,
  })),
];

const dashboardWrites = dashboardConfigApiRoutes.filter(route => route.method !== 'get');
export const configurationWriteRoutes = [
  ...appConfigApiRoutes.filter(route => route.method !== 'get'),
  ...translationApiRoutes.filter(route => route.method !== 'get'),
  ...dashboardWrites,
  ...dashboardWrites
    .filter(route => route.action !== 'retiredOperation')
    .map(route => ({
      ...route,
      path: route.path.replace('/api/', '/admin/'),
      controller: 'DashboardConfigController',
    })),
  ...[
    ['/appconfig/form/:appConfigId', 'AppConfigController', 'saveAppConfig'],
    ['/app/i18n/entries/:locale/:namespace/:key*', 'TranslationController', 'setEntryApp'],
    ['/app/i18n/bundles/:locale/:namespace', 'TranslationController', 'setBundleApp'],
    ['/app/i18n/bundles/:locale/:namespace/enabled', 'webservice/TranslationController', 'updateBundleEnabled'],
  ].map(([path, controller, action]) => ({
    method: 'post' as const,
    path: '/:branding/:portal' + path,
    controller,
    action,
  })),
];

const reportWrites = reportsApiRoutes.filter(route =>
  ['createConfig', 'updateConfig', 'deleteConfig'].includes(route.action)
);
export const queryWriteRoutes = [
  ...namedQueryApiRoutes.filter(route => route.method !== 'get'),
  ...reportWrites,
  ...reportWrites.map(route => ({
    ...route,
    path: route.path.replace('/api/', '/admin/'),
    controller: 'ReportController',
  })),
];

export const harvestMutationRoutes = recordApiRoutes.filter(route =>
  ['harvest', 'legacyHarvest'].includes(route.action)
);

export const configuredActionRoutes = [
  {
    method: 'post' as const,
    path: '/:branding/:portal/action/:action',
    controller: 'ActionController',
    action: 'callService',
  },
];

export const mutationDeclarations = [
  ...configurationWriteRoutes,
  ...queryWriteRoutes,
  ...recordMutationRoutes,
  ...harvestMutationRoutes,
  ...configuredActionRoutes,
];
