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
import type { ContractNode, RecordContract } from '../record-contract/types';

export type ReadShape =
  | { readonly kind: 'string' | 'number' | 'integer' | 'boolean' }
  | { readonly kind: 'object'; readonly properties: Readonly<Record<string, ReadShape>> }
  | { readonly kind: 'array'; readonly items: ReadShape }
  | { readonly kind: 'json'; readonly reason: string };

export function hash(value: string): string {
  return createHash('sha256').update(value, 'utf16le').digest('hex');
}

/** Reserve rb_ so encoded names cannot collide with unchanged names. */
export function fieldName(name: string): string {
  return /^[_A-Za-z][_0-9A-Za-z]*$/.test(name) && !name.startsWith('__') && !name.startsWith('rb_')
    ? name
    : `rb_${Buffer.from(name, 'utf16le').toString('hex')}`;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(left: ReadShape, right: ReadShape): ReadShape {
  if (left.kind === 'object' && right.kind === 'object') {
    const properties = { ...left.properties };
    for (const [key, shape] of Object.entries(right.properties)) {
      Object.defineProperty(properties, key, {
        value: Object.hasOwn(properties, key) ? merge(properties[key], shape) : shape,
        enumerable: true,
        configurable: true,
      });
    }
    return { kind: 'object', properties };
  }
  if (left.kind === 'array' && right.kind === 'array') return { kind: 'array', items: merge(left.items, right.items) };
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

export interface WorkBudget {
  readonly consumeUnits: (count: number) => void;
  readonly consumeBytes: (count: number) => void;
}

/** Validate opaque regions before Yoga serializes them, with the same request budget. */
function boundedJson(value: unknown, budget: WorkBudget, ancestors = new Set<object>()): unknown {
  budget.consumeUnits(1);
  if (ancestors.size > 64)
    throw new GraphQLError('Stored JSON exceeds the depth bound.', { extensions: { code: 'QUERY_LIMIT' } });
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.consumeBytes(Buffer.byteLength(value));
    return value;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : historicalValueError();
  if (!isObject(value) && !Array.isArray(value)) return historicalValueError();
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return historicalValueError();
  if (ancestors.has(value)) return historicalValueError();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 1_000)
        throw new GraphQLError('Stored list exceeds the item bound.', { extensions: { code: 'QUERY_LIMIT' } });
      return value.map(item => boundedJson(item, budget, ancestors));
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable) continue;
      budget.consumeBytes(Buffer.byteLength(key));
      if (!('value' in descriptor)) return historicalValueError();
      result[key] = boundedJson(descriptor.value, budget, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function checkValue(shape: ReadShape, value: unknown, budget: WorkBudget): unknown {
  budget.consumeUnits(1);
  if (value === undefined || value === null) return null;
  if (shape.kind === 'json') {
    return boundedJson(value, budget);
  }
  if (shape.kind === 'object') return isObject(value) ? value : historicalValueError();
  if (shape.kind === 'array') {
    if (!Array.isArray(value)) return historicalValueError();
    if (value.length > 1_000)
      throw new GraphQLError('Stored list exceeds the item bound.', { extensions: { code: 'QUERY_LIMIT' } });
    // GraphQL completes each promise at its list index, preserving nullable
    // siblings and reporting historical errors at the item rather than the field.
    return value.map(async item => checkValue(shape.items, item, budget));
  }
  const valid =
    shape.kind === 'integer'
      ? typeof value === 'number' && Number.isSafeInteger(value)
      : shape.kind === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === shape.kind;
  if (valid && typeof value === 'string') budget.consumeBytes(Buffer.byteLength(value));
  return valid ? value : historicalValueError();
}

export function metadataTypeName(contract: RecordContract): string {
  const context = contract.context;
  return `M_${fieldName(context.recordType).slice(0, 40)}_${fieldName(context.workflowStep).slice(0, 40)}_${hash(
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
                    // JSON quoting keeps descriptions valid SDL even for stored
                    // keys containing control characters or lone surrogates.
                    description: `Stored metadata pointer (JSON string): ${JSON.stringify(childPointer)}`,
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
  if (!(type instanceof GraphQLObjectType)) {
    return {
      type: new GraphQLObjectType({
        name,
        fields: {
          value: {
            type: JsonScalar,
            description: 'Opaque metadata for a form with no declared fields.',
            resolve: (source: unknown, _args, context: WorkBudget) => boundedJson(source, context),
          },
        },
      }),
      coverage: coverage(shape),
      mappings,
    };
  }
  return { type, coverage: coverage(shape), mappings };
}
