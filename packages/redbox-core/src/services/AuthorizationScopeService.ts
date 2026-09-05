import { Services as services } from '../CoreService';
import {
  CORE_AUTHORIZATION_CATALOG_VERSION,
  DEFAULT_ROLE_TEMPLATES,
  AUTHORIZATION_TEMPLATE_REVISION_WINDOW_SIZE,
  SCOPE_KEY_MAX_LENGTH,
  AuthorizationAdministrationError,
  asScopeKey,
  createCoreAuthorizationScopeSource,
  createScopeRegistry,
  validateDefaultRoleTemplates,
  type AuthorizationContext,
  type AuthorizationScopeRisk,
  type AuthorizationScopeSourceType,
  type AuthorizationScopeStatus,
  type DefaultRoleTemplateDefinition,
  type ProtectedRoleKind,
  type RegisteredScopeDefinition,
  type ScopeKey,
  type ScopeRegistry,
  type ScopeRegistrySource,
} from '../authorization';
import type { AuthorizationScopeAttributes } from '../waterline-models/AuthorizationScope';
import type { RoleTemplateAttributes } from '../waterline-models/RoleTemplate';
import type { RoleTemplateRevisionAttributes } from '../waterline-models/RoleTemplateRevision';
import { runWithRequiredTransaction } from '../utilities/RequiredTransactionUtils';
import {
  fenceLeaseInMutationSession,
  getActiveMigrationLease,
  isDurableMutationLeaseRequired,
  type MigrationLeaseHandle,
} from './AuthorizationMigrationService';

/** Bootstrap/migration lease threaded into every mutating catalog/template transaction. */
export type CatalogMutationLease = Pick<MigrationLeaseHandle, 'owner' | 'fence'>;

/**
 * Fail-closed entry guard for mutating catalog entry points. Resolves the
 * explicit lease (wins) or the runner/bootstrap active lease, then requires
 * one whenever durability can be checked (production or a durable lease
 * collection or a live memory holder). Pure unit-test doubles with no holder
 * anywhere keep the historical leaseless path; every durable topology rejects
 * before the first scope/template write. Read-only paths (listCatalog,
 * listTemplates, getTemplateRevision, orphan preview) never call this.
 */
function requireCatalogMutationLease(
  operation: string,
  explicitLease?: CatalogMutationLease
): CatalogMutationLease | undefined {
  const lease =
    explicitLease !== undefined &&
    typeof explicitLease.owner === 'string' &&
    explicitLease.owner.length > 0 &&
    typeof explicitLease.fence === 'number' &&
    Number.isSafeInteger(explicitLease.fence)
      ? explicitLease
      : getActiveMigrationLease();
  if (isDurableMutationLeaseRequired() && lease === undefined) {
    throw new Error(`Authorization catalog ${operation} rejected: no lease held; acquire the migration lease first.`);
  }
  return lease;
}

const ACTOR_ID = 'authorization-catalog-bootstrap';
export const AUTHORIZATION_ORPHAN_PAGE_SIZE = 100;
export const AUTHORIZATION_CATALOG_DEFAULT_PAGE_SIZE = 50;
export const AUTHORIZATION_CATALOG_MAX_PAGE_SIZE = 100;

/**
 * Unique-conflict detector for startup reconciliation races. Two lifting
 * instances may create the same scope/template/revision concurrently; the
 * loser must reread the winner in a fresh transaction (MongoDB aborts the
 * writing transaction on duplicate-key) and adopt it only on exact identity.
 */
function readErrorCode(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('code' in value)) return undefined;
  return value.code;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (readErrorCode(error) === 'E_UNIQUE' || readErrorCode(error) === 11_000) return true;
  if (typeof error !== 'object' || error === null) return false;
  for (const nestedKey of ['raw', 'cause', 'details'] as const) {
    const nested: unknown = Reflect.get(error, nestedKey);
    if (readErrorCode(nested) === 'E_UNIQUE' || readErrorCode(nested) === 11_000) return true;
  }
  return false;
}

export interface AuthorizationCatalogQuery {
  readonly actor: AuthorizationContext;
  readonly cursor?: string;
  readonly limit?: number;
  readonly namespace?: string;
  readonly risk?: AuthorizationScopeRisk;
  readonly search?: string;
  readonly sourceType?: AuthorizationScopeSourceType;
  readonly status?: AuthorizationScopeStatus;
}

