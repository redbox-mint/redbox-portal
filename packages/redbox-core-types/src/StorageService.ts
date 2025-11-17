import {Readable}  from 'stream';

export interface StorageService{

  create(brand, record, recordType, user?):Promise<any>;
  updateMeta(brand, oid, record, user?): Promise<any>;
  getMeta(oid): Promise<any>;
  createBatch(type, data, harvestIdFldName): Promise<any>;
  provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue): void;
  getRelatedRecords(oid, brand): Promise<any>;
  delete(oid, permanentlyDelete): Promise<any>;
  updateNotificationLog(oid, record, options): Promise<any>;

  restoreRecord(oid): Promise<any>;
  destroyDeletedRecord(oid): Promise<any>;

  getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames?, filterString?, filterMode?, secondarySort?): Promise<any>;
  getDeletedRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames?, filterString?, filterMode?): Promise<any>;
  exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType): Readable;

  createRecordAudit?(record):Promise<any>;
  exists(oid): Promise<boolean>;
  getRecordAudit(params): Promise<any>;
}
