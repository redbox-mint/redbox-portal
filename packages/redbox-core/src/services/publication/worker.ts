import { randomUUID } from 'node:crypto';
import { publicationOperationRequiresRecovery } from './operations';
import { beginPublicationAudit, closePublicationAudit } from './audit';
import { cloneDeep, get } from 'lodash';
import { applyPublicationProjection, assertPublicationProjection, publicationProjectionInputs } from './writeback';
import { applyPublicationContentReplacement, publicationReplacementInputs } from './content-replacement';
import { publicationWorkflowInputs, evaluatePublicationWorkflow, type PublicationWorkflowTransition } from './workflow';
import type { StorageService } from '../../StorageService';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type { PublicationPublishingConfigData } from '../../configmodels/PublicationPublishing';
import { assertFullPublicationStorageCapability } from '../../RecordStorageConcurrency';
import type {
  PublicationApproval,
  PublicationObject,
  PublicationProviderExecution,
  PublicationProviderOutcome,
  PublicationSourceDescriptor,
  PublicationSourceReference,
  PublicationWorkKey,
} from './contracts';
import { publicationContentRecord, publicationDigest } from './canonical';
import { isPublicationObject } from './builtins';
import { publicationCondition, publicationState } from './save';
import { publicationMaterialConfiguration, reopenPublicationSource } from './source';
import type { PublicationStaging } from './staging';
import { PublicationSyncStore, type PublicationWorkKind } from './store';
import { PublicationResourceStore } from './resource-store';
import { PublicationProviderRegistry } from './registry';
import { PublicationLeaseLost } from './ownership';
import { PublicationExecution, PublicationResourceBusy, PublicationStopped } from './execution';
import { PublicationInvocationEnded } from './proposal';

export interface PublicationRuntime {
  storage: StorageService;
  store: PublicationSyncStore;
  resources: PublicationResourceStore;
  registry: PublicationProviderRegistry;
  configuration(brandId: string): Promise<PublicationPublishingConfigData | undefined>;
  assertAccess(
    brandId: string,
    record: Record<string, unknown>,
    config: PublicationPublishingConfigData
  ): Promise<void>;
  staging(disk: string): PublicationStaging;
  /** Validate live dependency identities and sealed selected bytes; never mutate providers. */
  verifyInputs(
    key: PublicationWorkKey,
    record: Record<string, unknown>,
    source: PublicationSourceDescriptor,
    approval: PublicationApproval,
    config: PublicationPublishingConfigData
  ): Promise<void>;
  recordAudit?(row: PublicationSyncModel): Promise<void>;
  prepareWorkflowTransition?(
    record: Record<string, unknown>,
    rule: import('../../configmodels/PublicationPublishing').PublicationWorkflowRule
  ): Promise<PublicationWorkflowTransition>;
  now?: () => number;
  random?: () => number;
}
export interface PublicationJob {
  attrs?: { data?: unknown };
  touch?: () => Promise<unknown>;
}
export function publicationJobKey(data: unknown): PublicationWorkKey | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const brandId: unknown = Reflect.get(data, 'brandId');
  const oid: unknown = Reflect.get(data, 'oid');
  const destinationId: unknown = Reflect.get(data, 'destinationId');
  if (![brandId, oid, destinationId].every(value => typeof value === 'string' && value.trim())) return undefined;
  if (typeof brandId !== 'string' || typeof oid !== 'string' || typeof destinationId !== 'string') return undefined;
  return { brandId, oid, destinationId };
}
function approvalFor(record: Record<string, unknown>, row: PublicationSyncModel): PublicationApproval | undefined {
  return publicationState(record)?.approvals.find(
    approval => approval.id === row.approvalId && approval.epoch === row.approvalEpoch
  );
}
/** Destination enablement is independent of approved siblings; the fixed set itself is never reduced. */
export function assertPublicationAuthority(
  record: Record<string, unknown>,
  row: PublicationSyncModel,
  config: PublicationPublishingConfigData,
  approval: PublicationApproval
): void {
  const state = publicationState(record);
  const intent = state?.intents[row.destinationId];
  const destination = config.destinations[row.destinationId];
  if (!config.processing.enabled || !destination?.enabled || destination.archived)
    throw new PublicationStopped('paused', 'processing_disabled');
  if (approval.revokedAt || !approvalFor(record, row) || approvalFor(record, row)?.revokedAt)
    throw new PublicationStopped('revoked', 'approval_revoked');
  if (
    state?.revision !== row.sourceRevision ||
    approval.sourceRevision !== row.sourceRevision ||
    intent?.generation !== row.sourceGeneration ||
    intent.approvalId !== row.approvalId ||
    intent.approvalEpoch !== row.approvalEpoch ||
    intent.sourceRevision !== row.sourceRevision ||
    !approval.destinationIds.includes(row.destinationId) ||
    approval.source.digest !== row.source?.digest ||
    approval.source.key !== row.source?.key ||
    approval.source.disk !== row.source?.disk ||
    approval.configurationDigests[row.destinationId] !== row.configurationDigest ||
    approval.targetFingerprints[row.destinationId] !== row.targetFingerprint
  )
    throw new PublicationStopped('superseded', 'source_changed');
  const policy = config.sourcePolicies.find(entry => entry.id === approval.policy.id);
  if (
    !policy ||
    !approval.destinationIds.every(id => policy.destinations.includes(id)) ||
    publicationDigest({ ...policy, destinations: [...approval.destinationIds].sort() }) !==
      publicationDigest(approval.policy) ||
    get(record, 'metaMetadata.type') !== policy.recordType ||
    !publicationCondition(policy.continuationCondition, row.oid, record)
  )
    throw new PublicationStopped('revoked', 'continuation_policy_changed');
}

