module.exports = function(req, res, next) {
  // Checks the branding parameter, if it's not present in the availableBrandings array of the BrandingService return 404.
  var url = req.url;
  var splitUrl = url.split('/');
  if (splitUrl.length > 3) {
    var branding = splitUrl[1];
    var portal = splitUrl[2];
    if(_.includes(BrandingService.getAvailable(),branding)) {
      return next();
    } else {
      // brand not found, use default brand so images, css, etc. resolves
      req.options.locals.branding = sails.config.auth.defaultBrand;
      req.options.locals.portal = sails.config.auth.defaultPortal;
      return res.notFound();
    }
  }
  return next();
};
