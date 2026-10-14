import { randomUUID } from 'node:crypto';
import type { SecurityEventAttributes } from '../../waterline-models/SecurityEvent';

export interface DestinationProgress {
  status: 'success' | 'failed' | 'processing' | 'deadLetter';
  attempts: number;
  nextEligibleAt?: string;
}
interface NativeCollection {
  updateOne(filter: object, update: object): Promise<{ matchedCount: number }>;
  findOne(filter: object): Promise<SecurityEventAttributes | null>;
  find(filter: object): { sort(sort: object): { limit(limit: number): { toArray(): Promise<SecurityEventAttributes[]> } } };
  deleteMany(filter: object): Promise<unknown>;
}
function isNativeCollection(value: unknown): value is NativeCollection {
  return typeof value === 'object' && value !== null &&
    'updateOne' in value && typeof value.updateOne === 'function' &&
    'findOne' in value && typeof value.findOne === 'function' &&
    'deleteMany' in value && typeof value.deleteMany === 'function' &&
    'find' in value && typeof value.find === 'function';
}
export function deliveryCollection(model: { tableName: string; getDatastore(): Sails.Datastore }): NativeCollection {
  const collection: unknown = model.getDatastore().manager.collection(model.tableName);
  if (!isNativeCollection(collection)) throw new Error('SIEM delivery requires a Mongo native collection');
  return collection;
}
const eligible = (now: string) => ({ $or: [{ nextEligibleAt: { $exists: false } }, { nextEligibleAt: null }, { nextEligibleAt: { $lte: now } }] });
export function readyEventsFilter(brandId: string, now: string): object {
  return { brandId, $and: [eligible(now), { $or: [
    { deliveryState: { $in: ['pending', 'failed', 'partial'] } },
    { deliveryState: 'processing', leaseExpiresAt: { $lte: now } },
    // Upgrade recovery for processing records written before leases existed.
    { deliveryState: 'processing', leaseExpiresAt: null },
  ] }] };
}
export async function claimDelivery(event: SecurityEventAttributes, leaseMs: number): Promise<SecurityEventAttributes | null> {
  const now = new Date().toISOString();
  const token = randomUUID();
  const collection = deliveryCollection(SecurityEvent);
  const result = await collection.updateOne({ ...readyEventsFilter(event.brandId, now), eventId: event.eventId }, { $set: {
    deliveryState: 'processing', leaseToken: token, leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(), updatedAt: now,
  } });
  if (result.matchedCount !== 1) return null;
  return collection.findOne({ eventId: event.eventId, leaseToken: token });
}
/** Every write, including renewal and completion, must still own an unexpired lease. */
export async function saveDelivery(event: SecurityEventAttributes, values: object): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await deliveryCollection(SecurityEvent).updateOne({ eventId: event.eventId, leaseToken: event.leaseToken, leaseExpiresAt: { $gt: now } },
    { $set: { ...values, updatedAt: now } });
  return result.matchedCount === 1;
}
export function readProgress(value: unknown): DestinationProgress | undefined {
  if (value === 'success' || value === 'deadLetter') return { status: value, attempts: 0 };
  if (typeof value !== 'object' || value === null || !('status' in value) || !('attempts' in value)) return undefined;
  const { status, attempts } = value;
  if (!['success', 'failed', 'processing', 'deadLetter'].includes(String(status)) || typeof attempts !== 'number') return undefined;
  if (status !== 'success' && status !== 'failed' && status !== 'processing' && status !== 'deadLetter') return undefined;
  return { status, attempts, nextEligibleAt: 'nextEligibleAt' in value && typeof value.nextEligibleAt === 'string' ? value.nextEligibleAt : undefined };
}
