import _ from 'lodash';
import type { StorageService } from '../StorageService';
import type { RecordModel } from '../model/storage/RecordModel';
import type { BrandingModel } from '../model/storage/BrandingModel';
export class DeletedRecordReader {
  public constructor(private readonly storageService: Pick<StorageService, 'getTombstone' | 'getDeletedRecordMeta'>) {}
  async getDeletedRecordMeta(oid: string, brand?: BrandingModel): Promise<RecordModel | null> {
    if (_.isEmpty(oid)) return null;
    if (typeof this.storageService.getTombstone === 'function') {
      const tombstone = await this.storageService.getTombstone(brand, oid);
      if (!tombstone?.deletedRecordMetadata) return null;
      const operation = tombstone.lifecycleOperation;
      return {
        ..._.cloneDeep(tombstone.deletedRecordMetadata),
        revision: tombstone.revision,
        lifecycleState: tombstone.lifecycleState,
        ...(operation
          ? {
              lifecycle: {
                kind: operation.kind,
                attempts: operation.attempts,
                startedAt: operation.startedAt,
                updatedAt: operation.updatedAt,
                ...(operation.errorCode ? { errorCode: operation.errorCode } : {}),
              },
            }
          : {}),
      } as RecordModel;
    }
    return await this.storageService.getDeletedRecordMeta(oid);
  }
}
