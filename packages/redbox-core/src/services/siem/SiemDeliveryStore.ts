import { randomUUID } from 'node:crypto';
import type { SecurityEventAttributes } from '../../waterline-models/SecurityEvent';

export interface SiemStorageModel {
  tableName: string;
  getDatastore(): { manager: { collection(name: string): unknown } };
}
interface NativeIndexCollection {
  createIndex(spec: Record<string, 1 | -1>, options?: { unique?: boolean }): Promise<unknown>;
}
interface StorageIndex {
  spec: Record<string, 1 | -1>;
  options?: { unique?: boolean };
}
const securityEventIndexes: StorageIndex[] = [
  { spec: { eventId: 1 }, options: { unique: true } },
  { spec: { brandId: 1, deliveryState: 1, nextEligibleAt: 1, occurredAt: 1 } },
  { spec: { brandId: 1, occurredAt: -1 } },
  { spec: { brandId: 1, deliveryState: 1, leaseExpiresAt: 1 } },
  { spec: { brandId: 1, deliveryState: 1, terminalAt: 1 } },
  { spec: { brandId: 1, deliveryState: 1, updatedAt: 1 } },
];
const deliveryAttemptIndexes: StorageIndex[] = [
  { spec: { eventId: 1, destinationId: 1 } },
  { spec: { brandId: 1, startedAt: -1 } },
];
// Db.collection() returns fresh wrappers. Cache by manager and actual table name
// so concurrent workers share setup, while replacement datastores initialize again.
const storageReady = new WeakMap<object, Map<string, Promise<void>>>();
function isNativeIndexCollection(value: unknown): value is NativeIndexCollection {
  return (
    typeof value === 'object' && value !== null && 'createIndex' in value && typeof value.createIndex === 'function'
  );
}
async function ensureIndexes(model: SiemStorageModel, indexes: StorageIndex[]): Promise<void> {
  const manager = model.getDatastore().manager;
  let tables = storageReady.get(manager);
  if (!tables) {
    tables = new Map();
    storageReady.set(manager, tables);
  }
  const ready = tables.get(model.tableName);
  if (ready) return ready;
  const initialization = (async () => {
    const collection = manager.collection(model.tableName);
    if (!isNativeIndexCollection(collection)) throw new Error('SIEM storage requires Mongo native createIndex');
    // migrate:safe ignores Waterline declarations. Mongo's default index names
    // also make these calls idempotent with indexes created by schema migration.
    for (const index of indexes) await collection.createIndex(index.spec, index.options);
  })();
  tables.set(model.tableName, initialization);
  try {
    await initialization;
  } catch (error) {
    // Permission errors, existing duplicate IDs and index conflicts must reach
    // callers. Allow the next job to retry after the underlying issue is fixed.
    tables.delete(model.tableName);
    throw error;
  }
}
/** Capture must await this before create (and may also call it at bootstrap). */
export function ensureSecurityEventStorage(model: SiemStorageModel = SecurityEvent): Promise<void> {
  return ensureIndexes(model, securityEventIndexes);
}
/** Initialize both collections before polling, recovery, cleanup or monitoring. */
export async function ensureSiemDeliveryStorage(
  eventModel: SiemStorageModel = SecurityEvent,
  attemptModel: SiemStorageModel = SiemDeliveryAttempt
): Promise<void> {
  await ensureSecurityEventStorage(eventModel);
  await ensureIndexes(attemptModel, deliveryAttemptIndexes);
}

export interface DestinationProgress {
  status: 'success' | 'failed' | 'processing' | 'deadLetter';
  attempts: number;
  nextEligibleAt?: string;
}
interface NativeCollection {
  updateOne(filter: object, update: object): Promise<{ matchedCount: number }>;
  findOne(filter: object): Promise<SecurityEventAttributes | null>;
  find(filter: object): {
    sort(sort: object): { limit(limit: number): { toArray(): Promise<SecurityEventAttributes[]> } };
  };
  deleteMany(filter: object): Promise<unknown>;
}
function isNativeCollection(value: unknown): value is NativeCollection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'updateOne' in value &&
    typeof value.updateOne === 'function' &&
    'findOne' in value &&
    typeof value.findOne === 'function' &&
    'deleteMany' in value &&
    typeof value.deleteMany === 'function' &&
    'find' in value &&
    typeof value.find === 'function'
  );
}
export function deliveryCollection(model: { tableName: string; getDatastore(): Sails.Datastore }): NativeCollection {
  const collection: unknown = model.getDatastore().manager.collection(model.tableName);
  if (!isNativeCollection(collection)) throw new Error('SIEM delivery requires a Mongo native collection');
  return collection;
}
const eligible = (now: string) => ({
  $or: [{ nextEligibleAt: { $exists: false } }, { nextEligibleAt: null }, { nextEligibleAt: { $lte: now } }],
});
export function readyEventsFilter(brandId: string, now: string): object {
  return {
    brandId,
    $and: [
      eligible(now),
      {
        $or: [
          { deliveryState: { $in: ['pending', 'failed', 'partial'] } },
          { deliveryState: 'processing', leaseExpiresAt: { $lte: now } },
          // Upgrade recovery for processing records written before leases existed.
          { deliveryState: 'processing', leaseExpiresAt: null },
        ],
      },
    ],
  };
}
export async function claimDelivery(
  event: SecurityEventAttributes,
  leaseMs: number
): Promise<SecurityEventAttributes | null> {
  await ensureSecurityEventStorage();
  const now = new Date().toISOString();
  const token = randomUUID();
  const collection = deliveryCollection(SecurityEvent);
  const result = await collection.updateOne(
    { ...readyEventsFilter(event.brandId, now), eventId: event.eventId },
    {
      $set: {
        deliveryState: 'processing',
        leaseToken: token,
        leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
        updatedAt: now,
      },
    }
  );
  if (result.matchedCount !== 1) return null;
  return collection.findOne({ eventId: event.eventId, leaseToken: token });
}
/** Every write, including renewal and completion, must still own an unexpired lease. */
export async function saveDelivery(event: SecurityEventAttributes, values: object): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await deliveryCollection(SecurityEvent).updateOne(
    { eventId: event.eventId, leaseToken: event.leaseToken, leaseExpiresAt: { $gt: now } },
    { $set: { ...values, updatedAt: now } }
  );
  return result.matchedCount === 1;
}
export function readProgress(value: unknown): DestinationProgress | undefined {
  if (value === 'success' || value === 'deadLetter') return { status: value, attempts: 0 };
  if (typeof value !== 'object' || value === null || !('status' in value) || !('attempts' in value)) return undefined;
  const { status, attempts } = value;
  if (!['success', 'failed', 'processing', 'deadLetter'].includes(String(status)) || typeof attempts !== 'number')
    return undefined;
  if (status !== 'success' && status !== 'failed' && status !== 'processing' && status !== 'deadLetter')
    return undefined;
  return {
    status,
    attempts,
    nextEligibleAt:
      'nextEligibleAt' in value && typeof value.nextEligibleAt === 'string' ? value.nextEligibleAt : undefined,
  };
}
