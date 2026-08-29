import { Services as services } from '../CoreService';
import { validateRoleAssignmentPersistenceContext } from '../authorization';
import { AuthorizationTransactionUnavailableError } from '../utilities/RequiredTransactionUtils';
import type { RoleAssignmentAttributes, RoleAssignmentCreateRecord } from '../waterline-models/RoleAssignment';

type AuthorizationIndexDirection = 1 | -1;

export interface AuthorizationRuntimeIndex {
  readonly key: Readonly<Record<string, AuthorizationIndexDirection>>;
  readonly name: string;
  readonly partialFilterExpression?: Readonly<Record<string, unknown>>;
  readonly sparse?: true;
  readonly unique?: true;
}

export interface ExistingAuthorizationIndex {
  readonly key: Readonly<Record<string, unknown>>;
  readonly name?: string;
  readonly partialFilterExpression?: Readonly<Record<string, unknown>>;
  readonly sparse?: boolean;
  readonly unique?: boolean;
}

interface AuthorizationIndexCollection {
  createIndexes(indexes: readonly AuthorizationRuntimeIndex[]): Promise<readonly string[]>;
  indexes(): Promise<readonly ExistingAuthorizationIndex[]>;
}

interface AuthorizationMongoManager {
  collection(name: string): AuthorizationIndexCollection;
}

export interface AuthorizationIndexModel {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly schema?: Readonly<Record<string, unknown>>;
  readonly tableName: string;
  getDatastore(): { readonly manager: unknown };
}

export type AuthorizationIndexModelResolver = (identity: string) => AuthorizationIndexModel | undefined;

export interface AuthorizationPersistenceModelIndexes {
  readonly modelIdentity: string;
  readonly indexes: readonly AuthorizationRuntimeIndex[];
}

const roleIndexes = [
  { key: { identityKey: 1 }, name: 'role_identity_key_unique', sparse: true, unique: true },
  {
    key: { branding: 1, key: 1 },
    name: 'role_brand_key_lookup',
    partialFilterExpression: { key: { $type: 'string' } },
  },
  {
    key: { branding: 1, status: 1, displayName: 1 },
    name: 'role_brand_status_display_name_lookup',
    partialFilterExpression: { displayName: { $type: 'string' }, status: { $type: 'string' } },
  },
  {
    key: { template: 1, templateRevision: 1 },
    name: 'role_template_revision_lookup',
    partialFilterExpression: { template: { $exists: true }, templateRevision: { $exists: true } },
  },
] as const satisfies readonly AuthorizationRuntimeIndex[];

/**
 * Required native Mongo indexes for the Phase 2 authorization persistence models.
 *
 * `indexes` metadata on Waterline model definitions is intentionally not relied on:
 * sails-mongo 2.x does not materialise it. These named definitions are applied by
 * {@link AuthorizationPersistenceService.init} after the ORM has loaded and before
 * migrations/core bootstrap execute.
 */
