import { PersistenceError } from './errors';
import type { PersistenceGroup } from './types';

export const persistenceGroups: readonly PersistenceGroup[] = [
  'migration',
  'reference',
  'configuration',
  'progress',
  'harvest',
  'siem',
  'figshare',
  'identity',
  'vocabulary',
  'branding',
  'storage',
];

/** Retired settings are rejected even when their former value was prisma. */
export function assertPersistenceConfiguration(config: { persistence?: unknown; [key: string]: unknown }): void {
  if (
    config.persistence !== undefined ||
    Object.entries(process.env).some(
      ([key, value]) =>
        value !== undefined && (/^RBPORTAL_.*_BACKEND$/i.test(key) || /^sails_{1,2}persistence(?:_|$)/i.test(key))
    )
  )
    throw new PersistenceError(
      'configuration',
      'Persistence backend selectors have been removed. Remove persistence.cache/groups, RBPORTAL_*_BACKEND and sails_persistence overrides, including prisma values. Prisma is the sole backend. See Persistence-Migration.md.'
    );
  if (
    config.models !== undefined ||
    config.orm !== undefined ||
    Object.keys(process.env).some(key => /^sails_{1,2}(models|orm)(_|$)/i.test(key))
  )
    throw new PersistenceError(
      'configuration',
      'ORM model configuration is no longer supported. Remove models/orm settings and model datastore/table overrides. Move behavior into services/repositories and declare fields in the Prisma contract. SIEM securityevent and siemdeliveryattempt both use datastores.mongodb; split model datastores are unsupported. See Persistence-Migration.md.'
    );
  if (
    config.datastores &&
    typeof config.datastores === 'object' &&
    Object.values(config.datastores).some(
      datastore =>
        datastore &&
        typeof datastore === 'object' &&
        ['adapter', 'identity', 'schema', 'forceLoadAdapter', 'migrate', 'dontUseObjectIds'].some(key =>
          Object.hasOwn(datastore, key)
        )
    )
  )
    throw new PersistenceError(
      'configuration',
      'Remove retired ORM adapter/schema/migrate/identity settings from every datastore, including unused datastores. Keep URL, split credentials/database and MongoDB driver options. See Persistence-Migration.md.'
    );
  if (config.globals && typeof config.globals === 'object') {
    const models = Reflect.get(config.globals, 'models');
    if (models !== undefined && models !== false)
      throw new PersistenceError(
        'configuration',
        'Model globals have been removed. Set globals.models=false and use service/repository APIs. See Persistence-Migration.md.'
      );
  }
  const hooks = config.hooks;
  if (
    (hooks &&
      typeof hooks === 'object' &&
      Reflect.get(hooks, 'orm') !== undefined &&
      Reflect.get(hooks, 'orm') !== false) ||
    Object.entries(process.env).some(
      ([key, value]) => /^sails_{1,2}hooks_{1,2}orm$/i.test(key) && value !== undefined && value !== 'false'
    )
  )
    throw new PersistenceError(
      'configuration',
      'Remove the retired ORM hook override. The v6 host owns persistence. See Persistence-Migration.md.'
    );
}
