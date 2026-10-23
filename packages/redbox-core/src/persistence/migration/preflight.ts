import { persistenceIndexPreflight } from '../indexPreflight';
import type { PersistenceIndex } from '../indexes';

export const migrationLedgerIndex: PersistenceIndex = {
  datastore: 'mongodb',
  collection: 'migration',
  name: 'migration_name_unique',
  keys: { name: 1 },
  unique: true,
};
const preflight = persistenceIndexPreflight({
  collections: { mongodb: ['migration'] },
  indexes: [migrationLedgerIndex],
});
export const inspectMigrationPersistence = async (app: Sails.Application) => (await preflight.inspect(app))[0];
export const ensureMigrationPersistenceIndex = async (app: Sails.Application) => (await preflight.ensure(app))[0];
