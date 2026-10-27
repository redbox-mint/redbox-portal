import type { CollationOptions } from 'mongodb';
import type { JsonValue, LogicalDatastore } from './types';
import { mongoDatabase, prismaDatabase, persistenceOperation } from './runtime';
import { PersistenceError } from './errors';
import type { CorePrismaClient, StoragePrismaClient } from './prisma/client';

/** Operator-owned, collection-scoped intent. No driver options escape this boundary. */
export interface PersistenceIndex {
  datastore: LogicalDatastore;
  collection: string;
  name: string;
  keys: Readonly<Record<string, 1 | -1>>;
  unique?: boolean;
  sparse?: boolean;
  hidden?: boolean;
  partialFilter?: { [key: string]: JsonValue };
  expireAfterSeconds?: number;
  collation?: CollationOptions;
}
export interface PersistenceIndexInspection {
  datastore: LogicalDatastore;
  collection: string;
  name: string;
  index: 'ready' | 'missing' | 'conflicting';
  duplicateKeyGroups?: number;
}
function ordered(value: unknown): string {
  return JSON.stringify(value);
}
// Predicate fields and operator dictionaries are unordered. Equality operands
// remain BSON literals, where embedded-document field order can change matches.
// Compound index keys are compared separately, with their declaration order.
function canonicalPredicates(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, condition]) => {
        if ((key === '$and' || key === '$or') && Array.isArray(condition))
          return [key, condition.map(canonicalPredicates)];
        if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
          const operators = Object.entries(condition);
          if (operators.length && operators.every(([operator]) => operator.startsWith('$')))
            condition = Object.fromEntries(operators.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
        }
        return [key, condition];
      })
  );
}

