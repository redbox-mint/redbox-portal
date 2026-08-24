import { Readable } from 'node:stream';
import { DeletedRecordModel, RecordModel } from './model';
import { StorageMutationResponse, StorageServiceResponse } from './StorageServiceResponse';
import { RecordRelationshipExpandOptions, RecordRelationshipGraph } from './RecordsService';
import type { RecordStorageMutationOptions, StorageServiceCapabilities } from './RecordStorageConcurrency';
import type {
  RecordSchemaArtifactInput,
  RecordSchemaArtifactModel,
  RecordSchemaDeleteRequest,
  RecordSchemaDeleteResult,
  RecordSchemaGrantQuery,
  RecordSchemaReferenceInput,
  RecordSchemaReferenceModel,
  RecordSchemaReferenceQuery,
} from './model/storage/record-schema';

export const RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS = [
  'putRecordSchemaArtifact',
  'getRecordSchemaArtifact',
  'touchRecordSchemaArtifact',
  'putRecordSchemaReference',
  'listRecordSchemaGrants',
  'listRecordSchemaReferences',
  'deleteRecordSchemaArtifactIfUnreferenced',
] as const;

export type RecordSchemaStorageCapabilityMethod = (typeof RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS)[number];

/**
 * Service interface for Storage operations.
 * Note: This interface uses `unknown` types extensively for backward compatibility.
 * Type safety will be improved incrementally in future phases.
 */
export interface StorageService {
  create(
    brand: unknown,
    record: unknown,
    recordType: unknown,
    user?: unknown,
    options?: RecordStorageMutationOptions
  ): Promise<StorageMutationResponse>;
  updateMeta(
    brand: unknown,
    oid: unknown,
    record: unknown,
    user?: unknown,
    options?: RecordStorageMutationOptions
  ): Promise<StorageMutationResponse>;
  /** An absent declaration is unsupported for strict concurrency. */
  getCapabilities?(): StorageServiceCapabilities;
  /** Atomic active removal primitive used by staged lifecycle orchestration. */
  removeActiveRecord?(
    brand: unknown,
    oid: unknown,
    options?: RecordStorageMutationOptions
  ): Promise<StorageMutationResponse>;
  /** Idempotently persist a durable lifecycle intent before active removal. */
  createTombstone?(
    brand: unknown,
    oid: unknown,
    record: unknown,
    options?: RecordStorageMutationOptions
  ): Promise<StorageMutationResponse>;
  /** Atomic tombstone claim/update primitive used by restore and purge. */
  updateTombstone?(
    brand: unknown,
    oid: unknown,
    record: unknown,
    options?: RecordStorageMutationOptions
  ): Promise<StorageMutationResponse>;
  /** Atomic tombstone finalization/removal primitive used by restore and purge. */
  removeTombstone?(
    brand: unknown,
    oid: unknown,
    options?: RecordStorageMutationOptions
  ): Promise<StorageMutationResponse>;
  /** Continue a claimed restore lineage without exposing a caller-selected revision. */
  createActiveRecordFromTombstone?(
    brand: unknown,
    oid: unknown,
    record: unknown,
    options?: RecordStorageMutationOptions
  ): Promise<StorageMutationResponse>;
  /** Brand-scoped lifecycle wrapper read used by restore, purge, and recovery. */
  getTombstone?(brand: unknown, oid: unknown): Promise<DeletedRecordModel | null>;
  /** Bounded recovery scan; callers still condition every mutation by operation identity. */
  getLifecycleTombstones?(states: readonly string[], limit?: number): Promise<DeletedRecordModel[]>;
  getMeta(oid: unknown): Promise<RecordModel>;
  createBatch(type: unknown, data: unknown, harvestIdFldName: unknown): Promise<unknown>;
  /** @deprecated Whole-record permission rewrites must use RecordsService.mutateMetaInternal(). */
  provideUserAccessAndRemovePendingAccess(
    oid: unknown,
    userid: unknown,
    pendingValue: unknown
  ): Promise<StorageMutationResponse>;
  getRelatedRecords(
    oid: unknown,
    brand: unknown,
    options?: RecordRelationshipExpandOptions
  ): Promise<RecordRelationshipGraph>;
  /** @deprecated Lifecycle deletion must use RecordsService's staged CAS state machine. */
  delete(
    oid: unknown,
    permanentlyDelete: unknown,
    options?: RecordStorageMutationOptions
  ): Promise<StorageServiceResponse>;
  /** @deprecated Persisted notification writes must use RecordsService.mutateMetaInternal(). */
  updateNotificationLog(oid: unknown, record: unknown, options: unknown): Promise<unknown>;

