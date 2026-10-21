import { randomUUID } from 'node:crypto';

export interface PublicationLease {
  owner: string;
  token: string;
  expiresAt: number;
}
export class PublicationLeaseLost extends Error {
  constructor() {
    super('Publication ownership expired or was replaced');
    this.name = 'PublicationLeaseLost';
  }
}
export class PublicationStoreConflict extends Error {
  constructor() {
    super('Publication state changed; reload before checkpointing');
    this.name = 'PublicationStoreConflict';
  }
}
export class PublicationBindingConflict extends Error {
  constructor() {
    super('Publication remote object already has a managing binding');
    this.name = 'PublicationBindingConflict';
  }
}
export function leaseFor(owner: string, leaseMs: number, now: number): PublicationLease {
  positiveDuration(leaseMs);
  if (!owner.trim()) throw new Error('Publication lease owner is required');
  return { owner, token: randomUUID(), expiresAt: now + leaseMs };
}
export function positiveDuration(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Publication duration must be a positive integer');
}
export function isDuplicateKey(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 11000;
}
