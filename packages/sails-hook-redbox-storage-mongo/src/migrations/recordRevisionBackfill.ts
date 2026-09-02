import type { Collection, Db, Document, Filter } from 'mongodb';
import { INITIAL_RECORD_REVISION, type RedboxMigration } from '@researchdatabox/redbox-core';

export const RECORD_REVISION_BACKFILL_MIGRATION_NAME =
  '@researchdatabox/sails-hook-redbox-storage-mongo:20260823T000000-backfill-record-revisions';

export const RECORD_REVISION_BACKFILL_BATCH_SIZE = 500;

export interface RecordRevisionBackfillStats {
  activeUpdated: number;
  tombstonesUpdated: number;
  batches: number;
  durationMs: number;
}

type MigrationLogger = Pick<Console, 'info' | 'error'>;

interface BackfillOptions {
  batchSize?: number;
  now?: () => number;
}

/** Equality against `null` matches both a null value and an absent field. */
const MISSING_REVISION = { revision: null };
const MISSING_LIFECYCLE_STATE = { lifecycleState: null };

const PENDING: Record<'active' | 'tombstone', Filter<Document>> = {
  active: MISSING_REVISION,
  tombstone: { $or: [MISSING_REVISION, MISSING_LIFECYCLE_STATE] },
};

const SAFE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'record-revision-backfill-no-progress',
  'record-revision-backfill-invalid-batch-size',
]);

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return SAFE_FAILURE_CODES.has(message) ? message : 'record-revision-backfill-failed';
}

async function backfillCollection(
  collection: Collection<Document>,
  kind: 'active' | 'tombstone',
  batchSize: number
): Promise<{ updated: number; batches: number }> {
  const pending = PENDING[kind];
  let updated = 0;
  let batches = 0;

  for (;;) {
    const documents = await collection
      .find(pending, { projection: { _id: 1, revision: 1, lifecycleState: 1 } })
      .limit(batchSize)
      .toArray();
    if (documents.length === 0) break;

    const operations = documents.map(document => ({
      updateOne: {
        filter: { $and: [{ _id: document._id }, pending] },
        // Evaluate the fallback against the value present when Mongo applies
        // the update, not the earlier projected snapshot. This preserves a
        // revision or lifecycle state installed by a concurrent/resumed run
        // while still filling whichever sibling field remains absent.
        update: [
          {
            $set: {
              revision: { $ifNull: ['$revision', INITIAL_RECORD_REVISION] },
              ...(kind === 'tombstone' ? { lifecycleState: { $ifNull: ['$lifecycleState', 'deleted'] } } : {}),
            },
          },
        ],
      },
    }));

    const result = await collection.bulkWrite(operations, { ordered: false });
    updated += result.modifiedCount;
    batches += 1;

    // Guard against an unsupported dialect silently reporting success and
    // looping forever. Another idempotent runner may legitimately have won the
    // whole batch, so only a batch whose own documents are still pending is a
    // genuine failure to progress.
    if (result.modifiedCount === 0) {
      const stillPending = await collection.countDocuments(
        { $and: [{ _id: { $in: documents.map(document => document._id) } }, pending] },
        { limit: 1 }
      );
      if (stillPending > 0) {
        throw new Error('record-revision-backfill-no-progress');
      }
    }
  }

  return { updated, batches };
}

/**
 * Restart-safe backfill. Only the new wrapper fields are written; record
 * metadata, workflow, authorization, lastSaveDate, and search documents are
 * deliberately absent from every update document.
 *
 * Each batch re-queries the documents that still need the backfill, so an
 * interrupted run resumes simply by being run again.
 */
export async function backfillRecordRevisions(
  db: Db,
  recordCollectionName: string,
  tombstoneCollectionName: string,
  logger: MigrationLogger,
  options: BackfillOptions = {}
): Promise<RecordRevisionBackfillStats> {
  const now = options.now ?? Date.now;
  const start = now();
  const batchSize = options.batchSize ?? RECORD_REVISION_BACKFILL_BATCH_SIZE;

  try {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
      throw new TypeError('record-revision-backfill-invalid-batch-size');
    }
    const active = await backfillCollection(db.collection(recordCollectionName), 'active', batchSize);
    const tombstones = await backfillCollection(db.collection(tombstoneCollectionName), 'tombstone', batchSize);
    const stats: RecordRevisionBackfillStats = {
      activeUpdated: active.updated,
      tombstonesUpdated: tombstones.updated,
      batches: active.batches + tombstones.batches,
      durationMs: Math.max(0, now() - start),
    };
    logger.info(
      `Record revision backfill complete: active=${stats.activeUpdated}, tombstones=${stats.tombstonesUpdated}, ` +
        `batches=${stats.batches}, durationMs=${stats.durationMs}.`
    );
    return stats;
  } catch (error) {
    // The logged code stays bounded: a driver message can carry record detail,
    // so only this migration's own codes are echoed. The original error travels
    // as the thrown error's cause for the operator's stack trace.
    const durationMs = Math.max(0, now() - start);
    logger.error(`Record revision backfill failed: code=${safeFailureCode(error)}, durationMs=${durationMs}.`);
    throw new Error('record-revision-backfill-failed', { cause: error });
  }
}

export const recordRevisionBackfillMigration: RedboxMigration = {
  name: RECORD_REVISION_BACKFILL_MIGRATION_NAME,
  async up(params): Promise<void> {
    const sails = params?.context;
    if (!sails?.models?.record || !sails?.models?.deletedrecord) {
      throw new Error('record-revision-backfill-models-unavailable');
    }
    const db = sails.models.record.getDatastore().manager as Db;
    await backfillRecordRevisions(db, sails.models.record.tableName, sails.models.deletedrecord.tableName, sails.log);
  },
};
