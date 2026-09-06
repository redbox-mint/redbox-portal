/**
 * Typed accessors for the authorization services placed on the Sails global by
 * the loader. The structural shapes live here so callers never re-declare
 * `as unknown as {...}` casts per call site; the single cast family in this file
 * is the only place allowed to bridge the loosely typed service globals.
 */

import type { AuthorizationContext, ScopeKey } from '../authorization';

export interface RoleAdministrationServiceAccess {
  grantAssignment(command: Record<string, unknown>): Promise<unknown>;
  revokeAssignment(command: Record<string, unknown>): Promise<unknown>;
  suppressAssignment(command: Record<string, unknown>): Promise<unknown>;
  applyUserRoleSet(command: Record<string, unknown>): Promise<unknown>;
  setUserAccess(command: Record<string, unknown>): Promise<unknown>;
  linkUserAccounts(command: Record<string, unknown>): Promise<unknown>;
}

export interface AuthorizationScopeServiceAccess {
  getRegistry(): {
    isActive(scopeKey: ScopeKey): boolean;
    all: readonly { key: string }[];
  };
}

export interface AuthorizationRuntimeServiceAccess {
  hasScope(context: AuthorizationContext, scopeKey: ScopeKey): boolean;
}

function optionalServiceAccess<T>(serviceName: string): T | undefined {
  const services = (sails as { services?: Record<string, unknown> } | undefined)?.services ?? {};
  const candidate = services[serviceName];
  return candidate === undefined || candidate === null ? undefined : (candidate as T);
}

function requiredServiceAccess<T>(serviceName: string): T {
  const candidate = optionalServiceAccess<T>(serviceName);
  if (candidate === undefined) {
    throw new Error(`The ${serviceName} service is unavailable.`);
  }
  return candidate;
}

/** The guarded role/template/assignment writer. Always required. */
export function roleAdministrationAccess(): RoleAdministrationServiceAccess {
  return requiredServiceAccess<RoleAdministrationServiceAccess>('roleadministrationservice');
}

/** Registry projection used for scope knowledge; may be absent in reduced runtimes. */
export function authorizationScopeAccess(): AuthorizationScopeServiceAccess | undefined {
  return optionalServiceAccess<AuthorizationScopeServiceAccess>('authorizationscopeservice');
}

/** Registry projection for writers that cannot proceed without scope knowledge. */
export function authorizationScopeRequiredAccess(): AuthorizationScopeServiceAccess {
  return requiredServiceAccess<AuthorizationScopeServiceAccess>('authorizationscopeservice');
}

/** Request-context scope evaluation; may be absent in reduced runtimes. */
export function authorizationRuntimeAccess(): AuthorizationRuntimeServiceAccess | undefined {
  return optionalServiceAccess<AuthorizationRuntimeServiceAccess>('authorizationservice');
}
