import type { PublicationAttachment } from './contracts';
import type { PublicationStagingCleanupRuntime } from './staging-cleanup';
import {
  PublicationStagingFence,
  publicationOriginalReference,
  publicationRecordAttachmentIds,
  publicationStagedReferences,
} from './staging-fence';
import { publicationState } from './save';
import { PUBLICATION_HISTORY, assertPublicationHistoryEntry } from './history';
import { reopenPublicationSource } from './source';
import { isPublicationObject } from './builtins';
import { assertPublicationContentReplacement } from './content-replacement';

type Original = NonNullable<PublicationAttachment['original']>;

/** All retained recovery manifests matter. Unknown graphs/bytes fail closed rather than guessing. */
async function originalIsReferenced(runtime: PublicationStagingCleanupRuntime, original: Original): Promise<boolean> {
  const sources = runtime.sourceCollections ?? { active: 'record', deleted: 'deletedrecord' };
  if (!sources.active?.trim() || !sources.deleted?.trim())
    throw new Error('Publication source collections are unavailable; original attachments retained');
  const fence = new PublicationStagingFence(runtime.db);
  for (const name of [
    sources.active,
    sources.deleted,
    'publicationsync',
    'publicationresourcelease',
    'publicationcorrection',
    'publicationmigrationitem',
    PUBLICATION_HISTORY,
  ]) {
    for await (const row of runtime.db.collection(name).find({})) {
      if (name === PUBLICATION_HISTORY) assertPublicationHistoryEntry(row);
      const live = name === sources.deleted ? row.deletedRecordMetadata : name === sources.active ? row : undefined;
      if (live) publicationState(live);
      if (['publicationsync', 'publicationresourcelease'].includes(name) && row.schemaVersion !== 1)
        throw new Error('Unsupported publication evidence; original attachments retained');
      if (
        (live?.redboxOid ?? row.redboxOid) === original.oid &&
        publicationRecordAttachmentIds(live?.metadata).includes(original.fileId)
      )
        return true;
      const references = publicationStagedReferences(row);
      if (!references.length) continue;
      await fence.expand(row); // Missing graph/history retains every potentially hidden recovery input.
      const rowBrand: unknown = live?.metaMetadata?.brandId ?? row.brandId ?? row.branding ?? row.snapshot?.brandId;
      if (typeof rowBrand !== 'string') return true;
      const manifests = [];
      for (const reference of references) {
        const descriptor = await reopenPublicationSource(rowBrand, reference, runtime.staging(reference.disk));
        manifests.push(descriptor);
      }
      for (const descriptor of manifests) {
        const matches = descriptor.attachments.filter(
          attachment =>
            (attachment.original?.oid === original.oid && attachment.original.fileId === original.fileId) ||
            (descriptor.oid === original.oid && attachment.id === original.fileId) ||
            attachment.id === `${original.oid}/${original.fileId}` ||
            // Oni manifests sealed before original identities were registered used this tuple.
            attachment.id === JSON.stringify([original.oid, original.fileId])
        );
        if (matches.some(attachment => !attachment.staged)) return true;
        if (
          descriptor.oid === original.oid &&
          publicationRecordAttachmentIds(descriptor.metadata.metadata).includes(original.fileId) &&
          !matches.length
        )
          return true;
        // Reopening checks the manifest, not the recovery byte objects it names.
        // Each retained source must remain recoverable without the original.
        for (const attachment of matches)
          if (attachment.staged)
            await runtime.staging(attachment.staged.disk).verify(rowBrand, attachment.staged, attachment.size);
      }
    }
  }
  // A preflight/source writer that has not committed a manifest yet holds the original's durable admission pin.
  return false;
}

/** The only publication path allowed to remove original bytes. A durable tombstone precedes disk removal. */
export async function cleanupPublicationAttachments(
  runtime: PublicationStagingCleanupRuntime & {
    removeOriginal(brandId: string, original: Original): Promise<void>;
  }
): Promise<{ removed: number; retained: number }> {
  const summary = { removed: 0, retained: 0 };
  const fence = new PublicationStagingFence(runtime.db);
  const active = runtime.sourceCollections?.active ?? 'record';
  for await (const row of runtime.db
    .collection(active)
    .find({ 'publicationSource.contentReplacements.0': { $exists: true } })) {
    const state = publicationState(row);
    const brandId: unknown = row.metaMetadata?.brandId;
    if (!state || typeof brandId !== 'string') continue;
    try {
      const config = await runtime.configuration(brandId);
      if (!config?.processing.enabled) continue;
      for (const change of state.contentReplacements ?? []) {
        assertPublicationContentReplacement(change);
        if ((runtime.now ?? Date.now)() - Date.parse(change.appliedAt) < Math.max(3600000, config.processing.cleanupMs))
          continue;
        const source = await reopenPublicationSource(brandId, change.source, runtime.staging(change.source.disk));
        for (let i = 0; i < change.before.length; i++) {
          const before = change.before[i];
          const after = change.after[i];
          if (
            !isPublicationObject(before) ||
            !isPublicationObject(after) ||
            before.type !== 'attachment' ||
            after.type !== 'url'
          )
            continue;
          const attachment = source.attachments.find(
            item => item.id === before.fileId && item.original?.oid === row.redboxOid
          );
          if (!attachment?.original || !attachment.staged) {
            summary.retained++;
            continue;
          }
          const original = attachment.original;
          const staged = attachment.staged;
          const reference = publicationOriginalReference(brandId, original);
          const release = await fence.acquire(staged);
          let removed: boolean;
          try {
            // Check before creating a tombstone and on every retry of a prior deletion.
            // Keep recovery pinned until the original-byte removal is acknowledged.
            await runtime.staging(staged.disk).verify(brandId, staged, attachment.size);
            removed = await fence.deleteIfUnreferenced(
              reference,
              () => originalIsReferenced(runtime, original),
              () => runtime.removeOriginal(brandId, original)
            );
          } finally {
            await release();
          }
          if (removed) summary.removed++;
          else summary.retained++;
        }
      }
    } catch {
      summary.retained++;
      runtime.report('attachment_cleanup_retained', { brandId });
    }
  }
  return summary;
}
