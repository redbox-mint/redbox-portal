import StorageServiceResponse from "./StorageServiceResponse";
import { DatastreamRequestContext } from './DatastreamService';
import { RecordModel, UserModel } from "./model";
import { NormalizedRecordRelation } from "./config/recordtype.config";

type AnyRecord = Record<string, unknown>;
type RecordInput = RecordModel | Record<string, unknown>;
type UserInput = UserModel | Record<string, unknown>;
export type ResolvedPermissionUser = { username: string; name: string; email: string };
export type ResolvedRecordPermissions = {
  edit: ResolvedPermissionUser[];
  view: ResolvedPermissionUser[];
  editPending: string[];
  viewPending: string[];
  editRoles: string[];
  viewRoles: string[];
};

export interface RecordRelationshipExpandOptions {
  depth?: number;
  includeRecordTypes?: string[];
  includeRelationIds?: string[];
  fields?: 'summary' | 'full';
}

export interface RecordRelationshipEdge {
  relationId: string;
  label?: string;
  sourceOid: string;
  targetOid: string;
  targetRecordType: string;
}

export interface RecordRelationshipGraph {
  rootOid: string;
  edges: RecordRelationshipEdge[];
  relatedObjects: Record<string, unknown[]>;
  omittedByAccess: Record<string, number>;
}

export interface LegacyRelatedRecordsResponse extends RecordRelationshipGraph {
  processedRelationships: string[];
}

export interface RecordMetaWithRelationships {
  metadata: RecordModel;
  relationships: RecordRelationshipGraph;
}

export interface RecordTypeLookupSummary {
  name: string;
  packageType: string;
  searchFilters: unknown[];
  searchable: boolean;
  relatedTo?: NormalizedRecordRelation[];
}

/**
 * Service interface for Records operations.
 * Note: This interface uses `unknown` types extensively for backward compatibility.
 * Type safety will be improved incrementally in future phases.
 */
export interface RecordsService {
  triggerPreSaveTriggers(oid: string, record: RecordInput, recordType: Record<string, unknown>, mode: string, user: UserInput): Promise<RecordInput>;
  triggerPostSaveTriggers(oid: string, record: RecordInput, recordType: Record<string, unknown>, mode: string, user: UserInput): void;
  triggerPostSaveSyncTriggers(oid: string, record: AnyRecord, recordType: unknown, mode: string, user: Record<string, unknown>, response: unknown): unknown;
  hasEditAccess(brand: unknown, user: UserInput, roles: AnyRecord[], record: RecordInput): boolean;
  hasViewAccess(brand: unknown, user: UserInput, roles: AnyRecord[], record: RecordInput): boolean;
  appendToRecord(targetRecordOid: string, linkData: AnyRecord, fieldName: string, fieldType: string, targetRecord: RecordInput): Promise<unknown>;
  setWorkflowStepRelatedMetadata(currentRec: RecordInput, nextStep: AnyRecord): void;
  transitionWorkflowStepMetadata(currentRec: RecordInput, nextStep: AnyRecord): void;
  triggerPreSaveTransitionWorkflowTriggers(oid: string, record: RecordInput, recordType: Record<string, unknown>, nextStep: AnyRecord, user: Record<string, unknown>): Promise<RecordInput>;
  triggerPostSaveTransitionWorkflowTriggers(oid: string, record: RecordInput, recordType: unknown, nextStep: AnyRecord, user: Record<string, unknown>, response: unknown): unknown;
  getAttachments(oid: string, labelFilterStr?: string, requestContext?: DatastreamRequestContext): Promise<Record<string, unknown>[]>;
  getDeletedRecords(workflowState: unknown, recordType: unknown, start: unknown, rows: unknown, username: unknown, roles: AnyRecord[], brand: unknown, editAccessOnly: unknown, packageType: unknown, sort: unknown, fieldNames?: unknown, filterString?: unknown, filterMode?: unknown): Promise<StorageServiceResponse>;
  getRecords(workflowState: unknown, recordType: unknown, start: unknown, rows: unknown, username: unknown, roles: AnyRecord[], brand: unknown, editAccessOnly: unknown, packageType: unknown, sort: unknown, fieldNames?: unknown, filterString?: unknown, filterMode?: unknown, secondarySort?: unknown): Promise<StorageServiceResponse>;
  create(brand: unknown, record: RecordInput, recordType: unknown, user?: UserInput, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean, targetStep?: unknown): Promise<StorageServiceResponse>;
  updateMeta(brand: unknown, oid: string, record: RecordInput, user?: UserInput, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean, targetStep?: unknown, metadata?: AnyRecord): Promise<StorageServiceResponse>;
  delete(oid: string, permanentlyDelete: boolean, record: RecordInput, recordType: unknown, user: UserInput): Promise<StorageServiceResponse>;
  destroyDeletedRecord(oid: unknown, user: UserInput): Promise<StorageServiceResponse>;
  getMeta(oid: string): Promise<RecordModel>;
  getResolvedPermissionsSummary(oid: string): Promise<ResolvedRecordPermissions>;
  restoreRecord(oid: unknown, user: UserInput): Promise<StorageServiceResponse>;
  getRecordAudit(params: unknown): Promise<Record<string, unknown>[]>;
  getRelatedRecords(oid: unknown, brand: unknown, options?: RecordRelationshipExpandOptions): Promise<RecordRelationshipGraph>;
  getMetaWithRelationships(oid: string, brand: unknown, options?: RecordRelationshipExpandOptions): Promise<RecordMetaWithRelationships>;
  exportAllPlans(username: unknown, roles: AnyRecord[], brand: unknown, format: unknown, modBefore: unknown, modAfter: unknown, recType: unknown): unknown;
  bootstrapData(): Promise<void>;
  // Probably to be retired or reimplemented in a different service
  checkRedboxRunning(): Promise<unknown>;
  handleUpdateDataStream(oid: unknown, emptyDatastreamRecord: RecordInput, metadata: AnyRecord): void;
}
