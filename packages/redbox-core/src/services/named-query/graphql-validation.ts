import {
  Kind,
  GraphQLError,
  TypeNameMetaFieldDef,
  getNamedType,
  getOperationAST,
  isAbstractType,
  isCompositeType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isInputType,
  parse,
  specifiedRules,
  typeFromAST,
  validate,
  visit,
  valueFromASTUntyped,
  type DocumentNode,
  type FieldNode,
  type GraphQLCompositeType,
  type GraphQLInputType,
  type GraphQLObjectType,
  type GraphQLOutputType,
  type GraphQLSchema,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from 'graphql';
import type {
  EditorDiagnostic,
  GraphqlNamedQueryDefinition,
  NamedQueryValidation,
  NamedQueryPath,
} from '@researchdatabox/sails-ng-common';
import type { ReadCaller } from '../../record-graphql/read-record';
import { boundedQueryRule, QUERY_LIMITS } from '../../record-graphql/schema';
import { checkDraftBudget, boundedJsonBytes } from '../../utilities/NamedQueryPreview';
import { assertNamedQueryDefinition } from './definition';
import { consumerInput, convertGraphqlInput, GraphqlNamedQueryInputError, safeSegment } from './graphql-input';

export function graphqlDiagnostic(code: string, field: string, reason: string, lookup = false): EditorDiagnostic {
  return {
    source: 'graphql',
    capability: lookup ? 'lookup' : 'definition',
    code,
    severity: lookup ? 'warning' : 'error',
    field: field.slice(0, 256),
    reason,
    line: 0,
    column: 0,
  };
}
export class GraphqlNamedQueryValidationError extends Error {
  readonly code = 'INVALID_GRAPHQL_NAMED_QUERY';
  constructor(readonly diagnostics: EditorDiagnostic[]) {
    super('Invalid GraphQL named query definition.');
  }
}
export interface ValidatedGraphqlNamedQuery {
  definition: GraphqlNamedQueryDefinition;
  operation: OperationDefinitionNode;
  types: Map<string, GraphQLInputType>;
  validation: NamedQueryValidation;
}

interface Selected {
  type: GraphQLOutputType;
  node: FieldNode;
  guaranteed: boolean;
}
const unwrap = (type: GraphQLOutputType) => (isNonNullType(type) ? type.ofType : type);

/** Resolve the selected response, including aliases and fragments. Never infer an
 * unselected schema property or flatten a list. Every possible union branch counts.
 */
function selectedPath(
  schema: GraphQLSchema,
  document: DocumentNode,
  start: GraphQLCompositeType,
  selections: readonly SelectionSetNode[],
  path: NamedQueryPath,
  metadataTypes?: ReadonlySet<string>
): Selected[] | undefined {
  const fragments = new Map(
    document.definitions.filter(d => d.kind === Kind.FRAGMENT_DEFINITION).map(d => [d.name.value, d])
  );
  const find = (
    type: GraphQLObjectType,
    sets: readonly SelectionSetNode[],
    alias: string,
    guaranteed: boolean,
    active = new Set<string>()
  ): Selected[] => {
    const result: Selected[] = [];
    for (const set of sets)
      for (const node of set.selections) {
        const certain = guaranteed && !node.directives?.some(d => ['skip', 'include'].includes(d.name.value));
        if (node.kind === Kind.FIELD) {
          const field = node.name.value === '__typename' ? TypeNameMetaFieldDef : type.getFields()[node.name.value];
          if (field && (node.alias?.value ?? node.name.value) === alias)
            result.push({ type: field.type, node, guaranteed: certain });
        } else {
          const fragment = node.kind === Kind.FRAGMENT_SPREAD ? fragments.get(node.name.value) : node;
          if (!fragment || (node.kind === Kind.FRAGMENT_SPREAD && active.has(node.name.value))) continue;
          const condition = fragment.typeCondition ? schema.getType(fragment.typeCondition.name.value) : undefined;
          if (condition && condition !== type && !(isAbstractType(condition) && schema.isSubType(condition, type)))
            continue;
          result.push(
            ...find(
              type,
              [fragment.selectionSet],
              alias,
              certain,
              new Set([...active, ...(node.kind === Kind.FRAGMENT_SPREAD ? [node.name.value] : [])])
            )
          );
        }
      }
    return result;
  };
  const walk = (
    parent: GraphQLCompositeType,
    sets: readonly SelectionSetNode[],
    index: number,
    certain: boolean
  ): Selected[] | undefined => {
    const possible = (isObjectType(parent) ? [parent] : schema.getPossibleTypes(parent)).filter(
      type => parent.name !== 'RecordMetadata' || !metadataTypes || metadataTypes.has(type.name)
    );
    const results: Selected[] = [];
    for (const type of possible) {
      const found = find(type, sets, path[index], certain);
      if (!found.length) return undefined;
      if (index === path.length - 1) results.push(...found);
      else {
        const output = unwrap(found[0].type);
        if (isListType(output) || !isCompositeType(output)) return undefined;
        const next = walk(
          output,
          found.flatMap(f => (f.node.selectionSet ? [f.node.selectionSet] : [])),
          index + 1,
          found.some(f => f.guaranteed)
        );
        if (!next) return undefined;
        results.push(...next);
      }
    }
    return results.length ? results : undefined;
  };
  return path.length ? walk(start, selections, 0, true) : undefined;
}

/** The read schema records variant identities when compiling contracts. Narrow
 * only a literal/fixed/default-omitted collection scope, never a consumer default
 * that a caller can replace. No generated type-name guessing or record reads.
 */
function collectionMetadataTypes(
  schema: GraphQLSchema,
  document: DocumentNode,
  operation: OperationDefinitionNode,
  definition: GraphqlNamedQueryDefinition
): ReadonlySet<string> | undefined {
  const root = schema.getQueryType();
  const top = definition.graphql.resultPath[0];
  const selected = root && top ? selectedPath(schema, document, root, [operation.selectionSet], [top]) : undefined;
  const collection = selected?.find(field => field.node.name.value === 'records')?.node;
  if (!collection) return;
  const argument = (name: string): unknown => {
    const value = collection.arguments?.find(arg => arg.name.value === name)?.value;
    if (!value) return undefined;
    if (value.kind !== Kind.VARIABLE) return valueFromASTUntyped(value);
    const binding = definition.graphql.variables[value.name.value];
    if (binding?.ownership === 'fixed') return binding.value;
    if (binding?.ownership === 'omitted') {
      const defaultValue = operation.variableDefinitions?.find(
        v => v.variable.name.value === value.name.value
      )?.defaultValue;
      return defaultValue ? valueFromASTUntyped(defaultValue) : undefined;
    }
  };
  const type = argument('recordType');
  const stages = argument('workflowStages');
  // A variable-controlled stage list without fixed/omitted ownership cannot
  // narrow the complete record-type set, so retain every stage of that type.
  if (typeof type !== 'string') return;
  const variants: unknown = schema.extensions.recordReadVariants;
  if (!Array.isArray(variants)) return;
  const names = new Set<string>();
  for (const variant of variants) {
    if (
      variant &&
      typeof variant === 'object' &&
      variant.recordType === type &&
      typeof variant.typeName === 'string' &&
      (!Array.isArray(stages) || !stages.length || stages.includes(variant.workflowStep))
    )
      names.add(variant.typeName);
  }
  return names;
}

export function validateGraphqlNamedQuery(
  input: unknown,
  schema: GraphQLSchema
): {
  validation: NamedQueryValidation;
  prepared?: ValidatedGraphqlNamedQuery;
} {
  const diagnostics: EditorDiagnostic[] = [];
  const capabilities: EditorDiagnostic[] = [];
  const issue = (code: string, field: string, reason: string) =>
    diagnostics.push(graphqlDiagnostic(code, field, reason));
  const lookupIssue = (code: string, field: string, reason: string) =>
    capabilities.push(graphqlDiagnostic(code, field, reason, true));
  const result = (prepared?: Omit<ValidatedGraphqlNamedQuery, 'validation'>) => {
    const validation: NamedQueryValidation = {
      source: 'graphql',
      valid: !diagnostics.length,
      diagnostics,
      capabilities: { lookup: !diagnostics.length && !capabilities.length, diagnostics: capabilities },
    };
    return { validation, ...(prepared && validation.valid ? { prepared: { ...prepared, validation } } : {}) };
  };
  try {
    checkDraftBudget(input);
    assertNamedQueryDefinition(input);
  } catch {
    issue(
      'INVALID_DEFINITION',
      'graphql',
      'Provide a source-specific GraphQL definition with valid ownership and segment paths.'
    );
    return result();
  }
  if (input.source !== 'graphql') {
    issue('INVALID_SOURCE', 'source', 'A GraphQL definition is required.');
    return result();
  }
  const config = input.graphql;
  if (Buffer.byteLength(JSON.stringify(config)) > QUERY_LIMITS.bytes) {
    issue('QUERY_LIMIT', 'graphql', 'The definition exceeds the GraphQL input byte bound.');
    return result();
  }
  for (const [field, path] of [
    ['resultPath', config.resultPath],
    ...Object.entries(config.mappings ?? {}).map(([key, path]) => [`mappings.${key}`, path]),
    ...(config.lookup ? Object.entries(config.lookup).filter(([key]) => key.endsWith('Path')) : []),
  ] as Array<[string, NamedQueryPath]>) {
    if (path.some(part => !safeSegment(part)) || path.length > QUERY_LIMITS.depth)
      issue('UNSAFE_PATH', `graphql.${field}`, 'Use bounded own-property segments without prototype-related names.');
  }
  let document: DocumentNode;
  try {
    document = parse(config.document, { maxTokens: QUERY_LIMITS.tokens });
  } catch (error) {
    const d = graphqlDiagnostic(
      'GRAPHQL_SYNTAX',
      'graphql.document',
      'Repair the query syntax within the GraphQL token bound.'
    );
    if (error instanceof GraphQLError && error.locations?.[0]) {
      d.line = error.locations[0].line;
      d.column = error.locations[0].column;
    }
    diagnostics.push(d);
    return result();
  }
  const errors = validate(schema, document, [...specifiedRules, boundedQueryRule()], { maxErrors: 50 });
  for (const error of errors) {
    const d = graphqlDiagnostic(
      'GRAPHQL_SCHEMA',
      'graphql.document',
      error.extensions.code === 'QUERY_LIMIT'
        ? 'Use one bounded query without introspection, cyclic fragments or repeated collections.'
        : error.nodes?.some(node => node.kind === Kind.FIELD)
          ? 'Repair the marked field or selection using current read-schema assistance; it is unavailable or incompatible.'
          : 'Repair the marked argument, variable or type using the current read schema; its input contract is incompatible.'
    );
    if (error.locations?.[0]) {
      d.line = error.locations[0].line;
      d.column = error.locations[0].column;
    }
    diagnostics.push(d);
  }
  const operation = getOperationAST(document, config.operationName);
  if (!operation || operation.operation !== 'query') {
    issue(
      'GRAPHQL_OPERATION',
      'graphql.operationName',
      'Select the single query operation; mutations and subscriptions are prohibited.'
    );
    return result();
  }
  if (errors.length) return result();
  const types = new Map<string, GraphQLInputType>();
  const declarations = new Map(operation.variableDefinitions?.map(d => [d.variable.name.value, d]) ?? []);
  const server = config.lookup ? [config.lookup.firstVariable, config.lookup.afterVariable] : [];
  if (server.length && server[0] === server[1])
    issue('VARIABLE_OWNERSHIP', 'graphql.lookup', 'Page variables must be distinct.');
  const consumers = new Set<string>();
  for (const [name, declaration] of declarations) {
    const inputType = typeFromAST(schema, declaration.type);
    if (!inputType || !isInputType(inputType)) continue;
    types.set(name, inputType);
    const binding = Object.hasOwn(config.variables, name) ? config.variables[name] : undefined;
    if (server.includes(name)) {
      if (binding)
        issue(
          'VARIABLE_OWNERSHIP',
          `graphql.variables.${name}`,
          'Paging variables are owned exclusively by the server.'
        );
      continue;
    }
    if (!binding) {
      issue(
        'VARIABLE_OWNERSHIP',
        `graphql.variables.${name}`,
        'Explicitly choose fixed, consumer, or omitted ownership.'
      );
      continue;
    }
    try {
      if (binding.ownership === 'fixed') convertGraphqlInput(inputType, binding.value, name, true);
      else if (binding.ownership === 'omitted') {
        if (isNonNullType(inputType) && declaration.defaultValue === undefined)
          issue(
            'REQUIRED_VARIABLE',
            `graphql.variables.${name}`,
            'A non-null variable without an operation default cannot be omitted.'
          );
      } else {
        if (
          !safeSegment(binding.parameter) ||
          ['queryName', 'start', 'rows'].includes(binding.parameter) ||
          server.includes(binding.parameter) ||
          consumers.has(binding.parameter)
        )
          issue(
            'DUPLICATE_PARAMETER',
            `graphql.variables.${name}`,
            'Use a unique consumer parameter distinct from transport and server paging names.'
          );
        consumers.add(binding.parameter);
        if (!consumerInput(inputType) || binding.inputType !== String(inputType))
          issue(
            'INPUT_TYPE',
            `graphql.variables.${name}.inputType`,
            'Match the operation type exactly using supported scalars, enums, or lists of them.'
          );
        if (binding.required !== isNonNullType(inputType))
          issue(
            'REQUIRED_CONTRACT',
            `graphql.variables.${name}.required`,
            'Required must match the operation variable non-null contract; defaults may satisfy it.'
          );
        if (Object.hasOwn(binding, 'defaultValue')) convertGraphqlInput(inputType, binding.defaultValue, name);
      }
    } catch {
      issue(
        'INVALID_DEFAULT',
        `graphql.variables.${name}`,
        'The fixed value or named-query default does not satisfy the declared input type.'
      );
    }
  }
  for (const name of Object.keys(config.variables))
    if (!declarations.has(name))
      issue(
        'UNKNOWN_VARIABLE',
        `graphql.variables.${name}`,
        'Remove ownership for a variable not declared by the selected operation.'
      );
  for (const name of server)
    if (!declarations.has(name))
      issue('PAGE_VARIABLE', 'graphql.lookup', 'Declare both server-owned paging variables in the selected operation.');

  const root = schema.getQueryType();
  const metadataTypes = collectionMetadataTypes(schema, document, operation, input);
  const at = (path: NamedQueryPath) =>
    root && selectedPath(schema, document, root, [operation.selectionSet], path, metadataTypes);
  const rows = at(config.resultPath);
  if (!rows?.length || rows.some(row => !isListType(unwrap(row.type))))
    issue(
      'RESULT_PATH',
      'graphql.resultPath',
      'Select a response list by alias segments without traversing or flattening another list.'
    );
  const mapped = new Map<string, Selected[] | undefined>();
  if (rows?.every(row => isListType(unwrap(row.type)))) {
    for (const [key, path] of Object.entries(config.mappings ?? {})) {
      const values: Selected[] = [];
      for (const row of rows) {
        const list = unwrap(row.type);
        if (!isListType(list)) continue;
        const item = unwrap(list.ofType);
        const selection =
          path.length === 0
            ? [{ ...row, type: list.ofType }]
            : isCompositeType(item) && row.node.selectionSet
              ? selectedPath(
                  schema,
                  document,
                  item,
                  rows.flatMap(r => (r.node.selectionSet ? [r.node.selectionSet] : [])),
                  path,
                  metadataTypes
                )
              : undefined;
        if (!selection) {
          issue(
            'MAPPING_PATH',
            `graphql.mappings.${key}`,
            'Map a selected item property using alias segments; all possible item variants must provide the path.'
          );
          break;
        }
        values.push(...selection);
      }
      mapped.set(key, values.length ? values : undefined);
    }
  }
  if (!config.lookup)
    lookupIssue(
      'LOOKUP_PAGE_REQUIRED',
      'graphql.lookup',
      'Configure a bounded first-page collection adapter to enable lookup use.'
    );
  else {
    const page = config.lookup;
    const collections = at(page.collectionPath);
    const collection = collections?.[0];
    const field = (path: NamedQueryPath, name: string) => {
      const values = at(path);
      return (
        values?.length &&
        values.every(v => v.node.name.value === name && v.guaranteed) &&
        path.length === page.collectionPath.length + 1 &&
        page.collectionPath.every((part, i) => path[i] === part)
      );
    };
    const first = collection?.node.arguments?.find(a => a.name.value === 'first')?.value;
    const after = collection?.node.arguments?.find(a => a.name.value === 'after')?.value;
    for (const name of server) {
      const declaration = declarations.get(name)?.variable;
      const argument = name === page.firstVariable ? first : after;
      visit(document, {
        Variable(node) {
          if (node.name.value === name && node !== declaration && node !== argument)
            issue(
              'VARIABLE_OWNERSHIP',
              'graphql.lookup',
              'Server-owned page variables may only supply their collection paging argument.'
            );
        },
      });
    }
    const scalar = (name: string, expected: string) => {
      const declared = types.get(name);
      const type = declared && (isNonNullType(declared) ? declared.ofType : declared);
      return !!type && isScalarType(type) && type.name === expected;
    };
    if (
      page.collectionPath.length !== 1 ||
      collection?.node.name.value !== 'records' ||
      !collection.guaranteed ||
      !field(config.resultPath, 'nodes') ||
      !field(page.hasNextPagePath, 'hasNextPage') ||
      (page.endCursorPath && !field(page.endCursorPath, 'endCursor')) ||
      first?.kind !== Kind.VARIABLE ||
      first.name.value !== page.firstVariable ||
      after?.kind !== Kind.VARIABLE ||
      after.name.value !== page.afterVariable ||
      !scalar(page.firstVariable, 'Int') ||
      !scalar(page.afterVariable, 'String') ||
      isNonNullType(types.get(page.afterVariable)!)
    )
      lookupIssue(
        'LOOKUP_PAGE_SHAPE',
        'graphql.lookup',
        'Use the selected records collection, its nodes/continuation fields and direct Int first / nullable String after server variables.'
      );
    const search = Object.entries(config.variables).find(
      ([, binding]) => binding.ownership === 'consumer' && binding.parameter === page.searchParameter
    );
    let used = false;
    const filters = collection?.node.arguments?.find(a => a.name.value === 'filters');
    if (filters && search)
      visit(filters, {
        Variable(node) {
          if (node.name.value === search[0]) used = true;
        },
      });
    if (!search || !scalar(search[0], 'String') || !used)
      lookupIssue(
        'LOOKUP_SEARCH_BINDING',
        'graphql.lookup.searchParameter',
        'Bind a String consumer search parameter used by the collection filters.'
      );
  }
  for (const [key, allowed] of [
    ['oid', ['ID', 'String', 'Int']],
    ['title', ['String']],
  ] as const) {
    const values = mapped.get(key);
    if (
      !values?.length ||
      values.some(
        v =>
          !v.guaranteed ||
          !isScalarType(getNamedType(v.type)) ||
          !allowed.some(name => name === getNamedType(v.type).name) ||
          isListType(unwrap(v.type))
      )
    )
      lookupIssue(
        'LOOKUP_MAPPING',
        `graphql.mappings.${key}`,
        'Lookup use requires selected scalar identifier and string label paths on every item variant.'
      );
  }
  return result({ definition: structuredClone(input), operation, types });
}

/** Trusted scope is supplied separately; saved definitions/parameters cannot choose it. */
export async function inspectGraphqlNamedQuery(
  input: unknown,
  caller: ReadCaller | undefined,
  brandId: string
): Promise<ReturnType<typeof validateGraphqlNamedQuery>> {
  if (
    !caller?.user?.username ||
    !caller.brand?.id ||
    String(caller.brand.id) !== String(brandId) ||
    !caller.portal ||
    !Array.isArray(caller.roles)
  )
    return {
      validation: {
        source: 'graphql',
        valid: false,
        diagnostics: [
          graphqlDiagnostic(
            'GRAPHQL_CONTEXT_REQUIRED',
            'definition',
            'Authenticated caller, brand, portal and effective roles are required for GraphQL validation.'
          ),
        ],
      },
    };
  try {
    return validateGraphqlNamedQuery(input, await RecordGraphqlService.getReadSchema(caller));
  } catch {
    return {
      validation: {
        source: 'graphql',
        valid: false,
        diagnostics: [
          graphqlDiagnostic(
            'GRAPHQL_SCHEMA_UNAVAILABLE',
            'graphql.document',
            'The current read schema is unavailable; retry validation after configuration is repaired.'
          ),
        ],
      },
    };
  }
}

/** queryName/start/rows are established REST transport fields, never variable bindings.
 * Transport values are validated by their adapter; no identity/scope fields are allowed.
 */
export function bindGraphqlNamedQuery(
  prepared: ValidatedGraphqlNamedQuery,
  parameters: Record<string, unknown>,
  transport = true
): Record<string, unknown> {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
    throw new GraphqlNamedQueryInputError('parameters');
  try {
    checkDraftBudget(parameters);
    if (boundedJsonBytes(parameters, QUERY_LIMITS.bytes) > QUERY_LIMITS.bytes) throw new Error('bound');
  } catch {
    throw new GraphqlNamedQueryInputError('parameters');
  }
  const config = prepared.definition.graphql;
  const declared = new Set(
    Object.values(config.variables).flatMap(v => (v.ownership === 'consumer' ? [v.parameter] : []))
  );
  for (const key of Object.keys(parameters))
    if (!declared.has(key) && !(transport && ['queryName', 'start', 'rows'].includes(key)))
      throw new GraphqlNamedQueryInputError('parameters');
  for (const key of ['queryName', 'start', 'rows'])
    if (
      Object.hasOwn(parameters, key) &&
      (key === 'queryName'
        ? typeof parameters[key] !== 'string'
        : !['string', 'number'].includes(typeof parameters[key]))
    )
      throw new GraphqlNamedQueryInputError('parameters');
  const values: Record<string, unknown> = Object.create(null);
  for (const [name, binding] of Object.entries(config.variables)) {
    const type = prepared.types.get(name)!;
    if (binding.ownership === 'fixed')
      values[name] = convertGraphqlInput(type, binding.value, `graphql.variables.${name}`, true);
    else if (binding.ownership === 'consumer') {
      if (Object.hasOwn(parameters, binding.parameter))
        values[name] = convertGraphqlInput(type, parameters[binding.parameter], `parameters.${binding.parameter}`);
      else if (Object.hasOwn(binding, 'defaultValue'))
        values[name] = convertGraphqlInput(type, binding.defaultValue, `parameters.${binding.parameter}`);
      else if (
        isNonNullType(type) &&
        !prepared.operation.variableDefinitions?.find(v => v.variable.name.value === name)?.defaultValue
      )
        throw new GraphqlNamedQueryInputError(`parameters.${binding.parameter}`);
    }
  }
  if (
    Buffer.byteLength(
      JSON.stringify({ query: config.document, operationName: config.operationName, variables: values })
    ) > QUERY_LIMITS.bytes
  )
    throw new GraphqlNamedQueryInputError('parameters');
  return values;
}

/** Own properties only. Missing stays undefined, explicit null stays null. */
export function graphqlPath(value: unknown, path: NamedQueryPath): unknown {
  if (path.some(part => !safeSegment(part))) throw new GraphqlNamedQueryInputError('mapping');
  for (const part of path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, part))
      return undefined;
    value = Reflect.get(value, part);
  }
  return value;
}