export interface AuthorizationCatalogItem {
  readonly key: ScopeKey;
  readonly namespace: string;
  readonly label: string;
  readonly description: string;
  readonly risk: AuthorizationScopeRisk;
  readonly sourceType: AuthorizationScopeSourceType;
  readonly sourcePackage: string;
  readonly sourceVersion: string;
  readonly status: AuthorizationScopeStatus;
  readonly replacementKey?: ScopeKey;
  readonly metadataVersion: number;
}

export interface AuthorizationCatalogPage {
  readonly generation: string;
  readonly items: readonly AuthorizationCatalogItem[];
  readonly nextCursor?: string;
}

export interface AuthorizationTemplateQuery {
  readonly actor: AuthorizationContext;
  readonly cursor?: string;
  readonly limit?: number;
  readonly protectedKind?: ProtectedRoleKind;
  readonly search?: string;
  readonly status?: 'active' | 'inactive';
}

export interface AuthorizationTemplateRevisionItem {
  readonly revision: number;
  readonly scopeKeys: readonly ScopeKey[];
  readonly notes?: string;
  readonly publishedBy: string;
  readonly publishedAt: string;
}

export type AuthorizationTemplateRevisionSummaryItem = Omit<AuthorizationTemplateRevisionItem, 'scopeKeys'>;

export interface AuthorizationTemplateItem {
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  readonly currentRevision: number;
  readonly protectedKind: ProtectedRoleKind;
  readonly status: 'active' | 'inactive';
  readonly version: number;
  readonly revisions: readonly AuthorizationTemplateRevisionSummaryItem[];
  readonly revisionsTruncated: boolean;
}

export interface AuthorizationTemplatePage {
  readonly items: readonly AuthorizationTemplateItem[];
  readonly nextCursor?: string;
}

export interface AuthorizationCatalogReconciliationResult {
  readonly generation: string;
  readonly scopesCreated: number;
  readonly scopesUpdated: number;
  readonly templatesCreated: number;
  readonly revisionsPublished: number;
}

export interface AuthorizationOrphanImpact {
  readonly key: string;
  readonly overrideCount: number;
  readonly templateRevisionCount: number;
}

export interface AuthorizationOrphanReconciliationOptions {
  readonly apply?: boolean;
  readonly expectedGeneration?: string;
  readonly afterKey?: string;
  readonly limit?: number;
  /**
   * Bootstrap/migration lease fencing the apply-path mutation transaction.
   * When supplied, the orphan-marking write carries the same session-bound
   * conditional owner+fence+unexpired write fence as catalog reconciliation.
   */
  readonly lease?: CatalogMutationLease;
}

export interface AuthorizationOrphanReconciliationResult {
  readonly generation: string;
  readonly applied: boolean;
  readonly impacts: readonly AuthorizationOrphanImpact[];
  readonly nextCursor?: string;
}

function scopeProjection(definition: RegisteredScopeDefinition, generation: string) {
  return {
    namespace: definition.namespace,
    label: definition.label,
    description: definition.description,
    risk: definition.risk,
    sourceType: definition.sourceType,
    sourcePackage: definition.sourcePackage,
    sourceVersion: definition.sourceVersion,
    status: definition.status,
    replacementKey: definition.replacementKey,
    lastSeenGeneration: generation,
  };
}

function scopeMetadataChanged(
  current: AuthorizationScopeAttributes,
  next: ReturnType<typeof scopeProjection>
): boolean {
  return (
    current.namespace !== next.namespace ||
    current.label !== next.label ||
    current.description !== next.description ||
    current.risk !== next.risk ||
    current.sourceType !== next.sourceType ||
    current.sourcePackage !== next.sourcePackage ||
    current.sourceVersion !== next.sourceVersion ||
    current.status !== next.status ||
    current.replacementKey !== next.replacementKey ||
    current.lastSeenGeneration !== next.lastSeenGeneration
  );
}

function canonicalScopeKeys(scopeKeys: readonly string[]): string[] {
  return [...scopeKeys];
}

async function writeSuccessAudit(
  eventType: 'scope.catalog-reconciled' | 'scope.orphaned' | 'template.reconciled' | 'template.revision-published',
  targetType: 'authorization-scope' | 'role-template' | 'role-template-revision',
  targetId: string,
  after: unknown,
  connection: Sails.Connection
): Promise<void> {
  await sails.services.authorizationauditservice.createSucceededEvent(
    {
      eventType,
      actorType: 'system-process',
      actorId: ACTOR_ID,
      authMethod: 'internal',
      targetType,
      targetId,
      after,
      reasonCode: eventType,
    },
    connection
  );
}

