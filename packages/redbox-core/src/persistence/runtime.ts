import { AsyncLocalStorage } from 'node:async_hooks';
import type { PersistenceOwner } from './owner';
import type { Db, MongoClient } from 'mongodb';
import { PersistenceError, safePersistenceFailure } from './errors';
import { assertPersistenceConfiguration } from './selection';
import type { PersistenceResource } from './types';
import type { PersistenceIndexInspection } from './indexes';
import type { CorePrismaClient, StoragePrismaClient } from './prisma/client';

export { initializeReferencePersistence } from './reference/runtime';

export { getReferenceRepositories } from './reference/runtime';

// Group modules defer concrete factories; preflight imports stay lazy for offline startup.
export { initializeMigrationPersistence } from './migration/runtime';

export { getMigrationLedgerRepository } from './migration/runtime';

export function inspectMigrationPersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection> {
  return (require('./migration/preflight') as typeof import('./migration/preflight')).inspectMigrationPersistence(app);
}

export function ensureMigrationPersistenceIndex(app: PersistenceOwner): Promise<PersistenceIndexInspection> {
  return (require('./migration/preflight') as typeof import('./migration/preflight')).ensureMigrationPersistenceIndex(
    app
  );
}

export function inspectReferencePersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./reference/preflight') as typeof import('./reference/preflight')).inspectReferencePersistence(app);
}
export function ensureReferencePersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./reference/preflight') as typeof import('./reference/preflight')).ensureReferencePersistenceIndexes(
    app
  );
}
export { registerNamedQueryTarget } from './reference/NamedQueryExecution';

export { initializeConfigurationPersistence } from './configuration/runtime';
export { getConfigurationRepositories } from './configuration/runtime';
export function inspectConfigurationPersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (
    require('./configuration/preflight') as typeof import('./configuration/preflight')
  ).inspectConfigurationPersistence(app);
}
export function ensureConfigurationPersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (
    require('./configuration/preflight') as typeof import('./configuration/preflight')
  ).ensureConfigurationPersistenceIndexes(app);
}

export { initializeProgressPersistence } from './progress/runtime';
export { getProgressRepositories } from './progress/runtime';
export function inspectProgressPersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./progress/preflight') as typeof import('./progress/preflight')).inspectProgressPersistence(app);
}

export { initializeHarvestPersistence } from './harvest/runtime';
export { getHarvestRepositories } from './harvest/runtime';
export function inspectHarvestPersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./harvest/preflight') as typeof import('./harvest/preflight')).inspectHarvestPersistence(app);
}
export function ensureHarvestPersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./harvest/preflight') as typeof import('./harvest/preflight')).ensureHarvestPersistenceIndexes(app);
}

interface Pool {
  client: MongoClient;
  connected: Promise<void>;
}
interface Runtime {
  ready: boolean;
  quiescing?: boolean;
  context: AsyncLocalStorage<{ active: boolean }>;
  closed?: boolean;
  needsCleanup?: boolean;
  closing?: Promise<void>;
  pools: Map<string, Pool>;
  failedClients: Set<MongoClient>;
  databases: Map<string, Promise<Db>>;
  prisma: Map<string, { datastore: string; client: Promise<CorePrismaClient | StoragePrismaClient> }>;
  resources: Map<string, PersistenceResource>;
  active: Set<Promise<unknown>>;
}
const runtimeKey: unique symbol = Symbol.for('@researchdatabox/redbox-core/persistence/v1');
type RuntimeApplication = PersistenceOwner & { [runtimeKey]?: Runtime };
function stateFor(app: PersistenceOwner): Runtime {
  const holder = app as RuntimeApplication;
  if (!holder[runtimeKey])
    Object.defineProperty(holder, runtimeKey, {
      value: {
        ready: false,
        context: new AsyncLocalStorage<{ active: boolean }>(),
        pools: new Map(),
        failedClients: new Set(),
        databases: new Map(),
        prisma: new Map(),
        resources: new Map(),
        active: new Set(),
      },
    });
  return holder[runtimeKey]!;
}

/** Offline initialization; clients are acquired only by concrete operation owners. */
export async function initializePersistence(app: PersistenceOwner): Promise<void> {
  const state = stateFor(app);
  if (state.closing)
    throw new PersistenceError('lifecycle', 'Persistence is shutting down. Await cleanup before initialization.');
  if (state.needsCleanup)
    throw new PersistenceError('lifecycle', 'Finish failed persistence cleanup before reinitializing.');
  if (state.ready) return;
  assertPersistenceConfiguration(app.config);
  state.ready = true;
  state.quiescing = false;
  state.closed = false;
}

