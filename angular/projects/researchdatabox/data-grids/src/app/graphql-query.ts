import {
  buildSchema,
  getVariableValues,
  GraphQLSchema,
  GraphQLArgument,
  isObjectType,
  isInputObjectType,
  Kind,
  parse,
  validate,
  visit,
} from 'graphql';
import { object, parseQueryVariables } from './record-grid.protocol';
import { GridRequestError } from './data-grid-source';
import { GridRow, RawDefinition, validCellValue } from './data-grid.model';

export function editorSchema(sdl: string): GraphQLSchema {
  return buildSchema(sdl);
}
export function editorErrors(schema: GraphQLSchema | null, document: string, variables: string): string[] {
  try {
    const vars: unknown = JSON.parse(variables);
    if (!vars || typeof vars !== 'object' || Array.isArray(vars)) return ['Variables must be a JSON object.'];
    parseQueryVariables(vars);
    const ast = parse(document, { maxTokens: 2000 });
    const operations = ast.definitions.filter(node => node.kind === Kind.OPERATION_DEFINITION);
    if (operations.length !== 1 || operations[0].operation !== 'query') return ['Use exactly one read-only query.'];
    if (!schema) return ['Load the current schema before running or saving.'];
    const errors = validate(schema, ast).map(error => error.message);
    const coerced = getVariableValues(schema, operations[0].variableDefinitions ?? [], object(vars));
    return [...errors, ...(coerced.errors ?? []).map(error => error.message)].slice(0, 12);
  } catch (error) {
    return [
      error instanceof GridRequestError && error.key === 'variables-depth'
        ? 'Variables must have at most 30 levels per value.'
        : error instanceof Error
          ? error.message
          : 'Invalid query.',
    ];
  }
}
export function schemaFields(schema: GraphQLSchema | null, typeName: string, search: string) {
  const type = schema?.getType(typeName);
  if (!type || (!isObjectType(type) && !isInputObjectType(type))) return [];
  return Object.values(type.getFields())
    .filter(field => field.name.toLowerCase().includes(search.toLowerCase()))
    .map(field => ({
      name: field.name,
      type: String(field.type),
      signature:
        'args' in field && field.args.length
          ? '(' + field.args.map((arg: GraphQLArgument) => arg.name + ': ' + String(arg.type)).join(', ') + ')'
          : '',
      description: field.description ?? '',
    }));
}
/** Recognize only a direct collection with explicit first/after variables and page-info selections.
 * Fragments/directives/aliased child fields remain usable through non-paginated JSON/grid mode. */
export function cursorBinding(document: string, variables: Record<string, unknown>, path: string[]) {
  try {
    const ast = parse(document, { maxTokens: 2000 });
    const ops = ast.definitions.filter(node => node.kind === Kind.OPERATION_DEFINITION);
    if (ops.length !== 1 || ops[0].selectionSet.selections.length !== 1) return null;
    const root = ops[0].selectionSet.selections[0];
    if (root.kind !== Kind.FIELD || root.name.value !== 'records' || root.directives?.length) return null;
    const key = root.alias?.value ?? root.name.value;
    if (path.join('.') !== `${key}.nodes`) return null;
    const args = root.arguments ?? [];
    const first = args.find(arg => arg.name.value === 'first')?.value;
    const after = args.find(arg => arg.name.value === 'after')?.value;
    if (first?.kind !== Kind.VARIABLE || after?.kind !== Kind.VARIABLE) return null;
    let cursorReferences = 0;
    visit(ast, {
      Variable(node) {
        if (node.name.value === after.name.value) cursorReferences++;
      },
    });
    // One declaration and one argument use: paging must not alter another argument.
    if (cursorReferences !== 2) return null;
    const cursorDefault = ops[0].variableDefinitions?.find(
      node => node.variable.name.value === after.name.value
    )?.defaultValue;
    if (cursorDefault && cursorDefault.kind !== Kind.NULL) return null;
    const size = variables[first.name.value];
    if (size !== 25 && size !== 50) return null;
    const children = root.selectionSet?.selections;
    if (
      !children ||
      !['nodes', 'hasNextPage', 'endCursor'].every(name =>
        children.some(
          node => node.kind === Kind.FIELD && node.name.value === name && !node.alias && !node.directives?.length
        )
      )
    )
      return null;
    return { root: key, after: after.name.value, size };
  } catch {
    return null;
  }
}
/** Response property names alone cannot establish identity: aliases may rename any field.
 * Conservatively require direct, unconditional, unaliased records/nodes/oid selections. */
