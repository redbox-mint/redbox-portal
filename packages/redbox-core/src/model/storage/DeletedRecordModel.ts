import { RecordModel } from './RecordModel';
import {
  isRecordConcurrencyResolution,
  isRecordRevision,
  isRecordSaveRequestId,
  type RecordConcurrencyResolution,
} from '@researchdatabox/sails-ng-common';
export const DELETED_RECORD_LIFECYCLE_STATES = [
  'delete-pending',
  'deleted',
  'restore-pending',
  'purge-pending',
  'recovery-required',
] as const;

export type DeletedRecordLifecycleState = (typeof DELETED_RECORD_LIFECYCLE_STATES)[number];

export const DELETED_RECORD_LIFECYCLE_OPERATION_KINDS = ['delete', 'restore', 'purge'] as const;

export type DeletedRecordLifecycleOperationKind = (typeof DELETED_RECORD_LIFECYCLE_OPERATION_KINDS)[number];

export interface DeletedRecordLifecycleOperation {
  /** Server-generated durable ownership identity. It is not a public request idempotency key. */
  operationId: string;
  kind: DeletedRecordLifecycleOperationKind;
  /** Correlation identity of the public/internal request that began the operation. */
  requestId: string;
  sourceRevision: number;
  targetRevision: number;
  startedAt: string;
  updatedAt: string;
  attempts: number;
  errorCode?: string;
  resolution?: RecordConcurrencyResolution;
  resolutionOfRequestId?: string;
}

const SAFE_LIFECYCLE_ERROR_CODE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isDeletedRecordLifecycleState(value: unknown): value is DeletedRecordLifecycleState {
  return typeof value === 'string' && (DELETED_RECORD_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function isDeletedRecordLifecycleOperationKind(value: unknown): value is DeletedRecordLifecycleOperationKind {
  return typeof value === 'string' && (DELETED_RECORD_LIFECYCLE_OPERATION_KINDS as readonly string[]).includes(value);
}

/**
 * Pending/final lifecycle states are owned by one compatible operation kind.
 * `recovery-required` deliberately retains whichever operation was interrupted.
 */
export function isDeletedRecordLifecycleOperationForState(
  state: DeletedRecordLifecycleState,
  kind: DeletedRecordLifecycleOperationKind
): boolean {
  switch (state) {
    case 'delete-pending':
    case 'deleted':
      return kind === 'delete';
    case 'restore-pending':
      return kind === 'restore';
    case 'purge-pending':
      return kind === 'purge';
    case 'recovery-required':
      return true;
  }
}

export function isDeletedRecordLifecycleOperation(value: unknown): value is DeletedRecordLifecycleOperation {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  return (
    isRecordSaveRequestId(operation.operationId) &&
    isDeletedRecordLifecycleOperationKind(operation.kind) &&
    isRecordSaveRequestId(operation.requestId) &&
    isRecordRevision(operation.sourceRevision) &&
    isRecordRevision(operation.targetRevision) &&
    operation.targetRevision > operation.sourceRevision &&
    typeof operation.startedAt === 'string' &&
    operation.startedAt.length <= 64 &&
    Number.isFinite(Date.parse(operation.startedAt)) &&
    typeof operation.updatedAt === 'string' &&
    operation.updatedAt.length <= 64 &&
    Number.isFinite(Date.parse(operation.updatedAt)) &&
    Number.isSafeInteger(operation.attempts) &&
    (operation.attempts as number) >= 0 &&
    (operation.errorCode === undefined ||
      (typeof operation.errorCode === 'string' && SAFE_LIFECYCLE_ERROR_CODE.test(operation.errorCode))) &&
    (operation.resolution === undefined || isRecordConcurrencyResolution(operation.resolution)) &&
    (operation.resolutionOfRequestId === undefined || isRecordSaveRequestId(operation.resolutionOfRequestId))
  );
}

export interface DeletedRecordModel {
  redboxOid: string;
  /** Sole authority for the current tombstone lifecycle revision. */
  revision: number;
  brandId?: string;
  lifecycleState: DeletedRecordLifecycleState;
  lifecycleOperation?: DeletedRecordLifecycleOperation;
  deletedRecordMetadata: RecordModel;
  dateDeleted: string;
}