async function reconcileScope(
  definition: RegisteredScopeDefinition,
  generation: string,
  raceAdopted = false,
  lease?: CatalogMutationLease
): Promise<'created' | 'updated' | 'unchanged'> {
  // Steady state is "every declared scope already matches", so an unsynchronised read
  // short-circuits the common path rather than opening one transaction per scope on
  // every lift. The authoritative re-read below still runs inside the transaction.
  const preview = await AuthorizationScope.findOne({ key: definition.key });
  if (preview != null && !scopeMetadataChanged(preview, scopeProjection(definition, generation))) {
    return 'unchanged';
  }
  try {
    return await runWithRequiredTransaction(AuthorizationScope.getDatastore(), async connection => {
      // Early session-bound lease gate: fail fast when the lease is already
      // lost. The commit-guarding fence below (after every write, immediately
      // before the transaction returns) is authoritative: a TTL takeover at
      // any point during the transaction aborts instead of reconciling the
      // catalog past a lost lease. On durable topologies an absent lease
      // rejects here before any scope write; pure unit-test doubles with no
      // holder anywhere keep the historical leaseless path.
      if (lease !== undefined) {
        await fenceLeaseInMutationSession(lease, connection, `catalog scope '${definition.key}'`);
      } else if (isDurableMutationLeaseRequired()) {
        throw new Error(
          `Authorization catalog scope '${definition.key}' rejected: no lease held; acquire the migration lease first.`
        );
      }
      const current = await AuthorizationScope.findOne({ key: definition.key }).usingConnection(connection);
      const projection = scopeProjection(definition, generation);
      if (current == null) {
        const created = await AuthorizationScope.create({
          key: definition.key,
          ...projection,
          metadataVersion: 1,
        })
          .fetch()
          .usingConnection(connection);
        await writeSuccessAudit(
          'scope.catalog-reconciled',
          'authorization-scope',
          created.id,
          { key: created.key, generation, action: 'created' },
          connection
        );
        // Commit-guarding fence: the create+audit above must not commit past
        // a lease lost mid-transaction.
        if (lease !== undefined) {
          await fenceLeaseInMutationSession(lease, connection, `catalog scope '${definition.key}' (pre-commit)`);
        }
        return 'created';
      }
      if (
        current.namespace !== definition.namespace ||
        current.sourceType !== definition.sourceType ||
        current.sourcePackage !== definition.sourcePackage
      ) {
        throw new Error(`Declared scope '${definition.key}' conflicts with its persisted identity owner.`);
      }
      if (!scopeMetadataChanged(current, projection)) {
        return 'unchanged';
      }
      // Compare-and-swap on the expected metadata version: a concurrent
      // reconciliation that already advanced this scope no longer matches, so the
      // stale write surfaces as a concurrency failure instead of silently
      // clobbering the newer metadata.
      const updated = await AuthorizationScope.updateOne({ id: current.id, metadataVersion: current.metadataVersion })
        .set({ ...projection, metadataVersion: current.metadataVersion + 1 })
        .usingConnection(connection);
      if (updated == null) {
        throw new Error(`Declared scope '${definition.key}' changed concurrently during reconciliation.`);
      }
      await writeSuccessAudit(
        'scope.catalog-reconciled',
        'authorization-scope',
        current.id,
        { key: definition.key, generation, action: 'updated' },
        connection
      );
      // Commit-guarding fence: the CAS update+audit above must not commit
      // past a lease lost mid-transaction.
      if (lease !== undefined) {
        await fenceLeaseInMutationSession(lease, connection, `catalog scope '${definition.key}' (pre-commit)`);
      } else if (isDurableMutationLeaseRequired()) {
        throw new Error(
          `Authorization catalog scope '${definition.key}' rejected: no lease held; acquire the migration lease first.`
        );
      }
      return 'updated';
    });
  } catch (error) {
    if (!raceAdopted && isUniqueConstraintError(error)) {
      // A concurrent lift created this scope first. The writing transaction is
      // aborted, so retry once in a fresh transaction: the winner is adopted
      // when its persisted identity matches, and identity drift throws below.
      // The lease propagates so the retry is fenced exactly like the first
      // attempt; a lease lost in between fails closed instead of adopting.
      return reconcileScope(definition, generation, true, lease);
    }
    throw error;
  }
}

