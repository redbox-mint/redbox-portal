module.exports = function redboxSession() {
    return function(req, res, next) {
        let sessionConfig = req._sails.config.redboxSession;
        sessionConfig = _.extend({
            isSessionDisabled: function (req){
                return !!req.path.match(req._sails.LOOKS_LIKE_ASSET_RX);
              },
          resave: false,
          saveUninitialized: false
        }, sessionConfig)
        return require('express-session')(sessionConfig)(req,res,next)
    }
    
  };