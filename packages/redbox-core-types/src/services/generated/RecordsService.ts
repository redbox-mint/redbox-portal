// This file is generated from internal/sails-ts/api/services/RecordsService.ts. Do not edit directly.
import {
  Observable, of, from, mergeMap as flatMap, firstValueFrom, throwError
} from 'rxjs';
import { concatMap, last, catchError } from 'rxjs/operators';
import {
  DatastreamService,
  QueueService,
  RecordAuditModel,
  SearchService,
  Services as services,
  StorageService,
  StorageServiceResponse,
  RecordAuditParams,
  RecordAuditActionType, RBValidationError, ErrorResponseItemV2
} from '../../index';
import {
  Sails,
  Model
} from "sails";
import axios from 'axios';
import * as luceneEscapeQuery from "lucene-escape-query";
import * as fs from 'fs';
import { DateTime } from 'luxon';
import {
  isObservable
} from 'rxjs';
import {
  Readable
} from 'stream';

declare const util: any;

export interface RecordsService {
  create(brand: any, record: any, recordType: any, user?: any, triggerPreSaveTriggers?: any, triggerPostSaveTriggers?: any, targetStep?: any): any;
  updateMeta(brand: any, oid: any, record: any, user?: any, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean, nextStep?: any, metadata?: any): Promise<StorageServiceResponse>;
  getMeta(oid: any): Promise<any>;
  getRecordAudit(params: RecordAuditParams): Promise<any>;
  hasEditAccess(brand: any, user: any, roles: any, record: any): boolean;
  hasViewAccess(brand: any, user: any, roles: any, record: any): boolean;
  search(...args: any[]): any;
  createBatch(type: any, data: any, harvestIdFldName: any): Promise<any>;
  provideUserAccessAndRemovePendingAccess(oid: any, userid: any, pendingValue: any): void;
  searchFuzzy(type: any, workflowState: any, searchQuery: any, exactSearches: any, facetSearches: any, brand: any, user: any, roles: any, returnFields: any): Promise<any>;
  deleteFilesFromStageDir(...args: any[]): any;
  getRelatedRecords(oid: any, brand: any): Promise<any>;
  delete(oid: any, permanentlyDelete: boolean, currentRec: any, recordType: any, user: any): any;
  restoreRecord(oid: any, user: any): Promise<any>;
  destroyDeletedRecord(oid: any, user: any): Promise<any>;
  getDeletedRecords(workflowState: any, recordType: any, start: any, rows: any, username: any, roles: any, brand: any, editAccessOnly: any, packageType: any, sort: any, fieldNames?: any, filterString?: any, filterMode?: any): Promise<any>;
  updateNotificationLog(oid: any, record: any, options: any): Promise<any>;
  triggerPreSaveTriggers(oid: string, record: any, recordType: object, mode?: string, user?: object): any;
  triggerPostSaveTriggers(oid: string, record: any, recordType: any, mode?: string, user?: object): void;
  triggerPostSaveSyncTriggers(oid: string, record: any, recordType: any, mode?: string, user?: object, response?: any): any;
  checkRedboxRunning(): Promise<any>;
  getAttachments(oid: string, labelFilterStr?: string): Promise<any>;
  appendToRecord(targetRecordOid: string, linkData: any, fieldName: string, fieldType?: string, targetRecord?: any): any;
  removeFromRecord(targetRecordOid: string, dataToRemove: any, fieldName: string, targetRecord?: any): any;
  getRecords(workflowState: any, recordType: any | undefined, start: any, rows: any | undefined, username: any, roles: any, brand: any, editAccessOnly?: any, packageType?: any, sort?: any, fieldNames?: any, filterString?: any, filterMode?: any, secondarySort?: any): Promise<any>;
  exportAllPlans(username: any, roles: any, brand: any, format: any, modBefore: any, modAfter: any, recType: any): Readable;
  storeRecordAudit(job: any): any;
  exists(oid: string): any;
  transitionWorkflowStep(currentRec: any, recordType: any, nextStep: any, user: any, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean): any;
  setWorkflowStepRelatedMetadata(currentRec: any, nextStep: any): any;
  transitionWorkflowStepMetadata(currentRec: any, nextStep: any): any;
  triggerPreSaveTransitionWorkflowTriggers(oid: string, record: any, recordType: object, nextStep: any, user?: object): any;
  triggerPostSaveTransitionWorkflowTriggers(oid: string, record: any, recordType: any, nextStep: any, user?: object, response?: any): any;
  handleUpdateDataStream(oid: any, origRecord: any, metadata: any): any;
}
