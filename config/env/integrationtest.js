/**
 * Development environment settings
 *
 * This file can include shared settings for a development team,
 * such as API keys or remote database passwords.  If you're using
 * a version control solution for your Sails app, this file will
 * be committed to your repository unless you add it to your .gitignore
 * file.  If your repository will be publicly viewable, don't add
 * any private information to this file!
 *
 */

const integrationTestAuthDefaults = {
  active: ["aaf", "local", "oidc"],
  aaf: {
    loginUrl: "https://rapid.test.aaf.edu.au/jwt/authnrequest/research/OTG8tPdB2H_aT0yZ4s63zQ",
    opts: {
      secretOrKey: 'Y30wY4xv1*6I7yUX%6v*Tzce8OEbVO&@R4hVb%2@Gehtx^xgOqQ97Slv!ZOkfHHmox&x0zAt*0o&4^8$9oW8WTf&r@&d31EFbQZr',
      jsonWebTokenOptions: {
        issuer: 'https://rapid.test.aaf.edu.au',
        audience: 'http://redboxportal:1500/default/rdmp/',
        ignoreNotBefore: true
      }
    }
  },
  oidc: {
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
    claimMappingOptions: {
      usernameToLowercase: true
    },
    userInfoSource: 'tokenset_claims',
    opts: {
      issuer: 'http://keycloak:8080/realms/redbox/',
      client: {
        client_id: 'redbox',
        client_secret: 'w2snramgGaqehPiujV695iUfKmZAJ147',
        redirect_uris: ['http://redboxportal:1500/user/login_oidc'],
        post_logout_redirect_uris: ['http://redboxportal:1500/default/rdmp/user/logout'],
      },
      params: {
        scope: 'openid email profile',
        claims: {
            "userinfo": {
            "given_name": {"essential": true},
            "family_name": {"essential": true},
            "email": {"essential": true},
          },
          "id_token": {
            "given_name": {"essential": true},
            "family_name": {"essential": true},
            "email": {"essential": true},
          }
        }
      }
    },
    templatePath: 'openidconnect.ejs'
  }
};

module.exports = {
  http:{
    rootContext: ''
  },
  /***************************************************************************
   * Set the default database connection for models in the development       *
   * environment (see config/connections.js and config/models.js )           *
   ***************************************************************************/

  // models: {
  //   connection: 'someMongodbServer'
  // }
  bootstrapTimeout: 480000,
  pubsub: {
    _hookTimeout: 480000,
  },
  log: {
    level: 'verbose'
  },
  appUrl:'http://redboxportal:1500',
  record:{
    baseUrl: {
      redbox: "http://redbox:9000/redbox",
      mint: "https://demo.redboxresearchdata.com.au/mint"
    },
    attachments: {
      stageDir: "/opt/redbox-portal/attachments"
    }
  },
  redbox: {
    apiKey: 'c8e844fc-8550-497f-b970-7900ec8741ca'
  },
  mint: {
    apiKey: '3a86f185-8305-478a-a3dc-9e8481d49712',
    api: {
      search: {
        method: 'get',
        url: '/api/v1/search'
      }
    }
  },
  // added for TUS server, only set if there's a reverse proxy infront, otherwise, TUS needs this so it can return the correct host name and port
  //appPort: 1500,
  db: {
    waitRetries: 5,
    waitSleep: 10000
  },
  brandingConfigurationDefaults: {
    auth: integrationTestAuthDefaults
  },
  datastores:{
    mongodb: {
      adapter: require('sails-mongo'),
      url: 'mongodb://mongodb:27017/redbox-portal'
    }
  },
  services: {
    email: {
      disabled: true
    }
  },
  companion: {
    enabled: process.env.UPPY_COMPANION_ENABLED === 'true',
    route: '/companion',
    secret: process.env.UPPY_COMPANION_SECRET || '',
    filePath: process.env.UPPY_COMPANION_FILE_PATH || '/tmp/companion',
    uploadUrls: (process.env.UPPY_COMPANION_UPLOAD_URLS || '').split(',').map((v) => v.trim()).filter(Boolean),
    server: {
      host: process.env.UPPY_COMPANION_HOST || '',
      protocol: process.env.UPPY_COMPANION_PROTOCOL || 'http',
      path: process.env.UPPY_COMPANION_PATH || '/companion'
    },
    providerOptions: {
      dropbox: {
        key: process.env.UPPY_DROPBOX_KEY || '',
        secret: process.env.UPPY_DROPBOX_SECRET || ''
      },
      google: {
        key: process.env.UPPY_GOOGLE_KEY || '',
        secret: process.env.UPPY_GOOGLE_SECRET || ''
      },
      onedrive: {
        key: process.env.UPPY_ONEDRIVE_KEY || '',
        secret: process.env.UPPY_ONEDRIVE_SECRET || ''
      }
    }
  }
};
