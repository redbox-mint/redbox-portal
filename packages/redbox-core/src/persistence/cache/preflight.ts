import type { PersistenceOwner } from '../owner';
import { initializePersistence, persistenceOperation } from '../runtime';
import { inspectPersistenceCollections } from '../indexPreflight';
import { inspectPersistenceIndex, ensurePersistenceIndex } from '../indexes';
import type { PersistenceIndex, PersistenceIndexInspection } from '../indexes';
import { CachePersistenceError, safePersistenceFailure } from './errors';

export interface CacheIndexInspection {
  mongoMajor: number;
  duplicateNameGroups: number;
  index: PersistenceIndexInspection['index'];
}
export const cacheEntryIndex: PersistenceIndex = {
  datastore: 'mongodb',
  collection: 'cacheentry',
  name: 'cacheentry_name_unique',
  keys: { name: 1 },
  unique: true,
};

export function requireCacheIndex(report: CacheIndexInspection): void {
  if (report.duplicateNameGroups > 0)
    throw new CachePersistenceError(
      'duplicate-data',
      'Duplicate cacheentry names block Cache persistence activation. Run npm run persistence:indexes -- --inspect and review duplicate data with its owner before explicitly using --ensure. No documents were cleaned up. See support/wiki/Persistence-Index-Preparation.md.'
    );
  if (report.index === 'conflicting')
    throw new CachePersistenceError(
      'conflicting-index',
      'A conflicting cacheentry name index blocks Cache persistence activation. Run npm run persistence:indexes -- --inspect and review index definitions before explicitly using --ensure. See support/wiki/Persistence-Index-Preparation.md.'
    );
  if (report.index !== 'ready')
    throw new CachePersistenceError(
      'missing-index',
      'The required cacheentry unique name index is missing on the application datastore. Run npm run persistence:indexes -- --inspect, review duplicates/indexes, then explicitly run npm run persistence:indexes -- --ensure with writers stopped. Existing volumes do not run fresh-stack init scripts. No documents were cleaned up. See support/wiki/Persistence-Index-Preparation.md.'
    );
}

async function cacheIndex(app: PersistenceOwner, ensure: boolean): Promise<CacheIndexInspection> {
  try {
    await initializePersistence(app);
    return await persistenceOperation(app, async () => {
      const mongoMajor = await inspectPersistenceCollections(app, 'mongodb', ['cacheentry']);
      const report = await (ensure ? ensurePersistenceIndex : inspectPersistenceIndex)(app, cacheEntryIndex);
      return { mongoMajor, duplicateNameGroups: report.duplicateKeyGroups ?? 0, index: report.index };
    });
  } catch (error) {
    throw safePersistenceFailure(error);
  }
}
export const inspectCachePersistence = (app: PersistenceOwner): Promise<CacheIndexInspection> =>
  cacheIndex(app, false);
export const ensureCachePersistenceIndex = (app: PersistenceOwner): Promise<CacheIndexInspection> =>
  cacheIndex(app, true);
