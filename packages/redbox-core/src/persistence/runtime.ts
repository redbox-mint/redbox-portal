import type { Db, MongoClient } from 'mongodb';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PersistenceError, safePersistenceFailure } from './errors';
import { assertPersistenceConfiguration } from './selection';
import { guardSailsShutdown } from './shutdown';
import type { PersistenceResource } from './types';
import type { PersistenceIndexInspection } from './indexes';
import type { CorePrismaClient, StoragePrismaClient } from './prisma/client';

export { initializeReferencePersistence } from './reference/runtime';

export { getReferenceRepositories } from './reference/runtime';

// Group modules defer concrete factories; preflight imports stay lazy for offline startup.
export { initializeMigrationPersistence } from './migration/runtime';

export { getMigrationLedgerRepository } from './migration/runtime';

export function inspectMigrationPersistence(app: Sails.Application): Promise<PersistenceIndexInspection> {
  return (require('./migration/preflight') as typeof import('./migration/preflight')).inspectMigrationPersistence(app);
}

export function ensureMigrationPersistenceIndex(app: Sails.Application): Promise<PersistenceIndexInspection> {
  return (require('./migration/preflight') as typeof import('./migration/preflight')).ensureMigrationPersistenceIndex(
    app
  );
}

export function inspectReferencePersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./reference/preflight') as typeof import('./reference/preflight')).inspectReferencePersistence(app);
}
export function ensureReferencePersistenceIndexes(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./reference/preflight') as typeof import('./reference/preflight')).ensureReferencePersistenceIndexes(
    app
  );
}
export { registerNamedQueryTarget } from './reference/NamedQueryExecution';

export { initializeConfigurationPersistence } from './configuration/runtime';
export { getConfigurationRepositories } from './configuration/runtime';
export function inspectConfigurationPersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (
    require('./configuration/preflight') as typeof import('./configuration/preflight')
  ).inspectConfigurationPersistence(app);
}
export function ensureConfigurationPersistenceIndexes(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (
    require('./configuration/preflight') as typeof import('./configuration/preflight')
  ).ensureConfigurationPersistenceIndexes(app);
}

export { initializeProgressPersistence } from './progress/runtime';
export { getProgressRepositories } from './progress/runtime';
export function inspectProgressPersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./progress/preflight') as typeof import('./progress/preflight')).inspectProgressPersistence(app);
}

export { initializeHarvestPersistence } from './harvest/runtime';
export { getHarvestRepositories } from './harvest/runtime';
export function inspectHarvestPersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./harvest/preflight') as typeof import('./harvest/preflight')).inspectHarvestPersistence(app);
}
export function ensureHarvestPersistenceIndexes(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./harvest/preflight') as typeof import('./harvest/preflight')).ensureHarvestPersistenceIndexes(app);
}

interface Pool {
  client: MongoClient;
  connected: Promise<void>;
}
interface Runtime {
  ready: boolean;
  closed?: boolean;
  needsCleanup?: boolean;
  closing?: Promise<void>;
  pools: Map<string, Pool>;
  failedClients: Set<MongoClient>;
  databases: Map<string, Promise<Db>>;
  prisma: Map<string, { datastore: string; client: Promise<CorePrismaClient | StoragePrismaClient> }>;
  resources: Map<string, PersistenceResource>;
  active: Set<Promise<unknown>>;
  operationContext: AsyncLocalStorage<{ active: boolean }>;
  shutdownRegistered?: boolean;
}
const runtimeKey: unique symbol = Symbol.for('@researchdatabox/redbox-core/persistence/v1');
type RuntimeApplication = Sails.Application & { [runtimeKey]?: Runtime };
function stateFor(app: Sails.Application): Runtime {
  const holder = app as RuntimeApplication;
  if (!holder[runtimeKey])
    Object.defineProperty(holder, runtimeKey, {
      value: {
        ready: false,
        pools: new Map(),
        failedClients: new Set(),
        databases: new Map(),
        prisma: new Map(),
        resources: new Map(),
        active: new Set(),
        operationContext: new AsyncLocalStorage(),
      },
    });
  return holder[runtimeKey]!;
}

