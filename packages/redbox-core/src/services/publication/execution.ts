import { cloneDeep } from 'lodash';
import { PublicationProposal } from './proposal';
import {
  assertPublicationCompletionOperations,
  assertPublicationOperationEvidence,
  PublicationEvidenceMismatch,
  publicationOperationEvidence,
  publicationOperationIdempotencyKey,
  publicationOperationRequiresRecovery,
} from './operations';
import { publicationDigest } from './canonical';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type {
  PublicationResourceKey,
  PublicationResourceLeaseModel,
} from '../../model/storage/PublicationResourceLeaseModel';
import type { PublicationProcessing } from '../../configmodels/PublicationPublishing';
import type {
  PublicationObject,
  PublicationOperation,
  PublicationBinding,
  PublicationResourceExecution,
  PublicationProviderOutcome,
} from './contracts';
import {
  PublicationBindingConflict,
  PublicationLeaseLost,
  PublicationStoreConflict,
  type PublicationLease,
} from './ownership';
import { PublicationSyncStore, recordOperation, type PublicationCheckpoint } from './store';
import { PublicationResourceStore } from './resource-store';
import type { PublicationProviderRegistry } from './registry';

export class PublicationStopped extends Error {
  constructor(
    readonly status: 'paused' | 'revoked' | 'superseded' | 'repair_required',
    readonly reason: string
  ) {
    super(reason);
    this.name = 'PublicationStopped';
  }
}
export class PublicationResourceBusy extends Error {
  constructor() {
    super('publication_resource_busy');
  }
}
export const unresolvedPublicationOperation = (operation: PublicationOperation): boolean =>
  operation.outcome === 'submitted' || operation.outcome === 'uncertain';

