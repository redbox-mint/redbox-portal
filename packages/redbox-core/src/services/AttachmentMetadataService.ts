import { Services as services } from '../CoreService';
import { getStorageRepositories } from '../persistence/storage/runtime';
import type { AttachmentRepository } from '../persistence/storage/StorageRepositories';
export namespace Services {
  export type AttachmentAccessAction = import('../persistence/storage/StorageRepositories').AttachmentAccessAction;
  export type AttachmentMutationState = import('../persistence/storage/StorageRepositories').AttachmentMutationState;
  export type AttachmentMetadataInput = import('../persistence/storage/StorageRepositories').AttachmentMetadataInput;
  export type AttachmentAccessAuditInput =
    import('../persistence/storage/StorageRepositories').AttachmentAccessAuditInput;
  export type AttachmentAccessEvent = import('../persistence/storage/StorageRepositories').AttachmentAccessEvent;
  export type AttachmentStagingCleanupClaim =
    import('../persistence/storage/StorageRepositories').AttachmentStagingCleanupClaim;
  export type AttachmentMetadataServiceContract =
    import('../persistence/storage/StorageRepositories').AttachmentMetadataServiceContract;
  export class AttachmentMetadataService extends services.Core.Service {
    protected override _exportedMethods = [
      'upsert',
      'findByOid',
      'findUnresolvedByOid',
      'findUnresolvedByStagingFileId',
      'prepareMutations',
      'markMutation',
      'hasCleanupClaim',
      'claimExpiredStagingCleanup',
      'beginStagingCleanup',
      'authorizeStagingCleanup',
      'releaseStagingCleanup',
      'completeStagingCleanup',
      'recoverStagingCleanup',
      'rebindOid',
      'markDeleted',
      'findOneByStorageKey',
      'deleteByStorageKey',
      'recordAccess',
    ];
    constructor(private readonly repository?: AttachmentRepository) {
      super();
    }
    public upsert = (...args: Parameters<AttachmentRepository['upsert']>): ReturnType<AttachmentRepository['upsert']> =>
      (this.repository ?? getStorageRepositories().attachments).upsert(...args);
    public findByOid = (
      ...args: Parameters<AttachmentRepository['findByOid']>
    ): ReturnType<AttachmentRepository['findByOid']> =>
      (this.repository ?? getStorageRepositories().attachments).findByOid(...args);
    public findUnresolvedByOid = (
      ...args: Parameters<AttachmentRepository['findUnresolvedByOid']>
    ): ReturnType<AttachmentRepository['findUnresolvedByOid']> =>
      (this.repository ?? getStorageRepositories().attachments).findUnresolvedByOid(...args);
    public findUnresolvedByStagingFileId = (
      ...args: Parameters<AttachmentRepository['findUnresolvedByStagingFileId']>
    ): ReturnType<AttachmentRepository['findUnresolvedByStagingFileId']> =>
      (this.repository ?? getStorageRepositories().attachments).findUnresolvedByStagingFileId(...args);
    public prepareMutations = (
      ...args: Parameters<AttachmentRepository['prepareMutations']>
    ): ReturnType<AttachmentRepository['prepareMutations']> =>
      (this.repository ?? getStorageRepositories().attachments).prepareMutations(...args);
    public markMutation = (
      ...args: Parameters<AttachmentRepository['markMutation']>
    ): ReturnType<AttachmentRepository['markMutation']> =>
      (this.repository ?? getStorageRepositories().attachments).markMutation(...args);
    public hasCleanupClaim = (
      ...args: Parameters<AttachmentRepository['hasCleanupClaim']>
    ): ReturnType<AttachmentRepository['hasCleanupClaim']> =>
      (this.repository ?? getStorageRepositories().attachments).hasCleanupClaim(...args);
    public claimExpiredStagingCleanup = (
      ...args: Parameters<AttachmentRepository['claimExpiredStagingCleanup']>
    ): ReturnType<AttachmentRepository['claimExpiredStagingCleanup']> =>
      (this.repository ?? getStorageRepositories().attachments).claimExpiredStagingCleanup(...args);
    public beginStagingCleanup = (
      ...args: Parameters<AttachmentRepository['beginStagingCleanup']>
    ): ReturnType<AttachmentRepository['beginStagingCleanup']> =>
      (this.repository ?? getStorageRepositories().attachments).beginStagingCleanup(...args);
    public authorizeStagingCleanup = (
      ...args: Parameters<AttachmentRepository['authorizeStagingCleanup']>
    ): ReturnType<AttachmentRepository['authorizeStagingCleanup']> =>
      (this.repository ?? getStorageRepositories().attachments).authorizeStagingCleanup(...args);
    public releaseStagingCleanup = (
      ...args: Parameters<AttachmentRepository['releaseStagingCleanup']>
    ): ReturnType<AttachmentRepository['releaseStagingCleanup']> =>
      (this.repository ?? getStorageRepositories().attachments).releaseStagingCleanup(...args);
    public completeStagingCleanup = (
      ...args: Parameters<AttachmentRepository['completeStagingCleanup']>
    ): ReturnType<AttachmentRepository['completeStagingCleanup']> =>
      (this.repository ?? getStorageRepositories().attachments).completeStagingCleanup(...args);
    public recoverStagingCleanup = (
      ...args: Parameters<AttachmentRepository['recoverStagingCleanup']>
    ): ReturnType<AttachmentRepository['recoverStagingCleanup']> =>
      (this.repository ?? getStorageRepositories().attachments).recoverStagingCleanup(...args);
    public rebindOid = (
      ...args: Parameters<AttachmentRepository['rebindOid']>
    ): ReturnType<AttachmentRepository['rebindOid']> =>
      (this.repository ?? getStorageRepositories().attachments).rebindOid(...args);
    public markDeleted = (
      ...args: Parameters<AttachmentRepository['markDeleted']>
    ): ReturnType<AttachmentRepository['markDeleted']> =>
      (this.repository ?? getStorageRepositories().attachments).markDeleted(...args);
    public findOneByStorageKey = (
      ...args: Parameters<AttachmentRepository['findOneByStorageKey']>
    ): ReturnType<AttachmentRepository['findOneByStorageKey']> =>
      (this.repository ?? getStorageRepositories().attachments).findOneByStorageKey(...args);
    public deleteByStorageKey = (
      ...args: Parameters<AttachmentRepository['deleteByStorageKey']>
    ): ReturnType<AttachmentRepository['deleteByStorageKey']> =>
      (this.repository ?? getStorageRepositories().attachments).deleteByStorageKey(...args);
    public recordAccess = (
      ...args: Parameters<AttachmentRepository['recordAccess']>
    ): ReturnType<AttachmentRepository['recordAccess']> =>
      (this.repository ?? getStorageRepositories().attachments).recordAccess(...args);
  }
}
declare global {
  let AttachmentMetadataService: Services.AttachmentMetadataService;
}