async function reconcileTemplate(
  definition: DefaultRoleTemplateDefinition,
  raceAdopted = false,
  lease?: CatalogMutationLease
): Promise<{ readonly templateCreated: boolean; readonly revisionPublished: boolean }> {
  try {
    return await runWithRequiredTransaction(RoleTemplate.getDatastore(), async connection => {
      // Early session-bound lease gate shared with the scope path above; the
      // commit-guarding fence before the return below is authoritative. On
      // durable topologies an absent lease rejects here before any
      // template/revision write.
      if (lease !== undefined) {
        await fenceLeaseInMutationSession(lease, connection, `catalog template '${definition.key}'`);
      } else if (isDurableMutationLeaseRequired()) {
        throw new Error(
          `Authorization catalog template '${definition.key}' rejected: no lease held; acquire the migration lease first.`
        );
      }
      let template = await RoleTemplate.findOne({ key: definition.key }).usingConnection(connection);
      let templateCreated = false;
      if (template == null) {
        template = await RoleTemplate.create({
          key: definition.key,
          displayName: definition.displayName,
          description: definition.description,
          currentRevision: definition.revision,
          protectedKind: definition.protectedKind,
          status: 'active',
          version: 1,
        })
          .fetch()
          .usingConnection(connection);
        templateCreated = true;
      } else if (template.protectedKind !== definition.protectedKind) {
        throw new Error(`Default role template '${definition.key}' cannot be repurposed to another protected kind.`);
      }

      let revision = await RoleTemplateRevision.findOne({
        template: template.id,
        revision: definition.revision,
      }).usingConnection(connection);
      let revisionPublished = false;
      if (revision == null) {
        revision = await RoleTemplateRevision.create({
          template: template.id,
          revision: definition.revision,
          scopeKeys: canonicalScopeKeys(definition.scopeKeys),
          notes: `Declared default revision ${definition.contentHash}`,
          publishedBy: ACTOR_ID,
          publishedAt: new Date(),
        })
          .fetch()
          .usingConnection(connection);
        revisionPublished = true;
      } else if (JSON.stringify(revision.scopeKeys) !== JSON.stringify(definition.scopeKeys)) {
        throw new Error(`Immutable default template revision '${definition.key}:${definition.revision}' has drifted.`);
      }

      if (template.currentRevision < definition.revision) {
        // Advance the template pointer only when both the revision and the row
        // version still match the snapshot read above: a concurrent advance wins
        // and this stale write fails closed instead of double-applying it.
        const advanced = await RoleTemplate.updateOne({
          id: template.id,
          currentRevision: template.currentRevision,
          version: template.version,
        })
          .set({ currentRevision: definition.revision, version: template.version + 1 })
          .usingConnection(connection);
        if (advanced == null) {
          throw new Error(`Default role template '${definition.key}' changed concurrently during reconciliation.`);
        }
      }

      if (revisionPublished) {
        await writeSuccessAudit(
          'template.revision-published',
          'role-template-revision',
          revision.id,
          { templateKey: definition.key, revision: definition.revision, contentHash: definition.contentHash },
          connection
        );
      } else if (templateCreated) {
        await writeSuccessAudit(
          'template.reconciled',
          'role-template',
          template.id,
          { templateKey: definition.key, revision: definition.revision },
          connection
        );
      }
      // Commit-guarding fence: template/revision writes above must not commit
      // past a lease lost mid-transaction. On durable topologies an absent
      // lease rejects here rather than committing template state unfenced.
      if (lease !== undefined) {
        await fenceLeaseInMutationSession(lease, connection, `catalog template '${definition.key}' (pre-commit)`);
      } else if (isDurableMutationLeaseRequired()) {
        throw new Error(
          `Authorization catalog template '${definition.key}' rejected: no lease held; acquire the migration lease first.`
        );
      }
      return { templateCreated, revisionPublished };
    });
  } catch (error) {
    if (!raceAdopted && isUniqueConstraintError(error)) {
      // A concurrent lift created the template or revision first. The writing
      // transaction is aborted, so retry once in a fresh transaction: an
      // identical winner is adopted, while repurposed-kind or content drift
      // throws through the normal identity checks below. The lease propagates
      // so the retry stays fenced.
      return reconcileTemplate(definition, true, lease);
    }
    throw error;
  }
}

function boundedOrphanLimit(limit: number | undefined): number {
  if (limit === undefined) return AUTHORIZATION_ORPHAN_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > AUTHORIZATION_ORPHAN_PAGE_SIZE) {
    throw new Error(
      `Authorization orphan reconciliation limit must be between 1 and ${AUTHORIZATION_ORPHAN_PAGE_SIZE}.`
    );
  }
  return limit;
}

