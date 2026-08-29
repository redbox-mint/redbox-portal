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

const ACTOR_ID = 'authorization-catalog-bootstrap';
export const AUTHORIZATION_ORPHAN_PAGE_SIZE = 100;
export const AUTHORIZATION_CATALOG_DEFAULT_PAGE_SIZE = 50;
export const AUTHORIZATION_CATALOG_MAX_PAGE_SIZE = 100;

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
  generation: string
): Promise<'created' | 'updated' | 'unchanged'> {
  // Steady state is "every declared scope already matches", so an unsynchronised read
  // short-circuits the common path rather than opening one transaction per scope on
  // every lift. The authoritative re-read below still runs inside the transaction.
  const preview = await AuthorizationScope.findOne({ key: definition.key });
  if (preview != null && !scopeMetadataChanged(preview, scopeProjection(definition, generation))) {
    return 'unchanged';
  }
  return runWithRequiredTransaction(AuthorizationScope.getDatastore(), async connection => {
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
    const updated = await AuthorizationScope.updateOne({ id: current.id })
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
    return 'updated';
  });
}

async function reconcileTemplate(
  definition: DefaultRoleTemplateDefinition
): Promise<{ readonly templateCreated: boolean; readonly revisionPublished: boolean }> {
  return runWithRequiredTransaction(RoleTemplate.getDatastore(), async connection => {
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
      const advanced = await RoleTemplate.updateOne({ id: template.id, currentRevision: template.currentRevision })
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
    return { templateCreated, revisionPublished };
  });
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
      additionalSources: readonly ScopeRegistrySource[] = configuredHookScopeSources()
    ): Promise<AuthorizationCatalogReconciliationResult> {
      return this.reconcileDeclaredCatalog(additionalSources);
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
      additionalSources: readonly ScopeRegistrySource[] = configuredHookScopeSources()
    ): Promise<AuthorizationCatalogReconciliationResult> {
      const registry = this.buildRegistry(additionalSources);
      let scopesCreated = 0;
      let scopesUpdated = 0;
      for (const definition of registry.all) {
        const result = await reconcileScope(definition, registry.generation);
        if (result === 'created') scopesCreated += 1;
        if (result === 'updated') scopesUpdated += 1;
      }
      let templatesCreated = 0;
      let revisionsPublished = 0;
      for (const definition of DEFAULT_ROLE_TEMPLATES) {
        const result = await reconcileTemplate(definition);
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
      const limit = boundedOrphanLimit(options.limit);
      const unseenKeyCriteria: Record<string, unknown> = { nin: registry.all.map(definition => definition.key) };
      if (options.afterKey) unseenKeyCriteria['>'] = options.afterKey;
      const where: Record<string, unknown> = {
        status: ['active', 'deprecated'],
        key: unseenKeyCriteria,
      };
      const persisted = (await AuthorizationScope.find(where)
        .sort('key ASC')
        .limit(limit + 1)) as AuthorizationScopeAttributes[] | undefined;
      const unseen = (persisted ?? []).filter(scope => !registry.has(scope.key as RegisteredScopeDefinition['key']));
      const page = unseen.slice(0, limit);
      const impacts: AuthorizationOrphanImpact[] = [];
      for (const scope of page) {
        const [overrideCount, templateRevisionCount] = await Promise.all([
          RoleScopeOverride.count({ scopeKey: scope.key }),
          RoleTemplateRevision.count({ scopeKeys: { contains: scope.key } }),
        ]);
        impacts.push({ key: scope.key, overrideCount, templateRevisionCount });
        if (options.apply === true) {
          await runWithRequiredTransaction(AuthorizationScope.getDatastore(), async connection => {
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
          });
        }
      }
      const nextCursor = unseen.length > limit ? page.at(-1)?.key : undefined;
      return {
        generation: registry.generation,
        applied: options.apply === true,
        impacts: Object.freeze(impacts),
        ...(nextCursor ? { nextCursor } : {}),
      };
    }
  }
}

declare global {
  let AuthorizationScopeService: Services.AuthorizationScopeService;
}
