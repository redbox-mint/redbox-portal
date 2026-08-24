import { RecordModel } from './RecordModel';
import { isRecordRevision, isRecordSaveRequestId } from '@researchdatabox/sails-ng-common';
export const DELETED_RECORD_LIFECYCLE_STATES = [
  'delete-pending',
  'deleted',
  'restore-pending',
  'purge-pending',
  'recovery-required',
] as const;

export type DeletedRecordLifecycleState = (typeof DELETED_RECORD_LIFECYCLE_STATES)[number];

export interface DeletedRecordLifecycleOperation {
  requestId: string;
  sourceRevision: number;
  targetRevision: number;
  startedAt: string;
  updatedAt: string;
  attempts: number;
  errorCode?: string;
}

const SAFE_LIFECYCLE_ERROR_CODE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isDeletedRecordLifecycleState(value: unknown): value is DeletedRecordLifecycleState {
  return typeof value === 'string' && (DELETED_RECORD_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function isDeletedRecordLifecycleOperation(value: unknown): value is DeletedRecordLifecycleOperation {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  return (
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
      (typeof operation.errorCode === 'string' && SAFE_LIFECYCLE_ERROR_CODE.test(operation.errorCode)))
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
