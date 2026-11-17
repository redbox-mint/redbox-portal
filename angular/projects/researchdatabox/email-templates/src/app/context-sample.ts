import type { EmailContextSchema } from '@researchdatabox/sails-ng-common';
import { resolveContextSchema, safeSchemaKey, schemaTypes } from './schema-utils';
import { validateContextJson } from './context-validation';

export const MAX_SAMPLE_CONDITION_PASSES = 16;

/** Content-free failure: keep the editor's existing JSON when generation fails. */
export class SampleContextError extends Error {
  constructor(public readonly reason: 'limit' | 'invalid') {
    super('Unable to generate a valid context sample within the generation limits.');
  }
}

/** Generates data, never mutates the editor. The caller must confirm replacing edited JSON. */
export function generateSampleContext(schema: EmailContextSchema): Record<string, unknown> {
  let nodes = 0;
  const copy = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => safeSchemaKey(key))
        .map(([key, child]) => [key, copy(child)])
    );
  };
  const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  const merge = (base: unknown, branch: unknown, depth = 0): unknown => {
    if (depth > 20 || ++nodes > 5000) return base;
    if (Array.isArray(base) && Array.isArray(branch))
      return Array.from({ length: Math.max(base.length, branch.length) }, (_, index) =>
        index < branch.length ? merge(base[index], branch[index], depth + 1) : base[index]
      );
    if (!isObject(base) || !isObject(branch)) return branch ?? base;
    const result = { ...base };
    for (const [key, value] of Object.entries(branch).filter(([key]) => safeSchemaKey(key)))
      result[key] = Object.hasOwn(result, key) ? merge(result[key], value, depth + 1) : value;
    return result;
  };
  const sample = (raw: EmailContextSchema, depth = 0): unknown => {
    const conditions: EmailContextSchema[] = [];
    const unconditional = (input: EmailContextSchema, level: number): unknown => {
      if (++nodes > 5000 || level > 20) return null;
      const node = resolveContextSchema(input, schema);
      if (node['if']) conditions.push(node);
      const types = schemaTypes(node);
      const type = types.find(t => t !== 'null') ?? types[0];
      const base = (): unknown => {
        if (node.examples?.length) return copy(node.examples[0]);
        if (Object.hasOwn(node, 'default')) return copy(node.default);
        if (node.enum?.length) return copy(node.enum[0]);
        if (Object.hasOwn(node, 'const')) return copy(node['const']);
        if (type === 'object')
          return Object.fromEntries(
            Object.entries(node.properties ?? {})
              // Read-only (derived) fields such as `imports` are rebuilt by the server.
              .filter(([key, child]) => safeSchemaKey(key) && !resolveContextSchema(child, schema)['readOnly'])
              .map(([key, child]) => [key, sample(child, level + 1)])
          );
        if (type === 'array') return node.items ? [sample(node.items, level + 1)] : [];
        if (type === 'boolean') return true;
        if (type === 'number' || type === 'integer') return typeof node['minimum'] === 'number' ? node['minimum'] : 1;
        if (type === 'string') {
          if (node['format'] === 'date-time') return '2026-01-01T00:00:00Z';
          if (node['format'] === 'date') return '2026-01-01';
          if (node['format'] === 'email') return 'researcher@example.org';
          if (node['format'] === 'uri') return 'https://example.org/record';
          return node.title || 'Example';
        }
        // Typeless form-config fields still have useful labels.
        return !type && node.title ? node.title : null;
      };
      let value = base();
      const alternative = node.oneOf?.[0] ?? node.anyOf?.[0];
      if (alternative) value = merge(value, unconditional(alternative, level + 1));
      for (const child of node.allOf ?? []) value = merge(value, unconditional(child, level + 1));
      return value;
    };
    // Merge every unconditional allOf sibling before selecting any branch.
    const base = unconditional(raw, depth);
    let value = base;
    for (let pass = 0; conditions.length && pass < MAX_SAMPLE_CONDITION_PASSES; pass++) {
      // Rebuild each pass so fields from an obsolete else/then branch disappear.
      let next = base;
      for (const condition of conditions) {
        const matches = validateContextJson(value, condition['if'] as EmailContextSchema, schema).length === 0;
        const branch = condition[matches ? 'then' : 'else'] as EmailContextSchema | undefined;
        if (branch) next = merge(next, sample(branch, depth + 1));
      }
      if (JSON.stringify(next) === JSON.stringify(value)) return next;
      value = next;
      if (pass === MAX_SAMPLE_CONDITION_PASSES - 1) throw new SampleContextError('limit');
    }
    return value;
  };
  const result = sample(schema);
  if (!isObject(result) || validateContextJson(result, schema).length) throw new SampleContextError('invalid');
  return result;
}
