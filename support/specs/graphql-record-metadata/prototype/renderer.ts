import { createHash } from 'node:crypto';
import {
  GraphQLError,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLList,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLString,
  type GraphQLOutputType,
} from 'graphql';
import type { RecordJsonSchema } from '../../../../packages/redbox-core/src/record-contract/json-schema-renderer';
import type { ContractNode, RecordContract } from '../../../../packages/redbox-core/src/record-contract/types';

export type ReadShape =
  | { readonly kind: 'string' | 'number' | 'integer' | 'boolean' }
  | { readonly kind: 'object'; readonly properties: Readonly<Record<string, ReadShape>> }
  | { readonly kind: 'array'; readonly items: ReadShape }
  | { readonly kind: 'json'; readonly reason: string };

export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/** Reserve rb_ so encoded names cannot collide with unchanged names. */
export function fieldName(name: string): string {
  return /^[_A-Za-z][_0-9A-Za-z]*$/.test(name) && !name.startsWith('__') && !name.startsWith('rb_')
    ? name
    : `rb_${Buffer.from(name, 'utf8').toString('hex')}`;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(left: ReadShape, right: ReadShape, overlay = false): ReadShape {
  if (overlay && left.kind === 'json' && ['unconstrained', 'empty-object'].includes(left.reason)) return right;
  if (left.kind === 'object' && right.kind === 'object') {
    const properties = { ...left.properties };
    for (const [key, shape] of Object.entries(right.properties)) {
      Object.defineProperty(properties, key, {
        value: Object.hasOwn(properties, key) ? merge(properties[key], shape, overlay) : shape,
        enumerable: true,
        configurable: true,
      });
    }
    return { kind: 'object', properties };
  }
  if (left.kind === 'array' && right.kind === 'array')
    return { kind: 'array', items: merge(left.items, right.items, overlay) };
  return left.kind === right.kind ? left : { kind: 'json', reason: 'incompatible-conditional-shapes' };
}

export function fromTree(node: ContractNode): ReadShape {
  switch (node.kind) {
    case 'scalar':
      return { kind: node.scalarType };
    case 'object':
      if (Object.keys(node.properties).length === 0) return { kind: 'json', reason: 'empty-object' };
      return {
        kind: 'object',
        properties: Object.fromEntries(Object.entries(node.properties).map(([key, child]) => [key, fromTree(child)])),
      };
    case 'array':
      return { kind: 'array', items: fromTree(node.items) };
    case 'conditional': {
      const then = fromTree(node.thenNode);
      return node.elseNode ? merge(then, fromTree(node.elseNode)) : then;
    }
    case 'any':
      return { kind: 'json', reason: node.reason ?? 'unconstrained' };
  }
}

/** Only the vocabulary emitted by ReDBox, not a general JSON Schema converter. */
export function fromJsonSchema(
  schema: RecordJsonSchema,
  definitions: Readonly<Record<string, RecordJsonSchema>> = {},
  activeRefs: ReadonlySet<string> = new Set()
): ReadShape {
  if (schema.$ref) {
    const prefix = '#/$defs/';
    if (!schema.$ref.startsWith(prefix) || activeRefs.has(schema.$ref)) {
      return { kind: 'json', reason: 'unsupported-reference' };
    }
    const key = decodeURIComponent(schema.$ref.slice(prefix.length)).replace(/~1/g, '/').replace(/~0/g, '~');
    const target = definitions[key];
    return target
      ? fromJsonSchema(target, definitions, new Set([...activeRefs, schema.$ref]))
      : { kind: 'json', reason: 'missing-reference' };
  }
  if (schema.anyOf) {
    const branches = schema.anyOf.filter(branch => branch.type !== 'null');
    return branches.length === 1
      ? fromJsonSchema(branches[0], definitions, activeRefs)
      : { kind: 'json', reason: 'unsupported-union' };
  }
  if (schema.oneOf || schema.patternProperties || schema.prefixItems)
    return { kind: 'json', reason: 'unsupported-schema-shape' };
  const types = typeof schema.type === 'string' ? [schema.type] : (schema.type ?? []).filter(type => type !== 'null');
  let shape: ReadShape;
  if (types.length > 1) return { kind: 'json', reason: 'unsupported-union' };
  const primaryType = types[0] ?? (schema.items ? 'array' : undefined);
  switch (primaryType) {
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
      shape = { kind: primaryType };
      break;
    case 'array':
      shape = { kind: 'array', items: fromJsonSchema(schema.items ?? {}, definitions, activeRefs) };
      break;
    default:
      shape =
        schema.properties || types[0] === 'object'
          ? {
              kind: 'object',
              properties: Object.fromEntries(
                Object.entries(schema.properties ?? {}).map(([key, child]) => [
                  key,
                  fromJsonSchema(child, definitions, activeRefs),
                ])
              ),
            }
          : { kind: 'json', reason: 'unconstrained' };
      if (shape.kind === 'object' && Object.keys(shape.properties).length === 0)
        shape = { kind: 'json', reason: 'empty-object' };
  }
  // ReDBox lifts conditions to an enclosing object. Recover output fields from
  // both branches, ignoring the write-validation predicate for read purposes.
  for (const conditional of schema.allOf ?? []) {
    for (const branch of [conditional.then, conditional.else]) {
      if (branch) shape = merge(shape, fromJsonSchema(branch, definitions, activeRefs), true);
    }
  }
  return shape;
}

export interface CoverageEntry {
  readonly pointer: string;
  readonly kind: ReadShape['kind'];
  readonly reason?: string;
}

function pointerChild(pointer: string, key: string): string {
  return `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

export function coverage(shape: ReadShape, pointer = ''): CoverageEntry[] {
  const entries: CoverageEntry[] = [
    { pointer, kind: shape.kind, ...(shape.kind === 'json' ? { reason: shape.reason } : {}) },
  ];
  if (shape.kind === 'object') {
    for (const key of Object.keys(shape.properties).sort())
      entries.push(...coverage(shape.properties[key], pointerChild(pointer, key)));
  } else if (shape.kind === 'array') {
    entries.push(...coverage(shape.items, `${pointer}/*`));
  }
  return entries;
}

function historicalValueError(): never {
  throw new GraphQLError('Stored value does not match the current field type.', {
    extensions: { code: 'HISTORICAL_VALUE_TYPE' },
  });
}

export const JsonScalar = new GraphQLScalarType({
  name: 'MetadataJSON',
  description: 'An opaque stored JSON region. Its children cannot be selected as typed fields.',
  serialize: value => value,
});

const IntegerScalar = new GraphQLScalarType({
  name: 'MetadataInteger',
  description: 'A JSON safe integer, including values outside GraphQL Int’s signed 32-bit range.',
  serialize: value => (typeof value === 'number' && Number.isSafeInteger(value) ? value : historicalValueError()),
});

interface WorkBudget {
  readonly consumeUnits: (count: number) => void;
}

function checkValue(shape: ReadShape, value: unknown, budget: WorkBudget): unknown {
  budget.consumeUnits(1);
  if (value === undefined || value === null) return null;
  if (shape.kind === 'json') {
    if (Buffer.byteLength(JSON.stringify(value)) > 262_144)
      throw new GraphQLError('Stored JSON exceeds the response bound.', { extensions: { code: 'QUERY_LIMIT' } });
    return value;
  }
  if (shape.kind === 'object') return isObject(value) ? value : historicalValueError();
  if (shape.kind === 'array') {
    if (!Array.isArray(value)) return historicalValueError();
    if (value.length > 1_000)
      throw new GraphQLError('Stored list exceeds the item bound.', { extensions: { code: 'QUERY_LIMIT' } });
    return value.map(item => checkValue(shape.items, item, budget));
  }
  const valid =
    shape.kind === 'integer'
      ? typeof value === 'number' && Number.isSafeInteger(value)
      : shape.kind === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === shape.kind;
  return valid ? value : historicalValueError();
}

export function metadataTypeName(contract: RecordContract): string {
  const context = contract.context;
  return `M_${fieldName(context.recordType)}_${fieldName(context.workflowStep)}_${hash(
    JSON.stringify([context.brand, context.portal, context.recordType, context.workflowStep, context.form])
  )}`;
}

export interface RenderedMetadata {
  readonly type: GraphQLObjectType;
  readonly coverage: readonly CoverageEntry[];
  readonly mappings: readonly { pointer: string; name: string }[];
}

export function renderMetadata(shape: ReadShape, name: string): RenderedMetadata {
  const mappings: { pointer: string; name: string }[] = [];
  const render = (node: ReadShape, pointer: string): GraphQLOutputType => {
    switch (node.kind) {
      case 'string':
        return GraphQLString;
      case 'number':
        return GraphQLFloat;
      case 'integer':
        return IntegerScalar;
      case 'boolean':
        return GraphQLBoolean;
      case 'json':
        return JsonScalar;
      case 'array':
        return new GraphQLList(render(node.items, `${pointer}/*`));
      case 'object': {
        if (Object.keys(node.properties).length === 0) return JsonScalar;
        return new GraphQLObjectType({
          name: pointer ? `${name}_O_${hash(pointer)}` : name,
          fields: Object.fromEntries(
            Object.keys(node.properties)
              .sort()
              .map(key => {
                const child = node.properties[key];
                const childPointer = pointerChild(pointer, key);
                const mapped = fieldName(key);
                mappings.push({ pointer: childPointer, name: mapped });
                return [
                  mapped,
                  {
                    type: render(child, childPointer),
                    description: `Stored metadata pointer: ${childPointer}`,
                    resolve: (source: unknown, _args, context: WorkBudget) =>
                      checkValue(child, isObject(source) && Object.hasOwn(source, key) ? source[key] : null, context),
                  },
                ];
              })
          ),
        });
      }
    }
  };
  const type = render(shape, '');
  if (!(type instanceof GraphQLObjectType)) throw new Error('Metadata needs at least one declared root field.');
  return { type, coverage: coverage(shape), mappings };
}
