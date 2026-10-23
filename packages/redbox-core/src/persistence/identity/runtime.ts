import type { IdentityRepositories } from './IdentityRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';

const group = definePersistenceGroup<IdentityRepositories>('identity', async app => {
  const { inspectIdentityPersistence } = require('./preflight') as typeof import('./preflight');
  const { requirePersistenceIndex } = require('../indexes') as typeof import('../indexes');
  (await inspectIdentityPersistence(app)).forEach(requirePersistenceIndex);
  const { prismaIdentityRepositories } =
    require('./PrismaIdentityRepositories') as typeof import('./PrismaIdentityRepositories');
  const repository: IdentityRepositories = prismaIdentityRepositories(
    await prismaDatabase(app, 'mongodb'),
    async user => {
      if (typeof UsersService !== 'undefined')
        await UsersService.findAndAssignAccessToRecords(String(user.email), String(user.username));
    },
    async id => (require('../runtime') as typeof import('../runtime')).getBrandingRepository(app).getBrand({ id })
  );
  return repository;
});

export const initializeIdentityPersistence = group.initialize;
export const getIdentityRepositories = group.get;
