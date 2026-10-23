import { persistenceIndexPreflight } from '../indexPreflight';
import type { PersistenceIndex } from '../indexes';
import { configurationFields } from './physical';

export const configurationIndexes: readonly PersistenceIndex[] = [
  {
    datastore: 'mongodb',
    collection: 'dashboardconfiguration',
    name: 'branding_1',
    keys: { branding: 1 },
    unique: true,
  },
  { datastore: 'mongodb', collection: 'i18nbundle', name: 'i18nbundle_uid_unique', keys: { uid: 1 }, unique: true },
  {
    datastore: 'mongodb',
    collection: 'i18ntranslation',
    name: 'i18ntranslation_uid_unique',
    keys: { uid: 1 },
    unique: true,
  },
];
const preflight = persistenceIndexPreflight({
  collections: { mongodb: Object.keys(configurationFields) },
  indexes: configurationIndexes,
});
export const inspectConfigurationPersistence = preflight.inspect;
export const ensureConfigurationPersistenceIndexes = preflight.ensure;
