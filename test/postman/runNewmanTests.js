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
          token: 'd077835a-696b-4728-85cf-3ffd57152b1e'
        }
      }
    }
  }
}, function(err, server) {
  if (err) process.exit(1);

  newman.run({
    collection: require('./test-collection.json'),
    reporters: ['cli', 'junit'],
    reporter: {
      junit: {
        export: '.tmp/junit/backend-newman/backend-newman.xml'
      },
    },
    environment: require('./local.environment.json')
  }, function(err, summary) {
    const runError = err || summary.run.error || summary.run.failures.length;
    if (err) {
      console.log(err);
      process.exit(1);
    }
    if(runError) {
      process.exit(1);
    }
    process.exit(0);
  });



});
