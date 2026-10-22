import { ObjectId, BSONRegExp } from 'mongodb';
import { MongoAndExpr, MongoOrExpr, MongoExistsExpr, MongoFieldFilter } from '@prisma/orm-mongo/query-ast';
import type { MongoFilterExpr } from '@prisma/orm-mongo/query-ast';
import { MongoParamRef } from '@prisma/orm-mongo/value';
import { MONGO_OBJECTID_CODEC_ID } from '@prisma/orm-mongo/target/codec-ids';
import { PersistenceError } from '../errors';

/** Internal translation of already-validated repository predicates into model field expressions. */
export function prismaModelFilter(
  where: Record<string, unknown>,
  objectIdFields: readonly string[] = []
): MongoFilterExpr {
  const operand = (value: unknown): unknown =>
    value instanceof ObjectId ? value.toHexString() : Array.isArray(value) ? value.map(operand) : value;
  // The model API adds field codecs; the typed query builder requires explicit
  // parameter codecs for ObjectId fields. Callers supply only declared roots.
  const parameter = (field: string, value: unknown) =>
    new MongoParamRef(
      operand(value),
      objectIdFields.includes(field) ? { codecId: MONGO_OBJECTID_CODEC_ID } : undefined
    );
  const terms: MongoFilterExpr[] = [];
  for (const [field, value] of Object.entries(where)) {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value))
        throw new PersistenceError('scalar-validation', 'Invalid internal compound predicate.');
      const children = value.map(child => prismaModelFilter(child, objectIdFields));
      if (children.length) terms.push(field === '$and' ? MongoAndExpr.of(children) : MongoOrExpr.of(children));
    } else if (value instanceof RegExp) {
      terms.push(MongoFieldFilter.of(field, '$regex', new MongoParamRef(value)));
    } else if (
      value &&
      typeof value === 'object' &&
      !(value instanceof ObjectId) &&
      !Array.isArray(value) &&
      Object.keys(value).some(key => key.startsWith('$'))
    ) {
      if ('$regex' in value) {
        terms.push(
          MongoFieldFilter.of(
            field,
            '$regex',
            new MongoParamRef(
              new BSONRegExp(String(Reflect.get(value, '$regex')), String(Reflect.get(value, '$options') ?? ''))
            )
          )
        );
      }
      for (const [op, bound] of Object.entries(value)) {
        if (op === '$regex') continue;
        if (op === '$options' && '$regex' in value) continue;
        if (op === '$exists') terms.push(bound ? MongoExistsExpr.exists(field) : MongoExistsExpr.notExists(field));
        else if (['$eq', '$ne', '$in', '$nin', '$gt', '$gte', '$lt', '$lte', '$type'].includes(op))
          terms.push(
            MongoFieldFilter.of(
              field,
              op,
              (op === '$in' || op === '$nin') && Array.isArray(bound)
                ? bound.map(value => parameter(field, value))
                : parameter(field, bound)
            )
          );
        else throw new PersistenceError('scalar-validation', 'Unsupported internal model predicate.');
      }
    } else terms.push(MongoFieldFilter.eq(field, parameter(field, value)));
  }
  return terms.length ? MongoAndExpr.of(terms) : MongoExistsExpr.exists('_id');
}
