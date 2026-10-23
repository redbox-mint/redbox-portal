import type { PersistenceOwner } from '@researchdatabox/redbox-core/extensions/storage';
import {
  prismaDatabase,
  prismaRecordRevisionBatches,
  persistenceOperation,
} from '@researchdatabox/redbox-core/extensions/storage';
import { runRecordRevisionBackfill } from './recordRevisionBackfill';
import type { BackfillOptions, RecordRevisionBackfillStats } from './recordRevisionBackfill';

export interface RecordRevisionMaintenance {
  readonly backend: 'prisma';
  backfill(options?: BackfillOptions): Promise<RecordRevisionBackfillStats>;
}
export function recordRevisionMaintenance(
  app: PersistenceOwner & { log: Pick<Console, 'warn' | 'info' | 'error'> }
): RecordRevisionMaintenance {
  return {
    backend: 'prisma',
    backfill: options => {
      const client = prismaDatabase(app, 'redboxStorage');
      void client.catch(() => {});
      return persistenceOperation(app, async () =>
        runRecordRevisionBackfill(prismaRecordRevisionBatches(await client), app.log, options)
      );
    },
  };
}