function boundedCatalogLimit(limit: number | undefined): number {
  if (limit === undefined) return AUTHORIZATION_CATALOG_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > AUTHORIZATION_CATALOG_MAX_PAGE_SIZE) {
    throw new AuthorizationAdministrationError(
      'authorization.invalid-query',
      400,
      `Authorization catalog limit must be between 1 and ${AUTHORIZATION_CATALOG_MAX_PAGE_SIZE}.`
    );
  }
  return limit;
}

function boundedQueryText(value: string | undefined, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maxLength) {
    throw new AuthorizationAdministrationError(
      'authorization.invalid-query',
      400,
      `${field} must contain between 1 and ${maxLength} characters.`
    );
  }
  return normalized;
}

function requireCatalogScope(actor: AuthorizationContext, scopeKey: ScopeKey): void {
  if (!actor.principal.active || !actor.effectiveScopeKeys.includes(scopeKey)) {
    throw new AuthorizationAdministrationError(
      actor.principal.active ? 'authorization.scope-denied' : 'authorization.authentication-required',
      actor.principal.active ? 403 : 401,
      'The actor is not authorized to read this authorization catalog.'
    );
  }
}

function scopeCatalogItem(scope: AuthorizationScopeAttributes): AuthorizationCatalogItem {
  return Object.freeze({
    key: asScopeKey(scope.key),
    namespace: scope.namespace,
    label: scope.label,
    description: scope.description,
    risk: scope.risk,
    sourceType: scope.sourceType,
    sourcePackage: scope.sourcePackage,
    sourceVersion: scope.sourceVersion,
    status: scope.status,
    ...(scope.replacementKey === undefined ? {} : { replacementKey: asScopeKey(scope.replacementKey) }),
    metadataVersion: scope.metadataVersion,
  });
}

function associationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = value.id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return undefined;
}

function templateRevisionItem(revision: RoleTemplateRevisionAttributes): AuthorizationTemplateRevisionItem {
  return Object.freeze({
    revision: revision.revision,
    scopeKeys: Object.freeze(revision.scopeKeys.map(scopeKey => asScopeKey(scopeKey))),
    ...(revision.notes === undefined ? {} : { notes: revision.notes }),
    publishedBy: revision.publishedBy,
    publishedAt: new Date(revision.publishedAt).toISOString(),
  });
}

function templateRevisionSummaryItem(
  revision: RoleTemplateRevisionAttributes
): AuthorizationTemplateRevisionSummaryItem {
  const item = templateRevisionItem(revision);
  return Object.freeze({
    revision: item.revision,
    ...(item.notes === undefined ? {} : { notes: item.notes }),
    publishedBy: item.publishedBy,
    publishedAt: item.publishedAt,
  });
}

function templateItem(
  template: RoleTemplateAttributes,
  revisions: readonly RoleTemplateRevisionAttributes[]
): AuthorizationTemplateItem {
  return Object.freeze({
    key: template.key,
    displayName: template.displayName,
    description: template.description,
    currentRevision: template.currentRevision,
    protectedKind: template.protectedKind,
    status: template.status,
    version: template.version,
    revisions: Object.freeze(revisions.map(templateRevisionSummaryItem)),
    revisionsTruncated: template.currentRevision - AUTHORIZATION_TEMPLATE_REVISION_WINDOW_SIZE >= 1,
  });
}

function configuredHookScopeSources(): readonly ScopeRegistrySource[] {
  const configured = sails.config.authorizationScopeSources;
  return Array.isArray(configured) ? configured : [];
}

