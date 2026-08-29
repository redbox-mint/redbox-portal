import { Services as services } from '../CoreService';
import {
  AUTHORIZATION_ROLE_STATUSES,
  AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS,
  GUEST_SCOPE_ALLOWLIST,
  PROTECTED_ROLE_KINDS,
  ROLE_ASSIGNMENT_SOURCES,
  ROLE_ASSIGNMENT_STATUSES,
  ROLE_CONTEXT_TYPES,
  ROLE_SCOPE_EFFECTS,
  asRoleKey,
  asScopeKey,
  compareScopeKeys,
  createAnonymousAuthorizationPrincipal,
  createLegacyBearerAuthorizationPrincipal,
  createUserAuthorizationPrincipal,
  decideAuthorization,
  freezeAuthorizationContext,
  getRoleEffectiveScopes,
  type AuthorizationAuthMethod,
  type AuthorizationCompatibilityRole,
  type AuthorizationContext,
  type AuthorizationDecision,
  type AuthorizationExplanationResult,
  type AuthorizationRecordAclOutcome,
  type AuthorizationResolutionEvidence,
  type AuthorizationResolvedBrand,
  type AuthorizationResolvedPrincipal,
  type AuthorizationScopeProvenance,
  type EffectiveAuthorizationRole,
  type ProtectedRoleKind,
  type RoleAssignmentSource,
  type RoleContextType,
  type RoleScopeEffect,
  type ScopeKey,
  type ScopeRegistry,
} from '../authorization';

const MAX_LINK_DEPTH = 16;

export type AuthorizationUserAuthMethod = Extract<AuthorizationAuthMethod, 'session' | 'bearer'>;
export type AuthorizationRecordMode = 'read' | 'update';

export interface AuthorizationBrandSourceRecord {
  readonly id: string | number;
  readonly name?: string;
}

export interface AuthorizationUserSourceRecord {
  readonly id: string | number;
  readonly username: string;
  readonly linkedPrimaryUserId?: string;
  readonly accountLinkState?: 'active' | 'linked-alias';
  readonly loginDisabled?: boolean;
}

export interface AuthorizationAssignmentSourceRecord {
  readonly id: string | number;
  readonly principalId: string;
  readonly role: unknown;
  readonly branding?: unknown;
  readonly source: RoleAssignmentSource;
  readonly sourceKey: string;
  readonly status: 'active' | 'revoked' | 'suppressed';
  readonly sourcePresent: boolean;
  readonly expiresAt?: string | Date | null;
  readonly revokedAt?: string | Date | null;
  readonly suppressedAt?: string | Date | null;
}

export interface AuthorizationRoleSourceRecord {
  readonly id: string | number;
  readonly name: string;
  readonly key?: string;
  readonly displayName?: string;
  readonly branding?: unknown;
  readonly contextType?: RoleContextType;
  readonly template?: unknown;
  readonly templateRevision?: number;
  readonly protectedKind?: ProtectedRoleKind;
  readonly status?: 'active' | 'inactive';
}

export interface AuthorizationTemplateRevisionSourceRecord {
  readonly id: string | number;
  readonly template: unknown;
  readonly revision: number;
  readonly scopeKeys: readonly string[];
}

export interface AuthorizationRoleScopeOverrideSourceRecord {
  readonly id: string | number;
  readonly role: unknown;
  readonly scopeKey: string;
  readonly effect: RoleScopeEffect;
}

export interface AuthorizationTemplateRevisionReference {
  readonly templateId: string;
  readonly revision: number;
}

export interface AuthorizationRecordAclInput {
  readonly context: AuthorizationContext;
  readonly record: Readonly<Record<string, unknown>>;
  readonly mode: AuthorizationRecordMode;
}

export interface AuthorizationExplanationResource {
  readonly found?: boolean;
  readonly brandId?: string;
  readonly recordAcl?: AuthorizationRecordAclOutcome;
}

export interface AuthorizationServiceDependencies {
  readonly now: () => Date;
  readonly getRegistry: () => ScopeRegistry;
  readonly resolveBrand: (identifier: string) => Promise<AuthorizationBrandSourceRecord | undefined>;
  readonly findUser: (identifier: string) => Promise<AuthorizationUserSourceRecord | undefined>;
  readonly findAssignments: (
    principalId: string,
    brandId: string,
    activeAt: Date
  ) => Promise<readonly AuthorizationAssignmentSourceRecord[]>;
  readonly findRoles: (
    roleIds: readonly string[],
    brandId?: string
  ) => Promise<readonly AuthorizationRoleSourceRecord[]>;
  readonly findTemplateRevisions: (
    references: readonly AuthorizationTemplateRevisionReference[]
  ) => Promise<readonly AuthorizationTemplateRevisionSourceRecord[]>;
  readonly findRoleScopeOverrides: (
    roleIds: readonly string[]
  ) => Promise<readonly AuthorizationRoleScopeOverrideSourceRecord[]>;
  readonly readRequestTokenScopeCeiling: (req: Sails.Req) => readonly string[] | undefined;
  readonly recordBrandId: (record: Readonly<Record<string, unknown>>) => string | undefined;
  readonly recordAclAllows: (input: AuthorizationRecordAclInput) => boolean | Promise<boolean>;
}

interface MutableResolutionEvidence {
  expiredAssignmentIds: string[];
  ignoredAssignmentIds: string[];
  inactiveRoleIds: string[];
  ignoredRoleIds: string[];
  missingTemplateRevisionRoleIds: string[];
  inactiveScopeKeys: ScopeKey[];
  missingScopeKeys: ScopeKey[];
  rejectedScopeKeys: ScopeKey[];
}

interface CanonicalUserResolution {
  readonly active: boolean;
  readonly user?: AuthorizationUserSourceRecord;
}

