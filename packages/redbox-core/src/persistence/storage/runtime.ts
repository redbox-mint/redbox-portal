import type { AttachmentAuditInput } from './PrismaAttachments';
import type { PersistenceOwner } from '../owner';
import type { StorageRepositories } from './StorageRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';
import { PersistenceError } from '../errors';

const audits = new WeakMap<PersistenceOwner, AttachmentAuditInput>();
const group = definePersistenceGroup<StorageRepositories>(
  'storage',
  async app => {
    const { inspectStoragePersistence } = require('./preflight') as typeof import('./preflight');
    const { requirePersistenceIndex } = require('../indexes') as typeof import('../indexes');
    (await inspectStoragePersistence(app)).forEach(requirePersistenceIndex);
    const { Services: Native } = require('./PrismaAttachments') as typeof import('./PrismaAttachments');
    const { prismaCounterRepository } =
      require('./PrismaCounterRepository') as typeof import('./PrismaCounterRepository');
    const { prismaRecordRepository } = require('./PrismaRecordRepository') as typeof import('./PrismaRecordRepository');
    const repository: StorageRepositories = {
      attachments: new Native.PrismaAttachmentRepository(
        await prismaDatabase(app, 'mongodb'),
        audits.get(app) ?? { log: { error: message => app.log.warn(message) } }
      ),
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

export async function initializeStoragePersistence(app: PersistenceOwner, audit?: AttachmentAuditInput): Promise<void> {
  if (audit) audits.set(app, audit);
  await group.initialize(app);
}
export const getStorageRepositories = group.get;
