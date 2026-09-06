import { randomUUID } from 'node:crypto';
import { isAuthorizationAdministrationError, isAuthorizationResourceError } from '../authorization';
import { AUTHORIZATION_TRANSACTION_UNAVAILABLE } from '../utilities/RequiredTransactionUtils';

export type AuthorizationProblemCode =
  | 'authorization.authentication-required'
  | 'authorization.invalid-credential'
  | 'authorization.scope-denied'
  | 'authorization.resource-denied'
  | 'authorization.csrf-required'
  | 'authorization.not-found'
  | 'authorization.version-conflict'
  | 'authorization.bulk-invalid'
  | 'authorization.invalid-role'
  | 'authorization.protected-role'
  | 'authorization.last-brand-admin'
  | 'authorization.last-system-admin'
  | 'authorization.delegation-ceiling'
  | 'authorization.preview-stale'
  | 'authorization.transaction-unavailable'
  | 'authorization.audit-unavailable'
  | 'authorization.saga-unavailable'
  | 'authorization.query-bound-exceeded'
  | 'authorization.internal-error';

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
      type: `https://redboxresearchdata.com/problems/${code.replaceAll('.', '/')}`,
      title,
      status,
      detail: title,
      code,
      instance,
      requestId,
    });
}

/**
 * AUTH-CAS-HTTP-001: transaction-unavailable is a stable 503 Problem Details
 * response (not a 500). The guarded writers require datastore transactions;
 * when the adapter cannot provide one, callers must see a retryable 503.
 */
export function sendAuthorizationTransactionUnavailable(req: Sails.Req, res: Sails.Res, error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  if (code !== AUTHORIZATION_TRANSACTION_UNAVAILABLE) return false;
  const requestId = ensureAuthorizationRequestId(req);
  const instance = authorizationProblemInstance(req);
  res.status(503).type('application/problem+json').json({
    type: 'https://redboxresearchdata.com/problems/authorization/transaction-unavailable',
    title: 'Authorization persistence is temporarily unavailable.',
    status: 503,
    detail: 'Authorization persistence is temporarily unavailable.',
    code: 'authorization.transaction-unavailable',
    instance,
    requestId,
  });
  return true;
}

/**
 * AUTH-CAS-HTTP-001: stable Problem Details mapping for administration
 * failures. Controllers must call this (not only the resource-error mapper)
 * so version conflicts become 409, validation becomes 422/400, denials stay
 * 401/403/404, and unknown failures become 500 without leaking internals.
 *
 * AUTH-P5-007: `detailSuffix` carries compensation-failure detail so a
 * composite (primary + compensation) failure reports BOTH in the Problem
 * Details body instead of logging the compensation failure only.
 */
export function sendAuthorizationAdministrationError(
  req: Sails.Req,
  res: Sails.Res,
  error: unknown,
  detailSuffix?: string
): boolean {
  if (!isAuthorizationAdministrationError(error)) return false;
  const requestId = ensureAuthorizationRequestId(req);
  const instance = authorizationProblemInstance(req);
  const status = error.status;
  const code = error.code as AuthorizationProblemCode;
  const title =
    status === 409
      ? 'Authorization state changed.'
      : status === 422
        ? 'Authorization request was invalid.'
        : status === 400
          ? 'Authorization request was invalid.'
          : status === 404
            ? 'Resource was not found.'
            : status === 401
              ? 'Authentication is required.'
              : status === 503
                ? 'Authorization persistence is temporarily unavailable.'
                : 'Resource access is denied.';
  const detail = detailSuffix === undefined || detailSuffix.length === 0 ? title : `${title} ${detailSuffix}`;
  res
    .status(status)
    .type('application/problem+json')
    .json({
      type: `https://redboxresearchdata.com/problems/${code.replaceAll('.', '/')}`,
      title,
      status,
      detail,
      code,
      instance,
      requestId,
    });
  return true;
}

/** Returns true when the error was an opaque resource denial and a response was sent. */
export function sendAuthorizationResourceError(req: Sails.Req, res: Sails.Res, error: unknown): boolean {
  if (sendAuthorizationAdministrationError(req, res, error)) return true;
  if (sendAuthorizationTransactionUnavailable(req, res, error)) return true;
  if (!isAuthorizationResourceError(error)) return false;
  if (error.status === 404) {
    sendAuthorizationProblem(req, res, 404, 'authorization.not-found', 'Resource was not found.');
    return true;
  }
  if (error.status === 401) {
    sendAuthorizationProblem(req, res, 401, 'authorization.authentication-required', 'Authentication is required.');
    return true;
  }
  sendAuthorizationProblem(req, res, 403, 'authorization.resource-denied', 'Resource access is denied.');
  return true;
}

/**
 * AUTH-P5-002: mandatory CAS version extraction for user-mutation routes.
 * Returns the caller-observed version when it is a positive safe integer;
 * otherwise `undefined` and the caller MUST fail closed (422) instead of
 * issuing a blind id-only write.
 *
 * Schema boundary: the canonical location is top-level
 * `body.expectedVersion` (or `query.expectedVersion` for query-carried
 * actions such as token generate/revoke). Legacy `{ details: {...} }`
 * envelopes (`UserController.update`, `AdminController.updateUserDetails`)
 * additionally accept a nested `body.details.expectedVersion` fallback so
 * legacy clients that version the whole details payload keep working.
 * When BOTH locations carry a value they must agree numerically; a conflict
 * is ambiguous authority and returns `undefined` (fail closed with 422).
 * A nested value that is present but malformed is NOT ignored: it resolves
 * to `undefined` only when no canonical value exists, otherwise a conflict.
 */
export function parseMandatoryExpectedVersion(req: Sails.Req): number | undefined {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = (req.query ?? {}) as Record<string, unknown>;
  const candidate = body.expectedVersion ?? query.expectedVersion;
  const details = body.details as Record<string, unknown> | undefined;
  const nested =
    details !== undefined && details !== null && typeof details === 'object'
      ? (details as Record<string, unknown>).expectedVersion
      : undefined;
  const toVersion = (value: unknown): number | undefined => {
    const version = typeof value === 'string' && value.trim().length > 0 ? Number(value) : value;
    return typeof version === 'number' && Number.isSafeInteger(version) && version >= 1 ? version : undefined;
  };
  const canonical = toVersion(candidate);
  const fallback = toVersion(nested);
  if (candidate !== undefined && nested !== undefined && canonical !== fallback) return undefined;
  return canonical ?? fallback;
}
