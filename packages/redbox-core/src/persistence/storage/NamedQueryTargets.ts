import { projectNamedQueryRecords } from '../reference/projection';
import type { NamedQueryRequest, NamedQueryPage } from '../reference/NamedQueryExecution';
import { namedQueryCriteria, namedQueryFieldType, namedQueryScalar } from '../reference/NamedQueryExecution';
import type { DefinitionValues } from '../reference/ReferenceRepositories';
import { persistenceObjectId } from '../mongodb/identity';
import { ObjectId } from 'mongodb';
import { prismaDatabase, persistenceOperation } from '../runtime';
import { getStorageRepositories } from './runtime';
import { prismaModelFilter } from '../prisma/modelFilter';
import { PersistenceError } from '../errors';
import {
  MongoProjectStage,
  MongoAggFieldRef as Ref,
  MongoAggLiteral as Lit,
  MongoAggOperator as Op,
} from '@prisma/orm-mongo/query-ast';
import { recordFields } from '../prisma/storage-contract';

const counterFields = {
  name: { type: 'string' },
  branding: { type: 'id' },
  value: { type: 'number' },
};

/** Counter retains the Waterline model dialect; Record retains its native Mongo dialect. */
function counterCriteria(criteria: DefinitionValues): DefinitionValues {
  return Object.fromEntries(
    Object.entries(criteria)
      .map(([field, supplied]) => {
        if (field === '$and' || field === '$or') return [field, (supplied as DefinitionValues[]).map(counterCriteria)];
        const type = namedQueryFieldType(field, counterFields);
        let value = supplied;
        if (type === 'id') {
          const convert = (item: unknown): unknown =>
            item === null || item instanceof ObjectId ? item : persistenceObjectId(item, true);
          value =
            value && typeof value === 'object' && !(value instanceof ObjectId) && !Array.isArray(value)
              ? Object.fromEntries(
                  Object.entries(value).map(([operator, operand]) => [
                    operator,
                    Array.isArray(operand) ? operand.map(convert) : convert(operand),
                  ])
                )
              : convert(value);
        }
        value = namedQueryScalar(value, type);
        // Only Counter's generated text modifiers lose the case-insensitive flag.
        // Public Counter requests reject native regex/options before reaching here.
        if (value && typeof value === 'object' && Object.hasOwn(value, '$regex'))
          value = Object.fromEntries(Object.entries(value).filter(([operator]) => operator !== '$options'));
        return [field === 'id' ? '_id' : field, value];
      })
      .filter(([, value]) => !(value && typeof value === 'object' && Object.keys(value).length === 0))
  );
}

/** Model predicates/counts and typed projection preserve the stored-query dialect.
 * The typed inclusion stage retains nested-array projection and physical absence,
 * which the model's root-only select/decoded optional fields cannot express.
 */
export async function executeStorageQuery(
  app: Sails.Application,
  request: NamedQueryRequest,
  count: boolean
): Promise<NamedQueryPage> {
  if (!['record', 'counter'].includes(request.target))
    throw new PersistenceError('named-query-compatibility', 'Unsupported storage named-query target.');
  getStorageRepositories(app);
  const where = namedQueryCriteria(request.expression, request.target === 'record' ? 'record' : true);
  const sort: Record<string, 1 | -1> = Object.assign(
    {},
    ...(request.sort ?? []).map(entry =>
      Object.fromEntries(Object.entries(entry).map(([field, order]) => [field, order === 'DESC' ? -1 : 1]))
    )
  );
  if (request.target === 'record') {
    const refuse = () => {
      throw new PersistenceError(
        'named-query-compatibility',
        'Record named queries use redboxOid for identity filters, projections and ordering. Mongo id/_id access needs an explicit storage-owned query target with ID normalization; migrate the stored definition before execution.'
      );
    };
    const check = (value: Record<string, unknown>) => {
      for (const [key, item] of Object.entries(value)) {
        if (['id', '_id'].includes(key.split('.')[0])) refuse();
        if ((key === '$and' || key === '$or') && Array.isArray(item)) item.forEach(check);
      }
    };
    check(where);
    if ([...(request.select ?? []), ...Object.keys(sort)].some(field => ['id', '_id'].includes(field.split('.')[0])))
      refuse();
    const fields = Object.keys(recordFields);
    for (const path of request.select ?? [])
      if (!fields.includes(path.split('.')[0]))
        throw new PersistenceError(
          'named-query-compatibility',
          'Declare record extension fields before querying them.'
        );
    const client = await prismaDatabase(app, 'redboxStorage');
    return persistenceOperation(app, async () => {
      const runtime = await client.runtime();
      const filtered = client.query.from('record').match(prismaModelFilter(where, ['_id']));
      const total = count ? Number((await runtime.query(filtered.count('total').build()).toArray())[0]?.total ?? 0) : 0;
      const sorted = Object.keys(sort).length ? filtered.sort(sort) : filtered;
      const skipped = request.start ? sorted.skip(request.start) : sorted;
      const bounded = request.rows ? skipped.limit(request.rows) : skipped;
      const plan = bounded
        .pipe(new MongoProjectStage(Object.fromEntries((request.select ?? fields).map(field => [field, 1]))))
        .project(f => ({
          _id: f._id,
          record: {
            node: Op.of('$unsetField', { field: Lit.of('_id'), input: Ref.of('$ROOT') }),
            _field: { codecId: 'mongo/json@1', nullable: false },
          },
        }))
        .build();
      const records =
        count && !total
          ? []
          : (await runtime.query(plan).toArray()).map(row => {
              const document: unknown = row.record;
              if (!document || typeof document !== 'object' || Array.isArray(document))
                throw new PersistenceError('storage-codec', 'Record query returned an invalid document.');
              return { ...document, _id: row._id };
            });
      return { total, records };
    });
  }
  for (const entry of request.sort ?? [])
    for (const field of Object.keys(entry)) namedQueryFieldType(field, counterFields);
  for (const field of request.select ?? []) namedQueryFieldType(field, counterFields);
  const counterWhere = counterCriteria(where);
  const counterSort = Object.fromEntries(
    Object.entries(sort).map(([field, order]) => [field === 'id' ? '_id' : field, order])
  );
  const client = await prismaDatabase(app, 'mongodb');
  return persistenceOperation(app, async () => {
    let query = client.orm.counter.where(prismaModelFilter(counterWhere));
    if (Object.keys(counterSort).length) query = query.orderBy(counterSort);
    const plan = client.query
      .from('counter')
      .match(prismaModelFilter(counterWhere, ['_id', 'branding']))
      .count('total')
      .build();
    const total = count ? ((await (await client.runtime()).query(plan).toArray())[0]?.total ?? 0) : 0;
    if (count && request.start) query = query.offset(request.start);
    if (count && request.rows) query = query.limit(request.rows);
    const records = (await query.all().toArray()).map(({ _id, ...row }) => ({ ...row, id: _id }));
    return { total, records: projectNamedQueryRecords(records, request.select) };
  });
}
