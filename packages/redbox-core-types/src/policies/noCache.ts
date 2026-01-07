import { Request, Response, NextFunction } from 'express';

declare const sails: any;

/**
 * NoCache Policy
 *
 * Sets no-cache headers to prevent caching of responses.
 * Can be selectively applied based on view controller requests and configuration.
 */
export function noCache(req: Request, res: Response, next: NextFunction): any {
    let setHeaders = true;
    // check if this request is RenderViewController related
    if ((req as any).options?.locals?.view !== undefined && (req as any).options?.locals?.view != null) {
        sails.log.verbose(`Render view controller request detected: ${req.path}`);
        // allows caching for view components by default
        setHeaders = false;
        // selectively set cache-control headers for certain paths
        if (sails.config.views.noCache && sails.config.views.noCache.includes(req.path)) {
            setHeaders = true;
        }
    }
    if (setHeaders) {
        sails.log.verbose(`Setting "no cache" headers for ${req.path}`);
        // Set cache-control headers
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
    return next();
}

export default noCache;
