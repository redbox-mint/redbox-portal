/**
 * Routes Config Interface
 * (sails.config.routes)
 * 
 * URL to controller/action mapping configuration.
 */

export interface RouteTargetObject {
    controller?: string;
    action?: string;
    policy?: string;
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

    // REST API routes - Records
    'post /:branding/:portal/api/records/metadata/:recordType': { controller: 'webservice/RecordController', action: 'create', csrf: false },
    'put /:branding/:portal/api/records/metadata/:oid': { controller: 'webservice/RecordController', action: 'updateMeta', csrf: false },
    'post /:branding/:portal/api/records/harvest/:recordType': { controller: 'webservice/RecordController', action: 'harvest', csrf: false },
    'post /:branding/:portal/api/mint/harvest/:recordType': { controller: 'webservice/RecordController', action: 'legacyHarvest', csrf: false },
    'put /:branding/:portal/api/records/objectmetadata/:oid': { controller: 'webservice/RecordController', action: 'updateObjectMeta', csrf: false },
    'get /:branding/:portal/api/records/metadata/:oid': { controller: 'webservice/RecordController', action: 'getMeta', csrf: false },
    'get /:branding/:portal/api/records/audit/:oid': { controller: 'webservice/RecordController', action: 'getRecordAudit', csrf: false },
    'get /:branding/:portal/api/records/list': { controller: 'webservice/RecordController', action: 'listRecords', csrf: false },
    'get /:branding/:portal/api/deletedrecords/list': { controller: 'webservice/RecordController', action: 'listDeletedRecords', csrf: false },
    'put /:branding/:portal/api/deletedrecords/:oid': { controller: 'webservice/RecordController', action: 'restoreRecord', csrf: false },
    'delete /:branding/:portal/api/deletedrecords/:oid': { controller: 'webservice/RecordController', action: 'destroyDeletedRecord', csrf: false },
    'get /:branding/:portal/api/records/objectmetadata/:oid': { controller: 'webservice/RecordController', action: 'getObjectMeta', csrf: false },
    'delete /:branding/:portal/api/records/metadata/:oid': { controller: 'webservice/RecordController', action: 'deleteRecord', csrf: false },

    // REST API routes - Permissions
    'post /:branding/:portal/api/records/permissions/edit/:oid': { controller: 'webservice/RecordController', action: 'addUserEdit', csrf: false },
    'delete /:branding/:portal/api/records/permissions/edit/:oid': { controller: 'webservice/RecordController', action: 'removeUserEdit', csrf: false },
    'post /:branding/:portal/api/records/permissions/view/:oid': { controller: 'webservice/RecordController', action: 'addUserView', csrf: false },
    'delete /:branding/:portal/api/records/permissions/view/:oid': { controller: 'webservice/RecordController', action: 'removeUserView', csrf: false },
    'post /:branding/:portal/api/records/permissions/editRole/:oid': { controller: 'webservice/RecordController', action: 'addRoleEdit', csrf: false },
    'delete /:branding/:portal/api/records/permissions/editRole/:oid': { controller: 'webservice/RecordController', action: 'removeRoleEdit', csrf: false },
    'post /:branding/:portal/api/records/permissions/viewRole/:oid': { controller: 'webservice/RecordController', action: 'addRoleView', csrf: false },
    'delete /:branding/:portal/api/records/permissions/viewRole/:oid': { controller: 'webservice/RecordController', action: 'removeRoleView', csrf: false },
    'get /:branding/:portal/api/records/permissions/:oid': { controller: 'webservice/RecordController', action: 'getPermissions', csrf: false },

    // REST API routes - Datastreams
    'post /:branding/:portal/api/records/datastreams/:oid': { controller: 'webservice/RecordController', action: 'addDataStreams', csrf: false },
    'get /:branding/:portal/api/records/datastreams/:oid/:datastreamId': { controller: 'webservice/RecordController', action: 'getDataStream', csrf: false },
    'get /:branding/:portal/api/records/datastreams/:oid': { controller: 'webservice/RecordController', action: 'listDatastreams', csrf: false },