export const AUTHORIZATION_PERSISTENCE_MODEL_INDEXES = Object.freeze([
  { modelIdentity: 'role', indexes: roleIndexes },
  {
    modelIdentity: 'authorizationscope',
    indexes: [
      { key: { key: 1 }, name: 'authorization_scope_key_unique', unique: true },
      {
        key: { namespace: 1, status: 1, key: 1 },
        name: 'authorization_scope_namespace_status_key_lookup',
      },
      { key: { sourcePackage: 1, status: 1 }, name: 'authorization_scope_source_status_lookup' },
    ],
  },
  {
    modelIdentity: 'roletemplate',
    indexes: [
      { key: { key: 1 }, name: 'role_template_key_unique', unique: true },
      { key: { status: 1, displayName: 1 }, name: 'role_template_status_display_name_lookup' },
    ],
  },
  {
    modelIdentity: 'roletemplaterevision',
    indexes: [
      { key: { template: 1, revision: 1 }, name: 'role_template_revision_unique', unique: true },
      { key: { template: 1, publishedAt: -1 }, name: 'role_template_published_at_lookup' },
    ],
  },
  {
    modelIdentity: 'rolescopeoverride',
    indexes: [
      { key: { role: 1, scopeKey: 1 }, name: 'role_scope_override_unique', unique: true },
      { key: { scopeKey: 1, effect: 1 }, name: 'role_scope_override_scope_effect_lookup' },
    ],
  },
  {
    modelIdentity: 'roleassignment',
    indexes: [
      {
        key: { principalType: 1, principalId: 1, role: 1, source: 1, sourceKey: 1 },
        name: 'role_assignment_source_tuple_unique',
        unique: true,
      },
      {
        key: { principalType: 1, principalId: 1, status: 1, expiresAt: 1 },
        name: 'role_assignment_principal_status_expiry_lookup',
      },
      { key: { branding: 1, role: 1, status: 1 }, name: 'role_assignment_brand_role_status_lookup' },
      { key: { role: 1, status: 1 }, name: 'role_assignment_role_status_lookup' },
      {
        key: { source: 1, sourceKey: 1, status: 1, sourcePresent: 1 },
        name: 'role_assignment_source_presence_lookup',
      },
      // `expiresAt` is nullable so the recovery path can clear it, which means the
      // attribute is always present and a `$exists` partial filter would select every
      // row. The design specifies a plain expiry index here.
      { key: { expiresAt: 1, status: 1 }, name: 'role_assignment_expiry_status_lookup' },
    ],
  },
  {
    modelIdentity: 'authorizationaudit',
    indexes: [
      { key: { eventId: 1 }, name: 'authorization_audit_event_id_unique', unique: true },
      { key: { occurredAt: -1, eventId: -1 }, name: 'authorization_audit_page_lookup' },
      { key: { brandId: 1, occurredAt: -1, eventId: -1 }, name: 'authorization_audit_brand_page_lookup' },
      { key: { actorId: 1, occurredAt: -1, eventId: -1 }, name: 'authorization_audit_actor_page_lookup' },
      {
        key: { targetType: 1, targetId: 1, occurredAt: -1, eventId: -1 },
        name: 'authorization_audit_target_page_lookup',
      },
      {
        key: { eventType: 1, outcome: 1, occurredAt: -1, eventId: -1 },
        name: 'authorization_audit_event_outcome_page_lookup',
      },
    ],
  },
  {
    modelIdentity: 'authorizationshadowmismatch',
    indexes: [
      { key: { fingerprint: 1 }, name: 'authorization_shadow_fingerprint_unique', unique: true },
      { key: { resolvedAt: 1, lastSeenAt: -1 }, name: 'authorization_shadow_resolution_lookup' },
      { key: { brandId: 1, lastSeenAt: -1 }, name: 'authorization_shadow_brand_lookup' },
    ],
  },
] as const satisfies readonly AuthorizationPersistenceModelIndexes[]);

function normalizeIndexValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeIndexValue);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeIndexValue(entry)])
    );
  }
  return value;
}

function indexKeysEqual(existing: ExistingAuthorizationIndex, required: AuthorizationRuntimeIndex): boolean {
  const existingEntries = Object.entries(existing.key);
  const requiredEntries = Object.entries(required.key);
  return (
    existingEntries.length === requiredEntries.length &&
    existingEntries.every(
      ([key, direction], index) => key === requiredEntries[index]?.[0] && direction === requiredEntries[index]?.[1]
    )
  );
}

