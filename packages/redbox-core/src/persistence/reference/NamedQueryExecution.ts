import { getReferenceRepositories } from '../runtime';
import { PersistenceError } from '../errors';
import { coercePersistenceScalar, coercePersistenceQueryScalar } from '../scalars';
import type { DefinitionValues } from './ReferenceRepositories';

export interface NamedQueryTargetMetadata {
  name: string;
  scope: { type: 'field'; fieldPath: string } | { type: 'userRoles'; fieldPath: '' };
}
export interface NamedQueryRequest {
  target: string;
  tenant: string;
  expression: DefinitionValues;
  start: number;
  rows?: number;
  sort?: Array<Record<string, 'ASC' | 'DESC'>>;
  select?: readonly string[];
}
export interface NamedQueryPage {
  records: DefinitionValues[];
  total: number;
}
/** Institution implementations own their tenant/access enforcement, counts and physical mapping. */
export interface InstitutionNamedQueryTarget {
  metadata: NamedQueryTargetMetadata;
  execute(request: Readonly<NamedQueryRequest>): Promise<NamedQueryPage>;
}
const registrations = new WeakMap<Sails.Application, Map<string, InstitutionNamedQueryTarget>>();
// Closed core catalogue. No model/attribute discovery determines supported targets.
const brandTargets = [
  'appconfig',
  'asynchprogress',
  'brandingconfighistory',
  'counter',
  'dashboardconfiguration',
  'dashboardtype',
  'vocabulary',
  'figsharevocabularysource',
  'figsharevocabularycrosswalk',
  'figsharevocabularysyncrun',
  'form',
  'i18nbundle',
  'i18ntranslation',
  'namedquery',
  'role',
  'pathrule',
  'recordtype',
  'report',
  'workspacetype',
];
const coreTargets: readonly NamedQueryTargetMetadata[] = [
  { name: 'record', scope: { type: 'field', fieldPath: 'metaMetadata.brandId' } },
  { name: 'user', scope: { type: 'userRoles', fieldPath: '' } },
  ...brandTargets.map(name => ({ name, scope: { type: 'field' as const, fieldPath: 'branding' } })),
];
function refusal(): never {
  throw new PersistenceError(
    'named-query-compatibility',
    'Unsupported named-query target or expression. Review the stored data and migrate institution extensions before startup; for unmigrated hooks; inventory the stored definition and register an explicit tenant-scoped named-query target or migrate the expression. See p3-r-operations.md.'
  );
}
export function registerNamedQueryTarget(app: Sails.Application, target: InstitutionNamedQueryTarget): void {
  if (!target.metadata.name || coreTargets.some(entry => entry.name === target.metadata.name)) refusal();
  if (target.metadata.scope.type !== 'field' || !validPath(target.metadata.scope.fieldPath)) refusal();
  let targets = registrations.get(app);
  if (!targets) {
    targets = new Map();
    registrations.set(app, targets);
  }
  if (targets.has(target.metadata.name)) refusal();
  targets.set(target.metadata.name, {
    metadata: structuredClone(target.metadata),
    execute: target.execute.bind(target),
  });
}
export function namedQueryTarget(app: Sails.Application, name: string): NamedQueryTargetMetadata {
  const target = coreTargets.find(entry => entry.name === name) ?? registrations.get(app)?.get(name)?.metadata;
  if (!target) refusal();
  return structuredClone(target);
}
function validPath(path: string): boolean {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    path
      .split('.')
      .every(part => /^[A-Za-z0-9_-]+$/.test(part) && !['__proto__', 'prototype', 'constructor'].includes(part))
  );
}
export function assertNamedQueryPath(path: string): void {
  if (!validPath(path)) refusal();
}
/** Validate paths against a concrete adapter's qualified fields, including deep JSON targets. */
export function namedQueryFieldType(field: string, fields: Readonly<Record<string, { type: string }>>): string {
  const root = field.split('.')[0];
  const type =
    root === 'id' ? 'id' : (fields[root]?.type ?? (['createdAt', 'updatedAt'].includes(root) ? 'string' : undefined));
  if (!type || (field !== root && type !== 'json')) refusal();
  return field === root ? type : 'json';
}
const isObject = (value: unknown): value is DefinitionValues =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const operators: Record<string, string> = {
  '>': '$gt',
  '>=': '$gte',
  '<': '$lt',
  '<=': '$lte',
  '!=': '$ne',
  in: '$in',
  nin: '$nin',
  $eq: '$eq',
  $ne: '$ne',
  $in: '$in',
  $nin: '$nin',
  $gt: '$gt',
  $gte: '$gte',
  $lt: '$lt',
  $lte: '$lte',
};
const reverse: Record<string, string> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $nin: 'nin',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};
const textOperators = ['contains', 'startsWith', 'endsWith'];
function overlappingPredicates(): never {
  throw new PersistenceError(
    'named-query-compatibility',
    'Named-query predicates overlap after normalization. Put independent conditions in explicit and/or branches instead of combining aliases or text modifiers on one field.'
  );
}

