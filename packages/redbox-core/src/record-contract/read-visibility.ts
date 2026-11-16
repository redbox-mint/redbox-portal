import type { ContractNode } from './types';

export function hasWriteOnlyFields(node: ContractNode): boolean {
  if (node.annotations?.writeOnly) return true;
  if (node.kind === 'object') return Object.values(node.properties).some(hasWriteOnlyFields);
  if (node.kind === 'array') return hasWriteOnlyFields(node.items);
  if (node.kind === 'conditional')
    return hasWriteOnlyFields(node.thenNode) || !!(node.elseNode && hasWriteOnlyFields(node.elseNode));
  return false;
}

/** Read contracts describe the union of stored shapes across UI variants. */
export function mergeReadNodes(left: ContractNode, right: ContractNode): ContractNode {
  if (left.annotations?.writeOnly || right.annotations?.writeOnly)
    return { ...left, annotations: { ...left.annotations, writeOnly: true } };
  if (left.kind === 'conditional') {
    return mergeReadNodes(left.elseNode ? mergeReadNodes(left.thenNode, left.elseNode) : left.thenNode, right);
  }
  if (right.kind === 'conditional') {
    return mergeReadNodes(left, right.elseNode ? mergeReadNodes(right.thenNode, right.elseNode) : right.thenNode);
  }
  const nullable = left.nullable || right.nullable;
  if (left.kind === 'object' && right.kind === 'object') {
    return {
      kind: 'object',
      nullable,
      annotations: left.annotations ?? right.annotations,
      unknownProperties:
        left.unknownProperties === 'allow' || right.unknownProperties === 'allow' ? 'allow' : 'declared',
      properties: Object.fromEntries(
        [...new Set([...Object.keys(left.properties), ...Object.keys(right.properties)])]
          .sort()
          .map(key => [
            key,
            Object.hasOwn(left.properties, key) && Object.hasOwn(right.properties, key)
              ? mergeReadNodes(left.properties[key], right.properties[key])
              : Object.hasOwn(left.properties, key)
                ? left.properties[key]
                : right.properties[key],
          ])
      ),
    };
  }
  if (left.kind === 'array' && right.kind === 'array')
    return { kind: 'array', nullable, annotations: left.annotations ?? right.annotations, items: mergeReadNodes(left.items, right.items) };
  if (left.kind === 'scalar' && right.kind === 'scalar' && left.scalarType === right.scalarType) {
    return {
      kind: 'scalar',
      nullable,
      scalarType: left.scalarType,
      annotations: left.annotations ?? right.annotations,
      ...(left.enum && right.enum ? { enum: [...new Set([...left.enum, ...right.enum])] } : {}),
    };
  }
  return {
    kind: 'any',
    nullable: true,
    reason: 'incompatible-read-variants',
    ...(hasWriteOnlyFields(left) || hasWriteOnlyFields(right) ? { annotations: { writeOnly: true } } : {}),
  };
}
