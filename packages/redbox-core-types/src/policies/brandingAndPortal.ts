declare const _: import('lodash').LoDashStatic;

/**
 * BrandingAndPortal Policy
 *
 * Extracts branding and portal from request parameters and stores them
 * in request locals and session for use throughout the request lifecycle.
 */
export function brandingAndPortal(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    const branding = req.param('branding');
    const portal = req.param('portal');

    if (!req.options) req.options = {};
    const locals = (req.options.locals ?? {}) as Record<string, unknown>;
    req.options.locals = locals;

    if (branding != null && locals.branding == null) {
        locals.branding = branding;
        // store in session too, in the case of AAF postback..
        // START Sails 1.0 upgrade
        if (_.isUndefined(req.session)) {
            (req as unknown as Record<string, unknown>).session = {};
        }
        // END Sails 1.0 upgrade
        req.session.branding = branding;
    }

    if (portal != null && locals.portal == null) {
        locals.portal = portal;
        req.session.portal = portal;
    }

    return next();
}

export default brandingAndPortal;
