const sails = require('sails');
const _ = require('lodash');
const { DateTime } = require('luxon');
const redboxLoader = require('../../redbox-loader');

// Expose Luxon DateTime for tests needing date utilities
(global as any).DateTime = DateTime;

before(function (done: Mocha.Done) {
  import('chai').then((chai) => {
    (global as any).chai = chai;
    (global as any).should = chai.should();
    (global as any).expect = chai.expect;

    // Increase the Mocha timeout so that Sails has enough time to lift.
    this.timeout(5 * 60 * 1000);

    // Generate shims before lifting Sails
    redboxLoader.generateAllShims(process.cwd(), {
      forceRegenerate: process.env.REGENERATE_SHIMS === 'true',
      verbose: process.env.SHIM_VERBOSE === 'true'
    }).then(() => {
      sails.lift({
        log: {
          level: 'verbose'
        },
        hooks: {
          grunt: false
        },
        models: {
          datastore: 'mongodb',
          migrate: 'drop'
        },
        security: {
          csrf: false
        },
        datacite: {
          username: process.env.datacite_username,
          password: process.env.datacite_password,
          doiPrefix: process.env.datacite_doiPrefix
        },
        auth: {
          default: {
            local: {
              default: {
                token: 'jA8mF8CBpwHGkJqlgg6dT3hEDoZTQIif5t1V9ElIcN8='
              }
            }
          }
        }
      }, function (err: Error) {
        if (err) return done(err);
        done(err, sails);
      });
    }).catch((err: Error) => {
      console.error('Failed to generate shims before lift:', err);
      done(err);
    });
  });
});

after(function (done: Mocha.Done) {
  // here you can clear fixtures, etc.
  if (sails && _.isFunction(sails.lower)) {
    sails.lower(done);
  }
});