interface ResolvedRoleCandidate {
  readonly role: AuthorizationRoleSourceRecord;
  readonly implicit: boolean;
  readonly assignments: readonly AuthorizationAssignmentSourceRecord[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function associationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim();
    return id.length === 0 ? undefined : id;
  }
  if (isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number')) {
    const id = String(value.id).trim();
    return id.length === 0 ? undefined : id;
  }
  return undefined;
}

function optionalAssociationIsValid(value: unknown): boolean {
  return value == null || associationId(value) !== undefined;
}

function optionalStringIsValid(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

function optionalDateIsValid(value: unknown): boolean {
  return value == null || typeof value === 'string' || value instanceof Date;
}

function isAuthorizationUserSourceRecord(value: unknown): value is AuthorizationUserSourceRecord {
  if (!isRecord(value)) return false;
  return (
    associationId(value.id) !== undefined &&
    typeof value.username === 'string' &&
    optionalStringIsValid(value.linkedPrimaryUserId) &&
    (value.accountLinkState === undefined ||
      value.accountLinkState === 'active' ||
      value.accountLinkState === 'linked-alias') &&
    (value.loginDisabled === undefined || typeof value.loginDisabled === 'boolean')
  );
}

function isAuthorizationAssignmentSourceRecord(value: unknown): value is AuthorizationAssignmentSourceRecord {
  if (!isRecord(value)) return false;
  return (
    associationId(value.id) !== undefined &&
    typeof value.principalId === 'string' &&
    associationId(value.role) !== undefined &&
    optionalAssociationIsValid(value.branding) &&
    ROLE_ASSIGNMENT_SOURCES.some(source => source === value.source) &&
    typeof value.sourceKey === 'string' &&
    ROLE_ASSIGNMENT_STATUSES.some(status => status === value.status) &&
    typeof value.sourcePresent === 'boolean' &&
    optionalDateIsValid(value.expiresAt) &&
    optionalDateIsValid(value.revokedAt) &&
    optionalDateIsValid(value.suppressedAt)
  );
}

function isAuthorizationRoleSourceRecord(value: unknown): value is AuthorizationRoleSourceRecord {
  if (!isRecord(value)) return false;
  return (
    associationId(value.id) !== undefined &&
    typeof value.name === 'string' &&
    optionalStringIsValid(value.key) &&
    optionalStringIsValid(value.displayName) &&
    optionalAssociationIsValid(value.branding) &&
    (value.contextType === undefined || ROLE_CONTEXT_TYPES.some(contextType => contextType === value.contextType)) &&
    optionalAssociationIsValid(value.template) &&
    (value.templateRevision === undefined || typeof value.templateRevision === 'number') &&
    (value.protectedKind === undefined || PROTECTED_ROLE_KINDS.some(kind => kind === value.protectedKind)) &&
    (value.status === undefined || AUTHORIZATION_ROLE_STATUSES.some(status => status === value.status))
  );
}

function isAuthorizationTemplateRevisionSourceRecord(
  value: unknown
): value is AuthorizationTemplateRevisionSourceRecord {
  if (!isRecord(value)) return false;
  return (
    associationId(value.id) !== undefined &&
    associationId(value.template) !== undefined &&
    Number.isInteger(value.revision) &&
    Array.isArray(value.scopeKeys) &&
    value.scopeKeys.every(scopeKey => typeof scopeKey === 'string')
  );
}

function isAuthorizationRoleScopeOverrideSourceRecord(
  value: unknown
): value is AuthorizationRoleScopeOverrideSourceRecord {
  if (!isRecord(value)) return false;
  return (
    associationId(value.id) !== undefined &&
    associationId(value.role) !== undefined &&
    typeof value.scopeKey === 'string' &&
    ROLE_SCOPE_EFFECTS.some(effect => effect === value.effect)
  );
}

async function readWaterlineRows<T>(
  query: PromiseLike<unknown>,
  isExpectedRow: (value: unknown) => value is T,
  modelName: string
): Promise<readonly T[]> {
  const result = await query;
  if (!Array.isArray(result)) {
    throw new Error(`${modelName} authorization query returned a non-array result.`);
  }
  const rows = result.filter(isExpectedRow);
  if (rows.length !== result.length) {
    throw new Error(`${modelName} authorization query returned an invalid row.`);
  }
  return rows;
}

function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedScopeKeys(values: readonly ScopeKey[]): ScopeKey[] {
  return [...new Set(values)].sort(compareScopeKeys);
}

function boundedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze(uniqueSortedStrings(values).slice(0, AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS));
}

function boundedScopeKeys(values: readonly ScopeKey[]): readonly ScopeKey[] {
  return Object.freeze(uniqueSortedScopeKeys(values).slice(0, AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS));
}

function freezeResolutionEvidence(evidence: MutableResolutionEvidence): AuthorizationResolutionEvidence {
  return Object.freeze({
    expiredAssignmentIds: boundedStrings(evidence.expiredAssignmentIds),
    ignoredAssignmentIds: boundedStrings(evidence.ignoredAssignmentIds),
    inactiveRoleIds: boundedStrings(evidence.inactiveRoleIds),
    ignoredRoleIds: boundedStrings(evidence.ignoredRoleIds),
    missingTemplateRevisionRoleIds: boundedStrings(evidence.missingTemplateRevisionRoleIds),
    inactiveScopeKeys: boundedScopeKeys(evidence.inactiveScopeKeys),
    missingScopeKeys: boundedScopeKeys(evidence.missingScopeKeys),
    rejectedScopeKeys: boundedScopeKeys(evidence.rejectedScopeKeys),
  });
}

function createMutableEvidence(): MutableResolutionEvidence {
  return {
    expiredAssignmentIds: [],
    ignoredAssignmentIds: [],
    inactiveRoleIds: [],
    ignoredRoleIds: [],
    missingTemplateRevisionRoleIds: [],
    inactiveScopeKeys: [],
    missingScopeKeys: [],
    rejectedScopeKeys: [],
  };
}