/** Re-evaluate declared live inputs, while retaining approved generated values/crosswalk snapshots. */
export async function verifyPublicationInputs(
  runtime: Pick<PublicationRuntime, 'registry' | 'staging'>,
  key: PublicationWorkKey,
  record: Record<string, unknown>,
  source: PublicationSourceDescriptor,
  approval: PublicationApproval,
  config: PublicationPublishingConfigData
): Promise<void> {
  const destination = config.destinations[key.destinationId];
  const provider = runtime.registry.get(destination.provider);
  const prepared = source.relatedInputs[`${key.destinationId}:prepared`];
  if (!provider?.prepareSource || !isPublicationObject(prepared) || !isPublicationObject(prepared.value))
    throw new PublicationStopped('repair_required', 'source_adapter_unavailable');
  const content = publicationContentRecord(record);
  if (!isPublicationObject(content)) throw new PublicationStopped('repair_required', 'invalid_source_content');
  const input = {
    ...key,
    configuration: destination,
    record: content,
    requester: approval.requester,
    approver: approval.approver,
    generatedValues: source.generatedValues,
  };
  const current = await provider.prepareSource(input);
  if (!current.valid || publicationDigest(current.value) !== prepared.version)
    throw new PublicationStopped('superseded', 'provider_inputs_changed');
  const dependencies = provider.describeSource ? await provider.describeSource(input, current.value) : undefined;
  const contract = source.adapterContracts[key.destinationId];
  if ((dependencies?.mappingContextVersion ?? 1) !== contract.mappingContextVersion)
    throw new PublicationStopped('superseded', 'mapping_contract_changed');
  if (
    publicationDigest([...(dependencies?.managedFields ?? [])].sort()) !==
    publicationDigest(source.managedFields[key.destinationId])
  )
    throw new PublicationStopped('superseded', 'managed_fields_changed');
  const expectedRelated = Object.fromEntries(
    Object.entries(source.relatedInputs).filter(
      ([name]) =>
        name.startsWith(`${key.destinationId}:`) &&
        ![`${key.destinationId}:prepared`, `${key.destinationId}:selection`].includes(name)
    )
  );
  const related = Object.fromEntries(
    Object.entries(dependencies?.relatedInputs ?? {}).map(([name, snapshot]) => {
      if (snapshot.brandId !== key.brandId) throw new PublicationStopped('superseded', 'related_input_brand_changed');
      return [`${key.destinationId}:${name}`, { id: snapshot.id, version: snapshot.version, value: snapshot.value }];
    })
  );
  if (publicationDigest(expectedRelated) !== publicationDigest(related))
    throw new PublicationStopped('superseded', 'related_inputs_changed');
  const selection = source.relatedInputs[`${key.destinationId}:selection`];
  const selected = {
    attachments: (dependencies?.attachments ?? []).map(({ id, logicalPath }) => ({ id, logicalPath })),
  };
  if (isPublicationObject(selection)) {
    if (publicationDigest(selected) !== publicationDigest(selection.value))
      throw new PublicationStopped('superseded', 'attachment_selection_changed');
  } else if (selected.attachments.length || source.attachments.length)
    throw new PublicationStopped('repair_required', 'sealed_attachment_selection_unavailable');
  // A shared descriptor can contain attachments selected by other destinations. Check this adapter's selection
  // and every approved byte source it consumes; never rebuild publication content from a mutable stream.
  for (const live of dependencies?.attachments ?? []) {
    const selected = source.attachments.find(item => item.id === live.id && item.logicalPath === live.logicalPath);
    if (!selected) throw new PublicationStopped('superseded', 'attachment_selection_changed');
    const replaced = publicationState(record)?.contentReplacements?.some(
      change =>
        change.sourceRevision === source.sourceRevision &&
        change.before.some(
          (entry, i) =>
            isPublicationObject(entry) &&
            entry.type === 'attachment' &&
            entry.fileId === selected.id &&
            isPublicationObject(change.after[i]) &&
            change.after[i].type === 'url'
        )
    );
    if (replaced && selected.staged) continue; // The original is reclaimable; the sealed recovery copy remains verified below.
    const identity = await live.inspect();
    if (
      identity.size !== selected.size ||
      (selected.digest && identity.digest && identity.digest !== selected.digest) ||
      (selected.immutableVersion && identity.immutableVersion !== selected.immutableVersion) ||
      (!selected.staged && !selected.immutableVersion && identity.digest !== selected.digest)
    )
      throw new PublicationStopped('superseded', 'attachment_bytes_changed');
  }
  for (const attachment of source.attachments) {
    if (attachment.staged)
      await runtime.staging(attachment.staged.disk).verify(key.brandId, attachment.staged, attachment.size);
  }
}