/** Private comparison codec; readiness pins field types to the loaded model contract. */
export function namedQueryScalar(value: unknown, type = 'json'): unknown {
  // The concrete adapter has encoded associations, but their operators must
  // still follow Waterline's null/membership rules before BSON passes through.
  const scalar = (input: unknown): unknown => (type === 'id' ? input : coercePersistenceQueryScalar(input, type));
  if (isObject(value)) {
    // These are the three generated empty text modifiers. Validate the field
    // type first, then omit only the no-op modifier, preserving its siblings.
    const emptyText = typeof value.$regex === 'string' && ['', '^', '$'].includes(value.$regex);
    return Object.fromEntries(
      Object.entries(value)
        .map(([operator, operand]) => {
          if (operator === '$regex' || operator === '$options') {
            if (type === 'number' || type === 'boolean') refusal();
            return [operator, operand];
          }
          if (['$gt', '$gte', '$lt', '$lte'].includes(operator) && (type === 'boolean' || operand === null)) refusal();
          if (operator === '$in' || operator === '$nin') {
            if (!Array.isArray(operand) || operand.includes(null)) refusal();
            return [operator, operand.filter(item => item !== undefined).map(scalar)];
          }
          return [operator, scalar(operand)];
        })
        .filter(([operator]) => !(emptyText && (operator === '$regex' || operator === '$options')))
    );
  }
  return scalar(value);
}
/** Validates the existing stored dialect; unsupported operators are never dropped. */
export function namedQueryCriteria(
  expression: DefinitionValues,
  native: boolean | 'record',
  preserveEquality = false
): DefinitionValues {
  if (!isObject(expression)) refusal();
  const result: DefinitionValues = {};
  const textConjuncts: DefinitionValues[] = [];
  function visit(input: DefinitionValues, prefix = ''): void {
    for (const [key, value] of Object.entries(input)) {
      if (['and', 'or', '$and', '$or'].includes(key)) {
        if (prefix || !Array.isArray(value) || !value.length) refusal();
        const logical = native ? '$' + key.replace('$', '') : key.replace('$', '');
        if (Object.hasOwn(result, logical)) overlappingPredicates();
        result[logical] = value.map(branch => namedQueryCriteria(branch as DefinitionValues, native, preserveEquality));
        continue;
      }
      const field = prefix ? `${prefix}.${key}` : key;
      if (!validPath(field)) refusal();
      if (Object.hasOwn(result, field)) overlappingPredicates();
      if (isObject(value)) {
        const keys = Object.keys(value);
        const operatorObject = keys.some(
          operator =>
            operator.startsWith('$') ||
            Object.hasOwn(operators, operator) ||
            textOperators.includes(operator) ||
            ['like', 'not'].includes(operator)
        );
        if (!operatorObject && keys.length) {
          visit(value, field);
          continue;
        }
        if (!keys.length) refusal(); // object equality was historically flattened/ambiguous; require an explicit expression.
        const mapped: DefinitionValues = {};
        const seen = new Set<string>();
        const multipleTextModifiers = keys.filter(operator => textOperators.includes(operator)).length > 1;
        for (const [operator, suppliedOperand] of Object.entries(value)) {
          let operand = suppliedOperand;
          const canonicalOperator = operators[operator] ?? operator;
          if (seen.has(canonicalOperator)) overlappingPredicates();
          seen.add(canonicalOperator);
          if (keys.includes('$regex') && textOperators.includes(operator)) overlappingPredicates();
          if (Object.hasOwn(operators, operator)) {
            const canonical =
              !native && operators[operator] === '$ne' && Array.isArray(operand) ? '$nin' : operators[operator];
            if ((canonical === '$in' || canonical === '$nin') && !Array.isArray(operand)) refusal();
            if (canonical === '$eq' && keys.length > 1) refusal();
            if (!native && canonical === '$eq' && !preserveEquality) {
              if (operand !== null && typeof operand === 'object')
                throw new PersistenceError(
                  'named-query-compatibility',
                  'This stored-query dialect cannot represent structured equality here. Rewrite the stored predicate with explicit equality before execution.'
                );
              result[field] = operand;
              continue;
            }
            mapped[native || canonical === '$eq' ? canonical : reverse[canonical]] = operand;
          } else if (textOperators.includes(operator)) {
            if (!native) operand = coercePersistenceScalar(operand, 'string');
            if (typeof operand !== 'string') refusal();
            if (native) {
              const escaped = operand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const predicate = {
                $regex: (operator === 'startsWith' ? '^' : '') + escaped + (operator === 'endsWith' ? '$' : ''),
                $options: 'i',
              };
              // Waterline intersects every modifier. Mongo has one $regex slot
              // per field, so keep each text constraint in its own conjunct.
              if (multipleTextModifiers) textConjuncts.push({ [field]: predicate });
              else Object.assign(mapped, predicate);
            } else mapped[operator] = operand;
          } else if (native && ['$regex', '$options', '$exists'].includes(operator)) {
            if (operator === '$regex' && typeof operand !== 'string') refusal();
            if (operator === '$options' && (typeof operand !== 'string' || !/^[imsx]*$/.test(operand))) refusal();
            if (operator === '$exists' && typeof operand !== 'boolean') refusal();
            mapped[operator] = operand;
          } else refusal();
        }
        if (Object.keys(mapped).length) result[field] = mapped;
      } else {
        if (
          typeof value === 'function' ||
          value === undefined ||
          (!native && value !== null && typeof value === 'object' && !Array.isArray(value))
        )
          refusal();
        // Native record predicates retain Mongo array equality. The migrated
        // model targets use Waterline's shorthand array membership instead.
        result[field] = native === true && Array.isArray(value) ? { $in: value } : value;
      }
    }
  }
  visit(expression);
  if (textConjuncts.length)
    result.$and = [...((result.$and as DefinitionValues[] | undefined) ?? []), ...textConjuncts];
  return result;
}

