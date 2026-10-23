import type { SiemRepository } from './SiemRepository';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<SiemRepository>('siem', async app => {
  const { inspectSiemPersistence } = require('./preflight') as typeof import('./preflight');
  const { requirePersistenceIndex } = require('../indexes') as typeof import('../indexes');
  (await inspectSiemPersistence(app)).forEach(requirePersistenceIndex);
  const { prismaSiemRepository } = require('./PrismaSiemRepository') as typeof import('./PrismaSiemRepository');
  const repository: SiemRepository = prismaSiemRepository(await prismaDatabase(app, 'mongodb'));
  return repository;
});

export const initializeSiemPersistence = group.initialize;
export const getSiemRepository = group.get;
