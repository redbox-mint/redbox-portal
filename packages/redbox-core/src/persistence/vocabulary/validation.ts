import { vocabularyFields } from './fields';
import { normalizePersistenceFields } from '../fieldNormalization';
import type { VocabularyValues } from './VocabularyRepositories';

export const normalizeVocabularyFields = (
  collection: string,
  values: VocabularyValues,
  patch: boolean
): VocabularyValues => normalizePersistenceFields(vocabularyFields[collection], values, patch);
