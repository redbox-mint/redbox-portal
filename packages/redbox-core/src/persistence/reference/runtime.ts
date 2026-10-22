import type { ReferenceRepositories } from './ReferenceRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<ReferenceRepositories>('reference', async app => {
  const { inspectReferencePersistence }: typeof import('./preflight') = require('./preflight');
  const { requirePersistenceIndex }: typeof import('../indexes') = require('../indexes');
  (await inspectReferencePersistence(app)).forEach(requirePersistenceIndex);
  const {
    prismaReferenceRepositories,
  }: typeof import('./PrismaReferenceRepositories') = require('./PrismaReferenceRepositories');
  const repositories: ReferenceRepositories = prismaReferenceRepositories(await prismaDatabase(app, 'mongodb'));
  return repositories;
});

export const initializeReferencePersistence = group.initialize;
export const getReferenceRepositories = group.get;
