export type SmokeAuthMode = 'anonymous' | 'admin';
export type SmokePageType = 'ejs' | 'angular';

export interface SmokeRoute {
  path: string;
  auth: SmokeAuthMode;
  type: SmokePageType;
  rootSelector?: string;
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
    requiredSelectors: ['#adminLoginShow', 'local-auth'],
    fallbackSelectors: ['local-auth img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/local-auth/browser/polyfills',
      '/angular/local-auth/browser/main'
    ]
  },
  {
    path: '/default/rdmp/record/search',
    auth: 'anonymous',
    type: 'angular',
    rootSelector: 'record-search',
    requiredSelectors: ['record-search', '#basic-search-input'],
    fallbackSelectors: ['#loading', 'record-search img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/record-search/browser/polyfills',
      '/angular/record-search/browser/main',
      '/angular/record-search/browser/styles'
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
    path: '/default/rdmp/admin/supportAgreement',
    auth: 'admin',
    type: 'ejs',
    requiredSelectors: ['#yearSelector', '.progress-bar'],
    fallbackSelectors: [],
    requiredAssetIncludes: []
  },
  {
    path: '/default/rdmp/admin/users',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'manage-users',
    requiredSelectors: ['manage-users', '#manage-users-search', 'manage-users table'],
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
    requiredSelectors: ['manage-roles', 'manage-roles table', 'manage-roles input[type="text"]'],
    fallbackSelectors: ['manage-roles img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/manage-roles/browser/polyfills',
      '/angular/manage-roles/browser/main',
      '/angular/manage-roles/browser/styles'
    ]
  },
  {
    path: '/default/rdmp/admin/vocabulary',
    auth: 'admin',
    type: 'angular',
    rootSelector: 'admin-vocabulary',
    requiredSelectors: ['admin-vocabulary', '#vocab-search', '.vocab-data-table'],
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
    requiredSelectors: ['app-config', 'formly-form', 'app-config button[type="submit"]'],
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
    requiredSelectors: ['branding-admin-root', '#logoUpload', 'branding-admin-root .btn.btn-primary'],
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
    requiredSelectors: ['app-root', '.translation-page-container', '.translation-entries-table'],
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
    requiredSelectors: ['deleted-records', 'record-table', 'deleted-records h1'],
    fallbackSelectors: ['deleted-records img[src$="/images/loading.svg"]'],
    requiredAssetIncludes: [
      '/angular/deleted-records/browser/polyfills',
      '/angular/deleted-records/browser/main',
      '/angular/deleted-records/browser/styles'
    ]
  }
];
