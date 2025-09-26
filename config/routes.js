/**
 * Route Mappings
 * (sails.config.routes)
 *
 * Your routes map URLs to views and controllers.
 *
 * If Sails receives a URL that doesn't match any of the routes below,
 * it will check for matching files (images, scripts, stylesheets, etc.)
 * in your assets directory.  e.g. `http://localhost:1337/images/foo.jpg`
 * might match an image file: `/assets/images/foo.jpg`
 *
 * Finally, if those don't match either, the default 404 handler is triggered.
 * See `api/responses/notFound.js` to adjust your app's 404 logic.
 *
 * Note: Sails doesn't ACTUALLY serve stuff from `assets`-- the default Gruntfile in Sails copies
 * flat files from `assets` to `.tmp/public`.  This allows you to do things like compile LESS or
 * CoffeeScript for the front-end.
 *
 * For more information on configuring custom routes, check out:
 * http://sailsjs.org/#!/documentation/concepts/Routes/RouteTargetSyntax.html
 */

module.exports.routes = {

  /***************************************************************************
   *                                                                          *
   * Make the view located at `views/homepage.ejs` (or `views/homepage.jade`, *
   * etc. depending on your default view engine) your home page.              *
   *                                                                          *
   * (Alternatively, remove this and add an `index.html` file in your         *
   * `assets` directory)                                                      *
   *                                                                          *
   ***************************************************************************/
  'GET /csrfToken': {
    action: 'security/grant-csrf-token'
  },
  '/': '/default/rdmp/home',
  '/:branding/:portal/home': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'homepage'
    }
  },
  '/:branding/:portal/researcher/home': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'researcher/home'
    }
  },
  '/:branding/:portal/record/view/:oid': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'record/view'
    }
  },
  '/:branding/:portal/record/search': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'record/search'
    }
  },
  '/:branding/:portal/record/view-orig/:oid': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'record/view-orig'
    }
  },
  '/:branding/:portal/styles/theme.css': {
    controller: 'BrandingController',
    action: 'renderCss'
  },
  '/:branding/:portal/images/logo': {
    controller: 'BrandingController',
    action: 'renderImage'
  },
  '/:branding/:portal/admin': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'admin/home'
    }
  },
  '/:branding/:portal/admin/translation': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'admin/translation'
    }
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
  '/:branding/:portal/user/profile': {
    controller: 'UserController',
    action: 'profile',
    skipAssets: true
  },
  '/:branding/:portal/availableServicesList': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'availableServicesList'
    }
  },
  '/:branding/:portal/workspaces/list': {
    controller: 'RecordController',
    action: 'listWorkspaces'
  },
  '/:branding/:portal/getAdvice': {
    controller: 'RenderViewController',
    action: 'render',
    locals: {
      'view': 'getAdvice'
    }
  },
  /***************************************************************************
   *                                                                          *
   * Custom routes here...                                                    *
   *                                                                          *
   * If a request to a URL doesn't match any of the custom routes above, it   *
   * is matched against Sails route blueprints. See `config/blueprints.js`    *
   * for configuration options and examples.                                  *
   *                                                                          *
   ***************************************************************************/
  // 'get /dynamic/': 'UserController.info',
  'get /dynamic/:asset': 'DynamicAssetController.get',
  'get /:branding/:portal/dynamic/:asset': 'DynamicAssetController.get',
  'get /:branding/:portal/dynamicAsset/formCompiledItems/:recordType/:oid?': 'DynamicAssetController.getFormCompiledItems',
  'get /:branding/:portal/dynamicAsset/formStructureValidations/:recordType/:oid?': 'DynamicAssetController.getFormStructureValidations',
  'get /:branding/:portal/dynamicAsset/formDataValidations/:recordType/:oid?': 'DynamicAssetController.getFormDataValidations',
  'get /:branding/:portal/dynamicAsset/formExpressions/:recordType/:oid?': 'DynamicAssetController.getFormExpressions',
  'get /:branding/:portal/dynamicAsset/adminReportTemplates/:reportName': 'DynamicAssetController.getAdminReportTemplates',
  'get /:branding/:portal/dynamicAsset/recordDashboardTemplates/:recordType/:workflowStage': 'DynamicAssetController.getRecordDashboardTemplates',
  'post /user/login_local': 'UserController.localLogin',
  'post /user/login_aaf': {
    controller: 'UserController',
    action: 'aafLogin',
    csrf: false
  },
  'get /user/login_oidc': {
    controller: 'UserController',
    action: 'openIdConnectLogin',
    csrf: false
  },
  'HEAD /user/begin_oidc': {
    policy: 'disallowedHeadRequestHandler'
  },
  'get /user/begin_oidc': {
    controller: 'UserController',
    action: 'beginOidc',
    csrf: false
  },
  // 'post /user/begin_oidc': {
  //   controller: 'UserController',
  //   action: 'beginOidc',
  //   csrf: false
  // },
  'get /user/info': 'UserController.info',
  'get /:branding/:portal/user/info': 'UserController.info',
  'get /:branding/:portal/user/login': 'UserController.login',
  'get /:branding/:portal/user/logout': 'UserController.logout',
  'get /:branding/:portal/user/find': 'UserController.find',
  'get /:branding/:portal/admin/users/get': 'AdminController.getUsers',
  'post /:branding/:portal/admin/users/update': 'AdminController.updateUserDetails',
  'post /:branding/:portal/admin/users/genKey': 'AdminController.generateUserKey',
  'post /:branding/:portal/admin/users/revokeKey': 'AdminController.revokeUserKey',
  'post /:branding/:portal/admin/users/newUser': 'AdminController.addLocalUser',
  'get /:branding/:portal/admin/roles/get': 'AdminController.getBrandRoles',
  'post /:branding/:portal/admin/roles/user': 'AdminController.updateUserRoles',
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
    locals: {
      'localFormName': 'default-1.0-draft'
    }
  },
  'delete /:branding/:portal/record/delete/:oid': 'RecordController.delete',
  'put /:branding/:portal/record/delete/:oid': 'RecordController.restoreRecord',
  'delete /:branding/:portal/record/destroy/:oid': 'RecordController.destroyDeletedRecord',
  '/:branding/:portal/record/:oid/attach': 'RecordController.doAttachment',
  '/:branding/:portal/record/:oid/attach/:attachId': 'RecordController.doAttachment',
  //TODO: we're using an * here as sails slugs and req.param don't seem to like parameters with . in them without it.
  'get /:branding/:portal/record/:oid/datastream*': 'RecordController.getDataStream',
  'get /:branding/:portal/record/:oid/attachments': 'RecordController.getAttachments',
  'get /:branding/:portal/record/:oid/permissions': 'RecordController.getPermissions',
  'get /:branding/:portal/record/:oid/relatedRecords': 'RecordController.getRelatedRecords',
  'get /:branding/:portal/record/wfSteps/:recordType': 'RecordController.getWorkflowSteps',
  'post /:branding/:portal/recordmeta/:recordType': 'RecordController.create',
  'put /:branding/:portal/recordmeta/:oid': 'RecordController.update',
  'post /:branding/:portal/record/workflow/step/:targetStep/:oid': 'RecordController.stepTo',
  //TODO: Reinstate it when we add formal permission editing screens
  // 'post /:branding/:portal/record/editors/modify': 'RecordController.modifyEditors',
  'get /:branding/:portal/dashboard/:recordType': 'RecordController.render',
  'get /:branding/:portal/listRecords': 'RecordController.getRecordList',
  'get /:branding/:portal/listDeletedRecords': 'RecordController.getDeletedRecordList',
  'get /:branding/:portal/vocab/:vocabId': 'VocabController.get',
  'get /:branding/:portal/ands/vocab/resourceDetails': 'VocabController.rvaGetResourceDetails',
  'get /:branding/:portal/mint/:mintSourceType': 'VocabController.getMint',
  'get /:branding/:portal/query/vocab/:queryId': 'VocabController.getRecords',
  'post /:branding/:portal/external/vocab/:provider': {
    controller: 'VocabController',
    action: 'searchExternalService',
    csrf: false
  },
  'get /:branding/:portal/collection/:collectionId': 'VocabController.getCollection',
  'post /:branding/:portal/collection/:collectionId': 'VocabController.loadCollection',
  'get /:branding/:portal/export': 'ExportController.index',
  'get /:branding/:portal/admin/export': 'ExportController.index',
  'get /:branding/:portal/export/record/download/:format': 'ExportController.downloadRecs',
  'post /:branding/:portal/asynch': 'AsynchController.start',
  'delete /:branding/:portal/asynch': 'AsynchController.stop',
  'put /:branding/:portal/asynch': 'AsynchController.update',
  'get /:branding/:portal/asynch': 'AsynchController.progress',
  'get /:branding/:portal/asynch/subscribe/:roomId': 'AsynchController.subscribe',
  'delete /:branding/:portal/asynch/subscribe/:roomId': 'AsynchController.unsubscribe',
  'get /:branding/:portal/admin/reports': 'ReportsController.render',
  'get /:branding/:portal/admin/report/:name': 'ReportController.render',
  'get /:branding/:portal/admin/getReport': 'ReportController.get',
  'get /:branding/:portal/admin/getReportResults': 'ReportController.getResults',
  'get /:branding/:portal/admin/downloadReportCSV': 'ReportController.downloadCSV',
  'get /:branding/:portal/people/search': 'VocabController.searchPeople',
  'get /:branding/:portal/api-docs.apib': 'BrandingController.renderApiB',
  'get /:branding/:portal/api-docs.json': 'BrandingController.renderSwaggerJSON',
  'get /:branding/:portal/api-docs.yaml': 'BrandingController.renderSwaggerYAML',
  'post /:branding/:portal/user/genKey': 'UserController.generateUserKey',
  'post /:branding/:portal/user/revokeKey': 'UserController.revokeUserKey',
  'post /:branding/:portal/user/update': 'UserController.update',
  'post /:branding/:portal/action/:action': 'ActionController.callService',
  'get /:branding/:portal/appconfig/form/:appConfigId': 'AppConfigController.getAppConfigForm',
  'post /:branding/:portal/appconfig/form/:appConfigId': 'AppConfigController.saveAppConfig',
  'get /:branding/:portal/admin/appconfig/edit/:appConfigId': {
    controller: 'AppConfigController',
    action: 'editAppConfig'
  },
  'get /:branding/:portal/admin/deletedRecords': 'RecordController.renderDeletedRecords',
  /***************************************************************************
   *                                                                          *
   * REST API routes                                                          *
   *                                                                          *
   *                                                                          *
   *                                                                          *
   *                                                                          *
   *                                                                          *
   ***************************************************************************/
  'post /:branding/:portal/api/records/metadata/:recordType': {
    controller: 'webservice/RecordController',
    action: 'create',
    csrf: false
  },
  'put /:branding/:portal/api/records/metadata/:oid': {
    controller: 'webservice/RecordController',
    action: 'updateMeta',
    csrf: false
  },
  'post /:branding/:portal/api/records/harvest/:recordType': {
    controller: 'webservice/RecordController',
    action: 'harvest',
    csrf: false
  },
  'post /:branding/:portal/api/mint/harvest/:recordType': {
    controller: 'webservice/RecordController',
    action: 'legacyHarvest',
    csrf: false
  },
  'put /:branding/:portal/api/records/objectmetadata/:oid': {
    controller: 'webservice/RecordController',
    action: 'updateObjectMeta',
    csrf: false
  },
  'get /:branding/:portal/api/records/metadata/:oid': {
    controller: 'webservice/RecordController',
    action: 'getMeta',
    csrf: false
  },
  'get /:branding/:portal/api/records/audit/:oid': {
    controller: 'webservice/RecordController',
    action: 'getRecordAudit',
    csrf: false
  },
  'get /:branding/:portal/api/records/list': {
    controller: 'webservice/RecordController',
    action: 'listRecords',
    csrf: false
  },
  'get /:branding/:portal/api/deletedrecords/list': {
    controller: 'webservice/RecordController',
    action: 'listDeletedRecords',
    csrf: false
  },
  'put /:branding/:portal/api/deletedrecords/:oid': {
    controller: 'webservice/RecordController',
    action: 'restoreRecord',
    csrf: false
  },
  'delete /:branding/:portal/api/deletedrecords/:oid': {
    controller: 'webservice/RecordController',
    action: 'destroyDeletedRecord',
    csrf: false
  },
  'get /:branding/:portal/api/records/objectmetadata/:oid': {
    controller: 'webservice/RecordController',
    action: 'getObjectMeta',
    csrf: false
  },
  'delete /:branding/:portal/api/records/metadata/:oid': {
    controller: 'webservice/RecordController',
    action: 'deleteRecord',
    csrf: false
  },
  'post /:branding/:portal/api/records/permissions/edit/:oid': {
    controller: 'webservice/RecordController',
    action: 'addUserEdit',
    csrf: false
  },
  'delete /:branding/:portal/api/records/permissions/edit/:oid': {
    controller: 'webservice/RecordController',
    action: 'removeUserEdit',
    csrf: false
  },
  'post /:branding/:portal/api/records/permissions/view/:oid': {
    controller: 'webservice/RecordController',
    action: 'addUserView',
    csrf: false
  },
  'post /:branding/:portal/api/records/datastreams/:oid': {
    controller: 'webservice/RecordController',
    action: 'addDataStreams',
    csrf: false
  },
  'get /:branding/:portal/api/records/datastreams/:oid/:datastreamId': {
    controller: 'webservice/RecordController',
    action: 'getDataStream',
    csrf: false
  },
  'get /:branding/:portal/api/records/datastreams/:oid': {
    controller: 'webservice/RecordController',
    action: 'listDatastreams',
    csrf: false
  },
  'delete /:branding/:portal/api/records/permissions/view/:oid': {
    controller: 'webservice/RecordController',
    action: 'removeUserView',
    csrf: false
  },
  'post /:branding/:portal/api/records/permissions/editRole/:oid': {
    controller: 'webservice/RecordController',
    action: 'addRoleEdit',
    csrf: false
  },
  'delete /:branding/:portal/api/records/permissions/editRole/:oid': {
    controller: 'webservice/RecordController',
    action: 'removeRoleEdit',
    csrf: false
  },
  'post /:branding/:portal/api/records/permissions/viewRole/:oid': {
    controller: 'webservice/RecordController',
    action: 'addRoleView',
    csrf: false
  },
  'delete /:branding/:portal/api/records/permissions/viewRole/:oid': {
    controller: 'webservice/RecordController',
    action: 'removeRoleView',
    csrf: false
  },
  'get /:branding/:portal/api/records/permissions/:oid': {
    controller: 'webservice/RecordController',
    action: 'getPermissions',
    csrf: false
  },
  'post /:branding/:portal/api/records/workflow/step/:targetStep/:oid': {
    controller: 'webservice/RecordController',
    action: 'transitionWorkflow',
    csrf: false
  },
  'get /:branding/:portal/api/users': {
    controller: 'webservice/UserManagementController',
    action: 'listUsers',
    csrf: false
  },
  'get /:branding/:portal/api/users/find':{
    controller: 'webservice/UserManagementController',
    action: 'getUser',
    csrf: false
  }, 
  'get /:branding/:portal/api/users/get': {
    controller: 'webservice/UserManagementController',
    action: 'getUser',
    csrf: false
  },
  'put /:branding/:portal/api/users': {
    controller: 'webservice/UserManagementController',
    action: 'createUser',
    csrf: false
  },
  'post /:branding/:portal/api/users': {
    controller: 'webservice/UserManagementController',
    action: 'updateUser',
    csrf: false
  },
  'get /:branding/:portal/api/users/token/generate':{
    controller: 'webservice/UserManagementController',
    action: 'generateAPIToken',
    csrf: false
  },
  'get /:branding/:portal/api/users/token/revoke':{
    controller: 'webservice/UserManagementController',
    action: 'revokeAPIToken',
    csrf: false
  }, 
  'get /:branding/:portal/api/roles':{
    controller: 'webservice/UserManagementController',
    action: 'listSystemRoles',
    csrf: false
  },
  'get /:branding/:portal/api/search':{
    controller: 'webservice/SearchController',
    action: 'search',
    csrf: false
  },
  'get /:branding/:portal/api/search/index': {
    controller: 'webservice/SearchController',
    action: 'index',
    csrf: false
  },
  'get /:branding/:portal/api/search/indexAll': {
    controller: 'webservice/SearchController',
    action: 'indexAll',
    csrf: false
  },
  'get /:branding/:portal/api/search/removeAll': {
    controller: 'webservice/SearchController',
    action: 'removeAll',
    csrf: false
  },
  'get /:branding/:portal/api/forms/get':{
    controller:'webservice/FormManagementController',
    action: 'getForm',
    csrf: false
  },
  'get /:branding/:portal/api/forms': {
    controller: 'webservice/FormManagementController',
    action: 'listForms',
    csrf: false
  }, 

  'get /:branding/:portal/api/recordtypes/get': {
    controller: 'webservice/RecordTypeController',
    action: 'getRecordType',
    csrf: false
  },
  'get /:branding/:portal/api/recordtypes': {
    controller: 'webservice/RecordTypeController',
    action: 'listRecordTypes',
    csrf: false
  },
  'get /:branding/:portal/api/admin/refreshCachedResources': {
    controller: 'webservice/AdminController',
    action: 'refreshCachedResources',
    csrf: false
  },
  'post /:branding/:portal/api/admin/config/:configKey': {
    controller: 'webservice/AdminController',
    action: 'setAppConfig',
    csrf: false
  },
  'get /:branding/:portal/api/admin/config/:configKey': {
    controller: 'webservice/AdminController',
    action: 'getAppConfig',
    csrf: false
  },
  'get /:branding/:portal/api/admin/config': {
    controller: 'webservice/AdminController',
    action: 'getAppConfig',
    csrf: false
  },
  'post /:branding/:portal/api/sendNotification': {
    controller: 'EmailController',
    action: 'sendNotification',
    csrf: false
  },
  'post /:branding/:portal/api/roles/:roleName': {
    controller: 'webservice/UserManagementController',
    action: 'createSystemRole',
    csrf: false
  },
  'get /:branding/:portal/api/report/namedQuery': {
    controller: 'webservice/ReportController',
    action: 'executeNamedQuery',
    csrf: false
  },
  'get /:branding/:portal/api/export/record/download/:format': {
    controller: 'webservice/ExportController',
    action: 'downloadRecs',
    csrf: false
  },
  'get /:branding/:portal/api/appconfig/:appConfigId': {
    controller: 'webservice/AppConfigController',
    action: 'getAppConfig',
    csrf: false
  },
  'post /:branding/:portal/api/appconfig/:appConfigId': {
    controller: 'webservice/AppConfigController',
    action: 'saveAppConfig',
    csrf: false
  },
  // i18next http-backend compatible route to fetch namespaces
  // Example: /default/rdmp/locales/en/translation.json
  'get /:branding/:portal/locales/:lng/:ns.json': {
    controller: 'TranslationController',
    action: 'getNamespace',
    csrf: false
  },
  // TODO: Fix pattern so above route works.
  'get /:branding/:portal/locales/:lng/translation.json': {
    controller: 'TranslationController',
    action: 'getNamespace',
    csrf: false
  },
  // Languages list for Translation app
  'get /:branding/:portal/locales': {
    controller: 'TranslationController',
    action: 'getLanguages',
    csrf: false
  },
  'get /:branding/:portal/workspaces/types/:name': 'WorkspaceTypesController.getOne',
  'get /:branding/:portal/workspaces/types': 'WorkspaceTypesController.get'
  ,
  // Translation management API (webservice)
  'get /:branding/:portal/api/i18n/entries': {
    controller: 'webservice/TranslationController',
    action: 'listEntries',
    csrf: false
  },
  // Allow dots in keys via * slug
  'get /:branding/:portal/api/i18n/entries/:locale/:namespace/:key*': {
    controller: 'webservice/TranslationController',
    action: 'getEntry',
    csrf: false
  },
  'post /:branding/:portal/api/i18n/entries/:locale/:namespace/:key*': {
    controller: 'webservice/TranslationController',
    action: 'setEntry',
    csrf: false
  },
  'delete /:branding/:portal/api/i18n/entries/:locale/:namespace/:key*': {
    controller: 'webservice/TranslationController',
    action: 'deleteEntry',
    csrf: false
  },
  'get /:branding/:portal/api/i18n/bundles/:locale/:namespace': {
    controller: 'webservice/TranslationController',
    action: 'getBundle',
    csrf: false
  },
  'post /:branding/:portal/api/i18n/bundles/:locale/:namespace': {
    controller: 'webservice/TranslationController',
    action: 'setBundle',
    csrf: false
  }
  ,
  // Angular app i18n endpoints (CSRF enabled)
  'get /:branding/:portal/app/i18n/entries': {
    controller: 'TranslationController',
    action: 'listEntriesApp'
  },
  'post /:branding/:portal/app/i18n/entries/:locale/:namespace/:key*': {
    controller: 'TranslationController',
    action: 'setEntryApp'
  },
  'get /:branding/:portal/app/i18n/bundles/:locale/:namespace': {
    controller: 'TranslationController',
    action: 'getBundleApp'
  },
  'post /:branding/:portal/app/i18n/bundles/:locale/:namespace': {
    controller: 'TranslationController',
    action: 'setBundleApp'
  },
  'post /:branding/:portal/app/i18n/bundles/:locale/:namespace/enabled': {
    controller: 'webservice/TranslationController',
    action: 'updateBundleEnabled'
  }
};