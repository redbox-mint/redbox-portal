const _ = require('lodash');
var configService = require('../../../api/services/ConfigService.js');

module.exports = function (sails) {
  return {
    initialize: function (cb) {
        // merge this Hook's configuration with RB's
        configService.mergeHookConfig('@researchdatabox/sails-hook-redbox-storage-mongo', sails.config);
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