/** App-owned queue/session/blob resources; callbacks expose no driver types. */
export function registerPersistenceResource(app: PersistenceOwner, name: string, resource: PersistenceResource): void {
  const state = stateFor(app);
  if (state.closing || state.needsCleanup || state.closed || (state.quiescing && !state.context.getStore()?.active))
    throw new PersistenceError(
      'lifecycle',
      'Cannot register a resource during or after shutdown. Await cleanup and initialize persistence before acquiring resources.'
    );
  if (state.resources.has(name))
    throw new PersistenceError('lifecycle', `Persistence resource ${name} is already registered.`);
  state.resources.set(name, resource);
  if (state.quiescing) resource.quiesce?.();
}

/**
 * Acquire the application-owned database for a first-party concrete adapter.
 * @internal
 * @remarks Driver handles must stay inside concrete adapters. Hooks use domain
 * repositories; this seam does not authorize new pools or transactional units.
 */
export async function mongoDatabase(app: PersistenceOwner, name: string): Promise<Db> {
  const { resolveApplicationDatastore } =
    require('./mongodb/configuration') as typeof import('./mongodb/configuration');
  return ownedDatabase(app, name, () => resolveApplicationDatastore(app, name));
}

/** Internal native session owner. The session URL keeps its existing configuration key. */
export async function mongoSessionDatabase(app: PersistenceOwner, config: Record<string, unknown>): Promise<Db> {
  return mongoResourceDatabase(app, 'sessions', config);
}

/** Shared transport for native URL-configured resources. Not a CRUD boundary. @internal */
export async function mongoResourceDatabase(
  app: PersistenceOwner,
  name: string,
  config: Record<string, unknown>
): Promise<Db> {
  const { resolveSessionDatastore } = require('./mongodb/configuration') as typeof import('./mongodb/configuration');
  return ownedDatabase(app, 'native:' + name, () => resolveSessionDatastore(config));
}