/** Inspection never performs DDL or repairs data. Descriptor order defines compound keys. */
export function inspectPersistenceIndex(
  app: Sails.Application,
  descriptor: PersistenceIndex
): Promise<PersistenceIndexInspection> {
  return persistenceOperation(app, async () => {
    if (
      !descriptor.collection ||
      !descriptor.name ||
      !Object.keys(descriptor.keys).length ||
      Object.values(descriptor.keys).some(value => value !== 1 && value !== -1)
    )
      throw new PersistenceError(
        'configuration',
        'An index descriptor requires an explicit collection, name and ordered keys.'
      );
    const db = await mongoDatabase(app, descriptor.datastore);
    const control: typeof import('@prisma/orm-mongo/adapter/control') = require('@prisma/orm-mongo/adapter/control');
    const commands: typeof import('@prisma/orm-mongo/query-ast/control') = require('@prisma/orm-mongo/query-ast/control');
    const inspection = new control.MongoInspectionExecutor(db);
    const info = (await inspection.listCollections(new commands.ListCollectionsCommand())).find(
      row => row.name === descriptor.collection
    );
    const indexes = info ? await inspection.listIndexes(new commands.ListIndexesCommand(descriptor.collection)) : [];
    const relevant = indexes.filter(
      index => index.name === descriptor.name || ordered(index.key) === ordered(descriptor.keys)
    );
    const compatible = (index: (typeof indexes)[number]): boolean =>
      ordered(index.key) === ordered(descriptor.keys) &&
      Boolean(index.unique) === Boolean(descriptor.unique) &&
      Boolean(index.sparse) === Boolean(descriptor.sparse) &&
      Boolean(index.hidden) === Boolean(descriptor.hidden) &&
      ordered(canonicalPredicates(index.partialFilterExpression)) ===
        ordered(canonicalPredicates(descriptor.partialFilter)) &&
      index.expireAfterSeconds === descriptor.expireAfterSeconds &&
      (index.collation?.locale ?? info?.options?.collation?.locale ?? 'simple') ===
        (descriptor.collation?.locale ?? 'simple') &&
      (descriptor.collation?.locale === undefined ||
        descriptor.collation.locale === 'simple' ||
        Object.entries({
          strength: 3,
          caseLevel: false,
          numericOrdering: false,
          normalization: false,
          backwards: false,
          caseFirst: 'off',
          alternate: 'non-ignorable',
          maxVariable: 'punct',
        }).every(
          ([option, defaultValue]) =>
            (index.collation?.[option] ?? defaultValue) ===
            (Reflect.get(descriptor.collation ?? {}, option) ?? defaultValue)
        ));
    const status: PersistenceIndexInspection['index'] = relevant.some(index => !compatible(index))
      ? 'conflicting'
      : relevant.some(compatible)
        ? 'ready'
        : 'missing';
    // Plain full unique keys only: partial/sparse/expression semantics need an
    // operation-specific audit rather than an incorrect generic duplicate count.
    let duplicates: number | undefined;
    if (descriptor.unique && !descriptor.sparse && !descriptor.partialFilter) {
      // A non-sparse unique key indexes a missing component as null. Grouping
      // raw field paths would distinguish missing from an explicit BSON null.
      const group = Object.fromEntries(
        Object.keys(descriptor.keys).map((key, index) => [`k${index}`, { $ifNull: [`$${key}`, null] }])
      );
      let result: { groups: number } | undefined | null;
      {
        const pipeline = [
          { $group: { _id: group, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $count: 'groups' },
        ];
        if (descriptor.datastore === 'redboxStorage') {
          const client = await prismaDatabase(app, 'redboxStorage');
          const plan = client.raw
            .collection(descriptor.collection as keyof StoragePrismaClient['orm'])
            .aggregate<{ groups: number }>(pipeline)
            .build();
          result = (await (await client.runtime()).query(plan).toArray())[0];
        } else {
          const client = await prismaDatabase(app, 'mongodb');
          const plan = client.raw
            .collection(descriptor.collection as keyof CorePrismaClient['orm'])
            .aggregate<{ groups: number }>(pipeline)
            .build();
          result = (await (await client.runtime()).query(plan).toArray())[0];
        }
      }
      duplicates = result?.groups ?? 0;
    }
    return {
      datastore: descriptor.datastore,
      collection: descriptor.collection,
      name: descriptor.name,
      index: status,
      ...(duplicates !== undefined ? { duplicateKeyGroups: duplicates } : {}),
    };
  }).catch((error: unknown) => {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError(
      'index-inspection',
      'Scoped persistence index inspection failed. Review datastore availability and inspection permissions.'
    );
  });
}

export function requirePersistenceIndex(report: PersistenceIndexInspection): void {
  if (report.index !== 'ready' || (report.duplicateKeyGroups ?? 0) > 0)
    throw new PersistenceError(
      'index-readiness',
      'Required persistence index is not ready. Run npm run persistence:indexes -- --inspect, review scoped index definitions/duplicates, then explicitly run npm run persistence:indexes -- --ensure with writers stopped. Startup never repairs data. See support/wiki/Persistence-Index-Preparation.md.'
    );
}

/** Explicit deployment action. Never drops indexes, deletes rows or runs at startup. */
export async function ensurePersistenceIndex(
  app: Sails.Application,
  descriptor: PersistenceIndex
): Promise<PersistenceIndexInspection> {
  const before = await inspectPersistenceIndex(app, descriptor);
  if (before.index === 'conflicting' || (before.duplicateKeyGroups ?? 0) > 0) requirePersistenceIndex(before);
  if (before.index === 'missing')
    await persistenceOperation(app, async () => {
      const db = await mongoDatabase(app, descriptor.datastore);
      try {
        const options = {
          name: descriptor.name,
          ...(descriptor.unique !== undefined ? { unique: descriptor.unique } : {}),
          ...(descriptor.sparse !== undefined ? { sparse: descriptor.sparse } : {}),
          ...(descriptor.hidden !== undefined ? { hidden: descriptor.hidden } : {}),
          ...(descriptor.partialFilter !== undefined ? { partialFilterExpression: descriptor.partialFilter } : {}),
          ...(descriptor.expireAfterSeconds !== undefined ? { expireAfterSeconds: descriptor.expireAfterSeconds } : {}),
          collation: descriptor.collation ?? { locale: 'simple' },
        };
        // Prisma RC19's CreateIndexCommand drops hidden. Keep this native DDL
        // escape scoped to explicit maintenance, on the same owned connection.
        if (descriptor.hidden !== undefined) {
          await db.collection(descriptor.collection).createIndex(descriptor.keys, options);
        } else {
          const {
            MongoControlAdapterImpl,
          }: typeof import('@prisma/orm-mongo/adapter/control') = require('@prisma/orm-mongo/adapter/control');
          const { MongoDriverImpl }: typeof import('@prisma/orm-mongo/driver') = require('@prisma/orm-mongo/driver');
          const {
            CreateIndexCommand,
          }: typeof import('@prisma/orm-mongo/query-ast/control') = require('@prisma/orm-mongo/query-ast/control');
          await new MongoControlAdapterImpl().executeDdl(
            MongoDriverImpl.fromDb(db),
            new CreateIndexCommand(
              descriptor.collection,
              Object.entries(descriptor.keys).map(([field, direction]) => ({ field, direction })),
              options
            )
          );
        }
      } catch {
        throw new PersistenceError(
          'index-creation',
          'Scoped persistence index creation failed. Reinspect concurrent writes, definitions and permissions.'
        );
      }
    });
  const after = await inspectPersistenceIndex(app, descriptor);
  requirePersistenceIndex(after);
  return after;
}
