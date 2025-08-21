/**
 * I18n Languages Policy
 * 
 * Adds available languages for the current branding to template context
 */

module.exports = async function (req, res, next) {
  try {
    const brandingName = BrandingService.getBrandFromReq(req);
    const branding = BrandingService.getBrand(brandingName);
    
    if (branding && I18nEntriesService && I18nEntriesService.getAvailableLanguagesAsync) {
      const availableLanguages = await I18nEntriesService.getAvailableLanguagesAsync(branding);
      // Make available to templates
      res.locals = res.locals || {};
      res.locals.availableLanguages = availableLanguages.filter(lang => lang !== 'cimode');
    } else {
      // Fallback to configured languages
      const configured = sails?.config?.i18n?.next?.init?.supportedLngs || ['en'];
      res.options.locals = res.options.locals || {};
      res.options.locals.availableLanguages = configured.filter(lang => lang !== 'cimode');
    }
  } catch (e) {
    sails.log.warn('[i18nLanguages policy] Error fetching languages:', e?.message || e);
    // Fallback
    res.locals = res.locals || {};
    res.locals.availableLanguages = ['en'];
  }
  
  return next();
};