function normalizedDate(value: string | Date | null | undefined): Date | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizedDateIso(value: string | Date | null | undefined): string | undefined {
  return normalizedDate(value)?.toISOString();
}

function runtimeService(name: string): Sails.DynamicService {
  const service = sails.services[name];
  if (service === undefined) {
    throw new Error(`Required authorization dependency '${name}' is unavailable.`);
  }
  return service;
}

function defaultRecordBrandId(record: Readonly<Record<string, unknown>>): string | undefined {
  const metaMetadata = isRecord(record.metaMetadata) ? record.metaMetadata : undefined;
  return associationId(metaMetadata?.brandId ?? record.metaMetadata_brandId ?? record.brandId ?? record.branding);
}

function defaultTokenScopeCeiling(req: Sails.Req): readonly string[] | undefined {
  const authInfo = req.authInfo;
  if (!isRecord(authInfo) || !Array.isArray(authInfo.scopeKeys)) return undefined;
  return authInfo.scopeKeys.every(scopeKey => typeof scopeKey === 'string')
    ? Object.freeze(authInfo.scopeKeys.filter((scopeKey): scopeKey is string => typeof scopeKey === 'string'))
    : Object.freeze([]);
}

function defaultDependencies(): AuthorizationServiceDependencies {
  return {
    now: () => new Date(),
    getRegistry: () => runtimeService('authorizationscopeservice').getRegistry() as ScopeRegistry,
    async resolveBrand(identifier) {
      const service = runtimeService('brandingservice');
      const byId = await Promise.resolve(service.getBrandById(identifier));
      const resolved = byId ?? (await Promise.resolve(service.getBrand(identifier)));
      if (!isRecord(resolved) || (typeof resolved.id !== 'string' && typeof resolved.id !== 'number')) {
        return undefined;
      }
      return {
        id: resolved.id,
        ...(typeof resolved.name === 'string' ? { name: resolved.name } : {}),
      };
    },
    async findUser(identifier) {
      // Resolved in two passes rather than one `or` query. A single disjunction lets a
      // username that happens to equal another account's id match two rows, which makes
      // Waterline's `findOne` throw, and would otherwise resolve authority to whichever
      // row the datastore returned first. An id is always the authoritative identity.
      const user = (await User.findOne({ id: identifier })) ?? (await User.findOne({ username: identifier }));
      if (user == null) return undefined;
      if (!isAuthorizationUserSourceRecord(user)) {
        throw new Error('User authorization query returned an invalid row.');
      }
      return user;
    },
    async findAssignments(principalId, brandId, activeAt) {
      return readWaterlineRows(
        RoleAssignment.find({
          principalType: 'user',
          principalId,
          status: 'active',
          sourcePresent: true,
          and: [
            { or: [{ branding: brandId }, { branding: null }] },
            { or: [{ expiresAt: null }, { expiresAt: { '>': activeAt } }] },
          ],
        }),
        isAuthorizationAssignmentSourceRecord,
        'RoleAssignment'
      );
    },
    async findRoles(roleIds, brandId) {
      const criteria: Record<string, unknown>[] = [];
      if (roleIds.length > 0) criteria.push({ id: [...roleIds] });
      if (brandId !== undefined) {
        criteria.push({ branding: brandId, protectedKind: 'guest', status: 'active' });
      }
      if (criteria.length === 0) return [];
      return readWaterlineRows(Role.find({ or: criteria }), isAuthorizationRoleSourceRecord, 'Role');
    },
    async findTemplateRevisions(references) {
      if (references.length === 0) return [];
      const uniqueReferences = new Map<string, AuthorizationTemplateRevisionReference>();
      for (const reference of references) {
        uniqueReferences.set(`${reference.templateId}:${reference.revision}`, reference);
      }
      return readWaterlineRows(
        RoleTemplateRevision.find({
          or: [...uniqueReferences.values()].map(reference => ({
            template: reference.templateId,
            revision: reference.revision,
          })),
        }),
        isAuthorizationTemplateRevisionSourceRecord,
        'RoleTemplateRevision'
      );
    },
    async findRoleScopeOverrides(roleIds) {
      if (roleIds.length === 0) return [];
      return readWaterlineRows(
        RoleScopeOverride.find({ role: [...roleIds] }),
        isAuthorizationRoleScopeOverrideSourceRecord,
        'RoleScopeOverride'
      );
    },
    readRequestTokenScopeCeiling: defaultTokenScopeCeiling,
    recordBrandId: defaultRecordBrandId,
    async recordAclAllows({ context, record, mode }) {
      const brandId = context.brand?.id;
      if (brandId === undefined) return false;
      const brandingService = runtimeService('brandingservice');
      const brand =
        (await Promise.resolve(brandingService.getBrandById(brandId))) ??
        (await Promise.resolve(brandingService.getBrand(context.brand?.name ?? brandId)));
      if (brand == null) return false;
      const recordsService = runtimeService('recordsservice');
      const user = {
        id: context.principal.userId,
        username: context.principal.username ?? '',
        roles: context.compatibilityRoles,
      };
      const method = mode === 'read' ? recordsService.hasViewAccess : recordsService.hasEditAccess;
      return (await Promise.resolve(method(brand, user, context.compatibilityRoles, record))) === true;
    },
  };
}

function isBearerRequest(req: Sails.Req): boolean {
  const authorization = req.headers.authorization;
  return typeof authorization === 'string' && /^\s*Bearer(?:\s|$)/iu.test(authorization);
}

function requestUserAuthMethod(req: Sails.Req, userId: string | undefined): AuthorizationUserAuthMethod | undefined {
  if (req.authorizationAuthMethod === 'bearer') return 'bearer';
  if (req.authorizationAuthMethod === 'session') return userId === undefined ? undefined : 'session';
  if (req.authorizationAuthMethod === 'anonymous') return undefined;
  if (userId === undefined) return isBearerRequest(req) ? 'bearer' : undefined;
  return isBearerRequest(req) ? 'bearer' : 'session';
}

