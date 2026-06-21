/**
 * IsWebServiceAuthenticated Policy
 *
 * Checks if the request is authenticated. If not, attempts bearer token authentication
 * using passport. This is used for API/web service endpoints.
 *
 * For contract-first API routes (/:branding/:portal/api/**), failed authentication
 * returns a 401 JSON response instead of silently proceeding.
 */
function isContractApiRequest(req: Sails.Req): boolean {
    return /\/[^\/]+\/[^\/]+\/api\//.test(req.path);
}

export function isWebServiceAuthenticated(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    if (!req.isAuthenticated()) {
        const passport = sails.config.passport as unknown;
        (passport as { authenticate: (strategy: string, callback: (err: Error | null, user: Record<string, unknown> | false, info: unknown) => void) => (req: Sails.Req, res: Sails.Res) => void }).authenticate('bearer', function (_err: Error | null, user: Record<string, unknown> | false, _info: unknown) {
            if (user !== false) {
                (req as Sails.Req & { redboxApiAuthenticated: boolean }).redboxApiAuthenticated = true;
                req.user = user;
            } else if (isContractApiRequest(req)) {
                res.status(401).json({ message: 'Unauthorized', details: '' });
                return;
            }
            next();
        })(req, res);
    } else {
        next();
    }
}

export default isWebServiceAuthenticated;
