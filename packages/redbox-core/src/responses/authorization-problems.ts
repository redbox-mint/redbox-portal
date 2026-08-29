import {
  AuthorizationPersistenceValidationError,
  AuthorizationValidationError,
  isAuthorizationAdministrationError,
  isAuthorizationResourceError,
} from '../authorization';
import { authorizationProblemInstance, ensureAuthorizationRequestId } from '../policies/authorization-response';
import { isAuthorizationTransactionUnavailableError } from '../utilities/RequiredTransactionUtils';

export type AuthorizationContractProblemStatus = 400 | 401 | 403 | 404 | 409 | 422 | 503 | 500;

interface AuthorizationContractProblem {
  readonly status: AuthorizationContractProblemStatus;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
}

const ADMINISTRATION_TITLES: Readonly<Record<string, string>> = Object.freeze({
  'authorization.authentication-required': 'Authentication is required',
  'authorization.scope-denied': 'Authorization was denied',
  'authorization.not-found': 'Resource was not found',
  'authorization.invalid-query': 'Authorization query is invalid',
  'authorization.invalid-role': 'Role configuration is invalid',
  'authorization.invalid-scope': 'Scope configuration is invalid',
  'authorization.protected-role': 'Protected role operation was rejected',
  'authorization.duplicate-role': 'Role key already exists',
  'authorization.version-conflict': 'Authorization state changed',
  'authorization.preview-stale': 'Authorization preview is stale',
  'authorization.last-brand-admin': 'Brand administrator quorum would be lost',
  'authorization.last-system-admin': 'System administrator quorum would be lost',
  'authorization.delegation-ceiling': 'Delegation ceiling was exceeded',
  'authorization.bulk-invalid': 'Bulk authorization request is invalid',
  'authorization.query-bound-exceeded': 'Authorization query bound was exceeded',
});

function administrationProblem(error: unknown): AuthorizationContractProblem | undefined {
  if (!isAuthorizationAdministrationError(error)) return undefined;
  const title = ADMINISTRATION_TITLES[error.code] ?? 'Authorization request was rejected';
  return { status: error.status, code: error.code, title, detail: title };
}

function resourceProblem(error: unknown): AuthorizationContractProblem | undefined {
  if (!isAuthorizationResourceError(error)) return undefined;
  const title =
    error.status === 404
      ? 'Resource was not found'
      : error.status === 401
        ? 'Authentication is required'
        : 'Resource access was denied';
  return { status: error.status, code: error.code, title, detail: title };
}

function contractProblem(error: unknown): AuthorizationContractProblem {
  const administration = administrationProblem(error);
  if (administration !== undefined) return administration;
  const resource = resourceProblem(error);
  if (resource !== undefined) return resource;
  if (isAuthorizationTransactionUnavailableError(error)) {
    return {
      status: 503,
      code: error.code,
      title: 'Authorization persistence is unavailable',
      detail: 'The required transactional authorization guarantee is unavailable.',
    };
  }
  if (error instanceof AuthorizationValidationError || error instanceof AuthorizationPersistenceValidationError) {
    return {
      status: 400,
      code: `authorization.${error.code}`,
      title: 'Authorization request is invalid',
      detail: 'The authorization request did not satisfy the server contract.',
    };
  }
  return {
    status: 500,
    code: 'authorization.internal-error',
    title: 'Authorization request failed',
    detail: 'The authorization request could not be completed.',
  };
}

function stableAuthorizationErrorType(
  error: unknown
): 'error' | 'type-error' | 'range-error' | 'syntax-error' | 'non-error' {
  if (error instanceof TypeError) return 'type-error';
  if (error instanceof RangeError) return 'range-error';
  if (error instanceof SyntaxError) return 'syntax-error';
  if (error instanceof Error) return 'error';
  return 'non-error';
}

/** Sends one bounded Problem Details response without exposing role topology or persistence errors. */
export function sendAuthorizationContractProblem(req: Sails.Req, res: Sails.Res, error: unknown): void {
  const problem = contractProblem(error);
  const requestId = ensureAuthorizationRequestId(req);
  const instance = authorizationProblemInstance(req);
  if (problem.status === 500) {
    // An error responder must never throw: losing the logger would otherwise turn a
    // bounded Problem Details response into an unhandled exception.
    sails?.log?.error?.('Authorization contract request failed.', {
      requestId,
      errorType: stableAuthorizationErrorType(error),
    });
  }
  res
    .status(problem.status)
    .type('application/problem+json')
    .json({
      type: `https://redboxresearchdata.com/problems/${problem.code.replaceAll('.', '/')}`,
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      instance,
      code: problem.code,
      requestId,
    });
}
