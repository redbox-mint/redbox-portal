import { Readable } from 'stream';

/**
 * Service interface for Storage operations.
 * Note: This interface uses `any` types extensively for backward compatibility.
 * Type safety will be improved incrementally in future phases.
 */
export interface StorageService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(brand: any, record: any, recordType: any, user?: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateMeta(brand: any, oid: any, record: any, user?: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMeta(oid: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createBatch(type: any, data: any, harvestIdFldName: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provideUserAccessAndRemovePendingAccess(oid: any, userid: any, pendingValue: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRelatedRecords(oid: any, brand: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete(oid: any, permanentlyDelete: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateNotificationLog(oid: any, record: any, options: any): Promise<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  restoreRecord(oid: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destroyDeletedRecord(oid: any): Promise<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRecords(workflowState: any, recordType: any, start: any, rows: any, username: any, roles: any, brand: any, editAccessOnly: any, packageType: any, sort: any, fieldNames?: any, filterString?: any, filterMode?: any, secondarySort?: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDeletedRecords(workflowState: any, recordType: any, start: any, rows: any, username: any, roles: any, brand: any, editAccessOnly: any, packageType: any, sort: any, fieldNames?: any, filterString?: any, filterMode?: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportAllPlans(username: any, roles: any, brand: any, format: any, modBefore: any, modAfter: any, recType: any): Readable;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createRecordAudit?(record: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exists(oid: any): Promise<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRecordAudit(params: any): Promise<any>;
}
