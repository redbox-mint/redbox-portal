import { Request, Response, NextFunction } from 'express';

/**
 * DisallowedHeadRequestHandler Policy
 *
 * Blocks HEAD requests by returning a 400 Bad Request response.
 */
export function disallowedHeadRequestHandler(req: Request, res: Response, next: NextFunction): any {
    if (req.method === 'HEAD') {
        return res.status(400).send('Bad Request: HEAD method is not allowed');
    }
    return next();
}

export default disallowedHeadRequestHandler;
