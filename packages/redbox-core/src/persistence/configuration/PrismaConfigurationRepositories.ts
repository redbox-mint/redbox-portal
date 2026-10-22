import type { MongoCollection } from '@prisma/orm-mongo/orm';
import type { Contract } from '../prisma/generated/contract';
import type { CorePrismaClient } from '../prisma/client';
import { MongoFieldFilter } from '@prisma/orm-mongo/query-ast';
import type { MongoFilterExpr } from '@prisma/orm-mongo/query-ast';
import { prismaModelValues } from '../prisma/modelValues';
import { assertPersistencePatch, coercePersistenceQueryScalar, persistenceQueryFields } from '../scalars';
import type {
  ConfigurationRepositories,
  AppConfiguration,
  DashboardAggregate,
  TranslationBundle,
  TranslationEntry,
} from './ConfigurationRepositories';
import {
  configurationId as id,
  encodeConfiguration as encode,
  decodeConfiguration as decode,
  configurationOperation as operation,
} from './physical';
import type { ConfigurationCollection } from './physical';
import { prismaSecretLeases } from './PrismaSecretLeases';

/** Model CRUD with submitted-field patches; decoded nulls are never written back. */
export function prismaConfigurationRepositories(client: CorePrismaClient): ConfigurationRepositories {
  // A union of model handles shares one Prisma collection API; its decoded row type is the model union.
  const model = (name: ConfigurationCollection) =>
    client.orm[name] as MongoCollection<
      Contract,
      'AppConfig' | 'DashboardConfiguration' | 'I18nBundle' | 'I18nTranslation'
    >;
  async function list<T>(
    name: ConfigurationCollection,
    where: Record<string, unknown>,
    sort?: Record<string, 1 | -1>,
    filter?: MongoFilterExpr
  ): Promise<T[]> {
    let query = model(name).where(prismaModelValues(where));
    if (filter) query = query.where(filter);
    if (sort) query = query.orderBy(sort);
    return (await query.all().toArray()).map(row => decode<T>(name, row, true)!);
  }
  async function find<T>(name: ConfigurationCollection, where: Record<string, unknown>): Promise<T | null> {
    return decode<T>(name, await model(name).where(prismaModelValues(where)).first(), true);
  }
  async function insert<T>(name: ConfigurationCollection, values: object): Promise<T> {
    return decode<T>(name, await model(name).create(prismaModelValues(encode(name, values))), true)!;
  }
  const revise = async <T>(
    name: ConfigurationCollection,
    key: string,
    patch: Record<string, unknown>
  ): Promise<T | null> =>
    decode<T>(
      name,
      await model(name)
        .where(prismaModelValues({ _id: id(key) }))
        .update(prismaModelValues(patch)),
      true
    );
  const leases = prismaSecretLeases(client);
  return {
    appConfigs: {
      listForBrand: (branding, configKey) =>
        operation(() =>
          list<AppConfiguration>('appconfig', {
            branding: id(branding),
            ...(configKey === undefined ? {} : persistenceQueryFields({ configKey })),
          })
        ),
      findForBrandAndKey: (branding, configKey) =>
        operation(() =>
          find<AppConfiguration>('appconfig', { branding: id(branding), ...persistenceQueryFields({ configKey }) })
        ),
      createConfiguration: values => operation(() => insert<AppConfiguration>('appconfig', values)),
      replaceForBrandAndKey: (branding, configKey, configData) =>
        operation(async () => {
          const patch = encode('appconfig', { configData }, true);
          return decode<AppConfiguration>(
            'appconfig',
            await model('appconfig')
              .where(prismaModelValues({ branding: id(branding), ...persistenceQueryFields({ configKey }) }))
              .update(prismaModelValues(patch)),
            true
          );
        }),
      removeForBrandAndKey: (branding, configKey) =>
        operation(async () => {
          await client.orm.appconfig
            .where(prismaModelValues({ branding: id(branding), ...persistenceQueryFields({ configKey }) }))
            .deleteAndCount();
        }),
    },
    dashboards: {
      findForBrand: branding =>
        operation(() =>
          find<DashboardAggregate>('dashboardconfiguration', {
            branding: coercePersistenceQueryScalar(branding, 'string'),
          })
        ),
      createAggregate: values => operation(() => insert<DashboardAggregate>('dashboardconfiguration', values)),
      compareAndSwap: (branding, revision, next) =>
        operation(async () => {
          assertPersistencePatch(next);
          // update() returns the matched after-image, including when the supplied patch is a no-op.
          // Unlike updateAndCount(), this does not confuse matched with modified count.
          return (
            (await client.orm.dashboardconfiguration.where({ branding, revision }).update(prismaModelValues(next))) !==
            null
          );
        }),
    },
    bundles: {
      findByUid: uid =>
        operation(() => find<TranslationBundle>('i18nbundle', { uid: coercePersistenceQueryScalar(uid, 'string') })),
      findById: key => operation(() => find<TranslationBundle>('i18nbundle', { _id: id(key) })),
      findForLocale: (branding, locale, namespace) =>
        operation(() =>
          find<TranslationBundle>('i18nbundle', {
            branding: id(branding),
            ...persistenceQueryFields({ locale, namespace }),
          })
        ),
      listForBrand: (branding, ordered) =>
        operation(() =>
          list<TranslationBundle>('i18nbundle', { branding: id(branding) }, ordered ? { locale: 1 } : undefined)
        ),
      createBundle: values => operation(() => insert<TranslationBundle>('i18nbundle', values)),
      reviseBundle: (key, values) =>
        operation(() => revise<TranslationBundle>('i18nbundle', key, encode('i18nbundle', values, true))),
      setEnabled: (branding, locale, namespace, enabled) =>
        operation(async () => {
          const patch = encode('i18nbundle', { enabled }, true);
          return decode<TranslationBundle>(
            'i18nbundle',
            await model('i18nbundle')
              .where(prismaModelValues({ branding: id(branding), ...persistenceQueryFields({ locale, namespace }) }))
              .update(prismaModelValues(patch)),
            true
          );
        }),
    },
    translations: {
      findByUid: uid =>
        operation(() =>
          find<TranslationEntry>('i18ntranslation', { uid: coercePersistenceQueryScalar(uid, 'string') })
        ),
      listForLocale: (branding, locale, namespace, prefix, ordered) =>
        operation(() =>
          list<TranslationEntry>(
            'i18ntranslation',
            {
              branding: id(branding),
              ...persistenceQueryFields({ locale, namespace }),
            },
            ordered ? { key: 1 } : undefined,
            ordered && prefix
              ? MongoFieldFilter.of(
                  'key',
                  '$regex',
                  `^${String(coercePersistenceQueryScalar(prefix, 'string')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
                )
              : undefined
          )
        ),
      createEntry: values => operation(() => insert<TranslationEntry>('i18ntranslation', values)),
      reviseEntry: (key, values) =>
        operation(() => revise<TranslationEntry>('i18ntranslation', key, encode('i18ntranslation', values, true))),
      removeByUid: uid =>
        operation(async () => {
          return decode<TranslationEntry>(
            'i18ntranslation',
            await client.orm.i18ntranslation.where(persistenceQueryFields({ uid })).delete(),
            true
          );
        }),
      addEntries: values =>
        operation(async () => {
          if (values.length) {
            const now = new Date().toISOString();
            await client.orm.i18ntranslation
              .createAll(values.map(value => prismaModelValues(encode('i18ntranslation', value, false, now))))
              .toArray();
          }
        }),
    },
    secretLeases: {
      inspect: (name, owner) => operation(() => leases.inspect(name, owner)),
      acquire: (name, owner, now, until) => operation(() => leases.acquire(name, owner, now, until)),
      renew: (name, owner, now, until) => operation(() => leases.renew(name, owner, now, until)),
      publishToken: (name, owner, now, token) => operation(() => leases.publishToken(name, owner, now, token)),
      release: (name, owner) => operation(() => leases.release(name, owner)),
    },
  };
}
