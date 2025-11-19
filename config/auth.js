/**

Authentication and authorization configuration

*/
const defaultBrandAuthConfig = {
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
    hooks: {
      onCreate: {
        pre: [],
        post: []
      },
      onUpdate: {
        pre: [
        // {
        //   function: 'sails.services.vocabservice.findInMintTriggerWrapper',
        //   failureMode: 'continue', //options continue or stop processing
        //   options: {
        //     sourceType: 'Parties AND repository_name:People',
        //     queryString: 'autocomplete_given_name:<%= user.name%>* OR autocomplete_family_name:<%= user.name%>* OR autocomplete_full_name:<%= user.name%>*',
        //     fieldsToMap: ['text_full_name', 'dc_identifier']
        //   }
        // }
      ],
      post: []
    }
    }
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
  },
  oidc: {
    debugMode: false, // when 'true', login will always fail, sending the tokenset, profile, and other information to the 'generic' SSO login failure page.
    // configures the source for the user information, allows for the idiosynchracies of ADFS 2016, see https://www.michaelboeynaems.com/keycloak-ADFS-OIDC.html
    // 
    // possible values: 
    // 'userinfo_endpoint' - Default when unspecified. Call the the user info endpoint, see https://github.com/panva/node-openid-client/blob/main/docs/README.md#new-strategyoptions-verify
    // 'tokenset_claims' - Use the information returned by the tokenset claims, see: https://github.com/panva/node-openid-client/blob/main/docs/README.md#tokensetclaims
    // userInfoSource: 'tokenset_claims', 
    discoverAttemptsMax: 5, // attempts at discovery before giving up
    discoverFailureSleep: 5000, // ms to pause before attempting another discovery attempt
    defaultRole: 'Researcher',
    postLoginRedir: 'researcher/home',
    claimMappings: {
      username: 'sub',
      name: 'name',
      email: 'email',
      givenname: 'given_name',
      surname: 'family_name',
      cn: 'name',
      displayName: 'name'
    },
    opts: {
      issuer: '',
      client: {
        client_id: '',
        client_secret: '',
        redirect_uris: [''],
        post_logout_redirect_uris: ['']
      },
      params: {
        scope: 'openid email profile'
      }
    },
    templatePath: 'openidconnect.ejs'
  }
};

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
      path: '/:branding/:portal/record/destroy(/*)',
      role: 'Admin',
      can_update:true
    },
    {
      path: '/:branding/:portal/listDeletedRecords(/*)',
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
      path: '/:branding/:portal/admin/translation',
      role: 'Librarians',
      can_update:true
    },
     {
      path: '/:branding/:portal/app/i18n(/*)',
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
      path: '/:branding/:portal/admin/export',
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
      path: '/:branding/:portal/external(/*)',
      role: 'Researcher',
      can_update:true
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
      path: '/:branding/:portal/appconfig(/*)',
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
    },
    // Task 9: App branding admin-only endpoints (now policy enforced, controller no longer checks directly)
    {
      path: '/:branding/:portal/app/branding(/*)',
      role: 'Admin',
      can_update: true
    }
  ],
  // Bootstrap END
  defaultBrand: 'default',
  defaultPortal: 'rdmp',
  loginPath: 'user/login',
  hiddenRoles: [],
  hiddenUsers: [],
  postLogoutRedir: '/default/rdmp/home'
};

module.exports.brandingConfigurationDefaults = {
  auth: defaultBrandAuthConfig
};
