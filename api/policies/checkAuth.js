module.exports = function(req, res, next) {
  var brand = BrandingService.getBrand(req.session.branding);
  if (!brand) {
    sails.log.verbose("In checkAuth, no branding found.");
    // invalid brand
    return res.notFound({
      branding: sails.config.auth.defaultBrand,
      portal: sails.config.auth.defaultPortal
    });
  }
  var roles;
  // sails.log.verbose("User is....");
  // sails.log.verbose(req.user);
  if (req.isAuthenticated()) {
    roles = req.user.roles;
  } else {
    // assign default role if needed...
    roles = [];
    roles.push(RolesService.getDefUnathenticatedRole(brand));
  }
  // get the rules if any....
  var rules = PathRulesService.getRulesFromPath(req.path, brand);
  if (rules) {
    // populate variables if this user has a role that can read or write...
    // sails.log.verbose("Has rules for path:" + req.path);
    // sails.log.verbose(roles);
    var canRead = PathRulesService.canRead(rules, roles, brand.name);
    // TODO: add assertions...
    if (!canRead) {
      if (req.isAuthenticated()) {
        return res.forbidden();
      } else {
        var contentTypeHeader = req.headers["content-type"] == null ? "" : req.headers["content-type"];
        if (contentTypeHeader.indexOf("application/json") != -1) {
          return res.forbidden({message: "Access Denied"});
        } else {
          return sails.getActions()['user/redirlogin'](req, res);
        }
      }
    }
  } else {
    sails.log.verbose("No rules for path:" + req.path);
  }
  // no rules can proceed...
  return next();
}
