import * as BrandingServiceModule from '../services/BrandingService';
import * as I18nEntriesServiceModule from '../services/I18nEntriesService';

declare const BrandingService: {
    getBrandNameFromReq(req: Sails.Req): string;
    getBrand(name: string): ReturnType<BrandingServiceModule.Services.Branding['getBrand']>;
};
declare const I18nEntriesService: I18nEntriesServiceModule.Services.I18nEntries;

interface LanguageInfo {
    code: string;
    displayName: string;
}

/**
 * I18nLanguages Policy
 *
 * Adds available languages for the current branding to template context.
 */
export async function i18nLanguages(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): Promise<void> {
    try {
        const brandingName = BrandingService.getBrandNameFromReq(req);
        const branding = BrandingService.getBrand(brandingName);

        if (branding && I18nEntriesService && I18nEntriesService.listBundles) {
            const bundles = await I18nEntriesService.listBundles(branding);
            // Filter to only enabled languages and create objects with code and displayName
            const availableLanguages: LanguageInfo[] = bundles
                .filter((bundle) => bundle.enabled !== false && bundle.locale !== 'cimode')
                .map((bundle) => ({
                    code: bundle.locale,
                    displayName: bundle.displayName || bundle.locale
                }));
            // Make available to templates
            res.locals = res.locals || {};
            res.locals.availableLanguages = availableLanguages;
        } else {
            // Fallback to configured languages with display names
            const configured: string[] = sails?.config?.i18n?.next?.init?.supportedLngs || ['en'];
            const availableLanguages: LanguageInfo[] = [];
            for (const langCode of configured.filter((lang: string) => lang !== 'cimode')) {
                const displayName = I18nEntriesService && I18nEntriesService.getLanguageDisplayName
                    ? await I18nEntriesService.getLanguageDisplayName(langCode)
                    : langCode;
                availableLanguages.push({
                    code: langCode,
                    displayName: displayName
                });
            }
            const resOpts = res as unknown as { options: { locals: Record<string, unknown> } };
            if (!resOpts.options) (resOpts as unknown as { options: unknown }).options = { locals: {} };
            if (!resOpts.options.locals) resOpts.options.locals = {};
            resOpts.options.locals.availableLanguages = availableLanguages;
        }
    } catch (e: unknown) {
        sails.log.warn('[i18nLanguages policy] Error fetching languages:', e instanceof Error ? e.message : e);
        // Fallback
        res.locals = res.locals || {};
        res.locals.availableLanguages = [{ code: 'en', displayName: 'English' }];
    }

    return next();
}

export default i18nLanguages;
