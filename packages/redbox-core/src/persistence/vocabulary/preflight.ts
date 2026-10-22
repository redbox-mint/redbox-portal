import { persistenceIndexPreflight } from '../indexPreflight';
import { vocabularyIndexes } from './indexDescriptors';
export { vocabularyIndexes } from './indexDescriptors';
import { vocabularyFields } from './fields';

const preflight = persistenceIndexPreflight({
  collections: { mongodb: Object.keys(vocabularyFields) },
  indexes: vocabularyIndexes,
  alternative: index => ({
    ...index,
    unique: true,
    sparse: index.collection === 'vocabulary' && ['rvaSourceKey_1', 'figshareSourceKey_1'].includes(index.name),
  }),
});
export const inspectVocabularyPersistence = preflight.inspect;
export const ensureVocabularyPersistenceIndexes = preflight.ensure;
