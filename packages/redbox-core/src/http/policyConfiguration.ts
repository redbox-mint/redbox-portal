import type { ApiRouteDefinition } from '../api-routes/types';
import type { PoliciesConfig, PolicyChain } from '../config/policies.config';

function normalizeTarget(target: string): string {
  return target.replace(/Controller(?=\/|$)/g, '').toLowerCase();
}
function chain(value: PolicyChain): readonly (string | false)[] {
  if (value === true) return [];
  if (value === false) return [false];
  const result = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(result) || result.some(name => typeof name !== 'string' || !name.trim()))
    throw new TypeError('Policies must be boolean or an ordered list of names.');
  return result.map(name => name.toLowerCase());
}

/** Sails route policies precede the most specific action/controller/global mapping. */
export function resolveEffectivePolicies(
  route: Pick<ApiRouteDefinition, 'controller' | 'action' | 'policy'>,
  configuration: PoliciesConfig
): readonly (string | false)[] {
  const mappings = new Map<string, PolicyChain>();
  const add = (target: string, value: PolicyChain | undefined) => {
    if (value === undefined) return;
    const key = normalizeTarget(target);
    if (mappings.has(key)) throw new TypeError('Duplicate normalized policy target.');
    chain(value); // Validate even mappings not selected for this route.
    mappings.set(key, value);
  };
  for (const [target, value] of Object.entries(configuration)) {
    if (value && typeof value === 'object' && !Array.isArray(value))
      for (const [action, actionPolicies] of Object.entries(value)) add(target + '/' + action, actionPolicies);
    else
      add(
        normalizeTarget(target) === normalizeTarget(route.controller) ? target + '/*' : target,
        value as PolicyChain | undefined
      );
  }
  const target = normalizeTarget(route.controller + '/' + route.action);
  const keys = [...mappings.keys()].filter(
    key => key === '*' || key === target || (key.endsWith('/*') && target.startsWith(key.slice(0, -1)))
  );
  keys.sort((a, b) => b.length - a.length);
  return [...(route.policy === undefined ? [] : chain(route.policy)), ...chain(mappings.get(keys[0]) ?? false)];
}

export const pilotPolicyChain = [
  'noCache',
  'brandingAndPortal',
  'isWebServiceAuthenticated',
  'brandActor',
  'checkAuth',
] as const;
