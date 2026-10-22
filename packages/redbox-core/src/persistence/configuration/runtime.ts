import type { ConfigurationRepositories } from './ConfigurationRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<ConfigurationRepositories>('configuration', async app => {
  const { inspectConfigurationPersistence }: typeof import('./preflight') = require('./preflight');
  const { requirePersistenceIndex }: typeof import('../indexes') = require('../indexes');
  (await inspectConfigurationPersistence(app)).forEach(requirePersistenceIndex);
  const {
    prismaConfigurationRepositories,
  }: typeof import('./PrismaConfigurationRepositories') = require('./PrismaConfigurationRepositories');
  const repositories: ConfigurationRepositories = prismaConfigurationRepositories(await prismaDatabase(app, 'mongodb'));
  return repositories;
});

export const initializeConfigurationPersistence = group.initialize;
export const getConfigurationRepositories = group.get;
