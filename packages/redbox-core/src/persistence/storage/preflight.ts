import { persistenceIndexPreflight } from '../indexPreflight';
import type { PersistenceIndex } from '../indexes';

export const attachmentIndexes: readonly PersistenceIndex[] = [
  { datastore: 'mongodb', collection: 'counter', name: 'name_1', keys: { name: 1 }, unique: true },
  {
    datastore: 'mongodb',
    collection: 'attachmentmetadata',
    name: 'storageKey_1',
    keys: { storageKey: 1 },
    unique: true,
  },
  {
    datastore: 'mongodb',
    collection: 'attachmentmetadata',
    name: 'oid_1_fileId_1',
    keys: { oid: 1, fileId: 1 },
    unique: true,
  },
  { datastore: 'mongodb', collection: 'attachmentmetadata', name: 'oid_1', keys: { oid: 1 } },
  {
    datastore: 'mongodb',
    collection: 'attachmentaccessaudit',
    name: 'oid_1_accessedAt_-1',
    keys: { oid: 1, accessedAt: -1 },
  },
  {
    datastore: 'mongodb',
    collection: 'attachmentaccessaudit',
    name: 'storageKey_1_accessedAt_-1',
    keys: { storageKey: 1, accessedAt: -1 },
  },
  {
    datastore: 'mongodb',
    collection: 'attachmentaccessaudit',
    name: 'action_1_accessedAt_-1',
    keys: { action: 1, accessedAt: -1 },
  },
];
const preflight = persistenceIndexPreflight({
  collections: { mongodb: ['attachmentmetadata', 'attachmentaccessaudit', 'counter'] },
  indexes: attachmentIndexes,
});
export const inspectStoragePersistence = preflight.inspect;
export const ensureStoragePersistenceIndexes = preflight.ensure;
