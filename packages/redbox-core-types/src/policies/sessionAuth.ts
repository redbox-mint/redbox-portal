import { Request, Response, NextFunction } from 'express';

/**
 * SessionAuth Policy
 *
 * Simple policy to allow any authenticated user.
 * Assumes that your login action in one of your controllers sets `req.session.authenticated = true;`
 *
 * @docs http://sailsjs.org/#!/documentation/concepts/Policies
 */
export function sessionAuth(req: Request, res: Response, next: NextFunction): any {
    // User is allowed, proceed to the next policy,
    // or if this is the last policy, the controller
    if ((req as any).session.authenticated) {
        return next();
    }

    // User is not allowed
    // (default res.forbidden() behavior can be overridden in `config/403.js`)
    return res.status(403).send('You are not permitted to perform this action.');
}

export default sessionAuth;
