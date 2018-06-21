module.exports = function(req, res, next) {
  // Checks the branding parameter, if it's not present in the availableBrandings array of the BrandingService return 404.
  var url = req.url;
  var splitUrl = url.split('/');
  let brandingIdx = 1;
  if (req.isSocket) {
    brandingIdx = brandingIdx + 2;
  }
  const portalIdx = brandingIdx + 1;
  const minLength = portalIdx + 1;
  if (splitUrl.length > minLength) {
    var branding = splitUrl[brandingIdx];
    var portal = splitUrl[portalIdx];
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
