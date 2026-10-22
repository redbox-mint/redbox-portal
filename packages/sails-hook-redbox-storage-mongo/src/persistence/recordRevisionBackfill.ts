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

export interface BackfillOptions {
  batchSize?: number;
  now?: () => number;
}

const SAFE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'record-revision-backfill-no-progress',
  'record-revision-backfill-invalid-batch-size',
]);

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return SAFE_FAILURE_CODES.has(message) ? message : 'record-revision-backfill-failed';
}

/** Shared bounds, summary and safe failure policy for each concrete maintenance adapter. */
export async function runRecordRevisionBackfill(
  backfill: (kind: 'active' | 'tombstone', batchSize: number) => Promise<{ updated: number; batches: number }>,
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
    const active = await backfill('active', batchSize);
    const tombstones = await backfill('tombstone', batchSize);
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
    // Bootstrap error serializers inspect causes too. Retain only the bounded
    // diagnostic, never a native error that can carry record/connection detail.
    const durationMs = Math.max(0, now() - start);
    const code = safeFailureCode(error);
    logger.error(`Record revision backfill failed: code=${code}, durationMs=${durationMs}.`);
    throw new Error('record-revision-backfill-failed', { cause: new Error(code) });
  }
}
