import { PublicationProposal } from './proposal';
import { PublicationLeaseLost } from './ownership';
import { randomUUID } from 'node:crypto';
import {
  PublicationEvidenceMismatch,
  assertPublicationOperationEvidence,
  publicationOperationIdempotencyKey,
  publicationOperationRequiresRecovery,
} from './operations';
import { cloneDeep } from 'lodash';
import type { Db } from 'mongodb';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type {
  PublicationResourceKey,
  PublicationResourceLeaseModel,
} from '../../model/storage/PublicationResourceLeaseModel';
import type {
  PublicationAttribution,
  PublicationObject,
  PublicationOperation,
  PublicationProviderExecution,
  PublicationRepairContext,
  PublicationRepairResult,
  PublicationSourceDescriptor,
  PublicationWorkKey,
} from './contracts';
import { publicationDigest } from './canonical';
import { publicationState } from './save';
import { reopenPublicationSource } from './source';
import { PublicationStagingFence } from './staging-fence';
import { isPublicationObject } from './builtins';
import { recordOperation } from './store';
import type { PublicationRuntime } from './worker';
import { PublicationMigrationStore } from './migration-store';
import { PublicationAdminControl } from './admin-control';

export interface PublicationAdminOptions {
  action: 'inspect' | 'reconcile' | 'pause' | 'resume' | 'revoke' | 'repair';
  brandId: string;
  username: string;
  oid?: string;
  destinationId?: string;
  approvalId?: string;
  repair?: string;
  parameters?: PublicationObject;
  apply?: boolean;
  reason?: string;
}
export interface PublicationAdminRuntime extends PublicationRuntime {
  db: Db;
  /** Always reload the current identity and brand-scoped roles, including immediately before persistence. */
  administrator(username: string, brandId: string, record?: Record<string, unknown>): Promise<PublicationAttribution>;
  revoke(record: Record<string, unknown>, approvalId: string): Promise<void>;
}
function summary(row: PublicationSyncModel) {
  return {
    brandId: row.brandId,
    oid: row.oid,
    destinationId: row.destinationId,
    providerId: row.providerId,
    revision: row.revision,
    status: row.status,
    sourceRevision: row.sourceRevision,
    sourceGeneration: row.sourceGeneration,
    approvalId: row.approvalId,
    approvalEpoch: row.approvalEpoch,
    binding: row.binding && {
      namespace: row.binding.namespace,
      objectId: row.binding.objectId,
      targetFingerprint: row.binding.targetFingerprint,
    },
    activeLease: !!row.lease && row.lease.expiresAt > Date.now(),
    operations: row.operations.map(op => ({
      id: op.id,
      kind: op.kind,
      intendedDigest: op.intendedDigest,
      idempotencyKey: publicationOperationIdempotencyKey(row, op),
      outcome: op.outcome,
      evidenceDigest: publicationDigest(op.evidence),
    })),
    ...(row.operationEvidenceFailures?.length
      ? {
          operationEvidenceFailures: row.operationEvidenceFailures.map(failure => ({
            operationId: failure.operationId,
            field: failure.field,
            at: failure.at,
            reportedDigest: publicationDigest(failure.reported),
          })),
        }
      : {}),
    providerStateDigest: publicationDigest(row.providerState),
    correctionReferences: row.correctionReferences,
  };
}
/** All CLI and service corrections share current access, idle ownership, immutable auditing and provider validation. */
export async function administerPublication(
  runtime: PublicationAdminRuntime,
  options: PublicationAdminOptions
): Promise<unknown> {
  if (
    !['inspect', 'reconcile', 'pause', 'resume', 'revoke', 'repair'].includes(options.action) ||
    !options.brandId?.trim() ||
    !options.username?.trim()
  )
    throw new Error('An action, explicit brand and current administrator username are required');
  if (['reconcile', 'revoke', 'repair'].includes(options.action) && (!options.oid || !options.destinationId))
    throw new Error('An explicit OID and destination are required');
  if (options.oid && !options.destinationId) throw new Error('An explicit destination is required with an OID');
  if (options.action === 'pause' && options.oid) throw new Error('Pause addresses a brand or destination');
  if (options.action === 'revoke' && !options.approvalId) throw new Error('An explicit approval ID is required');
  const readOnly = ['inspect', 'reconcile'].includes(options.action);
  if (readOnly && options.apply) throw new Error('Inspect and reconcile are read-only');
  if (!readOnly && options.apply && (!options.reason?.trim() || options.reason.length > 2000))
    throw new Error('Applying a correction requires a reason of 1–2000 characters');
  let record = options.oid ? await runtime.storage.getMeta(options.oid) : undefined;
  if (options.oid && (!record || record.metaMetadata?.brandId !== options.brandId))
    throw new Error('Publication record brand mismatch');
  const actor = await runtime.administrator(options.username, options.brandId, record && { ...record });
  let config: Awaited<ReturnType<PublicationRuntime['configuration']>>;
  try {
    config = await runtime.configuration(options.brandId);
  } catch (error) {
    if (options.action !== 'inspect') throw error;
  }
  if (!config && options.action !== 'inspect') throw new Error('Shared publication configuration is unavailable');
  if (config && options.destinationId && !config.destinations[options.destinationId])
    throw new Error('Unknown publication destination');
  const filter = {
    brandId: options.brandId,
    ...(options.oid ? { oid: options.oid } : {}),
    ...(options.destinationId ? { destinationId: options.destinationId } : {}),
  };
  const rows = await runtime.store.collection.find(filter).sort({ oid: 1, destinationId: 1 }).toArray();
  const row = options.oid ? rows[0] : undefined;
  if (rows.some(row => row.schemaVersion !== 1)) throw new Error('Unsupported publication state; evidence retained');
  if (options.action === 'inspect')
    return {
      scope: filter,
      rows: rows.map(summary),
      approvals:
        record &&
        publicationState({ ...record })?.approvals.map(({ id, epoch, revokedAt, destinationIds, sourceRevision }) => ({
          id,
          epoch,
          revokedAt,
          destinationIds,
          sourceRevision,
        })),
      workflowDecision: record && publicationState({ ...record })?.workflowDecision,
      saves:
        record &&
        publicationState({ ...record })?.saves.map(({ token, outcome, sourceRevision, intents }) => ({
          token,
          outcome,
          sourceRevision,
          destinations: intents.map(intent => intent.destinationId),
        })),
      configurationAvailable: !!config,
      controls: await new PublicationAdminControl(runtime.db).collection
        .find({ brandId: options.brandId }, { projection: { lock: 0 } })
        .toArray(),
      corrections: await runtime.db
        .collection('publicationcorrection')
        .find(filter, { projection: { reason: 0 } })
        .limit(100)
        .toArray(),
      migrationQuarantines: await new PublicationMigrationStore(runtime.db).items
        .find(filter, { projection: { evidence: 0 } })
        .toArray(),
      migrationRepair: 'release-migration-quarantine',
      repairs:
        options.destinationId && config
          ? (runtime.registry.get(config.destinations[options.destinationId].provider)?.repairs ?? [])
          : [],
    };
  if (!config) throw new Error('Shared publication configuration is unavailable');
  const state = record && publicationState({ ...record });
  const approval = options.approvalId ? state?.approvals.find(item => item.id === options.approvalId) : undefined;
  if (
    options.action === 'revoke' &&
    (!approval || !approval.destinationIds.includes(options.destinationId!) || approval.revokedAt)
  )
    throw new Error('A current approval including this destination is required');
  if (['repair', 'reconcile'].includes(options.action) && !row) throw new Error('Publication state is unavailable');
  const controls = new PublicationAdminControl(runtime.db);
  const applied = !readOnly && options.apply === true;
  let token: string | undefined;
  let lockedRow: PublicationSyncModel | undefined;
  const resourceLocks: Array<{ key: PublicationResourceKey; row: PublicationResourceLeaseModel }> = [];
  const resourceChanges: Array<{
    key: PublicationResourceKey;
    work: PublicationWorkKey;
    operation: PublicationOperation;
  }> = [];
  // Retain every rejected verification callback, including journal validation and outer reconciliation.
  const proposal = new PublicationProposal();
  const forbidden = async (): Promise<never> => proposal.reject(new Error('Administrative verification is read-only'));
  const verifyEvidence = (...args: Parameters<typeof assertPublicationOperationEvidence>): void => {
    proposal.assertAccepted();
    try {
      assertPublicationOperationEvidence(...args);
    } catch (error) {
      if (error instanceof PublicationEvidenceMismatch) proposal.reject(error);
      throw error;
    }
  };
  const owner = `publication-admin:${randomUUID()}`;
  let correctionId: string | undefined;
  const resourceKeys = Object.entries(config.destinations).flatMap(([id, destination]) => {
    if (
      options.destinationId &&
      id !== options.destinationId &&
      !(options.action === 'revoke' && approval?.destinationIds.includes(id))
    )
      return [];
    return (runtime.registry.get(destination.provider)?.administrativeResources?.(destination) ?? []).map(key => ({
      ...key,
      providerId: destination.provider,
    }));
  });
  const relevant = (resource: PublicationResourceLeaseModel) =>
    resourceKeys.some(
      key =>
        key.providerId === resource.providerId &&
        key.namespace === resource.namespace &&
        key.resourceKey === resource.resourceKey
    ) ||
    (!options.oid && resource.lease?.brandId === options.brandId) ||
    resource.operations.some(
      entry =>
        entry.work.brandId === options.brandId &&
        (!options.oid || entry.work.oid === options.oid) &&
        (!options.destinationId || entry.work.destinationId === options.destinationId)
    ) ||
    rows.some(
      row =>
        row.providerId === resource.providerId &&
        (row.remoteNamespace === resource.namespace ||
          row.operations.some(op => op.evidence.namespace === resource.namespace))
    );
  const assertIdle = async () => {
    const affected =
      options.action === 'revoke'
        ? { brandId: options.brandId, oid: options.oid, destinationId: { $in: approval!.destinationIds } }
        : filter;
    if (
      await runtime.store.collection.findOne({
        ...affected,
        'lease.expiresAt': { $gt: Date.now() },
        'lease.owner': { $ne: owner },
      })
    )
      throw new Error('An active publication worker owns relevant work; pause and drain it first');
    const resources = await runtime.resources.collection
      .find({ 'lease.expiresAt': { $gt: Date.now() }, 'lease.owner': { $ne: owner } })
      .toArray();
    if (resources.some(relevant))
      throw new Error('An active publication resource lease owns relevant work; pause and drain it first');
  };
  const resource = async <T>(
    namespace: string,
    resourceKey: string,
    run: (context: import('./contracts').PublicationResourceExecution) => Promise<T>
  ): Promise<T> =>
    proposal.run(async () => {
      const key = { providerId: row!.providerId, namespace, resourceKey };
      let current = await runtime.resources.get(key);
      if (current?.lease && current.lease.expiresAt > Date.now() && current.lease.owner !== owner)
        throw new Error('An active publication resource lease owns this operation');
      if (
        applied &&
        !resourceLocks.some(lock => lock.key.namespace === namespace && lock.key.resourceKey === resourceKey)
      ) {
        current = await runtime.resources.claim(key, options.brandId, owner, 120000);
        if (!current?.lease) throw new Error('An active publication resource lease owns this operation');
        resourceLocks.push({ key, row: current });
      }
      const operations = cloneDeep(current?.operations ?? []);
      return run({
        operations,
        journal: operation =>
          proposal.run(async () => {
            const existing = operations.find(entry => entry.operation.id === operation.id);
            if (!existing) return proposal.reject(new Error('Repair cannot invent a resource operation'));
            if (existing.work.brandId !== options.brandId || existing.work.oid !== options.oid) {
              const affected = await runtime.storage.getMeta(existing.work.oid);
              if (!affected || affected.metaMetadata?.brandId !== existing.work.brandId)
                throw new Error('Resource recovery record brand mismatch');
              await runtime.administrator(options.username, existing.work.brandId, { ...affected });
            }
            if (['confirmed', 'not_applied', 'rejected'].includes(operation.outcome)) {
              const original = await runtime.store.get(existing.work);
              const identity = existing.operation.identity;
              if (!original && !identity)
                proposal.reject(new PublicationEvidenceMismatch(operation.id, 'legacy_identity_incomplete', operation));
              verifyEvidence(original ?? identity!, existing.operation, operation.confirmation);
            }
            proposal.value(() => recordOperation([existing.operation], operation));
            resourceChanges.push({ key, work: existing.work, operation: cloneDeep(operation) });
          }),
      });
    });
  try {
    if (!readOnly) {
      if (applied) {
        token = await controls.acquire(options.brandId);
        await runtime.store.ensureIndexes();
        await runtime.resources.ensureIndexes();
      }
      await assertIdle();
      if (applied) {
        for (const key of resourceKeys) {
          if (
            resourceLocks.some(
              lock =>
                lock.key.providerId === key.providerId &&
                lock.key.namespace === key.namespace &&
                lock.key.resourceKey === key.resourceKey
            )
          )
            continue;
          const claimed = await runtime.resources.claim(key, options.brandId, owner, 120000);
          if (!claimed?.lease) throw new Error('An active publication resource lease owns relevant work');
          resourceLocks.push({ key, row: claimed });
        }
      }
      if (applied && row) {
        const result = await runtime.store.collection.findOneAndUpdate(
          { ...filter, revision: row.revision, $or: [{ lease: null }, { 'lease.expiresAt': { $lte: Date.now() } }] },
          { $set: { lease: { owner, token: randomUUID(), expiresAt: Date.now() + 120000 } }, $inc: { revision: 1 } },
          { returnDocument: 'after', includeResultMetadata: false }
        );
        if (!result?.lease) throw new Error('Publication state changed or an active worker owns it; inspect and retry');
        lockedRow = result;
      }
    }
    let repair: PublicationRepairResult | undefined;
    const releasingMigration = options.action === 'repair' && options.repair === 'release-migration-quarantine';
    if (releasingMigration) {
      if (
        !row ||
        options.parameters?.abandonHistoricalAuthority !== true ||
        typeof options.parameters.evidenceReference !== 'string' ||
        !options.parameters.evidenceReference.trim()
      )
        throw new Error(
          'Migration release requires explicit historical-authority abandonment and settlement evidenceReference'
        );
      if (row.operations.some(publicationOperationRequiresRecovery))
        throw new Error('Reconcile uncertain historical operations before releasing migration quarantine');
      runtime.registry.decodeState(row.providerId, row.providerState, row.providerStateVersion);
      const legacy = row.providerState.legacy;
      if (
        isPublicationObject(legacy) &&
        ((isPublicationObject(legacy.create) && !['confirmed'].includes(String(legacy.create.outcome))) ||
          (isPublicationObject(legacy.publish) && !['observed', 'rejected'].includes(String(legacy.publish.outcome))) ||
          (Array.isArray(legacy.receipts) &&
            legacy.receipts.some(
              receipt => isPublicationObject(receipt) && !['available', 'removed'].includes(String(receipt.state))
            )))
      )
        throw new Error('Resolve historical provider uncertainty and receipts before releasing migration quarantine');
      const destination = config.destinations[row.destinationId];
      if (
        !destination ||
        runtime.registry.get(row.providerId)?.targetFingerprint(destination) !== row.targetFingerprint
      )
        throw new Error('Migration release cannot change a fixed target');
      const items = await new PublicationMigrationStore(runtime.db).items.find(filter).toArray();
      for (const item of items) {
        if (item.quarantine.includes('legacy_target_mismatch'))
          throw new Error('Historical target mismatch requires verified provider binding repair');
        if (item.conflictGroup) {
          if (!row.binding)
            throw new Error('Verify and link the selected managing owner before releasing its conflict quarantine');
          const peers = await new PublicationMigrationStore(runtime.db).items
            .find({ conflictGroup: item.conflictGroup })
            .toArray();
          for (const peer of peers) {
            if (peer.brandId === row.brandId && peer.oid === row.oid && peer.destinationId === row.destinationId)
              continue;
            const other = await runtime.store.get(peer);
            if (other?.binding?.namespace === row.binding.namespace && other.binding.objectId === row.binding.objectId)
              throw new Error('Conflicting managing owner remains; quarantine retained');
          }
        }
        if (item.quarantine.includes('record_missing') || item.quarantine.includes('duplicate_legacy_state'))
          throw new Error('Invalid or orphan historical evidence requires a valid supported provider repair first');
      }
      // No new work or completion is granted. A fresh eligible save is required after release.
    }
    if (!releasingMigration && row && ['repair', 'reconcile'].includes(options.action)) {
      const provider = runtime.registry.get(row.providerId);
      const destination = config.destinations[row.destinationId];
      if (
        !provider ||
        destination.provider !== row.providerId ||
        provider.targetFingerprint(destination) !== row.targetFingerprint
      )
        throw new Error('Publication target identity changed; create a new destination instead');
      const repairContext = (): PublicationRepairContext => ({
        ...row,
        configuration: cloneDeep(destination),
        state: cloneDeep(row.providerState),
        binding: cloneDeep(row.binding),
        operations: cloneDeep(row.operations),
        parameters: cloneDeep(options.parameters ?? {}),
        withResourceLease: resource,
        reconcile,
      });
      const reconcile = async (): Promise<PublicationRepairResult> =>
        proposal.run(async () => {
          if (!row.source) {
            if (!provider.repairs?.some(item => item.id === 'reconcile-evidence') || !provider.repair)
              throw new Error('Provider does not support historical reconciliation without a sealed source');
            const result = await provider.repair(
              'reconcile-evidence',
              { ...repairContext(), reconcile: forbidden },
              row.providerStateVersion
            );
            proposal.assertAccepted();
            return result;
          }
          if (!provider.execute) throw new Error('Adapter reconciliation is unavailable');
          const source = await reopenPublicationSource(row.brandId, row.source, runtime.staging(row.source.disk));
          const historical = state?.approvals.find(
            item => item.id === row.approvalId && item.epoch >= row.approvalEpoch
          );
          const approved = historical ? { ...cloneDeep(historical), epoch: row.approvalEpoch } : undefined;
          const prepared = source.relatedInputs[`${row.destinationId}:prepared`];
          if (!approved || !isPublicationObject(prepared) || !isPublicationObject(prepared.value))
            throw new Error('Historical approval/source evidence is unavailable; use a supported repair');
          const operations = cloneDeep(row.operations);
          let captured = cloneDeep(row.providerState);
          const recoverySources: PublicationSourceDescriptor[] = [];
          for (const reference of row.recoverySources)
            recoverySources.push(
              await reopenPublicationSource(row.brandId, reference, runtime.staging(reference.disk))
            );
          const context: PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject> = {
            brandId: row.brandId,
            oid: row.oid,
            destinationId: row.destinationId,
            configuration: cloneDeep(destination),
            credentials: cloneDeep(destination.connection),
            state: captured,
            prepared: cloneDeep(prepared.value),
            approval: cloneDeep(approved),
            sourceGeneration: row.sourceGeneration,
            workKind: 'observe',
            source,
            recoverySources,
            operations,
            binding: cloneDeep(row.binding),
            recovery: true,
            signal: new AbortController().signal,
            assertAuthority: forbidden,
            project: forbidden,
            bind: forbidden,
            mutate: forbidden,
            idempotencyKey: operation => publicationOperationIdempotencyKey(row, operation),
            openAttachment: forbidden,
            checkpoint: async (value, operationIds = []) => {
              proposal.assertAccepted();
              for (const id of operationIds) {
                const operation = operations.find(op => op.id === id);
                if (!operation || operation.outcome !== 'confirmed')
                  return proposal.reject(new Error('Only confirmed publication operations can be checkpointed'));
                verifyEvidence(row, operation, operation.confirmation);
                operation.checkpointed = true;
              }
              captured = proposal.value(
                () => runtime.registry.decodeState(row.providerId, value, provider.stateVersion).state
              );
            },
            journal: async operation => {
              proposal.assertAccepted();
              if (!operations.some(item => item.id === operation.id))
                proposal.reject(new Error('Reconciliation cannot submit work'));
              const retained = operations.find(item => item.id === operation.id)!;
              if (['confirmed', 'not_applied', 'rejected'].includes(operation.outcome))
                verifyEvidence(row, retained, operation.confirmation);
              proposal.value(() => recordOperation(operations, operation));
            },
            withResourceLease: resource,
            audit: async () => {},
          };
          await provider.execute('reconcile', context, row.providerStateVersion);
          proposal.assertAccepted();
          return {
            state: proposal.value(
              () => runtime.registry.decodeState(row.providerId, captured, provider.stateVersion).state
            ),
            operations,
            // recordOperation invalidates acknowledgement when later evidence is added,
            // just as it does in a live execution. An earlier checkpoint cannot settle it.
            checkpointedOperationIds: operations.filter(op => op.checkpointed === true).map(op => op.id),
          };
        });
      if (options.action === 'repair') {
        if (!provider.repairs?.some(item => item.id === options.repair) || !provider.repair)
          throw new Error('Unsupported publication provider repair');
        repair = await provider.repair(options.repair!, repairContext(), row.providerStateVersion);
        proposal.assertAccepted();
      } else {
        const result = await reconcile();
        return {
          readOnly: true,
          scope: filter,
          before: summary(row),
          proposedProviderStateDigest: publicationDigest(result.state),
          operations: result.operations?.map(({ id, outcome }) => ({ id, outcome })),
        };
      }
      // The same append-only journal validator used by workers also governs repairs.
      const operations = cloneDeep(row.operations);
      for (const operation of repair?.operations ?? []) {
        if (!operations.some(item => item.id === operation.id))
          throw new Error('Repair cannot invent a publication operation');
        const retained = operations.find(item => item.id === operation.id)!;
        if (
          ['confirmed', 'not_applied', 'rejected'].includes(operation.outcome) &&
          publicationDigest(operation) !== publicationDigest(retained)
        )
          verifyEvidence(row, retained, operation.confirmation);
        recordOperation(operations, operation);
      }
      for (const id of repair?.checkpointedOperationIds ?? []) {
        const operation = operations.find(op => op.id === id);
        if (!operation || operation.outcome !== 'confirmed')
          throw new Error('Only confirmed publication operations can be checkpointed');
        verifyEvidence(row, operation, operation.confirmation);
        operation.checkpointed = true;
      }
      if (repair) repair.operations = operations;
      if (repair?.binding && repair.binding.targetFingerprint !== row.targetFingerprint)
        throw new Error('Repair cannot repoint a publication target');
      if (
        repair?.binding &&
        row.binding &&
        (repair.binding.objectId !== row.binding.objectId || repair.binding.namespace !== row.binding.namespace) &&
        row.operations.some(publicationOperationRequiresRecovery)
      )
        throw new Error('Reconcile uncertain operations before changing a binding');
    }
    if (options.action === 'resume' && row) {
      const current = state?.approvals.find(
        item => item.id === row.approvalId && item.epoch === row.approvalEpoch && !item.revokedAt
      );
      const intent = state?.intents[row.destinationId];
      if (
        !current ||
        state?.revision !== row.sourceRevision ||
        intent?.generation !== row.sourceGeneration ||
        intent.approvalId !== row.approvalId ||
        intent.approvalEpoch !== row.approvalEpoch
      )
        throw new Error('Resume requires current unchanged approval; save through an eligible source first');
    }
    await proposal.finish();
    const plan = {
      scope: filter,
      action: options.action,
      repair: options.repair,
      approvalId: options.approvalId,
      before: rows.map(summary),
      proposedProviderStateDigest: repair && publicationDigest(repair.state),
      proposedBinding: repair?.binding && {
        namespace: repair.binding.namespace,
        objectId: repair.binding.objectId,
        targetFingerprint: repair.binding.targetFingerprint,
      },
      proposedOperations: repair?.operations?.map(({ id, outcome, evidence }) => ({
        id,
        outcome,
        evidenceDigest: publicationDigest(evidence),
      })),
      ...(options.action === 'pause' || (options.action === 'resume' && !options.oid)
        ? { operationalPause: options.action === 'pause' }
        : {}),
      retainedUncertaintyAndReceipts: true,
    };
    proposal.assertAccepted();
    if (!applied) return { dryRun: true, ...plan };
    record = options.oid ? await runtime.storage.getMeta(options.oid) : undefined;
    if (options.oid && (!record || record.metaMetadata?.brandId !== options.brandId))
      throw new Error('Publication record brand changed');
    const currentActor = await runtime.administrator(options.username, options.brandId, record && { ...record });
    if (!options.oid) {
      for (const oid of new Set(rows.map(row => row.oid))) {
        const affected = await runtime.storage.getMeta(oid);
        if (!affected || affected.metaMetadata?.brandId !== options.brandId)
          throw new Error('Affected publication record brand changed');
        await runtime.administrator(options.username, options.brandId, { ...affected });
      }
    }
    if (publicationDigest(actor) !== publicationDigest(currentActor))
      throw new Error('Publication administrator identity changed');
    await controls.assertOwner(options.brandId, token!);
    await assertIdle();
    if (
      row &&
      record &&
      publicationDigest(state ?? null) !== publicationDigest(publicationState({ ...record }) ?? null)
    )
      throw new Error('Publication source changed during verification; inspect and retry');
    proposal.assertAccepted();
    correctionId = randomUUID();
    const corrections = runtime.db.collection('publicationcorrection');
    await corrections.createIndex({ id: 1 }, { unique: true });
    await corrections.insertOne({
      id: correctionId,
      ...filter,
      actor,
      action: options.action,
      repair: options.repair,
      approvalId: options.approvalId,
      reason: options.reason!.trim(),
      at: new Date().toISOString(),
      status: 'started',
      before: rows.map(summary),
      evidenceReference:
        typeof options.parameters?.evidenceReference === 'string' ? options.parameters.evidenceReference : undefined,
      evidenceDigest: publicationDigest(options.parameters ?? {}),
    });
    await controls.assertOwner(options.brandId, token!);
    for (const lock of resourceLocks) await runtime.resources.assertOwner(lock.key, options.brandId, lock.row.lease!);
    if (options.action === 'pause' || (options.action === 'resume' && !options.oid)) {
      await controls.setPaused(
        options.brandId,
        options.destinationId ?? '',
        options.action === 'pause',
        token!,
        correctionId
      );
    } else if (options.action === 'revoke') {
      await runtime.revoke({ ...record! }, options.approvalId!);
    } else if (releasingMigration) {
      await new PublicationMigrationStore(runtime.db).resolve(
        options.brandId,
        options.oid!,
        options.destinationId!,
        correctionId,
        String(options.parameters!.evidenceReference)
      );
    } else if (lockedRow?.lease) {
      let saved = lockedRow;
      const lease = lockedRow.lease;
      if (repair) {
        // One CAS installs provider state, binding and journals together; no partial loss of uncertainty.
        const next = cloneDeep(saved);
        next.providerState = cloneDeep(repair.state);
        next.providerStateVersion = runtime.registry.get(saved.providerId)!.stateVersion;
        next.operations = cloneDeep(repair.operations ?? next.operations);
        if (repair.binding) {
          next.binding = cloneDeep(repair.binding);
          next.remoteNamespace = repair.binding.namespace;
          next.remoteObjectId = repair.binding.objectId;
        }
        next.revision++;
        next.correctionReferences.push(correctionId);
        for (const change of resourceChanges) {
          const lock = resourceLocks.find(
            lock => lock.key.namespace === change.key.namespace && lock.key.resourceKey === change.key.resourceKey
          )!;
          lock.row = await runtime.resources.journal(
            change.key,
            options.brandId,
            lock.row.lease!,
            lock.row.revision,
            change.work,
            change.operation
          );
        }
        await runtime.store.assertOwner(saved, lease);
        if (
          !(
            await new PublicationStagingFence(runtime.db).admit(next, () =>
              runtime.store.collection.replaceOne(
                {
                  ...filter,
                  revision: saved.revision,
                  'lease.token': lease.token,
                  'lease.expiresAt': { $gt: Date.now() },
                },
                next
              )
            )
          ).matchedCount
        )
          throw new Error('Publication state changed during repair');
        saved = next;
        lockedRow = next;
      } else {
        saved = await runtime.store.request(saved, 'synchronise', saved.revision);
        lockedRow = saved;
        const work = cloneDeep(saved.work);
        lockedRow = await runtime.store.checkpoint(saved, lease, saved.revision, {
          status: 'queued',
          waitingReason: undefined,
          retry: undefined,
          retryEpisodes: {},
          work,
          correctionReferences: [...saved.correctionReferences, correctionId],
        });
      }
    }
    await corrections.updateOne(
      { id: correctionId, status: 'started' },
      { $set: { status: 'applied', completedAt: new Date().toISOString() } }
    );
    return { applied: true, correctionId, ...plan };
  } catch (caught) {
    const error = proposal.failure ?? caught;
    if (error instanceof PublicationEvidenceMismatch && lockedRow?.lease) {
      const current = await runtime.store.get(lockedRow);
      if (current?.lease?.token === lockedRow.lease.token)
        lockedRow = await runtime.store.checkpoint(current, current.lease, current.revision, {
          status: 'repair_required',
          waitingReason: error.message,
          operationEvidenceFailures: [
            ...(current.operationEvidenceFailures ?? []),
            {
              operationId: error.operationId,
              field: error.field,
              reported: cloneDeep(error.evidence),
              at: new Date().toISOString(),
            },
          ],
        });
    }
    if (correctionId)
      await runtime.db
        .collection('publicationcorrection')
        .updateOne(
          { id: correctionId, status: 'started' },
          { $set: { status: 'interrupted', category: 'inspect_before_retry' } }
        );
    throw error;
  } finally {
    try {
      for (const lock of resourceLocks.reverse()) {
        if (!lock.row.lease) continue;
        try {
          await runtime.resources.release(lock.key, options.brandId, lock.row.lease, lock.row.revision);
        } catch (error) {
          if (!(error instanceof PublicationLeaseLost)) throw error;
        }
      }
    } finally {
      try {
        if (lockedRow?.lease) {
          const current = await runtime.store.get(lockedRow);
          if (current?.lease?.token === lockedRow.lease.token) {
            try {
              await runtime.store.release(current, current.lease, current.revision);
            } catch (error) {
              if (!(error instanceof PublicationLeaseLost)) throw error;
            }
          }
        }
      } finally {
        if (token) await controls.release(options.brandId, token);
      }
    }
  }
}
