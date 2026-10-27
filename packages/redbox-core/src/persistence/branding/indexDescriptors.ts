import type { PersistenceIndex } from '../indexes';
/** Safe-mode Waterline supplied only _id. Keep duplicates; accept existing operator uniqueness. */
export const brandingIndexes: readonly PersistenceIndex[] = [
  { datastore: 'mongodb', collection: 'brandingconfig', name: 'name_1', keys: { name: 1 }, unique: false },
  {
    datastore: 'redboxStorage',
    collection: 'brandingconfighistory',
    name: 'branding_1_version_1',
    keys: { branding: 1, version: 1 },
    unique: false,
  },
];
