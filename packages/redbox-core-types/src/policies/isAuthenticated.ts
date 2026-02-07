/**
 * IsAuthenticated Policy
 *
 * Simple policy to check if the user is authenticated.
 * Returns forbidden if not authenticated.
 */
export function isAuthenticated(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    if (req.isAuthenticated()) {
        return next();
    } else {
        res.status(403).json({ message: 'error-please-login' });
    }
}

export default isAuthenticated;
