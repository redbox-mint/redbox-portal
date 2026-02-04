import StorageServiceResponse from "./StorageServiceResponse";
import { RecordModel } from "./model";

/**
 * Service interface for Records operations.
 * Note: This interface uses `any` types extensively for backward compatibility.
 * Type safety will be improved incrementally in future phases.
 */
export interface RecordsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triggerPreSaveTriggers(oid: string, record: any, recordType: object, mode: string, user: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triggerPostSaveTriggers(oid: string, record: any, recordType: object, mode: string, user: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triggerPostSaveSyncTriggers(oid: string, record: any, recordType: any, mode: string, user: object, response: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hasEditAccess(brand: any, user: any, roles: any, record: any): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hasViewAccess(brand: any, user: any, roles: any, record: any): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appendToRecord(targetRecordOid: string, linkData: any, fieldName: string, fieldType: string, targetRecord: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setWorkflowStepRelatedMetadata(currentRec: any, nextStep: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transitionWorkflowStepMetadata(currentRec: any, nextStep: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triggerPreSaveTransitionWorkflowTriggers(oid: string, record: any, recordType: object, nextStep: any, user: object): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triggerPostSaveTransitionWorkflowTriggers(oid: string, record: any, recordType: any, nextStep: any, user: object, response: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAttachments(oid: string, labelFilterStr?: string): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDeletedRecords(workflowState: any, recordType: any, start: any, rows: any, username: any, roles: any, brand: any, editAccessOnly: any, packageType: any, sort: any, fieldNames?: any, filterString?: any, filterMode?: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRecords(workflowState: any, recordType: any, start: any, rows: any, username: any, roles: any, brand: any, editAccessOnly: any, packageType: any, sort: any, fieldNames?: any, filterString?: any, filterMode?: any, secondarySort?: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(brand: any, record: any, recordType: any, user?: any, triggerPreSaveTriggers?: any, triggerPostSaveTriggers?: any, targetStep?: any): Promise<StorageServiceResponse>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateMeta(brand: any, oid: string, record: any, user?: any, triggerPreSaveTriggers?: any, triggerPostSaveTriggers?: any, targetStep?: any, metadata?: any): Promise<StorageServiceResponse>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete(oid: string, permanentlyDelete: boolean, record: any, recordType: any, user: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destroyDeletedRecord(oid: any, user: any): Promise<any>;
  getMeta(oid: string): Promise<RecordModel>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  restoreRecord(oid: any, user: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRecordAudit(params: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRelatedRecords(oid: any, brand: any): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportAllPlans(username: any, roles: any, brand: any, format: any, modBefore: any, modAfter: any, recType: any): any;
  // Probably to be retired or reimplemented in a different service
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkRedboxRunning(): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleUpdateDataStream(oid: any, emptyDatastreamRecord: any, metadata: any): void;
}

