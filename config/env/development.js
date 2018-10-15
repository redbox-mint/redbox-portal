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

module.exports = {

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
  appUrl:'http://localhost:1500',
  record:{
    baseUrl: {
      redbox: "http://redbox:9000/redbox",
      mint: "http://203.101.226.160/mint"
    }
  },  // added for TUS server, only set if there's a reverse proxy infront, otherwise, TUS needs this so it can return the correct host name and port
  //appPort: 1500,
  db: {
    waitRetries: 5,
    waitSleep: 10000
  },
  auth: {
    // Default brand...
    default: {
      active: ["aaf", "local"],
      aaf: {
        loginUrl: "https://rapid.test.aaf.edu.au/jwt/authnrequest/research/OTG8tPdB2H_aT0yZ4s63zQ",
        opts: {
          secretOrKey: 'Y30wY4xv1*6I7yUX%6v*Tzce8OEbVO&@R4hVb%2@Gehtx^xgOqQ97Slv!ZOkfHHmox&x0zAt*0o&4^8$9oW8WTf&r@&d31EFbQZr',
          jsonWebTokenOptions: {
            issuer: 'https://rapid.test.aaf.edu.au',
            audience: 'http://localhost:1500/default/rdmp/',
            ignoreNotBefore: true
          }
        }
      }
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
  }
};
