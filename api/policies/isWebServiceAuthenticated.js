module.exports = function(req, res, next) {
  var contentTypeHeader = req.headers["content-type"] == null ? "" : req.headers["content-type"];

  if (!req.isAuthenticated()) {
    sails.config.passport.authenticate('bearer', function(err, user, info) {
      if(user != false) {
        req.user = user;
      }
      next();
    })(req, res);
  } else {
    next();
  }

};
