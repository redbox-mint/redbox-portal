import type {
  AttachmentRow as AttachmentMetadataAttributes,
  AttachmentAccessRow as AttachmentAccessAuditAttributes,
} from './AttachmentRows';
export type AttachmentAccessAction = 'access' | 'download' | 'list' | 'upload' | 'remove';
export type AttachmentMutationState = Exclude<
  NonNullable<AttachmentMetadataAttributes['mutationState']>,
  'cleanup-checking' | 'staging-available' | 'staging-preparing' | 'staging-cleanup'
>;
export type AttachmentMetadataInput = Omit<AttachmentMetadataAttributes, 'id' | 'createdAt' | 'updatedAt'>;
export type AttachmentAccessAuditInput = Omit<AttachmentAccessAuditAttributes, 'id' | 'createdAt' | 'updatedAt'>;
export type AttachmentAccessEvent = {
  oid: string;
  /** Trusted lifecycle context for captures after active-record removal. */
  brandId?: string;
  fileId?: string;
  storageKey?: string;
  action: AttachmentAccessAction;
  accessedBy?: string;
  itemCount?: number;
};
export type AttachmentStagingCleanupClaim = {
  oid: string;
  attachmentId: string;
  fileId: string;
  generation: string;
  token: string;
  phase?: 'checking' | 'removing';
};
export type AttachmentMetadataServiceContract = {
  upsert: (row: AttachmentMetadataInput) => Promise<void>;
  findByOid: (oid: string) => Promise<AttachmentMetadataAttributes[]>;
  findUnresolvedByOid: (oid: string) => Promise<AttachmentMetadataAttributes[]>;
  findUnresolvedByStagingFileId: (fileId: string) => Promise<AttachmentMetadataAttributes[]>;
  findOneByStorageKey: (storageKey: string) => Promise<AttachmentMetadataAttributes | undefined>;
  prepareMutations: (rows: readonly AttachmentMetadataInput[]) => Promise<void>;
  markMutation: (
    oid: string,
    attachmentId: string,
    generation: string,
    state: AttachmentMutationState,
    code?: string,
    mutationFileId?: string
  ) => Promise<boolean>;
  hasCleanupClaim: (oid: string, fileId: string) => Promise<boolean>;
  claimExpiredStagingCleanup: (before: string, limit?: number) => Promise<AttachmentStagingCleanupClaim[]>;
  beginStagingCleanup: (claim: AttachmentStagingCleanupClaim) => Promise<boolean>;
  authorizeStagingCleanup: (claim: AttachmentStagingCleanupClaim) => Promise<boolean>;
  releaseStagingCleanup: (claim: AttachmentStagingCleanupClaim, code: string) => Promise<boolean>;
  completeStagingCleanup: (claim: AttachmentStagingCleanupClaim) => Promise<boolean>;
  recoverStagingCleanup: (
    claim: AttachmentStagingCleanupClaim,
    stagedObjectExists: boolean
  ) => Promise<'completed' | 'retained' | 'lost'>;
  rebindOid: (fromOid: string, toOid: string) => Promise<void>;
  markDeleted: (row: AttachmentMetadataInput) => Promise<void>;
  deleteByStorageKey: (storageKey: string) => Promise<void>;
  recordAccess: (event: AttachmentAccessEvent) => Promise<void>;
};

/** Named staged attachment operations; no query, model, BSON, cursor or session API. */
export type AttachmentRepository = AttachmentMetadataServiceContract;

export interface CounterSnapshot {
  id?: string | number;
  value?: number;
}
/** Global allocation uses a single atomic Prisma increment. */
export interface CounterRepository {
  incrementGlobal(name: string | undefined, branding: string): Promise<number>;
}
export interface StorageRepositories {
  attachments: AttachmentRepository;
  counters: CounterRepository;
  records: RecordRepository;
}

/** Storage-owned reads used by authorization, bootstrap and stored queries. */
export interface RecordRepository {
  find(
    where: Record<string, unknown>,
    options?: { sort?: Record<string, 1 | -1>; skip?: number; limit?: number }
  ): Promise<Record<string, unknown>[]>;
  count(where: Record<string, unknown>): Promise<number>;
}
