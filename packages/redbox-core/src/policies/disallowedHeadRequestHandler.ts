/**
 * DisallowedHeadRequestHandler Policy
 *
 * Blocks HEAD requests by returning a 400 Bad Request response.
 */
export function disallowedHeadRequestHandler(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    if (req.method === 'HEAD') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.status(400).send('Bad Request: HEAD method is not allowed');
        return;
    }
    return next();
}

export default disallowedHeadRequestHandler;
