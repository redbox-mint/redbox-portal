import { randomUUID } from 'node:crypto';
import { Services as services } from '../CoreService';
import {
  AUTHORIZATION_ADMIN_CONFIRMATION_TTL_MS,
  AUTHORIZATION_ADMIN_MAX_EXPORT_BYTES,
  AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS,
  AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES,
  AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS,
  AUTHORIZATION_MAX_SCOPE_SET_SIZE,
  BRAND_ADMIN_SCOPE_FLOOR,
  GUEST_SCOPE_ALLOWLIST,
  GUEST_SCOPE_FLOOR,
  SYSTEM_ADMIN_SCOPE_FLOOR,
  AuthorizationAdministrationError,
  authorizationConfigurationImportDocumentSchema,
  authorizationContentHash,
  buildRoleIdentityKey,
  createAuthorizationConfirmationToken,
  getRoleEffectiveScopes,
  isNewRoleKey,
  isRoleKey,
  normalizeRoleScopeOverrides,
  normalizedScopeKeys,
  optionalAuthorizationText,
  requiredAuthorizationText,
  verifyAuthorizationConfirmationToken,
  type AuthorizationAdministrationCommand,
  type AuthorizationAuditEventType,
  type AuthorizationConfigurationAssignment,
  type AuthorizationConfigurationDocument,
  type AuthorizationConfigurationExportPreview,
  type AuthorizationConfigurationImportPreview,
  type AuthorizationConfigurationImportResult,
  type AuthorizationConfigurationRole,
  type AuthorizationConfigurationTemplate,
  type AuthorizationConfigurationTemplateRevision,
  type AuthorizationConfirmationClaims,
  type AuthorizationContext,
  type ExportAuthorizationConfigurationCommand,
  type ApplyAuthorizationConfigurationImportCommand,
  type PreviewAuthorizationConfigurationImportCommand,
  type RoleScopeOverride,
  type ScopeKey,
  type ScopeRegistry,
} from '../authorization';
import type { AuthorizationAuditEventInput } from './AuthorizationAuditService';
import type { AuthorizationAuditAttributes } from '../waterline-models/AuthorizationAudit';
import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleAssignmentAttributes } from '../waterline-models/RoleAssignment';
import type { RoleScopeOverrideAttributes } from '../waterline-models/RoleScopeOverride';
import type { RoleTemplateAttributes } from '../waterline-models/RoleTemplate';
import type { RoleTemplateRevisionAttributes } from '../waterline-models/RoleTemplateRevision';
import type { UserAttributes } from '../waterline-models/User';
import { runWithRequiredTransaction } from '../utilities/RequiredTransactionUtils';

const SYSTEM_MANAGE_SCOPE = 'system.authorization.manage' as ScopeKey;
const CONFIGURATION_TARGET = 'authorization-configuration-v1';
const MAX_LINK_DEPTH = 16;
const MAX_FATAL_ERRORS = 100;

interface AuditWriter {
  createSucceededEvent(
    input: AuthorizationAuditEventInput,
    connection: Sails.Connection
  ): Promise<AuthorizationAuditAttributes>;
  createSucceededEventOnce(
    input: AuthorizationAuditEventInput,
    replayKey: string,
    connection: Sails.Connection
  ): Promise<AuthorizationAuditAttributes>;
  recordAttempt(
    input: AuthorizationAuditEventInput,
    outcome: 'denied' | 'failed'
  ): Promise<{ readonly persisted: boolean }>;
}

export interface AuthorizationConfigurationServiceDependencies {
  readonly now: () => Date;
  readonly randomId: () => string;
  readonly getRegistry: () => ScopeRegistry;
  readonly getConfirmationSecret: () => string;
  readonly audit: () => AuditWriter;
  readonly runTransaction: <T>(work: (connection: Sails.Connection) => Promise<T>) => Promise<T>;
}

interface TemplateImportPlan {
  readonly document: AuthorizationConfigurationTemplate;
  readonly current: RoleTemplateAttributes;
  readonly newRevisions: readonly AuthorizationConfigurationTemplateRevision[];
  readonly changed: boolean;
}

interface RoleImportPlan {
  readonly document: AuthorizationConfigurationRole;
  readonly current?: RoleAttributes;
  readonly template?: RoleTemplateAttributes;
  readonly baseScopeKeys: readonly ScopeKey[];
  readonly overrides: readonly RoleScopeOverride[];
  readonly changed: boolean;
}

interface AssignmentImportPlan {
  readonly document: AuthorizationConfigurationAssignment;
  readonly current?: RoleAssignmentAttributes;
  readonly canonicalPrincipalId: string;
  readonly rolePlan: RoleImportPlan;
  readonly changed: boolean;
}

interface ConfigurationImportPlan {
  readonly document: AuthorizationConfigurationDocument;
  readonly documentHash: string;
  readonly stateHash: string;
  readonly templates: readonly TemplateImportPlan[];
  readonly roles: readonly RoleImportPlan[];
  readonly assignments: readonly AssignmentImportPlan[];
  readonly templateChanges: number;
  readonly roleChanges: number;
  readonly assignmentChanges: number;
  readonly noOpCount: number;
  readonly fatalErrors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function configurationContextKey(brandId: string | undefined, roleKey: string): string {
  return brandId === undefined ? `system\u0000${roleKey}` : `brand\u0000${brandId}\u0000${roleKey}`;
}

function assignmentConfigurationKey(assignment: AuthorizationConfigurationAssignment): string {
  return `${configurationContextKey(assignment.brandId, assignment.roleKey)}\u0000${assignment.principalId}\u0000${assignment.source}\u0000${assignment.sourceKey}`;
}

function compareConfigurationText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalidImport(message: string): AuthorizationAdministrationError {
  return new AuthorizationAdministrationError('authorization.bulk-invalid', 422, message);
}

function freezeConfigurationDocument(document: AuthorizationConfigurationDocument): AuthorizationConfigurationDocument {
  return Object.freeze({
    ...document,
    templates: Object.freeze(
      document.templates.map(template =>
        Object.freeze({
          ...template,
          revisions: Object.freeze(
            template.revisions.map(revision =>
              Object.freeze({ ...revision, scopeKeys: Object.freeze([...revision.scopeKeys]) })
            )
          ),
        })
      )
    ),
    roles: Object.freeze(
      document.roles.map(role =>
        Object.freeze({ ...role, effectiveScopeKeys: Object.freeze([...role.effectiveScopeKeys]) })
      )
    ),
    ...(document.assignments === undefined
      ? {}
      : { assignments: Object.freeze(document.assignments.map(assignment => Object.freeze({ ...assignment }))) }),
  });
}

export function parseAuthorizationConfigurationDocument(
  input: AuthorizationConfigurationDocument | string
): AuthorizationConfigurationDocument {
  let value: unknown = input;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES) {
      throw invalidImport(`Configuration imports cannot exceed ${AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES} bytes.`);
    }
    try {
      value = JSON.parse(input);
    } catch (_error) {
      throw invalidImport('The configuration import is not valid JSON.');
    }
  } else {
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(input);
    } catch (_error) {
      throw invalidImport('The configuration import is not JSON serializable.');
    }
    if (serialized === undefined) throw invalidImport('The configuration import is not JSON serializable.');
    if (Buffer.byteLength(serialized, 'utf8') > AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES) {
      throw invalidImport(`Configuration imports cannot exceed ${AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES} bytes.`);
    }
  }
  const parsed = authorizationConfigurationImportDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw invalidImport('The configuration import did not satisfy the strict versioned document schema.');
  }
  return freezeConfigurationDocument(parsed.data);
}

function associationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number')) return String(value.id);
  return undefined;
}

function optionalRoleTemplateRevision(value: unknown): number | undefined {
  return value === undefined || value === null || value === 0 ? undefined : (value as number);
}

function roleKey(role: RoleAttributes): string {
  const key = role.key ?? role.name;
  if (!isRoleKey(key)) throw new Error('Authorization role persistence contains an invalid key.');
  return key;
}

function dateString(value: string | Date | null | undefined): string | undefined {
  if (value == null) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Authorization persistence contains an invalid date.');
  return date.toISOString();
}

