import { cloneDeep } from 'lodash';
import { assertPublicationOperationEvidence, publicationOperationRequiresRecovery } from './operations';
import type { Collection, Db, Filter } from 'mongodb';
import type { PublicationSyncModel } from '../../model/storage/PublicationSyncModel';
import type {
  PublicationBinding,
  PublicationOperation,
  PublicationWorkKey,
  PublicationWorkflowDecision,
  PublicationSourceReference,
} from './contracts';
import {
  PublicationBindingConflict,
  PublicationLeaseLost,
  PublicationStoreConflict,
  isDuplicateKey,
  leaseFor,
  positiveDuration,
  type PublicationLease,
} from './ownership';
import type { PublicationProviderRegistry } from './registry';
import { canonicalPublicationJson } from './canonical';
import { PublicationStagingFence } from './staging-fence';
import { PUBLICATION_COMPLETION_FENCE, publicationCompletionReference } from './completion-fence';
import {
  PUBLICATION_HISTORY,
  retainPublicationHistory,
  assertPublicationJournalCapacity,
  type PublicationHistoryEntry,
} from './history';

export type PublicationWorkKind = keyof PublicationSyncModel['work'];
export type PublicationCheckpoint = Partial<
  Pick<
    PublicationSyncModel,
    | 'status'
    | 'waitingReason'
    | 'retry'
    | 'retryEpisodes'
    | 'completion'
    | 'workflowPending'
    | 'links'
    | 'audit'
    | 'correctionReferences'
    | 'work'
    | 'operationEvidenceFailures'
  >
>;
export type PublicationRequest = Pick<
  PublicationSyncModel,
  | 'sourceGeneration'
  | 'sourceRevision'
  | 'approvalId'
  | 'approvalEpoch'
  | 'sourceDigest'
  | 'configurationDigest'
  | 'source'
>;
export interface PublicationDueCursor {
  nextActionAt: number;
  brandId: string;
  oid: string;
  destinationId: string;
}
interface DestinationIdentity {
  brandId: string;
  destinationId: string;
  providerId: string;
  targetFingerprint: string;
}
const kinds: PublicationWorkKind[] = ['synchronise', 'observe', 'maintenance'];
const emptyWork = () => ({ requested: 0, processed: 0, dueAt: null });
function keyFilter(key: PublicationWorkKey): PublicationWorkKey {
  if (![key.brandId, key.oid, key.destinationId].every(v => typeof v === 'string' && v.trim()))
    throw new Error('Complete publication work key is required');
  return { brandId: key.brandId, oid: key.oid, destinationId: key.destinationId };
}
function nextAction(work: PublicationSyncModel['work']): number | null {
  const times = kinds.flatMap(kind => {
    const item = work[kind];
    if (
      !Number.isSafeInteger(item.requested) ||
      !Number.isSafeInteger(item.processed) ||
      item.processed < 0 ||
      item.processed > item.requested ||
      (item.dueAt !== null && !Number.isSafeInteger(item.dueAt))
    )
      throw new Error('Invalid publication work counters');
    return item.requested > item.processed && item.dueAt !== null ? [item.dueAt] : [];
  });
  return times.length ? Math.min(...times) : null;
}

