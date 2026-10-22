import type { HarvestRepositories } from './HarvestRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<HarvestRepositories>('harvest', async app => {
  const { inspectHarvestPersistence }: typeof import('./preflight') = require('./preflight');
  const { requirePersistenceIndex }: typeof import('../indexes') = require('../indexes');
  (await inspectHarvestPersistence(app)).forEach(requirePersistenceIndex);
  const {
    prismaHarvestRepositories,
  }: typeof import('./PrismaHarvestRepositories') = require('./PrismaHarvestRepositories');
  const repositories: HarvestRepositories = prismaHarvestRepositories(await prismaDatabase(app, 'mongodb'));
  return repositories;
});

export const initializeHarvestPersistence = group.initialize;
export const getHarvestRepositories = group.get;