export async function validatePublicationRequest(
  runtime: PublicationRuntime,
  row: PublicationSyncModel,
  mutation: boolean,
  source?: PublicationSourceDescriptor,
  approval?: PublicationApproval,
  checkInputs = true
): Promise<Record<string, unknown>> {
  const key = { brandId: row.brandId, oid: row.oid, destinationId: row.destinationId };
  const provider = runtime.registry.get(row.providerId);
  if (!provider) throw new PublicationStopped('repair_required', 'provider_unavailable');
  assertFullPublicationStorageCapability(runtime.storage);
  let current: PublicationPublishingConfigData | undefined;
  try {
    current = await runtime.configuration(key.brandId);
  } catch {
    throw new PublicationStopped('paused', 'configuration_unavailable');
  }
  if (!current) throw new PublicationStopped('paused', 'brand_authority_changed');
  const target = current.destinations[key.destinationId];
  if (
    !target ||
    target.provider !== row.providerId ||
    provider.id !== row.providerId ||
    provider.targetFingerprint(target) !== row.targetFingerprint
  )
    throw new PublicationStopped('repair_required', 'target_identity_changed');
  const fresh = await runtime.storage.getMeta(key.oid);
  if (!fresh) throw new PublicationStopped('revoked', 'record_deleted');
  const record: Record<string, unknown> = { ...fresh };
  if (get(record, 'metaMetadata.brandId') !== key.brandId)
    throw new PublicationStopped('revoked', 'record_brand_changed');
  try {
    await runtime.assertAccess(key.brandId, record, current);
  } catch {
    throw new PublicationStopped('revoked', 'service_access_denied');
  }
  if (!mutation) return record;
  if (!approval || !source) throw new PublicationStopped('repair_required', 'source_unavailable');
  assertPublicationAuthority(record, row, current, approval);
  const contract = source.adapterContracts[key.destinationId];
  if (
    !contract ||
    contract.providerId !== row.providerId ||
    contract.contractVersion !== provider.contractVersion ||
    publicationDigest(source.materialConfiguration[key.destinationId]) !==
      publicationDigest(
        publicationMaterialConfiguration({
          id: key.destinationId,
          provider,
          configuration: target,
          targetFingerprint: row.targetFingerprint,
          mappingContextVersion: contract.mappingContextVersion,
          managedFields: source.managedFields[key.destinationId],
        })
      )
  )
    throw new PublicationStopped('superseded', 'material_configuration_changed');
  const inputs = publicationWorkflowInputs(
    publicationProjectionInputs(
      publicationReplacementInputs(record, row.sourceRevision),
      source,
      runtime.registry,
      current
    ),
    row
  );
  if (publicationDigest(publicationContentRecord(inputs)) !== publicationDigest(source.metadata))
    throw new PublicationStopped('superseded', 'source_content_changed');
  if (checkInputs) {
    await runtime.verifyInputs(key, inputs, source, approval, current);
    // Dependency preparation can be slow. Re-read current source/configuration/access before sending,
    // even when no dispatcher has imported the source change into the leased row yet.
    await validatePublicationRequest(runtime, row, true, source, approval, false);
  }
  return record;
}

