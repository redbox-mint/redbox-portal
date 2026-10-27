import { PersistenceError } from '../errors';
import { prismaCommand } from '../prisma/documents';
import { prismaModelFilter } from '../prisma/modelFilter';
import {
  MongoAndExpr,
  MongoExprFilter,
  MongoAggOperator as Op,
  MongoAggFieldRef as Ref,
  MongoAggLiteral as Lit,
} from '@prisma/orm-mongo/query-ast';
import { prismaDatabase } from '../runtime';
import type { PersistenceIndex } from '../indexes';

import { persistenceIndexPreflight } from '../indexPreflight';

export const figshareIndexes: readonly PersistenceIndex[] = [
  {
    datastore: 'mongodb',
    collection: 'figsharesync',
    name: 'oid_1',
    keys: {
      oid: 1,
    },
    unique: true,
  },
  {
    datastore: 'mongodb',
    collection: 'figsharesync',
    name: 'namespace_1_articleId_1',
    keys: {
      namespace: 1,
      articleId: 1,
    },
    unique: true,
    partialFilter: {
      articleId: {
        $type: 'string',
      },
      namespace: {
        $type: 'string',
      },
    },
  },
  {
    datastore: 'mongodb',
    collection: 'figsharesync',
    name: 'nextActionAt_1_dispatchUntil_1',
    keys: {
      nextActionAt: 1,
      dispatchUntil: 1,
    },
  },
];
const preflight = persistenceIndexPreflight({
  collections: { mongodb: ['figsharesync'] },
  indexes: figshareIndexes,
  audit: async (app, reports) => {
    // The qualified binding protocol stores scalar strings. Mongo partial
    // $type predicates also match arrays; refuse those shapes instead of
    // presenting an incorrect scalar duplicate audit or creating multikey DDL.
    const client = await prismaDatabase(app, 'mongodb');
    const multikey = await prismaCommand<{ total: number } | undefined>(
      client,
      client.query
        .from('figsharesync')
        .match(
          MongoAndExpr.of([
            prismaModelFilter({ articleId: { $type: 'string' }, namespace: { $type: 'string' } }),
            MongoExprFilter.of(
              Op.of(
                '$or',
                ['articleId', 'namespace'].map(field => Op.of('$eq', [Op.of('$type', Ref.of(field)), Lit.of('array')]))
              )
            ),
          ])
        )
        .limit(1)
        .count('total')
        .build()
    );
    if (multikey?.total)
      throw new PersistenceError(
        'model-mapping',
        'Figshare binding index contains unsupported array keys. Review the stored data and migrate institution extensions before startup; inventory the native values; npm run persistence:indexes -- --inspect never repairs them.'
      );

    // Partial-index grouping is outside model CRUD; audited Prisma raw duplicate inspection only.
    const partial = await prismaCommand<{ groups: number } | undefined>(
      client,
      client.raw
        .collection('figsharesync')
        .aggregate<{ groups: number }>([
          { $match: { articleId: { $type: 'string' }, namespace: { $type: 'string' } } },
          { $group: { _id: { namespace: '$namespace', articleId: '$articleId' }, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $count: 'groups' },
        ])
        .build()
    );
    reports.find(report => report.name === 'namespace_1_articleId_1')!.duplicateKeyGroups = partial?.groups ?? 0;
  },
});
export const inspectFigsharePersistence = preflight.inspect;
export const ensureFigsharePersistenceIndexes = preflight.ensure;
