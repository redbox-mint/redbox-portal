import type { FigshareSyncRepository } from './FigshareSyncRepository';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<FigshareSyncRepository>('figshare', async app => {
  const { inspectFigsharePersistence } = require('./preflight') as typeof import('./preflight');
  const { requirePersistenceIndex } = require('../indexes') as typeof import('../indexes');
  (await inspectFigsharePersistence(app)).forEach(requirePersistenceIndex);
  const { prismaFigshareRepository } =
    require('./PrismaFigshareRepository') as typeof import('./PrismaFigshareRepository');
  const repository: FigshareSyncRepository = prismaFigshareRepository(await prismaDatabase(app, 'mongodb'));
  return repository;
});

export const initializeFigsharePersistence = group.initialize;
export const getFigshareSyncRepository = group.get;