/** Offline initialization; clients are acquired only by concrete operation owners. */
export async function initializePersistence(app: Sails.Application): Promise<void> {
  const state = stateFor(app);
  if (state.closing)
    throw new PersistenceError('lifecycle', 'Persistence is shutting down. Await cleanup before initialization.');
  if (state.needsCleanup)
    throw new PersistenceError('lifecycle', 'Finish failed persistence cleanup before reinitializing.');
  if (state.ready) return;
  assertPersistenceConfiguration(app.config);
  guardSailsShutdown(app);
  if (!state.shutdownRegistered) {
    const previous = app.config.beforeShutdown;
    app.config.beforeShutdown = cb => {
      let called = false;
      const finish = (error?: unknown): void => {
        if (called) return;
        called = true;
        cleanupPersistence(app).then(
          () => cb(error),
          failure => cb(error ?? failure)
        );
      };
      try {
        if (previous) previous(finish);
        else finish();
      } catch (error) {
        finish(error);
      }
    };
    state.shutdownRegistered = true;
  }
  state.ready = true;
  state.closed = false;
}

/** App-owned queue/session/blob resources; callbacks expose no driver types. */
export function registerPersistenceResource(app: Sails.Application, name: string, resource: PersistenceResource): void {
  const state = stateFor(app);
  if (state.closing || state.needsCleanup || state.closed)
    throw new PersistenceError(
      'lifecycle',
      'Cannot register a resource during or after shutdown. Await cleanup and initialize persistence before acquiring resources.'
    );
  if (state.resources.has(name))
    throw new PersistenceError('lifecycle', `Persistence resource ${name} is already registered.`);
  state.resources.set(name, resource);
}

/**
 * Acquire the application-owned database for a first-party concrete adapter.
 * @internal
 * @remarks Driver handles must stay inside concrete adapters. Hooks use domain
 * repositories; this seam does not authorize new pools or transactional units.
 */
export async function mongoDatabase(app: Sails.Application, name: string): Promise<Db> {
  const { resolveApplicationDatastore } =
    require('./mongodb/configuration') as typeof import('./mongodb/configuration');
  return ownedDatabase(app, name, () => resolveApplicationDatastore(app, name));
}

/** Internal native session owner. The session URL keeps its existing configuration key. */
export async function mongoSessionDatabase(app: Sails.Application, config: Record<string, unknown>): Promise<Db> {
  return mongoResourceDatabase(app, 'sessions', config);
}

/** Shared transport for native URL-configured resources. Not a CRUD boundary. @internal */
export async function mongoResourceDatabase(
  app: Sails.Application,
  name: string,
  config: Record<string, unknown>
): Promise<Db> {
  const { resolveSessionDatastore } = require('./mongodb/configuration') as typeof import('./mongodb/configuration');
  return ownedDatabase(app, 'native:' + name, () => resolveSessionDatastore(config));
}

