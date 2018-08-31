/**

Authentication and authorization configuration

*/
module.exports.auth = {
  // Bootstrap BEGIN
  // only used one-time for bootstrapping, not intended for long-term maintenance
  roles: [
    {
      name: 'Admin'
    },
    {
      name: 'Librarians'
    },
    {
      name: 'Researcher'
    },
    {
      name: 'Guest'
    }
  ],
  // default rules for the default brand...
  rules: [
    {
      path: '/:branding/:portal/workspaces(/*)',
      role: 'Admin',
      can_update:true
    },
    {
      path: '/:branding/:portal/workspaces(/*)',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/workspaces(/*)',
      role: 'Researcher',
      can_update:true
    },
    {
      path: '/:branding/:portal/record/delete(/*)',
      role: 'Admin',
      can_update:true
    },
    {
      path: '/:branding/:portal/admin',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/admin',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/admin/reports',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/admin/getReport',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/admin/getReportResults',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/admin/downloadReportCSV',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/admin/report(/*)',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/admin(/*)',
      role: 'Admin',
      can_update:true
    },
    {
      path: '/:branding/:portal/record(/*)',
      role: 'Researcher',
      can_update:true
    },
    {
      path: '/:branding/:portal/record(/*)',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/recordmeta(/*)',
      role: 'Researcher',
      can_update:true
    },
    {
      path: '/:branding/:portal/vocab(/*)',
      role: 'Researcher',
      can_read: true
    },
    {
      path: '/:branding/:portal/collection(/*)',
      role: 'Researcher',
      can_read: true
    },
    {
      path: '/:branding/:portal/mint(/*)',
      role: 'Researcher',
      can_read: true
    },
    {
      path: '/:branding/:portal/user/find(/*)',
      role: 'Researcher',
      can_read: true
    },
    {
      path: '/:branding/:portal/user/profile',
      role: 'Researcher',
      can_read: true
    },
    {
      path: '/:branding/:portal/dashboard(/*)',
      role: 'Researcher',
      can_update:true
    },
    {
      path: '/:branding/:portal/researcher/home',
      role: 'Researcher',
      can_update:true
    },
    {
      path: '/:branding/:portal/researcher/home',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/export(/*)',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/export(/*)',
      role: 'Admin',
      can_update:true
    },
    {
      path: '/:branding/:portal/asynch(/*)',
      role: 'Researcher',
      can_update:true
    },
    {
      path: '/:branding/:portal/asynch(/*)',
      role: 'Librarians',
      can_update:true
    },
    {
      path: '/:branding/:portal/api(/*)',
      role: 'Admin',
      can_update:true
    },
    {
      path: '/:branding/:portal/home',
      role: 'Guest',
      can_read: true
    }
  ],
  // Bootstrap END
  defaultBrand: 'default',
  defaultPortal: 'rdmp',
  loginPath: 'user/login',
  hiddenRoles: [],
  hiddenUsers: [],
  postLogoutRedir: '/',
  // Brand-Portal Specific configuration
  default: {
    defaultRole: 'Guest', // default when unauthenticated
    // will be shown in the login page choices
    active: [],
    local: {
      usernameField: 'username',
      passwordField: 'password',
      default: {
        adminUser: 'admin',
        adminPw: 'rbadmin',
        email: 'admin@redboxresearchdata.com.au'
      },
      templatePath: 'local.ejs',
      postLoginRedir: 'researcher/home',
    },
    aaf: {
      defaultRole: 'Researcher',
      attributesField: 'https://aaf.edu.au/attributes',
      usernameField: 'sub',
      postLoginRedir: 'researcher/home',
      opts: {
        jsonWebTokenOptions: {
          issuer: 'https://rapid.aaf.edu.au',
          ignoreNotBefore: true,
          clockTolerance: 120,
        },
        passReqToCallback: true
      },
      templatePath: 'aaf.ejs'
    }
  }
};
