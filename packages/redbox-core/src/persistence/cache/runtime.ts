import type { PersistenceOwner } from '../owner';
import { cleanupPersistence, prismaDatabase } from '../runtime';
import { definePersistenceGroup } from '../groupRuntime';
import type { CacheEntryRepository } from './CacheEntryRepository';
import { safePersistenceFailure } from './errors';
import { inspectCachePersistence, requireCacheIndex } from './preflight';

const group = definePersistenceGroup<CacheEntryRepository>('cache', async app => {
  requireCacheIndex(await inspectCachePersistence(app));
  const client = await prismaDatabase(app, 'mongodb');
  const {
    PrismaCacheEntryRepository,
  }: typeof import('./PrismaCacheEntryRepository') = require('./PrismaCacheEntryRepository');
  return new PrismaCacheEntryRepository(client);
});

export async function initializeCachePersistence(app: PersistenceOwner): Promise<void> {
  try {
    await group.initialize(app);
  } catch (error) {
    throw safePersistenceFailure(error);
  }
}
export const getCacheEntryRepository = group.get;

/** Cache borrows the shared runtime, so its public cleanup uses the same drain/close boundary. */
export const cleanupCachePersistence = cleanupPersistence;
export async function cleanupCachePersistenceAfterFailure(app: PersistenceOwner): Promise<void> {
  try {
    await cleanupCachePersistence(app);
  } catch {
    app.log.warn('Cache persistence cleanup failed after startup failure.');
  }
}
