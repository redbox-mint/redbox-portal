interface StorageService{

  create(brand, record, recordType, user?, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean):Promise<any>;
  updateMeta(brand, oid, record, user?, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean): Promise<any>;
  getMeta(oid): Promise<any>;
  createBatch(type, data, harvestIdFldName): Promise<any>;
  provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue): void;
  getRelatedRecords(oid, brand): Promise<any>;
  delete(oid): Promise<any>;
  updateNotificationLog(oid, record, options): Promise<any>;


}
export default StorageService
