import type { Db, Document, Filter } from 'mongodb';
import type { HarvestHistoryRetentionConfig } from '../config/harvestRuns.config';

export interface HarvestHistoryRetentionOptions {
  dryRun?: boolean;
}

export interface HarvestHistoryRetentionResult {
  enabled: boolean;
  dryRun: boolean;
  runs: number;
  events: number;
  chunks: number;
  successfulCutoff: string;
  failedCutoff: string;
}

/** Retain run summaries; remove expired detail in bounded, retryable batches. */
export async function pruneHarvestHistory(
  db: Db,
  config: HarvestHistoryRetentionConfig,
  options: HarvestHistoryRetentionOptions = {},
  heartbeat?: () => Promise<unknown>,
  now = new Date()
): Promise<HarvestHistoryRetentionResult> {
  if (options.dryRun !== undefined && typeof options.dryRun !== 'boolean') {
    throw new Error('Harvest retention dryRun must be a boolean.');
  }
  for (const key of ['successfulDays', 'failedDays', 'batchSize'] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 1) {
      throw new Error(`harvestRuns.retention.${key} must be a positive integer.`);
    }
  }
  if (config.failedDays < config.successfulDays || config.batchSize > 10_000) {
    throw new Error('Harvest retention requires failedDays >= successfulDays and batchSize <= 10000.');
  }
  if (typeof config.enabled !== 'boolean' || !Number.isFinite(now.getTime())) {
    throw new Error('Invalid harvest retention enabled flag or clock.');
  }
  const successfulCutoff = new Date(now.getTime() - config.successfulDays * 86_400_000).toISOString();
  const failedCutoff = new Date(now.getTime() - config.failedDays * 86_400_000).toISOString();
  const result: HarvestHistoryRetentionResult = {
    enabled: config.enabled,
    dryRun: options.dryRun === true,
    runs: 0,
    events: 0,
    chunks: 0,
    successfulCutoff,
    failedCutoff,
  };
  if (!config.enabled) return result;

  const runs = db.collection('harvestrun');
  // Missing completion dates and active/stalled runs are deliberately excluded.
  const candidates: Filter<Document> = {
    status: { $in: ['completed', 'completed_with_errors', 'failed'] },
    completedAt: { $gt: '', $lt: successfulCutoff },
    lastChunkAt: { $not: { $gte: successfulCutoff } },
    'historyRetention.complete': { $ne: true },
    // Submission and retention claims update this same run document atomically.
    activeSubmissions: { $in: [0, null] },
  };
  const cursor = runs.find(candidates).sort({ completedAt: 1, _id: 1 }).batchSize(100);
  try {
    for await (const run of cursor) {
      await heartbeat?.();
      if (typeof run.brandId !== 'string' || !run.brandId) continue;
      const scope = { runId: String(run._id), brandId: run.brandId };
      if (
        await db.collection('harvestrunchunk').findOne({ ...scope, status: 'processing' }, { projection: { _id: 1 } })
      ) {
        continue;
      }
      const complete = run.completedAt < failedCutoff && (!run.lastChunkAt || run.lastChunkAt < failedCutoff);
      const filters: Record<'harvestrecordevent' | 'harvestrunchunk', Filter<Document>> = {
        harvestrecordevent: {
          ...scope,
          $or: [
            { createdAt: { $gt: '', $lt: failedCutoff } },
            {
              createdAt: { $gt: '', $lt: successfulCutoff },
              outcome: { $in: ['created', 'updated', 'deleted', 'unchanged'] },
            },
          ],
        },
        harvestrunchunk: {
          ...scope,
          $or: [
            { submittedAt: { $gt: '', $lt: failedCutoff } },
            { submittedAt: { $gt: '', $lt: successfulCutoff }, status: 'processed', failed: 0 },
          ],
        },
      };
      const expiringEvent = await db
        .collection('harvestrecordevent')
        .findOne(filters.harvestrecordevent, { projection: { _id: 1 } });
      const expiringChunk = await db
        .collection('harvestrunchunk')
        .findOne(filters.harvestrunchunk, { projection: { _id: 1 } });
      if (!expiringEvent && !expiringChunk) {
        if (
          !result.dryRun &&
          complete &&
          run.historyRetention &&
          !(await db.collection('harvestrecordevent').findOne(scope, { projection: { _id: 1 } })) &&
          !(await db.collection('harvestrunchunk').findOne(scope, { projection: { _id: 1 } }))
        ) {
          await runs.updateOne({ _id: run._id }, { $set: { 'historyRetention.complete': true } });
        }
        continue;
      }
      if (!result.dryRun) {
        // Mark before deleting, so partial failures still disclose lost history and
        // prevent future submissions from using an incomplete deduplication ledger.
        const claim = await runs.updateOne(
          { _id: run._id, ...candidates },
          {
            $set: {
              historyRetention: {
                prunedAt: now.toISOString(),
                successfulDays: config.successfulDays,
                failedDays: config.failedDays,
                complete: false,
              },
            },
          }
        );
        if (claim.matchedCount === 0) continue;
      }
      result.runs++;
      for (const name of ['harvestrecordevent', 'harvestrunchunk'] as const) {
        const collection = db.collection(name);
        const counter = name === 'harvestrecordevent' ? 'events' : 'chunks';
        if (result.dryRun) {
          result[counter] += await collection.countDocuments(filters[name]);
          continue;
        }
        while (true) {
          const batch = await collection
            .find(filters[name], { projection: { _id: 1 } })
            .limit(config.batchSize)
            .toArray();
          if (batch.length === 0) break;
          const deleted = await collection.deleteMany({ ...scope, _id: { $in: batch.map(row => row._id) } });
          result[counter] += deleted.deletedCount;
          await heartbeat?.();
        }
      }
      if (!result.dryRun && complete) {
        // Only skip future sweeps when nothing remains (including missing dates).
        const remainingEvent = await db.collection('harvestrecordevent').findOne(scope, { projection: { _id: 1 } });
        const remainingChunk = await db.collection('harvestrunchunk').findOne(scope, { projection: { _id: 1 } });
        if (!remainingEvent && !remainingChunk) {
          await runs.updateOne({ _id: run._id }, { $set: { 'historyRetention.complete': true } });
        }
      }
    }
  } finally {
    await cursor.close();
  }
  return result;
}
