/**
 * PrepWs Policy
 *
 * Prepares WebSocket requests by setting up isAuthenticated method
 * and synchronizing user between request and session.
 */
export function prepWs(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    if (req.isSocket) {
        (req as unknown as Record<string, unknown>).isAuthenticated = function (): boolean {
            return req.session.user ? true : false;
        };
        req.user = req.session.user;
    } else {
        req.session.user = (req.user ?? {}) as Record<string, unknown>;
    }
    next();
}

export default prepWs;
