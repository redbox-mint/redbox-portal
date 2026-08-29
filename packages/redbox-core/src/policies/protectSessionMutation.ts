import { sendAuthorizationProblem } from './authorization-response';

type CsrfMiddleware = (req: Sails.Req, res: Sails.Res, next: (error?: unknown) => void) => void;

// @sailshq/csurf does not publish TypeScript declarations. Keep the untyped
// CommonJS boundary here instead of allowing it to leak into this policy.
const csrf = require('@sailshq/csurf') as () => CsrfMiddleware;
const csrfProtection = csrf();
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function protectSessionMutation(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  if (SAFE_METHODS.has(String(req.method).toUpperCase())) {
    next();
    return;
  }
  if (req.authorizationAuthMethod === 'bearer') {
    next();
    return;
  }
  if (req.authorizationAuthMethod !== 'session') {
    sendAuthorizationProblem(req, res, 401, 'authentication-required', 'Authentication is required.');
    return;
  }

  csrfProtection(req, res, error => {
    if (error === undefined) {
      next();
      return;
    }
    sendAuthorizationProblem(req, res, 403, 'access-denied', 'CSRF token is invalid or missing.');
  });
}

export default protectSessionMutation;
