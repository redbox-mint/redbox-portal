import type { Request, Response } from 'express';
import type { ApiValidationIssue } from '../../api-routes/validation';

export { apiNoCacheHeaders, apiVersion, validationApiVersion } from '../apiResponses';
import { apiNoCacheHeaders, apiVersion, validationApiVersion } from '../apiResponses';
export function sendApiData(req: Request, res: Response, data: unknown, status = 200): void {
  res
    .set(apiNoCacheHeaders)
    .status(status)
    .json(apiVersion(req) === '2.0' ? { data, meta: {} } : data);
}
export function sendApiErrors(
  req: Request,
  res: Response,
  status: number,
  errors: readonly { title?: string; detail?: string; code?: string }[],
  version = apiVersion(req)
): void {
  const only = errors[0] ?? {};
  const body =
    version === '2.0'
      ? { errors, meta: {} }
      : {
          message:
            errors.length === 1
              ? only.title || only.detail || 'An error occurred'
              : errors.map(error => error.detail || error.title || 'An error occurred').join(' | '),
          details: errors.length === 1 && only.title && only.detail ? only.detail : '',
        };
  res.set(apiNoCacheHeaders).status(status).json(body);
}

export function sendApiValidationErrors(req: Request, res: Response, issues: readonly ApiValidationIssue[]): void {
  sendApiErrors(
    req,
    res,
    400,
    issues.map(issue => ({ title: issue.path, detail: issue.message })),
    validationApiVersion(req)
  );
}
