import { asScopeKey, createScopeRegistry, type AuthorizationContext } from '../../src/authorization';
import {
  Services as AuthorizationServices,
  type AuthorizationAssignmentSourceRecord,
  type AuthorizationRoleSourceRecord,
  type AuthorizationTemplateRevisionSourceRecord,
} from '../../src/services/AuthorizationService';
import {
  createSystemProcessContextInternal,
  type AuthorizationActorIssuerDependencies,
} from '../../src/services/AuthorizationActorIssuer';

/**
 * AUTH-P5-001 genuine-actor helper. Tests must never mint actor provenance
 * themselves: `authorization/context` exports no issuer, marker, or
 * predicate, and `services/AuthorizationService` exposes no issuance or
 * verification methods either. Every actor below is issued through the
 * internal issuer module (`createSystemProcessContextInternal` with a stub
 * brand/registry) or the real `AuthorizationService` resolver
 * (`resolveUserContext`), so the internal `isTrusted...` predicate
 * recognizes it exactly as production-issued contexts are recognized.
 */
const ACTOR_SCOPE_RISKS: Record<string, 'admin' | 'read' | 'write' | 'system'> = {
  'authorization.assignment.manage': 'admin',
  'authorization.assignment.read': 'read',
  'authorization.role.manage': 'admin',
  'authorization.role.read': 'read',
  'authorization.self.read': 'read',
  'portal.home.read': 'read',
  'record.destroy': 'admin',
  'record.read': 'read',
  'record.update': 'write',
  'system.authorization.manage': 'system',
  'user.account-link.manage': 'admin',
  'user.manage': 'admin',
  'user.token.manage': 'admin',
};

let genuineActorNonce = 0;

function issuerDepsForBrand(brandId: string | undefined): AuthorizationActorIssuerDependencies {
  const registry = testActorRegistry();
  return {
    getRegistry: () => registry,
    resolveBrand: async () => (brandId === undefined ? undefined : { id: brandId, name: 'Brand 1' }),
  };
}

export async function genuineBrandActor(
  scopes: readonly string[] = ['authorization.assignment.manage'],
  brandId = 'brand-1'
): Promise<AuthorizationContext> {
  genuineActorNonce += 1;
  return createSystemProcessContextInternal(
    issuerDepsForBrand(brandId),
    `genuine-actor-test-${genuineActorNonce}`,
    brandId,
    [...scopes]
  );
}

/** Brand-less system job actor for `system.*` scopes (brand filtering drops them otherwise). */
export async function genuineSystemActor(
  scopes: readonly string[] = ['system.authorization.manage']
): Promise<AuthorizationContext> {
  genuineActorNonce += 1;
  return createSystemProcessContextInternal(
    issuerDepsForBrand(undefined),
    `genuine-system-test-${genuineActorNonce}`,
    undefined,
    [...scopes]
  );
}

export interface GenuineTestActorInput {
  readonly contextType?: 'brand' | 'system';
  readonly principal?: {
    readonly category?: string;
    readonly authMethod?: 'session' | 'bearer' | 'internal' | string;
    readonly active?: boolean;
    readonly userId?: string;
    readonly username?: string;
    readonly operationId?: string;
  };
  readonly brand?: {
    readonly id?: string;
    readonly name?: string;
    readonly requestedIdentifier?: string;
    readonly exists?: boolean;
    readonly authorized?: boolean;
  };
  readonly effectiveScopeKeys?: readonly unknown[];
  readonly grantedScopeKeys?: readonly unknown[];
  /** Accepted and ignored: the resolver re-derives roles/provenance from storage. */
  readonly roles?: readonly unknown[];
  readonly compatibilityRoles?: readonly unknown[];
  readonly scopeProvenance?: readonly unknown[];
  /**
   * Extra scopes carried by the stub system-admin template revision (alongside
   * the claimed `system.*` scopes). Models the legitimate production shape of
   * a system administrator whose system template also holds read scopes,
   * which configuration import's delegation ceiling requires to be proven via
   * a system role. Defaults to none: brand scopes stay on the brand role so
   * cross-brand delegation tests observe the genuine ceiling.
   */
  readonly systemRoleScopeKeys?: readonly string[];
}

/**
 * Generic genuine replacement for the removed test minters. Reads only the
 * authority-relevant fields (context type, principal shape, brand binding,
 * claimed scopes) and issues a fresh context through the internal issuer
 * (system-process) or the real `AuthorizationService` resolver
 * (user sessions). Stale spread fields (roles, provenance) are ignored
 * because the resolver re-derives them.
 */
