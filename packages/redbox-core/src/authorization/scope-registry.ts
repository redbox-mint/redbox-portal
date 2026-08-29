import { createHash } from 'crypto';
import { AuthorizationValidationError } from './errors';
import {
  AUTHORIZATION_SCOPE_RISKS,
  AUTHORIZATION_SCOPE_SOURCE_TYPES,
  type AuthorizationScopeDefinition,
  type AuthorizationScopeRisk,
  type AuthorizationScopeSourceType,
  type RegisteredScopeDefinition,
  type ScopeKey,
  type ScopeKeyValidationSummary,
  type ScopeRegistrySource,
} from './types';
import {
  asScopeKey,
  compareScopeKeys,
  deriveHookScopeNamespace,
  getScopeNamespace,
  isReservedCoreScopeNamespace,
} from './validators';

export interface ScopeRegistry {
  readonly all: readonly RegisteredScopeDefinition[];
  readonly generation: string;
  get(scopeKey: ScopeKey): RegisteredScopeDefinition | undefined;
  has(scopeKey: ScopeKey): boolean;
  isActive(scopeKey: ScopeKey): boolean;
  list(options?: { namespace?: string; includeDeprecated?: boolean }): readonly RegisteredScopeDefinition[];
  validateScopeKeys(scopeKeys: readonly ScopeKey[]): ScopeKeyValidationSummary;
}

function uniqueSortedScopeKeys(scopeKeys: readonly ScopeKey[]): ScopeKey[] {
  return [...new Set(scopeKeys)].sort(compareScopeKeys);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AuthorizationValidationError(
      'scope-definition-invalid',
      `Authorization scope ${field} must be a non-empty string.`
    );
  }
  return value.trim();
}

function isScopeRisk(value: unknown): value is AuthorizationScopeRisk {
  return AUTHORIZATION_SCOPE_RISKS.some(candidate => candidate === value);
}

function isScopeSourceType(value: unknown): value is AuthorizationScopeSourceType {
  return AUTHORIZATION_SCOPE_SOURCE_TYPES.some(candidate => candidate === value);
}

function parseScopeDefinition(value: unknown): AuthorizationScopeDefinition {
  if (!isRecord(value)) {
    throw new AuthorizationValidationError(
      'scope-definition-invalid',
      'Authorization scope definition must be an object.'
    );
  }
  if (typeof value.key !== 'string') {
    throw new AuthorizationValidationError('scope-key-invalid', 'Authorization scope key must be a string.');
  }
  if (!isScopeRisk(value.risk)) {
    throw new AuthorizationValidationError(
      'scope-definition-invalid',
      `Authorization scope "${value.key}" declares an invalid risk.`
    );
  }
  if (value.deprecated !== undefined && typeof value.deprecated !== 'boolean') {
    throw new AuthorizationValidationError(
      'scope-definition-invalid',
      `Authorization scope "${value.key}" must declare deprecated as a boolean.`
    );
  }
  if (value.replacementKey !== undefined && typeof value.replacementKey !== 'string') {
    throw new AuthorizationValidationError(
      'scope-definition-invalid',
      `Authorization scope "${value.key}" replacementKey must be a string.`
    );
  }

  return {
    key: asScopeKey(value.key),
    label: requiredString(value.label, 'label'),
    description: requiredString(value.description, 'description'),
    risk: value.risk,
    ...(value.deprecated === undefined ? {} : { deprecated: value.deprecated }),
    ...(value.replacementKey === undefined ? {} : { replacementKey: asScopeKey(value.replacementKey) }),
  };
}

function parseScopeSource(value: unknown): ScopeRegistrySource {
  if (!isRecord(value)) {
    throw new AuthorizationValidationError('scope-definition-invalid', 'Authorization scope source must be an object.');
  }
  if (!isScopeSourceType(value.sourceType)) {
    throw new AuthorizationValidationError('scope-definition-invalid', 'Authorization scope source type is invalid.');
  }
  if (!Array.isArray(value.definitions)) {
    throw new AuthorizationValidationError(
      'scope-definition-invalid',
      'Authorization scope source definitions must be an array.'
    );
  }

  return {
    sourceType: value.sourceType,
    sourcePackage: requiredString(value.sourcePackage, 'source package'),
    sourceVersion: requiredString(value.sourceVersion, 'source version'),
    definitions: Object.freeze(value.definitions.map(parseScopeDefinition)),
  };
}

function freezeScopeDefinition(definition: RegisteredScopeDefinition): RegisteredScopeDefinition {
  return Object.freeze({ ...definition });
}

function definitionSignature(definition: RegisteredScopeDefinition): string {
  return JSON.stringify({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    risk: definition.risk,
    status: definition.status,
    replacementKey: definition.replacementKey ?? null,
    namespace: definition.namespace,
    sourceType: definition.sourceType,
    sourcePackage: definition.sourcePackage,
    sourceVersion: definition.sourceVersion,
  });
}

function assertHookNamespaceOwnership(definition: RegisteredScopeDefinition): void {
  if (definition.sourceType !== 'hook') {
    return;
  }

  if (isReservedCoreScopeNamespace(definition.namespace)) {
    throw new AuthorizationValidationError(
      'scope-namespace-reserved',
      `Hook package "${definition.sourcePackage}" cannot declare reserved core namespace "${definition.namespace}".`
    );
  }

  const ownedNamespace = deriveHookScopeNamespace(definition.sourcePackage);
  if (!ownedNamespace) {
    throw new AuthorizationValidationError(
      'hook-package-invalid',
      `Hook package "${definition.sourcePackage}" does not expose a derivable authorization namespace.`
    );
  }

  if (definition.namespace !== ownedNamespace) {
    throw new AuthorizationValidationError(
      'scope-namespace-unauthorized',
      `Hook package "${definition.sourcePackage}" may only declare scopes in namespace "${ownedNamespace}", not "${definition.namespace}".`
    );
  }
}

