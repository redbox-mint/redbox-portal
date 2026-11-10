import type { ContractNode } from './types';

export function hasWriteOnlyFields(node: ContractNode): boolean {
  if (node.annotations?.writeOnly) return true;
  if (node.kind === 'object') return Object.values(node.properties).some(hasWriteOnlyFields);
  if (node.kind === 'array') return hasWriteOnlyFields(node.items);
  if (node.kind === 'conditional')
    return hasWriteOnlyFields(node.thenNode) || !!(node.elseNode && hasWriteOnlyFields(node.elseNode));
  return false;
}