async function ownedDatabase(
  app: Sails.Application,
  name: string,
  resolve: () => import('./mongodb/configuration').ResolvedDatastore
): Promise<Db> {
  const state = stateFor(app);
  if ((!state.ready || state.closing) && !state.operationContext.getStore()?.active)
    throw new PersistenceError(
      'not-initialized',
      'Await persistence initialization before acquiring a datastore; shutdown refuses new work.'
    );
  let database = state.databases.get(name);
  if (!database) {
    database = (async () => {
      const resolved = resolve();
      const { MongoClient } = await import('mongodb');
      let pool = state.pools.get(resolved.poolKey);
      if (!pool) {
        const client = new MongoClient(resolved.url, resolved.options);
        pool = {
          client,
          connected: Promise.resolve()
            .then(() => client.connect())
            .then(() => {})
            .catch(async error => {
              // Failed acquisitions are retryable, but a failed close must not
              // discard ownership of the client. Shutdown retries its cleanup.
              state.pools.delete(resolved.poolKey);
              state.failedClients.add(client);
              try {
                await client.close();
                state.failedClients.delete(client);
              } catch {
                /* retain ownership and the original acquisition failure */
              }
              throw safePersistenceFailure(error);
            }),
        };
        state.pools.set(resolved.poolKey, pool);
      }
      try {
        await pool.connected;
      } catch (error) {
        throw safePersistenceFailure(error);
      }
      return pool.client.db(resolved.database);
    })();
    state.databases.set(name, database);
    void database.catch(() => {
      if (state.databases.get(name) === database) state.databases.delete(name);
    });
  }
  return database;
}

/** One lazy Prisma client per logical datastore; all clients borrow runtime-owned pools.
 * @internal The schemas are separate even when MongoDB connection policies share a pool.
 */
export function prismaDatabase(app: Sails.Application, name: 'mongodb', datastore?: string): Promise<CorePrismaClient>;
export function prismaDatabase(
  app: Sails.Application,
  name: 'redboxStorage',
  datastore?: string
): Promise<StoragePrismaClient>;
export function prismaDatabase(
  app: Sails.Application,
  name: 'mongodb' | 'redboxStorage',
  datastore: string = name
): Promise<CorePrismaClient | StoragePrismaClient> {
  const state = stateFor(app);
  if ((!state.ready || state.closing) && !state.operationContext.getStore()?.active)
    return Promise.reject(new PersistenceError('not-initialized', 'Persistence is unavailable or draining.'));
  let entry = state.prisma.get(name);
  if (entry && entry.datastore !== datastore)
    return Promise.reject(
      new PersistenceError(
        'configuration',
        `The ${name} Prisma schema is already bound to another application datastore. Use the fixed mongodb/redboxStorage logical datastores. Model datastore overrides are unsupported.`
      )
    );
  if (!entry) {
    const client = mongoDatabase(app, datastore).then(db => {
      const factories: typeof import('./prisma/client') = require('./prisma/client');
      return name === 'mongodb'
        ? factories.createCorePrismaClient(db.client, db.databaseName)
        : factories.createStoragePrismaClient(db.client, db.databaseName);
    });
    entry = { datastore, client };
    state.prisma.set(name, entry);
    void client.catch(() => {
      if (state.prisma.get(name) === entry) state.prisma.delete(name);
    });
  }
  return entry.client;
}

/** Internal readiness guard for repository getters; never acquires resources. */
export function persistenceReady(app: Sails.Application): boolean {
  const state = stateFor(app);
  return state.ready && !state.closing;
}

/**
 * Track a concrete adapter operation through application draining.
 * @internal
 * @remarks Retained adapter references refuse work once shutdown begins.
 */
export function persistenceOperation<T>(app: Sails.Application, operation: () => Promise<T>): Promise<T> {
  const state = stateFor(app);
  if (!state.ready || state.closing)
    return Promise.reject(new PersistenceError('lifecycle', 'Persistence is unavailable or draining.'));
  // Admission and lazy acquisition are separate: accepted work retains access
  // while draining, but its detached callbacks lose access once it settles.
  const context = { active: true };
  const pending = state.operationContext.run(context, () => Promise.resolve().then(operation));
  state.active.add(pending);
  void pending.then(
    () => {
      context.active = false;
      state.active.delete(pending);
    },
    () => {
      context.active = false;
      state.active.delete(pending);
    }
  );
  return pending;
}