export async function executeNamedQuery(
  app: Sails.Application,
  request: NamedQueryRequest,
  count = true
): Promise<NamedQueryPage> {
  const metadata = namedQueryTarget(app, request.target);
  if (['form', 'recordtype', 'dashboardtype', 'report', 'namedquery', 'workspacetype'].includes(request.target))
    getReferenceRepositories(app);
  if (
    !request.tenant ||
    !Number.isSafeInteger(request.start) ||
    request.start < 0 ||
    (request.rows !== undefined && (!Number.isSafeInteger(request.rows) || request.rows <= 0))
  )
    refusal();
  const sortedFields = new Set<string>();
  for (const entry of request.sort ?? []) {
    if (!isObject(entry) || (request.target !== 'record' && Object.keys(entry).length !== 1)) refusal();
    for (const [field, order] of Object.entries(entry))
      if (!validPath(field) || !['ASC', 'DESC'].includes(order) || sortedFields.has(field)) refusal();
      else sortedFields.add(field);
  }
  for (const field of request.select ?? []) if (!validPath(field)) refusal();
  const custom = registrations.get(app)?.get(request.target);
  // Flatten nested/dotted aliases before assigning scope. Otherwise a later
  // nested alias can overwrite the mandatory tenant predicate during translation.
  // Preserve explicit equality until the selected target translates it. In
  // particular, JSON object/array equality must not become nested filters/in.
  const expression = namedQueryCriteria(
    structuredClone(request.expression),
    request.target === 'record' ? 'record' : false,
    true
  );
  // Scope is mandatory for the primary target AND every related-filter target.
  if (metadata.scope.type === 'field') expression[metadata.scope.fieldPath] = request.tenant;
  if (custom) return custom.execute(Object.freeze({ ...request, expression }));
  if (['user', 'role', 'pathrule', 'record', 'counter'].includes(request.target)) refusal();
  const { executePrismaNamedQuery } =
    require('./PrismaNamedQueryTargets') as typeof import('./PrismaNamedQueryTargets');
  return executePrismaNamedQuery(app, { ...request, expression }, count);
}