function isCanonicalActiveUser(user: UserAttributes): boolean {
  return user.loginDisabled !== true && user.accountLinkState !== 'linked-alias' && !user.linkedPrimaryUserId?.trim();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasEveryScope(actual: readonly ScopeKey[], required: readonly ScopeKey[]): boolean {
  const values = new Set(actual);
  return required.every(scopeKey => values.has(scopeKey));
}

function templateRevisionMatches(
  current: RoleTemplateRevisionAttributes,
  desired: AuthorizationConfigurationTemplateRevision
): boolean {
  const currentScopeKeys = normalizedScopeKeys(current.scopeKeys);
  return (
    current.revision === desired.revision &&
    sameStrings(currentScopeKeys, desired.scopeKeys) &&
    optionalAuthorizationText(current.notes, 2_000) === desired.notes
  );
}

function defaultDependencies(): AuthorizationConfigurationServiceDependencies {
  return {
    now: () => new Date(),
    randomId: randomUUID,
    getRegistry: () => AuthorizationScopeService.getRegistry(),
    getConfirmationSecret: () => {
      const secret = sails.config.authorization?.confirmationSecret ?? sails.config.redboxSession?.secret;
      if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('Authorization confirmation signing secret is unavailable or too short.');
      }
      return secret;
    },
    audit: () => AuthorizationAuditService,
    runTransaction: work => runWithRequiredTransaction(Role.getDatastore(), work),
  };
}

export namespace Services {
  export class AuthorizationConfigurationService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['exportConfiguration'];

    private readonly dependencies: AuthorizationConfigurationServiceDependencies;

    public constructor(dependencies: Partial<AuthorizationConfigurationServiceDependencies> = {}) {
      super();
      this.logHeader = 'AuthorizationConfigurationService::';
      this.dependencies = { ...defaultDependencies(), ...dependencies };
    }

    private actorId(command: AuthorizationAdministrationCommand): string {
      const actorId = command.actor.principal.userId ?? command.actor.principal.operationId;
      if (!command.actor.principal.active || actorId === undefined || actorId.trim().length === 0) {
        throw new AuthorizationAdministrationError(
          'authorization.authentication-required',
          401,
          'An active authoritative actor context is required.'
        );
      }
      return requiredAuthorizationText(actorId, 'actorId', 128);
    }

    private requireSystemScope(command: AuthorizationAdministrationCommand): void {
      this.actorId(command);
      if (!command.actor.effectiveScopeKeys.includes(SYSTEM_MANAGE_SCOPE)) {
        throw new AuthorizationAdministrationError(
          'authorization.scope-denied',
          403,
          'The actor lacks system authorization management authority.'
        );
      }
    }

    private auditInput(
      command: AuthorizationAdministrationCommand,
      eventType: AuthorizationAuditEventType,
      targetId: string,
      extra: Partial<AuthorizationAuditEventInput> = {}
    ): AuthorizationAuditEventInput {
      const principal = command.actor.principal;
      return {
        eventType,
        actorType: principal.authMethod === 'internal' ? 'system-process' : 'user',
        actorId: this.actorId(command),
        authMethod:
          principal.authMethod === 'bearer'
            ? 'legacy-bearer'
            : principal.authMethod === 'internal'
              ? 'internal'
              : 'session',
        targetType: 'authorization-config',
        targetId,
        requestId: requiredAuthorizationText(command.requestId, 'requestId', 128),
        reason: optionalAuthorizationText(command.reason, 1_000),
        ...extra,
      };
    }

    private issueConfirmation(
      command: AuthorizationAdministrationCommand,
      operation: 'config-export-sensitive' | 'config-import',
      content: unknown
    ): string {
      const now = this.dependencies.now().getTime();
      const claims: AuthorizationConfirmationClaims = {
        version: 1,
        operation,
        target: CONFIGURATION_TARGET,
        actorId: this.actorId(command),
        contentHash: authorizationContentHash(content),
        nonce: this.dependencies.randomId(),
        issuedAt: now,
        expiresAt: now + AUTHORIZATION_ADMIN_CONFIRMATION_TTL_MS,
      };
      return createAuthorizationConfirmationToken(claims, this.dependencies.getConfirmationSecret());
    }

