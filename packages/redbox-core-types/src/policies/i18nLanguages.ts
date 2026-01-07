import { Request, Response, NextFunction } from 'express';

declare const sails: any;
declare const BrandingService: any;
declare const I18nEntriesService: any;

interface LanguageInfo {
    code: string;
    displayName: string;
}

/**
 * I18nLanguages Policy
 *
 * Adds available languages for the current branding to template context.
 */
export async function i18nLanguages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const brandingName = BrandingService.getBrandFromReq(req);
        const branding = BrandingService.getBrand(brandingName);

        if (branding && I18nEntriesService && I18nEntriesService.listBundles) {
            const bundles = await I18nEntriesService.listBundles(branding);
            // Filter to only enabled languages and create objects with code and displayName
            const availableLanguages: LanguageInfo[] = bundles
                .filter((bundle: any) => bundle.enabled !== false && bundle.locale !== 'cimode')
                .map((bundle: any) => ({
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
            (res as any).options.locals = (res as any).options.locals || {};
            (res as any).options.locals.availableLanguages = availableLanguages;
        }
    } catch (e: any) {
        sails.log.warn('[i18nLanguages policy] Error fetching languages:', e?.message || e);
        // Fallback
        res.locals = res.locals || {};
        res.locals.availableLanguages = [{ code: 'en', displayName: 'English' }];
    }

    return next();
}

export default i18nLanguages;
