import type { VocabularyRepositories } from './VocabularyRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<VocabularyRepositories>('vocabulary', async app => {
  const { inspectVocabularyPersistence } = require('./preflight') as typeof import('./preflight');
  const { requirePersistenceIndex } = require('../indexes') as typeof import('../indexes');
  (await inspectVocabularyPersistence(app)).forEach(requirePersistenceIndex);
  const { prismaVocabularyRepositories } =
    require('./PrismaVocabularyRepositories') as typeof import('./PrismaVocabularyRepositories');
  const { findVocabularyBrand } = require('./BrandingLookup') as typeof import('./BrandingLookup');
  const repositories: VocabularyRepositories = prismaVocabularyRepositories(
    await prismaDatabase(app, 'mongodb'),
    name => findVocabularyBrand(app, name)
  );
  return repositories;
});

export const initializeVocabularyPersistence = group.initialize;
export const getVocabularyRepositories = group.get;
