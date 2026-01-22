import { Request, Response, NextFunction } from 'express';

declare const sails: any;
declare const BrandingService: any;
declare const _: any;

/**
 * CheckBrandingValid Policy
 *
 * Checks the branding parameter. If it's not present in the availableBrandings
 * array of the BrandingService, returns 404.
 */
export function checkBrandingValid(req: Request, res: Response, next: NextFunction): any {
    const url = req.url;
    const splitUrl = url.split('/');
    let brandingIdx = 1;
    if ((req as any).isSocket) {
        brandingIdx = brandingIdx + 2;
    }
    const portalIdx = brandingIdx + 1;
    const minLength = portalIdx + 1;

    if (splitUrl.length > minLength) {
        const branding = splitUrl[brandingIdx];
        const portal = splitUrl[portalIdx];
        if (_.includes(BrandingService.getAvailable(), branding)) {
            return next();
        } else {
            // brand not found, use default brand so images, css, etc. resolves
            (req as any).options.locals.branding = sails.config.auth.defaultBrand;
            (req as any).options.locals.portal = sails.config.auth.defaultPortal;
            sails.log.verbose("In checkBrandingValid, brand not found!!!");
            return (res as any).notFound();
        }
    }
    return next();
}

export default checkBrandingValid;
