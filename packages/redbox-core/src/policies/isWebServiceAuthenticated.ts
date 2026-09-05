/**
 * IsWebServiceAuthenticated Policy
 *
 * Checks if the request is authenticated. If not, attempts bearer token authentication
 * using passport. This is used for API/web service endpoints.
 */
import { ensureAuthorizationRequestId, sendAuthorizationProblem } from './authorization-response';
import { asScopeKey, AUTHORIZATION_MAX_SCOPE_SET_SIZE } from '../authorization';

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
  sendAuthorizationProblem(req, res, 401, 'authorization.invalid-credential', 'Bearer credential is invalid.');
}

function passportTokenScopeCeiling(info: unknown): readonly string[] | undefined {
  if (typeof info !== 'object' || info === null || !Object.prototype.hasOwnProperty.call(info, 'scopeKeys')) {
    return undefined;
  }
  const value = Reflect.get(info, 'scopeKeys');
  if (
    !Array.isArray(value) ||
    value.length > AUTHORIZATION_MAX_SCOPE_SET_SIZE ||
    !value.every(scopeKey => typeof scopeKey === 'string')
  ) {
    throw new Error('Bearer scope ceiling is malformed.');
  }
  return Object.freeze([...new Set(value.map(scopeKey => String(asScopeKey(scopeKey))))].sort());
}

export function isWebServiceAuthenticated(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  ensureAuthorizationRequestId(req);
  delete req.authorizationTokenScopeCeiling;
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
      'authorization.invalid-credential',
      'Authorization header must contain one non-empty Bearer credential.'
    );
    return;
  }

  const passport = sails.config.passport;
  if (!isPassportBearerAuthenticator(passport)) {
    sendAuthorizationProblem(req, res, 500, 'authorization.internal-error', 'Authorization is unavailable.');
    return;
  }
  passport.authenticate('bearer', (error, user, info) => {
    if (error != null || user === false || user == null || user.loginDisabled === true || user.active === false) {
      rejectInvalidBearer(req, res);
      return;
    }

    try {
      // The Passport verifier is the only authority allowed to attach a token
      // ceiling. Preserve an explicit empty ceiling (deny every scoped action)
      // and reject malformed ceilings before context construction.
      const tokenScopeCeiling = passportTokenScopeCeiling(info);
      if (tokenScopeCeiling !== undefined) req.authorizationTokenScopeCeiling = tokenScopeCeiling;
      req.user = user;
      req.authorizationAuthMethod = 'bearer';
      next();
    } catch {
      rejectInvalidBearer(req, res);
    }
  })(req, res);
}

export default isWebServiceAuthenticated;
