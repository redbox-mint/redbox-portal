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

  '/':  '/default/rdmp/home',
  '/:branding/:portal/home': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'homepage'
    }
  },
  '/:branding/:portal/researcher/home': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'researcher/home'
    }
  },
  '/:branding/:portal/record/view/:oid': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'record/view'
    }
  },
  '/:branding/:portal/record/transfer/:type': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'record/transfer'
    }
  },
  '/:branding/:portal/record/search': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'record/search'
    }
  },
  '/:branding/:portal/record/view-orig/:oid': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'record/view-orig'
    }
  },
  '/:branding/:portal/styles/theme.css': {
    controller: 'BrandingController',
    action: 'renderCss'
  },
  '/:branding/:portal/images/logo.png': {
    controller: 'BrandingController',
    action: 'renderImage'
  },
  '/:branding/:portal/admin': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'admin/home'
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
  '/:branding/:portal/admin': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'admin/home'
    }
  },
  '/:branding/:portal/availableServicesList': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'availableServicesList'
    }
  },
  '/:branding/:portal/workspaces/list': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
      'view': 'listWorkspaces'
    }
  },
  '/:branding/:portal/getAdvice': {
    controller: 'RenderViewController',
    action: 'render',
    locals:{
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
  'post /user/login_local': 'UserController.localLogin',
  'post /user/login_aaf': 'UserController.aafLogin',
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
  'get /:branding/:portal/record/metadata/:oid': 'RecordController.getMeta',
  'get /:branding/:portal/record/form/:name': 'RecordController.getForm',
  'get /:branding/:portal/record/form/:name/:oid': 'RecordController.getForm',
  'get /:branding/:portal/record/search/:type': 'RecordController.search',
  'get /:branding/:portal/record/type': 'RecordController.getAllTypes',
  'get /:branding/:portal/record/type/:recordType': 'RecordController.getType',
  'get /:branding/:portal/record/:recordType/edit': 'RecordController.edit',
  'get /:branding/:portal/record/edit/:oid': 'RecordController.edit',
  'delete /:branding/:portal/record/delete/:oid': 'RecordController.delete',
  '/:branding/:portal/record/:oid/attach': 'RecordController.doAttachment',
  '/:branding/:portal/record/:oid/attach/:attachId': 'RecordController.doAttachment',
  //TODO: we're using an * here as sails slugs and req.param don't seem to like parameters with . in them without it.
  'get /:branding/:portal/record/:oid/datastream*': 'RecordController.getDataStream',
  'get /:branding/:portal/record/:oid/attachments': 'RecordController.getAttachments',
  'get /:branding/:portal/record/wfSteps/:recordType': 'RecordController.getWorkflowSteps',
  'post /:branding/:portal/recordmeta/:recordType': 'RecordController.create',
  'put /:branding/:portal/recordmeta/:oid': 'RecordController.update',
  'post /:branding/:portal/record/workflow/step/:targetStep/:oid': 'RecordController.stepTo',
  'post /:branding/:portal/record/editors/modify': 'RecordController.modifyEditors',
  'post /:branding/:portal/record/responsibility/update': 'RecordController.updateResponsibilities',
  'get /:branding/:portal/dashboard/:recordType': 'DashboardController.render',
  'get /:branding/:portal/listRecords': 'DashboardController.getRecordList',
  'get /:branding/:portal/vocab/:vocabId': 'VocabController.get',
  'get /:branding/:portal/ands/vocab/resourceDetails': 'VocabController.rvaGetResourceDetails',
  'get /:branding/:portal/mint/:mintSourceType': 'VocabController.getMint',
  'post /:branding/:portal/external/vocab/:provider': 'VocabController.searchExternalService',
  'get /:branding/:portal/collection/:collectionId': 'VocabController.getCollection',
  'post /:branding/:portal/collection/:collectionId': 'VocabController.loadCollection',
  'get /:branding/:portal/export': 'ExportController.index',
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
  'get /:branding/:portal/transferconfig/:type': 'RecordController.getTransferResponsibilityConfig',
  'post /:branding/:portal/action/:action': 'ActionController.callService',
  /***************************************************************************
  *                                                                          *
  * REST API routes                                                          *
  *                                                                          *
  *                                                                          *
  *                                                                          *
  *                                                                          *
  *                                                                          *
  ***************************************************************************/

  'post /:branding/:portal/api/records/metadata/:recordType': 'webservice/RecordController.create',
  'put /:branding/:portal/api/records/metadata/:oid': 'webservice/RecordController.updateMeta',
  'get /:branding/:portal/api/records/metadata/:oid': 'webservice/RecordController.getMeta',
  'post /:branding/:portal/api/records/permissions/edit/:oid': 'webservice/RecordController.addUserEdit',
  'delete /:branding/:portal/api/records/permissions/edit/:oid': 'webservice/RecordController.removeUserEdit',
  'post /:branding/:portal/api/records/permissions/view/:oid': 'webservice/RecordController.addUserView',
  'delete /:branding/:portal/api/records/permissions/view/:oid': 'webservice/RecordController.removeUserView',
  'get /:branding/:portal/api/records/permissions/:oid': 'webservice/RecordController.getPermissions',
  'get /:branding/:portal/api/records/datastreams/:oid': 'webservice/RecordController.getDataStream',



  'get /:branding/:portal/api/users': 'webservice/UserManagementController.listUsers',
  'get /:branding/:portal/api/users/find': 'webservice/UserManagementController.findUser',

  'post /:branding/:portal/api/sendNotification': 'EmailController.sendNotification',

  'get /:branding/:portal/workspace/types/:name' : 'WorkspaceTypesController.getOne',
  'get /:branding/:portal/workspace/types' : 'WorkspaceTypesController.get'
};
