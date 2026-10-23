import type { BrandingRepository } from './BrandingRepository';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<BrandingRepository>('branding', async app => {
  const { inspectBrandingPersistence } = require('./preflight') as typeof import('./preflight');
  const { requirePersistenceIndex } = require('../indexes') as typeof import('../indexes');
  (await inspectBrandingPersistence(app)).forEach(requirePersistenceIndex);
  const { prismaBrandingRepository } =
    require('./PrismaBrandingRepository') as typeof import('./PrismaBrandingRepository');
  const repository: BrandingRepository = prismaBrandingRepository(
    await prismaDatabase(app, 'mongodb'),
    await prismaDatabase(app, 'redboxStorage'),
    app
  );
  return repository;
});

export const initializeBrandingPersistence = group.initialize;
export const getBrandingRepository = group.get;
