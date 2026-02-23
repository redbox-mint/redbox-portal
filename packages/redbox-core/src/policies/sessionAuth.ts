/**
 * SessionAuth Policy
 *
 * Simple policy to allow any authenticated user.
 * Assumes that your login action in one of your controllers sets `req.session.authenticated = true;`
 *
 * @docs http://sailsjs.org/#!/documentation/concepts/Policies
 */
export function sessionAuth(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    // User is allowed, proceed to the next policy,
    // or if this is the last policy, the controller
    if (req.session.authenticated) {
        return next();
    }

    // User is not allowed
    // (default res.forbidden() behavior can be overridden in `config/403.js`)
    res.status(403).send('You are not permitted to perform this action.');
}

export default sessionAuth;
