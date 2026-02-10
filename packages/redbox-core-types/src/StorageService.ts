import { Readable } from 'stream';
import { RecordModel } from './model';
import { StorageServiceResponse } from './StorageServiceResponse';

/**
 * Service interface for Storage operations.
 * Note: This interface uses `unknown` types extensively for backward compatibility.
 * Type safety will be improved incrementally in future phases.
 */
export interface StorageService {
  create(brand: unknown, record: unknown, recordType: unknown, user?: unknown): Promise<StorageServiceResponse>;
  updateMeta(brand: unknown, oid: unknown, record: unknown, user?: unknown): Promise<StorageServiceResponse>;
  getMeta(oid: unknown): Promise<RecordModel>;
  createBatch(type: unknown, data: unknown, harvestIdFldName: unknown): Promise<unknown>;
  provideUserAccessAndRemovePendingAccess(oid: unknown, userid: unknown, pendingValue: unknown): void;
  getRelatedRecords(oid: unknown, brand: unknown): Promise<unknown>;
  delete(oid: unknown, permanentlyDelete: unknown): Promise<StorageServiceResponse>;
  updateNotificationLog(oid: unknown, record: unknown, options: unknown): Promise<unknown>;

  restoreRecord(oid: unknown): Promise<StorageServiceResponse>;
  destroyDeletedRecord(oid: unknown): Promise<StorageServiceResponse>;

  getRecords(workflowState: unknown, recordType: unknown, start: unknown, rows: unknown, username: unknown, roles: unknown, brand: unknown, editAccessOnly: unknown, packageType: unknown, sort: unknown, fieldNames?: unknown, filterString?: unknown, filterMode?: unknown, secondarySort?: unknown): Promise<StorageServiceResponse>;
  getDeletedRecords(workflowState: unknown, recordType: unknown, start: unknown, rows: unknown, username: unknown, roles: unknown, brand: unknown, editAccessOnly: unknown, packageType: unknown, sort: unknown, fieldNames?: unknown, filterString?: unknown, filterMode?: unknown): Promise<StorageServiceResponse>;
  exportAllPlans(username: unknown, roles: unknown, brand: unknown, format: unknown, modBefore: unknown, modAfter: unknown, recType: unknown): Readable;

  createRecordAudit?(record: unknown): Promise<StorageServiceResponse>;
  exists(oid: unknown): Promise<boolean>;
  getRecordAudit(params: unknown): Promise<unknown>;
}