export namespace Services {
  export class AuthorizationScopeService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'getRegistry',
      'getTemplateRevision',
      'listCatalog',
      'listTemplates',
      'reconcileDeclaredCatalog',
      'reconcileOrphans',
    ];

    private registry?: ScopeRegistry;

    public buildRegistry(
      additionalSources: readonly ScopeRegistrySource[] = configuredHookScopeSources()
    ): ScopeRegistry {
      const registry = createScopeRegistry([
        createCoreAuthorizationScopeSource(CORE_AUTHORIZATION_CATALOG_VERSION),
        ...additionalSources,
      ]);
      validateDefaultRoleTemplates(registry);
      return registry;
    }

    public getRegistry(): ScopeRegistry {
      this.registry ??= this.buildRegistry();
      return this.registry;
    }

    public async bootstrap(
      additionalSources: readonly ScopeRegistrySource[] = configuredHookScopeSources(),
      lease?: CatalogMutationLease
    ): Promise<AuthorizationCatalogReconciliationResult> {
      // Fail-closed before any catalog write on durable topologies; the
      // effective lease (explicit wins, else the runner/bootstrap active
      // lease) threads into every scope/template transaction below.
      const effectiveLease = requireCatalogMutationLease('bootstrap', lease);
      return this.reconcileDeclaredCatalog(additionalSources, effectiveLease);
    }

    public async listCatalog(query: AuthorizationCatalogQuery): Promise<AuthorizationCatalogPage> {
      requireCatalogScope(query.actor, asScopeKey('authorization.scope.read'));
      const limit = boundedCatalogLimit(query.limit);
      const cursor = boundedQueryText(query.cursor, 'cursor', 256);
      const namespace = boundedQueryText(query.namespace, 'namespace', SCOPE_KEY_MAX_LENGTH);
      const search = boundedQueryText(query.search, 'search', 128);
      const criteria: Record<string, unknown> = {};
      if (cursor !== undefined) criteria.key = { '>': cursor };
      if (namespace !== undefined) criteria.namespace = namespace;
      if (query.risk !== undefined) criteria.risk = query.risk;
      if (query.sourceType !== undefined) criteria.sourceType = query.sourceType;
      if (query.status !== undefined) criteria.status = query.status;
      if (search !== undefined) {
        criteria.or = [
          { key: { contains: search } },
          { label: { contains: search } },
          { description: { contains: search } },
          { sourcePackage: { contains: search } },
        ];
      }
      const rows = (await AuthorizationScope.find(criteria)
        .sort('key ASC')
        .limit(limit + 1)) as AuthorizationScopeAttributes[] | undefined;
      const page = (rows ?? []).slice(0, limit);
      return Object.freeze({
        generation: this.getRegistry().generation,
        items: Object.freeze(page.map(scopeCatalogItem)),
        ...((rows?.length ?? 0) > limit && page.length > 0 ? { nextCursor: page[page.length - 1].key } : {}),
      });
    }

    public async listTemplates(query: AuthorizationTemplateQuery): Promise<AuthorizationTemplatePage> {
      requireCatalogScope(query.actor, asScopeKey('authorization.role.read'));
      const limit = boundedCatalogLimit(query.limit);
      const cursor = boundedQueryText(query.cursor, 'cursor', 256);
      const search = boundedQueryText(query.search, 'search', 128);
      const criteria: Record<string, unknown> = {};
      if (cursor !== undefined) criteria.key = { '>': cursor };
      if (query.protectedKind !== undefined) criteria.protectedKind = query.protectedKind;
      if (query.status !== undefined) criteria.status = query.status;
      if (search !== undefined) {
        criteria.or = [
          { key: { contains: search } },
          { displayName: { contains: search } },
          { description: { contains: search } },
        ];
      }
      const rows = (await RoleTemplate.find(criteria)
        .sort('key ASC')
        .limit(limit + 1)) as RoleTemplateAttributes[] | undefined;
      const page = (rows ?? []).slice(0, limit);
      const revisionWindows = page.map(template => ({
        template: String(template.id),
        revision: {
          '>=': Math.max(1, template.currentRevision - AUTHORIZATION_TEMPLATE_REVISION_WINDOW_SIZE + 1),
        },
      }));
      const revisions = revisionWindows.length
        ? ((await RoleTemplateRevision.find({ or: revisionWindows }).sort([
            { template: 'ASC' },
            { revision: 'DESC' },
          ])) as RoleTemplateRevisionAttributes[] | undefined)
        : [];
      const revisionsByTemplate = new Map<string, RoleTemplateRevisionAttributes[]>();
      for (const revision of revisions ?? []) {
        const templateId = associationId(revision.template);
        if (templateId === undefined) continue;
        const collected = revisionsByTemplate.get(templateId) ?? [];
        collected.push(revision);
        revisionsByTemplate.set(templateId, collected);
      }
      return Object.freeze({
        items: Object.freeze(
          page.map(template => templateItem(template, revisionsByTemplate.get(String(template.id)) ?? []))
        ),
        ...((rows?.length ?? 0) > limit && page.length > 0 ? { nextCursor: page[page.length - 1].key } : {}),
      });
    }

    public async getTemplateRevision(
      actor: AuthorizationContext,
      templateKey: string,
      revisionNumber: number
    ): Promise<AuthorizationTemplateRevisionItem & { readonly templateKey: string }> {
      requireCatalogScope(actor, asScopeKey('authorization.role.read'));
      const key = boundedQueryText(templateKey, 'templateKey', 64);
      if (key === undefined || !Number.isSafeInteger(revisionNumber) || revisionNumber < 1) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-query',
          400,
          'A valid template key and positive revision are required.'
        );
      }
      const template = await RoleTemplate.findOne({ key });
      if (template == null) {
        throw new AuthorizationAdministrationError(
          'authorization.not-found',
          404,
          'The requested role template was not found.'
        );
      }
      const revision = await RoleTemplateRevision.findOne({ template: template.id, revision: revisionNumber });
      if (revision == null) {
        throw new AuthorizationAdministrationError(
          'authorization.not-found',
          404,
          'The requested role template revision was not found.'
        );
      }
      return Object.freeze({ templateKey: template.key, ...templateRevisionItem(revision) });
    }

    public async reconcileDeclaredCatalog(
      additionalSources: readonly ScopeRegistrySource[] = configuredHookScopeSources(),
      lease?: CatalogMutationLease
    ): Promise<AuthorizationCatalogReconciliationResult> {
      // Fail-closed entry gate: unleased callers on a durable datastore must
      // not create/update scope/template rows before any fence can reject.
      // Read-only callers use listCatalog/listTemplates instead.
      const effectiveLease = requireCatalogMutationLease('reconcileDeclaredCatalog', lease);
      const registry = this.buildRegistry(additionalSources);
      let scopesCreated = 0;
      let scopesUpdated = 0;
      for (const definition of registry.all) {
        const result = await reconcileScope(definition, registry.generation, false, effectiveLease);
        if (result === 'created') scopesCreated += 1;
        if (result === 'updated') scopesUpdated += 1;
      }
      let templatesCreated = 0;
      let revisionsPublished = 0;
      for (const definition of DEFAULT_ROLE_TEMPLATES) {
        const result = await reconcileTemplate(definition, false, effectiveLease);
        if (result.templateCreated) templatesCreated += 1;
        if (result.revisionPublished) revisionsPublished += 1;
      }
      this.registry = registry;
      return { generation: registry.generation, scopesCreated, scopesUpdated, templatesCreated, revisionsPublished };
    }

    public async reconcileOrphans(
      options: AuthorizationOrphanReconciliationOptions = {},
      additionalSources: readonly ScopeRegistrySource[] = configuredHookScopeSources()
    ): Promise<AuthorizationOrphanReconciliationResult> {
      const registry = this.buildRegistry(additionalSources);
      if (options.apply === true && options.expectedGeneration !== registry.generation) {
        throw new Error('Applying orphan reconciliation requires the exact reviewed registry generation.');
      }
      // Fail-closed apply gate: the orphan-marking transaction mutates
      // scope rows, so an unleased apply on a durable datastore rejects
      // before the first write. Preview (apply !== true) stays read-only and
      // leaseless. The effective lease threads into every apply transaction.
      const effectiveApplyLease =
        options.apply === true ? requireCatalogMutationLease('orphan apply', options.lease) : undefined;
      const effectiveOptions =
        options.apply === true && effectiveApplyLease !== undefined
          ? { ...options, lease: effectiveApplyLease }
          : options;
      const limit = boundedOrphanLimit(options.limit);
      // Fail-closed cursor: an afterKey must be a plausible scope key, never
      // an opaque blob that silently restarts the scan. Client-side filtering
      // below stays authoritative for adapters that ignore the predicate.
      if (effectiveOptions.afterKey !== undefined) {
        if (
          typeof effectiveOptions.afterKey !== 'string' ||
          effectiveOptions.afterKey.length === 0 ||
          effectiveOptions.afterKey.length > 256 ||
          !/^[a-z0-9]+(\.[a-z0-9]+)+$/.test(effectiveOptions.afterKey)
        ) {
          throw new Error('Orphan reconciliation cursor is invalid.');
        }
      }
      const unseenKeyCriteria: Record<string, unknown> = { nin: registry.all.map(definition => definition.key) };
      if (effectiveOptions.afterKey) unseenKeyCriteria['>'] = effectiveOptions.afterKey;
      const where: Record<string, unknown> = {
        status: ['active', 'deprecated'],
        key: unseenKeyCriteria,
      };
      const persisted = (await AuthorizationScope.find(where)
        .sort('key ASC')
        .limit(limit + 1)) as AuthorizationScopeAttributes[] | undefined;
      const raw = persisted ?? [];
      // Authoritative client-side resume: adapters that ignore the range
      // predicate return the head of the table on every page. A full raw page
      // with no post-cursor progress proves no progress and must abort
      // instead of looping forever or marking the scan complete.
      const filteredByCursor =
        effectiveOptions.afterKey === undefined
          ? [...raw]
          : raw.filter(scope => String(scope.key) > (effectiveOptions.afterKey as string));
      if (effectiveOptions.afterKey !== undefined && raw.length > limit && filteredByCursor.length === 0) {
        throw new Error('authorization.scan-unbounded: orphan scan made no progress on a full predicate-ignored page.');
      }
      // Require strictly increasing keys so a predicate-ignoring adapter or a
      // corrupted sort cannot emit duplicates/no-progress silently.
      for (let index = 1; index < filteredByCursor.length; index += 1) {
        if (String(filteredByCursor[index].key) <= String(filteredByCursor[index - 1].key)) {
          throw new Error('authorization.scan-unbounded: orphan scan keys are not strictly increasing.');
        }
      }
      const unseen = filteredByCursor.filter(scope => !registry.has(scope.key as RegisteredScopeDefinition['key']));
      const page = unseen.slice(0, limit);
      // Next cursor must strictly advance past afterKey; a repeated or
      // non-advancing cursor proves no progress and must not loop forever.
      let nextCursor: string | undefined;
      if (unseen.length > limit) {
        const candidate = page.at(-1)?.key;
        if (
          typeof candidate !== 'string' ||
          candidate.length === 0 ||
          (effectiveOptions.afterKey !== undefined && candidate <= effectiveOptions.afterKey)
        ) {
          throw new Error('authorization.scan-unbounded: orphan scan cursor did not advance.');
        }
        nextCursor = candidate;
      }
      const impacts: AuthorizationOrphanImpact[] = [];
      for (const scope of page) {
        const [overrideCount, templateRevisionCount] = await Promise.all([
          RoleScopeOverride.count({ scopeKey: scope.key }),
          RoleTemplateRevision.count({ scopeKeys: { contains: scope.key } }),
        ]);
        impacts.push({ key: scope.key, overrideCount, templateRevisionCount });
        if (effectiveOptions.apply === true) {
          const applyLease = effectiveApplyLease;
          await runWithRequiredTransaction(AuthorizationScope.getDatastore(), async connection => {
            // Mandatory lease fence for operator-driven orphan apply on
            // durable topologies: the entry gate above guarantees
            // `applyLease` is defined there, so the same session-bound
            // conditional owner+fence+unexpired write fence as catalog
            // reconciliation always runs before the orphan-marking write and
            // again immediately before commit. Pure unit-test doubles with no
            // holder anywhere keep the historical leaseless path.
            if (applyLease !== undefined) {
              await fenceLeaseInMutationSession(applyLease, connection, `catalog orphan '${scope.key}'`);
            } else if (isDurableMutationLeaseRequired()) {
              throw new Error(
                `Authorization catalog orphan apply for scope '${scope.key}' rejected: no lease held; acquire the migration lease first.`
              );
            }
            const current = await AuthorizationScope.findOne({ id: scope.id }).usingConnection(connection);
            if (
              current == null ||
              current.status === 'orphaned' ||
              registry.has(current.key as RegisteredScopeDefinition['key'])
            ) {
              return;
            }
            const updated = await AuthorizationScope.updateOne({
              id: current.id,
              metadataVersion: current.metadataVersion,
            })
              .set({ status: 'orphaned', metadataVersion: current.metadataVersion + 1 })
              .usingConnection(connection);
            if (updated == null)
              throw new Error(`Scope '${current.key}' changed concurrently during orphan reconciliation.`);
            await writeSuccessAudit(
              'scope.orphaned',
              'authorization-scope',
              current.id,
              { key: current.key, generation: registry.generation, overrideCount, templateRevisionCount },
              connection
            );
            // Commit-guarding fence: the orphan-marking write above must not
            // commit past a lease lost mid-transaction.
            if (applyLease !== undefined) {
              await fenceLeaseInMutationSession(applyLease, connection, `catalog orphan '${scope.key}' (pre-commit)`);
            } else if (isDurableMutationLeaseRequired()) {
              throw new Error(
                `Authorization catalog orphan apply for scope '${scope.key}' rejected: no lease held; acquire the migration lease first.`
              );
            }
          });
        }
      }
      return {
        generation: registry.generation,
        applied: effectiveOptions.apply === true,
        impacts: Object.freeze(impacts),
        ...(nextCursor ? { nextCursor } : {}),
      };
    }
  }
}

declare global {
  let AuthorizationScopeService: Services.AuthorizationScopeService;
}