    // REST API routes - Workflow
    'post /:branding/:portal/api/records/workflow/step/:targetStep/:oid': { controller: 'webservice/RecordController', action: 'transitionWorkflow', csrf: false },

    // REST API routes - Users
    'get /:branding/:portal/api/users': { controller: 'webservice/UserManagementController', action: 'listUsers', csrf: false },
    'get /:branding/:portal/api/users/find': { controller: 'webservice/UserManagementController', action: 'getUser', csrf: false },
    'get /:branding/:portal/api/users/get': { controller: 'webservice/UserManagementController', action: 'getUser', csrf: false },
    'put /:branding/:portal/api/users': { controller: 'webservice/UserManagementController', action: 'createUser', csrf: false },
    'post /:branding/:portal/api/users': { controller: 'webservice/UserManagementController', action: 'updateUser', csrf: false },
    'get /:branding/:portal/api/users/token/generate': { controller: 'webservice/UserManagementController', action: 'generateAPIToken', csrf: false },
    'get /:branding/:portal/api/users/token/revoke': { controller: 'webservice/UserManagementController', action: 'revokeAPIToken', csrf: false },

    // REST API routes - Roles
    'get /:branding/:portal/api/roles': { controller: 'webservice/UserManagementController', action: 'listSystemRoles', csrf: false },
    'post /:branding/:portal/api/roles/:roleName': { controller: 'webservice/UserManagementController', action: 'createSystemRole', csrf: false },

    // REST API routes - Search
    'get /:branding/:portal/api/search': { controller: 'webservice/SearchController', action: 'search', csrf: false },
    'get /:branding/:portal/api/search/index': { controller: 'webservice/SearchController', action: 'index', csrf: false },
    'get /:branding/:portal/api/search/indexAll': { controller: 'webservice/SearchController', action: 'indexAll', csrf: false },
    'get /:branding/:portal/api/search/removeAll': { controller: 'webservice/SearchController', action: 'removeAll', csrf: false },

    // REST API routes - Forms
    'get /:branding/:portal/api/forms/get': { controller: 'webservice/FormManagementController', action: 'getForm', csrf: false },
    'get /:branding/:portal/api/forms': { controller: 'webservice/FormManagementController', action: 'listForms', csrf: false },

    // REST API routes - Vocabulary
    'get /:branding/:portal/api/vocabulary': { controller: 'webservice/VocabularyController', action: 'list', csrf: false },
    'post /:branding/:portal/api/vocabulary/import': { controller: 'webservice/VocabularyController', action: 'import', csrf: false },
    'get /:branding/:portal/api/vocabulary/:id': { controller: 'webservice/VocabularyController', action: 'get', csrf: false },
    'post /:branding/:portal/api/vocabulary': { controller: 'webservice/VocabularyController', action: 'create', csrf: false },
    'put /:branding/:portal/api/vocabulary/:id': { controller: 'webservice/VocabularyController', action: 'update', csrf: false },
    'put /:branding/:portal/api/vocabulary/:id/reorder': { controller: 'webservice/VocabularyController', action: 'reorder', csrf: false },
    'delete /:branding/:portal/api/vocabulary/:id': { controller: 'webservice/VocabularyController', action: 'delete', csrf: false },
    'post /:branding/:portal/api/vocabulary/:id/sync': { controller: 'webservice/VocabularyController', action: 'sync', csrf: false },

    // REST API routes - Record Types
    'get /:branding/:portal/api/recordtypes/get': { controller: 'webservice/RecordTypeController', action: 'getRecordType', csrf: false },
    'get /:branding/:portal/api/recordtypes': { controller: 'webservice/RecordTypeController', action: 'listRecordTypes', csrf: false },

    // REST API routes - Admin
    'get /:branding/:portal/api/admin/refreshCachedResources': { controller: 'webservice/AdminController', action: 'refreshCachedResources', csrf: false },
    'post /:branding/:portal/api/admin/config/:configKey': { controller: 'webservice/AdminController', action: 'setAppConfig', csrf: false },
    'get /:branding/:portal/api/admin/config/:configKey': { controller: 'webservice/AdminController', action: 'getAppConfig', csrf: false },
    'get /:branding/:portal/api/admin/config': { controller: 'webservice/AdminController', action: 'getAppConfig', csrf: false },

