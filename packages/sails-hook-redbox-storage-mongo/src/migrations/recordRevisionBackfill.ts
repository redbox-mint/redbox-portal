import type { ApplicationMigration } from '@researchdatabox/redbox-core/application';
import type { PersistenceOwner } from '@researchdatabox/redbox-core/extensions/storage';
import { recordRevisionMaintenance } from '../persistence/RecordRevisionMaintenance';
import { RECORD_REVISION_BACKFILL_MIGRATION_NAME } from '../persistence/recordRevisionBackfill';

// Preserve the existing maintenance entry exports; native details live in the adapter.
export {
  RECORD_REVISION_BACKFILL_BATCH_SIZE,
  RECORD_REVISION_BACKFILL_MIGRATION_NAME,
} from '../persistence/recordRevisionBackfill';
export type { RecordRevisionBackfillStats } from '../persistence/recordRevisionBackfill';

export const recordRevisionBackfillMigration: ApplicationMigration<
  PersistenceOwner & { log: Pick<Console, 'warn' | 'info' | 'error'> }
> = {
  name: RECORD_REVISION_BACKFILL_MIGRATION_NAME,
  async up(params): Promise<void> {
    await recordRevisionMaintenance(params?.context).backfill();
  },
};
