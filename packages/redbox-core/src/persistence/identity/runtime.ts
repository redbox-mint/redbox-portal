import type { IdentityRepositories } from './IdentityRepositories';
import { definePersistenceGroup } from '../groupRuntime';
import { prismaDatabase } from '../runtime';
import type { PersistenceOwner } from '../owner';

export interface IdentityPersistenceInput {
  assignPendingAccess(user: Record<string, unknown>): Promise<unknown>;
}
const inputKey = Symbol.for('@researchdatabox/redbox-core/identity-persistence-input/v1');
type IdentityOwner = PersistenceOwner & { readonly [inputKey]?: IdentityPersistenceInput };

const group = definePersistenceGroup<IdentityRepositories>('identity', async app => {
  const { inspectIdentityPersistence } = require('./preflight') as typeof import('./preflight');
  const { requirePersistenceIndex } = require('../indexes') as typeof import('../indexes');
  (await inspectIdentityPersistence(app)).forEach(requirePersistenceIndex);
  const { prismaIdentityRepositories } =
    require('./PrismaIdentityRepositories') as typeof import('./PrismaIdentityRepositories');
  const repository: IdentityRepositories = prismaIdentityRepositories(
    await prismaDatabase(app, 'mongodb'),
    async user => (app as IdentityOwner)[inputKey]?.assignPendingAccess(user),
    async id => (require('../runtime') as typeof import('../runtime')).getBrandingRepository(app).getBrand({ id })
  );
  return repository;
});

/** Bind application effects before acquisition; maintenance/read-only owners need no record writer. */
export function initializeIdentityPersistence(app: PersistenceOwner, input?: IdentityPersistenceInput): Promise<void> {
  const previous = (app as IdentityOwner)[inputKey];
  if (input && previous && previous !== input)
    return Promise.reject(new Error('Identity persistence effects are already bound to this application.'));
  if (input && !previous) Object.defineProperty(app, inputKey, { value: input });
  return group.initialize(app);
}
export const getIdentityRepositories = group.get;
