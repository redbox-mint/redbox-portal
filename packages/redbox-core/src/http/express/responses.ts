import type { Request, Response } from 'express';
import type { ApiValidationIssue } from '../../api-routes/validation';
import type { ApiRequestInput } from '../../api-routes/types';

export const apiNoCacheHeaders = { 'Cache-Control': 'no-cache, private', Pragma: 'no-cache', Expires: '0' };

/** Preserve header/query negotiation, including the legacy mismatch/unknown fallback. */
export function apiVersion(input: ApiRequestInput): '1.0' | '2.0' {
  const text = (value: unknown) => (value == null ? undefined : String(value).trim().toLowerCase());
  const query = text(input.query?.apiVersion ?? input.query?.apiversion);
  const header = text(input.headers?.['x-redbox-api-version'] ?? input.headers?.['X-ReDBox-Api-Version']);
  if (query && header && query !== header) return '1.0';
  return (header ?? query ?? '1.0') === '2.0' ? '2.0' : '1.0';
}
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

/** The existing validation policy gives a nonempty header priority, even on conflict. */
export function validationApiVersion(input: ApiRequestInput): '1.0' | '2.0' {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
  return (text(input.headers?.['x-redbox-api-version']) || text(input.query?.apiVersion) || '1.0') === '2.0'
    ? '2.0'
    : '1.0';
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