/** Checkpoints serialize; independent heartbeats remain live through slow source checks and transports. */
/** Host-owned publication implementation; extend through PublicationService and adapter contexts. @internal */
export class PublicationExecution {
  readonly abort = new AbortController();
  readonly proposal = new PublicationProposal();
  private lane: Promise<void> = Promise.resolve();
  private resourceLane: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private heartbeatPending = false;
  private heartbeatRow: PublicationSyncModel;
  private heartbeatTask?: Promise<void>;
  private authorityTask?: Promise<void>;
  private resource?: { key: PublicationResourceKey; row: PublicationResourceLeaseModel; lease: PublicationLease };
  private sending = false;
  private rejection?: Error;
  readonly snapshot: PublicationSyncModel;
  readonly lease: PublicationLease;
  constructor(
    private row: PublicationSyncModel,
    readonly store: PublicationSyncStore,
    private readonly resources: PublicationResourceStore,
    private readonly registry: PublicationProviderRegistry,
    private readonly settings: PublicationProcessing,
    private readonly validate: (row: PublicationSyncModel, mutation: boolean) => Promise<void>
  ) {
    if (!row.lease) throw new PublicationLeaseLost();
    this.snapshot = cloneDeep(row);
    this.heartbeatRow = cloneDeep(row);
    this.lease = cloneDeep(row.lease);
  }
  get state(): PublicationSyncModel {
    return cloneDeep(this.row);
  }
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.lane.then(run);
    this.lane = result.then(
      () => {},
      () => {}
    );
    return result;
  }
  private serialResource<T>(run: () => Promise<T>): Promise<T> {
    const result = this.resourceLane.then(run);
    this.resourceLane = result.then(
      () => {},
      () => {}
    );
    return result;
  }
  /** A caught host validation refusal cannot authorize another callback or returned state. */
  private assertAccepted(): void {
    if (this.rejection) throw this.rejection;
    this.proposal.assertAccepted();
  }
  rejectProposal(error: unknown): never {
    this.rejection ??= error instanceof Error ? error : new Error('Publication proposal rejected');
    this.abort.abort(
      this.rejection instanceof PublicationStopped
        ? this.rejection
        : this.rejection instanceof PublicationBindingConflict
          ? new PublicationStopped(
              'repair_required',
              this.row.providerId === 'oni' ? 'oni_remote_binding_conflict' : this.rejection.message
            )
          : new PublicationStopped('repair_required', 'provider_proposal_rejected')
    );
    throw this.rejection;
  }
  validateProposal<T>(validate: () => T): T {
    this.assertAccepted();
    try {
      return validate();
    } catch (error) {
      return this.rejectProposal(error);
    }
  }
  private async reload(): Promise<void> {
    await this.store.assertOwner(this.snapshot, this.lease);
    const row = await this.store.get(this.snapshot);
    if (!row) throw new PublicationLeaseLost();
    this.row = row;
    await this.store.assertOwner(this.snapshot, this.lease);
  }
  private sameRequest(): void {
    if (
      this.row.sourceGeneration !== this.snapshot.sourceGeneration ||
      this.row.approvalId !== this.snapshot.approvalId ||
      this.row.approvalEpoch !== this.snapshot.approvalEpoch
    )
      throw new PublicationStopped('superseded', 'newer_request');
  }
  private async change(
    write: (row: PublicationSyncModel) => Promise<PublicationSyncModel>,
    guard: 'current' | 'evidence' | 'owner' | 'proposal'
  ): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
      await this.store.assertOwner(this.snapshot, this.lease);
      if (guard !== 'owner') this.assertAccepted();
      if (guard === 'current' || guard === 'evidence') {
        if (
          this.abort.signal.aborted &&
          (guard === 'current' || !(this.abort.signal.reason instanceof PublicationStopped))
        )
          throw this.abort.signal.reason;
        this.sameRequest();
        await this.validate(this.row, guard === 'current');
        // Renewal is independent of slow validation. Use its latest revision without replaying an
        // already validated provider step, and fence a request imported while validation was pending.
        await this.reload();
        this.sameRequest();
      }
      try {
        // A different callback may have refused the invocation while validation
        // or ownership reads were awaiting I/O. Check again before starting a write.
        if (guard !== 'owner') this.assertAccepted();
        if (guard === 'current' && this.abort.signal.aborted) throw this.abort.signal.reason;
        this.row = await write(this.row);
        return;
      } catch (error) {
        if (!(error instanceof PublicationStoreConflict)) throw error;
        // An importer/dispatch/request may advance revision while this token still owns the lease.
        await this.reload();
        if (guard === 'current' || guard === 'evidence') await this.validate(this.row, false);
      }
    }
    throw new PublicationStoreConflict();
  }
  async assertAuthority(): Promise<void> {
    try {
      await this.serial(async () => {
        this.assertAccepted();
        await this.reload();
        if (this.abort.signal.aborted) throw this.abort.signal.reason;
        this.sameRequest();
        await this.validate(this.row, true);
        // Source validation may be slow. An import can replace the request without replacing our lease.
        await this.reload();
        this.sameRequest();
        if (this.abort.signal.aborted) throw this.abort.signal.reason;
        if (this.resource) await this.resources.assertOwner(this.resource.key, this.row.brandId, this.resource.lease);
        await this.store.assertOwner(this.snapshot, this.lease);
      });
    } catch (error) {
      this.rejectProposal(error);
    }
  }
  startHeartbeat(touch?: () => Promise<unknown>, sourceReady: () => boolean = () => true): void {
    this.timer = setInterval(() => {
      if (this.heartbeatPending) return;
      this.heartbeatPending = true;
      this.heartbeatTask = (async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            this.heartbeatRow = await this.store.renew(
              this.snapshot,
              this.lease,
              this.heartbeatRow.revision,
              this.settings.leaseMs
            );
            break;
          } catch (error) {
            if (!(error instanceof PublicationStoreConflict) || attempt >= 29) throw error;
            await this.store.assertOwner(this.snapshot, this.lease);
            const fresh = await this.store.get(this.snapshot);
            if (!fresh) throw new PublicationLeaseLost();
            this.heartbeatRow = fresh;
          }
        }
        const resource = this.resource;
        if (resource)
          await this.serialResource(async () => {
            if (this.resource !== resource) return;
            resource.row = await this.resources.renew(
              resource.key,
              this.snapshot.brandId,
              resource.lease,
              resource.row.revision,
              this.settings.leaseMs
            );
          });
        // Do not let slow dependency/account checks or Agenda touch starve ownership renewal.
        if (!this.authorityTask) {
          const fresh = cloneDeep(this.heartbeatRow);
          this.authorityTask = (async () => {
            await this.validate(fresh, false);
            if (
              fresh.sourceGeneration !== this.snapshot.sourceGeneration ||
              fresh.approvalId !== this.snapshot.approvalId ||
              fresh.approvalEpoch !== this.snapshot.approvalEpoch
            )
              throw new PublicationStopped('superseded', 'newer_request');
            if (sourceReady()) await this.validate(fresh, true);
            if (touch) await touch();
          })()
            .catch(error => this.abort.abort(error))
            .finally(() => {
              this.authorityTask = undefined;
            });
        }
      })()
        .catch(error => this.abort.abort(error))
        .finally(() => {
          this.heartbeatPending = false;
        });
    }, this.settings.heartbeatMs);
    this.timer.unref();
  }
  async checkpoint(state: PublicationObject, recovery = false, operationIds: readonly string[] = []): Promise<void> {
    state = cloneDeep(state);
    operationIds = [...operationIds];
    await this.serial(async () => {
      this.assertAccepted();
      await this.reload();
      this.validateProposal(() => {
        for (const id of operationIds)
          if (!this.row.operations.some(op => op.id === id && op.outcome === 'confirmed'))
            throw new Error('Only confirmed publication operations can be checkpointed');
        this.registry.decodeState(this.row.providerId, state, this.row.providerStateVersion);
      });
      for (const id of operationIds) {
        const operation = this.row.operations.find(op => op.id === id);
        if (operation?.outcome === 'confirmed') await this.verifyEvidence(this.row, operation, operation.confirmation);
      }
      try {
        await this.change(
          row => this.store.checkpointProviderState(row, this.lease, row.revision, state, this.registry, operationIds),
          recovery ? 'evidence' : 'current'
        );
      } catch (error) {
        if (error instanceof PublicationStopped) this.rejectProposal(error);
        // An acknowledged datastore write can lose its response. Never overwrite
        // its newer provider evidence with the caller's preceding checkpoint.
        await this.reload();
        this.sameRequest();
        if (
          publicationDigest(this.row.providerState) !== publicationDigest(state) ||
          operationIds.some(id => !this.row.operations.some(op => op.id === id && op.checkpointed === true))
        )
          throw error;
      }
    });
  }
  async upgradeState(): Promise<void> {
    await this.serial(() =>
      this.change(row => this.store.upgradeProviderState(row, this.lease, row.revision, this.registry), 'evidence')
    );
  }
  async bind(binding: PublicationBinding): Promise<void> {
    await this.serial(async () => {
      this.assertAccepted();
      this.validateProposal(() => {
        if (!binding.namespace.trim() || !binding.objectId.trim())
          throw new Error('Canonical publication remote identity is required');
        if (binding.targetFingerprint !== this.row.targetFingerprint)
          throw new Error('Publication binding target mismatch');
        if (
          this.row.binding &&
          (this.row.binding.namespace !== binding.namespace || this.row.binding.objectId !== binding.objectId)
        )
          throw new Error('Publication binding replacement requires administrative repair');
      });
      try {
        await this.change(row => this.store.bind(row, this.lease, row.revision, binding), 'current');
      } catch (error) {
        if (error instanceof PublicationBindingConflict || error instanceof PublicationStopped)
          this.rejectProposal(error);
        throw error;
      }
    });
  }
  async patch(
    patch: (row: PublicationSyncModel) => PublicationCheckpoint,
    current = false,
    guard: 'owner' | 'proposal' = 'owner'
  ): Promise<void> {
    await this.serial(() =>
      this.change(row => this.store.checkpoint(row, this.lease, row.revision, patch(row)), current ? 'current' : guard)
    );
  }
  private async restoreResourceReceipt(operation: PublicationOperation): Promise<void> {
    const resource = this.resource;
    if (!resource || resource.row.operations.some(entry => entry.operation.id === operation.id)) return;
    const retained = this.row.operations.find(entry => entry.id === operation.id);
    if (!retained) return;
    this.validateProposal(() => {
      if (retained.outcome !== 'confirmed') throw new Error('Only mutate may submit a publication resource operation');
      // Validate proposed evidence against the exact host-retained receipt before restoring it.
      recordOperation([cloneDeep(retained)], operation);
    });
    resource.row = await this.resources.restoreConfirmed(
      resource.key,
      this.row.brandId,
      resource.lease,
      resource.row.revision,
      { brandId: this.snapshot.brandId, oid: this.snapshot.oid, destinationId: this.snapshot.destinationId },
      retained
    );
  }
  private async journalOwned(operation: PublicationOperation, proposal = false): Promise<void> {
    const resource = this.resource;
    if (resource)
      await this.serialResource(async () => {
        await this.restoreResourceReceipt(operation);
        if (proposal) this.assertAccepted();
        resource.row = await this.resources.journal(
          resource.key,
          this.row.brandId,
          resource.lease,
          resource.row.revision,
          this.snapshot,
          operation
        );
      });
    await this.change(
      row => this.store.journal(row, this.lease, row.revision, operation),
      proposal ? 'proposal' : 'owner'
    );
  }
  async journal(operation: PublicationOperation): Promise<void> {
    operation = cloneDeep(operation);
    await this.serial(async () => {
      await this.reload();
      this.validateProposal(() => {
        const existing = this.row.operations.find(item => item.id === operation.id);
        if (!existing) throw new Error('Only mutate may submit a publication operation');
        recordOperation([cloneDeep(existing)], operation);
      });
      const existing = this.row.operations.find(item => item.id === operation.id)!;
      if (['confirmed', 'not_applied', 'rejected'].includes(operation.outcome))
        await this.verifyEvidence(this.row, existing, operation.confirmation, operation);
      await this.journalOwned(operation, true);
    });
  }
  idempotencyKey(operation: PublicationOperation): string {
    return this.validateProposal(() => publicationOperationIdempotencyKey(this.snapshot, operation));
  }
  private async verifyEvidence(
    work: Parameters<typeof assertPublicationOperationEvidence>[0],
    operation: PublicationOperation,
    evidence: Parameters<typeof assertPublicationOperationEvidence>[2],
    reported: unknown = evidence
  ): Promise<void> {
    try {
      assertPublicationOperationEvidence(work, operation, evidence);
    } catch (error) {
      if (!(error instanceof PublicationEvidenceMismatch)) throw error;
      await this.rejectEvidence(error, reported);
    }
  }
  private async rejectEvidence(error: PublicationEvidenceMismatch, reported: unknown): Promise<never> {
    const stopped = new PublicationStopped('repair_required', error.message);
    this.rejection ??= stopped;
    // Fence immediately, including when persistence loses its response and the adapter catches that error.
    this.abort.abort(stopped);
    await this.change(
      row =>
        this.store.checkpoint(row, this.lease, row.revision, {
          status: 'repair_required',
          waitingReason: error.message,
          operationEvidenceFailures: [
            ...(row.operationEvidenceFailures ?? []),
            {
              operationId: error.operationId,
              field: error.field,
              reported: cloneDeep(reported ?? null),
              at: new Date().toISOString(),
            },
          ],
        }),
      'owner'
    );
    throw stopped;
  }

  /** Validate fresh completion proof even for operations whose transport/checkpoint was previously acknowledged. */
  async acceptOutcome(outcome: PublicationProviderOutcome<PublicationObject>): Promise<void> {
    this.assertAccepted();
    if (this.abort.signal.aborted) throw this.abort.signal.reason;
    if (outcome.kind !== 'completed') return;
    await this.serial(async () => {
      await this.reload();
      try {
        this.assertAccepted();
        assertPublicationCompletionOperations(this.row, this.row.operations, outcome.evidence);
        this.validateProposal(() => {
          if (this.row.operations.some(publicationOperationRequiresRecovery))
            throw new PublicationStopped('repair_required', 'unresolved_operation');
          const evidence = outcome.evidence;
          if (
            evidence.approvalId !== this.snapshot.approvalId ||
            evidence.approvalEpoch !== this.snapshot.approvalEpoch ||
            evidence.sourceGeneration !== this.snapshot.sourceGeneration ||
            evidence.sourceDigest !== this.snapshot.sourceDigest ||
            !this.row.binding ||
            this.row.binding.namespace !== evidence.remote?.namespace ||
            this.row.binding.objectId !== evidence.remote?.objectId
          )
            throw new PublicationStopped('repair_required', 'completion_identity_mismatch');
        });
      } catch (error) {
        if (!(error instanceof PublicationEvidenceMismatch)) throw error;
        await this.rejectEvidence(error, outcome);
      }
    });
  }
  async mutate<Result>(operation: PublicationOperation, send: (key: string) => Promise<Result>): Promise<Result> {
    // A copied receipt cannot choose the key of a new mutation. Persist the host-derived
    // value in both journals so another resource owner never hashes its own work coordinates.
    const {
      idempotencyKey: _providedKey,
      identity: _providedIdentity,
      confirmation: _providedConfirmation,
      ...intent
    } = cloneDeep(operation);
    const key = this.idempotencyKey(intent);
    operation = {
      ...intent,
      idempotencyKey: key,
      identity: publicationOperationEvidence(this.snapshot, intent, this.row.binding),
    };
    this.assertAccepted();
    if (this.sending) this.rejectProposal(new Error('Concurrent publication mutations are forbidden'));
    this.sending = true;
    let submitted = false;
    let invoked = false;
    try {
      await this.assertAuthority();
      await this.serial(async () => {
        this.validateProposal(() => {
          if (this.row.operations.some(item => item.id === operation.id || publicationOperationRequiresRecovery(item)))
            throw new PublicationStopped('repair_required', 'operation_requires_reconciliation');
          if (operation.outcome !== 'submitted') throw new Error('Mutation requires a submitted operation intent');
          if (this.resource?.row.operations.some(entry => unresolvedPublicationOperation(entry.operation)))
            throw new PublicationStopped('repair_required', 'resource_requires_reconciliation');
          recordOperation(cloneDeep(this.row.operations), operation, this.row);
        });
        await this.journalOwned(operation);
        submitted = true;
      });
      // Revalidate after intent persistence, immediately before handing control to the transport.
      await this.assertAuthority();
      invoked = true;
      return await send(key);
    } catch (error) {
      if (submitted) {
        // Even an abort/throw can follow a successful remote commit. Keep uncertainty across restart.
        try {
          // This non-application is host-proven: transport was never invoked, rather than an adapter claim.
          // This is host-owned transport evidence, not another adapter proposal. Retain it
          // even if the authority check refused the proposal before send.
          await this.serial(async () => {
            await this.reload();
            await this.journalOwned({
              ...operation,
              outcome: invoked ? 'uncertain' : 'not_applied',
              ...(!invoked ? { confirmation: operation.identity } : {}),
            });
          });
        } catch (journalError) {
          if (!(journalError instanceof PublicationLeaseLost)) throw journalError;
        }
      }
      throw error;
    } finally {
      this.sending = false;
    }
  }
  async withResourceLease<Result>(
    namespace: string,
    resourceKey: string,
    run: (context: PublicationResourceExecution) => Promise<Result>
  ): Promise<Result> {
    this.assertAccepted();
    if (this.resource) this.rejectProposal(new Error('Nested publication resource leases are forbidden'));
    this.validateProposal(() => {
      if (!namespace.trim() || !resourceKey.trim())
        throw new Error('Canonical publication resource identity is required');
    });
    const key = { providerId: this.row.providerId, namespace, resourceKey };
    const row = await this.resources.claim(key, this.row.brandId, this.lease.owner, this.settings.leaseMs);
    if (!row?.lease) throw new PublicationResourceBusy();
    const resource = { key, row, lease: row.lease };
    this.resource = resource;
    try {
      await this.store.assertOwner(this.snapshot, this.lease);
      return await run({
        operations: cloneDeep(row.operations),
        journal: operation =>
          this.serialResource(async () => {
            this.assertAccepted();
            const existing = resource.row.operations.find(entry => entry.operation.id === operation.id);
            const retained = this.validateProposal(() => {
              const retained = existing?.operation ?? this.row.operations.find(entry => entry.id === operation.id);
              if (!retained) throw new Error('Only mutate may submit a publication resource operation');
              recordOperation([cloneDeep(retained)], operation);
              return retained;
            });
            if (['confirmed', 'not_applied', 'rejected'].includes(operation.outcome)) {
              const original = existing ? await this.store.get(existing.work) : this.row;
              const identity = retained.identity;
              if (!original && !identity)
                await this.rejectEvidence(
                  new PublicationEvidenceMismatch(retained.id, 'legacy_identity_incomplete', operation),
                  operation
                );
              await this.verifyEvidence(
                original ?? { ...identity!, binding: undefined },
                retained,
                operation.confirmation,
                operation
              );
            }
            await this.restoreResourceReceipt(operation);
            this.assertAccepted();
            resource.row = await this.resources.journal(
              key,
              this.row.brandId,
              resource.lease,
              resource.row.revision,
              existing?.work ?? this.snapshot,
              operation
            );
          }),
      });
    } finally {
      await this.serialResource(async () => {
        try {
          await this.resources.release(key, this.row.brandId, resource.lease, resource.row.revision);
        } catch (error) {
          if (!(error instanceof PublicationLeaseLost)) throw error;
        } finally {
          this.resource = undefined;
        }
      });
    }
  }
  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.heartbeatTask;
    await this.authorityTask;
    await this.serial(async () => {
      try {
        await this.change(row => this.store.release(row, this.lease, row.revision), 'owner');
      } catch (error) {
        if (!(error instanceof PublicationLeaseLost)) throw error;
      }
    });
    this.abort.abort();
  }
}
