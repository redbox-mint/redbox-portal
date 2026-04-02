/**
 * IsWebServiceAuthenticated Policy
 *
 * Checks if the request is authenticated. If not, attempts bearer token authentication
 * using passport. This is used for API/web service endpoints.
 */
export function isWebServiceAuthenticated(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    if (!req.isAuthenticated()) {
        const passport = sails.config.passport as unknown as { authenticate: (strategy: string, callback: (err: Error | null, user: Record<string, unknown> | false, info: unknown) => void) => (req: Sails.Req, res: Sails.Res) => void; };
        passport.authenticate('bearer', function (err: Error | null, user: Record<string, unknown> | false, _info: unknown) {
            if (user !== false) {
                req.user = user;
            }
            next();
        })(req, res);
    } else {
        next();
    }
}

export default isWebServiceAuthenticated;
