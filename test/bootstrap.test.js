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
         connection: 'unitTestConnection',
         migrate: 'drop'
       },
       connections: {
         unitTestConnection: {
           adapter: 'sails-disk'
         }
       }
    }, function (err, server) {
       if (err) return done(err);
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
