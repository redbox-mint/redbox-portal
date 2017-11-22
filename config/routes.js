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
    controller: 'typescript/RenderViewController',
    action: 'render',
    locals:{
      'view': 'homepage'
    }
  },
  '/:branding/:portal/researcher/home': {
    controller: 'typescript/RenderViewController',
    action: 'render',
    locals:{
      'view': 'researcher/home'
    }
  },
  '/:branding/:portal/record/view/:oid': {
    controller: 'typescript/RenderViewController',
    action: 'render',
    locals:{
      'view': 'record/view'
    }
  },
  '/:branding/:portal/record/transfer': {
    controller: 'typescript/RenderViewController',
    action: 'render',
    locals:{
      'view': 'record/transfer'
    }
  },
  '/:branding/:portal/record/search': {
    controller: 'typescript/RenderViewController',
    action: 'render',
    locals:{
      'view': 'record/search'
    }
  },
  '/:branding/:portal/record/view-orig/:oid': {
    controller: 'typescript/RenderViewController',
    action: 'render',
    locals:{
      'view': 'record/view-orig'
    }
  },
  '/:branding/:portal/styles/theme.css': {
    controller: 'typescript/BrandingController',
    action: 'renderCss'
  },
  '/:branding/:portal/images/logo.png': {
    controller: 'typescript/BrandingController',
    action: 'renderImage'
  },
  '/:branding/:portal/admin': {
    controller: 'typescript/RenderViewController',
    action: 'render',
    locals:{
      'view': 'admin/home'
    }
  },
  '/:branding/:portal/admin/roles': {
    controller: 'typescript/AdminController',
    action: 'rolesIndex',
    skipAssets: true
  },
  '/:branding/:portal/admin/users': {
    controller: 'typescript/AdminController',
    action: 'usersIndex',
    skipAssets: true
  },
  '/:branding/:portal/user/profile': {
    controller: 'typescript/UserController',
    action: 'profile',
    skipAssets: true
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
  'post /user/login_local': 'typescript/UserController.localLogin',
  'post /user/login_aaf': 'typescript/UserController.aafLogin',
  'get /user/info': 'typescript/UserController.info',
  'get /:branding/:portal/user/login': 'typescript/UserController.login',
  'get /:branding/:portal/user/logout': 'typescript/UserController.logout',
  'get /:branding/:portal/user/find': 'typescript/UserController.find',
  'get /:branding/:portal/admin/users/get': 'typescript/AdminController.getUsers',
  'post /:branding/:portal/admin/users/update': 'typescript/AdminController.updateUserDetails',
  'post /:branding/:portal/admin/users/genKey': 'typescript/AdminController.generateUserKey',
  'post /:branding/:portal/admin/users/revokeKey': 'typescript/AdminController.revokeUserKey',
  'post /:branding/:portal/admin/users/newUser': 'typescript/AdminController.addLocalUser',
  'get /:branding/:portal/admin/roles/get': 'typescript/AdminController.getBrandRoles',
  'post /:branding/:portal/admin/roles/user': 'typescript/AdminController.updateUserRoles',
  'get /:branding/:portal/record/:recordType/edit': 'typescript/RecordController.edit',
  'get /:branding/:portal/record/edit/:oid': 'typescript/RecordController.edit',
  'get /:branding/:portal/record/metadata/:oid': 'typescript/RecordController.getMeta',
  'get /:branding/:portal/record/form/:name': 'typescript/RecordController.getForm',
  'get /:branding/:portal/record/form/:name/:oid': 'typescript/RecordController.getForm',
  'get /:branding/:portal/record/search/:type': 'typescript/RecordController.search',
  'get /:branding/:portal/record/type/:recordType': 'typescript/RecordController.getType',
  'post /:branding/:portal/recordmeta/': 'typescript/RecordController.create',
  'put /:branding/:portal/recordmeta/:oid': 'typescript/RecordController.update',
  'post /:branding/:portal/record/workflow/step/:targetStep/:oid': 'typescript/RecordController.stepTo',
  'post /:branding/:portal/record/editors/modify': 'typescript/RecordController.modifyEditors',
  'get /:branding/:portal/dashboard': 'typescript/DashboardController.render',
  'get /:branding/:portal/listPlans': 'typescript/DashboardController.getPlanList',
  'get /:branding/:portal/vocab/:vocabId': 'typescript/VocabController.get',
  'get /:branding/:portal/mint/:mintSourceType': 'typescript/VocabController.getMint',
  'get /:branding/:portal/collection/:collectionId': 'typescript/VocabController.getCollection',
  'post /:branding/:portal/collection/:collectionId': 'typescript/VocabController.loadCollection',
  'get /dynamic/:asset': 'typescript/DynamicAssetController.get',
  'get /:branding/:portal/export': 'typescript/ExportController.index',
  'get /:branding/:portal/export/record/download/:format': 'typescript/ExportController.downloadRecs',
  'get /:branding/:portal/asynch/start/:procId': 'typescript/AsynchController.start',
  'get /:branding/:portal/asynch/progress/:progId': 'typescript/AsynchController.progress',
  'get /:branding/:portal/admin/reports': 'typescript/ReportsController.render',
  'get /:branding/:portal/admin/report/:name': 'typescript/ReportController.render',
  'get /:branding/:portal/admin/getReport': 'typescript/ReportController.get',
  'get /:branding/:portal/admin/getReportResults': 'typescript/ReportController.getResults',
  'get /:branding/:portal/admin/downloadReportCSV': 'typescript/ReportController.downloadCSV',
  'get /:branding/:portal/people/search': 'typescript/VocabController.searchPeople',

  /***************************************************************************
  *                                                                          *
  * REST API routes                                                          *
  *                                                                          *
  *                                                                          *
  *                                                                          *
  *                                                                          *
  *                                                                          *
  ***************************************************************************/

  'post /:branding/:portal/api/records/:recordType/create': 'typescript/webservice/RecordController.create',
  'post /:branding/:portal/api/records/metadata/:oid': 'typescript/webservice/RecordController.updateMeta',
  'get /:branding/:portal/api/records/metadata/:oid': 'typescript/webservice/RecordController.getMeta',
  'post /:branding/:portal/api/records/permissions/:oid/edit/add': 'typescript/webservice/RecordController.addUserEdit',
  'post /:branding/:portal/api/records/permissions/:oid/edit/remove': 'typescript/webservice/RecordController.removeUserEdit',
  'post /:branding/:portal/api/records/permissions/:oid/view/add': 'typescript/webservice/RecordController.addUserView',
  'post /:branding/:portal/api/records/permissions/:oid/view/remove': 'typescript/webservice/RecordController.removeUserView',
  'get /:branding/:portal/api/listUsers': 'typescript/webservice/UserManagementController.listUsers',
  'get /:branding/:portal/api/lookupUser': 'typescript/webservice/UserManagementController.findUser',
  'post /:branding/:portal/api/sendNotification': 'typescript/EmailController.sendNotification',
  'post /:branding/:portal/user/genKey': 'typescript/UserController.generateUserKey',
  'post /:branding/:portal/user/revokeKey': 'typescript/UserController.revokeUserKey',
  'post /:branding/:portal/user/update': 'typescript/UserController.update'
};
