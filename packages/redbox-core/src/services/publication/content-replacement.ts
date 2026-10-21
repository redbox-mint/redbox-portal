import { cloneDeep, get, isEqual, omit, set } from 'lodash';
import type { PublicationContentReplacement, PublicationWorkKey } from './contracts';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type { PublicationRuntime } from './worker';
import { validatePublicationRequest } from './worker';
import { publicationState } from './save';
import { publicationDigest } from './canonical';
import { publicationOutputPath } from './configuration';
import { isPublicationObject } from './builtins';
import { currentPublicationCompletion } from './workflow';
import { reopenPublicationSource } from './source';
import { PublicationStopped } from './execution';

const registeredChanges = new WeakMap<PublicationContentReplacement, string>();
/** Storage accepts only a change constructed by this host after resolving the frozen provider registry. */
export function assertRegisteredPublicationContentReplacement(change: PublicationContentReplacement): void {
  if (registeredChanges.get(change) !== publicationDigest(change))
    throw new Error('Unregistered publication content replacement');
  assertPublicationContentReplacement(change);
}

/** One ordered array only: no additions, removals, arbitrary field edits or broad maintenance exemption. */
export function assertPublicationContentReplacement(change: PublicationContentReplacement): void {
  publicationOutputPath(change.path);
  if (
    change.capability !== 'attachment-to-url' ||
    !Number.isFinite(Date.parse(change.appliedAt)) ||
    !/^[a-zA-Z][a-zA-Z0-9]*Receipt$/.test(change.receiptField) ||
    !change.path.startsWith('metadata.') ||
    !Array.isArray(change.before) ||
    !Array.isArray(change.after) ||
    change.before.length !== change.after.length ||
    !change.before.length ||
    change.id !== publicationContentReplacementId(change)
  )
    throw new Error('Invalid post-completion content replacement');
  let replaced = false;
  for (let i = 0; i < change.before.length; i++) {
    const before = change.before[i];
    const after = change.after[i];
    if (isEqual(before, after)) continue;
    if (
      !isPublicationObject(before) ||
      !isPublicationObject(after) ||
      before.type !== 'attachment' ||
      typeof before.fileId !== 'string' ||
      !before.fileId ||
      after.type !== 'url' ||
      typeof after.location !== 'string' ||
      !/^https?:\/\//.test(after.location) ||
      after.ignore !== true ||
      after.localBytesRetained !== true ||
      typeof after[change.receiptField] !== 'string' ||
      !after[change.receiptField] ||
      (before[change.receiptField] !== undefined && before[change.receiptField] !== after[change.receiptField]) ||
      typeof after.originalFileName !== 'string' ||
      !after.originalFileName ||
      !isEqual(
        omit(before, ['type', 'location', 'ignore', 'localBytesRetained', change.receiptField, 'originalFileName']),
        omit(after, ['type', 'location', 'ignore', 'localBytesRetained', change.receiptField, 'originalFileName'])
      )
    )
      throw new Error('Content replacement may only substitute verified attachment URLs');
    replaced = true;
  }
  if (!replaced) throw new Error('Content replacement must replace an attachment');
}
export function publicationContentReplacementId(
  change: Omit<PublicationContentReplacement, 'id' | 'appliedAt'>
): string {
  const {
    capability,
    receiptField,
    providerId,
    destinationId,
    sourceRevision,
    generation,
    approvalId,
    approvalEpoch,
    source,
    path,
    before,
    after,
  } = change;
  return publicationDigest({
    capability,
    receiptField,
    providerId,
    destinationId,
    sourceRevision,
    generation,
    approvalId,
    approvalEpoch,
    source,
    path,
    before,
    after,
  });
}

/** Only an exact recorded result can restore its approved input for later validation. */
export function publicationReplacementInputs(
  record: Record<string, unknown>,
  sourceRevision: number
): Record<string, unknown> {
  const result = cloneDeep(record);
  for (const change of publicationState(record)?.contentReplacements ?? []) {
    if (change.sourceRevision !== sourceRevision) continue;
    assertPublicationContentReplacement(change);
    if (!isEqual(get(result, change.path), change.after))
      throw new PublicationStopped('superseded', 'content_replacement_changed');
    set(result, change.path, cloneDeep(change.before));
  }
  return result;
}

