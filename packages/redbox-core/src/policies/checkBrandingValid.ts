import * as BrandingServiceModule from '../services/BrandingService';

declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const _: import('lodash').LoDashStatic;

/**
 * CheckBrandingValid Policy
 *
 * Checks the branding parameter. If it's not present in the availableBrandings
 * array of the BrandingService, returns 404.
 */
export function checkBrandingValid(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): Sails.Res | void {
    const url = req.url;
    const splitUrl = url.split('/');
    let brandingIdx = 1;
    if (req.isSocket) {
        brandingIdx = brandingIdx + 2;
    }
    const portalIdx = brandingIdx + 1;
    const minLength = portalIdx + 1;

    if (splitUrl.length > minLength) {
        const branding = splitUrl[brandingIdx];
        const _portal = splitUrl[portalIdx];
        if (_.includes(BrandingService.getAvailable(), branding)) {
            return next();
        } else {
            // brand not found, use default brand so images, css, etc. resolves
            if (!req.options) req.options = {};
            const locals = (req.options.locals ?? {}) as Record<string, unknown>;
            locals.branding = sails.config.auth.defaultBrand;
            locals.portal = sails.config.auth.defaultPortal;
            req.options.locals = locals;
            sails.log.verbose("In checkBrandingValid, brand not found!!!");
            return res.notFound();
        }
    }
    return next();
}

export default checkBrandingValid;
