import { repositoryFixtures } from './repositoryFixtures';
import * as sinon from 'sinon';
import * as runtime from '../../src/persistence/runtime';
import { safeIdentityValue } from '../../src/persistence/identity/safety';

/** Existing domain fixtures keep their model spies behind an explicit plain repository fake. */
export function installIdentityRepositoryMock() {
  const names: Record<string, string> = {
    user: 'User',
    role: 'Role',
    userlink: 'UserLink',
    useraudit: 'UserAudit',
    pathrule: 'PathRule',
    workspaceapp: 'WorkspaceApp',
    brandingconfig: 'BrandingConfig',
  };
  const model = (entity: string): any => repositoryFixtures[names[entity]] ?? {};
  const execute = (query: any): Promise<any> =>
    query && typeof query.exec === 'function'
      ? new Promise((resolve, reject) =>
          query.exec((error: unknown, value: unknown) => (error ? reject(error) : resolve(value)))
        )
      : Promise.resolve(query);
  const read = (entity: string, criteria: object, options: any, one: boolean) => {
    let q = model(entity)[one ? 'findOne' : 'find']?.(criteria) ?? (one ? null : []);
    for (const relation of options?.populate ?? []) q = q.populate(relation);
    if (q?.meta) q = q.meta({ enableExperimentalDeepTargets: true });
    return execute(q);
  };
  const membership = (method: string, entity: string, id: unknown, members: unknown[]) =>
    execute(
      model(entity)
        [method](id, entity === 'user' ? 'roles' : 'users')
        .members(members)
    );
  const repository = {
    list: async (entity: string, criteria = {}, options?: unknown) =>
      safeIdentityValue(await read(entity, criteria, options, false)),
    one: (entity: string, criteria: object, options?: unknown) => read(entity, criteria, options, true),
    create: (entity: string, values: object) => execute(model(entity).create(values)),
    update: (entity: string, criteria: object, values: object) =>
      execute(model(entity).update(criteria, values).set(values)),
    remove: (entity: string, criteria: object) => execute(model(entity).destroy(criteria)),
    findOrCreateWorkspace: (criteria: object, values: object) =>
      execute(model('workspaceapp').findOrCreate(criteria, values)),
    addMemberships: (side: string, id: unknown, members: unknown[]) => membership('addToCollection', side, id, members),
    removeMemberships: (side: string, id: unknown, members: unknown[]) =>
      membership('removeFromCollection', side, id, members),
    replaceMemberships: (side: string, id: unknown, members: unknown[]) =>
      membership('replaceCollection', side, id, members),
    assignBrandRoles: (brand: unknown, roles: unknown[]) =>
      execute(model('brandingconfig').addToCollection(brand, 'roles').members(roles)),
    verifyPassword: async (userId: string, password: string) => {
      const row = await read('user', { id: userId }, {}, true);
      return require('bcryptjs').compare(password, row.password);
    },
    findByApiTokenHash: async (token: string, options?: unknown) =>
      safeIdentityValue(await read('user', { token }, options, true)),
  };
  sinon
    .stub(require('../../src/persistence/identity/runtime'), 'getIdentityRepositories')
    .returns(repository as unknown as ReturnType<typeof runtime.getIdentityRepositories>);
  return repository;
}