async function ownedDatabase(
  app: PersistenceOwner,
  name: string,
  resolve: () => import('./mongodb/configuration').ResolvedDatastore
): Promise<Db> {
  const state = stateFor(app);
  if (!operationAdmitted(state))
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
export function prismaDatabase(app: PersistenceOwner, name: 'mongodb', datastore?: string): Promise<CorePrismaClient>;
export function prismaDatabase(
  app: PersistenceOwner,
  name: 'redboxStorage',
  datastore?: string
): Promise<StoragePrismaClient>;
export function prismaDatabase(
  app: PersistenceOwner,
  name: 'mongodb' | 'redboxStorage',
  datastore: string = name
): Promise<CorePrismaClient | StoragePrismaClient> {
  const state = stateFor(app);
  if (!operationAdmitted(state))
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
export function persistenceReady(app: PersistenceOwner): boolean {
  const state = stateFor(app);
  return operationAdmitted(state);
}

/** Safe ownership diagnostics; no clients, credentials or configuration escape. */
export function persistenceStatus(app: PersistenceOwner) {
  const state = stateFor(app);
  return {
    ready: state.ready && !state.closing && !state.quiescing,
    cleanupPending: state.needsCleanup === true,
    resources: [...state.resources.keys()],
    operations: state.active.size,
    prismaClients: state.prisma.size,
    pools: state.pools.size + state.failedClients.size,
  };
}

/**
 * Track a concrete adapter operation through application draining.
 * @internal
 * @remarks Retained adapter references refuse work once shutdown begins.
 */
function operationAdmitted(state: Runtime): boolean {
  return (
    !state.closed && ((state.ready && !state.quiescing && !state.closing) || state.context.getStore()?.active === true)
  );
}

/** Native completion owners may report results while their caller's admitted work remains active. */
export function hasActivePersistenceWork(app: PersistenceOwner): boolean {
  return stateFor(app).context.getStore()?.active === true;
}

/** A bounded caller-owned lifetime. Detached descendants lose admission on settlement. */
export function runAcceptedPersistenceWork<T>(app: PersistenceOwner, operation: () => Promise<T>): Promise<T> {
  const state = stateFor(app);
  if (!operationAdmitted(state))
    return Promise.reject(new PersistenceError('lifecycle', 'Persistence is unavailable or draining.'));
  const scope = { active: true };
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  state.active.add(promise);
  const settled = () => {
    scope.active = false;
    state.active.delete(promise);
  };
  void promise.then(settled, settled);
  state.context.run(scope, () => {
    try {
      Promise.resolve(operation()).then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
  return promise;
}

export function persistenceOperation<T>(app: PersistenceOwner, operation: () => Promise<T>): Promise<T> {
  return runAcceptedPersistenceWork(app, () => Promise.resolve().then(operation));
}

/** Fence producers immediately; completion scopes retain access to their existing dependencies. */
export function quiescePersistence(app: PersistenceOwner): void {
  const state = stateFor(app);
  state.quiescing = true;
  let failed = false;
  for (const resource of state.resources.values()) {
    try {
      resource.quiesce?.();
    } catch {
      failed = true;
    }
  }
  if (failed) throw new PersistenceError('cleanup', 'Resource quiesce failed. Ownership is retained; retry stop.');
}

/** Native completion owners call this before their final drain. No new registry. @internal */
export async function drainAcceptedPersistenceWork(app: PersistenceOwner): Promise<void> {
  const state = stateFor(app);
  while (state.active.size) await Promise.allSettled(state.active);
}

export async function cleanupPersistence(app: PersistenceOwner, options: { deadline?: number } = {}): Promise<void> {
  const state = stateFor(app);
  if (state.closing) return state.closing;
  state.needsCleanup = true;
  quiescePersistence(app);
  state.ready = false;
  state.closing = (async () => {
    try {
      await Promise.all(
        Array.from(state.resources.values(), resource => Promise.resolve().then(() => resource.drain?.(options)))
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
    await drainAcceptedPersistenceWork(app);
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
export async function cleanupPersistenceAfterFailure(app: PersistenceOwner): Promise<void> {
  try {
    await cleanupPersistence(app);
  } catch {
    app.log.warn('Persistence cleanup failed after startup failure.');
  }
}

export { initializeSiemPersistence } from './siem/runtime';
export { getSiemRepository } from './siem/runtime';

export function inspectSiemPersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./siem/preflight') as typeof import('./siem/preflight')).inspectSiemPersistence(app);
}
export function ensureSiemPersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./siem/preflight') as typeof import('./siem/preflight')).ensureSiemPersistenceIndexes(app);
}

export { initializeFigsharePersistence } from './figshare/runtime';
export { getFigshareSyncRepository } from './figshare/runtime';

export function inspectFigsharePersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./figshare/preflight') as typeof import('./figshare/preflight')).inspectFigsharePersistence(app);
}
export function ensureFigsharePersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./figshare/preflight') as typeof import('./figshare/preflight')).ensureFigsharePersistenceIndexes(
    app
  );
}

export function inspectStoragePersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./storage/preflight') as typeof import('./storage/preflight')).inspectStoragePersistence(app);
}
export function ensureStoragePersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./storage/preflight') as typeof import('./storage/preflight')).ensureStoragePersistenceIndexes(app);
}

export { initializeVocabularyPersistence } from './vocabulary/runtime';
export { getVocabularyRepositories } from './vocabulary/runtime';
export function inspectVocabularyPersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./vocabulary/preflight') as typeof import('./vocabulary/preflight')).inspectVocabularyPersistence(
    app
  );
}
export function ensureVocabularyPersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (
    require('./vocabulary/preflight') as typeof import('./vocabulary/preflight')
  ).ensureVocabularyPersistenceIndexes(app);
}

export { initializeBrandingPersistence } from './branding/runtime';

export { getBrandingRepository } from './branding/runtime';

export function inspectBrandingPersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./branding/preflight') as typeof import('./branding/preflight')).inspectBrandingPersistence(app);
}

export function ensureBrandingPersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./branding/preflight') as typeof import('./branding/preflight')).ensureBrandingPersistenceIndexes(
    app
  );
}

export { initializeIdentityPersistence } from './identity/runtime';
export { getIdentityRepositories } from './identity/runtime';
export function inspectIdentityPersistence(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./identity/preflight') as typeof import('./identity/preflight')).inspectIdentityPersistence(app);
}
export function ensureIdentityPersistenceIndexes(app: PersistenceOwner): Promise<PersistenceIndexInspection[]> {
  return (require('./identity/preflight') as typeof import('./identity/preflight')).ensureIdentityPersistenceIndexes(
    app
  );
}
