import type { EmailContextSchema } from '@researchdatabox/sails-ng-common';
export const safeSchemaKey = (key: string): boolean => !['__proto__', 'constructor', 'prototype'].includes(key);

/** Local references only; never fetch schemas or evaluate schema text. */
export function resolveContextSchema(node: EmailContextSchema, root: EmailContextSchema): EmailContextSchema {
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
    node = value as EmailContextSchema;
  }
  return node;
}

export function schemaTypes(node: EmailContextSchema): string[] {
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
