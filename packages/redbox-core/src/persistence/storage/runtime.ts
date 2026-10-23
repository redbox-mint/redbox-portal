import type { StorageRepositories } from './StorageRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';
import { PersistenceError } from '../errors';

const group = definePersistenceGroup<StorageRepositories>(
  'storage',
  async app => {
    const { inspectStoragePersistence } = require('./preflight') as typeof import('./preflight');
    const { requirePersistenceIndex } = require('../indexes') as typeof import('../indexes');
    (await inspectStoragePersistence(app)).forEach(requirePersistenceIndex);
    const { Services: Native } =
      require('./PrismaAttachmentRepository') as typeof import('./PrismaAttachmentRepository');
    const { prismaCounterRepository } =
      require('./PrismaCounterRepository') as typeof import('./PrismaCounterRepository');
    const { prismaRecordRepository } = require('./PrismaRecordRepository') as typeof import('./PrismaRecordRepository');
    const repository: StorageRepositories = {
      attachments: new Native.PrismaAttachmentRepository(await prismaDatabase(app, 'mongodb')),
      counters: prismaCounterRepository(await prismaDatabase(app, 'mongodb')),
      records: prismaRecordRepository(await prismaDatabase(app, 'redboxStorage')),
    };
    return repository;
  },
  (error, name) => {
    if (error instanceof PersistenceError) throw error;
    if (
      [
        'find',
        'count',
        'findByOid',
        'findUnresolvedByOid',
        'findUnresolvedByStagingFileId',
        'findOneByStorageKey',
        'hasCleanupClaim',
      ].includes(name)
    )
      throw new PersistenceError(
        'storage-read',
        'Storage read is unavailable. Review datastore connectivity and permissions.'
      );
    throw new PersistenceError(
      'storage-unknown',
      'Staged attachment operation failed with an unknown outcome. Reconcile its journal before retrying.'
    );
  }
);

export const initializeStoragePersistence = group.initialize;
export const getStorageRepositories = group.get;
