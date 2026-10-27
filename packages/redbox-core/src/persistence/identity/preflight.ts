import { persistenceCollections, persistenceCollectionIndexes } from '../prisma/catalog';
import { persistenceOperation } from '../runtime';
import type { PersistenceIndexInspection } from '../indexes';
import { identityFields } from './fields';

/** No new unique indexes or collation policy. Catalog inspection preserves every existing index unchanged. */
export async function inspectIdentityPersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return persistenceOperation(app, async () => {
    const collections = await persistenceCollections(app);
    const reports: PersistenceIndexInspection[] = [];
    for (const collection of [...Object.keys(identityFields), 'role_users__user_roles']) {
      // Empty new databases need no DDL: first model insert creates the normal ObjectId index.
      const exists = collections.some(row => row.name === collection);
      const indexes = exists ? await persistenceCollectionIndexes(app, 'mongodb', collection) : [];
      reports.push({
        datastore: 'mongodb',
        collection,
        name: '_id_',
        index: !exists || indexes.some(index => index.name === '_id_' && index.key._id === 1) ? 'ready' : 'conflicting',
      });
    }
    return reports;
  });
}
export const ensureIdentityPersistenceIndexes = inspectIdentityPersistence;
