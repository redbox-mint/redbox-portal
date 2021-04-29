import {Readable}  from 'stream';

interface StorageService{

  create(brand, record, recordType, user?):Promise<any>;
  updateMeta(brand, oid, record, user?): Promise<any>;
  getMeta(oid): Promise<any>;
  createBatch(type, data, harvestIdFldName): Promise<any>;
  provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue): void;
  getRelatedRecords(oid, brand): Promise<any>;
  delete(oid): Promise<any>;
  updateNotificationLog(oid, record, options): Promise<any>;

  getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort): Promise<any>;
  exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType): Readable;

}
export default StorageService
