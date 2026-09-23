export type SmokeAuthMode = 'anonymous' | 'admin';
export type SmokePageType = 'ejs' | 'angular';

export interface SmokeRoute {
  path: string;
  auth: SmokeAuthMode;
  type: SmokePageType;
  rootSelector?: string;
  selectorState?: 'visible' | 'attached';
  setupSelectors?: string[];
  requiredSelectors: string[];
  fallbackSelectors: string[];
  requiredAssetIncludes: string[];
  includeBaseAssets?: boolean;
}

export const baseAssetIncludes = [
  '/styles/theme.css',
  '/js/jquery.min.js',
  '/js/bootstrap.bundle.min.js',
  '/js/index.bundle.js',
];

export const smokeRoutes: SmokeRoute[] = [
  {
    path: '/default/rdmp/home',
    auth: 'anonymous',
    type: 'ejs',
    requiredSelectors: ['#main-title', '.main.container'],
    fallbackSelectors: [],
    requiredAssetIncludes: [],
  },
  {
    path: '/default/rdmp/user/login',
    auth: 'anonymous',
    type: 'angular',
    rootSelector: 'local-auth',
    selectorState: 'attached',
    setupSelectors: ['#adminLoginShow a[data-bs-target="#adminLogin"]'],
    requiredSelectors: ['#username', '#password', 'button[type="submit"]'],
    fallbackSelectors: ['local-auth img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: ['/angular/local-auth/browser/polyfills', '/angular/local-auth/browser/main'],
  },
  {
    path: '/default/rdmp/record/search',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'record-search',
    requiredSelectors: ['#basic-search-input', 'button:has-text("Search Plans")'],
    fallbackSelectors: ['record-search img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/record-search/browser/polyfills',
      '/angular/record-search/browser/main',
      '/angular/record-search/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/dashboard/rdmp',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'dashboard',
    requiredSelectors: ['#main-title', 'dashboard'],
    fallbackSelectors: ['dashboard img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/dashboard/browser/polyfills',
      '/angular/dashboard/browser/main',
      '/angular/dashboard/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/record/rdmp/edit',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'redbox-form',
    requiredSelectors: ['redbox-form .rb-form-shell', 'redbox-form h3:has-text("My first text block component!!!")', 'redbox-form label:has-text("Server sync test value")'],
    fallbackSelectors: ['redbox-form img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/form/browser/polyfills',
      '/angular/form/browser/main',
      '/angular/form/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin',
    auth: 'admin',
    type: 'ejs',
    requiredSelectors: ['.admin-main-content h1', '.admin-sidebar'],
    fallbackSelectors: [],
    requiredAssetIncludes: [],
  },
  {
    path: '/default/rdmp/admin/api-docs',
    auth: 'admin',
    type: 'ejs',
    rootSelector: '#redoc',
    requiredSelectors: ['#redoc'],
    fallbackSelectors: ['#redoc img[src$="/images/loading.svg"]'],
    includeBaseAssets: false,
    requiredAssetIncludes: [
      '/default/default/js/redoc.standalone.js',
      '/default/default/js/admin-api-docs-bootstrap.js',
      '/default/default/js/admin-api-docs-init.js',
      '/admin/api-docs/openapi.json',
    ],
  },
  {
    path: '/default/rdmp/admin/reports',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'report-config',
    selectorState: 'attached',
    requiredSelectors: ['.admin-main-content h1', 'report-config'],
    fallbackSelectors: ['report-config img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/report-config/browser/polyfills',
      '/angular/report-config/browser/main',
      '/angular/report-config/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/export',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'export',
    requiredSelectors: ['export input#after', 'export button.dropdown-toggle'],
    fallbackSelectors: ['export img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/export/browser/polyfills',
      '/angular/export/browser/main',
      '/angular/export/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/report/rdmpRecords',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'report',
    requiredSelectors: ['report', 'table'],
    fallbackSelectors: ['report img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/report/browser/polyfills',
      '/angular/report/browser/main',
      '/angular/report/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/users',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'manage-users',
    requiredSelectors: ['#manage-users-search', 'manage-users table', 'button:has-text("Add a new local user")'],
    fallbackSelectors: ['manage-users img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/manage-users/browser/polyfills',
      '/angular/manage-users/browser/main',
      '/angular/manage-users/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/roles',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'manage-roles',
    requiredSelectors: ['manage-roles table', '#role-Admin', 'input[aria-label="Search for name"]'],
    fallbackSelectors: ['manage-roles img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/manage-roles/browser/polyfills',
      '/angular/manage-roles/browser/main',
      '/angular/manage-roles/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/vocabulary/manager',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'admin-vocabulary',
    requiredSelectors: ['admin-vocabulary'],
    fallbackSelectors: ['admin-vocabulary img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/admin-vocabulary/browser/polyfills',
      '/angular/admin-vocabulary/browser/main',
      '/angular/admin-vocabulary/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/integrations/figshare/vocabularies',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'admin-figshare-vocabulary',
    requiredSelectors: ['admin-figshare-vocabulary', 'h1'],
    fallbackSelectors: ['admin-figshare-vocabulary img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/admin-figshare-vocabulary/browser/polyfills',
      '/angular/admin-figshare-vocabulary/browser/main',
      '/angular/admin-figshare-vocabulary/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/dashboard-config',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'dashboard-config-editor',
    requiredSelectors: ['dashboard-config-editor input[aria-label="Filter dashboard targets"]', 'dashboard-config-editor button[aria-label="Create a new dashboard type"]'],
    fallbackSelectors: ['dashboard-config-editor img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/dashboard-config-editor/browser/polyfills',
      '/angular/dashboard-config-editor/browser/main',
      '/angular/dashboard-config-editor/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/named-query',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'named-query-editor',
    requiredSelectors: ['#named-query-search', 'named-query-editor button:has-text("Create named query")'],
    fallbackSelectors: ['named-query-editor img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/named-query-editor/browser/polyfills',
      '/angular/named-query-editor/browser/main',
      '/angular/named-query-editor/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/record/viewAudit/e2e-playwright-audit',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'record-audit',
    requiredSelectors: ['record-audit', 'table'],
    fallbackSelectors: ['record-audit img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/record-audit/browser/polyfills',
      '/angular/record-audit/browser/main',
      '/angular/record-audit/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/appconfig/edit/systemMessage',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'app-config',
    requiredSelectors: ['app-config'],
    fallbackSelectors: ['app-config img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/app-config/browser/polyfills',
      '/angular/app-config/browser/main',
      '/angular/app-config/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/branding',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'branding-admin-root',
    requiredSelectors: ['branding-admin-root'],
    fallbackSelectors: ['branding-admin-root img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/branding/browser/polyfills',
      '/angular/branding/browser/main',
      '/angular/branding/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/translation',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'app-root',
    requiredSelectors: ['app-root'],
    fallbackSelectors: ['app-root img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/translation/browser/polyfills',
      '/angular/translation/browser/main',
      '/angular/translation/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/deletedRecords',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'deleted-records',
    requiredSelectors: ['deleted-records'],
    fallbackSelectors: ['deleted-records img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/deleted-records/browser/polyfills',
      '/angular/deleted-records/browser/main',
      '/angular/deleted-records/browser/styles',
    ],
  },
  {
    path: '/default/rdmp/admin/harvest-runs',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'harvest-runs',
    requiredSelectors: ['harvest-runs .hr-panel'],
    fallbackSelectors: ['harvest-runs img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/harvest-runs/browser/polyfills',
      '/angular/harvest-runs/browser/main',
      '/angular/harvest-runs/browser/styles',
    ],
  },
];
