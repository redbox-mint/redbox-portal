/** Physical attachment rows projected to opaque string identities; no loaded-model types. */
export interface AttachmentRow {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  accessCount?: number;
  attachmentId?: string | null;
  operation?: 'add' | 'finalize' | 'delete';
  mutationState?:
    | 'prepared'
    | 'pending'
    | 'applied'
    | 'incomplete'
    | 'unknown'
    | 'cancelled'
    | 'cleanup-pending'
    | 'cleanup-checking'
    | 'cleanup-removing'
    | 'cleaned'
    | 'staging-available'
    | 'staging-preparing'
    | 'staging-cleanup';
  generation?: string | null;
  isJournal?: boolean;
  mutationFileId?: string | null;
  stagingActorId?: string;
  stagingBrandId?: string;
  coordinationToken?: string | null;
  attemptCount?: number;
  lastAttemptAt?: string | Date | null;
  coordinationLeaseExpiresAt?: string | Date | null;
  lastSafeErrorCode?: string | null;
  attachmentField?: string;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  fileId: string;
  filename?: string;
  lastAccessedAt?: string | Date;
  lastAccessedBy?: string;
  lastModified?: string | Date;
  mimeType?: string;
  oid: string;
  storageKey: string;
  uploadedBy?: string;
}

export interface AttachmentAccessRow {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  accessedAt: string | Date;
  accessedBy?: string;
  action: 'access' | 'download' | 'list' | 'upload' | 'remove' | string;
  fileId?: string;
  itemCount?: number;
  oid: string;
  storageKey?: string;
}