  /** @deprecated Lifecycle deletion must use RecordsService's staged CAS state machine. */
  restoreRecord(oid: unknown, options?: RecordStorageMutationOptions): Promise<StorageServiceResponse>;
  /** @deprecated Lifecycle purge must use RecordsService's staged CAS state machine. */
  destroyDeletedRecord(oid: unknown, options?: RecordStorageMutationOptions): Promise<StorageServiceResponse>;
  getDeletedRecordMeta(oid: string): Promise<RecordModel | null>;

  getRecords(
    workflowState: unknown,
    recordType: unknown,
    start: unknown,
    rows: unknown,
    username: unknown,
    roles: unknown,
    brand: unknown,
    editAccessOnly: unknown,
    packageType: unknown,
    sort: unknown,
    fieldNames?: unknown,
    filterString?: unknown,
    filterMode?: unknown,
    secondarySort?: unknown
  ): Promise<StorageServiceResponse>;
  getDeletedRecords(
    workflowState: unknown,
    recordType: unknown,
    start: unknown,
    rows: unknown,
    username: unknown,
    roles: unknown,
    brand: unknown,
    editAccessOnly: unknown,
    packageType: unknown,
    sort: unknown,
    fieldNames?: unknown,
    filterString?: unknown,
    filterMode?: unknown
  ): Promise<StorageServiceResponse>;
  getDeletedRecordMeta(oid: unknown): Promise<RecordModel | null>;
  exportAllPlans(
    username: unknown,
    roles: unknown,
    brand: unknown,
    format: unknown,
    modBefore: unknown,
    modAfter: unknown,
    recType: unknown
  ): Readable;

  /**
   * Persist an audit synchronously and report whether it was durably applied.
   * Legacy/out-of-tree storage hooks may omit this method; operations requiring
   * durable validation audit then fail closed before record storage.
   */
  createRecordAudit?(record: unknown): Promise<StorageServiceResponse>;
  createIntegrationAudit?(record: unknown): Promise<StorageServiceResponse>;
  /** Optional so existing storage hooks remain compatible while record-schema support is disabled. */
  putRecordSchemaArtifact?(artifact: RecordSchemaArtifactInput): Promise<StorageServiceResponse>;
  getRecordSchemaArtifact?(digest: string): Promise<RecordSchemaArtifactModel | null>;
  touchRecordSchemaArtifact?(digest: string): Promise<StorageServiceResponse>;
  putRecordSchemaReference?(reference: RecordSchemaReferenceInput): Promise<StorageServiceResponse>;
  listRecordSchemaGrants?(query: string | RecordSchemaGrantQuery): Promise<RecordSchemaReferenceModel[]>;
  listRecordSchemaReferences?(query: RecordSchemaReferenceQuery): Promise<RecordSchemaReferenceModel[]>;
  deleteRecordSchemaArtifactIfUnreferenced?(
    request: RecordSchemaDeleteRequest
  ): Promise<StorageServiceResponse<RecordSchemaDeleteResult>>;
  exists(oid: unknown): Promise<boolean>;
  getRecordAudit(params: unknown): Promise<unknown>;
  getIntegrationAudit(params: unknown): Promise<unknown>;
  countIntegrationAudit?(params: unknown): Promise<number>;
}

/** Returns every missing durable schema method in stable capability order. */
export function getMissingRecordSchemaStorageCapabilities(provider: unknown): RecordSchemaStorageCapabilityMethod[] {
  if (provider === null || (typeof provider !== 'object' && typeof provider !== 'function')) {
    return [...RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS];
  }

  return RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS.filter(method => typeof Reflect.get(provider, method) !== 'function');
}
