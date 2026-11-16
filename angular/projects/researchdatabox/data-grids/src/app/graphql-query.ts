import {
  buildSchema,
  getNamedType,
  isListType,
  isNonNullType,
  type SelectionSetNode,
  type GraphQLCompositeType,
  getVariableValues,
  GraphQLSchema,
  GraphQLArgument,
  isObjectType,
  isCompositeType,
  isInterfaceType,
  isInputObjectType,
  Kind,
  parse,
  print,
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
// Publishing only needs cursor syntax, not the GraphQL schema editor.
export { cursorBinding } from './cursor-binding';
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
export { rawDefinition } from './raw-definition';

export function queryRecordType(document: string, variables: Record<string, unknown>): string | null {
  try {
    const ast = parse(document, { maxTokens: 2000 });
    const op = ast.definitions.find(n => n.kind === Kind.OPERATION_DEFINITION);
    if (!op || op.kind !== Kind.OPERATION_DEFINITION) return null;
    const root = op.selectionSet.selections.find(n => n.kind === Kind.FIELD && n.name.value === 'records');
    if (!root || root.kind !== Kind.FIELD) return null;
    const value = root.arguments?.find(a => a.name.value === 'recordType')?.value;
    const type =
      value?.kind === Kind.STRING ? value.value : value?.kind === Kind.VARIABLE ? variables[value.name.value] : null;
    return typeof type === 'string' ? type : null;
  } catch {
    return null;
  }
}
export function insertRecordField(document: string, selections: { selection: string }[], metadata: boolean): string {
  const ast = parse(document, { maxTokens: 2000 });
  const snippets = [...new Set(selections.map(s => s.selection))].join(' ');
  if (!snippets) return document;
  const addition = parse(`{ ${metadata ? 'metadata { __typename ' + snippets + ' }' : snippets} }`);
  const op = addition.definitions[0];
  if (op.kind !== Kind.OPERATION_DEFINITION) return document;
  return print(
    visit(ast, {
      Field(node) {
        return node.name.value === 'nodes' && node.selectionSet
          ? {
              ...node,
              selectionSet: {
                ...node.selectionSet,
                selections: [...node.selectionSet.selections, ...op.selectionSet.selections],
              },
            }
          : undefined;
      },
    })
  );
}

/** Selected response paths, including aliases, independent of whether a preview has run. */
export function selectedResultFields(
  schema: GraphQLSchema | null,
  document: string,
  resultPath: string[]
): { label: string; path: string[]; type: string; sourcePath?: string }[] {
  if (!schema) return [];
  try {
    const ast = parse(document, { maxTokens: 2000 });
    const op = ast.definitions.find(n => n.kind === Kind.OPERATION_DEFINITION);
    if (!op || op.kind !== Kind.OPERATION_DEFINITION) return [];
    let set = op.selectionSet,
      type = schema.getQueryType();
    for (const segment of resultPath) {
      const field = set.selections.find(n => n.kind === Kind.FIELD && (n.alias?.value ?? n.name.value) === segment);
      if (!field || field.kind !== Kind.FIELD || !field.selectionSet || !type) return [];
      const next = getNamedType(type.getFields()[field.name.value]?.type);
      if (!isObjectType(next)) return [];
      type = next;
      set = field.selectionSet;
    }
    const result: { label: string; path: string[]; type: string; sourcePath?: string }[] = [];
    const present = (field: { description?: string | null }, path: string[], type: string) => {
      let sourcePath: string | undefined;
      try {
        const value = JSON.parse(field.description?.split('Stored metadata pointer (JSON string): ')[1] ?? 'null');
        if (typeof value === 'string') sourcePath = value;
      } catch {
        /* Handwritten fields need no stored path. */
      }
      return { label: path.join('.'), path, type, ...(sourcePath ? { sourcePath } : {}) };
    };
    const walk = (selection: SelectionSetNode, parent: GraphQLCompositeType, prefix: string[], depth: number) => {
      if (depth > 12) return;
      for (const node of selection.selections) {
        if (node.kind === Kind.INLINE_FRAGMENT) {
          const next = node.typeCondition ? schema.getType(node.typeCondition.name.value) : parent;
          if (isCompositeType(next)) walk(node.selectionSet, next, prefix, depth + 1);
          continue;
        }
        if (node.kind !== Kind.FIELD || node.name.value === '__typename') continue;
        const field = isObjectType(parent) || isInterfaceType(parent) ? parent.getFields()[node.name.value] : undefined;
        if (!field) continue;
        const named = getNamedType(field.type),
          path = [...prefix, node.alias?.value ?? node.name.value];
        const unwrapped = isNonNullType(field.type) ? field.type.ofType : field.type;
        if (isListType(unwrapped)) continue;
        if (isCompositeType(named)) {
          result.push(present(field, path, 'object'));
          if (node.selectionSet) walk(node.selectionSet, named, path, depth + 1);
        } else result.push(present(field, path, ['JSON', 'StoredJSON'].includes(named.name) ? 'object' : 'text'));
      }
    };
    if (type) walk(set, type, [], 0);
    return result;
  } catch {
    return [];
  }
}