    // REST API routes - Notifications
    'post /:branding/:portal/api/sendNotification': { controller: 'EmailController', action: 'sendNotification', csrf: false },

    // REST API routes - Reports
    'get /:branding/:portal/api/report/namedQuery': { controller: 'webservice/ReportController', action: 'executeNamedQuery', csrf: false },

    // REST API routes - Export
    'get /:branding/:portal/api/export/record/download/:format': { controller: 'webservice/ExportController', action: 'downloadRecs', csrf: false },

    // REST API routes - App Config
    'get /:branding/:portal/api/appconfig/:appConfigId': { controller: 'webservice/AppConfigController', action: 'getAppConfig', csrf: false },
    'post /:branding/:portal/api/appconfig/:appConfigId': { controller: 'webservice/AppConfigController', action: 'saveAppConfig', csrf: false },

    // REST API routes - Branding
    'post /:branding/:portal/api/branding/draft': { controller: 'webservice/BrandingController', action: 'draft', csrf: false },
    'post /:branding/:portal/api/branding/preview': { controller: 'webservice/BrandingController', action: 'preview', csrf: false },
    'post /:branding/:portal/api/branding/publish': { controller: 'webservice/BrandingController', action: 'publish', csrf: false },
    'post /:branding/:portal/api/branding/rollback/:versionId': { controller: 'webservice/BrandingController', action: 'rollback', csrf: false },
    'post /:branding/:portal/api/branding/logo': { controller: 'webservice/BrandingController', action: 'logo', csrf: false },
    'get /:branding/:portal/api/branding/history': { controller: 'webservice/BrandingController', action: 'history', csrf: false },

    // Translation routes
    'get /:branding/:portal/locales/:lng/:ns.json': { controller: 'TranslationController', action: 'getNamespace', csrf: false },
    'get /:branding/:portal/locales/:lng/translation.json': { controller: 'TranslationController', action: 'getNamespace', csrf: false },
    'get /:branding/:portal/locales': { controller: 'TranslationController', action: 'getLanguages', csrf: false },

    // Workspace routes
    'get /:branding/:portal/workspaces/types/:name': 'WorkspaceTypesController.getOne',
    'get /:branding/:portal/workspaces/types': 'WorkspaceTypesController.get',

    // REST API routes - i18n
    'get /:branding/:portal/api/i18n/entries': { controller: 'webservice/TranslationController', action: 'listEntries', csrf: false },
    'get /:branding/:portal/api/i18n/entries/:locale/:namespace/:key*': { controller: 'webservice/TranslationController', action: 'getEntry', csrf: false },
    'post /:branding/:portal/api/i18n/entries/:locale/:namespace/:key*': { controller: 'webservice/TranslationController', action: 'setEntry', csrf: false },
    'delete /:branding/:portal/api/i18n/entries/:locale/:namespace/:key*': { controller: 'webservice/TranslationController', action: 'deleteEntry', csrf: false },
    'get /:branding/:portal/api/i18n/bundles/:locale/:namespace': { controller: 'webservice/TranslationController', action: 'getBundle', csrf: false },
    'post /:branding/:portal/api/i18n/bundles/:locale/:namespace': { controller: 'webservice/TranslationController', action: 'setBundle', csrf: false },

    // App i18n routes (CSRF enabled)
    'get /:branding/:portal/app/i18n/entries': { controller: 'TranslationController', action: 'listEntriesApp' },
    'post /:branding/:portal/app/i18n/entries/:locale/:namespace/:key*': { controller: 'TranslationController', action: 'setEntryApp' },
    'get /:branding/:portal/app/i18n/bundles/:locale/:namespace': { controller: 'TranslationController', action: 'getBundleApp' },
    'post /:branding/:portal/app/i18n/bundles/:locale/:namespace': { controller: 'TranslationController', action: 'setBundleApp' },
    'post /:branding/:portal/app/i18n/bundles/:locale/:namespace/enabled': { controller: 'webservice/TranslationController', action: 'updateBundleEnabled' }
};
