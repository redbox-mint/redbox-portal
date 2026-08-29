import { randomUUID } from 'node:crypto';
import { isAuthorizationResourceError } from '../authorization';

export type AuthorizationProblemCode =
  | 'authentication-required'
  | 'invalid-authorization-header'
  | 'invalid-bearer-credential'
  | 'principal-inactive'
  | 'brand-not-found'
  | 'brand-not-authorized'
  | 'access-denied'
  | 'route-authorization-missing'
  | 'resource-not-found'
  | 'resource-denied'
  | 'authorization-unavailable';

const AUTHORIZATION_PROBLEM_MAX_INSTANCE_LENGTH = 2_048;

export function ensureAuthorizationRequestId(req: Sails.Req): string {
  if (req.authorizationRequestId === undefined) {
    req.authorizationRequestId = randomUUID();
  }
  return req.authorizationRequestId;
}

export function authorizationProblemInstance(req: Sails.Req): string {
  const candidate =
    typeof req.path === 'string' && req.path.length > 0
      ? req.path
      : typeof req.originalUrl === 'string'
        ? req.originalUrl
        : '/';
  const pathOnly = candidate.split(/[?#]/u, 1)[0];
  return pathOnly.startsWith('/') ? pathOnly.slice(0, AUTHORIZATION_PROBLEM_MAX_INSTANCE_LENGTH) : '/';
}

export function sendAuthorizationProblem(
  req: Sails.Req,
  res: Sails.Res,
  status: 401 | 403 | 404 | 500,
  code: AuthorizationProblemCode,
  title: string
): void {
  const requestId = ensureAuthorizationRequestId(req);
  const instance = authorizationProblemInstance(req);
  res
    .status(status)
    .type('application/problem+json')
    .json({
      type: `https://redboxresearchdata.com/problems/authorization/${code}`,
      title,
      status,
      detail: title,
      code,
      instance,
      requestId,
    });
}

/** Returns true when the error was an opaque resource denial and a response was sent. */
export function sendAuthorizationResourceError(req: Sails.Req, res: Sails.Res, error: unknown): boolean {
  if (!isAuthorizationResourceError(error)) return false;
  if (error.status === 404) {
    sendAuthorizationProblem(req, res, 404, 'resource-not-found', 'Resource was not found.');
    return true;
  }
  if (error.status === 401) {
    sendAuthorizationProblem(req, res, 401, 'authentication-required', 'Authentication is required.');
    return true;
  }
  sendAuthorizationProblem(req, res, 403, 'resource-denied', 'Resource access is denied.');
  return true;
}
