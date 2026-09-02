import { resolveApiRouteForRequest, validateApiRouteRequest, type ApiRouteDefinition } from '../api-routes';
import {
  buildRecordSchemaInvalidRequestProblem,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../api-routes/record-schema-response';

const RECORD_SCHEMA_CONTROLLER = 'webservice/RecordSchemaController';

function getNoCacheHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-cache, private',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

function getApiVersion(req: Sails.Req): string {
  const queryVersion = typeof req.query?.apiVersion === 'string' ? req.query.apiVersion.trim().toLowerCase() : '';
  const headerVersion =
    typeof req.headers?.['x-redbox-api-version'] === 'string'
      ? req.headers['x-redbox-api-version'].trim().toLowerCase()
      : '';
  return headerVersion || queryVersion || '1.0';
}

function buildV1ErrorResponse(displayErrors: Array<{ title?: string; detail?: string; code?: string }>) {
  if (displayErrors.length === 1) {
    const displayError = displayErrors[0] ?? {};
    const title = displayError.title?.toString()?.trim() || displayError.code?.toString()?.trim() || '';
    const detail = displayError.detail?.toString()?.trim() || '';
    if (title || detail) {
      return {
        message: title || detail || 'An error occurred',
        details: title && detail ? detail : '',
      };
    }
  }

  return {
    message: displayErrors.map(error => error.detail || error.title || error.code || 'An error occurred').join(' | '),
    details: '',
  };
}

function sendPolicyResponse(
  req: Sails.Req,
  res: Sails.Res,
  status: number,
  displayErrors: Array<{ title?: string; detail?: string; code?: string }>
) {
  res.set(getNoCacheHeaders());
  res.status(status);
  return res.json(
    getApiVersion(req) === '2.0' ? { errors: displayErrors, meta: {} } : buildV1ErrorResponse(displayErrors)
  );
}

function isRecordSchemaRoute(route: ApiRouteDefinition): boolean {
  return route.controller === RECORD_SCHEMA_CONTROLLER;
}

function sendRecordSchemaInvalidRequest(req: Sails.Req, res: Sails.Res) {
  const instance = req.path ?? req.originalUrl ?? '/api/records/schemas';
  res.set({
    ...getNoCacheHeaders(),
    'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
    Vary: RECORD_SCHEMA_RESPONSE_VARY,
  });
  res.set('Content-Type', RECORD_SCHEMA_PROBLEM_MEDIA_TYPE);
  res.status(400);
  return res.json(buildRecordSchemaInvalidRequestProblem(instance));
}

function describeRequest(req: Sails.Req, route?: ApiRouteDefinition): string {
  const rawMethod = typeof req.method === 'string' ? req.method.toUpperCase() : '';
  const method = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'].includes(rawMethod) ? rawMethod : 'OTHER';
  const routeIdentifier = route ? `${route.controller}.${route.action}` : 'unresolved-api-route';
  return `${method} ${routeIdentifier}`;
}

function stableErrorType(error: unknown): 'error' | 'type-error' | 'range-error' | 'syntax-error' | 'non-error' {
  if (error instanceof TypeError) return 'type-error';
  if (error instanceof RangeError) return 'range-error';
  if (error instanceof SyntaxError) return 'syntax-error';
  if (error instanceof Error) return 'error';
  return 'non-error';
}

export function validateApiContractRequest(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  let route: ApiRouteDefinition | undefined;
  try {
    route = resolveApiRouteForRequest(req);
    if (!route) {
      sails.log.error(`Failed to resolve contract-first API route for ${describeRequest(req, route)}`);
      sendPolicyResponse(req, res, 500, [{ detail: 'Internal server error' }]);
      return;
    }

    const validated = validateApiRouteRequest(req, route);
    if (!validated.valid) {
      if (isRecordSchemaRoute(route)) {
        sendRecordSchemaInvalidRequest(req, res);
      } else {
        sendPolicyResponse(
          req,
          res,
          400,
          validated.issues.map(issue => ({ title: issue.path, detail: issue.message }))
        );
      }
      return;
    }

    req.apiRoute = route;
    req.apiRequest = {
      params: validated.params,
      query: validated.query,
      headers: validated.headers,
      body: validated.body,
      files: validated.files,
    };
    next();
  } catch (error) {
    sails.log.error(
      'Contract-first API validation failed',
      Object.freeze({
        route: describeRequest(req, route),
        error_type: stableErrorType(error),
      })
    );
    sendPolicyResponse(req, res, 500, [{ detail: 'Internal server error' }]);
  }
}
export default validateApiContractRequest;
