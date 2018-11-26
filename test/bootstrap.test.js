var sails = require('sails');
var _ = require('lodash');

global.chai = require('chai');
global.should = chai.should();
global.expect = chai.expect;
global.moment = require('moment');

before(function (done) {

  // Increase the Mocha timeout so that Sails has enough time to lift.
  this.timeout(120000);
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
       const newman = require('newman'); // require newman in your project

       newman.run({
         collection: require('./test-collection.json'),
         reporters: 'cli',
         environment: require('./local.environment.json'),
       }, function (err) {
          if (err) { throw err; }
          console.log('collection run complete!');
        });
       // here you can load fixtures, etc.
       done(err, sails);
  });


});

after(function (done) {

  // here you can clear fixtures, etc.
  if (sails && _.isFunction(sails.lower)) {
     sails.lower(done);
  }
});