/** Queue payload is only a wake-up; all source authority comes from storage under the destination lease. */
export async function runPublicationWorker(runtime: PublicationRuntime, job: PublicationJob): Promise<void> {
  const key = publicationJobKey(job.attrs?.data);
  if (!key) return;
  assertFullPublicationStorageCapability(runtime.storage);
  const config = await runtime.configuration(key.brandId);
  if (!config) return;
  const destination = config.destinations[key.destinationId];
  const provider = destination && runtime.registry.get(destination.provider);
  if (!provider?.execute) throw new Error('Publication execution adapter is unavailable');
  const settings = config.processing;
  if (settings.heartbeatMs <= 0 || settings.leaseMs < 3 * settings.heartbeatMs)
    throw new Error('Publication lease must cover three heartbeat intervals');
  await runtime.store.ensureIndexes();
  await runtime.resources.ensureIndexes();
  const claimed = await runtime.store.claim(key, randomUUID(), settings.leaseMs);
  if (!claimed) return;
  const now = runtime.now ?? Date.now;
  let source: PublicationSourceDescriptor | undefined;
  let approval: PublicationApproval | undefined;
  let recovery = false;
  const load = async (reference: PublicationSourceReference) =>
    reopenPublicationSource(key.brandId, reference, runtime.staging(reference.disk));
  const validate = (row: PublicationSyncModel, mutation: boolean, checkInputs = true) =>
    validatePublicationRequest(runtime, row, mutation, source, approval, checkInputs).then(() => {});
  const execution = new PublicationExecution(
    claimed,
    runtime.store,
    runtime.resources,
    runtime.registry,
    settings,
    validate
  );
  const kinds: PublicationWorkKind[] = ['synchronise', 'maintenance', 'observe'];
  const kind =
    kinds.find(
      item =>
        claimed.work[item].requested > claimed.work[item].processed &&
        claimed.work[item].dueAt !== null &&
        claimed.work[item].dueAt! <= now()
    ) ?? 'synchronise';
  const expected = claimed.work[kind].requested;
  const patchOutcome = async (outcome: PublicationProviderOutcome<PublicationObject>, hostFailure = false) => {
    // Historical reconciliation may only close journal/state evidence, never current completion or obligations.
    if (!hostFailure) {
      await execution.assertAuthority();
      await execution.acceptOutcome(outcome);
      await execution.checkpoint(outcome.state);
    }
    await execution.patch(row => {
      if (
        hostFailure &&
        (row.sourceGeneration !== claimed.sourceGeneration ||
          row.approvalId !== claimed.approvalId ||
          row.approvalEpoch !== claimed.approvalEpoch)
      )
        return {};
      const work = cloneDeep(row.work);
      const item = work[kind];
      const unchanged = item.requested === expected;
      const episodes = cloneDeep(row.retryEpisodes ?? {});
      if (row.retry) episodes[row.retry.kind ?? 'synchronise'] ??= row.retry;
      const recoveredRetry = () => {
        delete episodes[kind];
        return episodes.synchronise ?? episodes.observe ?? episodes.maintenance;
      };
      if (outcome.kind === 'completed') {
        if (row.operations.some(publicationOperationRequiresRecovery))
          throw new PublicationStopped('repair_required', 'unresolved_operation');
        const evidence = outcome.evidence;
        if (
          evidence.approvalId !== claimed.approvalId ||
          evidence.approvalEpoch !== claimed.approvalEpoch ||
          evidence.sourceGeneration !== claimed.sourceGeneration ||
          evidence.sourceDigest !== claimed.sourceDigest ||
          !row.binding ||
          row.binding.namespace !== evidence.remote.namespace ||
          row.binding.objectId !== evidence.remote.objectId
        )
          throw new PublicationStopped('repair_required', 'completion_identity_mismatch');
        item.processed = Math.max(item.processed, expected);
        if (unchanged) item.dueAt = null;
        return {
          work,
          status: 'completed',
          completion: evidence,
          workflowPending: true,
          links: outcome.links,
          waitingReason: undefined,
          retry: recoveredRetry(),
          retryEpisodes: episodes,
          audit: closePublicationAudit(row, 'completed', now()),
        };
      }
      if (outcome.kind === 'waiting') {
        if (unchanged)
          item.dueAt =
            typeof outcome.nextCheckAt === 'number' && Number.isSafeInteger(outcome.nextCheckAt)
              ? Math.max(now() + 1, outcome.nextCheckAt)
              : now() + settings.observationMs;
        return {
          work,
          status: 'waiting',
          waitingReason: outcome.reason,
          retry: episodes[kind]?.exhausted && kind !== 'observe' ? row.retry : recoveredRetry(),
          retryEpisodes: episodes,
        };
      }
      if (outcome.kind === 'repair_required') {
        if (unchanged) item.dueAt = null;
        return {
          work,
          status: 'repair_required',
          waitingReason: outcome.reason,
          audit: closePublicationAudit({ ...row, waitingReason: outcome.reason }, 'repair_required', now()),
        };
      }
      const previous = episodes[kind];
      const attempts = (previous?.attempts ?? 0) + 1;
      const exhausted = attempts >= settings.maxAttempts;
      const delay = Math.min(86400000, settings.retryBaseMs * 2 ** Math.min(attempts - 1, 20));
      const jitter = Math.floor(delay * 0.2 * (runtime.random ?? Math.random)());
      const rateLimit = outcome.retryAfterMs ?? 0;
      if (!Number.isSafeInteger(rateLimit) || rateLimit < 0 || !Number.isSafeInteger(now() + rateLimit))
        throw new PublicationStopped('repair_required', 'invalid_retry_deadline');
      if (unchanged) item.dueAt = exhausted ? null : now() + Math.max(Math.min(86400000, delay + jitter), rateLimit);
      const retry = {
        kind,
        category: outcome.category,
        attempts,
        firstAt: previous?.firstAt ?? new Date(now()).toISOString(),
        lastAt: new Date(now()).toISOString(),
        exhausted,
      };
      episodes[kind] = retry;
      return {
        work,
        status: exhausted ? 'failed' : 'retrying',
        waitingReason: outcome.category,
        retry,
        retryEpisodes: episodes,
        ...(exhausted
          ? { audit: closePublicationAudit({ ...row, waitingReason: outcome.category }, 'failed', now()) }
          : {}),
      };
    }, !hostFailure);
    if (outcome.kind === 'completed') {
      try {
        const workflowDone = await evaluatePublicationWorkflow(runtime, key);
        const replacementDone = await applyPublicationContentReplacement(runtime, key);
        if (workflowDone && replacementDone) await runtime.store.acknowledgeWorkflow(execution.state);
      } catch {
        // The local obligation was checkpointed with completion. Dispatch retries coordination,
        // independently of the confirmed remote deposit and its transport retry episode.
      }
    }
  };
  try {
    execution.startHeartbeat(job.touch?.bind(job), () => !!source && !!approval);
    if (runtime.recordAudit && claimed.audit) await runtime.recordAudit(claimed);
    await execution.patch(row =>
      row.sourceGeneration === claimed.sourceGeneration ? { audit: beginPublicationAudit(row, now()) } : {}
    );
    if (runtime.recordAudit) await runtime.recordAudit(execution.state);
    await validate(claimed, false);
    if (claimed.providerId !== provider.id || !claimed.source)
      throw new PublicationStopped('repair_required', 'source_unavailable');
    source = await load(claimed.source);
    if (
      source.oid !== key.oid ||
      source.sourceRevision !== claimed.sourceRevision ||
      source.targets[key.destinationId] !== claimed.targetFingerprint ||
      !source.destinationIds.includes(key.destinationId)
    )
      throw new PublicationStopped('repair_required', 'sealed_source_identity_mismatch');
    const record = await runtime.storage.getMeta(key.oid);
    approval = record && approvalFor({ ...record }, claimed);
    if (!approval) throw new PublicationStopped('revoked', 'approval_unavailable');
    try {
      await execution.upgradeState();
    } catch (error) {
      if (error instanceof PublicationLeaseLost || error instanceof PublicationStopped) throw error;
      throw new PublicationStopped('repair_required', 'provider_state_unreadable');
    }
    const prepared = source.relatedInputs[`${key.destinationId}:prepared`];
    if (!isPublicationObject(prepared) || !isPublicationObject(prepared.value))
      throw new PublicationStopped('repair_required', 'prepared_source_unavailable');
    const sealedSource = source;
    const approved = approval;
    const preparedSource = prepared.value;
    const context: PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject> = {
      ...key,
      configuration: cloneDeep(destination),
      credentials: cloneDeep(destination.connection),
      state: execution.state.providerState,
      prepared: cloneDeep(prepared.value),
      approval: cloneDeep(approval),
      sourceGeneration: claimed.sourceGeneration,
      workKind: kind,
      source: cloneDeep(source),
      recoverySources: [],
      operations: cloneDeep(claimed.operations),
      binding: cloneDeep(claimed.binding),
      recovery: false,
      persistenceIdentity: { username: settings.serviceUsername, userType: settings.serviceUserType },
      signal: execution.abort.signal,
      assertAuthority: () => execution.assertAuthority(),
      project: fields => {
        if (recovery) execution.rejectProposal(new PublicationStopped('revoked', 'reconciliation_is_read_only'));
        const projection = {
          ...key,
          sourceRevision: approved.sourceRevision,
          approvalId: approved.id,
          approvalEpoch: approved.epoch,
          generation: claimed.sourceGeneration,
          persistenceIdentity: { username: settings.serviceUsername, userType: settings.serviceUserType },
          allowedPaths: [...(provider.sourceMaintenancePaths?.(destination) ?? [])],
          fields,
        };
        execution.validateProposal(() => assertPublicationProjection(runtime.storage, projection));
        return applyPublicationProjection({
          storage: runtime.storage,
          projection,
          assertProposal: () =>
            execution.validateProposal(() => {
              if (execution.abort.signal.aborted) throw execution.abort.signal.reason;
            }),
          assertAuthority: async () => {
            await execution.assertAuthority();
            const current = await runtime.configuration(key.brandId);
            if (!current) return execution.rejectProposal(new PublicationStopped('paused', 'brand_authority_changed'));
            projection.persistenceIdentity = {
              username: current.processing.serviceUsername,
              userType: current.processing.serviceUserType,
            };
          },
        });
      },
      checkpoint: (state, operationIds) => execution.checkpoint(state, recovery, operationIds),
      bind: binding => execution.bind(binding),
      journal: operation => execution.journal(operation),
      openAttachment: async (id, logicalPath) => {
        await execution.assertAuthority();
        const selected = sealedSource.attachments.find(item => item.id === id && item.logicalPath === logicalPath);
        if (!selected)
          return execution.rejectProposal(new Error('Attachment is outside the approved publication selection'));
        const current = await runtime.configuration(key.brandId);
        if (!current) return execution.rejectProposal(new PublicationStopped('paused', 'brand_authority_changed'));
        const dependencies = provider.describeSource
          ? await provider.describeSource(
              {
                ...key,
                configuration: current.destinations[key.destinationId],
                record: sealedSource.metadata,
                requester: approved.requester,
                approver: approved.approver,
                generatedValues: sealedSource.generatedValues,
              },
              preparedSource
            )
          : undefined;
        const live = dependencies?.attachments.find(item => item.id === id && item.logicalPath === logicalPath);
        return runtime.staging(approved.source.disk).openAttachment(key.brandId, selected, live);
      },
      idempotencyKey: operation => execution.idempotencyKey(operation),
      mutate: (operation, send) => {
        if (recovery) execution.rejectProposal(new PublicationStopped('revoked', 'reconciliation_is_read_only'));
        if (kind === 'observe')
          execution.rejectProposal(new PublicationStopped('repair_required', 'observation_is_read_only'));
        return execution.mutate(operation, send);
      },
      withResourceLease: (namespace, resource, run) => {
        if (!provider.capabilities.resourceLeases)
          execution.rejectProposal(new Error('Provider does not declare shared resources'));
        return execution.withResourceLease(namespace, resource, run);
      },
      audit: async summary => {
        // Provider details remain bounded internal evidence; ordinary audit events use an allow-listed projection.
        await execution.patch(
          row => {
            if (row.sourceGeneration !== claimed.sourceGeneration) return {};
            const audit = row.audit ?? beginPublicationAudit(row, now());
            const summaries = [...(audit.summaries ?? [])];
            if (!summaries.some(item => publicationDigest(item) === publicationDigest(summary)))
              summaries.push(cloneDeep(summary));
            return { audit: { ...audit, summaries: summaries.slice(-20) } };
          },
          false,
          'proposal'
        );
      },
    };
    await context.audit({ category: 'started', message: 'Publication work started' });
    const unresolved = claimed.operations.some(publicationOperationRequiresRecovery);
    if (unresolved) {
      recovery = true;
      context.recovery = true;
      context.recoverySources = await Promise.all(claimed.recoverySources.map(load));
      const result = await provider.execute(
        'reconcile',
        context,
        execution.state.providerStateVersion,
        execution.proposal
      );
      if (result.kind === 'completed') await execution.acceptOutcome(result);
      await execution.checkpoint(result.state, true);
      if (result.kind === 'repair_required')
        await context.audit({ category: 'repair_required', message: result.reason, evidence: result.evidence });
      if (execution.state.operations.some(publicationOperationRequiresRecovery)) {
        if (result.kind === 'waiting' || result.kind === 'repair_required') {
          await patchOutcome(result);
          return;
        }
        throw new PublicationStopped('repair_required', 'unresolved_operation');
      }
      // Respect the provider's recovery outcome. A later due run resumes from confirmed checkpoints;
      // reconciliation cannot silently turn a wait or a repair into another mutation.
      await patchOutcome(result);
      return;
    }
    await execution.assertAuthority();
    if (kind !== 'synchronise' && !provider.capabilities.observe)
      throw new PublicationStopped('repair_required', 'provider_observation_unavailable');
    const outcome = await provider.execute(
      kind === 'synchronise' ? 'synchronise' : 'observe',
      context,
      execution.state.providerStateVersion,
      execution.proposal
    );
    if (outcome.kind === 'repair_required')
      await context.audit({ category: 'repair_required', message: outcome.reason, evidence: outcome.evidence });
    await patchOutcome(outcome);
  } catch (error) {
    if (error instanceof PublicationLeaseLost) return;
    if (error instanceof PublicationResourceBusy && !execution.abort.signal.aborted) {
      // A busy shared resource is a host scheduling outcome. Never accept the
      // refused adapter's state or acknowledge its work while deferring it.
      await execution.patch(row => {
        if (row.sourceGeneration !== claimed.sourceGeneration) return {};
        const work = cloneDeep(row.work);
        if (work[kind].requested === expected) work[kind].dueAt = now() + settings.observationMs;
        return { work, status: 'waiting', waitingReason: 'resource_busy' };
      });
      return;
    }
    let stopped =
      error instanceof PublicationStopped
        ? error
        : error instanceof PublicationInvocationEnded
          ? new PublicationStopped('repair_required', 'provider_invocation_ended')
          : execution.abort.signal.reason instanceof PublicationStopped
            ? execution.abort.signal.reason
            : undefined;
    if (!stopped) {
      try {
        if (execution.proposal.failure) {
          // A datastore/read failure can end an adapter invocation without
          // revoking the request. Revalidate for host scheduling only; its
          // rejected state and callbacks remain fenced by the shared verdict.
          await runtime.store.assertOwner(claimed, execution.lease);
          await validate(execution.state, false);
        } else await execution.assertAuthority();
      } catch (authorityError) {
        if (authorityError instanceof PublicationLeaseLost) return;
        stopped =
          authorityError instanceof PublicationStopped
            ? authorityError
            : new PublicationStopped('repair_required', 'authority_unavailable');
      }
    }
    if (stopped) {
      await execution.patch(row => {
        // Never consume/relabel a newer imported request, including on a CAS reload.
        if (row.sourceGeneration !== claimed.sourceGeneration) return {};
        const work = cloneDeep(row.work);
        for (const item of Object.values(work)) item.dueAt = stopped.status === 'paused' ? now() + 300000 : null;
        return {
          work,
          status: stopped.status,
          waitingReason: stopped.reason,
          ...(['revoked', 'superseded', 'repair_required', 'failed'].includes(stopped.status)
            ? { audit: closePublicationAudit({ ...row, waitingReason: stopped.reason }, stopped.status, now()) }
            : {}),
        };
      });
    } else {
      // A submitted call always reconciles on the next run, regardless of the transport's retry category.
      await patchOutcome(
        {
          kind: 'retryable_failure',
          state: execution.state.providerState,
          category: 'provider_or_configuration',
          message: 'Publication processing failed',
        },
        !!execution.proposal.failure
      );
    }
  } finally {
    // A failed projection leaves durable episode metadata for the dispatcher's bounded replay scan.
    try {
      if (runtime.recordAudit) await runtime.recordAudit(execution.state);
    } finally {
      await execution.close();
    }
  }
}
