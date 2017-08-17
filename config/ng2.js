/**
 * NG2 related configuration

 */
module.exports.ng2 = {
  force_bundle: false,
  apps: {
    "user/login": ['/angular/localAuth/dist-bundle.js'],
    "record/edit": ['/angular/dmp/dist-bundle.js'],
    "record/view": ['/angular/dmp/dist-bundle.js'],
    "admin/roles": ['/angular/manageRoles/dist-bundle.js'],
    "dashboard": ['/angular/dashboard/dist-bundle.js'],
    "export/index": ['/angular/export/dist-bundle.js']
  }
};
