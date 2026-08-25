import StorageServiceResponse from './StorageServiceResponse';
import { cloneDeep, isEqual } from 'lodash';
import { DatastreamRequestContext } from './DatastreamService';
import { DeletedRecordModel, RecordModel, UserModel } from './model';
import type { FormAttributes } from './waterline-models';
import { NormalizedRecordRelation } from './config/recordtype.config';
import type { RecordSaveContext, RecordSaveResponse } from './RecordSaveResponse';

type AnyRecord = Record<string, unknown>;
type RecordInput = RecordModel | Record<string, unknown>;
type UserInput = UserModel | Record<string, unknown>;

export interface InternalRecordWriterIdentity {
  readonly kind: 'service';
  readonly id: string;
}

export type InternalRecordMutationAuthorization = { readonly kind: 'service' } | { readonly kind: 'record-edit' };

export type InternalRecordSnapshotMutationClass = 'full-record' | 'transition' | 'external-side-effect';

export interface InternalRecordSnapshotSaveOptions {
  readonly actor: InternalRecordWriterIdentity;
  readonly authorization: InternalRecordMutationAuthorization;
  readonly mutationClass: InternalRecordSnapshotMutationClass;
  readonly oid: string;
  /** Candidate derived from the authoritative snapshot whose revision it still carries. */
  readonly record: RecordInput;
  readonly brand?: unknown;
  readonly user?: UserInput;
  readonly triggerPreSaveTriggers?: boolean;
  readonly triggerPostSaveTriggers?: boolean;
  readonly targetStep?: unknown;
  readonly metadata?: AnyRecord;
  readonly metadataMode?: 'merge' | 'replace' | 'pre-applied';
  readonly operation?: 'update' | 'transition';
  /** Trusted transport schema facts to retain while concurrency remains internal and revision-based. */
  readonly context?: RecordSaveContext;
  /** Diagnostic causation only; never an idempotency key. */
  readonly causedByRequestId?: string;
}

export interface InternalRecomputableMutationRetry {
  readonly idempotent: true;
  readonly recomputable: true;
  /** Includes the first attempt and is capped by the core service. */
  readonly maxAttempts: number;
}

export interface InternalRecomputableMutationOptions {
  readonly actor: InternalRecordWriterIdentity;
  readonly authorization: InternalRecordMutationAuthorization;
  readonly oid: string;
  readonly brand?: unknown;
  readonly user?: UserInput;
  /** Must be synchronous and side-effect-free; it is rerun from each freshly loaded snapshot. */
  readonly mutate: (authoritativeSnapshot: RecordModel) => RecordInput;
  readonly retry?: InternalRecomputableMutationRetry;
  readonly triggerPreSaveTriggers?: boolean;
  readonly triggerPostSaveTriggers?: boolean;
  readonly causedByRequestId?: string;
}

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

export interface AppliedRecordMetadataSubmission {
  readonly metadata: Record<string, unknown>;
  readonly mode: 'merge' | 'replace';
  readonly arrayMergeMode?: 'concat' | 'replace';
}

/**
 * A raw metadata delta whose mutation is already present on the caller-owned
 * record. This keeps legacy internal write-back behavior while still routing
 * the untouched structural input through record-schema validation.
 */
export interface PreAppliedRecordMetadataSubmission {
  readonly metadata: Record<string, unknown>;
  readonly mode: 'pre-applied';
}

export type RecordMetadataSubmission = AppliedRecordMetadataSubmission | PreAppliedRecordMetadataSubmission;

function isMetadataObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Build a detached structural delta from a legacy in-place metadata mutation.
 * Arrays and scalar values remain replacements; unchanged sibling fields are
 * omitted. Removed keys use the JSON Merge Patch `null` deletion marker so a
 * structural validator observes deletions instead of receiving an empty delta.
 */
