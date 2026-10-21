import type { Db } from 'mongodb';
import type { PublicationSourceReference } from './contracts';
import type { PublicationPublishingConfigData } from '../../configmodels/PublicationPublishing';
import { PublicationStagingFence } from './staging-fence';
import type { PublicationStaging } from './staging';
import { publicationState } from './save';
import { PUBLICATION_HISTORY, assertPublicationHistoryEntry } from './history';

export interface PublicationStagingSourceCollections {
  active: string;
  deleted: string;
}
/** All retained evidence counts, regardless of readiness, revocation or terminal status. */
export async function publicationStagingIsReferenced(
  db: Db,
  reference: PublicationSourceReference,
  sources: PublicationStagingSourceCollections = { active: 'record', deleted: 'deletedrecord' }
): Promise<boolean> {
  if (!sources.active?.trim() || !sources.deleted?.trim())
    throw new Error('Publication source collections are unavailable; staging inputs retained');
  const fence = new PublicationStagingFence(db);
  for (const name of [
    sources.active,
    sources.deleted,
    'publicationsync',
    'publicationresourcelease',
    'publicationcorrection',
    'publicationmigrationitem',
    PUBLICATION_HISTORY,
  ]) {
    // Scan with a cursor: do not truncate obligations or load the complete deployment into memory.
    const projection = name === sources.active ? { publicationSource: 1 } : undefined;
    for await (const row of db.collection(name).find({}, { projection })) {
      if (name === PUBLICATION_HISTORY) assertPublicationHistoryEntry(row);
      if (name === sources.active) publicationState(row);
      if (name === sources.deleted && row.deletedRecordMetadata) publicationState(row.deletedRecordMetadata);
      if (['publicationsync', 'publicationresourcelease'].includes(name) && row.schemaVersion !== 1)
        throw new Error('Unsupported publication evidence; staging inputs retained');
      const references = await fence.expand(row);
      if (references.some(item => item.disk === reference.disk && item.key === reference.key)) return true;
    }
  }
  return false;
}

export interface PublicationStagingCleanupRuntime {
  db: Db;
  sourceCollections?: PublicationStagingSourceCollections;
  brands(): Promise<string[]>;
  configuration(brandId: string): Promise<PublicationPublishingConfigData | undefined>;
  staging(disk: string): PublicationStaging;
  report(category: string, key: { brandId: string }): void;
  now?: () => number;
}
/** Agenda wake-ups never enable processing. A failed reference read prevents deletion. */
export async function cleanupPublicationStaging(runtime: PublicationStagingCleanupRuntime): Promise<void> {
  const fence = new PublicationStagingFence(runtime.db);
  for (const brandId of await runtime.brands()) {
    try {
      const config = await runtime.configuration(brandId);
      if (!config?.processing.enabled || !config.processing.stagingDisk) continue;
      await runtime.staging(config.processing.stagingDisk).cleanup(
        brandId,
        {
          deleteIfUnreferenced: async (reference, remove) => {
            const current = await runtime.configuration(brandId);
            if (!current?.processing.enabled || current.processing.stagingDisk !== config.processing.stagingDisk)
              return false;
            return fence.deleteIfUnreferenced(
              reference,
              () => publicationStagingIsReferenced(runtime.db, reference, runtime.sourceCollections),
              remove
            );
          },
        },
        { now: (runtime.now ?? Date.now)(), graceMs: Math.max(3600000, config.processing.cleanupMs) }
      );
    } catch {
      runtime.report('staging_cleanup_retained', { brandId });
    }
  }
}
