import { persistenceIndexPreflight } from '../indexPreflight';
import type { PersistenceIndex } from '../indexes';
import { referenceFields, keyedReferences } from './physical';

export const referenceIndexes: readonly PersistenceIndex[] = keyedReferences.map(collection => ({
  datastore: 'mongodb',
  collection,
  name: `${collection}_key_unique`,
  keys: { key: 1 },
  unique: true,
}));
const preflight = persistenceIndexPreflight({
  collections: { mongodb: Object.keys(referenceFields) },
  indexes: referenceIndexes,
});
export const inspectReferencePersistence = preflight.inspect;
export const ensureReferencePersistenceIndexes = preflight.ensure;
