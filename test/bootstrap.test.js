var sails = require('sails');
var _ = require('lodash');
const { DateTime } = require('luxon');

// Expose Luxon DateTime for tests needing date utilities
global.DateTime = DateTime;


before(function (done) {
  import('chai').then(chai => {
    global.chai = chai;
    global.should = chai.should();
    global.expect = chai.expect;
    
    // Increase the Mocha timeout so that Sails has enough time to lift.
    this.timeout(5 * 60 * 1000);
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
    }, function (err, server) {
      if (err) return done(err);
      done(err, sails);
    });
  });

});

after(function (done) {
  // here you can clear fixtures, etc.
  if (sails && _.isFunction(sails.lower)) {
    sails.lower(done);
  }
});
