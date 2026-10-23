import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import type { MongoQueryPlan } from '@prisma/orm-mongo/query-ast';
import { createCorePrismaClient, type CorePrismaClient } from '../../src/persistence/prisma/client';
import { prismaVocabularyRepositories } from '../../src/persistence/vocabulary/PrismaVocabularyRepositories';

// Keep the real query builder: the runtime returns only the database aggregate result.
function fixture(result: object[]) {
  const client = createCorePrismaClient(new MongoClient('mongodb://192.0.2.1/unit'), 'unit');
  const plans: MongoQueryPlan[] = [];
  const repositories = prismaVocabularyRepositories(
    {
      query: client.query,
      runtime: async () => ({
        query(plan: MongoQueryPlan) {
          plans.push(plan);
          return { toArray: async () => result };
        },
      }),
    } as unknown as CorePrismaClient,
    async () => null
  );
  return { repositories, plans };
}

describe('Vocabulary database counts', () => {
  it('returns the database total for every vocabulary collection without fetching model rows', async () => {
    const { repositories, plans } = fixture([{ total: 12345 }]);
    for (const count of [
      repositories.countVocabularies,
      repositories.countEntries,
      repositories.countSources,
      repositories.countCategories,
      repositories.countCrosswalks,
      repositories.countMappings,
      repositories.countRuns,
    ])
      assert.equal(await count({}), 12345);
    assert.equal(plans.length, 7);
    assert(plans.every(plan => plan.command.kind === 'aggregate'));
  });

  it('returns zero when the database count has no matching rows', async () => {
    const { repositories } = fixture([]);
    assert.equal(await repositories.countEntries({ vocabulary: '507f1f77bcf86cd799439011' }), 0);
  });
});
