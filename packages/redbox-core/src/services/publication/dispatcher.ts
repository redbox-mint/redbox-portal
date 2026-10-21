import { closePublicationAudit } from './audit';
import { evaluatePublicationWorkflow } from './workflow';
import { applyPublicationContentReplacement } from './content-replacement';
import type { RecordModel } from '../../model/storage/RecordModel';
import { assertFullPublicationStorageCapability } from '../../RecordStorageConcurrency';
import type { PublicationRuntime } from './worker';
import { publicationState } from './save';
import { reopenPublicationSource } from './source';
import { publicationDigest } from './canonical';
import type { PublicationDueCursor } from './store';
import type { PublicationWorkKey } from './contracts';

export const PUBLICATION_SYNC_JOB = 'Publication-SyncRecord';
export const PUBLICATION_DISPATCH_JOB = 'Publication-Dispatch';
export const PUBLICATION_PAUSED_BACKOFF_MS = 300000;
export interface PublicationDispatcherRuntime extends PublicationRuntime {
  brands(): Promise<string[]>;
  enqueue(name: string, key: PublicationWorkKey): Promise<unknown>;
  report(category: string, key: { brandId: string; oid?: string; destinationId?: string }): void;
}
/** Import is durable before exact acknowledgement; failed siblings retain their source obligations. */
export async function importPublicationIntents(runtime: PublicationRuntime, record: RecordModel): Promise<void> {
  assertFullPublicationStorageCapability(runtime.storage);
  const brandId = record.metaMetadata.brandId;
  const state = publicationState({ ...record });
  const config = await runtime.configuration(brandId);
  if (!state?.pending || !config) return;
  const errors: unknown[] = [];
  for (const save of state.saves) {
    if (save.outcome !== 'ready') continue;
    for (const intent of save.intents) {
      if (!intent.pending) continue;
      try {
        const approval = state.approvals.find(
          item => item.id === intent.approvalId && item.epoch === intent.approvalEpoch
        );
        if (!approval) throw new Error('Publication source approval is unavailable');
        const destination = config.destinations[intent.destinationId];
        const provider = destination && runtime.registry.get(destination.provider);
        if (!provider?.executionAvailable || !provider.decodeState)
          throw new Error('Publication source provider is unavailable');
        const key = { brandId, oid: record.redboxOid, destinationId: intent.destinationId };
        const target = approval.targetFingerprints[intent.destinationId];
        if (!target || provider.targetFingerprint(destination) !== target)
          throw new Error('Publication source target changed');
        const descriptor = await reopenPublicationSource(
          brandId,
          approval.source,
          runtime.staging(approval.source.disk)
        );
        if (
          descriptor.oid !== key.oid ||
          descriptor.sourceRevision !== intent.sourceRevision ||
          descriptor.targets[intent.destinationId] !== target ||
          descriptor.adapterContracts[intent.destinationId]?.providerId !== provider.id
        )
          throw new Error('Publication source descriptor identity mismatch');
        if (runtime.recordAudit) {
          const previous = await runtime.store.get(key);
          if (previous)
            await runtime.recordAudit(
              intent.generation > previous.sourceGeneration
                ? { ...previous, audit: closePublicationAudit(previous, 'superseded', (runtime.now ?? Date.now)()) }
                : previous
            );
        }
        await runtime.store.initialise(key, provider.id, target, provider.stateVersion);
        await runtime.store.importRequest(
          key,
          {
            sourceGeneration: intent.generation,
            sourceRevision: intent.sourceRevision,
            approvalId: intent.approvalId,
            approvalEpoch: intent.approvalEpoch,
            source: approval.source,
            sourceDigest: publicationDigest({
              ...descriptor,
              attachments: descriptor.attachments.map(({ staged: _staged, ...attachment }) => attachment),
            }),
            configurationDigest: approval.configurationDigests[intent.destinationId],
          },
          (runtime.now ?? Date.now)() + config.processing.coalesceMs
        );
        await runtime.storage.acknowledgePublicationIntent!(brandId, record.redboxOid, {
          ...intent,
          source: approval.source,
        });
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Publication source imports failed; pending work is retained');
}

/** Bounded pages with exclusive cursors advance even across paused or broken rows/brands. */
export async function dispatchPublications(runtime: PublicationDispatcherRuntime, pageSize = 100): Promise<void> {
  assertFullPublicationStorageCapability(runtime.storage);
  await runtime.store.ensureIndexes();
  const now = runtime.now ?? Date.now;
  for (const brandId of await runtime.brands()) {
    try {
      if (!(await runtime.configuration(brandId))) continue;
      let afterRecovery: string | undefined;
      do {
        const result = await runtime.storage.recoverPublicationIntents!(
          brandId,
          new Date(now() - 3600000).toISOString(),
          pageSize,
          afterRecovery
        );
        afterRecovery = result.scanned === pageSize ? result.afterOid : undefined;
      } while (afterRecovery);
      let afterOid: string | undefined;
      while (true) {
        const page = await runtime.storage.pendingPublicationIntents!(brandId, pageSize, afterOid);
        for (const record of page) {
          try {
            await importPublicationIntents(runtime, record);
          } catch {
            runtime.report('source_import_failed', { brandId, oid: record.redboxOid });
          }
        }
        if (page.length < pageSize) break;
        afterOid = page[page.length - 1].redboxOid;
      }
    } catch {
      runtime.report('brand_scan_failed', { brandId });
    }
    if (runtime.recordAudit) {
      let afterAudit: { oid: string; destinationId: string } | undefined;
      while (true) {
        const rows = await runtime.store.auditPage(brandId, pageSize, afterAudit);
        for (const row of rows) {
          try {
            await runtime.recordAudit(row);
          } catch {
            runtime.report('audit_projection_failed', { brandId, oid: row.oid, destinationId: row.destinationId });
          }
          afterAudit = { oid: row.oid, destinationId: row.destinationId };
        }
        if (rows.length < pageSize) break;
      }
    }
    let afterWorkflow: { oid: string; destinationId: string } | undefined;
    while (true) {
      const rows = await runtime.store.workflowPage(brandId, pageSize, afterWorkflow);
      for (const row of rows) {
        try {
          const workflowDone = await evaluatePublicationWorkflow(runtime, row);
          const replacementDone = await applyPublicationContentReplacement(runtime, row);
          if (workflowDone && replacementDone) await runtime.store.acknowledgeWorkflow(row);
        } catch {
          runtime.report('workflow_evaluation_failed', { brandId, oid: row.oid, destinationId: row.destinationId });
        }
        afterWorkflow = { oid: row.oid, destinationId: row.destinationId };
      }
      if (rows.length < pageSize) break;
    }
    let after: PublicationDueCursor | undefined;
    while (true) {
      const page = await runtime.store.due(brandId, pageSize, after);
      for (const row of page) {
        after = { brandId, oid: row.oid, destinationId: row.destinationId, nextActionAt: row.nextActionAt! };
        const key = { brandId, oid: row.oid, destinationId: row.destinationId };
        try {
          const config = await runtime.configuration(brandId);
          const destination = config?.destinations[row.destinationId];
          const paused = !config?.processing.enabled || !destination?.enabled || destination.archived;
          if (!(await runtime.store.dispatchClaim(key, row.revision, paused ? PUBLICATION_PAUSED_BACKOFF_MS : 30000)))
            continue;
          if (!paused) await runtime.enqueue(PUBLICATION_SYNC_JOB, key);
        } catch {
          // Invalid configuration also backs off; no obligation is marked processed.
          await runtime.store.dispatchClaim(key, row.revision, PUBLICATION_PAUSED_BACKOFF_MS);
          runtime.report('delivery_failed', key);
        }
      }
      if (page.length < pageSize) break;
    }
  }
}
