import type { EmailContextSchema } from '@researchdatabox/sails-ng-common';
import { resolveContextSchema, safeSchemaKey, schemaTypes } from './schema-utils';

export interface ContextPathError {
  path: string;
  code: string;
  message: string;
  /** For `type` errors: the schema's accepted types, for a translated message. */
  expected?: string[];
}
/** Advisory errors use JSONPath and never include the data's values. Limited to 100 errors. */
export function validateContextJson(value: unknown, schema: EmailContextSchema, root = schema): ContextPathError[] {
  let nodes = 0;
  const walk = (data: unknown, raw: EmailContextSchema, path: string, depth: number): ContextPathError[] => {
    const errors: ContextPathError[] = [];
    const add = (code: string, message: string, expected?: string[]) =>
      errors.push({ path, code, message, ...(expected ? { expected } : {}) });
    if (++nodes > 10000 || depth > 64) {
      add('limit', 'Validation limit exceeded.');
      return errors;
    }
    const node = resolveContextSchema(raw, root);
    const types = schemaTypes(node);
    const type = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    if (
      types.length &&
      !types.some(t => t === type || (t === 'integer' && typeof data === 'number' && Number.isInteger(data)))
    ) {
      add('type', `Expected ${types.join(' or ')}.`, types);
      return errors;
    }
    if (node.enum && !node.enum.some(item => JSON.stringify(item) === JSON.stringify(data)))
      add('enum', 'Choose a schema enum value.');
    if (Object.hasOwn(node, 'const') && JSON.stringify(node['const']) !== JSON.stringify(data))
      add('const', 'Expected the schema constant.');
    if (typeof data === 'string') {
      if (typeof node['minLength'] === 'number' && Array.from(data).length < node['minLength'])
        add('minLength', 'String is too short.');
      if (typeof node['maxLength'] === 'number' && Array.from(data).length > node['maxLength'])
        add('maxLength', 'String is too long.');
    }
    if (typeof data === 'number') {
      if (typeof node['minimum'] === 'number' && data < node['minimum']) add('minimum', 'Number is below the minimum.');
      if (typeof node['maximum'] === 'number' && data > node['maximum']) add('maximum', 'Number exceeds the maximum.');
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const object = data as Record<string, unknown>;
      const childPath = (key: string) =>
        /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
      for (const key of node.required ?? [])
        if (safeSchemaKey(key) && !Object.hasOwn(object, key))
          errors.push({ path: childPath(key), code: 'required', message: 'Required field is missing.' });
      for (const key of Object.keys(object).filter(safeSchemaKey)) {
        const property = node.properties && Object.hasOwn(node.properties, key) ? node.properties[key] : undefined;
        if (property && resolveContextSchema(property, root)['readOnly'])
          errors.push({ path: childPath(key), code: 'readOnly', message: 'Ignored: rebuilt by the server.' });
        else if (property) errors.push(...walk(object[key], property, childPath(key), depth + 1));
        else if (node.additionalProperties === false)
          errors.push({ path: childPath(key), code: 'additionalProperties', message: 'Field is not in the schema.' });
        else if (node.additionalProperties && typeof node.additionalProperties === 'object')
          errors.push(...walk(object[key], node.additionalProperties, childPath(key), depth + 1));
        if (errors.length >= 100) break;
      }
    }
    if (Array.isArray(data)) {
      if (typeof node['minItems'] === 'number' && data.length < node['minItems'])
        add('minItems', 'Array has too few items.');
      if (typeof node['maxItems'] === 'number' && data.length > node['maxItems'])
        add('maxItems', 'Array has too many items.');
      if (node.items)
        for (let i = 0; i < data.length && errors.length < 100; i++)
          errors.push(...walk(data[i], node.items, `${path}[${i}]`, depth + 1));
    }
    for (const child of node.allOf ?? []) errors.push(...walk(data, child, path, depth + 1));
    if (node['not'] && walk(data, node['not'] as EmailContextSchema, path, depth + 1).length === 0)
      add('not', 'Value matches an excluded schema.');
    if (node['if']) {
      const matches = walk(data, node['if'] as EmailContextSchema, path, depth + 1).length === 0;
      const branch = node[matches ? 'then' : 'else'] as EmailContextSchema | undefined;
      if (branch) errors.push(...walk(data, branch, path, depth + 1));
    }
    for (const keyword of ['anyOf', 'oneOf'] as const) {
      const choices = node[keyword];
      if (choices) {
        const matches = choices.filter(child => walk(data, child, path, depth + 1).length === 0).length;
        if (keyword === 'oneOf' ? matches !== 1 : matches === 0)
          add(keyword, 'Value does not match the schema alternatives.');
      }
    }
    return errors.slice(0, 100);
  };
  return walk(value, schema, '$', 0);
}