export async function cleanupPersistence(app: Sails.Application): Promise<void> {
  const state = stateFor(app);
  if (state.closing) return state.closing;
  state.ready = false;
  state.needsCleanup = true;
  state.closing = (async () => {
    try {
      await Promise.all(
        Array.from(state.resources.values(), resource => Promise.resolve().then(() => resource.drain?.()))
      );
    } catch {
      // Report a deadline/failure without waiting for another live drain. All
      // resources and operations stay owned; no failure can authorize closure.
      throw new PersistenceError(
        'cleanup',
        'Persistence resource drain failed. Pools remain owned; stop users and retry cleanup.'
      );
    }
    // Bounded resource drains (including a partially started queue) must start
    // even while an accepted connection acquisition is still pending.
    await Promise.allSettled(state.databases.values());
    await Promise.allSettled(Array.from(state.prisma.values(), entry => entry.client));
    await Promise.allSettled(state.active);
    const failures: unknown[] = [];
    for (const [name, resource] of state.resources) {
      try {
        await resource.close();
        state.resources.delete(name);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new PersistenceError(
        'cleanup',
        'Persistence resource close failed; retry cleanup before closing borrowed pools.'
      );
    for (const [name, entry] of state.prisma) {
      try {
        const client = await entry.client.catch(() => undefined);
        await client?.close();
        state.prisma.delete(name);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new PersistenceError(
        'cleanup',
        'Unable to close all Prisma clients. Retry cleanup before closing borrowed pools.'
      );
    for (const [key, pool] of state.pools) {
      try {
        await pool.client.close();
        state.pools.delete(key);
      } catch (error) {
        failures.push(error);
      }
    }
    for (const client of state.failedClients) {
      try {
        await client.close();
        state.failedClients.delete(client);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new PersistenceError('cleanup', 'Unable to close all app-owned persistence pools. Retry cleanup.');
    state.prisma.clear();
    state.databases.clear();
    state.needsCleanup = false;
    state.closed = true;
  })();
  try {
    await state.closing;
  } finally {
    state.closing = undefined;
  }
}

/** Preserve the original bootstrap failure even if resource cleanup also fails. */
export async function cleanupPersistenceAfterFailure(app: Sails.Application): Promise<void> {
  try {
    await cleanupPersistence(app);
  } catch {
    app.log.warn('Persistence cleanup failed after startup failure.');
  }
}

export { initializeSiemPersistence } from './siem/runtime';
export { getSiemRepository } from './siem/runtime';

export function inspectSiemPersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./siem/preflight') as typeof import('./siem/preflight')).inspectSiemPersistence(app);
}
export function ensureSiemPersistenceIndexes(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./siem/preflight') as typeof import('./siem/preflight')).ensureSiemPersistenceIndexes(app);
}

export { initializeFigsharePersistence } from './figshare/runtime';
export { getFigshareSyncRepository } from './figshare/runtime';

export function inspectFigsharePersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./figshare/preflight') as typeof import('./figshare/preflight')).inspectFigsharePersistence(app);
}
export function ensureFigsharePersistenceIndexes(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./figshare/preflight') as typeof import('./figshare/preflight')).ensureFigsharePersistenceIndexes(
    app
  );
}

export { initializeVocabularyPersistence } from './vocabulary/runtime';
export { getVocabularyRepositories } from './vocabulary/runtime';
export function inspectVocabularyPersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./vocabulary/preflight') as typeof import('./vocabulary/preflight')).inspectVocabularyPersistence(
    app
  );
}
export function ensureVocabularyPersistenceIndexes(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (
    require('./vocabulary/preflight') as typeof import('./vocabulary/preflight')
  ).ensureVocabularyPersistenceIndexes(app);
}

export { initializeBrandingPersistence } from './branding/runtime';

export { getBrandingRepository } from './branding/runtime';

export function inspectBrandingPersistence(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./branding/preflight') as typeof import('./branding/preflight')).inspectBrandingPersistence(app);
}

export function ensureBrandingPersistenceIndexes(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  return (require('./branding/preflight') as typeof import('./branding/preflight')).ensureBrandingPersistenceIndexes(
    app
  );
}

