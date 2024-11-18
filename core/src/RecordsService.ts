import StorageServiceResponse from "./StorageServiceResponse";
import { RecordModel } from "./model";

export interface RecordsService {

  triggerPreSaveTriggers(oid: string, record: any, recordType: object, mode: string, user): Promise<any>;
  triggerPostSaveTriggers(oid: string, record: any, recordType: object, mode: string, user): void;
  triggerPostSaveSyncTriggers(oid: string, record: any, recordType: any, mode: string, user: object, response: any) : any;
  hasEditAccess(brand, user, roles, record): boolean;
  hasViewAccess(brand, user, roles, record): boolean;
  appendToRecord(targetRecordOid: string, linkData: any, fieldName: string, fieldType: string, targetRecord: any): Promise<any>
  transitionWorkflowStep(currentRec: any, recordType: any, nextStep: any, user: any, triggerPreSaveTriggers: boolean, triggerPostSaveTriggers: boolean): Promise<any>;
  setWorkflowStepRelatedMetadata(currentRec:any, nextStep:any): void;
  getAttachments(oid: string, labelFilterStr?: string): Promise<any>;
  getDeletedRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames?, filterString?, filterMode?): Promise<any>;
  getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames?, filterString?, filterMode?, secondarySort?): Promise<any>;
  create(brand:any, record:any, recordType:any, user?, triggerPreSaveTriggers?, triggerPostSaveTriggers?, targetStep?):Promise<StorageServiceResponse>;
  updateMeta(brand:any, oid:string, record:any, user?, triggerPreSaveTriggers?, triggerPostSaveTriggers?, targetStep?, metadata?): Promise<StorageServiceResponse>;
  delete(oid:string, permanentlyDelete:boolean, record:any, recordType:any, user:any): Promise<any>;
  destroyDeletedRecord(oid: any, user:any): Promise<any>;
  getMeta(oid): Promise<RecordModel>;
  restoreRecord(oid,user): Promise<any>;
  getRecordAudit(params): Promise<any>;
  getRelatedRecords(oid, brand): Promise<any>;
  // Probably to be retired or reimplemented in a different service
  checkRedboxRunning(): Promise<any>;
  handleUpdateDataStream(oid, emptyDatastreamRecord, metadata);

}

