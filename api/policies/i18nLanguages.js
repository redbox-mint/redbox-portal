/**
 * I18n Languages Policy
 * 
 * Adds available languages for the current branding to template context
 */

module.exports = async function (req, res, next) {
  try {
    const brandingName = BrandingService.getBrandFromReq(req);
    const branding = BrandingService.getBrand(brandingName);
    
    if (branding && I18nEntriesService && I18nEntriesService.listBundles) {
      const bundles = await I18nEntriesService.listBundles(branding);
      // Filter to only enabled languages and create objects with code and displayName
      const availableLanguages = bundles
        .filter(bundle => bundle.enabled !== false && bundle.locale !== 'cimode')
        .map(bundle => ({
          code: bundle.locale,
          displayName: bundle.displayName || bundle.locale
        }));
      // Make available to templates
      res.locals = res.locals || {};
      res.locals.availableLanguages = availableLanguages;
    } else {
      // Fallback to configured languages with display names
      const configured = sails?.config?.i18n?.next?.init?.supportedLngs || ['en'];
      const availableLanguages = [];
      for (const langCode of configured.filter(lang => lang !== 'cimode')) {
        const displayName = I18nEntriesService && I18nEntriesService.getLanguageDisplayName 
          ? await I18nEntriesService.getLanguageDisplayName(langCode)
          : langCode;
        availableLanguages.push({
          code: langCode,
          displayName: displayName
        });
      }
      res.options.locals = res.options.locals || {};
      res.options.locals.availableLanguages = availableLanguages;
    }
  } catch (e) {
    sails.log.warn('[i18nLanguages policy] Error fetching languages:', e?.message || e);
    // Fallback
    res.locals = res.locals || {};
    res.locals.availableLanguages = [{ code: 'en', displayName: 'English' }];
  }
  
  return next();
};
