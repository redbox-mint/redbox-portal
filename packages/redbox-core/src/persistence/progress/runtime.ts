import type { ProgressRepositories } from './ProgressRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<ProgressRepositories>('progress', async app => {
  const { inspectProgressPersistence }: typeof import('./preflight') = require('./preflight');
  const { requirePersistenceIndex }: typeof import('../indexes') = require('../indexes');
  (await inspectProgressPersistence(app)).forEach(requirePersistenceIndex);
  const {
    prismaProgressRepositories,
  }: typeof import('./PrismaProgressRepositories') = require('./PrismaProgressRepositories');
  const repositories: ProgressRepositories = prismaProgressRepositories(await prismaDatabase(app, 'mongodb'));
  return repositories;
});

export const initializeProgressPersistence = group.initialize;
export const getProgressRepositories = group.get;
