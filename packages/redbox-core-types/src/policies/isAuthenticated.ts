import { Request, Response, NextFunction } from 'express';

/**
 * IsAuthenticated Policy
 *
 * Simple policy to check if the user is authenticated.
 * Returns forbidden if not authenticated.
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction): any {
    if ((req as any).isAuthenticated()) {
        return next();
    } else {
        return res.status(403).json({ message: 'error-please-login' });
    }
}

export default isAuthenticated;