/** Missing/unimported/paused/failed siblings retain bytes, even after an `any` workflow decision. */
export function publicationReplacementReady(record: Record<string, unknown>, rows: PublicationSyncModel[]): boolean {
  const state = publicationState(record);
  if (
    !state ||
    state.saves.some(
      save =>
        save.sourceRevision === state.revision &&
        save.outcome !== 'abandoned' &&
        save.intents.some(request => {
          const intent = state.intents[request.destinationId];
          const approval = state.approvals.find(
            approval => approval.id === request.approvalId && approval.epoch === request.approvalEpoch
          );
          return (
            approval &&
            !approval.revokedAt &&
            intent?.generation === request.generation &&
            intent.approvalId === request.approvalId &&
            (save.outcome !== 'ready' || request.pending)
          );
        })
    )
  )
    return false;
  return Object.values(state.intents)
    .filter(intent => intent.sourceRevision === state.revision)
    .every(intent => {
      const approval = state.approvals.find(
        approval => approval.id === intent.approvalId && approval.epoch === intent.approvalEpoch
      );
      // Revoked work cannot consume bytes. Every other obligation must positively complete.
      if (approval?.revokedAt) return true;
      const row = rows.find(row => row.destinationId === intent.destinationId);
      return !!row && currentPublicationCompletion(record, row);
    });
}

/** Local settlement is scanned independently of remote work, including after a crash or sibling completion. */
export async function applyPublicationContentReplacement(
  runtime: PublicationRuntime,
  key: PublicationWorkKey
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await runtime.store.get(key);
    if (!row) return true;
    const provider = runtime.registry.get(row.providerId);
    const capability = provider?.postCompletionReplacement;
    if (!capability) return true;
    const config = await runtime.configuration(key.brandId);
    if (!config) return false;
    const destination = config.destinations[key.destinationId];
    if (!destination || destination.provider !== row.providerId) return true;
    const path = capability.path(destination);
    if (!path) return true;
    const fresh = await runtime.storage.getMeta(key.oid);
    if (!fresh || fresh.metaMetadata.brandId !== key.brandId) return true;
    const record = { ...fresh };
    const state = publicationState(record);
    if (!state || state.revision !== row.sourceRevision) return true;
    if (state.contentReplacements?.some(change => change.sourceRevision === state.revision && change.path === path))
      return true;
    const approval = state.approvals.find(
      item => item.id === row.approvalId && item.epoch === row.approvalEpoch && !item.revokedAt
    );
    if (!approval) return true;
    if (
      !currentPublicationCompletion(record, row) ||
      !publicationReplacementReady(record, await runtime.store.forRecord(key.brandId, key.oid))
    )
      return false;
    const source = await reopenPublicationSource(key.brandId, approval.source, runtime.staging(approval.source.disk));
    const before = get(source.metadata, path);
    if (!Array.isArray(before) || !before.some(entry => isPublicationObject(entry) && entry.type === 'attachment'))
      return true;
    try {
      await validatePublicationRequest(runtime, row, true, source, approval);
    } catch (error) {
      if (error instanceof PublicationStopped) return error.status !== 'paused';
      throw error;
    }
    const after = capability.entries(row.providerState, row.providerStateVersion, row.approvalId, row.sourceGeneration);
    // Old completion evidence without a prepared replacement must be observed, never fabricated here.
    if (!after) {
      if (row.work.maintenance.requested === row.work.maintenance.processed)
        await runtime.store.request(
          key,
          'maintenance',
          row.revision,
          (runtime.now ?? Date.now)() + config.processing.cleanupMs
        );
      return false;
    }
    if (isEqual(before, after)) return true;
    for (const other of Object.values(config.destinations)) {
      for (const output of runtime.registry.get(other.provider)?.sourceMaintenancePaths?.(other) ?? [])
        if (output === path || output.startsWith(`${path}.`) || path.startsWith(`${output}.`))
          throw new Error('Content replacement cannot overlap maintenance outputs');
    }
    const change: PublicationContentReplacement = {
      id: '',
      capability: capability.capability,
      receiptField: capability.receiptField,
      providerId: row.providerId,
      destinationId: row.destinationId,
      sourceRevision: row.sourceRevision,
      generation: row.sourceGeneration,
      approvalId: row.approvalId,
      approvalEpoch: row.approvalEpoch,
      source: approval.source,
      path,
      before,
      after,
      appliedAt: new Date((runtime.now ?? Date.now)()).toISOString(),
    };
    change.id = publicationContentReplacementId(change);
    assertPublicationContentReplacement(change);
    if (runtime.storage.getCapabilities?.().publicationContentReplacement !== 1)
      throw new Error('Storage does not certify post-completion content replacement');
    registeredChanges.set(change, publicationDigest(change));
    const result = await runtime.storage.setPublicationRecordFields!({
      ...key,
      expectedRevision: fresh.revision ?? 0,
      sourceRevision: row.sourceRevision,
      approvalId: row.approvalId,
      approvalEpoch: row.approvalEpoch,
      generation: row.sourceGeneration,
      fields: {},
      allowedPaths: [],
      contentReplacement: change,
      persistenceIdentity: { username: config.processing.serviceUsername, userType: config.processing.serviceUserType },
    });
    if (result.updated) return true;
    // Both the record and all current destination obligations are reloaded on the next attempt.
  }
  return false;
}
