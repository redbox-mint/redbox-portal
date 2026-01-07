import { Request, Response, NextFunction } from 'express';

declare const sails: any;

/**
 * IsWebServiceAuthenticated Policy
 *
 * Checks if the request is authenticated. If not, attempts bearer token authentication
 * using passport. This is used for API/web service endpoints.
 */
export function isWebServiceAuthenticated(req: Request, res: Response, next: NextFunction): void {
    if (!(req as any).isAuthenticated()) {
        sails.config.passport.authenticate('bearer', function (err: any, user: any, info: any) {
            if (user !== false) {
                (req as any).user = user;
            }
            next();
        })(req, res);
    } else {
        next();
    }
}

export default isWebServiceAuthenticated;
