import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PersistenceError, persistenceOperation } from '@researchdatabox/redbox-core/extensions/storage';
import { RecordSchemaPersistenceError } from './recordSchemaCodec';
import { storageOperations } from './StoragePersistence';
import { PrismaStorage } from './StorageProtocol';

import type { PersistenceOwner } from '@researchdatabox/redbox-core/extensions/storage';
/** Apply the deployed lifecycle and safe-error boundary to the concrete owner. @internal */
export function guardPrismaStorage<T extends PrismaStorage>(app: PersistenceOwner, repository: T): T {
  const guarded = Object.create(repository) as T;
  const reads = new Set([
    'getRecordSchemaArtifact',
    'listRecordSchemaArtifacts',
    'listRecordSchemaReferences',
    'getRecordAudit',
    'getIntegrationAudit',
    'countIntegrationAudit',
    'getMeta',
    'getDeletedRecordMeta',
    'exists',
    'findHarvestRecords',
  ]);
  for (const name of storageOperations.filter(name => name !== 'init')) {
    const method = Reflect.get(repository, name);
    if (name === 'exportAllPlans') {
      // Keep the synchronous Readable contract and own paged IO until the export
      // ends or is destroyed. Returning the admission promise breaks pipeline().
      Reflect.set(guarded, name, (...args: unknown[]) => {
        const output = new PassThrough();
        void persistenceOperation(app, async () => {
          await pipeline(Reflect.apply(method, repository, args), output);
        }).catch(error =>
          output.destroy(
            error instanceof PersistenceError
              ? error
              : new PersistenceError(
                  'storage-read',
                  'Storage export is unavailable. Review datastore connectivity and permissions.'
                )
          )
        );
        return output;
      });
      continue;
    }
    // updateDatastream remains a synchronous Observable factory; its subscribed
    // form reads and individual byte operations already have their own owners.
    if (name !== 'getCapabilities' && name !== 'updateDatastream')
      Reflect.set(guarded, name, (...args: unknown[]) =>
        persistenceOperation(app, () => Reflect.apply(method, repository, args)).catch((error: unknown) => {
          if (error instanceof PersistenceError || error instanceof RecordSchemaPersistenceError) throw error;
          if (reads.has(name))
            throw new PersistenceError(
              'storage-read',
              'Storage read is unavailable. Review datastore connectivity and permissions.'
            );
          throw new PersistenceError(
            'storage-unknown',
            'Storage operation failed. A dispatched write may have applied; reconcile before retrying.'
          );
        })
      );
  }
  return guarded;
}
