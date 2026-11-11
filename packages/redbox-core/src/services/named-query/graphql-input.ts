import { isEnumType, isInputObjectType, isListType, isNonNullType, isScalarType, type GraphQLInputType } from 'graphql';

/** No coercion errors may echo the input (including custom scalar exceptions). */
export class GraphqlNamedQueryInputError extends Error {
  readonly code = 'INVALID_GRAPHQL_PARAMETER';
  constructor(readonly field: string) {
    super('Invalid GraphQL named query parameter.');
  }
}

const numeric = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const integer = /^-?(?:0|[1-9][0-9]*)$/;
const ownObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [null, Object.prototype].includes(Object.getPrototypeOf(value));
export const safeSegment = (part: string): boolean =>
  part.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(part);

/** Consumer values deliberately support only the editor's built-in scalars/enums.
 * New custom scalars require an explicit editor contract; fixed values use parseValue.
 */
export function consumerInput(type: GraphQLInputType): boolean {
  if (isNonNullType(type) || isListType(type)) return consumerInput(type.ofType);
  return isEnumType(type) || (isScalarType(type) && ['Int', 'Float', 'Boolean', 'String', 'ID'].includes(type.name));
}

export function convertGraphqlInput(type: GraphQLInputType, value: unknown, field: string, fixed = false): unknown {
  const fail = (): never => {
    throw new GraphqlNamedQueryInputError(field);
  };
  if (isNonNullType(type)) {
    if (value === null || value === undefined) return fail();
    return convertGraphqlInput(type.ofType, value, field, fixed);
  }
  if (value === null) return null;
  if (value === undefined) return fail();
  if (isListType(type)) {
    if (!Array.isArray(value)) return fail();
    return Array.from(value, item => convertGraphqlInput(type.ofType, item, field, fixed));
  }
  if (isInputObjectType(type)) {
    if (!fixed || !ownObject(value)) return fail();
    const fields = type.getFields();
    if (Object.keys(value).some(key => !safeSegment(key) || !Object.hasOwn(fields, key))) return fail();
    const converted: Record<string, unknown> = Object.create(null);
    for (const [key, definition] of Object.entries(fields)) {
      if (Object.hasOwn(value, key)) converted[key] = convertGraphqlInput(definition.type, value[key], field, true);
      else if (definition.defaultValue === undefined && isNonNullType(definition.type)) return fail();
      // Leave omitted fields omitted: GraphQL applies input-field defaults once at execution.
    }
    return converted;
  }
  if (isEnumType(type)) {
    if (typeof value !== 'string' || !type.getValues().some(item => item.name === value)) return fail();
    return value; // Keep external enum spelling; Yoga performs the one enum parse.
  }
  if (!isScalarType(type)) return fail();
  let converted = value;
  if (type.name === 'Int' || type.name === 'Float') {
    if (typeof value === 'string') {
      if (!(type.name === 'Int' ? integer : numeric).test(value)) return fail();
      converted = Number(value);
    }
    if (typeof converted !== 'number' || !Number.isFinite(converted)) return fail();
    if (type.name === 'Int' && (!Number.isInteger(converted) || converted < -2147483648 || converted > 2147483647))
      return fail();
  } else if (type.name === 'Boolean' && typeof value === 'string') {
    if (value !== 'true' && value !== 'false') return fail();
    converted = value === 'true';
  } else if (!fixed && !consumerInput(type)) return fail();
  try {
    if (type.parseValue(converted) === undefined) return fail();
  } catch {
    return fail();
  }
  // Preserve the external value, not parseValue's internal representation (ID/enum/custom).
  return converted;
}
