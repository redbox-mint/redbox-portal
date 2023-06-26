const _ = require('lodash')
const MongoStore = require('connect-mongo');

module.exports = function redboxSession(sessionConfig) {
    let defaultSessionConfig = {
      resave: false,
      saveUninitialized: false
    };
    
    // set the isSessionDisabled function as a property of the sessionConfig object
    defaultSessionConfig.isSessionDisabled = function(req) {
      return !!req.path.match(req._sails.LOOKS_LIKE_ASSET_RX);
    };

    sessionConfig = _.extend(defaultSessionConfig, sessionConfig);

    if(sessionConfig.adapter == "mongo") {
      sessionConfig.store = MongoStore.create(sessionConfig)
    }
    
    // configure express-session using the sessionConfig object
    return require('express-session')(sessionConfig);
};