import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type { PublicationSourceReference } from './contracts';
import { publicationDigest } from './canonical';

export const PUBLICATION_COMPLETION_FENCE = 'publicationcontentadmission';
/** Separate from byte graphs: a decision seals only this exact destination obligation. */
export function publicationCompletionReference(row: PublicationSyncModel): PublicationSourceReference {
  const coordinates = {
    brandId: row.brandId,
    oid: row.oid,
    destinationId: row.destinationId,
    sourceRevision: row.sourceRevision,
    generation: row.sourceGeneration,
    approvalId: row.approvalId,
    epoch: row.approvalEpoch,
  };
  return {
    encodingVersion: 1,
    disk: 'publication-completion-admission',
    key: publicationDigest(coordinates),
    digest: publicationDigest(coordinates),
  };
}
