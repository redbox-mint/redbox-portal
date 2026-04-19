/**
 * Routes Config Interface
 * (sails.config.routes)
 * 
 * URL to controller/action mapping configuration.
 */

import { buildMergedApiRouteConfig } from '../api-routes';

export interface RouteTargetObject {
    controller?: string;
    action?: string;
    policy?: string | string[];
    csrf?: boolean;
    skipAssets?: boolean;
    locals?: Record<string, unknown>;
    view?: string;
}

export type RouteTarget = string | RouteTargetObject;

export interface RoutesConfig {
    [routePattern: string]: RouteTarget;
}

export const routes: RoutesConfig = {
    // CSRF Token
    'GET /csrfToken': { action: 'security/grant-csrf-token' },

    // Home routes
    '/': '/default/rdmp/home',
    '/:branding/:portal/home': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'homepage' }
    },
    '/:branding/:portal/researcher/home': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'researcher/home' }
    },

    // Record view routes
    '/:branding/:portal/record/view/:oid': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'record/view' }
    },
    '/:branding/:portal/record/search': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'record/search' }
    },
    '/:branding/:portal/record/view-orig/:oid': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'record/view-orig' }
    },

    // Branding/styling routes
    'get /:branding/:portal/styles/theme.css': {
        controller: 'BrandingController',
        action: 'renderCss'
    },
    'get /:branding/:portal/preview/:token([a-z0-9]+).css': {
        controller: 'BrandingController',
        action: 'renderPreviewCss',
        skipAssets: false
    },
    'get /:branding/:portal/preview/:token.css': {
        controller: 'BrandingController',
        action: 'renderPreviewCss',
        skipAssets: false
    },
    'post /:branding/:portal/preview': {
        controller: 'BrandingController',
        action: 'createPreview'
    },
    '/:branding/:portal/images/logo': {
        controller: 'BrandingController',
        action: 'renderImage'
    },

    // Admin routes
    '/:branding/:portal/admin': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'admin/home' }
    },
    '/:branding/:portal/admin/translation': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'admin/translation' }
    },
    '/:branding/:portal/admin/roles': {
        controller: 'AdminController',
        action: 'rolesIndex',
        skipAssets: true
    },
    '/:branding/:portal/admin/users': {
        controller: 'AdminController',
        action: 'usersIndex',
        skipAssets: true
    },
    '/:branding/:portal/admin/supportAgreement': {
        controller: 'AdminController',
        action: 'supportAgreementIndex',
        skipAssets: true
    },
    'get /:branding/:portal/admin/vocabulary/manager': {
        controller: 'VocabularyController',
        action: 'manager'
    },
    'get /:branding/:portal/admin/vocabulary': {
        controller: 'VocabularyController',
        action: 'list'
    },
    'post /:branding/:portal/admin/vocabulary/import': {
        controller: 'VocabularyController',
        action: 'import'
    },
    'get /:branding/:portal/admin/vocabulary/:id': {
        controller: 'VocabularyController',
        action: 'get'
    },
    'post /:branding/:portal/admin/vocabulary': {
        controller: 'VocabularyController',
        action: 'create'
    },
    'put /:branding/:portal/admin/vocabulary/:id': {
        controller: 'VocabularyController',
        action: 'update'
    },
    'delete /:branding/:portal/admin/vocabulary/:id': {
        controller: 'VocabularyController',
        action: 'delete'
    },
    'post /:branding/:portal/admin/vocabulary/:id/sync': {
        controller: 'VocabularyController',
        action: 'sync'
    },

    // User routes
    '/:branding/:portal/user/profile': {
        controller: 'UserController',
        action: 'profile',
        skipAssets: true
    },

    // Other view routes
    '/:branding/:portal/availableServicesList': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'availableServicesList' }
    },
    '/:branding/:portal/workspaces/list': {
        controller: 'RecordController',
        action: 'listWorkspaces'
    },
    '/:branding/:portal/getAdvice': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'getAdvice' }
    },

    // Dynamic asset routes
    'get /dynamic/:asset': 'DynamicAssetController.get',
    'get /:branding/:portal/dynamic/:asset': 'DynamicAssetController.get',
    'get /:branding/:portal/dynamicAsset/formCompiledItems/:recordType/:oid?': 'DynamicAssetController.getFormCompiledItems',
    'get /:branding/:portal/dynamicAsset/formStructureValidations/:recordType/:oid?': 'DynamicAssetController.getFormStructureValidations',
    'get /:branding/:portal/dynamicAsset/formDataValidations/:recordType/:oid?': 'DynamicAssetController.getFormDataValidations',
    'get /:branding/:portal/dynamicAsset/formExpressions/:recordType/:oid?': 'DynamicAssetController.getFormExpressions',
    'get /:branding/:portal/dynamicAsset/adminReportTemplates/:reportName': 'DynamicAssetController.getAdminReportTemplates',
    'get /:branding/:portal/dynamicAsset/recordDashboardTemplates/:recordType/:workflowStage': 'DynamicAssetController.getRecordDashboardTemplates',

    // Auth routes
    'post /user/login_local': 'UserController.localLogin',
    'post /user/login_aaf': { controller: 'UserController', action: 'aafLogin', csrf: false },
    'get /user/login_oidc': { controller: 'UserController', action: 'openIdConnectLogin', csrf: false },
    'HEAD /user/begin_oidc': { policy: 'disallowedHeadRequestHandler' },
    'get /user/begin_oidc': { controller: 'UserController', action: 'beginOidc', csrf: false },
    'get /user/info': 'UserController.info',
    'get /:branding/:portal/user/info': 'UserController.info',
    'get /:branding/:portal/user/login': 'UserController.login',
    'get /:branding/:portal/user/logout': 'UserController.logout',
    'get /:branding/:portal/user/find': 'UserController.find',

    // App Branding routes
    'get /:branding/:portal/app/branding/config': { controller: 'BrandingAppController', action: 'config' },
    'post /:branding/:portal/app/branding/draft': { controller: 'BrandingAppController', action: 'draft' },
    'post /:branding/:portal/app/branding/preview': { controller: 'BrandingAppController', action: 'preview' },
    'post /:branding/:portal/app/branding/publish': { controller: 'BrandingAppController', action: 'publish' },
    'post /:branding/:portal/app/branding/logo': { controller: 'BrandingAppController', action: 'logo' },

    // Admin user management routes
    'get /:branding/:portal/admin/users/get': 'AdminController.getUsers',
    'post /:branding/:portal/admin/users/update': 'AdminController.updateUserDetails',
    'post /:branding/:portal/admin/users/genKey': 'AdminController.generateUserKey',
    'post /:branding/:portal/admin/users/revokeKey': 'AdminController.revokeUserKey',
    'post /:branding/:portal/admin/users/newUser': 'AdminController.addLocalUser',
    'get /:branding/:portal/admin/users/link/candidates': 'AdminController.searchLinkCandidates',
    'get /:branding/:portal/admin/users/:id/links': 'AdminController.getUserLinks',
    'get /:branding/:portal/admin/users/:id/audit': 'AdminController.getUserAudit',
    'post /:branding/:portal/admin/users/link': 'AdminController.linkAccounts',
    'post /:branding/:portal/admin/users/:id/disable': 'AdminController.disableUser',
    'post /:branding/:portal/admin/users/:id/enable': 'AdminController.enableUser',
    'get /:branding/:portal/admin/roles/get': 'AdminController.getBrandRoles',
    'post /:branding/:portal/admin/roles/user': 'AdminController.updateUserRoles',

    // Record routes
    'get /:branding/:portal/record/default/:name': 'RecordController.getMetaDefault',
    'get /:branding/:portal/record/metadata/:oid': 'RecordController.getMeta',
    'get /:branding/:portal/record/form/:name': 'RecordController.getForm',
    'get /:branding/:portal/record/form/:name/:oid': 'RecordController.getForm',
    'get /:branding/:portal/record/search/:type': 'RecordController.search',
    'get /:branding/:portal/record/type': 'RecordController.getAllTypes',
    'get /:branding/:portal/dashboard/type/:dashboardType': 'RecordController.getDashboardType',
    'get /:branding/:portal/dashboard/type': 'RecordController.getAllDashboardTypes',
    'get /:branding/:portal/record/type/:recordType': 'RecordController.getType',
    'get /:branding/:portal/record/:recordType/edit': 'RecordController.edit',
    'get /:branding/:portal/record/edit/:oid': 'RecordController.edit',
    'get /:branding/:portal/record/viewAudit/:oid': 'RecordAuditController.render',
    'get /:branding/:portal/record/finalise/:recordType/edit/:oid': {
        controller: 'RecordController',
        action: 'edit',
        locals: { 'localFormName': 'default-1.0-draft' }
    },
    'delete /:branding/:portal/record/delete/:oid': 'RecordController.delete',
    'put /:branding/:portal/record/delete/:oid': 'RecordController.restoreRecord',
    'delete /:branding/:portal/record/destroy/:oid': 'RecordController.destroyDeletedRecord',
    '/:branding/:portal/record/:oid/attach': { controller: 'RecordController', action: 'doAttachment', csrf: true },
    '/:branding/:portal/record/:oid/attach/:attachId': { controller: 'RecordController', action: 'doAttachment', csrf: true },
    '/:branding/:portal/companion/record/:oid/attach': { controller: 'RecordController', action: 'doAttachment', policy: 'companionAttachmentUploadAuth', csrf: false },
    '/:branding/:portal/companion/record/:oid/attach/:attachId': { controller: 'RecordController', action: 'doAttachment', policy: 'companionAttachmentUploadAuth', csrf: false },
    'get /:branding/:portal/record/:oid/datastream*': 'RecordController.getDataStream',
    'get /:branding/:portal/record/:oid/attachments': 'RecordController.getAttachments',
    'get /:branding/:portal/record/:oid/permissions': 'RecordController.getPermissions',
    'get /:branding/:portal/record/:oid/relatedRecords': 'RecordController.getRelatedRecords',
    'get /:branding/:portal/record/wfSteps/:recordType': 'RecordController.getWorkflowSteps',
    'post /:branding/:portal/recordmeta/:recordType': 'RecordController.create',
    'put /:branding/:portal/recordmeta/:oid': 'RecordController.update',
    'post /:branding/:portal/record/workflow/step/:targetStep/:oid': 'RecordController.stepTo',
    'get /:branding/:portal/dashboard/:recordType': 'RecordController.render',
    'get /:branding/:portal/listRecords': 'RecordController.getRecordList',
    'get /:branding/:portal/listDeletedRecords': 'RecordController.getDeletedRecordList',

    // Vocab routes
    'get /:branding/:portal/vocab/:vocabIdOrSlug': {
        controller: 'FormVocabularyController',
        action: 'get'
    },
    'get /:branding/:portal/vocab/:vocabIdOrSlug/entries': {
        controller: 'FormVocabularyController',
        action: 'entries'
    },
    'get /:branding/:portal/vocab/:vocabIdOrSlug/children': {
        controller: 'FormVocabularyController',
        action: 'children'
    },
    'get /:branding/:portal/query/vocab/:queryId': {
        controller: 'FormVocabularyController',
        action: 'getRecords'
    },
    'post /:branding/:portal/external/vocab/:provider': {
        controller: 'FormVocabularyController',
        action: 'externalEntries'
    },

    // Export routes
    'get /:branding/:portal/export': 'ExportController.index',
    'get /:branding/:portal/admin/export': 'ExportController.index',
    'get /:branding/:portal/export/record/download/:format': 'ExportController.downloadRecs',

    // Async routes
    'post /:branding/:portal/asynch': 'AsynchController.start',
    'delete /:branding/:portal/asynch': 'AsynchController.stop',
    'put /:branding/:portal/asynch': 'AsynchController.update',
    'get /:branding/:portal/asynch': 'AsynchController.progress',
    'get /:branding/:portal/asynch/subscribe/:roomId': 'AsynchController.subscribe',
    'delete /:branding/:portal/asynch/subscribe/:roomId': 'AsynchController.unsubscribe',

    // Report routes
    'get /:branding/:portal/admin/reports': 'ReportsController.render',
    'get /:branding/:portal/admin/report/:name': 'ReportController.render',
    'get /:branding/:portal/admin/getReport': 'ReportController.get',
    'get /:branding/:portal/admin/getReportResults': 'ReportController.getResults',
    'get /:branding/:portal/admin/downloadReportCSV': 'ReportController.downloadCSV',

    // API docs
    'get /:branding/:portal/api-docs.apib': 'BrandingController.renderApiB',
    'get /:branding/:portal/api-docs.json': 'BrandingController.renderSwaggerJSON',
    'get /:branding/:portal/api-docs.yaml': 'BrandingController.renderSwaggerYAML',

    // User key management
    'post /:branding/:portal/user/genKey': 'UserController.generateUserKey',
    'post /:branding/:portal/user/revokeKey': 'UserController.revokeUserKey',
    'post /:branding/:portal/user/update': 'UserController.update',

    // Action routes
    'post /:branding/:portal/action/:action': 'ActionController.callService',

    // App config routes
    'get /:branding/:portal/appconfig/form/:appConfigId': 'AppConfigController.getAppConfigForm',
    'post /:branding/:portal/appconfig/form/:appConfigId': 'AppConfigController.saveAppConfig',
    'get /:branding/:portal/admin/appconfig/edit/:appConfigId': {
        controller: 'AppConfigController',
        action: 'editAppConfig'
    },
    'get /:branding/:portal/admin/deletedRecords': 'RecordController.renderDeletedRecords',
    'get /:branding/:portal/admin/branding': {
        controller: 'RenderViewController',
        action: 'render',
        locals: { 'view': 'admin/branding' }
    },

    ...buildMergedApiRouteConfig(),

    // Translation routes
    'get /:branding/:portal/locales/:lng/:ns.json': { controller: 'TranslationController', action: 'getNamespace', csrf: false },
    'get /:branding/:portal/locales/:lng/translation.json': { controller: 'TranslationController', action: 'getNamespace', csrf: false },
    'get /:branding/:portal/locales': { controller: 'TranslationController', action: 'getLanguages', csrf: false },

    // Workspace routes
    'get /:branding/:portal/workspaces/types/:name': 'WorkspaceTypesController.getOne',
    'get /:branding/:portal/workspaces/types': 'WorkspaceTypesController.get',

    // App i18n routes (CSRF enabled)
    'get /:branding/:portal/app/i18n/entries': { controller: 'TranslationController', action: 'listEntriesApp' },
    'post /:branding/:portal/app/i18n/entries/:locale/:namespace/:key*': { controller: 'TranslationController', action: 'setEntryApp' },
    'get /:branding/:portal/app/i18n/bundles/:locale/:namespace': { controller: 'TranslationController', action: 'getBundleApp' },
    'post /:branding/:portal/app/i18n/bundles/:locale/:namespace': { controller: 'TranslationController', action: 'setBundleApp' },
    'post /:branding/:portal/app/i18n/bundles/:locale/:namespace/enabled': { controller: 'webservice/TranslationController', action: 'updateBundleEnabled' }
};
