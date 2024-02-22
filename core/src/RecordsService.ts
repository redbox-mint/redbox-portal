import { StorageService } from "./StorageService";

export interface RecordsService {

  triggerPreSaveTriggers(oid: string, record: any, recordType: object, mode: string, user): Promise<any>;
  triggerPostSaveTriggers(oid: string, record: any, recordType: object, mode: string, user): void;
  triggerPostSaveSyncTriggers(oid: string, record: any, recordType: any, mode: string, user: object, response: any) : any;
  hasEditAccess(brand, user, roles, record): boolean;
  hasViewAccess(brand, user, roles, record): boolean;
  appendToRecord(targetRecordOid: string, linkData: any, fieldName: string, fieldType: string, targetRecord: any): Promise<any>
  updateWorkflowStep(currentRec, nextStep): void;
  getAttachments(oid: string, labelFilterStr?: string): Promise<any>;
  getDeletedRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames?, filterString?, filterMode?): Promise<any>;
  getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames?, filterString?, filterMode?): Promise<any>;
  create(brand, record, recordType, user?):Promise<any>;
  updateMeta(brand, oid, record, user?, triggerPreSaveTriggers?, triggerPostSaveTriggers?): Promise<any>;
  delete(oid, permanentlyDelete, user): Promise<any>;
  destroyDeletedRecord(oid: any, user:any): Promise<any>;
  getMeta(oid): Promise<any>;
  restoreRecord(oid,user): Promise<any>;
  getRecordAudit(params): Promise<any>;
  getRelatedRecords(oid, brand): Promise<any>;
  // Probably to be retired or reimplemented in a different service
  checkRedboxRunning(): Promise<any>;

}