function requestedBrandIdentifier(req: Sails.Req): string {
  const routeBrand = req.params?.branding;
  if (typeof routeBrand === 'string') return routeBrand;
  const sessionBrand = req.session?.branding;
  if (typeof sessionBrand === 'string') return sessionBrand;
  return String(sails.config.auth.defaultBrand ?? '');
}

function requestUserIdentifier(req: Sails.Req): string | undefined {
  const user = req.user;
  if (!isRecord(user)) return undefined;
  return associationId(user.id) ?? (typeof user.username === 'string' ? user.username.trim() || undefined : undefined);
}

function isSystemScope(scopeKey: ScopeKey): boolean {
  return scopeKey.startsWith('system.');
}

function opaqueResourceDecision(decision: AuthorizationDecision): AuthorizationDecision {
  if (decision.reasonCode !== 'resource-brand-mismatch') return decision;
  return Object.freeze({
    allowed: false,
    reasonCode: 'resource-not-found',
    requiredScope: decision.requiredScope,
    brandId: decision.brandId,
  });
}

export namespace Services {
  export class AuthorizationService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'resolveRequestContext',
      'resolveUserContext',
      'getEffectiveRoles',
      'getEffectiveScopes',
      'hasScope',
      'authorizeAction',
      'authorizeBrandEntity',
      'authorizeRecord',
      'explainDecision',
    ];

    private readonly dependencies: AuthorizationServiceDependencies;
    private readonly requestContexts = new WeakMap<Sails.Req, Promise<AuthorizationContext>>();

    public constructor(dependencies: Partial<AuthorizationServiceDependencies> = {}) {
      super();
      this.dependencies = { ...defaultDependencies(), ...dependencies };
    }

    private normalizeTokenScopeCeiling(scopeKeys: readonly string[] | undefined): readonly ScopeKey[] | undefined {
      if (scopeKeys === undefined) return undefined;
      try {
        return Object.freeze(uniqueSortedScopeKeys(scopeKeys.map(asScopeKey)));
      } catch {
        return Object.freeze([]);
      }
    }

    private async resolveBrand(identifier: string | undefined): Promise<AuthorizationResolvedBrand> {
      if (identifier === undefined || identifier.trim().length === 0) {
        return Object.freeze({
          ...(identifier === undefined ? {} : { requestedIdentifier: identifier }),
          exists: false,
          authorized: false,
        });
      }
      const brand = await this.dependencies.resolveBrand(identifier);
      if (brand === undefined) {
        return Object.freeze({ requestedIdentifier: identifier, exists: false, authorized: false });
      }
      const id = String(brand.id);
      return Object.freeze({
        requestedIdentifier: identifier,
        id,
        name: brand.name ?? identifier,
        exists: true,
        authorized: true,
      });
    }

    private async canonicalUser(identifier: string): Promise<CanonicalUserResolution> {
      let current = await this.dependencies.findUser(identifier);
      const visited = new Set<string>();
      for (let depth = 0; current !== undefined && depth < MAX_LINK_DEPTH; depth += 1) {
        const currentId = String(current.id);
        if (visited.has(currentId) || current.loginDisabled === true) {
          return { active: false, user: current };
        }
        visited.add(currentId);
        const primaryId = current.linkedPrimaryUserId?.trim();
        if (!primaryId) {
          if (current.accountLinkState === 'linked-alias') return { active: false, user: current };
          return { active: true, user: current };
        }
        current = await this.dependencies.findUser(primaryId);
        if (current === undefined) return { active: false };
      }
      return { active: false, user: current };
    }

    private assignmentIsActive(
      assignment: AuthorizationAssignmentSourceRecord,
      now: Date,
      evidence: MutableResolutionEvidence
    ): boolean {
      const id = String(assignment.id);
      if (
        assignment.status !== 'active' ||
        assignment.sourcePresent !== true ||
        assignment.revokedAt != null ||
        assignment.suppressedAt != null
      ) {
        evidence.ignoredAssignmentIds.push(id);
        return false;
      }
      if (assignment.expiresAt != null) {
        const expiry = normalizedDate(assignment.expiresAt);
        if (expiry === undefined) {
          evidence.ignoredAssignmentIds.push(id);
          return false;
        }
        if (expiry.getTime() <= now.getTime()) {
          evidence.expiredAssignmentIds.push(id);
          return false;
        }
      }
      return true;
    }

    private roleCandidates(
      roles: readonly AuthorizationRoleSourceRecord[],
      assignments: readonly AuthorizationAssignmentSourceRecord[],
      brand: AuthorizationResolvedBrand,
      evidence: MutableResolutionEvidence
    ): readonly ResolvedRoleCandidate[] {
      const assignmentsByRole = new Map<string, AuthorizationAssignmentSourceRecord[]>();
      for (const assignment of assignments) {
        const roleId = associationId(assignment.role);
        if (roleId === undefined) {
          evidence.ignoredAssignmentIds.push(String(assignment.id));
          continue;
        }
        const entries = assignmentsByRole.get(roleId) ?? [];
        entries.push(assignment);
        assignmentsByRole.set(roleId, entries);
      }

      const matchingGuestRoles = roles.filter(
        role =>
          role.status === 'active' &&
          role.contextType === 'brand' &&
          role.protectedKind === 'guest' &&
          associationId(role.branding) === brand.id
      );
      const eligibleGuestId = matchingGuestRoles.length === 1 ? String(matchingGuestRoles[0].id) : undefined;
      if (matchingGuestRoles.length > 1) {
        evidence.ignoredRoleIds.push(...matchingGuestRoles.map(role => String(role.id)));
      }

      const matchingSystemRoles = roles.filter(
        role =>
          role.status === 'active' &&
          role.contextType === 'system' &&
          role.protectedKind === 'system-admin' &&
          associationId(role.branding) === undefined
      );
      // Ambiguity fails closed for both protected kinds: more than one candidate grants
      // nothing rather than picking one arbitrarily.
      const eligibleSystemId = matchingSystemRoles.length === 1 ? String(matchingSystemRoles[0].id) : undefined;
      if (matchingSystemRoles.length > 1) {
        evidence.ignoredRoleIds.push(...matchingSystemRoles.map(role => String(role.id)));
      }

      const candidates: ResolvedRoleCandidate[] = [];
      const seenRoleIds = new Set<string>();
      for (const role of roles) {
        const roleId = String(role.id);
        if (seenRoleIds.has(roleId)) continue;
        seenRoleIds.add(roleId);
        if (role.status !== 'active') {
          evidence.inactiveRoleIds.push(roleId);
          continue;
        }
        const roleAssignments = assignmentsByRole.get(roleId) ?? [];
        if (role.contextType === 'brand') {
          const roleBrandId = associationId(role.branding);
          if (brand.id === undefined || roleBrandId !== brand.id) {
            evidence.ignoredRoleIds.push(roleId);
            continue;
          }
          if (role.protectedKind === 'guest') {
            if (roleId !== eligibleGuestId) continue;
            evidence.ignoredAssignmentIds.push(...roleAssignments.map(assignment => String(assignment.id)));
            candidates.push({ role, implicit: true, assignments: Object.freeze([]) });
            continue;
          }
          const matchingAssignments = roleAssignments.filter(assignment => {
            const matches = associationId(assignment.branding) === brand.id;
            if (!matches) evidence.ignoredAssignmentIds.push(String(assignment.id));
            return matches;
          });
          if (matchingAssignments.length === 0) {
            evidence.ignoredRoleIds.push(roleId);
            continue;
          }
          candidates.push({ role, implicit: false, assignments: matchingAssignments });
          continue;
        }
        if (role.contextType === 'system' && roleId === eligibleSystemId) {
          const matchingAssignments = roleAssignments.filter(assignment => {
            const matches = associationId(assignment.branding) === undefined;
            if (!matches) evidence.ignoredAssignmentIds.push(String(assignment.id));
            return matches;
          });
          if (matchingAssignments.length > 0) {
            candidates.push({ role, implicit: false, assignments: matchingAssignments });
          } else {
            evidence.ignoredRoleIds.push(roleId);
          }
          continue;
        }
        evidence.ignoredRoleIds.push(roleId);
      }
      for (const [roleId, unresolvedAssignments] of assignmentsByRole) {
        if (seenRoleIds.has(roleId)) continue;
        evidence.ignoredAssignmentIds.push(...unresolvedAssignments.map(assignment => String(assignment.id)));
      }
      return candidates;
    }

    private async resolveRolesAndScopes(input: {
      readonly principal: AuthorizationResolvedPrincipal;
      readonly brand: AuthorizationResolvedBrand;
      readonly tokenScopeCeiling?: readonly ScopeKey[];
    }): Promise<AuthorizationContext> {
      const evidence = createMutableEvidence();
      if (!input.principal.active || !input.brand.exists || !input.brand.authorized || input.brand.id === undefined) {
        return freezeAuthorizationContext({
          contextType: 'brand',
          principal: input.principal,
          brand: input.brand,
          tokenScopeCeiling: input.tokenScopeCeiling,
          resolutionEvidence: freezeResolutionEvidence(evidence),
        });
      }
      const now = this.dependencies.now();
      const assignmentRows =
        input.principal.userId === undefined
          ? []
          : await this.dependencies.findAssignments(input.principal.userId, input.brand.id, now);
      const activeAssignments = assignmentRows.filter(assignment => this.assignmentIsActive(assignment, now, evidence));
      const assignedRoleIds = uniqueSortedStrings(
        activeAssignments
          .map(assignment => associationId(assignment.role))
          .filter((id): id is string => id !== undefined)
      );
      const roleRows = await this.dependencies.findRoles(assignedRoleIds, input.brand.id);
      const candidates = this.roleCandidates(roleRows, activeAssignments, input.brand, evidence);
      const roleIds = candidates.map(candidate => String(candidate.role.id));
      const revisionReferences = candidates.flatMap(candidate => {
        const templateId = associationId(candidate.role.template);
        const revision = candidate.role.templateRevision;
        return templateId !== undefined && Number.isInteger(revision) && Number(revision) >= 1
          ? [{ templateId, revision: Number(revision) }]
          : [];
      });
      const [revisionRows, overrideRows] = await Promise.all([
        this.dependencies.findTemplateRevisions(revisionReferences),
        this.dependencies.findRoleScopeOverrides(roleIds),
      ]);
      const revisions = new Map<string, AuthorizationTemplateRevisionSourceRecord>();
      for (const revision of revisionRows) {
        const templateId = associationId(revision.template);
        if (templateId !== undefined) revisions.set(`${templateId}:${revision.revision}`, revision);
      }
      const overridesByRole = new Map<string, AuthorizationRoleScopeOverrideSourceRecord[]>();
      for (const override of overrideRows) {
        const roleId = associationId(override.role);
        if (roleId === undefined) continue;
        const entries = overridesByRole.get(roleId) ?? [];
        entries.push(override);
        overridesByRole.set(roleId, entries);
      }

      const registry = this.dependencies.getRegistry();
      const effectiveRoles: EffectiveAuthorizationRole[] = [];
      for (const candidate of candidates) {
        const roleId = String(candidate.role.id);
        let roleKey;
        try {
          roleKey = asRoleKey(candidate.role.key ?? candidate.role.name);
        } catch {
          evidence.ignoredRoleIds.push(roleId);
          continue;
        }
        const templateId = associationId(candidate.role.template);
        const templateRevision = candidate.role.templateRevision;
        const hasTemplateReference = templateId !== undefined || templateRevision !== undefined;
        let baseScopeKeys: ScopeKey[] = [];
        let templateAvailable = true;
        if (hasTemplateReference) {
          const revision =
            templateId !== undefined && Number.isInteger(templateRevision) && Number(templateRevision) >= 1
              ? revisions.get(`${templateId}:${templateRevision}`)
              : undefined;
          if (revision === undefined) {
            evidence.missingTemplateRevisionRoleIds.push(roleId);
            templateAvailable = false;
          } else {
            try {
              baseScopeKeys = revision.scopeKeys.map(asScopeKey);
            } catch {
              evidence.missingTemplateRevisionRoleIds.push(roleId);
              templateAvailable = false;
            }
          }
        }
        if (!templateAvailable) continue;
        const overrides = (overridesByRole.get(roleId) ?? []).flatMap(override => {
          try {
            return [{ scopeKey: asScopeKey(override.scopeKey), effect: override.effect }];
          } catch {
            return [];
          }
        });
        const calculated = getRoleEffectiveScopes({ baseScopeKeys, overrides, registry });
        const roleScopeKeys = calculated.effectiveScopeKeys.filter(scopeKey => {
          const rejectedForContext = candidate.role.contextType === 'brand' && isSystemScope(scopeKey);
          const rejectedForGuest =
            candidate.role.protectedKind === 'guest' &&
            (!GUEST_SCOPE_ALLOWLIST.has(scopeKey) || registry.get(scopeKey)?.risk !== 'read');
          if (rejectedForContext || rejectedForGuest) {
            evidence.rejectedScopeKeys.push(scopeKey);
            return false;
          }
          return true;
        });
        evidence.inactiveScopeKeys.push(...calculated.inactiveScopeKeys);
        evidence.missingScopeKeys.push(...calculated.missingScopeKeys);
        const assignmentEvidence = candidate.assignments
          .map(assignment => {
            const expiresAt = normalizedDateIso(assignment.expiresAt);
            return {
              assignmentId: String(assignment.id),
              source: assignment.source,
              sourceKey: assignment.sourceKey,
              ...(expiresAt === undefined ? {} : { expiresAt }),
            };
          })
          .sort((left, right) => compareStrings(left.assignmentId, right.assignmentId));
        const assignmentCount = assignmentEvidence.length;
        const boundedAssignmentEvidence = assignmentEvidence.slice(0, AUTHORIZATION_MAX_RESOLUTION_EVIDENCE_ITEMS);
        effectiveRoles.push({
          id: roleId,
          key: roleKey,
          name: candidate.role.name,
          displayName: candidate.role.displayName?.trim() || candidate.role.name,
          contextType: candidate.role.contextType ?? 'brand',
          ...(candidate.role.contextType === 'brand' && input.brand.id !== undefined
            ? { brandId: input.brand.id }
            : {}),
          protectedKind: candidate.role.protectedKind ?? 'none',
          implicit: candidate.implicit,
          assignmentCount,
          assignmentsTruncated: assignmentCount > boundedAssignmentEvidence.length,
          assignments: boundedAssignmentEvidence,
          effectiveScopeKeys: roleScopeKeys,
          inactiveScopeKeys: calculated.inactiveScopeKeys,
          missingScopeKeys: calculated.missingScopeKeys,
        });
      }
      effectiveRoles.sort((left, right) => {
        const keyOrder = left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
        return keyOrder === 0 ? compareStrings(left.id, right.id) : keyOrder;
      });

      const provenanceByScope = new Map<ScopeKey, { roleIds: string[]; roleKeys: ReturnType<typeof asRoleKey>[] }>();
      for (const role of effectiveRoles) {
        for (const scopeKey of role.effectiveScopeKeys) {
          const provenance = provenanceByScope.get(scopeKey) ?? { roleIds: [], roleKeys: [] };
          provenance.roleIds.push(role.id);
          provenance.roleKeys.push(role.key);
          provenanceByScope.set(scopeKey, provenance);
        }
      }
      const grantedScopeKeys = uniqueSortedScopeKeys([...provenanceByScope.keys()]);
      const ceiling = input.tokenScopeCeiling;
      const ceilingSet = ceiling === undefined ? undefined : new Set(ceiling);
      const effectiveScopeKeys =
        ceilingSet === undefined ? grantedScopeKeys : grantedScopeKeys.filter(scopeKey => ceilingSet.has(scopeKey));
      const scopeProvenance: AuthorizationScopeProvenance[] = grantedScopeKeys.map(scopeKey => {
        const provenance = provenanceByScope.get(scopeKey)!;
        return {
          scopeKey,
          roleIds: uniqueSortedStrings(provenance.roleIds),
          roleKeys: [...new Set(provenance.roleKeys)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
        };
      });
      const systemAdministrator = effectiveRoles.some(role => role.protectedKind === 'system-admin');
      const principal =
        input.principal.authMethod === 'session'
          ? createUserAuthorizationPrincipal({
              userId: input.principal.userId,
              username: input.principal.username,
              active: input.principal.active,
              systemAdministrator,
            })
          : input.principal.authMethod === 'bearer'
            ? createLegacyBearerAuthorizationPrincipal({
                userId: input.principal.userId,
                username: input.principal.username,
                active: input.principal.active,
                systemAdministrator,
              })
            : input.principal;
      const compatibilityRoles: AuthorizationCompatibilityRole[] = effectiveRoles.map(role => ({
        id: role.id,
        key: role.key,
        name: role.name,
        displayName: role.displayName,
        contextType: role.contextType,
        protectedKind: role.protectedKind,
        ...(role.brandId === undefined
          ? {}
          : {
              branding: {
                id: role.brandId,
                name: input.brand.name ?? input.brand.requestedIdentifier ?? role.brandId,
              },
            }),
      }));
      return freezeAuthorizationContext({
        contextType: 'brand',
        principal,
        brand: input.brand,
        roles: effectiveRoles,
        compatibilityRoles,
        roleKeys: effectiveRoles.map(role => role.key),
        grantedScopeKeys,
        effectiveScopeKeys,
        tokenScopeCeiling: ceiling,
        scopeProvenance,
        resolutionEvidence: freezeResolutionEvidence(evidence),
      });
    }

    private async resolveAnonymousContext(
      brandIdentifier: string,
      tokenScopeCeiling?: readonly string[],
      invalidBearer = false
    ): Promise<AuthorizationContext> {
      const brand = await this.resolveBrand(brandIdentifier);
      const principal: AuthorizationResolvedPrincipal = invalidBearer
        ? createLegacyBearerAuthorizationPrincipal({ active: false })
        : createAnonymousAuthorizationPrincipal();
      return this.resolveRolesAndScopes({
        principal,
        brand,
        tokenScopeCeiling: this.normalizeTokenScopeCeiling(tokenScopeCeiling),
      });
    }

    public async resolveUserContext(
      userId: string,
      brandIdentifier: string,
      authMethod: AuthorizationUserAuthMethod = 'session',
      tokenScopeCeiling?: readonly string[]
    ): Promise<AuthorizationContext> {
      const [brand, canonical] = await Promise.all([this.resolveBrand(brandIdentifier), this.canonicalUser(userId)]);
      const principal =
        authMethod === 'bearer'
          ? createLegacyBearerAuthorizationPrincipal({
              userId: canonical.user === undefined ? undefined : String(canonical.user.id),
              username: canonical.user?.username,
              active: canonical.active,
            })
          : createUserAuthorizationPrincipal({
              userId: canonical.user === undefined ? undefined : String(canonical.user.id),
              username: canonical.user?.username,
              active: canonical.active,
            });
      return this.resolveRolesAndScopes({
        principal,
        brand,
        tokenScopeCeiling: this.normalizeTokenScopeCeiling(tokenScopeCeiling),
      });
    }

    private projectRequestUser(req: Sails.Req, context: AuthorizationContext): void {
      if (context.principal.userId === undefined) return;
      const existing = isRecord(req.user) ? { ...req.user } : {};
      const projected: Record<string, unknown> = {
        ...existing,
        id: context.principal.userId,
        username: context.principal.username ?? '',
        roles: context.compatibilityRoles,
      };
      Reflect.deleteProperty(projected, 'password');
      Reflect.deleteProperty(projected, 'token');
      req.user = projected;
    }

    public resolveRequestContext(req: Sails.Req): Promise<AuthorizationContext> {
      const existing = this.requestContexts.get(req);
      if (existing !== undefined) return existing;
      const pending = (async () => {
        const brandIdentifier = requestedBrandIdentifier(req);
        const userId = requestUserIdentifier(req);
        const authMethod = requestUserAuthMethod(req, userId);
        const tokenScopeCeiling =
          authMethod === 'bearer' ? this.dependencies.readRequestTokenScopeCeiling(req) : undefined;
        const context =
          userId === undefined
            ? await this.resolveAnonymousContext(brandIdentifier, tokenScopeCeiling, authMethod === 'bearer')
            : await this.resolveUserContext(userId, brandIdentifier, authMethod ?? 'session', tokenScopeCeiling);
        this.projectRequestUser(req, context);
        req.authorization = context;
        return context;
      })();
      this.requestContexts.set(req, pending);
      pending.catch(() => this.requestContexts.delete(req));
      return pending;
    }

    /**
     * Trusted-job factory. This deliberately is not in `_exportedMethods`, so loader
     * shims and request/controller service globals cannot choose an internal identity
     * or its scopes.
     */
    public async createSystemProcessContext(
      operationId: string,
      brandIdentifier: string | undefined,
      allowedScopes: readonly string[]
    ): Promise<AuthorizationContext> {
      if (operationId.trim().length === 0) throw new Error('A system-process operation id is required.');
      const registry = this.dependencies.getRegistry();
      const validated = registry.validateScopeKeys(this.normalizeTokenScopeCeiling(allowedScopes) ?? []);
      const brand = brandIdentifier === undefined ? undefined : await this.resolveBrand(brandIdentifier);
      const brandUsable = brand === undefined || (brand.exists && brand.authorized && brand.id !== undefined);
      const grantedScopeKeys = brandUsable
        ? validated.activeScopeKeys.filter(scopeKey =>
            brand === undefined ? isSystemScope(scopeKey) : !isSystemScope(scopeKey)
          )
        : [];
      const grantedScopeKeySet = new Set(grantedScopeKeys);
      const principal = Object.freeze({
        category: 'system-process' as const,
        authMethod: 'internal' as const,
        active: true,
        operationId,
      });
      return freezeAuthorizationContext({
        contextType: brand === undefined ? 'system' : 'brand',
        principal,
        ...(brand === undefined ? {} : { brand }),
        grantedScopeKeys,
        effectiveScopeKeys: grantedScopeKeys,
        resolutionEvidence: {
          expiredAssignmentIds: [],
          ignoredAssignmentIds: [],
          inactiveRoleIds: [],
          ignoredRoleIds: [],
          missingTemplateRevisionRoleIds: [],
          inactiveScopeKeys: validated.inactiveScopeKeys,
          missingScopeKeys: validated.missingScopeKeys,
          rejectedScopeKeys: validated.activeScopeKeys.filter(scopeKey => !grantedScopeKeySet.has(scopeKey)),
        },
      });
    }

    public getEffectiveRoles(context: AuthorizationContext): readonly EffectiveAuthorizationRole[] {
      return context.roles;
    }

    public getEffectiveScopes(context: AuthorizationContext): readonly ScopeKey[] {
      return context.effectiveScopeKeys;
    }

    public hasScope(context: AuthorizationContext, scopeKey: ScopeKey): boolean {
      return this.authorizeAction(context, scopeKey).allowed;
    }

    private decide(
      context: AuthorizationContext,
      requiredScope: ScopeKey,
      options: {
        readonly includeEvidence?: boolean;
        readonly resource?: {
          readonly found: boolean;
          readonly brandMatches: boolean;
          readonly recordAcl?: AuthorizationRecordAclOutcome;
        };
      } = {}
    ): AuthorizationDecision {
      return decideAuthorization({
        requiredScope,
        registry: this.dependencies.getRegistry(),
        principal: {
          category: context.principal.category,
          authMethod: context.principal.authMethod,
          active: context.principal.active,
          effectiveScopeKeys: context.grantedScopeKeys,
        },
        ...(context.contextType === 'brand'
          ? {
              brand: {
                brandId: context.brand?.id ?? context.brand?.requestedIdentifier,
                exists: context.brand?.exists ?? false,
                authorized: context.brand?.authorized ?? false,
              },
            }
          : {}),
        ...(context.tokenScopeCeiling === undefined ? {} : { tokenCeiling: { scopeKeys: context.tokenScopeCeiling } }),
        ...(options.resource === undefined ? {} : { resource: options.resource }),
        includeEvidence: options.includeEvidence,
      });
    }

    public authorizeAction(context: AuthorizationContext, requiredScope: ScopeKey): AuthorizationDecision {
      return this.decide(context, requiredScope);
    }

    public authorizeBrandEntity(
      context: AuthorizationContext,
      requiredScope: ScopeKey,
      entityBrandId: string | undefined
    ): AuthorizationDecision {
      const found = entityBrandId !== undefined && entityBrandId.trim().length > 0;
      const decision = this.decide(context, requiredScope, {
        resource: {
          found,
          brandMatches: found && context.brand?.id === entityBrandId,
        },
      });
      return opaqueResourceDecision(decision);
    }

    public async authorizeRecord(
      context: AuthorizationContext,
      requiredScope: ScopeKey,
      record: Readonly<Record<string, unknown>> | null | undefined,
      mode: AuthorizationRecordMode
    ): Promise<AuthorizationDecision> {
      const found = record != null;
      const recordBrandId = found ? this.dependencies.recordBrandId(record) : undefined;
      const brandMatches = found && recordBrandId !== undefined && recordBrandId === context.brand?.id;
      if (!found || !brandMatches) {
        return opaqueResourceDecision(
          this.decide(context, requiredScope, {
            resource: { found, brandMatches },
          })
        );
      }
      const actionDecision = this.authorizeAction(context, requiredScope);
      if (!actionDecision.allowed) return actionDecision;
      const bypassScope = mode === 'read' ? asScopeKey('record.read.all') : asScopeKey('record.update.all');
      let aclAllowed = this.hasScope(context, bypassScope);
      if (!aclAllowed) {
        try {
          aclAllowed = await this.dependencies.recordAclAllows({ context, record, mode });
        } catch (error) {
          this.logger.warn('Record ACL evaluation failed closed.', error);
          aclAllowed = false;
        }
      }
      return this.decide(context, requiredScope, {
        resource: {
          found: true,
          brandMatches: true,
          recordAcl: aclAllowed ? 'allowed' : 'denied',
        },
      });
    }

    private async actorContextForExplanation(
      actorContext: AuthorizationContext,
      brandIdentifier: string
    ): Promise<AuthorizationContext | undefined> {
      const brandMatches =
        actorContext.contextType === 'brand' &&
        (actorContext.brand?.id === brandIdentifier || actorContext.brand?.name === brandIdentifier);
      if (brandMatches) return actorContext;
      if (actorContext.principal.userId === undefined) return undefined;
      const authMethod: AuthorizationUserAuthMethod =
        actorContext.principal.authMethod === 'bearer' ? 'bearer' : 'session';
      return this.resolveUserContext(
        actorContext.principal.userId,
        brandIdentifier,
        authMethod,
        actorContext.tokenScopeCeiling
      );
    }

    public async explainDecision(
      actorContext: AuthorizationContext,
      subjectId: string,
      brandIdentifier: string,
      requiredScope: ScopeKey,
      resource?: AuthorizationExplanationResource
    ): Promise<AuthorizationExplanationResult> {
      const explanationScope = asScopeKey('authorization.explain');
      const actorTargetContext = await this.actorContextForExplanation(actorContext, brandIdentifier);
      if (actorTargetContext === undefined) {
        const targetBrand = await this.resolveBrand(brandIdentifier);
        return Object.freeze({
          explained: false,
          decision: this.authorizeBrandEntity(actorContext, explanationScope, targetBrand.id),
        });
      }
      const explanationDecision = this.authorizeAction(actorTargetContext, explanationScope);
      if (!explanationDecision.allowed) {
        return Object.freeze({ explained: false, decision: explanationDecision });
      }
      const subjectContext = await this.resolveUserContext(subjectId, brandIdentifier, 'session');
      const found = resource?.found ?? true;
      const brandMatches = resource?.brandId === undefined || resource.brandId === subjectContext.brand?.id;
      const decision = this.decide(subjectContext, requiredScope, {
        includeEvidence: true,
        ...(resource === undefined
          ? {}
          : {
              resource: {
                found,
                brandMatches,
                recordAcl: resource.recordAcl,
              },
            }),
      });
      return Object.freeze({
        explained: true,
        decision,
        projection: Object.freeze({
          principal: subjectContext.principal,
          brand: subjectContext.brand,
          roles: subjectContext.roles,
          grantedScopeKeys: subjectContext.grantedScopeKeys,
          effectiveScopeKeys: subjectContext.effectiveScopeKeys,
          tokenScopeCeiling: subjectContext.tokenScopeCeiling,
          scopeProvenance: subjectContext.scopeProvenance,
          resolutionEvidence: subjectContext.resolutionEvidence,
        }),
      });
    }
  }
}

declare global {
  let AuthorizationService: Services.AuthorizationService;
}
