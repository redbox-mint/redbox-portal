import {
  isRecordConcurrencyResolution,
  isRecordRevision,
  isRecordSaveRequestId,
  RECORD_REVISION_MAX,
  type RecordConcurrencyResolution,
  type RecordConcurrentModificationMode,
} from '@researchdatabox/sails-ng-common';
import { isDeletedRecordLifecycleState, type DeletedRecordLifecycleState } from './model/storage/DeletedRecordModel';

/**
 * First server-owned revision assigned to a newly-created or legacy record.
 *
 * Clients must treat revisions and entity tags as opaque concurrency tokens;
 * they must not depend on this numeric starting value.
 */
export const INITIAL_RECORD_REVISION = 0 as const;

export const RECORD_STORAGE_CONCURRENCY_CAPABILITY_VERSION = 1 as const;

export interface RecordMutationPrecondition {
  expectedRevision?: number;
  requireRevision: boolean;
}

export interface RecordStorageMutationOptions {
  precondition?: RecordMutationPrecondition;
  /** Correlation only; never an idempotency key. */
  requestId?: string;
  /** Diagnostic only; never relaxes persistence or authorization checks. */
  resolution?: RecordConcurrencyResolution;
  /** Additional durable ownership predicates for lifecycle recovery CAS. */
  lifecycle?: {
    expectedState?: DeletedRecordLifecycleState;
    operationId?: string;
  };
}

export type StorageMutationNonApplicationReason =
  | 'stale-revision'
  | 'not-found'
  | 'brand-mismatch'
  | 'deleted'
  | 'lifecycle-conflict'
  | 'capability-unavailable';

export interface StorageServiceCapabilities {
  /** Versioned token for the complete strict record-concurrency contract. */
  recordConcurrency?: typeof RECORD_STORAGE_CONCURRENCY_CAPABILITY_VERSION;
}

export interface StorageCapabilityProvider {
  getCapabilities?: () => StorageServiceCapabilities;
}

export function hasFullRecordStorageConcurrencyCapability(
  service: StorageCapabilityProvider | null | undefined
): boolean {
  if (!service || typeof service.getCapabilities !== 'function') {
    return false;
  }

  try {
    return service.getCapabilities()?.recordConcurrency === RECORD_STORAGE_CONCURRENCY_CAPABILITY_VERSION;
  } catch {
    return false;
  }
}

/** Safe fail-closed error used at startup and at every strict runtime lookup. */
export class RecordConcurrencyCapabilityError extends Error {
  public readonly code = 'record-concurrency-capability-unavailable' as const;

  constructor() {
    super('The configured storage adapter cannot provide atomic record revision mutations required by strict mode.');
    this.name = 'RecordConcurrencyCapabilityError';
  }
}

export function assertFullRecordStorageConcurrencyCapability(
  service: StorageCapabilityProvider | null | undefined
): asserts service is StorageCapabilityProvider & { getCapabilities: () => StorageServiceCapabilities } {
  if (!hasFullRecordStorageConcurrencyCapability(service)) {
    throw new RecordConcurrencyCapabilityError();
  }
}

/** Runtime policy boundary: permissive modes remain source-compatible. */
export function assertStorageConcurrencyCapabilityForMode(
  mode: RecordConcurrentModificationMode,
  service: StorageCapabilityProvider | null | undefined
): void {
  if (mode === 'strict') {
    assertFullRecordStorageConcurrencyCapability(service);
  }
}

export function nextRecordRevision(revision: number): number {
  if (!isRecordRevision(revision) || revision >= RECORD_REVISION_MAX) {
    throw new RangeError('Record revision cannot be advanced safely.');
  }
  return revision + 1;
}

export function normalizeRecordStorageMutationOptions(
  value: RecordStorageMutationOptions | undefined
): RecordStorageMutationOptions | undefined {
  if (!value) {
    return undefined;
  }
  const normalized: RecordStorageMutationOptions = {};
  if (value.precondition) {
    if (
      typeof value.precondition !== 'object' ||
      Array.isArray(value.precondition) ||
      typeof value.precondition.requireRevision !== 'boolean'
    ) {
      throw new TypeError('Record mutation precondition is malformed.');
    }
    if (
      (value.precondition.expectedRevision !== undefined && !isRecordRevision(value.precondition.expectedRevision)) ||
      (value.precondition.requireRevision === true && !isRecordRevision(value.precondition.expectedRevision))
    ) {
      throw new TypeError('Record mutation precondition contains an invalid revision.');
    }
    normalized.precondition = {
      requireRevision: value.precondition.requireRevision === true,
      ...(isRecordRevision(value.precondition.expectedRevision)
        ? { expectedRevision: value.precondition.expectedRevision }
        : {}),
    };
  }
  if (isRecordSaveRequestId(value.requestId)) normalized.requestId = value.requestId;
  if (isRecordConcurrencyResolution(value.resolution)) normalized.resolution = value.resolution;
  if (value.lifecycle) {
    if (typeof value.lifecycle !== 'object' || Array.isArray(value.lifecycle)) {
      throw new TypeError('Record lifecycle precondition is malformed.');
    }
    const expectedState = isDeletedRecordLifecycleState(value.lifecycle.expectedState)
      ? value.lifecycle.expectedState
      : undefined;
    const operationId = isRecordSaveRequestId(value.lifecycle.operationId) ? value.lifecycle.operationId : undefined;
    if (value.lifecycle.expectedState !== undefined && expectedState === undefined) {
      throw new TypeError('Record lifecycle precondition contains an invalid state.');
    }
    if (value.lifecycle.operationId !== undefined && operationId === undefined) {
      throw new TypeError('Record lifecycle precondition contains an invalid operation identity.');
    }
    normalized.lifecycle = {
      ...(expectedState ? { expectedState } : {}),
      ...(operationId ? { operationId } : {}),
    };
  }
  return normalized;
}
