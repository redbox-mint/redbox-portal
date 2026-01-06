const _ = require('lodash');

// Import the compiled model definitions
const { MongoModels } = require('./api/models');

module.exports = function (sails) {
  return {
    initialize: function (cb) {
      // Use ConfigService from sails.services (available at runtime)
      // The ConfigService will be loaded by Sails before hooks initialize
      if (sails.services && sails.services.configservice) {
        sails.services.configservice.mergeHookConfig('@researchdatabox/sails-hook-redbox-storage-mongo', sails.config);
      } else {
        sails.log.warn('sails-hook-redbox-storage-mongo: ConfigService not available, skipping hook config merge');
      }
      return cb();
    },
    //If each route middleware do not exist sails.lift will fail during hook.load()
    routes: {
      before: {},
      after: {}
    },
    configure: function () {
      // Register MongoDB storage models via sails.config
      // The core-loader hook will pick these up when generating shims
      if (!sails.config.redboxHookModels) {
        sails.config.redboxHookModels = {};
      }
      Object.assign(sails.config.redboxHookModels, MongoModels);
      sails.log.verbose('sails-hook-redbox-storage-mongo: Registered', Object.keys(MongoModels).length, 'models via sails.config.redboxHookModels');
    },
    defaults: {
    }
  }
};
