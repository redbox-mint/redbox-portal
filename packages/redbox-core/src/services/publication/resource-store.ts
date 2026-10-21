import { cloneDeep } from 'lodash';
import type { Collection, Db, Filter } from 'mongodb';
import type {
  PublicationResourceKey,
  PublicationResourceLeaseModel,
} from '../../model/storage/PublicationResourceLeaseModel';
import type { PublicationOperation, PublicationWorkKey } from './contracts';
import {
  PublicationLeaseLost,
  PublicationStoreConflict,
  isDuplicateKey,
  leaseFor,
  positiveDuration,
  type PublicationLease,
} from './ownership';
import { recordOperation } from './store';
import { PublicationStagingFence } from './staging-fence';
import { PUBLICATION_HISTORY, retainPublicationHistory, assertPublicationJournalCapacity } from './history';

function resourceFilter(key: PublicationResourceKey): PublicationResourceKey {
  if (![key.providerId, key.namespace, key.resourceKey].every(value => typeof value === 'string' && value.trim()))
    throw new Error('Canonical publication resource identity is required');
  return { providerId: key.providerId, namespace: key.namespace, resourceKey: key.resourceKey };
}
function resourceWorkKey(work: PublicationWorkKey): PublicationWorkKey {
  return { brandId: work.brandId, oid: work.oid, destinationId: work.destinationId };
}
/** Resources span brands when they address the same actual repository. Expiry never removes evidence. */
/** Host-owned publication implementation; extend through PublicationService and adapter contexts. @internal */
export class PublicationResourceStore {
  readonly collection: Collection<PublicationResourceLeaseModel>;
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now
  ) {
    this.collection = db.collection<PublicationResourceLeaseModel>('publicationresourcelease', {
      writeConcern: { w: 'majority', j: true },
    });
  }
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ providerId: 1, namespace: 1, resourceKey: 1 }, { unique: true });
    await this.collection.createIndex({ 'lease.expiresAt': 1 });
  }
  async get(key: PublicationResourceKey): Promise<PublicationResourceLeaseModel | null> {
    const row = await this.collection.findOne(resourceFilter(key));
    if (row && row.schemaVersion !== 1) throw new Error('Unsupported publication resource schema; evidence retained');
    return row;
  }
  async claim(
    key: PublicationResourceKey,
    brandId: string,
    owner: string,
    leaseMs: number
  ): Promise<PublicationResourceLeaseModel | null> {
    if (!brandId.trim()) throw new Error('Publication resource brand is required');
    const now = this.now();
    const lease = { ...leaseFor(owner, leaseMs, now), brandId };
    const initial: PublicationResourceLeaseModel = {
      ...resourceFilter(key),
      schemaVersion: 1,
      revision: 0,
      lease: null,
      operations: [],
    };
    try {
      await this.collection.updateOne(resourceFilter(key), { $setOnInsert: initial }, { upsert: true });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    return this.collection.findOneAndUpdate(
      { ...resourceFilter(key), schemaVersion: 1, $or: [{ lease: null }, { 'lease.expiresAt': { $lte: now } }] },
      { $set: { lease }, $inc: { revision: 1 } },
      { returnDocument: 'after', includeResultMetadata: false }
    );
  }
  async assertOwner(key: PublicationResourceKey, brandId: string, lease: PublicationLease): Promise<void> {
    if (!(await this.collection.findOne(this.ownerFilter(key, brandId, lease)))) throw new PublicationLeaseLost();
  }
  private ownerFilter(
    key: PublicationResourceKey,
    brandId: string,
    lease: PublicationLease
  ): Filter<PublicationResourceLeaseModel> {
    if (!brandId.trim()) throw new Error('Publication resource brand is required');
    return {
      ...resourceFilter(key),
      schemaVersion: 1,
      'lease.brandId': brandId,
      'lease.owner': lease.owner,
      'lease.token': lease.token,
      'lease.expiresAt': { $gt: this.now() },
    };
  }
  private async change(
    key: PublicationResourceKey,
    brandId: string,
    lease: PublicationLease,
    revision: number,
    fn: (row: PublicationResourceLeaseModel) => void,
    newOperationId?: string
  ): Promise<PublicationResourceLeaseModel> {
    await this.assertOwner(key, brandId, lease);
    const row = await this.get(key);
    if (!row || row.revision !== revision) throw new PublicationStoreConflict();
    if (
      row.operations.some(entry =>
        Object.keys(entry.work).some(key => !['brandId', 'oid', 'destinationId'].includes(key))
      )
    ) {
      // Earlier hosts passed an entire work row through this structurally typed key.
      // Preserve that private historical copy before removing its duplicated live payload.
      await retainPublicationHistory(this.db, row);
      for (const entry of row.operations) entry.work = resourceWorkKey(entry.work);
    }
    if (
      newOperationId &&
      row.operations.length > 128 &&
      !row.operations.some(entry => entry.operation.id === newOperationId)
    ) {
      const retired = new Set<string>();
      for (const entry of row.operations.slice(0, -64)) {
        if (!['confirmed', 'not_applied', 'rejected'].includes(entry.operation.outcome)) continue;
        const request = {
          ...entry.work,
          sourceGeneration: entry.operation.sourceGeneration,
          approvalId: entry.operation.approvalId,
          approvalEpoch: entry.operation.approvalEpoch,
          status: 'completed',
          operations: {
            $elemMatch: {
              id: entry.operation.id,
              outcome: entry.operation.outcome,
              evidence: entry.operation.evidence,
            },
          },
        };
        // Completion proves provider-specific follow-up (including Oni readiness) is settled.
        // A resource/record checkpoint gap must stay live even when the transport was acknowledged.
        const completed = await this.db.collection('publicationsync').findOne(request, { projection: { _id: 1 } });
        const historical = completed
          ? undefined
          : await this.db
              .collection(PUBLICATION_HISTORY)
              .findOne(Object.fromEntries(Object.entries(request).map(([key, value]) => [`snapshot.${key}`, value])), {
                projection: { _id: 1 },
              });
        if (completed || historical) retired.add(entry.operation.id);
      }
      if (retired.size) {
        await retainPublicationHistory(this.db, row);
        row.operations = row.operations.filter(entry => !retired.has(entry.operation.id));
      }
    }
    fn(row);
    row.revision++;
    if (
      (
        await new PublicationStagingFence(this.db).admit(row, () =>
          this.collection.replaceOne({ ...this.ownerFilter(key, brandId, lease), revision }, row)
        )
      ).matchedCount
    )
      return row;
    await this.assertOwner(key, brandId, lease);
    throw new PublicationStoreConflict();
  }
  async renew(
    key: PublicationResourceKey,
    brandId: string,
    lease: PublicationLease,
    revision: number,
    leaseMs: number
  ): Promise<PublicationResourceLeaseModel> {
    positiveDuration(leaseMs);
    return this.change(key, brandId, lease, revision, row => {
      if (row.lease) row.lease.expiresAt = this.now() + leaseMs;
    });
  }
  async release(
    key: PublicationResourceKey,
    brandId: string,
    lease: PublicationLease,
    revision: number
  ): Promise<PublicationResourceLeaseModel> {
    return this.change(key, brandId, lease, revision, row => {
      row.lease = null;
    });
  }
  /** Restore an exact durable record confirmation after repository-journal compaction. @internal */
  async restoreConfirmed(
    key: PublicationResourceKey,
    brandId: string,
    lease: PublicationLease,
    revision: number,
    work: PublicationWorkKey,
    operation: PublicationOperation
  ): Promise<PublicationResourceLeaseModel> {
    if (work.brandId !== brandId || !work.oid || !work.destinationId || operation.outcome !== 'confirmed')
      throw new Error('Only owned confirmed record evidence can restore a publication resource receipt');
    return this.change(
      key,
      brandId,
      lease,
      revision,
      row => {
        if (row.operations.some(entry => entry.operation.id === operation.id)) throw new PublicationStoreConflict();
        assertPublicationJournalCapacity([...row.operations, { work: resourceWorkKey(work), operation }]);
        row.operations.push({ work: resourceWorkKey(work), operation: cloneDeep(operation) });
      },
      operation.id
    );
  }
  async journal(
    key: PublicationResourceKey,
    brandId: string,
    lease: PublicationLease,
    revision: number,
    work: PublicationWorkKey,
    operation: PublicationOperation
  ): Promise<PublicationResourceLeaseModel> {
    if (!work.brandId || !work.oid || !work.destinationId)
      throw new Error('Publication resource work ownership mismatch');
    return this.change(
      key,
      brandId,
      lease,
      revision,
      row => {
        const existing = row.operations.find(entry => entry.operation.id === operation.id);
        if (existing) {
          if (
            existing.work.brandId !== work.brandId ||
            existing.work.oid !== work.oid ||
            existing.work.destinationId !== work.destinationId
          )
            throw new Error('Publication resource operation belongs to different work');
          recordOperation([existing.operation], operation);
        } else {
          if (work.brandId !== brandId) throw new Error('Cannot submit work for another publication resource brand');
          if (
            row.operations.some(
              entry => entry.operation.outcome === 'submitted' || entry.operation.outcome === 'uncertain'
            )
          )
            throw new Error('Unresolved publication resource operation requires reconciliation');
          const operations: PublicationOperation[] = [];
          recordOperation(operations, operation);
          assertPublicationJournalCapacity([...row.operations, { work: resourceWorkKey(work), operation }]);
          row.operations.push({ work: resourceWorkKey(work), operation: operations[0] });
        }
      },
      operation.id
    );
  }
}
