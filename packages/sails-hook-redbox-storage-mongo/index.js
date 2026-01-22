// Import the compiled model definitions
const { MongoModels } = require('./api/models');

module.exports = function (sails) {
  return {
    initialize: function (cb) {
      // Configuration is now loaded by redbox-loader at pre-lift time via registerRedboxConfig()
      // However, services (api/services/) still need to be loaded via mergeHookConfig until
      // that functionality is migrated to redbox-loader in a future PR.
      if (sails.services && sails.services.configservice) {
        // Only merge services/controllers, config is handled by registerRedboxConfig()
        sails.services.configservice.mergeHookConfig('@researchdatabox/sails-hook-redbox-storage-mongo', sails.config);
      } else {
        sails.log.warn('sails-hook-redbox-storage-mongo: ConfigService not available, skipping service loading');
      }
      return cb();
    },
    //If each route middleware do not exist sails.lift will fail during hook.load()
    routes: {
      before: {},
      after: {}
    },
    configure: function () {
    },
    defaults: {
    }
  }
};

module.exports.registerRedboxModels = function () {
  return MongoModels;
};

/**
 * Register hook configuration for redbox-loader.
 * This is called at pre-lift time to merge config with core config.
 */
module.exports.registerRedboxConfig = function () {
  return {
    storage: require('./config/storage').storage,
    record: require('./config/record').record
  };
};
