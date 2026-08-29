import {
  RoleEffectiveScopeInput,
  RoleEffectiveScopeResult,
  RoleScopeNormalizationInput,
  RoleScopeOverride,
  RoleTemplateUpgradePreview,
  ScopeKey,
} from './types';
import { compareScopeKeys } from './validators';

function uniqueSortedScopeKeys(scopeKeys: readonly ScopeKey[]): ScopeKey[] {
  return [...new Set(scopeKeys)].sort(compareScopeKeys);
}

function freezeScopeOverrides(overrides: readonly RoleScopeOverride[]): readonly RoleScopeOverride[] {
  return Object.freeze(overrides.map(override => Object.freeze({ ...override })));
}

function partitionEffectiveScopeKeys(
  scopeKeys: readonly ScopeKey[],
  input: RoleEffectiveScopeInput
): RoleEffectiveScopeResult {
  if (!input.registry) {
    return {
      effectiveScopeKeys: Object.freeze(uniqueSortedScopeKeys(scopeKeys)),
      inactiveScopeKeys: Object.freeze([]),
      missingScopeKeys: Object.freeze([]),
    };
  }

  const effectiveScopeKeys: ScopeKey[] = [];
  const inactiveScopeKeys: ScopeKey[] = [];
  const missingScopeKeys: ScopeKey[] = [];

  for (const scopeKey of uniqueSortedScopeKeys(scopeKeys)) {
    if (!input.registry.has(scopeKey)) {
      missingScopeKeys.push(scopeKey);
      continue;
    }

    if (!input.registry.isActive(scopeKey)) {
      inactiveScopeKeys.push(scopeKey);
      continue;
    }

    effectiveScopeKeys.push(scopeKey);
  }

  return {
    effectiveScopeKeys: Object.freeze(effectiveScopeKeys),
    inactiveScopeKeys: Object.freeze(inactiveScopeKeys),
    missingScopeKeys: Object.freeze(missingScopeKeys),
  };
}

export function getRoleEffectiveScopes(input: RoleEffectiveScopeInput): RoleEffectiveScopeResult {
  const effectiveScopeKeySet = new Set<ScopeKey>(input.baseScopeKeys ?? []);
  const removeScopeKeys = new Set<ScopeKey>();
  const addScopeKeys = new Set<ScopeKey>();

  for (const override of input.overrides ?? []) {
    if (override.effect === 'remove') {
      removeScopeKeys.add(override.scopeKey);
    } else {
      addScopeKeys.add(override.scopeKey);
    }
  }

  for (const scopeKey of removeScopeKeys) {
    effectiveScopeKeySet.delete(scopeKey);
  }
  for (const scopeKey of addScopeKeys) {
    effectiveScopeKeySet.add(scopeKey);
  }

  return partitionEffectiveScopeKeys([...effectiveScopeKeySet], input);
}

export function normalizeRoleScopeOverrides(input: RoleScopeNormalizationInput): readonly RoleScopeOverride[] {
  const baseScopeKeys = uniqueSortedScopeKeys(input.baseScopeKeys);
  const desiredScopeKeys = uniqueSortedScopeKeys(input.desiredScopeKeys);
  const desiredScopeSet = new Set<ScopeKey>(desiredScopeKeys);
  const baseScopeSet = new Set<ScopeKey>(baseScopeKeys);
  const overrides: RoleScopeOverride[] = [];

  for (const scopeKey of baseScopeKeys) {
    if (!desiredScopeSet.has(scopeKey)) {
      overrides.push({ scopeKey, effect: 'remove' });
    }
  }

  for (const scopeKey of desiredScopeKeys) {
    if (!baseScopeSet.has(scopeKey)) {
      overrides.push({ scopeKey, effect: 'add' });
    }
  }

  return freezeScopeOverrides(overrides);
}

export function previewRoleTemplateUpgrade(params: {
  currentBaseScopeKeys: readonly ScopeKey[];
  nextBaseScopeKeys: readonly ScopeKey[];
  overrides?: readonly RoleScopeOverride[];
  registry?: RoleEffectiveScopeInput['registry'];
}): RoleTemplateUpgradePreview {
  const currentResult = getRoleEffectiveScopes({
    baseScopeKeys: params.currentBaseScopeKeys,
    overrides: params.overrides,
    registry: params.registry,
  });
  const nextResult = getRoleEffectiveScopes({
    baseScopeKeys: params.nextBaseScopeKeys,
    overrides: params.overrides,
    registry: params.registry,
  });
  const nextConfiguredResult = getRoleEffectiveScopes({
    baseScopeKeys: params.nextBaseScopeKeys,
    overrides: params.overrides,
  });
  const currentEffectiveScopeSet = new Set(currentResult.effectiveScopeKeys);
  const nextEffectiveScopeSet = new Set(nextResult.effectiveScopeKeys);

  const addedScopeKeys = nextResult.effectiveScopeKeys.filter(scopeKey => !currentEffectiveScopeSet.has(scopeKey));
  const removedScopeKeys = currentResult.effectiveScopeKeys.filter(scopeKey => !nextEffectiveScopeSet.has(scopeKey));

  return {
    currentEffectiveScopeKeys: currentResult.effectiveScopeKeys,
    nextEffectiveScopeKeys: nextResult.effectiveScopeKeys,
    addedScopeKeys: Object.freeze(addedScopeKeys),
    removedScopeKeys: Object.freeze(removedScopeKeys),
    nextOverrides: normalizeRoleScopeOverrides({
      baseScopeKeys: params.nextBaseScopeKeys,
      desiredScopeKeys: nextConfiguredResult.effectiveScopeKeys,
    }),
    inactiveScopeKeys: nextResult.inactiveScopeKeys,
    missingScopeKeys: nextResult.missingScopeKeys,
  };
}
