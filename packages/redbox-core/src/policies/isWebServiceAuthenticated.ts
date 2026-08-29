/**
 * IsWebServiceAuthenticated Policy
 *
 * Checks if the request is authenticated. If not, attempts bearer token authentication
 * using passport. This is used for API/web service endpoints.
 */
import { ensureAuthorizationRequestId, sendAuthorizationProblem } from './authorization-response';

type BearerUser = Record<string, unknown>;

interface PassportBearerAuthenticator {
  authenticate(
    strategy: 'bearer',
    callback: (error: Error | null, user: BearerUser | false | null | undefined, info: unknown) => void
  ): (req: Sails.Req, res: Sails.Res) => void;
}

function isPassportBearerAuthenticator(value: unknown): value is PassportBearerAuthenticator {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'authenticate') === 'function';
}

function rejectInvalidBearer(req: Sails.Req, res: Sails.Res): void {
  req.authorizationAuthMethod = 'bearer';
  sendAuthorizationProblem(req, res, 401, 'invalid-bearer-credential', 'Bearer credential is invalid.');
}

export function isWebServiceAuthenticated(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  ensureAuthorizationRequestId(req);
  const header = req.headers.authorization;

  if (header === undefined) {
    req.authorizationAuthMethod = req.isAuthenticated() ? 'session' : 'anonymous';
    next();
    return;
  }

  if (typeof header !== 'string' || !/^Bearer\s+\S+$/iu.test(header.trim())) {
    req.authorizationAuthMethod = 'bearer';
    sendAuthorizationProblem(
      req,
      res,
      401,
      'invalid-authorization-header',
      'Authorization header must contain one non-empty Bearer credential.'
    );
    return;
  }

  const passport = sails.config.passport;
  if (!isPassportBearerAuthenticator(passport)) {
    sendAuthorizationProblem(req, res, 500, 'authorization-unavailable', 'Authorization is unavailable.');
    return;
  }
  passport.authenticate('bearer', (error, user) => {
    if (error != null || user === false || user == null || user.loginDisabled === true || user.active === false) {
      rejectInvalidBearer(req, res);
      return;
    }

    // A valid explicit bearer credential is authoritative for this request, even
    // when a browser session cookie is also present.
    req.user = user;
    req.authorizationAuthMethod = 'bearer';
    next();
  })(req, res);
}

export default isWebServiceAuthenticated;
