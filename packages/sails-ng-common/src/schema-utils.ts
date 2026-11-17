import type { EditorContextSchema } from './schema-assist.model';
export const safeSchemaKey = (key: string): boolean => !['__proto__', 'constructor', 'prototype'].includes(key);

/** Local references only; never fetch schemas or evaluate schema text. */
export function resolveContextSchema(node: EditorContextSchema, root: EditorContextSchema): EditorContextSchema {
  const seen = new Set<string>();
  while (node.$ref) {
    if (!node.$ref.startsWith('#/') || seen.has(node.$ref)) return {};
    seen.add(node.$ref);
    let value: unknown = root;
    for (const part of node.$ref.slice(2).split('/')) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      value =
        safeSchemaKey(key) && value && typeof value === 'object' && Object.hasOwn(value, key)
          ? Reflect.get(value, key)
          : undefined;
    }
    if (!value || typeof value !== 'object') return {};
    node = value as EditorContextSchema;
  }
  return node;
}

export function schemaTypes(node: EditorContextSchema): string[] {
  return Array.isArray(node.type)
    ? node.type
    : node.type
      ? [node.type]
      : node.properties
        ? ['object']
        : node.items
          ? ['array']
          : [];
}
