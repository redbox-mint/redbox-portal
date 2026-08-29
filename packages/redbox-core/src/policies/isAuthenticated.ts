/**
 * IsAuthenticated Policy
 *
 * Simple policy to check if the user is authenticated.
 * Returns forbidden if not authenticated.
 */
import { sendAuthorizationProblem } from './authorization-response';

export function isAuthenticated(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  const resolvedPrincipal = req.authorization?.principal;
  if (resolvedPrincipal !== undefined && resolvedPrincipal.category !== 'anonymous' && resolvedPrincipal.active) {
    next();
    return;
  }
  if (resolvedPrincipal === undefined && req.isAuthenticated()) {
    next();
    return;
  }
  sendAuthorizationProblem(req, res, 401, 'authentication-required', 'Authentication is required.');
}

export default isAuthenticated;
