module.exports = function(req, res, next) {
  var path = req.path;
  var splitPath = path.split('/');

  if (splitPath.length > 3) {
    if (splitPath[2] == "api") {
      sails.config.passport.authenticate('bearer', function(err, user, info) {
        next();
      })(req, res);
    } else {
      next();
    }
  } else {
    next();
  }
};
