import { persistenceQueryFields } from '../scalars';
import { assertPersistencePage } from '../pagination';
import type { CorePrismaClient } from '../prisma/client';
import { prismaModelValues } from '../prisma/modelValues';
import { prismaModelFilter } from '../prisma/modelFilter';
import type { ProgressRepositories, ProgressRow, ProgressQuery, WorkspaceStatus } from './ProgressRepositories';
import { progressId as id, encodeProgress, decodeProgress, progressOperation, progressFields } from './physical';
import { namedQueryCriteria, namedQueryScalar, namedQueryFieldType } from '../reference/NamedQueryExecution';
import { PersistenceError } from '../errors';

/** Private translation of the existing progress-screen dialect. */
export function progressCriteria(criteria: ProgressQuery): Record<string, unknown> {
  // Validate the loaded-query dialect before generating private native predicates.
  const validated = namedQueryCriteria(criteria, false, true);
  const translate = (where: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(where)
        .map(([field, value]) => {
          if (field === '$and' || field === '$or') return [field, (value as Record<string, unknown>[]).map(translate)];
          if (field === 'id' || field === 'branding') {
            const convert = (value: unknown) => (value === null ? null : id(value));
            value =
              value && typeof value === 'object' && !Array.isArray(value)
                ? Object.fromEntries(
                    Object.entries(value).map(([op, v]) => [op, Array.isArray(v) ? v.map(convert) : convert(v)])
                  )
                : convert(value);
          }
          value = namedQueryScalar(value, namedQueryFieldType(field, progressFields.asynchprogress));
          if (value && typeof value === 'object' && Object.hasOwn(value, '$regex'))
            value = Object.fromEntries(Object.entries(value).filter(([op]) => op !== '$options'));
          return [field === 'id' ? '_id' : field, value];
        })
        .filter(
          ([, value]) =>
            !(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
        )
    );
  return translate(namedQueryCriteria(validated, true));
}
/** Validate the write envelope before extracting where; no write option may be discarded. */
function progressWriteCriteria(criteria: ProgressQuery): Record<string, unknown> {
  const clauses = ['where', 'limit', 'skip', 'sort', 'select', 'omit'];
  const invalid = (): never => {
    throw new PersistenceError(
      'E_INVALID_CRITERIA',
      'Progress writes require criteria without pagination, ordering or projection clauses. Put predicates inside where or use a direct predicate.'
    );
  };
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) invalid();
  if (clauses.slice(1).some(key => criteria[key] !== undefined)) invalid();
  const wrapped = Object.keys(criteria).some(key => clauses.includes(key));
  if (wrapped && Object.entries(criteria).some(([key, value]) => !clauses.includes(key) && value !== undefined))
    invalid();
  let where: unknown = wrapped ? criteria.where : criteria;
  if (where === null || where === undefined) where = {};
  if (Array.isArray(where) || typeof where === 'string' || typeof where === 'number') where = { id: where };
  return progressCriteria(where as ProgressQuery);
}
export function prismaProgressRepositories(client: CorePrismaClient): ProgressRepositories {
  const progress = client.orm.asynchprogress,
    workspace = client.orm.workspaceasync;
  return {
    progress: {
      startProgress: values =>
        progressOperation(async () => {
          return decodeProgress<ProgressRow>(
            'asynchprogress',
            await progress.create(prismaModelValues(encodeProgress('asynchprogress', values))),
            true
          )!;
        }),
      listProgress: criteria =>
        progressOperation(async () => {
          const { where, sort, skip, limit, ...direct } = criteria;
          if (
            Object.hasOwn(criteria, 'select') ||
            Object.hasOwn(criteria, 'omit') ||
            (where !== undefined && Object.keys(direct).length)
          )
            throw new PersistenceError(
              'progress-query',
              'Unsupported progress query option. Use where, sort, skip and limit.'
            );
          if (where !== undefined && (!where || typeof where !== 'object' || Array.isArray(where)))
            throw new PersistenceError('progress-query', 'Progress where must be a plain expression.');
          let cursor = progress.where(prismaModelFilter(progressCriteria((where ?? direct) as ProgressQuery)));
          if (sort !== undefined) {
            const entries = typeof sort === 'string' ? [sort] : Array.isArray(sort) ? sort : [sort];
            const order: Record<string, 1 | -1> = {};
            for (const entry of entries) {
              if (
                typeof entry !== 'string' &&
                (!entry ||
                  typeof entry !== 'object' ||
                  Array.isArray(entry) ||
                  ![Object.prototype, null].includes(Object.getPrototypeOf(entry)))
              )
                throw new PersistenceError(
                  'progress-query',
                  'Progress ordering requires string or plain object terms.'
                );
              const terms = typeof entry === 'string' ? [entry.trim().split(/\s+/)] : Object.entries(entry);
              if (terms.length > 1 || terms.some(term => term.length > 2))
                throw new PersistenceError('progress-query', 'Progress ordering requires one attribute per term.');
              for (const [field, direction = 'ASC'] of terms) {
                namedQueryFieldType(field, progressFields.asynchprogress);
                const canonicalDirection = typeof direction === 'string' ? direction.toUpperCase() : direction;
                if (
                  !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field) ||
                  Object.hasOwn(order, field === 'id' ? '_id' : field) ||
                  !(
                    canonicalDirection === 'ASC' ||
                    canonicalDirection === 'DESC' ||
                    canonicalDirection === 1 ||
                    canonicalDirection === -1
                  )
                )
                  throw new PersistenceError('progress-query', 'Unsupported progress ordering.');
                order[field === 'id' ? '_id' : field] =
                  canonicalDirection === 'DESC' || canonicalDirection === -1 ? -1 : 1;
              }
            }
            cursor = cursor.orderBy(order);
          }
          assertPersistencePage(
            [skip, limit].filter(value => value !== undefined),
            'progress-query'
          );
          if (skip !== undefined) cursor = cursor.offset(Number(skip));
          if (limit === 0) return [];
          if (limit !== undefined) cursor = cursor.limit(Number(limit));
          return (await cursor.all().toArray()).map(row => decodeProgress<ProgressRow>('asynchprogress', row, true)!);
        }),
      reviseProgress: (criteria, values) =>
        progressOperation(async () => {
          const where = prismaModelFilter(progressWriteCriteria(criteria));
          const patch = prismaModelValues(encodeProgress('asynchprogress', values, true));
          // Model updateAll captures IDs, writes, then reads. Apply the original predicate
          // per document so an intervening state change cannot be overwritten.
          const ids = await progress.where(where).select('_id').all().toArray();
          const result: ProgressRow[] = [];
          for (const row of ids) {
            const updated = await progress.where(where).where({ _id: row._id }).update(patch);
            if (updated) result.push(decodeProgress<ProgressRow>('asynchprogress', updated, true)!);
          }
          return result;
        }),
      removeProgress: criteria =>
        progressOperation(async () => {
          await progress.where(prismaModelFilter(progressWriteCriteria(criteria))).deleteAndCount();
        }),
    },
    workspaces: {
      registerWork: values =>
        progressOperation(async () => {
          return decodeProgress<WorkspaceStatus>(
            'workspaceasync',
            await workspace.create(prismaModelValues(encodeProgress('workspaceasync', values))),
            true
          )!;
        }),
      reviseStatus: (identity, values) =>
        progressOperation(async () => {
          const row = await workspace
            .where({ _id: id(identity).toHexString() })
            .update(prismaModelValues(encodeProgress('workspaceasync', values, true)));
          return row ? [decodeProgress<WorkspaceStatus>('workspaceasync', row, true)!] : [];
        }),
      listStatus: (status, recordType) =>
        progressOperation(async () =>
          (
            await workspace
              .where(prismaModelFilter(persistenceQueryFields({ status, recordType })))
              .all()
              .toArray()
          ).map(row => decodeProgress<WorkspaceStatus>('workspaceasync', row, true)!)
        ),
      removeWork: identity =>
        progressOperation(async () => {
          await workspace.where({ _id: id(identity).toHexString() }).delete();
        }),
    },
  };
}
