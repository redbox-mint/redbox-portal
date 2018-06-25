module.exports = function(req, res, next) {
  if (req.isSocket) {
    req.isAuthenticated = function() {
      return (req.session.user) ? true : false;
    };
    req.user = req.session.user;
  } else {
    req.session.user = req.user;
  }
  next();
};
