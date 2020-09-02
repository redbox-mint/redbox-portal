interface RecordsService{

  create(brand, record, recordType, user?, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean):Promise<any>;
  updateMeta(brand, oid, record, user?, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean): Promise<any>;
  getMeta(oid): Promise<any>;
  createBatch(type, data, harvestIdFldName): Promise<any>;
  provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue): void;
  getRelatedRecords(oid, brand): Promise<any>;
  delete(oid): Promise<any>;
  updateNotificationLog(oid, record, options): Promise<any>;
 

  // Potentially we should move these and a couple of others that are purely record handling 
  // to a different service so that RecordsService is purely for integration with storage
  triggerPreSaveTriggers(oid: string, record: any, recordType: object, mode: string, user): Promise<any>;
  triggerPostSaveTriggers(oid: string, record: any, recordType: object, mode: string, user): void;
  triggerPostSaveSyncTriggers(oid: string, record: any, recordType: any, mode: string, user: object, response: any) : any;
  hasEditAccess(brand, user, roles, record): boolean;
  hasViewAccess(brand, user, roles, record): boolean;
  appendToRecord(targetRecordOid: string, linkData: any, fieldName: string, fieldType: string, targetRecord: any): Promise<any>
  updateWorkflowStep(currentRec, nextStep): void;
  getAttachments(oid: string, labelFilterStr?: string): Promise<any>;


  // Probably to be retired or reimplemented in a different service
  checkRedboxRunning(): Promise<any>;

}
export default RecordsService