export function createRecordMetadataDelta(
  previousMetadata: unknown,
  updatedMetadata: unknown
): Record<string, unknown> {
  const previous = isMetadataObject(previousMetadata) ? previousMetadata : {};
  const updated = isMetadataObject(updatedMetadata) ? updatedMetadata : {};
  const delta: Record<string, unknown> = {};
  const setDeltaValue = (key: string, value: unknown): void => {
    Object.defineProperty(delta, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  };

  for (const key of new Set([...Object.keys(previous), ...Object.keys(updated)])) {
    if (!Object.prototype.hasOwnProperty.call(updated, key)) {
      setDeltaValue(key, null);
      continue;
    }

    const previousValue = previous[key];
    const updatedValue = updated[key];
    if (isEqual(previousValue, updatedValue)) continue;

    if (isMetadataObject(previousValue) && isMetadataObject(updatedValue)) {
      const nestedDelta = createRecordMetadataDelta(previousValue, updatedValue);
      setDeltaValue(key, Object.keys(nestedDelta).length > 0 ? nestedDelta : cloneDeep(updatedValue));
      continue;
    }

    setDeltaValue(key, cloneDeep(updatedValue));
  }

  return delta;
}

/**
 * Service interface for Records operations.
 * Note: This interface uses `unknown` types extensively for backward compatibility.
 * Type safety will be improved incrementally in future phases.
 */
export interface RecordsService {
  triggerPreSaveTriggers(
    oid: string,
    record: RecordInput,
    recordType: Record<string, unknown>,
    mode: string,
    user: UserInput
  ): Promise<RecordInput>;
  triggerPostSaveTriggers(
    oid: string,
    record: RecordInput,
    recordType: Record<string, unknown>,
    mode: string,
    user: UserInput
  ): void;
  triggerPostSaveSyncTriggers(
    oid: string,
    record: AnyRecord,
    recordType: unknown,
    mode: string,
    user: Record<string, unknown>,
    response: unknown
  ): unknown;
  hasEditAccess(brand: unknown, user: UserInput, roles: AnyRecord[], record: RecordInput): boolean;
  hasTransitionRoleAuthorization(step: unknown, user: UserInput): boolean;
  hasViewAccess(brand: unknown, user: UserInput, roles: object[], record: RecordInput): boolean;
  appendToRecord(
    targetRecordOid: string,
    linkData: unknown,
    fieldName: string,
    fieldType?: string,
    targetRecord?: RecordInput,
    initiatingUser?: UserInput
  ): Promise<unknown>;
  removeFromRecord(
    targetRecordOid: string,
    dataToRemove: unknown,
    fieldName: string,
    targetRecord?: RecordInput,
    initiatingUser?: UserInput
  ): Promise<unknown>;
  setWorkflowStepRelatedMetadata(currentRec: RecordInput, nextStep: AnyRecord): void;
  transitionWorkflowStepMetadata(currentRec: RecordInput, nextStep: AnyRecord): void;
  triggerPreSaveTransitionWorkflowTriggers(
    oid: string,
    record: RecordInput,
    recordType: Record<string, unknown>,
    nextStep: AnyRecord,
    user: Record<string, unknown>
  ): Promise<RecordInput>;
  triggerPostSaveTransitionWorkflowTriggers(
    oid: string,
    record: RecordInput,
    recordType: unknown,
    nextStep: AnyRecord,
    user: Record<string, unknown>,
    response: unknown
  ): unknown;
  getAttachments(
    oid: string,
    labelFilterStr?: string,
    requestContext?: DatastreamRequestContext
  ): Promise<Record<string, unknown>[]>;
  cleanupAbandonedAttachmentStaging(now?: Date): Promise<{
    claimed: number;
    removed: number;
    retained: number;
    failed: number;
  }>;
  getDeletedRecords(
    workflowState: unknown,
    recordType: unknown,
    start: unknown,
    rows: unknown,
    username: unknown,
    roles: AnyRecord[],
    brand: unknown,
    editAccessOnly: unknown,
    packageType: unknown,
    sort: unknown,
    fieldNames?: unknown,
    filterString?: unknown,
    filterMode?: unknown
  ): Promise<StorageServiceResponse>;
  getRecords(
    workflowState: unknown,
    recordType: unknown,
    start: unknown,
    rows: unknown,
    username: unknown,
    roles: AnyRecord[],
    brand: unknown,
    editAccessOnly: unknown,
    packageType: unknown,
    sort: unknown,
    fieldNames?: unknown,
    filterString?: unknown,
    filterMode?: unknown,
    secondarySort?: unknown
  ): Promise<StorageServiceResponse>;
  create(
    brand: unknown,
    record: RecordInput,
    recordType: unknown,
    user?: UserInput,
    triggerPreSaveTriggers?: boolean,
    triggerPostSaveTriggers?: boolean,
    targetStep?: unknown,
    context?: RecordSaveContext
  ): Promise<RecordSaveResponse>;
  updateMeta(
    brand: unknown,
    oid: string,
    record: RecordInput,
    user?: UserInput,
    triggerPreSaveTriggers?: boolean,
    triggerPostSaveTriggers?: boolean,
    targetStep?: unknown,
    submission?: RecordMetadataSubmission,
    context?: RecordSaveContext
  ): Promise<RecordSaveResponse>;
  updateMetaInternal(options: InternalRecordSnapshotSaveOptions): Promise<RecordSaveResponse>;
  mutateMetaInternal(options: InternalRecomputableMutationOptions): Promise<RecordSaveResponse>;
  delete(
    oid: string,
    permanentlyDelete: boolean,
    record: RecordInput,
    recordType: unknown,
    user: UserInput,
    context?: RecordSaveContext
  ): Promise<RecordSaveResponse>;
  destroyDeletedRecord(
    oid: unknown,
    user: UserInput,
    brand?: unknown,
    context?: RecordSaveContext
  ): Promise<RecordSaveResponse>;
  getMeta(oid: string): Promise<RecordModel>;
  /** The sole authoritative form-contract fingerprint used by form delivery and every save. */
  getRecordFormFingerprint(
    record: RecordInput,
    recordType: Record<string, unknown>,
    targetStep?: unknown,
    sourceForm?: FormAttributes
  ): Promise<string | undefined>;
  getResolvedPermissionsSummary(oid: string): Promise<ResolvedRecordPermissions>;
  restoreRecord(
    oid: unknown,
    user: UserInput,
    brand?: unknown,
    context?: RecordSaveContext
  ): Promise<RecordSaveResponse>;
  getDeletedRecord(oid: string, brand?: unknown): Promise<DeletedRecordModel | null>;
  getDeletedRecordMeta(oid: string, brand?: unknown): Promise<RecordModel | null>;
  recoverLifecycleOperation(tombstone: DeletedRecordModel): Promise<'completed' | 'cancelled' | 'retained'>;
  recoverLifecycleOperations(limit?: number): Promise<{
    inspected: number;
    completed: number;
    cancelled: number;
    retained: number;
  }>;
  getRecordAudit(params: unknown): Promise<Record<string, unknown>[]>;
  getRelatedRecords(
    oid: unknown,
    brand: unknown,
    options?: RecordRelationshipExpandOptions
  ): Promise<RecordRelationshipGraph>;
  getMetaWithRelationships(
    oid: string,
    brand: unknown,
    options?: RecordRelationshipExpandOptions
  ): Promise<RecordMetaWithRelationships>;
  exportAllPlans(
    username: unknown,
    roles: AnyRecord[],
    brand: unknown,
    format: unknown,
    modBefore: unknown,
    modAfter: unknown,
    recType: unknown
  ): unknown;
  bootstrapData(): Promise<void>;
  // Probably to be retired or reimplemented in a different service
  checkRedboxRunning(): Promise<unknown>;
  handleUpdateDataStream(oid: unknown, emptyDatastreamRecord: RecordInput, metadata: AnyRecord): void;
}
