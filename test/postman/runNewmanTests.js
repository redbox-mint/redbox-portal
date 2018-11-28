var sails = require('sails');
var newman = require('newman');

sails.lift({
  port: 1500,
  log: {
    level: 'info'
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
}, function(err, server) {
  if (err) process.exit(1);

  newman.run({
    collection: require('./test-collection.json'),
    reporters: 'cli',
    environment: require('./local.environment.json'),
  }, function(err) {
    if (err) {
      console.log(err);
      process.exit(1);
    }
   process.exit(0);
  });



});