/** Native Mongo is the durable authority. Checkpoints never retry against a different revision. */
/** Host-owned publication implementation; extend through PublicationService and adapter contexts. @internal */
export class PublicationSyncStore {
  readonly collection: Collection<PublicationSyncModel>;
  private readonly destinations: Collection<DestinationIdentity>;
  readonly workflowDecisions: Collection<{ brandId: string; oid: string; decision: PublicationWorkflowDecision }>;
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now
  ) {
    const options = { writeConcern: { w: 'majority' as const, j: true } };
    this.collection = db.collection<PublicationSyncModel>('publicationsync', options);
    this.destinations = db.collection<DestinationIdentity>('publicationdestination', options);
    this.workflowDecisions = db.collection('publicationworkflowdecision', options);
  }
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ brandId: 1, oid: 1, destinationId: 1 }, { unique: true });
    try {
      await this.collection.createIndex(
        { providerId: 1, remoteNamespace: 1, remoteObjectId: 1 },
        {
          unique: true,
          partialFilterExpression: { remoteNamespace: { $type: 'string' }, remoteObjectId: { $type: 'string' } },
        }
      );
    } catch (error) {
      if (isDuplicateKey(error)) throw new PublicationBindingConflict();
      throw error;
    }
    await this.collection.createIndex({ brandId: 1, nextActionAt: 1, oid: 1, destinationId: 1, dispatchUntil: 1 });
    await this.collection.createIndex({ 'lease.expiresAt': 1 });
    await this.collection.createIndex({ brandId: 1, 'audit.exported': 1, 'audit.closed': 1, oid: 1, destinationId: 1 });
    await this.collection.createIndex({ brandId: 1, workflowPending: 1, oid: 1, destinationId: 1 });
    await this.destinations.createIndex({ brandId: 1, destinationId: 1 }, { unique: true });
    await this.workflowDecisions.createIndex({ brandId: 1, oid: 1, 'decision.id': 1 }, { unique: true });
    await this.db.collection(PUBLICATION_HISTORY).createIndex({
      'snapshot.brandId': 1,
      'snapshot.oid': 1,
      'snapshot.destinationId': 1,
      'snapshot.sourceGeneration': 1,
      'snapshot.approvalId': 1,
      'snapshot.approvalEpoch': 1,
    });
  }
  async initialise(
    key: PublicationWorkKey,
    providerId: string,
    targetFingerprint: string,
    providerStateVersion = 1
  ): Promise<PublicationSyncModel> {
    keyFilter(key);
    if (
      !providerId.trim() ||
      !targetFingerprint.trim() ||
      !Number.isSafeInteger(providerStateVersion) ||
      providerStateVersion < 1
    )
      throw new Error('Invalid publication provider identity');
    await this.reserveDestination(key.brandId, key.destinationId, providerId, targetFingerprint);
    const initial: PublicationSyncModel = {
      ...keyFilter(key),
      schemaVersion: 1,
      providerId,
      providerStateVersion,
      providerState: {},
      revision: 0,
      sourceGeneration: 0,
      sourceRevision: 0,
      approvalId: '',
      approvalEpoch: 0,
      sourceDigest: '',
      source: null,
      recoverySources: [],
      configurationDigest: '',
      targetFingerprint,
      lease: null,
      dispatchUntil: 0,
      nextActionAt: null,
      work: { synchronise: emptyWork(), observe: emptyWork(), maintenance: emptyWork() },
      status: 'queued',
      operations: [],
      links: {},
      correctionReferences: [],
    };
    try {
      await this.collection.updateOne(keyFilter(key), { $setOnInsert: initial }, { upsert: true });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const saved = await this.get(key);
    if (!saved || saved.providerId !== providerId || saved.targetFingerprint !== targetFingerprint)
      throw new Error('Publication destination identity mismatch');
    return saved;
  }
  /** Reserve before accepting an approval, including requests not yet imported by dispatch. */
  async reserveDestination(
    brandId: string,
    destinationId: string,
    providerId: string,
    targetFingerprint: string
  ): Promise<void> {
    if (
      ![brandId, destinationId, providerId, targetFingerprint].every(value => typeof value === 'string' && value.trim())
    )
      throw new Error('Complete publication destination identity is required');
    const identity = { brandId, destinationId, providerId, targetFingerprint };
    try {
      await this.destinations.updateOne({ brandId, destinationId }, { $setOnInsert: identity }, { upsert: true });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const used = await this.destinations.findOne({ brandId, destinationId });
    if (used?.providerId !== providerId || used.targetFingerprint !== targetFingerprint)
      throw new Error('Used publication destination identity cannot change');
  }
  /** The marker is written only after every pre-ledger approval has been checked and reserved. */
  async destinationLedgerReady(brandId: string): Promise<boolean> {
    if (!brandId.trim()) throw new Error('Publication brand is required');
    const marker = await this.db
      .collection<{ _id: string; schemaVersion: number }>('publicationdestinationledger')
      .findOne({ _id: brandId });
    if (marker && marker.schemaVersion !== 1) throw new Error('Unsupported publication destination ledger');
    return !!marker;
  }
  async prepareDestinationLedger(brandId: string, backfill: () => Promise<void>): Promise<void> {
    if (await this.destinationLedgerReady(brandId)) return;
    await this.destinations.createIndex({ brandId: 1, destinationId: 1 }, { unique: true });
    await backfill();
    await this.db
      .collection<{ _id: string; schemaVersion: number }>('publicationdestinationledger')
      .updateOne(
        { _id: brandId },
        { $setOnInsert: { _id: brandId, schemaVersion: 1 } },
        { upsert: true, writeConcern: { w: 'majority', j: true } }
      );
  }
  async usedDestinations(brandId: string): Promise<Record<string, { providerId: string; targetFingerprint: string }>> {
    if (!brandId.trim()) throw new Error('Publication brand is required');
    const rows = await this.destinations.find({ brandId }).toArray();
    return Object.fromEntries(
      rows.map(row => [row.destinationId, { providerId: row.providerId, targetFingerprint: row.targetFingerprint }])
    );
  }
  async get(key: PublicationWorkKey): Promise<PublicationSyncModel | null> {
    const row = await this.collection.findOne(keyFilter(key));
    if (row && row.schemaVersion !== 1) throw new Error('Unsupported publication store schema; evidence retained');
    return row;
  }
  /** A record-view projection must always bind both brand and OID. */
  async forRecord(brandId: string, oid: string): Promise<PublicationSyncModel[]> {
    if (!brandId.trim() || !oid.trim()) throw new Error('Publication status requires brand and record');
    const rows = await this.collection.find({ brandId, oid }).sort({ destinationId: 1 }).toArray();
    if (rows.some(row => row.schemaVersion !== 1))
      throw new Error('Unsupported publication store schema; evidence retained');
    return rows;
  }
  /** Stable paging also includes terminal rows so a crashed audit projection is recoverable. */
  async auditPage(
    brandId: string,
    limit: number,
    after?: { oid: string; destinationId: string }
  ): Promise<PublicationSyncModel[]> {
    if (!brandId.trim() || !Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new Error('Invalid publication audit scan');
    const pending: Filter<PublicationSyncModel> = {
      $or: [{ 'audit.exported': { $exists: false } }, { 'audit.closed': true, 'audit.exported': { $ne: 'terminal' } }],
    };
    const filter: Filter<PublicationSyncModel> = { brandId, 'audit.startedAt': { $exists: true }, $and: [pending] };
    if (after)
      filter.$and!.push({
        $or: [{ oid: { $gt: after.oid } }, { oid: after.oid, destinationId: { $gt: after.destinationId } }],
      });
    return this.collection.find(filter).sort({ oid: 1, destinationId: 1 }).limit(limit).toArray();
  }
  /** Projection acknowledgement changes bookkeeping only and never consumes source work or lease ownership. */
  async acknowledgeAudit(snapshot: PublicationSyncModel): Promise<void> {
    if (!snapshot.audit?.startedAt) return;
    for (let attempt = 0; attempt < 30; attempt++) {
      const row = await this.get(snapshot);
      if (!row?.audit || row.audit.episodeId !== snapshot.audit.episodeId) return;
      const exported = snapshot.audit.closed && snapshot.audit.terminalStatus ? 'terminal' : 'started';
      if (row.audit.exported === 'terminal' || row.audit.exported === exported) return;
      try {
        await this.replace(row, row.revision, state => {
          if (state.audit) state.audit.exported = exported;
        });
        return;
      } catch (error) {
        if (!(error instanceof PublicationStoreConflict)) throw error;
      }
    }
    throw new PublicationStoreConflict();
  }
  async workflowPage(
    brandId: string,
    limit: number,
    after?: { oid: string; destinationId: string }
  ): Promise<PublicationSyncModel[]> {
    if (!brandId.trim() || !Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new Error('Invalid workflow scan');
    const filter: Filter<PublicationSyncModel> = { brandId, workflowPending: true };
    if (after)
      filter.$or = [{ oid: { $gt: after.oid } }, { oid: after.oid, destinationId: { $gt: after.destinationId } }];
    return this.collection.find(filter).sort({ oid: 1, destinationId: 1 }).limit(limit).toArray();
  }
  /** Immutable identity and monotonic transition evidence survive later source revisions. */
  async recordWorkflowDecision(key: PublicationWorkKey, decision: PublicationWorkflowDecision): Promise<void> {
    const filter = { brandId: key.brandId, oid: key.oid, 'decision.id': decision.id };
    try {
      await this.workflowDecisions.updateOne(
        filter,
        { $setOnInsert: { brandId: key.brandId, oid: key.oid, decision } },
        { upsert: true }
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const previous = await this.workflowDecisions.findOne(filter);
    if (!previous) throw new Error('Workflow decision evidence unavailable');
    const { status: _status, finishedAt: _finished, reason: _reason, ...identity } = previous.decision;
    const { status: _nextStatus, finishedAt: _nextFinished, reason: _nextReason, ...nextIdentity } = decision;
    if (canonicalPublicationJson(identity) !== canonicalPublicationJson(nextIdentity))
      throw new Error('Workflow decision evidence cannot change identity');
    if (previous.decision.finishedAt) {
      if (
        ['completed', 'failed'].includes(decision.status) &&
        canonicalPublicationJson(previous.decision) !== canonicalPublicationJson(decision)
      )
        throw new Error('Workflow terminal evidence cannot change');
      return;
    }
    if (decision.status !== 'started')
      await this.workflowDecisions.updateOne(
        { ...filter, 'decision.status': { $in: ['started', 'stage_applied'] } },
        { $set: { decision } }
      );
  }
  async acknowledgeWorkflow(snapshot: PublicationSyncModel): Promise<void> {
    // An importer or a new completion must retain its own coordination obligation.
    await this.collection.updateOne(
      {
        ...keyFilter(snapshot),
        revision: snapshot.revision,
        approvalId: snapshot.approvalId,
        approvalEpoch: snapshot.approvalEpoch,
        sourceGeneration: snapshot.sourceGeneration,
      },
      { $set: { workflowPending: false }, $inc: { revision: 1 } }
    );
  }
  private async replace(
    key: PublicationWorkKey,
    revision: number,
    change: (row: PublicationSyncModel) => void,
    lease?: PublicationLease
  ): Promise<PublicationSyncModel> {
    const row = await this.get(key);
    if (!row) throw new Error('Missing publication state');
    const now = this.now();
    if (lease && (row.lease?.token !== lease.token || row.lease.owner !== lease.owner || row.lease.expiresAt <= now))
      throw new PublicationLeaseLost();
    if (row.revision !== revision) throw new PublicationStoreConflict();
    change(row);
    row.nextActionAt = nextAction(row.work);
    row.revision++;
    const filter: Filter<PublicationSyncModel> = { ...keyFilter(key), revision, schemaVersion: 1 };
    if (lease)
      Object.assign(filter, {
        'lease.token': lease.token,
        'lease.owner': lease.owner,
        'lease.expiresAt': { $gt: this.now() },
      });
    try {
      if (
        (await new PublicationStagingFence(this.db).admit(row, () => this.collection.replaceOne(filter, row)))
          .matchedCount
      )
        return row;
    } catch (error) {
      if (isDuplicateKey(error)) throw new PublicationBindingConflict();
      throw error;
    }
    await this.assertOwnerIfNeeded(key, lease);
    throw new PublicationStoreConflict();
  }
  private async assertOwnerIfNeeded(key: PublicationWorkKey, lease?: PublicationLease): Promise<void> {
    if (lease) await this.assertOwner(key, lease);
  }
  async importRequest(
    key: PublicationWorkKey,
    request: PublicationRequest,
    dueAt = this.now()
  ): Promise<PublicationSyncModel> {
    if (
      !Number.isSafeInteger(request.sourceGeneration) ||
      request.sourceGeneration < 1 ||
      !Number.isSafeInteger(request.sourceRevision) ||
      request.sourceRevision < 1 ||
      !Number.isSafeInteger(request.approvalEpoch) ||
      request.approvalEpoch < 1 ||
      !request.approvalId ||
      !request.sourceDigest ||
      !request.configurationDigest ||
      !request.source ||
      request.source.encodingVersion !== 1 ||
      !request.source.disk ||
      !request.source.key ||
      !/^[a-f0-9]{64}$/.test(request.source.digest)
    )
      throw new Error('Invalid publication request identity');
    for (let attempt = 0; attempt < 30; attempt++) {
      const row = await this.get(key);
      if (!row) throw new Error('Missing publication state');
      if (request.sourceGeneration <= row.sourceGeneration) {
        if (
          request.sourceGeneration === row.sourceGeneration &&
          (Object.keys(request) as Array<keyof PublicationRequest>).some(
            field => canonicalPublicationJson(row[field]) !== canonicalPublicationJson(request[field])
          )
        )
          throw new Error('Publication generation has conflicting source identity');
        return row;
      }
      if (request.sourceRevision < row.sourceRevision) throw new Error('Publication source revision cannot regress');
      try {
        if (row.source || row.operations.length || row.recoverySources.length)
          await retainPublicationHistory(this.db, row);
        const unresolved = row.operations.filter(publicationOperationRequiresRecovery);
        const protectedSources: PublicationSourceReference[] = [];
        for (const op of unresolved) {
          // Pre-framework operations have legacy receipts rather than sealed approvals.
          // Their uncertainty/provider state stays live until explicit reconciliation.
          if (!op.approvalId && op.approvalEpoch === 0 && op.evidence.historical === true) continue;
          const historical = await this.db.collection<PublicationHistoryEntry>(PUBLICATION_HISTORY).findOne({
            'snapshot.brandId': key.brandId,
            'snapshot.oid': key.oid,
            'snapshot.destinationId': key.destinationId,
            'snapshot.sourceGeneration': op.sourceGeneration,
            'snapshot.approvalId': op.approvalId,
            'snapshot.approvalEpoch': op.approvalEpoch,
          });
          if (!historical || !('source' in historical.snapshot) || !historical.snapshot.source)
            throw new Error('Publication recovery source is unavailable; journal retained');
          protectedSources.push(historical.snapshot.source);
        }
        return await this.replace(key, row.revision, state => {
          if (
            state.source &&
            !state.recoverySources.some(
              reference => reference.disk === state.source!.disk && reference.key === state.source!.key
            )
          )
            state.recoverySources.push(cloneDeep(state.source));
          const retained = new Set(
            [...state.recoverySources.slice(-16), ...protectedSources].map(ref => JSON.stringify([ref.disk, ref.key]))
          );
          state.recoverySources = state.recoverySources.filter(ref =>
            retained.has(JSON.stringify([ref.disk, ref.key]))
          );
          const recent = new Set(state.operations.slice(-128).map(op => op.id));
          state.operations = state.operations.filter(
            op => recent.has(op.id) || publicationOperationRequiresRecovery(op)
          );
          while (state.operations.length > 1 && Buffer.byteLength(JSON.stringify(state.operations)) > 2 * 1024 * 1024) {
            const settled = state.operations.findIndex(op => !publicationOperationRequiresRecovery(op));
            if (settled < 0) break;
            state.operations.splice(settled, 1);
          }
          Object.assign(state, cloneDeep(request));
          state.work.synchronise.requested++;
          state.work.synchronise.dueAt = dueAt;
          state.status = 'queued';
          delete state.waitingReason;
          if (!state.retry?.kind || state.retry.kind === 'synchronise') delete state.retry;
          if (state.retryEpisodes) delete state.retryEpisodes.synchronise;
          // Historical completion and operations remain available for reconciliation.
        });
      } catch (error) {
        if (!(error instanceof PublicationStoreConflict)) throw error;
      }
    }
    throw new PublicationStoreConflict();
  }
  async request(
    key: PublicationWorkKey,
    kind: PublicationWorkKind,
    expectedRevision: number,
    dueAt = this.now()
  ): Promise<PublicationSyncModel> {
    const current = await this.get(key);
    if (!current || current.revision !== expectedRevision) throw new PublicationStoreConflict();
    // Observations are read-only and consume retained sealed inputs. New byte-consuming work
    // cannot slip behind a post-completion replacement decision for this exact generation.
    const release =
      kind === 'observe'
        ? undefined
        : await new PublicationStagingFence(this.db, PUBLICATION_COMPLETION_FENCE).pinRegistered(
            publicationCompletionReference(current)
          );
    try {
      const result = await this.replace(key, expectedRevision, row => {
        row.work[kind].requested++;
        row.work[kind].dueAt = row.work[kind].dueAt === null ? dueAt : Math.min(row.work[kind].dueAt, dueAt);
      });
      await release?.();
      return result;
    } catch (error) {
      if (error instanceof PublicationStoreConflict || error instanceof PublicationLeaseLost) await release?.();
      throw error;
    }
  }
  async claim(key: PublicationWorkKey, owner: string, leaseMs: number): Promise<PublicationSyncModel | null> {
    const now = this.now();
    const lease = leaseFor(owner, leaseMs, now);
    return this.collection.findOneAndUpdate(
      {
        ...keyFilter(key),
        schemaVersion: 1,
        nextActionAt: { $ne: null, $lte: now },
        $or: [{ lease: null }, { 'lease.expiresAt': { $lte: now } }],
      },
      { $set: { lease, status: 'running' }, $inc: { revision: 1 } },
      { returnDocument: 'after', includeResultMetadata: false }
    );
  }
  async assertOwner(key: PublicationWorkKey, lease: PublicationLease): Promise<void> {
    if (
      !(await this.collection.findOne({
        ...keyFilter(key),
        schemaVersion: 1,
        'lease.owner': lease.owner,
        'lease.token': lease.token,
        'lease.expiresAt': { $gt: this.now() },
      }))
    )
      throw new PublicationLeaseLost();
  }
  async renew(
    key: PublicationWorkKey,
    lease: PublicationLease,
    expectedRevision: number,
    leaseMs: number
  ): Promise<PublicationSyncModel> {
    positiveDuration(leaseMs);
    return this.replace(
      key,
      expectedRevision,
      row => {
        if (row.lease) row.lease.expiresAt = this.now() + leaseMs;
      },
      lease
    );
  }
  async release(
    key: PublicationWorkKey,
    lease: PublicationLease,
    expectedRevision: number
  ): Promise<PublicationSyncModel> {
    return this.replace(
      key,
      expectedRevision,
      row => {
        row.lease = null;
      },
      lease
    );
  }
  async checkpoint(
    key: PublicationWorkKey,
    lease: PublicationLease,
    expectedRevision: number,
    patch: PublicationCheckpoint
  ): Promise<PublicationSyncModel> {
    return this.replace(
      key,
      expectedRevision,
      row => {
        if (patch.work)
          for (const kind of kinds) {
            if (
              patch.work[kind].requested !== row.work[kind].requested ||
              patch.work[kind].processed < row.work[kind].processed
            )
              throw new Error('Publication work obligations cannot be erased or replayed');
          }
        Object.assign(row, cloneDeep(patch));
        for (const [field, value] of Object.entries(patch)) if (value === undefined) Reflect.deleteProperty(row, field);
      },
      lease
    );
  }
  async checkpointProviderState(
    key: PublicationWorkKey,
    lease: PublicationLease,
    expectedRevision: number,
    value: unknown,
    registry: PublicationProviderRegistry,
    operationIds: readonly string[] = []
  ): Promise<PublicationSyncModel> {
    return this.replace(
      key,
      expectedRevision,
      row => {
        for (const id of operationIds) {
          const operation = row.operations.find(item => item.id === id);
          if (!operation || operation.outcome !== 'confirmed')
            throw new Error('Only confirmed publication operations can be checkpointed');
          assertPublicationOperationEvidence(row, operation, operation.confirmation);
          operation.checkpointed = true;
        }
        const decoded = registry.decodeState(row.providerId, value, row.providerStateVersion);
        row.providerState = decoded.state;
        row.providerStateVersion = decoded.version;
      },
      lease
    );
  }
  async bind(
    key: PublicationWorkKey,
    lease: PublicationLease,
    expectedRevision: number,
    binding: PublicationBinding
  ): Promise<PublicationSyncModel> {
    if (!binding.namespace.trim() || !binding.objectId.trim())
      throw new Error('Canonical publication remote identity is required');
    return this.replace(
      key,
      expectedRevision,
      row => {
        if (binding.targetFingerprint !== row.targetFingerprint) throw new Error('Publication binding target mismatch');
        if (row.binding && (row.binding.namespace !== binding.namespace || row.binding.objectId !== binding.objectId))
          throw new Error('Publication binding replacement requires administrative repair');
        row.binding = cloneDeep(binding);
        row.remoteNamespace = binding.namespace;
        row.remoteObjectId = binding.objectId;
      },
      lease
    );
  }
  async journal(
    key: PublicationWorkKey,
    lease: PublicationLease,
    expectedRevision: number,
    operation: PublicationOperation
  ): Promise<PublicationSyncModel> {
    return this.replace(
      key,
      expectedRevision,
      row => {
        recordOperation(row.operations, operation, row);
      },
      lease
    );
  }
  async upgradeProviderState(
    key: PublicationWorkKey,
    lease: PublicationLease,
    expectedRevision: number,
    registry: PublicationProviderRegistry
  ): Promise<PublicationSyncModel> {
    return this.replace(
      key,
      expectedRevision,
      row => {
        const decoded = registry.decodeState(row.providerId, row.providerState, row.providerStateVersion);
        row.providerState = decoded.state;
        row.providerStateVersion = decoded.version;
      },
      lease
    );
  }
  async due(brandId: string, limit = 100, after?: PublicationDueCursor): Promise<PublicationSyncModel[]> {
    if (
      !brandId.trim() ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 1000 ||
      (after && after.brandId !== brandId)
    )
      throw new Error('Invalid publication due page');
    const filter: Filter<PublicationSyncModel> = {
      brandId,
      schemaVersion: 1,
      nextActionAt: { $ne: null, $lte: this.now() },
      dispatchUntil: { $lte: this.now() },
    };
    if (after)
      filter.$or = [
        { nextActionAt: { $gt: after.nextActionAt } },
        { nextActionAt: after.nextActionAt, oid: { $gt: after.oid } },
        { nextActionAt: after.nextActionAt, oid: after.oid, destinationId: { $gt: after.destinationId } },
      ];
    return this.collection.find(filter).sort({ nextActionAt: 1, oid: 1, destinationId: 1 }).limit(limit).toArray();
  }
  async dispatchClaim(key: PublicationWorkKey, expectedRevision: number, cooldownMs: number): Promise<boolean> {
    positiveDuration(cooldownMs);
    const now = this.now();
    const result = await this.collection.updateOne(
      {
        ...keyFilter(key),
        schemaVersion: 1,
        revision: expectedRevision,
        dispatchUntil: { $lte: now },
        nextActionAt: { $ne: null, $lte: now },
      },
      { $set: { dispatchUntil: now + cooldownMs }, $inc: { revision: 1 } }
    );
    return result.matchedCount === 1;
  }
}

/** Operations are append-only identities; an uncertain call cannot be silently replaced. */
export function recordOperation(
  operations: PublicationOperation[],
  operation: PublicationOperation,
  source?: Pick<PublicationSyncModel, 'approvalId' | 'approvalEpoch' | 'sourceGeneration'>
): void {
  const existing = operations.find(item => item.id === operation.id);
  if (!existing) {
    if (
      !operation.id ||
      operation.outcome !== 'submitted' ||
      (source &&
        (source.approvalId !== operation.approvalId ||
          source.approvalEpoch !== operation.approvalEpoch ||
          source.sourceGeneration !== operation.sourceGeneration))
    )
      throw new Error('Operation does not belong to current publication request');
    if (
      operations.some(
        item =>
          item.outcome === 'submitted' ||
          item.outcome === 'uncertain' ||
          (source && publicationOperationRequiresRecovery(item))
      )
    )
      throw new Error('Unresolved publication operation requires reconciliation');
    assertPublicationJournalCapacity([...operations, operation]);
    const submitted = cloneDeep(operation);
    delete submitted.checkpointed; // Adapters cannot manufacture host acknowledgement through journal/mutate.
    operations.push(submitted);
    return;
  }
  for (const field of [
    'kind',
    'approvalId',
    'approvalEpoch',
    'sourceGeneration',
    'intendedDigest',
    'submittedAt',
  ] as const)
    if (existing[field] !== operation[field]) throw new Error('Publication operation identity cannot change');
  if (operation.idempotencyKey !== undefined && operation.idempotencyKey !== existing.idempotencyKey)
    throw new Error('Host publication idempotency key cannot change');
  if (
    operation.identity !== undefined &&
    canonicalPublicationJson(operation.identity) !== canonicalPublicationJson(existing.identity ?? null)
  )
    throw new Error('Host publication operation identity cannot change');
  if (['confirmed', 'not_applied', 'rejected'].includes(existing.outcome) && existing.outcome !== operation.outcome)
    throw new Error('Publication operation result cannot regress');
  if (existing.outcome === 'uncertain' && operation.outcome === 'submitted')
    throw new Error('Uncertain publication operation requires reconciliation');
  for (const [key, evidence] of Object.entries(existing.evidence)) {
    if (
      key in operation.evidence &&
      canonicalPublicationJson(evidence) !== canonicalPublicationJson(operation.evidence[key])
    )
      throw new Error('Publication operation evidence cannot be overwritten');
  }
  const checkpointed =
    canonicalPublicationJson(existing.confirmation ?? null) ===
      canonicalPublicationJson(operation.confirmation ?? existing.confirmation ?? null) &&
    existing.checkpointed === true &&
    operation.outcome === existing.outcome &&
    Object.entries(operation.evidence).every(
      ([key, value]) =>
        key in existing.evidence && canonicalPublicationJson(value) === canonicalPublicationJson(existing.evidence[key])
    );
  // Omitted host keys in adapter updates retain the original transport identity.
  const { idempotencyKey: _providedKey, identity: _providedIdentity, ...updated } = cloneDeep(operation);
  Object.assign(existing, updated, {
    evidence: { ...existing.evidence, ...cloneDeep(operation.evidence) },
  });
  if (checkpointed) existing.checkpointed = true;
  else delete existing.checkpointed;
}
