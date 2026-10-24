import { Services as services } from '../CoreService';
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
    constructor(private readonly repository: AttachmentRepository) {
      super();
    }
    public upsert = (...args: Parameters<AttachmentRepository['upsert']>): ReturnType<AttachmentRepository['upsert']> =>
      this.repository.upsert(...args);
    public findByOid = (
      ...args: Parameters<AttachmentRepository['findByOid']>
    ): ReturnType<AttachmentRepository['findByOid']> => this.repository.findByOid(...args);
    public findUnresolvedByOid = (
      ...args: Parameters<AttachmentRepository['findUnresolvedByOid']>
    ): ReturnType<AttachmentRepository['findUnresolvedByOid']> => this.repository.findUnresolvedByOid(...args);
    public findUnresolvedByStagingFileId = (
      ...args: Parameters<AttachmentRepository['findUnresolvedByStagingFileId']>
    ): ReturnType<AttachmentRepository['findUnresolvedByStagingFileId']> =>
      this.repository.findUnresolvedByStagingFileId(...args);
    public prepareMutations = (
      ...args: Parameters<AttachmentRepository['prepareMutations']>
    ): ReturnType<AttachmentRepository['prepareMutations']> => this.repository.prepareMutations(...args);
    public markMutation = (
      ...args: Parameters<AttachmentRepository['markMutation']>
    ): ReturnType<AttachmentRepository['markMutation']> => this.repository.markMutation(...args);
    public hasCleanupClaim = (
      ...args: Parameters<AttachmentRepository['hasCleanupClaim']>
    ): ReturnType<AttachmentRepository['hasCleanupClaim']> => this.repository.hasCleanupClaim(...args);
    public claimExpiredStagingCleanup = (
      ...args: Parameters<AttachmentRepository['claimExpiredStagingCleanup']>
    ): ReturnType<AttachmentRepository['claimExpiredStagingCleanup']> =>
      this.repository.claimExpiredStagingCleanup(...args);
    public beginStagingCleanup = (
      ...args: Parameters<AttachmentRepository['beginStagingCleanup']>
    ): ReturnType<AttachmentRepository['beginStagingCleanup']> => this.repository.beginStagingCleanup(...args);
    public authorizeStagingCleanup = (
      ...args: Parameters<AttachmentRepository['authorizeStagingCleanup']>
    ): ReturnType<AttachmentRepository['authorizeStagingCleanup']> => this.repository.authorizeStagingCleanup(...args);
    public releaseStagingCleanup = (
      ...args: Parameters<AttachmentRepository['releaseStagingCleanup']>
    ): ReturnType<AttachmentRepository['releaseStagingCleanup']> => this.repository.releaseStagingCleanup(...args);
    public completeStagingCleanup = (
      ...args: Parameters<AttachmentRepository['completeStagingCleanup']>
    ): ReturnType<AttachmentRepository['completeStagingCleanup']> => this.repository.completeStagingCleanup(...args);
    public recoverStagingCleanup = (
      ...args: Parameters<AttachmentRepository['recoverStagingCleanup']>
    ): ReturnType<AttachmentRepository['recoverStagingCleanup']> => this.repository.recoverStagingCleanup(...args);
    public rebindOid = (
      ...args: Parameters<AttachmentRepository['rebindOid']>
    ): ReturnType<AttachmentRepository['rebindOid']> => this.repository.rebindOid(...args);
    public markDeleted = (
      ...args: Parameters<AttachmentRepository['markDeleted']>
    ): ReturnType<AttachmentRepository['markDeleted']> => this.repository.markDeleted(...args);
    public findOneByStorageKey = (
      ...args: Parameters<AttachmentRepository['findOneByStorageKey']>
    ): ReturnType<AttachmentRepository['findOneByStorageKey']> => this.repository.findOneByStorageKey(...args);
    public deleteByStorageKey = (
      ...args: Parameters<AttachmentRepository['deleteByStorageKey']>
    ): ReturnType<AttachmentRepository['deleteByStorageKey']> => this.repository.deleteByStorageKey(...args);
    public recordAccess = (
      ...args: Parameters<AttachmentRepository['recordAccess']>
    ): ReturnType<AttachmentRepository['recordAccess']> => this.repository.recordAccess(...args);
  }
}
