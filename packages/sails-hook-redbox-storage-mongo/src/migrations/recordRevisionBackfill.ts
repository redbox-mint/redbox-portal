// Preserve the existing maintenance entry exports; native details live in the adapter.
export {
  RECORD_REVISION_BACKFILL_BATCH_SIZE,
  RECORD_REVISION_BACKFILL_MIGRATION_NAME,
} from '../persistence/recordRevisionBackfill';
export type { RecordRevisionBackfillStats } from '../persistence/recordRevisionBackfill';
