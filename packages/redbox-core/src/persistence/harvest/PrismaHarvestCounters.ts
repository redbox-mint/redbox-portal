import { prismaModelRow } from '../prisma/modelRow';
import { MongoParamRef } from '@prisma/orm-mongo/value';
import { MONGO_OBJECTID_CODEC_ID } from '@prisma/orm-mongo/target/codec-ids';
import type { CorePrismaClient } from '../prisma/client';
import type { HarvestRepositories, HarvestRunRow } from './HarvestRepositories';
import {
  MongoAggFieldRef as Ref,
  MongoAggLiteral as Lit,
  MongoAggOperator as Op,
  MongoAggCond as Cond,
} from '@prisma/orm-mongo/query-ast';
import { prismaCommand } from '../prisma/documents';
import { harvestId } from './physical';
import { missingRunCounters } from './atomicCounters';
import { HarvestRunStatus } from '../../model/storage/HarvestRunModel';

type Counters = Pick<HarvestRepositories['runs'], 'completeChunkCounters' | 'incrementDuplicateChunks'>;
/** Typed pipeline keeps all totals/status atomic and coalesces historical missing/null counters. */
export function prismaHarvestCounters(client: CorePrismaClient): Counters {
  const runs = client.query.from('harvestrun');
  const add = (field: string, amount: number) => Op.add(Op.of('$ifNull', [Ref.of(field), Lit.of(0)]), Lit.of(amount));
  return {
    async completeChunkCounters(run, counters, finalChunk, completedAt) {
      const failed = add('failed', counters.failed);
      const fields = {
        lastChunkAt: Lit.of(completedAt),
        totalProcessed: add('totalProcessed', counters.totalProcessed),
        created: add('created', counters.created),
        updated: add('updated', counters.updated),
        deleted: add('deleted', counters.deleted),
        unchanged: add('unchanged', counters.unchanged),
        failed,
        chunksProcessed: add('chunksProcessed', 1),
        ...(finalChunk
          ? {
              completedAt: Lit.of(completedAt),
              status: Cond.of(
                Op.of('$gt', [failed, Lit.of(0)]),
                Lit.of(HarvestRunStatus.completedWithErrors),
                Lit.of(HarvestRunStatus.completed)
              ),
            }
          : counters.failed > 0
            ? {
                status: Cond.of(
                  Op.of('$eq', [Ref.of('status'), Lit.of(HarvestRunStatus.completed)]),
                  Lit.of(HarvestRunStatus.completedWithErrors),
                  Ref.of('status')
                ),
              }
            : {}),
      };
      const row = await prismaCommand<Record<string, unknown> | null>(
        client,
        runs
          .match(f =>
            f._id.eq(new MongoParamRef(harvestId(run.id).toHexString(), { codecId: MONGO_OBJECTID_CODEC_ID }))
          )
          .findOneAndUpdate(f => [f.stage.set(fields)])
      );
      return prismaModelRow<HarvestRunRow>(row ?? null) ?? missingRunCounters(run, counters, completedAt, finalChunk);
    },
    async incrementDuplicateChunks(run, completedAt = new Date().toISOString()) {
      const row = await prismaCommand<Record<string, unknown> | null>(
        client,
        runs
          .match(f =>
            f._id.eq(new MongoParamRef(harvestId(run.id).toHexString(), { codecId: MONGO_OBJECTID_CODEC_ID }))
          )
          .findOneAndUpdate(f => [
            f.stage.set({ duplicateChunks: add('duplicateChunks', 1), lastChunkAt: Lit.of(completedAt) }),
          ])
      );
      return (
        prismaModelRow<HarvestRunRow>(row ?? null) ?? {
          ...run,
          duplicateChunks: Number(run.duplicateChunks ?? 0) + 1,
          lastChunkAt: completedAt,
        }
      );
    },
  };
}