export function recordIdentityKey(document: string, path: string[]): 'oid' | null {
  try {
    const ast = parse(document, { maxTokens: 2000 });
    const operations = ast.definitions.filter(node => node.kind === Kind.OPERATION_DEFINITION);
    if (operations.length !== 1 || operations[0].operation !== 'query') return null;
    const root = operations[0].selectionSet.selections.find(
      node => node.kind === Kind.FIELD && (node.alias?.value ?? node.name.value) === path[0]
    );
    if (
      !root ||
      root.kind !== Kind.FIELD ||
      root.name.value !== 'records' ||
      root.directives?.length ||
      path.length !== 2 ||
      path[1] !== 'nodes'
    )
      return null;
    const nodes = root.selectionSet?.selections.find(
      node => node.kind === Kind.FIELD && node.name.value === 'nodes' && !node.alias && !node.directives?.length
    );
    if (!nodes || nodes.kind !== Kind.FIELD) return null;
    return nodes.selectionSet?.selections.some(
      node => node.kind === Kind.FIELD && node.name.value === 'oid' && !node.alias && !node.directives?.length
    )
      ? 'oid'
      : null;
  } catch {
    return null;
  }
}
export function resultArrays(data: unknown, prefix: string[] = [], depth = 0): string[][] {
  if (depth > 12) return [];
  if (Array.isArray(data)) return [prefix];
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).flatMap(([key, value]) => resultArrays(value, [...prefix, key], depth + 1));
}
export function rawRows(
  data: unknown,
  path: string[],
  identityKey: string | null = null
): { rows: GridRow[]; columns: string[] } {
  let value: unknown = data;
  for (const key of path) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
      throw new GridRequestError('result-path-invalid');
    value = Reflect.get(value, key);
  }
  if (!Array.isArray(value) || value.length > 100) throw new GridRequestError('result-path-invalid');
  const columns = new Set<string>();
  const columnPaths = new Map<string, string>();
  const rows = value.map((item, index) => {
    const values: GridRow['values'] = Object.create(null);
    const walk = (entry: unknown, keys: string[], depth: number) => {
      if (depth > 12) throw new GridRequestError('result-path-invalid');
      if (
        entry === null ||
        Array.isArray(entry) ||
        (typeof entry === 'object' && !Object.keys(entry).length) ||
        ['string', 'number', 'boolean'].includes(typeof entry)
      ) {
        const key = keys.length ? keys.join('.') : 'value';
        // Every flattened segment is validated below; JSON scalar keys are not necessarily GraphQL names.
        const identity = JSON.stringify(keys);
        if (columnPaths.has(key) && columnPaths.get(key) !== identity)
          throw new GridRequestError('result-path-invalid');
        columnPaths.set(key, identity);
        columns.add(key);
        if (columns.size > 30) throw new GridRequestError('result-columns-limit');
        if (!validCellValue(entry)) throw new GridRequestError('result-path-invalid');
        values[key] = entry;
      } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        for (const [key, nested] of Object.entries(entry)) {
          // Arbitrary JSON names could alias another dotted path. Fail the whole mapping
          // so the complete response remains available through the existing JSON view.
          if (!/^[_A-Za-z][_0-9A-Za-z]*$/.test(key)) throw new GridRequestError('result-path-invalid');
          walk(nested, [...keys, key], depth + 1);
        }
      }
    };
    walk(item, [], 0);
    return {
      oid: String(index),
      values,
      ...(identityKey &&
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      Object.hasOwn(item, identityKey) &&
      typeof Reflect.get(item, identityKey) === 'string'
        ? { recordOid: Reflect.get(item, identityKey) as string }
        : {}),
    };
  });
  if (rows.length && !columns.size) throw new GridRequestError('result-path-invalid');
  return { rows, columns: [...columns] };
}
export function rawDefinition(name = ''): RawDefinition {
  return {
    version: 1,
    mode: 'graphql',
    name,
    document:
      'query Explore($type: String!, $first: Int, $after: String) {\n  records(recordType: $type, first: $first, after: $after) {\n    nodes { oid recordType workflowStep }\n    hasNextPage endCursor\n  }\n}',
    variables: { type: '', first: 25, after: null },
    resultPath: ['records', 'nodes'],
  };
}
