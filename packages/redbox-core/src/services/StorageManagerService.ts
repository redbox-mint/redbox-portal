export type { Services as StorageManagerTypes } from '../storage/StorageManager';
import { Services as Comparison } from '../compat/sails/storageManager';
export namespace Services {
  export type IDisk = import('../storage/StorageManager').Services.IDisk;
  export class StorageManager extends Comparison.StorageManager {}
}
declare global {
  const StorageManagerService: Services.StorageManager;
}
