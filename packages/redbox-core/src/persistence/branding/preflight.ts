import { persistenceIndexPreflight } from '../indexPreflight';
import { brandingIndexes } from './indexDescriptors';
export { brandingIndexes } from './indexDescriptors';

const preflight = persistenceIndexPreflight({
  collections: { mongodb: ['brandingconfig'], redboxStorage: ['brandingconfighistory'] },
  indexes: brandingIndexes,
  alternative: index => ({ ...index, unique: true, sparse: false }),
});
export const inspectBrandingPersistence = preflight.inspect;
export const ensureBrandingPersistenceIndexes = preflight.ensure;