function indexOptionsEqual(existing: ExistingAuthorizationIndex, required: AuthorizationRuntimeIndex): boolean {
  return (
    (existing.unique === true) === (required.unique === true) &&
    (existing.sparse === true) === (required.sparse === true) &&
    JSON.stringify(normalizeIndexValue(existing.partialFilterExpression)) ===
      JSON.stringify(normalizeIndexValue(required.partialFilterExpression))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function physicalColumnName(model: AuthorizationIndexModel, attributeName: string): string {
  const definition = model.attributes?.[attributeName] ?? model.schema?.[attributeName];
  if (!isRecord(definition)) {
    return attributeName;
  }
  return typeof definition.columnName === 'string' && definition.columnName.length > 0
    ? definition.columnName
    : attributeName;
}

function physicalIndex(model: AuthorizationIndexModel, index: AuthorizationRuntimeIndex): AuthorizationRuntimeIndex {
  const key = Object.fromEntries(
    Object.entries(index.key).map(([attributeName, direction]) => [physicalColumnName(model, attributeName), direction])
  );
  const partialFilterExpression =
    index.partialFilterExpression === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(index.partialFilterExpression).map(([attributeName, condition]) => [
            physicalColumnName(model, attributeName),
            condition,
          ])
        );
  return {
    key,
    name: index.name,
    ...(partialFilterExpression === undefined ? {} : { partialFilterExpression }),
    ...(index.sparse === undefined ? {} : { sparse: index.sparse }),
    ...(index.unique === undefined ? {} : { unique: index.unique }),
  };
}

function isNamespaceNotFound(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  return error.code === 26 || error.codeName === 'NamespaceNotFound';
}

function resolveLoadedModel(identity: string): AuthorizationIndexModel | undefined {
  const model = sails.models[identity];
  if (!isRecord(model) || typeof model.tableName !== 'string' || typeof model.getDatastore !== 'function') {
    return undefined;
  }
  const rawAttributes: unknown = model.attributes;
  const rawSchema: unknown = model.schema;
  return {
    attributes: isRecord(rawAttributes) ? rawAttributes : undefined,
    schema: isRecord(rawSchema) ? rawSchema : undefined,
    tableName: model.tableName,
    getDatastore() {
      const datastore = Reflect.apply(model.getDatastore, model, []);
      if (!isRecord(datastore)) {
        throw new Error(`Authorization persistence model '${identity}' returned an invalid datastore.`);
      }
      return { manager: datastore.manager };
    },
  };
}

function isAuthorizationMongoManager(value: unknown): value is AuthorizationMongoManager {
  return isRecord(value) && typeof value.collection === 'function';
}

async function ensureModelIndexes(
  definition: AuthorizationPersistenceModelIndexes,
  resolveModel: AuthorizationIndexModelResolver
): Promise<void> {
  const model = resolveModel(definition.modelIdentity);
  if (model === undefined) {
    throw new Error(`Authorization persistence model '${definition.modelIdentity}' is not loaded.`);
  }
  const manager = model.getDatastore().manager;
  if (!isAuthorizationMongoManager(manager)) {
    throw new Error(`Authorization persistence model '${definition.modelIdentity}' does not use a Mongo datastore.`);
  }
  const collection = manager.collection(model.tableName);
  if (typeof collection?.indexes !== 'function' || typeof collection.createIndexes !== 'function') {
    throw new Error(`Authorization persistence collection '${model.tableName}' cannot ensure Mongo indexes.`);
  }

  let existingIndexes: readonly ExistingAuthorizationIndex[];
  try {
    existingIndexes = await collection.indexes();
  } catch (error) {
    if (!isNamespaceNotFound(error)) {
      throw error;
    }
    existingIndexes = [];
  }

  const missingIndexes: AuthorizationRuntimeIndex[] = [];
  for (const logicalIndex of definition.indexes) {
    const required = physicalIndex(model, logicalIndex);
    const matchingKeys = existingIndexes.filter(existing => indexKeysEqual(existing, required));
    if (matchingKeys.some(existing => indexOptionsEqual(existing, required))) {
      continue;
    }
    if (matchingKeys.length > 0) {
      throw new Error(
        `Existing Mongo index '${matchingKeys[0].name ?? '<unnamed>'}' conflicts with required index '${required.name}' ` +
          `(unique=${required.unique === true}, sparse=${required.sparse === true}, partial=${required.partialFilterExpression !== undefined}).`
      );
    }
    const matchingName = existingIndexes.find(existing => existing.name === required.name);
    if (matchingName !== undefined) {
      throw new Error(`Existing Mongo index '${required.name}' has different keys from the required definition.`);
    }
    missingIndexes.push(required);
  }

  if (missingIndexes.length > 0) {
    await collection.createIndexes(missingIndexes);
  }
}

export async function ensureAuthorizationPersistenceIndexes(
  resolveModel: AuthorizationIndexModelResolver = resolveLoadedModel
): Promise<void> {
  for (const definition of AUTHORIZATION_PERSISTENCE_MODEL_INDEXES) {
    await ensureModelIndexes(definition, resolveModel);
  }
}

export namespace Services {
  export class AuthorizationPersistenceService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['createRoleAssignment', 'init'];

    private initializationPromise: Promise<void> | undefined;

    public override init(): Promise<void> {
      this.initializationPromise ??= ensureAuthorizationPersistenceIndexes().catch(error => {
        this.initializationPromise = undefined;
        throw error;
      });
      return this.initializationPromise;
    }

    public async createRoleAssignment(
      input: RoleAssignmentCreateRecord,
      connection: Sails.Connection | null | undefined
    ): Promise<RoleAssignmentAttributes> {
      if (connection == null) {
        throw new AuthorizationTransactionUnavailableError(
          'RoleAssignment creation requires the caller transaction connection.'
        );
      }
      const role = await Role.findOne({ id: input.role }).usingConnection(connection);
      if (role == null) {
        throw new Error('RoleAssignment.role was not found.');
      }
      validateRoleAssignmentPersistenceContext(input, role);
      return RoleAssignment.create({ ...input })
        .fetch()
        .usingConnection(connection);
    }
  }
}

declare global {
  let AuthorizationPersistenceService: Services.AuthorizationPersistenceService;
}
