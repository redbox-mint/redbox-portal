import { resolveApiRouteForRequest, validateApiRouteRequest } from '../api-routes';

function getNoCacheHeaders(): Record<string, string> {
  return {
    'Cache-control': 'no-cache, private',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

function getApiVersion(req: Sails.Req): string {
  const queryVersion = typeof req.query?.apiVersion === 'string' ? req.query.apiVersion.trim().toLowerCase() : '';
  const headerVersion = typeof req.headers?.['x-redbox-api-version'] === 'string'
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
  return res.json(getApiVersion(req) === '2.0'
    ? { errors: displayErrors, meta: {} }
    : buildV1ErrorResponse(displayErrors));
}

function describeRequest(req: Sails.Req): string {
  return `${String(req.method).toUpperCase()} ${req.path ?? req.originalUrl}`;
}

export function validateApiContractRequest(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  try {
    const route = resolveApiRouteForRequest(req);
    if (!route) {
      sails.log.error(`Failed to resolve contract-first API route for ${describeRequest(req)}`);
      sendPolicyResponse(req, res, 500, [{ detail: 'Internal server error' }]);
      return;
    }

    const validated = validateApiRouteRequest(req, route);
    if (!validated.valid) {
      sendPolicyResponse(req, res, 400, validated.issues.map(issue => ({ title: issue.path, detail: issue.message })));
      return;
    }

    req.apiRoute = route;
    req.apiRequest = {
      params: validated.params,
      query: validated.query,
      body: validated.body,
      files: validated.files,
    };
    next();
  } catch (error) {
    sails.log.error(`Contract-first API validation failed for ${describeRequest(req)}`, error);
    sendPolicyResponse(req, res, 500, [{ detail: 'Internal server error' }]);
  }
}
export default validateApiContractRequest;
