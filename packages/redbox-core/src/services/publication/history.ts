import type { Db } from 'mongodb';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type { PublicationResourceLeaseModel } from '../../model/storage/PublicationResourceLeaseModel';
import { PublicationStagingFence } from './staging-fence';
import { publicationDigest } from './canonical';

export const PUBLICATION_HISTORY = 'publicationhistory';
/** Reserve ample document space for the final result and provider checkpoints after submission. */
export function assertPublicationJournalCapacity(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > 4 * 1024 * 1024)
    throw new Error(
      'Publication operation journal capacity reached; retain evidence and prepare a fresh request after reconciliation'
    );
}
export interface PublicationHistoryEntry {
  _id: string;
  schemaVersion: 1;
  snapshot: PublicationSyncModel | PublicationResourceLeaseModel;
}

/** Unknown archive encodings cannot establish that recovery inputs are unreferenced. @internal */
export function assertPublicationHistoryEntry(value: unknown): void {
  const snapshot = value && typeof value === 'object' ? Reflect.get(value, 'snapshot') : undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    Reflect.get(value, 'schemaVersion') !== 1 ||
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot) ||
    Reflect.get(snapshot, 'schemaVersion') !== 1 ||
    !Array.isArray(Reflect.get(snapshot, 'operations'))
  )
    throw new Error('Unsupported publication history; recovery inputs retained');
}

/** Copy before CAS removal. A failed/ambiguous archive leaves the live evidence untouched. */
export async function retainPublicationHistory(
  db: Db,
  snapshot: PublicationSyncModel | PublicationResourceLeaseModel
): Promise<void> {
  const entry: PublicationHistoryEntry = {
    _id: publicationDigest(JSON.parse(JSON.stringify(snapshot))),
    schemaVersion: 1,
    snapshot,
  };
  await new PublicationStagingFence(db).admit(entry, () =>
    db
      .collection<PublicationHistoryEntry>(PUBLICATION_HISTORY)
      .updateOne(
        { _id: entry._id },
        { $setOnInsert: entry },
        { upsert: true, writeConcern: { w: 'majority', j: true } }
      )
  );
}
