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
}

export const baseAssetIncludes = [
  '/styles/theme.css',
  '/js/jquery.min.js',
  '/js/bootstrap.bundle.min.js',
  '/js/index.bundle.js'
];

export const smokeRoutes: SmokeRoute[] = [
  {
    path: '/default/rdmp/home',
    auth: 'anonymous',
    type: 'ejs',
    requiredSelectors: ['#main-title', '.main.container'],
    fallbackSelectors: [],
    requiredAssetIncludes: []
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
    requiredAssetIncludes: [
      '/angular/local-auth/browser/polyfills',
      '/angular/local-auth/browser/main'
    ]
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
      '/angular/record-search/browser/styles'
    ]
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
      '/angular/dashboard/browser/styles'
    ]
  },
  {
    path: '/default/rdmp/record/rdmp/edit',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'redbox-form',
    requiredSelectors: ['redbox-form', 'redbox-form .rb-form-shell'],
    fallbackSelectors: ['redbox-form img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/form/browser/polyfills',
      '/angular/form/browser/main',
      '/angular/form/browser/styles'
    ]
  },
  {
    path: '/default/rdmp/admin',
    auth: 'admin',
    type: 'ejs',
    requiredSelectors: ['.admin-main-content h1', '.admin-sidebar'],
    fallbackSelectors: [],
    requiredAssetIncludes: []
  },
  {
    path: '/default/rdmp/admin/reports',
    auth: 'admin',
    type: 'ejs',
    requiredSelectors: ['.admin-main-content h1', '.admin-main-content ul li a'],
    fallbackSelectors: [],
    requiredAssetIncludes: []
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
      '/angular/manage-users/browser/styles'
    ]
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
      '/angular/manage-roles/browser/styles'
    ]
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
      '/angular/admin-vocabulary/browser/styles'
    ]
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
      '/angular/app-config/browser/styles'
    ]
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
      '/angular/branding/browser/styles'
    ]
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
      '/angular/translation/browser/styles'
    ]
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
      '/angular/deleted-records/browser/styles'
    ]
  }
];