function assertValidReplacementTargets(
  definitions: readonly RegisteredScopeDefinition[],
  registry: ReadonlyMap<ScopeKey, RegisteredScopeDefinition>
): void {
  const activeVisiting = new Set<ScopeKey>();
  const activeVisited = new Set<ScopeKey>();

  const visit = (scopeKey: ScopeKey): void => {
    if (activeVisited.has(scopeKey)) {
      return;
    }

    if (activeVisiting.has(scopeKey)) {
      throw new AuthorizationValidationError(
        'scope-replacement-cycle',
        `Scope replacement cycle detected at "${scopeKey}".`
      );
    }

    activeVisiting.add(scopeKey);
    const definition = registry.get(scopeKey);
    const replacementKey = definition?.replacementKey;

    if (replacementKey) {
      visit(replacementKey);
    }

    activeVisiting.delete(scopeKey);
    activeVisited.add(scopeKey);
  };

  for (const definition of definitions) {
    if (definition.replacementKey && definition.status !== 'deprecated') {
      throw new AuthorizationValidationError(
        'scope-replacement-without-deprecation',
        `Only deprecated scopes may declare a replacement, but "${definition.key}" is active.`
      );
    }

    if (!definition.replacementKey) {
      continue;
    }

    if (definition.replacementKey === definition.key) {
      throw new AuthorizationValidationError(
        'scope-replacement-self',
        `Deprecated scope "${definition.key}" cannot replace itself.`
      );
    }

    const replacement = registry.get(definition.replacementKey);
    if (!replacement) {
      throw new AuthorizationValidationError(
        'scope-replacement-missing',
        `Deprecated scope "${definition.key}" references missing replacement "${definition.replacementKey}".`
      );
    }

    if (replacement.status !== 'active') {
      throw new AuthorizationValidationError(
        'scope-replacement-not-active',
        `Deprecated scope "${definition.key}" must point to an active replacement, but "${replacement.key}" is ${replacement.status}.`
      );
    }

    visit(definition.key);
  }
}

function buildGeneration(definitions: readonly RegisteredScopeDefinition[]): string {
  const payload = definitions.map(definition => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    risk: definition.risk,
    status: definition.status,
    replacementKey: definition.replacementKey ?? null,
    namespace: definition.namespace,
    sourceType: definition.sourceType,
    sourcePackage: definition.sourcePackage,
    sourceVersion: definition.sourceVersion,
  }));

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function createScopeRegistry(sources: readonly unknown[]): ScopeRegistry {
  const registry = new Map<ScopeKey, RegisteredScopeDefinition>();

  for (const sourceValue of sources) {
    const source = parseScopeSource(sourceValue);
    for (const definition of source.definitions) {
      const registeredDefinition = freezeScopeDefinition({
        ...definition,
        namespace: getScopeNamespace(definition.key),
        sourceType: source.sourceType,
        sourcePackage: source.sourcePackage,
        sourceVersion: source.sourceVersion,
        status: definition.deprecated ? 'deprecated' : 'active',
      });

      assertHookNamespaceOwnership(registeredDefinition);

      const existing = registry.get(registeredDefinition.key);
      if (!existing) {
        registry.set(registeredDefinition.key, registeredDefinition);
        continue;
      }

      const existingSignature = definitionSignature(existing);
      const incomingSignature = definitionSignature(registeredDefinition);

      if (existingSignature === incomingSignature) {
        throw new AuthorizationValidationError(
          'scope-definition-duplicate',
          `Duplicate scope definition for "${registeredDefinition.key}" from "${registeredDefinition.sourcePackage}".`
        );
      }

      throw new AuthorizationValidationError(
        'scope-definition-conflict',
        `Conflicting scope definitions were declared for "${registeredDefinition.key}".`
      );
    }
  }

  const orderedDefinitions = [...registry.values()].sort((left, right) => compareScopeKeys(left.key, right.key));

  assertValidReplacementTargets(orderedDefinitions, registry);

  const all = Object.freeze([...orderedDefinitions]);
  const generation = buildGeneration(all);

  return {
    all,
    generation,
    get(scopeKey) {
      return registry.get(scopeKey);
    },
    has(scopeKey) {
      return registry.has(scopeKey);
    },
    isActive(scopeKey) {
      return registry.get(scopeKey)?.status === 'active';
    },
    list(options) {
      const includeDeprecated = options?.includeDeprecated ?? false;
      const namespace = options?.namespace;

      return all.filter(definition => {
        if (namespace && definition.namespace !== namespace) {
          return false;
        }

        if (!includeDeprecated && definition.status !== 'active') {
          return false;
        }

        return true;
      });
    },
    validateScopeKeys(scopeKeys) {
      const activeScopeKeys: ScopeKey[] = [];
      const inactiveScopeKeys: ScopeKey[] = [];
      const missingScopeKeys: ScopeKey[] = [];

      for (const scopeKey of uniqueSortedScopeKeys(scopeKeys)) {
        const definition = registry.get(scopeKey);
        if (!definition) {
          missingScopeKeys.push(scopeKey);
          continue;
        }

        if (definition.status !== 'active') {
          inactiveScopeKeys.push(scopeKey);
          continue;
        }

        activeScopeKeys.push(scopeKey);
      }

      return {
        activeScopeKeys: Object.freeze(activeScopeKeys),
        inactiveScopeKeys: Object.freeze(inactiveScopeKeys),
        missingScopeKeys: Object.freeze(missingScopeKeys),
      };
    },
  };
}
