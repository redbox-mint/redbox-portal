import { persistenceIndexPreflight } from '../indexPreflight';
import type { PersistenceIndex } from '../indexes';
import { progressFields } from './physical';

export const progressIndexes: readonly PersistenceIndex[] = [];
const preflight = persistenceIndexPreflight({
  collections: { mongodb: Object.keys(progressFields) },
  indexes: progressIndexes,
});
export const inspectProgressPersistence = preflight.inspect;
export const ensureProgressPersistenceIndexes = preflight.ensure;
