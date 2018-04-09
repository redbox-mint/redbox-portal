module.exports = function(req, res, next) {
  var branding = req.param('branding');
  var portal = req.param('portal');
  if(req.options.locals == null) {
    req.options.locals = {};
  }
  if (branding != null && req.options.locals.branding == null) {
    req.options.locals.branding = branding;
    // store in session too, in the case of AAF postback..
    // START Sails 1.0 upgrade
    if (_.isUndefined(req.session)) {
      req.session = {};
    }
    // END Sails 1.0 upgrade
    req.session.branding = branding;
  }
  if (portal != null && req.options.locals.portal == null ){
    req.options.locals.portal = portal;
    req.session.portal = portal;
  }

  return next();
};
