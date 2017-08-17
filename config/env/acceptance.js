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
    level: 'debug'
  },
  appUrl:'http://dlcfportal:1500',
  db: {
    waitRetries: 5,
    waitSleep: 20000
  },
  auth: {
    active: ["aaf", "local"],
    aaf: {
      loginUrl: "https://rapid.test.aaf.edu.au/jwt/authnrequest/research/HRPmRAGB6vO44YkivF4yZA",
      opts: {
        secretOrKey: 'Y30wY4xv1*6I7yUX%6v*Tzce8OEbVO&@R4hVb%2@Gehtx^xgOqQ97Slv!ZOkfHHmox&x0zAt*0o&4^8$9oW8WTf&r@&d31EFbQZr',
        jsonWebTokenOptions: {
          issuer: 'https://rapid.test.aaf.edu.au',
          audience: 'http://dlcfportal:1500/default/rdmp/',
          ignoreNotBefore: true
        }
      }
    }
  },
  redbox: {
    apiKey: 'b766a4d7-2e24-4cd6-a629-6c11de340ac8'
  }
};