    private verifyConfirmation(
      command: AuthorizationAdministrationCommand,
      token: string,
      operation: 'config-export-sensitive' | 'config-import',
      content: unknown
    ): AuthorizationConfirmationClaims {
      const claims = verifyAuthorizationConfirmationToken(
        token,
        this.dependencies.getConfirmationSecret(),
        this.dependencies.now()
      );
      if (
        claims.operation !== operation ||
        claims.target !== CONFIGURATION_TARGET ||
        claims.actorId !== this.actorId(command) ||
        claims.brandId !== undefined ||
        claims.expectedVersion !== undefined ||
        claims.contentHash !== authorizationContentHash(content)
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.preview-stale',
          409,
          'The authorization preview no longer matches this operation.'
        );
      }
      return claims;
    }

    private async loadConfigurationDocument(
      connection: Sails.Connection,
      includeAssignments: boolean,
      includeSystemAssignments: boolean
    ): Promise<AuthorizationConfigurationDocument> {
      const templates = (await RoleTemplate.find({})
        .sort('key ASC')
        .limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)
        .usingConnection(connection)) as RoleTemplateAttributes[];
      const roles = (await Role.find({ contextType: ['brand', 'system'] })
        .sort([{ branding: 'ASC' }, { key: 'ASC' }, { name: 'ASC' }, { id: 'ASC' }])
        .limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)
        .usingConnection(connection)) as RoleAttributes[];
      const revisions = (await RoleTemplateRevision.find({})
        .sort([{ template: 'ASC' }, { revision: 'ASC' }])
        .limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)
        .usingConnection(connection)) as RoleTemplateRevisionAttributes[];
      const overrides = (await RoleScopeOverride.find({})
        .sort([{ role: 'ASC' }, { scopeKey: 'ASC' }])
        .limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)
        .usingConnection(connection)) as RoleScopeOverrideAttributes[];
      const assignments = includeAssignments
        ? ((await RoleAssignment.find({ source: includeSystemAssignments ? ['manual', 'recovery'] : 'manual' })
            .sort([{ branding: 'ASC' }, { role: 'ASC' }, { principalId: 'ASC' }, { sourceKey: 'ASC' }])
            .limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)
            .usingConnection(connection)) as RoleAssignmentAttributes[])
        : [];
      const rowCount = templates.length + roles.length + revisions.length + overrides.length + assignments.length;
      if (
        rowCount > AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS ||
        [templates, roles, revisions, overrides, assignments].some(
          rows => rows.length > AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS
        )
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'The authorization configuration exceeds the bounded export limit.'
        );
      }

      const templateById = new Map(templates.map(template => [String(template.id), template]));
      const revisionsByTemplate = new Map<string, RoleTemplateRevisionAttributes[]>();
      for (const revision of revisions) {
        const templateId = associationId(revision.template);
        if (templateId === undefined || !templateById.has(templateId)) {
          throw new Error('A template revision references invalid persistence state.');
        }
        const rows = revisionsByTemplate.get(templateId) ?? [];
        rows.push(revision);
        revisionsByTemplate.set(templateId, rows);
      }
      const overridesByRole = new Map<string, RoleScopeOverride[]>();
      for (const override of overrides) {
        const roleId = associationId(override.role);
        if (
          roleId === undefined ||
          typeof override.scopeKey !== 'string' ||
          (override.effect !== 'add' && override.effect !== 'remove')
        ) {
          throw new Error('A role scope override references invalid persistence state.');
        }
        const rows = overridesByRole.get(roleId) ?? [];
        rows.push({ scopeKey: override.scopeKey as ScopeKey, effect: override.effect });
        overridesByRole.set(roleId, rows);
      }

      const templateDocuments: AuthorizationConfigurationTemplate[] = templates.map(template => {
        if (
          !isNewRoleKey(template.key) ||
          !Number.isSafeInteger(template.version) ||
          template.version < 1 ||
          !['none', 'guest', 'brand-admin', 'system-admin'].includes(template.protectedKind) ||
          (template.status !== 'active' && template.status !== 'inactive')
        ) {
          throw new Error('A role template contains invalid authorization persistence state.');
        }
        const templateRevisions = revisionsByTemplate.get(String(template.id)) ?? [];
        if (
          templateRevisions.length !== template.currentRevision ||
          templateRevisions.some((revision, index) => revision.revision !== index + 1)
        ) {
          throw new Error('A role template contains incomplete immutable revision history.');
        }
        return Object.freeze({
          key: template.key,
          displayName: requiredAuthorizationText(template.displayName, 'template.displayName', 256),
          description: requiredAuthorizationText(template.description, 'template.description', 2_000),
          protectedKind: template.protectedKind,
          status: template.status,
          version: template.version,
          revisions: Object.freeze(
            templateRevisions.map(revision => {
              const notes = optionalAuthorizationText(revision.notes, 2_000);
              return Object.freeze({
                revision: revision.revision,
                scopeKeys: Object.freeze([...normalizedScopeKeys(revision.scopeKeys)]),
                ...(notes === undefined ? {} : { notes }),
              });
            })
          ),
        });
      });

      const roleById = new Map(roles.map(role => [String(role.id), role]));
      const roleDocuments: AuthorizationConfigurationRole[] = roles.map(role => {
        const key = roleKey(role);
        const brandId = associationId(role.branding);
        const validContext =
          (role.contextType === 'brand' && brandId !== undefined && role.protectedKind !== 'system-admin') ||
          (role.contextType === 'system' && brandId === undefined && role.protectedKind === 'system-admin');
        if (
          !validContext ||
          !Number.isSafeInteger(role.version) ||
          Number(role.version) < 1 ||
          !['none', 'guest', 'brand-admin', 'system-admin'].includes(role.protectedKind ?? 'none') ||
          (role.status !== undefined && role.status !== 'active' && role.status !== 'inactive')
        ) {
          throw new Error('A role contains invalid authorization persistence state.');
        }
        const templateId = associationId(role.template);
        const template = templateId === undefined ? undefined : templateById.get(templateId);
        const templateRevision = optionalRoleTemplateRevision(role.templateRevision);
        if ((template === undefined) !== (templateRevision === undefined)) {
          throw new Error('A role contains an invalid template pin.');
        }
        const revision =
          template === undefined
            ? undefined
            : revisionsByTemplate.get(String(template.id))?.find(candidate => candidate.revision === templateRevision);
        if (template !== undefined && revision === undefined) {
          throw new Error('A role references a missing template revision.');
        }
        const effectiveScopeKeys = getRoleEffectiveScopes({
          baseScopeKeys: revision === undefined ? [] : normalizedScopeKeys(revision.scopeKeys),
          overrides: overridesByRole.get(String(role.id)) ?? [],
        }).effectiveScopeKeys;
        const description = optionalAuthorizationText(role.description, 2_000);
        return Object.freeze({
          ...(brandId === undefined ? {} : { brandId }),
          key,
          displayName: requiredAuthorizationText(role.displayName?.trim() || role.name, 'role.displayName', 256),
          ...(description === undefined ? {} : { description }),
          protectedKind: role.protectedKind ?? 'none',
          status: role.status ?? 'active',
          ...(template === undefined ? {} : { templateKey: template.key, templateRevision }),
          effectiveScopeKeys: Object.freeze([...effectiveScopeKeys]),
          version: Number(role.version),
        });
      });

      const assignmentDocuments: AuthorizationConfigurationAssignment[] = [];
      for (const assignment of assignments) {
        const roleId = associationId(assignment.role);
        const role = roleId === undefined ? undefined : roleById.get(roleId);
        if (role === undefined) throw new Error('An assignment references a missing role.');
        const brandId = associationId(role.branding);
        const validSystemRole = role.contextType === 'system' && role.protectedKind === 'system-admin';
        if (validSystemRole && !includeSystemAssignments) continue;
        const validConfigurationSource =
          (assignment.source === 'manual' && assignment.sourceKey === 'manual') ||
          (includeSystemAssignments && validSystemRole && assignment.source === 'recovery');
        if (!validConfigurationSource) {
          throw new Error('A configuration assignment contains an invalid source tuple.');
        }
        if (
          assignment.status === 'suppressed' ||
          (assignment.status !== 'active' && assignment.status !== 'revoked') ||
          assignment.sourcePresent !== true ||
          !Number.isSafeInteger(assignment.version) ||
          assignment.version < 1 ||
          associationId(assignment.branding) !== brandId
        ) {
          throw new Error('An assignment contains invalid authorization persistence state.');
        }
        const expiresAt = dateString(assignment.expiresAt);
        assignmentDocuments.push(
          Object.freeze({
            principalId: requiredAuthorizationText(assignment.principalId, 'assignment.principalId', 128),
            ...(brandId === undefined ? {} : { brandId }),
            roleKey: roleKey(role),
            source: assignment.source,
            sourceKey: requiredAuthorizationText(assignment.sourceKey, 'assignment.sourceKey', 256),
            status: assignment.status,
            sourcePresent: true,
            ...(expiresAt === undefined ? {} : { expiresAt }),
            version: assignment.version,
          })
        );
      }
      assignmentDocuments.sort((left, right) =>
        compareConfigurationText(assignmentConfigurationKey(left), assignmentConfigurationKey(right))
      );
      const document: AuthorizationConfigurationDocument = Object.freeze({
        schemaVersion: 1,
        templates: Object.freeze(templateDocuments),
        roles: Object.freeze(roleDocuments),
        ...(includeAssignments ? { assignments: Object.freeze(assignmentDocuments) } : {}),
      });
      if (Buffer.byteLength(JSON.stringify(document), 'utf8') > AUTHORIZATION_ADMIN_MAX_EXPORT_BYTES) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'The authorization configuration exceeds the bounded export payload size.'
        );
      }
      return document;
    }

    public async exportConfiguration(
      command: ExportAuthorizationConfigurationCommand
    ): Promise<AuthorizationConfigurationDocument | AuthorizationConfigurationExportPreview> {
      this.requireSystemScope(command);
      const includeAssignments = command.includeAssignments === true;
      const includeSystemAssignments = command.includeSystemAssignments === true;
      let auditInput = this.auditInput(command, 'authorization.config-exported', CONFIGURATION_TARGET);
      try {
        if (includeSystemAssignments && !includeAssignments) {
          throw new AuthorizationAdministrationError(
            'authorization.invalid-query',
            400,
            'System assignments can be included only with assignment export.'
          );
        }
        return await this.dependencies.runTransaction(async connection => {
          const document = await this.loadConfigurationDocument(
            connection,
            includeAssignments,
            includeSystemAssignments
          );
          const content = Object.freeze({
            includeAssignments,
            includeSystemAssignments,
            documentHash: authorizationContentHash(document),
          });
          auditInput = this.auditInput(command, 'authorization.config-exported', content.documentHash, {
            after: {
              includeAssignments,
              includeSystemAssignments,
              templateCount: document.templates.length,
              roleCount: document.roles.length,
              assignmentCount: document.assignments?.length ?? 0,
            },
          });
          if (includeAssignments && command.confirmationToken === undefined) {
            return Object.freeze({
              operation: 'config-export-sensitive' as const,
              includeAssignments: true as const,
              includeSystemAssignments,
              templateCount: document.templates.length,
              roleCount: document.roles.length,
              assignmentCount: document.assignments?.length ?? 0,
              documentHash: content.documentHash,
              confirmationToken: this.issueConfirmation(command, 'config-export-sensitive', content),
            });
          }
          if (!includeAssignments && command.confirmationToken !== undefined) {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-query',
              400,
              'A confirmation token is valid only for a sensitive assignment export.'
            );
          }
          const confirmationClaims = includeAssignments
            ? this.verifyConfirmation(
                command,
                requiredAuthorizationText(command.confirmationToken, 'confirmationToken', 8_192),
                'config-export-sensitive',
                content
              )
            : undefined;
          if (confirmationClaims === undefined) {
            await this.dependencies.audit().createSucceededEvent(auditInput, connection);
          } else {
            await this.dependencies.audit().createSucceededEventOnce(auditInput, confirmationClaims.nonce, connection);
          }
          return document;
        });
      } catch (error) {
        await this.dependencies.audit().recordAttempt(
          {
            ...auditInput,
            reasonCode: error instanceof AuthorizationAdministrationError ? error.code : undefined,
          },
          error instanceof AuthorizationAdministrationError ? 'denied' : 'failed'
        );
        throw error;
      }
    }

    private delegableScopeKeys(actor: AuthorizationContext, brandId: string | undefined): readonly ScopeKey[] {
      if (brandId === undefined || actor.contextType === 'system') return actor.effectiveScopeKeys;
      const eligibleRoleIds = new Set(actor.roles.filter(role => role.contextType === 'system').map(role => role.id));
      const eligibleScopeKeys = new Set(
        actor.scopeProvenance
          .filter(provenance => provenance.roleIds.some(roleId => eligibleRoleIds.has(roleId)))
          .map(provenance => provenance.scopeKey)
      );
      return actor.effectiveScopeKeys.filter(scopeKey => eligibleScopeKeys.has(scopeKey));
    }

    private validateDesiredScopes(
      role: Pick<RoleAttributes, 'contextType' | 'protectedKind'>,
      scopeKeys: readonly string[],
      actor: AuthorizationContext,
      brandId: string | undefined,
      enforceDelegation = true
    ): readonly ScopeKey[] {
      const desired = normalizedScopeKeys(scopeKeys);
      const validation = this.dependencies.getRegistry().validateScopeKeys(desired);
      if (validation.inactiveScopeKeys.length > 0 || validation.missingScopeKeys.length > 0) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-scope',
          422,
          'Imported scopes must all be active deployed registry keys.'
        );
      }
      if (role.contextType === 'brand' && desired.some(scopeKey => scopeKey.startsWith('system.'))) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-scope',
          422,
          'Brand roles cannot contain system scopes.'
        );
      }
      const protectedKind = role.protectedKind ?? 'none';
      const floor =
        protectedKind === 'guest'
          ? GUEST_SCOPE_FLOOR
          : protectedKind === 'brand-admin'
            ? BRAND_ADMIN_SCOPE_FLOOR
            : protectedKind === 'system-admin'
              ? SYSTEM_ADMIN_SCOPE_FLOOR
              : [];
      if (!hasEveryScope(desired, floor)) {
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          422,
          'Imported protected role scopes violate the required scope floor.'
        );
      }
      if (
        protectedKind === 'guest' &&
        desired.some(
          scopeKey =>
            !GUEST_SCOPE_ALLOWLIST.has(scopeKey) || this.dependencies.getRegistry().get(scopeKey)?.risk !== 'read'
        )
      ) {
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          422,
          'Imported Guest scopes are not on the reviewed read-risk allowlist.'
        );
      }
      if (enforceDelegation && !hasEveryScope(this.delegableScopeKeys(actor, brandId), desired)) {
        throw new AuthorizationAdministrationError(
          'authorization.delegation-ceiling',
          403,
          'Imported role scopes exceed the actor delegation ceiling.'
        );
      }
      return desired;
    }

    private async canonicalUser(identifier: string, connection: Sails.Connection): Promise<UserAttributes> {
      let current = (await User.findOne({ id: identifier }).usingConnection(connection)) as UserAttributes | undefined;
      if (current === undefined) {
        current = (await User.findOne({ username: identifier }).usingConnection(connection)) as
          | UserAttributes
          | undefined;
      }
      const visited = new Set<string>();
      for (let depth = 0; current !== undefined && depth < MAX_LINK_DEPTH; depth += 1) {
        if (visited.has(String(current.id)) || current.loginDisabled === true) {
          throw new AuthorizationAdministrationError(
            'authorization.not-found',
            422,
            'An imported user is unavailable.'
          );
        }
        visited.add(String(current.id));
        if (!current.linkedPrimaryUserId?.trim()) {
          if (current.accountLinkState === 'linked-alias') {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              422,
              'An imported user is unavailable.'
            );
          }
          return current;
        }
        current = (await User.findOne({ id: current.linkedPrimaryUserId }).usingConnection(connection)) as
          | UserAttributes
          | undefined;
      }
      throw new AuthorizationAdministrationError('authorization.not-found', 422, 'An imported user is unavailable.');
    }

    private appendFatal(fatalErrors: string[], area: string, index: number, error: unknown): void {
      if (fatalErrors.length >= MAX_FATAL_ERRORS) return;
      const code =
        error instanceof AuthorizationAdministrationError ? error.code : 'authorization.invalid-configuration-state';
      fatalErrors.push(`${area}[${index}]:${code}`);
    }

    private async buildImportPlan(
      document: AuthorizationConfigurationDocument,
      actor: AuthorizationContext,
      connection: Sails.Connection
    ): Promise<ConfigurationImportPlan> {
      const fatalErrors: string[] = [];
      const stateFacts: unknown[] = [];
      const templatePlans: TemplateImportPlan[] = [];
      const templatePlanByKey = new Map<string, TemplateImportPlan>();
      for (const [index, desired] of document.templates.entries()) {
        try {
          const current = (await RoleTemplate.findOne({ key: desired.key }).usingConnection(connection)) as
            | RoleTemplateAttributes
            | undefined;
          if (current === undefined) {
            throw new AuthorizationAdministrationError(
              'authorization.not-found',
              422,
              'Imports cannot invent undeclared global templates.'
            );
          }
          stateFacts.push({
            type: 'template',
            key: desired.key,
            version: current.version,
            revision: current.currentRevision,
          });
          if (current.version !== desired.version) {
            throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'A template changed.');
          }
          if (current.protectedKind !== desired.protectedKind || current.status !== desired.status) {
            throw new AuthorizationAdministrationError(
              'authorization.protected-role',
              422,
              'Template identity and lifecycle state cannot be changed by import.'
            );
          }
          const currentRevisions = (await RoleTemplateRevision.find({ template: current.id })
            .sort('revision ASC')
            .limit(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS + 1)
            .usingConnection(connection)) as RoleTemplateRevisionAttributes[];
          if (
            currentRevisions.length !== current.currentRevision ||
            desired.revisions.length < currentRevisions.length ||
            currentRevisions.some(
              (revision, revisionIndex) => !templateRevisionMatches(revision, desired.revisions[revisionIndex])
            )
          ) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'Immutable template history changed or was omitted.'
            );
          }
          for (const [revisionIndex, revision] of desired.revisions.entries()) {
            this.validateDesiredScopes(
              {
                contextType: desired.protectedKind === 'system-admin' ? 'system' : 'brand',
                protectedKind: desired.protectedKind,
              },
              revision.scopeKeys,
              actor,
              desired.protectedKind === 'system-admin' ? undefined : actor.brand?.id,
              revisionIndex >= currentRevisions.length
            );
          }
          const newRevisions = desired.revisions.slice(current.currentRevision);
          const changed =
            current.displayName !== desired.displayName ||
            current.description !== desired.description ||
            newRevisions.length > 0;
          const plan = Object.freeze({
            document: desired,
            current,
            newRevisions: Object.freeze(newRevisions),
            changed,
          });
          templatePlans.push(plan);
          templatePlanByKey.set(desired.key, plan);
        } catch (error) {
          this.appendFatal(fatalErrors, 'templates', index, error);
        }
      }

      const rolePlans: RoleImportPlan[] = [];
      const rolePlanByContext = new Map<string, RoleImportPlan>();
      for (const [index, desired] of document.roles.entries()) {
        try {
          const contextType = desired.brandId === undefined ? 'system' : 'brand';
          const currentRows = (await Role.find({
            contextType,
            ...(desired.brandId === undefined ? { branding: null } : { branding: desired.brandId }),
            or: [{ key: desired.key }, { name: desired.key }],
          })
            .limit(2)
            .usingConnection(connection)) as RoleAttributes[];
          if (currentRows.length > 1) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'Role identity is ambiguous.'
            );
          }
          const current = currentRows[0];
          stateFacts.push({
            type: 'role',
            context: configurationContextKey(desired.brandId, desired.key),
            key: desired.key,
            version: current?.version ?? 0,
          });
          if (current === undefined) {
            if (desired.brandId === undefined || desired.protectedKind !== 'none' || desired.status !== 'active') {
              throw new AuthorizationAdministrationError(
                'authorization.protected-role',
                422,
                'Imports may create only active unprotected brand roles.'
              );
            }
            if (!isNewRoleKey(desired.key) || desired.version !== 1) {
              throw new AuthorizationAdministrationError(
                'authorization.invalid-role',
                422,
                'A new imported role requires a new-role key and version 1.'
              );
            }
            const brand = await BrandingConfig.findOne({ id: desired.brandId }).usingConnection(connection);
            if (brand == null) {
              throw new AuthorizationAdministrationError(
                'authorization.not-found',
                422,
                'An imported brand is unavailable.'
              );
            }
          } else {
            if (Number(current.version) !== desired.version) {
              throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'A role changed.');
            }
            if (
              current.protectedKind !== desired.protectedKind ||
              (current.status ?? 'active') !== desired.status ||
              current.contextType !== contextType ||
              associationId(current.branding) !== desired.brandId
            ) {
              throw new AuthorizationAdministrationError(
                'authorization.protected-role',
                422,
                'Role identity and lifecycle state cannot be changed by import.'
              );
            }
          }
          let template: RoleTemplateAttributes | undefined;
          let baseScopeKeys: readonly ScopeKey[] = [];
          if (desired.templateKey !== undefined && desired.templateRevision !== undefined) {
            const importedTemplate = templatePlanByKey.get(desired.templateKey);
            template = importedTemplate?.current;
            template ??= (await RoleTemplate.findOne({ key: desired.templateKey }).usingConnection(connection)) as
              | RoleTemplateAttributes
              | undefined;
            if (template === undefined) {
              throw new AuthorizationAdministrationError(
                'authorization.not-found',
                422,
                'An imported template is unavailable.'
              );
            }
            const desiredRevision = importedTemplate?.document.revisions.find(
              revision => revision.revision === desired.templateRevision
            );
            if (desiredRevision !== undefined) {
              baseScopeKeys = normalizedScopeKeys(desiredRevision.scopeKeys);
            } else {
              const revision = (await RoleTemplateRevision.findOne({
                template: template.id,
                revision: desired.templateRevision,
              }).usingConnection(connection)) as RoleTemplateRevisionAttributes | undefined;
              if (revision === undefined) {
                throw new AuthorizationAdministrationError(
                  'authorization.not-found',
                  422,
                  'An imported template revision is unavailable.'
                );
              }
              baseScopeKeys = normalizedScopeKeys(revision.scopeKeys);
            }
          }
          const desiredScopes = this.validateDesiredScopes(
            { contextType, protectedKind: desired.protectedKind },
            desired.effectiveScopeKeys,
            actor,
            desired.brandId,
            false
          );
          const overrides = normalizeRoleScopeOverrides({ baseScopeKeys, desiredScopeKeys: desiredScopes });
          let currentEffectiveScopeKeys: readonly ScopeKey[] = [];
          let currentTemplateKey: string | undefined;
          let currentTemplateRevision: number | undefined;
          if (current !== undefined) {
            const currentTemplateId = associationId(current.template);
            currentTemplateRevision = optionalRoleTemplateRevision(current.templateRevision);
            const currentTemplate =
              currentTemplateId === undefined
                ? undefined
                : ((await RoleTemplate.findOne({ id: currentTemplateId }).usingConnection(connection)) as
                    | RoleTemplateAttributes
                    | undefined);
            if (
              (currentTemplateId === undefined) !== (currentTemplateRevision === undefined) ||
              (currentTemplateId !== undefined && currentTemplate === undefined)
            ) {
              throw new Error('A role contains an invalid template pin.');
            }
            currentTemplateKey = currentTemplate?.key;
            let currentBaseScopeKeys: readonly ScopeKey[] = [];
            if (currentTemplate !== undefined && currentTemplateRevision !== undefined) {
              const revision = (await RoleTemplateRevision.findOne({
                template: currentTemplate.id,
                revision: currentTemplateRevision,
              }).usingConnection(connection)) as RoleTemplateRevisionAttributes | undefined;
              if (revision === undefined) throw new Error('A role references a missing template revision.');
              currentBaseScopeKeys = normalizedScopeKeys(revision.scopeKeys);
            }
            const currentOverrides = (await RoleScopeOverride.find({ role: current.id })
              .sort('scopeKey ASC')
              .limit(AUTHORIZATION_MAX_SCOPE_SET_SIZE + 1)
              .usingConnection(connection)) as RoleScopeOverrideAttributes[];
            if (currentOverrides.length > AUTHORIZATION_MAX_SCOPE_SET_SIZE) {
              throw new AuthorizationAdministrationError(
                'authorization.query-bound-exceeded',
                409,
                'A role override set exceeds the bounded limit.'
              );
            }
            if (
              currentOverrides.some(
                override =>
                  typeof override.scopeKey !== 'string' || (override.effect !== 'add' && override.effect !== 'remove')
              )
            ) {
              throw new Error('A role contains an invalid scope override.');
            }
            currentEffectiveScopeKeys = getRoleEffectiveScopes({
              baseScopeKeys: currentBaseScopeKeys,
              overrides: currentOverrides.map(override => ({
                scopeKey: override.scopeKey as ScopeKey,
                effect: override.effect,
              })),
            }).effectiveScopeKeys;
          }
          if (
            (current === undefined || !sameStrings(currentEffectiveScopeKeys, desiredScopes)) &&
            !hasEveryScope(this.delegableScopeKeys(actor, desired.brandId), desiredScopes)
          ) {
            throw new AuthorizationAdministrationError(
              'authorization.delegation-ceiling',
              403,
              'Imported role scopes exceed the actor delegation ceiling.'
            );
          }
          if (
            current?.protectedKind === 'system-admin' &&
            desiredScopes.some(scopeKey => !currentEffectiveScopeKeys.includes(scopeKey))
          ) {
            throw new AuthorizationAdministrationError(
              'authorization.protected-role',
              422,
              'Configuration import cannot adopt new scopes into the protected system role.'
            );
          }
          const changed =
            current === undefined ||
            (current.displayName?.trim() || current.name) !== desired.displayName ||
            optionalAuthorizationText(current.description, 2_000) !== desired.description ||
            currentTemplateKey !== desired.templateKey ||
            currentTemplateRevision !== desired.templateRevision ||
            !sameStrings(currentEffectiveScopeKeys, desiredScopes);
          const plan = Object.freeze({ document: desired, current, template, baseScopeKeys, overrides, changed });
          rolePlans.push(plan);
          rolePlanByContext.set(configurationContextKey(desired.brandId, desired.key), plan);
        } catch (error) {
          this.appendFatal(fatalErrors, 'roles', index, error);
        }
      }

      const assignmentPlans: AssignmentImportPlan[] = [];
      const canonicalTuples = new Set<string>();
      for (const [index, desired] of (document.assignments ?? []).entries()) {
        try {
          if (
            (desired.source !== 'manual' && desired.source !== 'recovery') ||
            (desired.source === 'manual' && desired.sourceKey !== 'manual') ||
            desired.sourcePresent !== true
          ) {
            throw new AuthorizationAdministrationError(
              'authorization.bulk-invalid',
              422,
              'Imports support only exact manual source tuples.'
            );
          }
          const rolePlan = rolePlanByContext.get(configurationContextKey(desired.brandId, desired.roleKey));
          let resolvedRolePlan = rolePlan;
          if (resolvedRolePlan === undefined) {
            const rows = (await Role.find({
              contextType: desired.brandId === undefined ? 'system' : 'brand',
              ...(desired.brandId === undefined ? { branding: null } : { branding: desired.brandId }),
              or: [{ key: desired.roleKey }, { name: desired.roleKey }],
            })
              .limit(2)
              .usingConnection(connection)) as RoleAttributes[];
            if (rows.length !== 1) {
              throw new AuthorizationAdministrationError(
                'authorization.not-found',
                422,
                'An imported role is unavailable.'
              );
            }
            const currentRole = rows[0];
            const expectedContextType = desired.brandId === undefined ? 'system' : 'brand';
            if (
              currentRole.contextType !== expectedContextType ||
              associationId(currentRole.branding) !== desired.brandId ||
              !['none', 'guest', 'brand-admin', 'system-admin'].includes(currentRole.protectedKind ?? 'none') ||
              (currentRole.status !== 'active' && currentRole.status !== 'inactive') ||
              !Number.isSafeInteger(currentRole.version) ||
              Number(currentRole.version) < 1
            ) {
              throw new Error('An assignment role contains invalid authorization persistence state.');
            }
            const currentTemplateId = associationId(currentRole.template);
            const currentTemplateRevision = optionalRoleTemplateRevision(currentRole.templateRevision);
            const currentTemplate =
              currentTemplateId === undefined
                ? undefined
                : ((await RoleTemplate.findOne({ id: currentTemplateId }).usingConnection(connection)) as
                    | RoleTemplateAttributes
                    | undefined);
            if (
              (currentTemplateId === undefined) !== (currentTemplateRevision === undefined) ||
              (currentTemplateId !== undefined && currentTemplate === undefined)
            ) {
              throw new Error('An assignment role has an invalid template pin.');
            }
            let baseScopeKeys: readonly ScopeKey[] = [];
            if (currentTemplate !== undefined && currentTemplateRevision !== undefined) {
              const revision = (await RoleTemplateRevision.findOne({
                template: currentTemplate.id,
                revision: currentTemplateRevision,
              }).usingConnection(connection)) as RoleTemplateRevisionAttributes | undefined;
              if (revision === undefined) throw new Error('An assignment role has an invalid template pin.');
              baseScopeKeys = normalizedScopeKeys(revision.scopeKeys);
            }
            const currentOverrides = (await RoleScopeOverride.find({ role: currentRole.id })
              .limit(AUTHORIZATION_MAX_SCOPE_SET_SIZE + 1)
              .usingConnection(connection)) as RoleScopeOverrideAttributes[];
            if (
              currentOverrides.length > AUTHORIZATION_MAX_SCOPE_SET_SIZE ||
              currentOverrides.some(
                override =>
                  typeof override.scopeKey !== 'string' || (override.effect !== 'add' && override.effect !== 'remove')
              )
            ) {
              throw new Error('An assignment role contains invalid scope overrides.');
            }
            const effectiveScopeKeys = this.validateDesiredScopes(
              { contextType: currentRole.contextType, protectedKind: currentRole.protectedKind },
              getRoleEffectiveScopes({
                baseScopeKeys,
                overrides: currentOverrides.map(override => ({
                  scopeKey: override.scopeKey as ScopeKey,
                  effect: override.effect,
                })),
              }).effectiveScopeKeys,
              actor,
              desired.brandId,
              false
            );
            resolvedRolePlan = Object.freeze({
              document: {
                ...(desired.brandId === undefined ? {} : { brandId: desired.brandId }),
                key: roleKey(currentRole),
                displayName: currentRole.displayName?.trim() || currentRole.name,
                protectedKind: currentRole.protectedKind ?? 'none',
                status: currentRole.status ?? 'active',
                effectiveScopeKeys,
                version: Number(currentRole.version),
              },
              current: currentRole,
              template: currentTemplate,
              baseScopeKeys,
              overrides: Object.freeze([]),
              changed: false,
            });
          }
          if (resolvedRolePlan.document.protectedKind === 'guest') {
            throw new AuthorizationAdministrationError(
              'authorization.protected-role',
              422,
              'Guest cannot be explicitly assigned.'
            );
          }
          if (
            desired.source === 'recovery' &&
            (desired.brandId !== undefined || resolvedRolePlan.document.protectedKind !== 'system-admin')
          ) {
            throw new AuthorizationAdministrationError(
              'authorization.protected-role',
              422,
              'Recovery configuration tuples are restricted to the protected system role.'
            );
          }
          if (resolvedRolePlan.document.status !== 'active' && desired.status === 'active') {
            throw new AuthorizationAdministrationError(
              'authorization.invalid-role',
              422,
              'Inactive roles cannot be assigned.'
            );
          }
          if (desired.status === 'active' && desired.expiresAt !== undefined) {
            const expiry = new Date(desired.expiresAt);
            if (expiry.getTime() <= this.dependencies.now().getTime()) {
              throw new AuthorizationAdministrationError(
                'authorization.bulk-invalid',
                422,
                'Imported active assignment expiry must be in the future.'
              );
            }
          }
          const user = await this.canonicalUser(desired.principalId, connection);
          const tuple = assignmentConfigurationKey({ ...desired, principalId: String(user.id) });
          if (canonicalTuples.has(tuple)) {
            throw new AuthorizationAdministrationError(
              'authorization.bulk-invalid',
              422,
              'Imported assignments contain a duplicate canonical tuple.'
            );
          }
          canonicalTuples.add(tuple);
          const currentRole = resolvedRolePlan.current;
          const currentRows =
            currentRole === undefined
              ? []
              : ((await RoleAssignment.find({
                  principalType: 'user',
                  principalId: String(user.id),
                  role: currentRole.id,
                  source: desired.source,
                  sourceKey: desired.sourceKey,
                })
                  .limit(2)
                  .usingConnection(connection)) as RoleAssignmentAttributes[]);
          if (currentRows.length > 1) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'An assignment source tuple is ambiguous.'
            );
          }
          const current = currentRows[0];
          if (
            current !== undefined &&
            (current.principalType !== 'user' ||
              associationId(current.branding) !== desired.brandId ||
              current.sourcePresent !== true ||
              (current.status !== 'active' && current.status !== 'revoked') ||
              !Number.isSafeInteger(current.version) ||
              current.version < 1)
          ) {
            throw new Error('An assignment contains invalid authorization persistence state.');
          }
          stateFacts.push({
            type: 'assignment',
            tuple,
            version: current?.version ?? 0,
            status: current?.status,
            expiresAt: dateString(current?.expiresAt),
          });
          if (current === undefined && desired.version !== 1) {
            throw new AuthorizationAdministrationError(
              'authorization.version-conflict',
              409,
              'A new imported assignment requires version 1.'
            );
          }
          if (current === undefined && desired.source === 'recovery') {
            throw new AuthorizationAdministrationError(
              'authorization.protected-role',
              422,
              'Configuration imports cannot invent a recovery assignment tuple.'
            );
          }
          if (current !== undefined && current.version !== desired.version) {
            throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'An assignment changed.');
          }
          if (current === undefined && desired.status !== 'active') {
            throw new AuthorizationAdministrationError(
              'authorization.bulk-invalid',
              422,
              'A new imported assignment must be active.'
            );
          }
          if (
            desired.status === 'active' &&
            (current === undefined ||
              current.status !== 'active' ||
              current.sourcePresent !== true ||
              dateString(current.expiresAt) !== desired.expiresAt) &&
            !hasEveryScope(
              this.delegableScopeKeys(actor, desired.brandId),
              resolvedRolePlan.document.effectiveScopeKeys.map(scopeKey => scopeKey as ScopeKey)
            )
          ) {
            throw new AuthorizationAdministrationError(
              'authorization.delegation-ceiling',
              403,
              'An imported assignment exceeds the actor delegation ceiling.'
            );
          }
          const changed =
            current === undefined ||
            current.status !== desired.status ||
            current.sourcePresent !== true ||
            dateString(current.expiresAt) !== desired.expiresAt;
          assignmentPlans.push(
            Object.freeze({
              document: desired,
              current,
              canonicalPrincipalId: String(user.id),
              rolePlan: resolvedRolePlan,
              changed,
            })
          );
        } catch (error) {
          this.appendFatal(fatalErrors, 'assignments', index, error);
        }
      }

      const templateChanges = templatePlans.filter(plan => plan.changed).length;
      const roleChanges = rolePlans.filter(plan => plan.changed).length;
      const assignmentChanges = assignmentPlans.filter(plan => plan.changed).length;
      const itemCount = document.templates.length + document.roles.length + (document.assignments?.length ?? 0);
      const noOpCount = itemCount - templateChanges - roleChanges - assignmentChanges;
      return Object.freeze({
        document,
        documentHash: authorizationContentHash(document),
        stateHash: authorizationContentHash(stateFacts),
        templates: Object.freeze(templatePlans),
        roles: Object.freeze(rolePlans),
        assignments: Object.freeze(assignmentPlans),
        templateChanges,
        roleChanges,
        assignmentChanges,
        noOpCount,
        fatalErrors: Object.freeze(fatalErrors),
      });
    }

    private previewFromPlan(
      command: PreviewAuthorizationConfigurationImportCommand,
      plan: ConfigurationImportPlan
    ): AuthorizationConfigurationImportPreview {
      const changed = plan.templateChanges + plan.roleChanges + plan.assignmentChanges > 0;
      const content = Object.freeze({
        documentHash: plan.documentHash,
        stateHash: plan.stateHash,
        reason: optionalAuthorizationText(command.reason, 1_000),
      });
      return Object.freeze({
        operation: 'config-import' as const,
        documentHash: plan.documentHash,
        templateChanges: plan.templateChanges,
        roleChanges: plan.roleChanges,
        assignmentChanges: plan.assignmentChanges,
        noOpCount: plan.noOpCount,
        fatalErrors: plan.fatalErrors,
        confirmationToken:
          changed && plan.fatalErrors.length === 0
            ? this.issueConfirmation(command, 'config-import', content)
            : undefined,
      });
    }

    /** @internal Called through RoleAdministrationService, the supported mutation facade. */
    public async previewImport(
      command: PreviewAuthorizationConfigurationImportCommand
    ): Promise<AuthorizationConfigurationImportPreview> {
      this.requireSystemScope(command);
      const document = parseAuthorizationConfigurationDocument(command.document);
      return this.dependencies.runTransaction(async connection =>
        this.previewFromPlan(command, await this.buildImportPlan(document, command.actor, connection))
      );
    }

    private async replaceOverrides(
      roleId: string,
      overrides: readonly RoleScopeOverride[],
      actorId: string,
      reason: string | undefined,
      connection: Sails.Connection
    ): Promise<void> {
      await RoleScopeOverride.destroy({ role: roleId }).usingConnection(connection);
      if (overrides.length > 0) {
        await RoleScopeOverride.createEach(
          overrides.map(override => ({
            role: roleId,
            scopeKey: override.scopeKey,
            effect: override.effect,
            createdBy: actorId,
            reason,
          }))
        )
          .fetch()
          .usingConnection(connection);
      }
    }

    private async projectLegacyAuthority(
      principalId: string,
      role: RoleAttributes,
      connection: Sails.Connection
    ): Promise<void> {
      const brandId = associationId(role.branding);
      const assignments = (await RoleAssignment.find({
        principalType: 'user',
        principalId,
        role: role.id,
        branding: brandId ?? null,
        status: 'active',
        sourcePresent: true,
        or: [{ expiresAt: null }, { expiresAt: { '>': this.dependencies.now() } }],
      })
        .limit(1)
        .usingConnection(connection)) as RoleAssignmentAttributes[];
      const effective = role.status === 'active' && assignments.length > 0;
      const query = effective
        ? User.addToCollection(principalId, 'roles').members([role.id])
        : User.removeFromCollection(principalId, 'roles').members([role.id]);
      await query.usingConnection(connection);
    }

    private async lockProtectedRole(
      role: RoleAttributes,
      actorId: string,
      connection: Sails.Connection
    ): Promise<RoleAttributes> {
      if (role.protectedKind !== 'brand-admin' && role.protectedKind !== 'system-admin') return role;
      const version = Number(role.version);
      const updated = (await Role.updateOne({ id: role.id, version })
        .set({ version: version + 1, updatedBy: actorId })
        .usingConnection(connection)) as RoleAttributes | undefined;
      if (updated === undefined) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'Protected administrator state changed concurrently.'
        );
      }
      return updated;
    }

    private async assertAdministratorQuorum(
      role: RoleAttributes,
      connection: Sails.Connection,
      requireNonExpiring = false
    ): Promise<void> {
      if (role.protectedKind !== 'brand-admin' && role.protectedKind !== 'system-admin') return;
      const brandId = associationId(role.branding);
      const protectedRoles = (await Role.find({
        contextType: role.protectedKind === 'system-admin' ? 'system' : 'brand',
        protectedKind: role.protectedKind,
        status: 'active',
        branding: role.protectedKind === 'system-admin' ? null : brandId,
      })
        .limit(AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS + 1)
        .usingConnection(connection)) as RoleAttributes[];
      if (protectedRoles.length !== 1) {
        throw new AuthorizationAdministrationError(
          'authorization.protected-role',
          409,
          'Protected administrator role state is inconsistent.'
        );
      }
      const assignments = (await RoleAssignment.find({
        principalType: 'user',
        role: protectedRoles.map(candidate => candidate.id),
        branding: role.protectedKind === 'system-admin' ? null : brandId,
        status: 'active',
        sourcePresent: true,
        ...(requireNonExpiring
          ? { expiresAt: null }
          : { or: [{ expiresAt: null }, { expiresAt: { '>': this.dependencies.now() } }] }),
      })
        .limit(AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS + 1)
        .usingConnection(connection)) as RoleAssignmentAttributes[];
      if (assignments.length > AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS) {
        throw new AuthorizationAdministrationError(
          'authorization.query-bound-exceeded',
          409,
          'Administrator quorum exceeds the bounded validation limit.'
        );
      }
      const principalIds = [...new Set(assignments.map(assignment => assignment.principalId))];
      const users = principalIds.length
        ? ((await User.find({ id: principalIds, loginDisabled: { '!=': true } })
            .limit(principalIds.length)
            .usingConnection(connection)) as UserAttributes[])
        : [];
      if (users.filter(isCanonicalActiveUser).length < 1) {
        throw new AuthorizationAdministrationError(
          role.protectedKind === 'system-admin' ? 'authorization.last-system-admin' : 'authorization.last-brand-admin',
          409,
          requireNonExpiring
            ? 'The import would schedule removal of the final effective administrator.'
            : 'The import would remove the final effective administrator.'
        );
      }
    }

    /** @internal Called through RoleAdministrationService, the supported mutation facade. */
    public async applyImport(
      command: ApplyAuthorizationConfigurationImportCommand
    ): Promise<AuthorizationConfigurationImportResult> {
      this.requireSystemScope(command);
      let auditInput = this.auditInput(command, 'authorization.config-imported', CONFIGURATION_TARGET);
      try {
        const document = parseAuthorizationConfigurationDocument(command.document);
        auditInput = { ...auditInput, targetId: authorizationContentHash(document) };
        return await this.dependencies.runTransaction(async connection => {
          const plan = await this.buildImportPlan(document, command.actor, connection);
          const content = Object.freeze({
            documentHash: plan.documentHash,
            stateHash: plan.stateHash,
            reason: optionalAuthorizationText(command.reason, 1_000),
          });
          this.verifyConfirmation(command, command.confirmationToken, 'config-import', content);
          if (plan.fatalErrors.length > 0) {
            throw new AuthorizationAdministrationError(
              'authorization.bulk-invalid',
              422,
              'The configuration import contains semantic errors.'
            );
          }
          if (plan.templateChanges + plan.roleChanges + plan.assignmentChanges === 0) {
            throw new AuthorizationAdministrationError(
              'authorization.preview-stale',
              409,
              'The configuration import no longer contains a change.'
            );
          }
          const actorId = this.actorId(command);
          const batchId = this.dependencies.randomId();
          const importedTemplateByKey = new Map<string, RoleTemplateAttributes>();
          for (const templatePlan of plan.templates) {
            let current = templatePlan.current;
            if (templatePlan.changed) {
              for (const revision of templatePlan.newRevisions) {
                await RoleTemplateRevision.create({
                  template: current.id,
                  revision: revision.revision,
                  scopeKeys: revision.scopeKeys,
                  notes: revision.notes,
                  publishedBy: actorId,
                  publishedAt: this.dependencies.now(),
                })
                  .fetch()
                  .usingConnection(connection);
              }
              const updated = (await RoleTemplate.updateOne({ id: current.id, version: current.version })
                .set({
                  displayName: templatePlan.document.displayName,
                  description: templatePlan.document.description,
                  currentRevision: templatePlan.document.revisions.length,
                  version: current.version + 1,
                })
                .usingConnection(connection)) as RoleTemplateAttributes | undefined;
              if (updated === undefined) {
                throw new AuthorizationAdministrationError(
                  'authorization.version-conflict',
                  409,
                  'A template changed.'
                );
              }
              current = updated;
              await this.dependencies.audit().createSucceededEvent(
                this.auditInput(
                  { ...command, batchId },
                  templatePlan.newRevisions.length > 0 ? 'template.revision-published' : 'template.reconciled',
                  current.id,
                  {
                    batchId,
                    after: { key: current.key, version: current.version, currentRevision: current.currentRevision },
                  }
                ),
                connection
              );
            }
            importedTemplateByKey.set(current.key, current);
          }

          const appliedRoleByContext = new Map<string, RoleAttributes>();
          for (const rolePlan of plan.roles) {
            let role = rolePlan.current;
            if (rolePlan.changed) {
              const template =
                rolePlan.document.templateKey === undefined
                  ? undefined
                  : (importedTemplateByKey.get(rolePlan.document.templateKey) ?? rolePlan.template);
              if (role === undefined) {
                role = (await Role.create({
                  name: rolePlan.document.key,
                  key: rolePlan.document.key,
                  identityKey: buildRoleIdentityKey('brand', rolePlan.document.key, rolePlan.document.brandId),
                  displayName: rolePlan.document.displayName,
                  description: rolePlan.document.description,
                  contextType: 'brand',
                  branding: rolePlan.document.brandId,
                  template: template?.id,
                  templateRevision: rolePlan.document.templateRevision,
                  protectedKind: 'none',
                  status: 'active',
                  version: 1,
                  createdBy: actorId,
                  updatedBy: actorId,
                })
                  .fetch()
                  .usingConnection(connection)) as RoleAttributes;
              } else {
                const updated = (await Role.updateOne({ id: role.id, version: role.version })
                  .set({
                    displayName: rolePlan.document.displayName,
                    description: rolePlan.document.description ?? null,
                    template: template?.id ?? null,
                    templateRevision: rolePlan.document.templateRevision ?? null,
                    version: Number(role.version) + 1,
                    updatedBy: actorId,
                  })
                  .usingConnection(connection)) as RoleAttributes | undefined;
                if (updated === undefined) {
                  throw new AuthorizationAdministrationError('authorization.version-conflict', 409, 'A role changed.');
                }
                role = updated;
              }
              await this.replaceOverrides(role.id, rolePlan.overrides, actorId, command.reason, connection);
              await this.dependencies.audit().createSucceededEvent(
                this.auditInput(
                  { ...command, batchId },
                  rolePlan.current === undefined ? 'role.created' : 'role.updated',
                  role.id,
                  {
                    batchId,
                    after: {
                      brandId: rolePlan.document.brandId,
                      key: rolePlan.document.key,
                      version: role.version,
                      effectiveScopeKeys: rolePlan.document.effectiveScopeKeys,
                    },
                  }
                ),
                connection
              );
            }
            if (role === undefined) throw new Error('An imported role was not materialized.');
            appliedRoleByContext.set(configurationContextKey(rolePlan.document.brandId, rolePlan.document.key), role);
          }

          const lockedProtectedRoleIds = new Set<string>();
          const changedProtectedRoles = new Map<
            string,
            { readonly role: RoleAttributes; readonly requireNonExpiring: boolean }
          >();
          for (const assignmentPlan of plan.assignments) {
            if (!assignmentPlan.changed) continue;
            const desired = assignmentPlan.document;
            let role =
              appliedRoleByContext.get(configurationContextKey(desired.brandId, desired.roleKey)) ??
              assignmentPlan.rolePlan.current;
            if (role === undefined) throw new Error('An imported assignment role was not materialized.');
            let current = assignmentPlan.current;
            const touchesProtectedQuorum =
              (role.protectedKind === 'brand-admin' || role.protectedKind === 'system-admin') &&
              (desired.status === 'revoked' || desired.expiresAt !== undefined);
            if (touchesProtectedQuorum && !lockedProtectedRoleIds.has(role.id)) {
              role = await this.lockProtectedRole(role, actorId, connection);
              lockedProtectedRoleIds.add(role.id);
            }
            if (touchesProtectedQuorum) {
              const previous = changedProtectedRoles.get(role.id);
              changedProtectedRoles.set(role.id, {
                role,
                requireNonExpiring:
                  previous?.requireNonExpiring === true ||
                  (desired.status === 'active' && desired.expiresAt !== undefined),
              });
            }
            const before = current === undefined ? undefined : { status: current.status, version: current.version };
            let eventType: AuthorizationAuditEventType;
            if (current === undefined) {
              current = (await RoleAssignment.create({
                principalType: 'user',
                principalId: assignmentPlan.canonicalPrincipalId,
                role: role.id,
                branding: associationId(role.branding),
                source: desired.source,
                sourceKey: desired.sourceKey,
                status: 'active',
                sourcePresent: true,
                assignedBy: actorId,
                assignedAt: this.dependencies.now(),
                expiresAt: desired.expiresAt,
                version: 1,
              })
                .fetch()
                .usingConnection(connection)) as RoleAssignmentAttributes;
              eventType = 'assignment.created';
            } else if (desired.status === 'active') {
              const updated = (await RoleAssignment.updateOne({ id: current.id, version: current.version })
                .set({
                  status: 'active',
                  sourcePresent: true,
                  assignedBy: actorId,
                  assignedAt: this.dependencies.now(),
                  expiresAt: desired.expiresAt ?? null,
                  revokedBy: null,
                  revokedAt: null,
                  suppressedBy: null,
                  suppressedAt: null,
                  reason: optionalAuthorizationText(command.reason, 1_000),
                  version: current.version + 1,
                })
                .usingConnection(connection)) as RoleAssignmentAttributes | undefined;
              if (updated === undefined) {
                throw new AuthorizationAdministrationError(
                  'authorization.version-conflict',
                  409,
                  'An assignment changed.'
                );
              }
              current = updated;
              eventType = 'assignment.reactivated';
            } else {
              const updated = (await RoleAssignment.updateOne({ id: current.id, version: current.version })
                .set({
                  status: 'revoked',
                  revokedBy: actorId,
                  revokedAt: this.dependencies.now(),
                  reason: optionalAuthorizationText(command.reason, 1_000),
                  version: current.version + 1,
                })
                .usingConnection(connection)) as RoleAssignmentAttributes | undefined;
              if (updated === undefined) {
                throw new AuthorizationAdministrationError(
                  'authorization.version-conflict',
                  409,
                  'An assignment changed.'
                );
              }
              current = updated;
              eventType = 'assignment.revoked';
            }
            await this.projectLegacyAuthority(assignmentPlan.canonicalPrincipalId, role, connection);
            await this.dependencies.audit().createSucceededEvent(
              this.auditInput({ ...command, batchId }, eventType, current.id, {
                batchId,
                before,
                after: {
                  brandId: desired.brandId,
                  roleKey: desired.roleKey,
                  principalId: assignmentPlan.canonicalPrincipalId,
                  status: current.status,
                  version: current.version,
                },
              }),
              connection
            );
          }
          for (const protectedChange of changedProtectedRoles.values()) {
            await this.assertAdministratorQuorum(protectedChange.role, connection, protectedChange.requireNonExpiring);
          }
          const data = Object.freeze({
            templateChanges: plan.templateChanges,
            roleChanges: plan.roleChanges,
            assignmentChanges: plan.assignmentChanges,
            noOpCount: plan.noOpCount,
            documentHash: plan.documentHash,
          });
          const audit = await this.dependencies.audit().createSucceededEvent(
            this.auditInput({ ...command, batchId }, 'authorization.config-imported', plan.documentHash, {
              batchId,
              after: data,
            }),
            connection
          );
          return Object.freeze({
            data,
            version: 1 as const,
            auditEventId: audit.eventId,
            requestId: command.requestId,
            batchId,
            changed: true as const,
          });
        });
      } catch (error) {
        await this.dependencies.audit().recordAttempt(
          {
            ...auditInput,
            reasonCode: error instanceof AuthorizationAdministrationError ? error.code : undefined,
          },
          error instanceof AuthorizationAdministrationError ? 'denied' : 'failed'
        );
        throw error;
      }
    }
  }
}

declare global {
  let AuthorizationConfigurationService: Services.AuthorizationConfigurationService;
}
