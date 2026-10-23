import type { ApplicationModule } from '@researchdatabox/redbox-core/application';
import type { RedboxExtension } from '@researchdatabox/redbox-core/extensions';
import type { PersistenceOwner } from '@researchdatabox/redbox-core/extensions/storage';
import { PrismaStorage } from './persistence/StorageProtocol';
import { guardPrismaStorage } from './persistence/guardPrismaStorage';
import type { StorageCollaborators } from './collaborators';
import { storage } from './config/storage';
import { record } from './config/record';
import { recordRevisionMaintenance } from './persistence/RecordRevisionMaintenance';
import { RECORD_REVISION_BACKFILL_MIGRATION_NAME } from './persistence/recordRevisionBackfill';

export interface MongoStorageInputs {
  readonly owner: PersistenceOwner;
  readonly collaborators: StorageCollaborators;
}
export interface MongoStorageModule extends ApplicationModule {
  readonly storage: PrismaStorage;
}
export function createMongoStorageModule(input: MongoStorageInputs): MongoStorageModule {
  const repository = new PrismaStorage(input.owner, input.collaborators);
  return {
    storage: guardPrismaStorage(input.owner, repository),
    initialize: () => repository.init(),
    // GridFS and Prisma are owned by the existing native/persistence resource registry.
    close: async () => {},
  };
}
export function registerRedboxExtension(): RedboxExtension {
  return {
    apiVersion: 1,
    config: { storage, record },
    modules: [{ name: 'storage', create: createMongoStorageModule }],
    migrations: [
      {
        name: RECORD_REVISION_BACKFILL_MIGRATION_NAME,
        requires: ['storage'],
        run: async (input: { owner: PersistenceOwner & { log: Pick<Console, 'warn' | 'info' | 'error'> } }) => {
          await recordRevisionMaintenance(input.owner).backfill();
        },
      },
    ],
  };
}

export { inspectPrismaStagedStorage, ensurePrismaStagedStorageIndexes } from './persistence/preflight';