export async function genuineTestActor(input: GenuineTestActorInput): Promise<AuthorizationContext> {
  const claimed = [...(input.effectiveScopeKeys ?? input.grantedScopeKeys ?? [])].map(value => String(value));
  const authMethod = input.principal?.authMethod;
  const contextType = input.contextType ?? 'brand';
  if (authMethod === 'internal' || input.principal?.category === 'system-process') {
    const brandId = contextType === 'brand' ? (input.brand?.id ?? 'brand-1') : undefined;
    genuineActorNonce += 1;
    return createSystemProcessContextInternal(
      issuerDepsForBrand(brandId),
      `genuine-test-${genuineActorNonce}`,
      brandId,
      claimed
    );
  }
  if (contextType === 'system') {
    // Production issues system contexts only to internal system-process jobs;
    // a session/system combination is not genuinely issuable, so bind the
    // system scopes to a brand-less system job.
    return genuineSystemActor(claimed);
  }
  const brandId = input.brand?.id ?? 'brand-1';
  const userId = input.principal?.userId ?? 'operator-1';
  const username = input.principal?.username ?? 'operator';
  const method = authMethod === 'bearer' ? 'bearer' : 'session';
  const brandScopes = claimed.filter(scope => !scope.startsWith('system.'));
  const systemScopes = claimed.filter(scope => scope.startsWith('system.'));
  const registry = testActorRegistry();
  const assignments: AuthorizationAssignmentSourceRecord[] = [];
  const roles: AuthorizationRoleSourceRecord[] = [];
  const revisions: AuthorizationTemplateRevisionSourceRecord[] = [];
  if (brandScopes.length > 0) {
    roles.push({
      id: 'test-brand-role',
      name: 'researcher',
      key: 'researcher',
      displayName: 'Researchers',
      branding: brandId,
      contextType: 'brand',
      template: 'test-brand-template',
      templateRevision: 1,
      protectedKind: 'none',
      status: 'active',
    });
    assignments.push({
      id: 'test-brand-assignment',
      principalId: userId,
      role: 'test-brand-role',
      branding: brandId,
      source: 'manual',
      sourceKey: 'genuine-test',
      status: 'active',
      sourcePresent: true,
    });
    revisions.push({ id: 'test-brand-revision', template: 'test-brand-template', revision: 1, scopeKeys: brandScopes });
  }
  if (systemScopes.length > 0) {
    // The system role carries the system scopes plus any explicitly modeled
    // system-template scopes (see `systemRoleScopeKeys`). Brand scopes are
    // never mirrored implicitly: cross-brand delegation tests rely on a
    // brand-only scope NOT being delegable into another brand, and the
    // resolver itself rejects system scopes on brand roles, so mixing them
    // implicitly would forge a combination no genuine resolver could issue.
    const systemRevisionScopes = [...systemScopes, ...(input.systemRoleScopeKeys ?? [])];
    roles.push({
      id: 'test-system-role',
      name: 'system-admin',
      key: 'system-admin',
      displayName: 'System administrators',
      contextType: 'system',
      template: 'test-system-template',
      templateRevision: 1,
      protectedKind: 'system-admin',
      status: 'active',
    });
    assignments.push({
      id: 'test-system-assignment',
      principalId: userId,
      role: 'test-system-role',
      source: 'manual',
      sourceKey: 'genuine-test',
      status: 'active',
      sourcePresent: true,
    });
    revisions.push({
      id: 'test-system-revision',
      template: 'test-system-template',
      revision: 1,
      scopeKeys: systemRevisionScopes,
    });
  }
  const service = new AuthorizationServices.AuthorizationService({
    getRegistry: () => registry,
    resolveBrand: async () => ({ id: brandId, name: 'Brand 1' }),
    findUser: async () => ({ id: userId, username, loginDisabled: false }),
    findAssignments: async () => assignments,
    findRoles: async () => roles,
    findTemplateRevisions: async () => revisions,
    findRoleScopeOverrides: async () => [],
  });
  return service.resolveUserContext(userId, brandId, method);
}

function testActorRegistry(): ReturnType<typeof createScopeRegistry> {
  return createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0-test',
      definitions: Object.entries(ACTOR_SCOPE_RISKS).map(([key, risk]) => ({
        key: asScopeKey(key),
        label: key,
        description: `${key} (genuine-actor test registry).`,
        risk,
      })),
    },
  ]);
}
