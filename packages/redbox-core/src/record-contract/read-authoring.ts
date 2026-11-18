import type { RecordSchemaLimitsConfig } from '../config/recordSchema.config';
import type { ContractNode, ContractObjectNode } from './types';
import { hasWriteOnlyFields } from './read-visibility';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid metadata read declaration.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown metadata read option.');
}
function propertyName(name: string): void {
  if (!name || name.length > 200 || ['__proto__', 'prototype', 'constructor'].includes(name))
    throw new Error('Invalid metadata read property.');
}

/** Closed, bounded author declarations; never accepts an arbitrary JSON/schema node. */
export function compileMetadataReadShape(
  value: unknown,
  limits: Readonly<RecordSchemaLimitsConfig>,
  rootNullable = true
): ContractNode {
  let count = 0;
  function visit(input: unknown, depth: number): ContractNode {
    if (depth > limits.maxDepth || ++count > limits.maxProperties)
      throw new Error('Metadata read shape exceeds its bound.');
    const shape = object(input);
    keys(shape, ['type', 'label', 'properties', 'items']);
    if (shape.label !== undefined && (typeof shape.label !== 'string' || shape.label.length > 256))
      throw new Error('Invalid metadata read label.');
    const annotations = typeof shape.label === 'string' ? { extensions: { 'x-redbox-label': shape.label } } : undefined;
    const base = { nullable: depth === 0 ? rootNullable : true, ...(annotations ? { annotations } : {}) };
    if (shape.type === 'object') {
      if (shape.items !== undefined) throw new Error('Invalid object read shape.');
      const properties = object(shape.properties);
      if (!Object.keys(properties).length) throw new Error('Metadata read objects require declared properties.');
      return {
        ...base,
        kind: 'object',
        unknownProperties: 'declared',
        properties: Object.fromEntries(
          Object.entries(properties).map(([name, child]) => {
            propertyName(name);
            return [name, visit(child, depth + 1)];
          })
        ),
      };
    }
    if (shape.type === 'array') {
      if (shape.properties !== undefined) throw new Error('Invalid array read shape.');
      return { ...base, kind: 'array', items: visit(shape.items, depth + 1) };
    }
    if (shape.properties !== undefined || shape.items !== undefined) throw new Error('Invalid scalar read shape.');
    if (shape.type === 'string' || shape.type === 'number' || shape.type === 'integer' || shape.type === 'boolean')
      return { ...base, kind: 'scalar', scalarType: shape.type };
    throw new Error('Unsupported metadata read type.');
  }
  return visit(value, 0);
}

/** Retain only the excluded branches when an author omits a private subtree. */
function readPrivacyExclusions(node: ContractNode): ContractNode {
  if (node.annotations?.writeOnly) return node;
  if (node.kind === 'object')
    return {
      ...node,
      properties: Object.fromEntries(
        Object.entries(node.properties)
          .filter(([, child]) => hasWriteOnlyFields(child))
          .map(([name, child]) => [name, readPrivacyExclusions(child)])
      ),
    };
  if (node.kind === 'array') return { ...node, items: readPrivacyExclusions(node.items) };
  return { ...node, annotations: { ...node.annotations, writeOnly: true } };
}

/** Authoring can narrow a shape but cannot make a contributor's private data readable. */
export function retainReadPrivacy(declared: ContractNode, existing?: ContractNode): ContractNode {
  if (!existing || !hasWriteOnlyFields(existing)) return declared;
  if (existing.annotations?.writeOnly)
    return { ...declared, annotations: { ...declared.annotations, writeOnly: true } };
  if (existing.kind === 'object' && declared.kind === 'object')
    return {
      ...declared,
      properties: Object.fromEntries([
        ...Object.entries(declared.properties).map(([name, node]) => [
          name,
          retainReadPrivacy(node, existing.properties[name]),
        ]),
        // Preserve omitted exclusions for later readMetadata replacements,
        // without reintroducing omitted public siblings into this declaration.
        ...Object.entries(existing.properties)
          .filter(([name, node]) => !Object.hasOwn(declared.properties, name) && hasWriteOnlyFields(node))
          .map(([name, node]) => [name, readPrivacyExclusions(node)]),
      ]),
    };
  if (existing.kind === 'array' && declared.kind === 'array')
    return { ...declared, items: retainReadPrivacy(declared.items, existing.items) };
  // Changing the topology of a private shape cannot safely relocate its exclusions.
  return { ...declared, annotations: { ...declared.annotations, writeOnly: true } };
}

export function applyMetadataReadConfiguration(
  root: ContractObjectNode,
  configurations: unknown,
  recordType: string,
  limits: Readonly<RecordSchemaLimitsConfig>
): ContractObjectNode {
  if (configurations === undefined) return root;
  const byType = object(configurations);
  if (Object.keys(byType).length > 100) throw new Error('Metadata read configurations exceed their bound.');
  if (!Object.hasOwn(byType, recordType)) return root;
  const config = object(byType[recordType]);
  keys(config, ['properties', 'identity', 'defaultColumns']);
  const properties = { ...root.properties };
  for (const [name, shape] of Object.entries(object(config.properties))) {
    propertyName(name);
    properties[name] = retainReadPrivacy(compileMetadataReadShape(shape, limits), properties[name]);
  }
  const defaults = config.defaultColumns === undefined ? [] : config.defaultColumns;
  if (!Array.isArray(defaults) || defaults.length > 50 || new Set(defaults).size !== defaults.length)
    throw new Error('Invalid metadata default columns.');
  const hints = [...defaults, ...(config.identity === undefined ? [] : [config.identity])];
  for (const name of hints) {
    if (
      typeof name !== 'string' ||
      !Object.hasOwn(properties, name) ||
      properties[name].kind !== 'scalar' ||
      hasWriteOnlyFields(properties[name])
    )
      throw new Error('Metadata presentation hints require a declared public scalar.');
    const node = properties[name];
    properties[name] = {
      ...node,
      annotations: {
        ...node.annotations,
        extensions: {
          ...node.annotations?.extensions,
          ...(config.identity === name ? { 'x-redbox-identity': true } : {}),
          ...(defaults.includes(name) ? { 'x-redbox-default-column': defaults.indexOf(name) } : {}),
        },
      },
    };
  }
  return { ...root, properties };
}
