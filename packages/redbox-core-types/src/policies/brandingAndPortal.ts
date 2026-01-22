import { Request, Response, NextFunction } from 'express';

declare const _: any;

/**
 * BrandingAndPortal Policy
 *
 * Extracts branding and portal from request parameters and stores them
 * in request locals and session for use throughout the request lifecycle.
 */
export function brandingAndPortal(req: Request, res: Response, next: NextFunction): void {
    const branding = (req as any).param('branding');
    const portal = (req as any).param('portal');

    if ((req as any).options.locals == null) {
        (req as any).options.locals = {};
    }

    if (branding != null && (req as any).options.locals.branding == null) {
        (req as any).options.locals.branding = branding;
        // store in session too, in the case of AAF postback..
        // START Sails 1.0 upgrade
        if (_.isUndefined((req as any).session)) {
            (req as any).session = {};
        }
        // END Sails 1.0 upgrade
        (req as any).session.branding = branding;
    }

    if (portal != null && (req as any).options.locals.portal == null) {
        (req as any).options.locals.portal = portal;
        (req as any).session.portal = portal;
    }

    return next();
}

export default brandingAndPortal;
