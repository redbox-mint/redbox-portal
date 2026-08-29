import {
  buildRecordSchemaForbiddenProblem,
  getMatchedRoutePath,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
  resolveRouteAuthorizationForRequest,
} from '../api-routes';
import { createRouteId, type AuthorizationContext } from '../authorization';
import type { AuthorizationRolloutInput, AuthorizationRolloutResult } from '../services/AuthorizationRolloutService';
import { ensureAuthorizationRequestId, sendAuthorizationProblem } from './authorization-response';

interface RequestRolloutService {
  evaluateRequest(input: AuthorizationRolloutInput): AuthorizationRolloutResult;
}

function isRequestRolloutService(value: unknown): value is RequestRolloutService {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'evaluateRequest') === 'function';
}

function isRecordSchemaRequest(req: Sails.Req): boolean {
  return (getMatchedRoutePath(req) ?? req.path ?? '').includes('/api/records/schemas');
}

function sendRecordSchemaForbidden(req: Sails.Req, res: Sails.Res): void {
  const instance = req.path ?? req.originalUrl ?? '/api/records/schemas';
  res.set({
    'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
    Vary: RECORD_SCHEMA_RESPONSE_VARY,
    'Content-Type': RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  });
  res.status(403).json(buildRecordSchemaForbiddenProblem(instance));
}

function acceptsHtml(req: Sails.Req): boolean {
  const method = String(req.method).toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  if ((req.path ?? '').split('/').includes('api')) return false;
  const accept = req.headers.accept;
  return accept === undefined || (typeof accept === 'string' && accept.includes('text/html'));
}

function redirectAnonymousBrowser(req: Sails.Req, res: Sails.Res, context: AuthorizationContext): boolean {
  if (context.principal.category !== 'anonymous' || !acceptsHtml(req)) return false;
  const redirect = sails.getActions()['user/redirlogin'];
  if (typeof redirect !== 'function') return false;
  (redirect as (request: Sails.Req, response: Sails.Res) => void)(req, res);
  return true;
}

function respondDenied(
  req: Sails.Req,
  res: Sails.Res,
  context: AuthorizationContext,
  result: AuthorizationRolloutResult
): void {
  if (isRecordSchemaRequest(req)) {
    sendRecordSchemaForbidden(req, res);
    return;
  }
  if (result.reasonCode === 'brand-not-found') {
    sendAuthorizationProblem(req, res, 404, 'brand-not-found', 'Brand was not found.');
    return;
  }
  if (result.reasonCode === 'principal-inactive') {
    sendAuthorizationProblem(req, res, 401, 'principal-inactive', 'Principal is inactive.');
    return;
  }
  if (redirectAnonymousBrowser(req, res, context)) return;
  if (context.principal.category === 'anonymous') {
    sendAuthorizationProblem(req, res, 401, 'authentication-required', 'Authentication is required.');
    return;
  }
  if (result.reasonCode === 'brand-not-authorized') {
    sendAuthorizationProblem(req, res, 403, 'brand-not-authorized', 'Brand access is not authorized.');
    return;
  }
  if (result.scopeDecision.requiredScope === undefined && result.reasonCode === 'scope-missing') {
    sendAuthorizationProblem(req, res, 403, 'route-authorization-missing', 'Route authorization is unavailable.');
    return;
  }
  sendAuthorizationProblem(req, res, 403, 'access-denied', 'Access is denied.');
}

export function authorizeRequest(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  const companionAuthorized = (req as Sails.Req & { companionAttachmentUploadAuthorized?: boolean })
    .companionAttachmentUploadAuthorized;
  if (companionAuthorized === true) {
    next();
    return;
  }

  const context = req.authorization;
  if (context === undefined) {
    sendAuthorizationProblem(req, res, 500, 'authorization-unavailable', 'Authorization context is unavailable.');
    return;
  }

  try {
    const resolvedRoute = resolveRouteAuthorizationForRequest(req);
    const routeId =
      resolvedRoute?.routeId ??
      createRouteId({ method: req.method, path: getMatchedRoutePath(req) ?? '/unclassified-route' });
    const rolloutService = sails.services.authorizationrolloutservice;
    if (!isRequestRolloutService(rolloutService)) throw new Error('AuthorizationRolloutService is unavailable.');
    const result = rolloutService.evaluateRequest({
      req,
      context,
      authorization: resolvedRoute?.authorization,
      routeId,
      requestId: ensureAuthorizationRequestId(req),
    });
    if (result.allowed) {
      next();
      return;
    }
    respondDenied(req, res, context, result);
  } catch {
    sails.log.error('Route authorization evaluation failed.', {
      requestId: req.authorizationRequestId,
      errorCode: 'evaluation-failed',
    });
    sendAuthorizationProblem(req, res, 500, 'authorization-unavailable', 'Authorization is unavailable.');
  }
}

export default authorizeRequest;
