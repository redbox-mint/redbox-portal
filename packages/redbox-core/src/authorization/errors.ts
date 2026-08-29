export const AUTHORIZATION_VALIDATION_ERROR_CODES = [
  'scope-key-invalid',
  'role-key-invalid',
  'role-key-new-invalid',
  'hook-package-invalid',
  'scope-namespace-reserved',
  'scope-namespace-unauthorized',
  'scope-definition-duplicate',
  'scope-definition-conflict',
  'scope-definition-invalid',
  'scope-replacement-self',
  'scope-replacement-cycle',
  'scope-replacement-missing',
  'scope-replacement-not-active',
  'scope-replacement-without-deprecation',
] as const;

export type AuthorizationValidationErrorCode = (typeof AUTHORIZATION_VALIDATION_ERROR_CODES)[number];

export class AuthorizationValidationError extends Error {
  readonly code: AuthorizationValidationErrorCode;

  constructor(code: AuthorizationValidationErrorCode, message: string) {
    super(message);
    this.name = 'AuthorizationValidationError';
    this.code = code;
  }
}

export function isAuthorizationValidationError(error: unknown): error is AuthorizationValidationError {
  return error instanceof AuthorizationValidationError;
}

export const AUTHORIZATION_PERSISTENCE_VALIDATION_ERROR_CODES = [
  'audit-event-invalid',
  'role-assignment-context-invalid',
  'role-assignment-guest-forbidden',
  'role-assignment-state-invalid',
  'role-context-invalid',
  'role-identity-invalid',
  'scope-array-invalid',
] as const;

export type AuthorizationPersistenceValidationErrorCode =
  (typeof AUTHORIZATION_PERSISTENCE_VALIDATION_ERROR_CODES)[number];

export class AuthorizationPersistenceValidationError extends Error {
  readonly code: AuthorizationPersistenceValidationErrorCode;

  constructor(code: AuthorizationPersistenceValidationErrorCode, message: string) {
    super(message);
    this.name = 'AuthorizationPersistenceValidationError';
    this.code = code;
  }
}

export const AUTHORIZATION_ADMINISTRATION_ERROR_CODES = [
  'authorization.authentication-required',
  'authorization.scope-denied',
  'authorization.not-found',
  'authorization.invalid-query',
  'authorization.invalid-role',
  'authorization.invalid-scope',
  'authorization.protected-role',
  'authorization.duplicate-role',
  'authorization.version-conflict',
  'authorization.preview-stale',
  'authorization.last-brand-admin',
  'authorization.last-system-admin',
  'authorization.delegation-ceiling',
  'authorization.bulk-invalid',
  'authorization.query-bound-exceeded',
] as const;

export type AuthorizationAdministrationErrorCode = (typeof AUTHORIZATION_ADMINISTRATION_ERROR_CODES)[number];

/**
 * Stable service-layer failure used by the later HTTP adapter. The service does
 * not depend on a controller or HTTP response type, but it preserves the status
 * and bounded problem code required by the authorization contract.
 */
export class AuthorizationAdministrationError extends Error {
  readonly code: AuthorizationAdministrationErrorCode;
  readonly status: 400 | 401 | 403 | 404 | 409 | 422;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: AuthorizationAdministrationErrorCode,
    status: AuthorizationAdministrationError['status'],
    message: string,
    details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'AuthorizationAdministrationError';
    this.code = code;
    this.status = status;
    this.details = details === undefined ? undefined : Object.freeze({ ...details });
  }
}

export function isAuthorizationAdministrationError(error: unknown): error is AuthorizationAdministrationError {
  return error instanceof AuthorizationAdministrationError;
}

export const AUTHORIZATION_RESOURCE_ERROR_CODES = [
  'authorization.authentication-required',
  'authorization.resource-denied',
  'authorization.not-found',
] as const;

export type AuthorizationResourceErrorCode = (typeof AUTHORIZATION_RESOURCE_ERROR_CODES)[number];

/**
 * Opaque service-layer resource denial. The public error deliberately omits
 * the entity identifier, target brand, missing scope and ACL evidence.
 */
export class AuthorizationResourceError extends Error {
  readonly code: AuthorizationResourceErrorCode;
  readonly status: 401 | 403 | 404;

  constructor(code: AuthorizationResourceErrorCode, status: AuthorizationResourceError['status']) {
    super(
      status === 404
        ? 'Resource was not found.'
        : status === 401
          ? 'Authentication is required.'
          : 'Resource access is denied.'
    );
    this.name = 'AuthorizationResourceError';
    this.code = code;
    this.status = status;
  }
}

export function isAuthorizationResourceError(error: unknown): error is AuthorizationResourceError {
  return error instanceof AuthorizationResourceError;
}
