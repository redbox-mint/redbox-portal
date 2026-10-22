import type { MigrationLedgerRepository } from './MigrationLedgerRepository';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<MigrationLedgerRepository>('migration', async app => {
  const { inspectMigrationPersistence }: typeof import('./preflight') = require('./preflight');
  const { requirePersistenceIndex }: typeof import('../indexes') = require('../indexes');
  requirePersistenceIndex(await inspectMigrationPersistence(app));
  const {
    PrismaMigrationLedgerRepository,
  }: typeof import('./PrismaMigrationLedgerRepository') = require('./PrismaMigrationLedgerRepository');
  const concrete: MigrationLedgerRepository = new PrismaMigrationLedgerRepository(await prismaDatabase(app, 'mongodb'));
  return concrete;
});

export const initializeMigrationPersistence = group.initialize;
export const getMigrationLedgerRepository = group.get;
