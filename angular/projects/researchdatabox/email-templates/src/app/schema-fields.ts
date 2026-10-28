import type { EmailContextSchema } from '@researchdatabox/sails-ng-common';
import { resolveContextSchema, safeSchemaKey, schemaTypes } from './schema-utils';
import { templateSegment } from './template-path';

export interface ContextSchemaField {
  /** Absolute Handlebars path. Array children use [] as a presentation marker. */
  path: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
  isArray: boolean;
}
/** Preorder entries; objects can expand, arrays can insert an each scaffold. */
export function flattenContextFields(schema: EmailContextSchema): ContextSchemaField[] {
  const fields: ContextSchemaField[] = [];
  const walk = (raw: EmailContextSchema, path: string, required: boolean, depth: number) => {
    if (depth > 20 || fields.length >= 5000) return;
    const node = resolveContextSchema(raw, schema);
    const types = schemaTypes(node);
    const isArray = types.includes('array');
    if (path)
      fields.push({
        path,
        type: types.join(' | ') || 'unknown',
        title: node.title,
        description: node.description,
        required,
        isArray,
      });
    for (const [key, child] of Object.entries(node.properties ?? {}).filter(([key]) => safeSchemaKey(key))) {
      const segment = templateSegment(key);
      if (!segment) continue;
      walk(child, path ? `${path}.${segment}` : segment, (node.required ?? []).includes(key), depth + 1);
    }
    if (isArray && node.items) {
      const items = resolveContextSchema(node.items, schema);
      for (const [key, child] of Object.entries(items.properties ?? {}).filter(([key]) => safeSchemaKey(key))) {
        const segment = templateSegment(key);
        if (segment) walk(child, `${path}[].${segment}`, (items.required ?? []).includes(key), depth + 1);
      }
    }
    for (const child of node.allOf ?? []) walk(child, path, required, depth + 1);
  };
  walk(schema, '', true, 0);
  return [...new Map(fields.map(field => [field.path, field])).values()];
}
