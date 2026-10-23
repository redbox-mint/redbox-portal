import { prismaModelRow } from '../prisma/modelRow';
import { coercePersistenceScalar, persistenceQueryFields, persistenceStringBounds } from '../scalars';
import { legacyModelPage } from '../pagination';
import type { CorePrismaClient } from '../prisma/client';
import { prismaModelValues } from '../prisma/modelValues';
import { prismaModelFilter } from '../prisma/modelFilter';
import { prismaCommand } from '../prisma/documents';
import { prismaHarvestCounters } from './PrismaHarvestCounters';
import type {
  HarvestRepositories,
  HarvestRunRow,
  HarvestChunkRow,
  HarvestEventRow,
  HarvestRunFilter,
} from './HarvestRepositories';
import { encodeHarvest, harvestId as id, harvestOperation } from './physical';

export function prismaHarvestRepositories(client: CorePrismaClient): HarvestRepositories {
  const runs = client.orm.harvestrun,
    chunks = client.orm.harvestrunchunk,
    events = client.orm.harvestrecordevent;
  const runFilter = (filter: HarvestRunFilter): Record<string, unknown> => {
    const { startedAt, ...dimensions } = filter;
    return {
      ...persistenceQueryFields(dimensions),
      ...(startedAt === undefined ? {} : { startedAt: persistenceStringBounds(startedAt) }),
    };
  };
  const counters = prismaHarvestCounters(client);
  return {
    runs: {
      findRun: lookup =>
        harvestOperation(async () => {
          const { id: identity, ...dimensions } = lookup;
          return prismaModelRow<HarvestRunRow>(
            await runs
              .where(
                prismaModelFilter({
                  ...persistenceQueryFields(dimensions),
                  ...(identity === undefined ? {} : { _id: id(identity) }),
                })
              )
              .first()
          );
        }),
      createRun: values =>
        harvestOperation(async () => {
          return prismaModelRow<HarvestRunRow>(
            await runs.create(prismaModelValues(encodeHarvest('harvestrun', values)))
          )!;
        }),
      listRuns: (filter, skip, limit) =>
        harvestOperation(async () => {
          const page = legacyModelPage(skip, limit);
          const where = runFilter(filter);
          if (page.limit === 0) return [];
          let cursor = runs.where(prismaModelFilter(where)).orderBy({ startedAt: -1 }).offset(page.skip);
          if (page.limit !== undefined) cursor = cursor.limit(page.limit);
          return (await cursor.all().toArray()).map(row => prismaModelRow<HarvestRunRow>(row)!);
        }),
      countRuns: filter =>
        harvestOperation(
          async () =>
            (
              await prismaCommand<{ total: number } | undefined>(
                client,
                client.query
                  .from('harvestrun')
                  .match(prismaModelFilter(runFilter(filter)))
                  .count('total')
                  .build()
              )
            )?.total ?? 0
        ),
      completeChunkCounters: (...args) => harvestOperation(() => counters.completeChunkCounters(...args)),
      incrementDuplicateChunks: (...args) => harvestOperation(() => counters.incrementDuplicateChunks(...args)),
      removeRun: identity =>
        harvestOperation(async () => {
          await runs.where({ _id: id(identity).toHexString() }).delete();
        }),
    },
    chunks: {
      findAttempts: (runId, contentHash) =>
        harvestOperation(async () =>
          (
            await chunks
              .where(prismaModelFilter(persistenceQueryFields({ runId, contentHash })))
              .orderBy({ attempt: -1 })
              .all()
              .toArray()
          ).map(row => prismaModelRow<HarvestChunkRow>(row)!)
        ),
      listForRun: (runId, brandId, limit) =>
        harvestOperation(async () => {
          const page = legacyModelPage(0, limit);
          if (page.limit === 0) return [];
          let cursor = chunks
            .where(prismaModelFilter(persistenceQueryFields({ runId, brandId })))
            .orderBy({ submittedAt: 1 });
          if (page.limit !== undefined) cursor = cursor.limit(page.limit);
          return (await cursor.all().toArray()).map(row => prismaModelRow<HarvestChunkRow>(row)!);
        }),
      createAttempt: values =>
        harvestOperation(async () => {
          return prismaModelRow<HarvestChunkRow>(
            await chunks.create(prismaModelValues(encodeHarvest('harvestrunchunk', values)))
          )!;
        }),
      reviseAttempt: (identity, values) =>
        harvestOperation(async () =>
          prismaModelRow<HarvestChunkRow>(
            await chunks
              .where({ _id: id(identity).toHexString() })
              .update(prismaModelValues(encodeHarvest('harvestrunchunk', values, true)))
          )
        ),
      removeForRun: runId =>
        harvestOperation(async () => {
          await chunks.where(prismaModelFilter(persistenceQueryFields({ runId }))).deleteAndCount();
        }),
    },
    events: {
      appendEvents: values =>
        harvestOperation(async () => {
          if (values.length) {
            const now = new Date().toISOString();
            await events
              .createAll(values.map(value => prismaModelValues(encodeHarvest('harvestrecordevent', value, false, now))))
              .toArray();
          }
        }),
      listCheckpointed: (runId, brandId, chunkIds) =>
        harvestOperation(async () =>
          (
            await events
              .where(
                prismaModelFilter({
                  ...persistenceQueryFields({ runId, brandId }),
                  chunkId: {
                    $in: chunkIds
                      .filter(value => value !== undefined)
                      .map(value => coercePersistenceScalar(value, 'string')),
                  },
                })
              )
              .orderBy({ createdAt: 1 })
              .all()
              .toArray()
          ).map(row => prismaModelRow<HarvestEventRow>(row)!)
        ),
      listEvents: (filter, skip, limit, ascending = false) =>
        harvestOperation(async () => {
          const page = legacyModelPage(skip, limit);
          if (page.limit === 0) return [];
          let cursor = events
            .where(prismaModelFilter(persistenceQueryFields(filter)))
            .orderBy({ createdAt: ascending ? 1 : -1 })
            .offset(page.skip);
          if (page.limit !== undefined) cursor = cursor.limit(page.limit);
          return (await cursor.all().toArray()).map(row => prismaModelRow<HarvestEventRow>(row)!);
        }),
      countEvents: filter =>
        harvestOperation(
          async () =>
            (
              await prismaCommand<{ total: number } | undefined>(
                client,
                client.query
                  .from('harvestrecordevent')
                  .match(prismaModelFilter(persistenceQueryFields(filter)))
                  .count('total')
                  .build()
              )
            )?.total ?? 0
        ),
      removeForRun: runId =>
        harvestOperation(async () => {
          await events.where(prismaModelFilter(persistenceQueryFields({ runId }))).deleteAndCount();
        }),
    },
  };
}
