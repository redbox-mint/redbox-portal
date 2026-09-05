import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Umzug, type MigrationMeta, type RunnableMigration, type UmzugStorage } from 'umzug';
import {
  MIGRATION_LEASE_RENEW_INTERVAL_MS,
  acquireMigrationLease,
  assertMigrationLeaseHeld,
  fenceLeaseInMutationSession,
  setActiveMigrationLease,
  type MigrationLeaseHandle,
} from '../services/AuthorizationMigrationService';
import {
  AuthorizationTransactionUnavailableError,
  runWithRequiredTransaction,
} from '../utilities/RequiredTransactionUtils';

export interface RedboxMigration {
  name: string;
  source?: string;
  up: (params?: { context: typeof sails }) => Promise<void>;
  down?: (params?: { context: typeof sails }) => Promise<void>;
}

interface MigrationRow {
  name: string;
}

interface MigrationModel {
  find: () => { sort: (criteria: string) => Promise<MigrationRow[]> };
  create: (values: {
    name: string;
    source?: string;
    appVersion?: string;
    ranAt: number;
    durationMs?: number;
    executedBy?: string;
  }) => Promise<unknown>;
  destroy: (criteria: { name: string } | { id: unknown }) => Promise<unknown>;
}

async function readAppVersion(): Promise<string | undefined> {
  try {
    const appPath = (sails.config as { appPath?: string } | undefined)?.appPath || process.cwd();
    const packageJson = JSON.parse(await fs.readFile(path.join(appPath, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return packageJson.version;
  } catch {
    return undefined;
  }
}

function getMigrationModel(): MigrationModel {
  const migrationModel = sails.models?.migration as MigrationModel | undefined;
  if (!migrationModel) {
    throw new Error('Migration model is not available. Regenerate shims so api/models/Migration.js exists.');
  }
  return migrationModel;
}

function migrationMarkerDatastore(): Sails.Datastore | null | undefined {
  try {
    const model = sails.models?.migration as
      | ({ getDatastore?: () => Sails.Datastore | null | undefined } & MigrationModel)
      | undefined;
    return model?.getDatastore?.();
  } catch {
    return undefined;
  }
}

function isMarkerTransactionCapable(datastore: unknown): boolean {
  if (typeof datastore !== 'object' || datastore === null) return false;
  if (typeof Reflect.get(datastore, 'transaction') === 'function') return true;
  const manager: unknown = Reflect.get(datastore, 'manager');
  if (typeof manager !== 'object' || manager === null) return false;
  const client: unknown = Reflect.get(manager, 'client');
  if (typeof client !== 'object' || client === null) return false;
  return typeof Reflect.get(client, 'startSession') === 'function';
}

/**
 * Runs an applied-migration marker mutation atomically lease-fenced in a
 * single required transaction/session on the Migration (marker) datastore
 * whenever it supports transactions, so the conditional owner+fence lease
 * predicates (pre-write gate, session-bound write fence, and post-write
 * revalidation) and the marker insert/delete commit or abort together with no
 * crash window in between.
 *
 * The lease fence is issued against the `authorizationmigrationlease`
 * collection resolved from the marker session/connection itself: the lease
 * must be represented in the marker datastore for the predicate and the
 * marker to share one atomic commit. When the marker session exposes no lease
 * collection while a durable lease exists elsewhere (split-datastore
 * topology), the mutation fails closed instead of recording a marker the
 * lease cannot fence. Production without transaction support fails closed
 * instead of recording markers past the lease; non-production doubles without
 * transaction support keep the gate-mutation-regate path with compensation
 * failures propagated.
 */
async function runMarkerMutationAtomically<T>(
  operation: string,
  mutate: (connection: Sails.Connection | undefined) => Promise<T>
): Promise<T> {
  const datastore = migrationMarkerDatastore();
  if (!isMarkerTransactionCapable(datastore)) {
    // Fail closed everywhere except explicit test-only doubles (the
    // `AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY=test-allowed` opt-in set only
    // by `packages/redbox-core/test/setup.ts`). Production always fails
    // closed, even when the test opt-in leaks into the environment, so a
    // production marker is never recorded past the lease without a
    // session-bound fence. Development and staging without transaction
    // support must also fail closed instead of recording applied-markers
    // past the lease.
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY !== 'test-allowed'
    ) {
      throw new AuthorizationTransactionUnavailableError(
        `Data migrations: ${operation} requires datastore transaction support.`
      );
    }
    return mutate(undefined);
  }
  return runWithRequiredTransaction(datastore, async connection => mutate(connection));
}

/** Await a Waterline deferred through its transaction connection when supported. */
async function awaitWithConnection(value: unknown, connection: Sails.Connection | undefined): Promise<unknown> {
  if (
    connection !== undefined &&
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'usingConnection') === 'function'
  ) {
    const usingConnection: unknown = Reflect.get(value, 'usingConnection');
    return Reflect.apply(usingConnection as (...args: unknown[]) => unknown, value, [connection]);
  }
  return value;
}

function createMigrationStorage(
  migrationModel: MigrationModel,
  migrationsByName: Map<string, RedboxMigration>,
  appVersion: string | undefined,
  startTimes: Map<string, number>,
  leaseGate: (operation: string, connection?: Sails.Connection) => Promise<void>
): UmzugStorage {
  return {
    async executed(): Promise<string[]> {
      const rows = await migrationModel.find().sort('ranAt ASC');
      return rows.map(row => row.name);
    },

    async logMigration({ name }: MigrationMeta): Promise<void> {
      // Ownership gate: never record a migration as applied after the lease
      // was lost; otherwise a successor could skip the migration while this
      // runner's writes never committed. The gate, the session-bound
      // conditional owner+fence+unexpired write fence, the insert, and the
      // post-write revalidation below share one required transaction/session
      // on the marker datastore whenever it supports it, so the lease
      // predicates and the applied-marker commit or abort atomically with no
      // crash window in between. The fence resolves the lease collection from
      // the marker session itself, proving shared topology; a marker
      // datastore without the lease represented fails closed.
      await runMarkerMutationAtomically('logMigration', async connection => {
        await leaseGate('logMigration', connection);
        const migration = migrationsByName.get(name);
        const startedAt = startTimes.get(name);
        const created = await awaitWithConnection(
          migrationModel.create({
            name,
            source: migration?.source,
            appVersion,
            ranAt: Date.now(),
            ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
            executedBy: os.hostname(),
          }),
          connection
        );
        // Post-write fence: inside a required transaction this revalidation
        // shares the transaction with the insert above. Outside one, a TTL
        // takeover in between would otherwise leave a stale applied-marker
        // behind while this runner believes it succeeded. Revalidate the
        // lease now; on failure remove exactly the row just created (by id
        // when the adapter returns one, else by name) and reject instead of
        // reporting success. Destroy failures propagate with the lease
        // rejection as their cause instead of being swallowed: a silently
        // surviving stale marker would let a successor skip the migration.
        try {
          await leaseGate('logMigration', connection);
        } catch (postError) {
          try {
            await awaitWithConnection(migrationModel.destroy(loggedRowIdentity(created, name)), connection);
          } catch (compensationError) {
            throw new Error(
              `Data migrations: logMigration for '${name}' lost its lease and the applied-marker compensation failed; failing closed without reporting success.`,
              { cause: { lease: postError, compensation: compensationError } }
            );
          }
          throw postError;
        }
      });
    },

    async unlogMigration({ name }: MigrationMeta): Promise<void> {
      await runMarkerMutationAtomically('unlogMigration', async connection => {
        await leaseGate('unlogMigration', connection);
        await awaitWithConnection(migrationModel.destroy({ name }), connection);
        // No rollback exists for a delete; revalidate so a runner that lost
        // the lease between the gate and the delete reports the loss instead
        // of silently succeeding past its lease. Inside a required
        // transaction the gate, the session-bound write fence, the delete,
        // and this predicate share one atomic commit on the marker datastore.
        await leaseGate('unlogMigration', connection);
      });
    },
  };
}

/** Identity of the row just logged, so post-write compensation removes only it. */
function loggedRowIdentity(created: unknown, name: string): { name: string } | { id: unknown } {
  if (typeof created === 'object' && created !== null && 'id' in created) {
    const id: unknown = Reflect.get(created, 'id');
    if (typeof id === 'string' || typeof id === 'number') return { id };
  }
  return { name };
}

function createLogger(): ConstructorParameters<typeof Umzug>[0]['logger'] {
  return {
    debug: message => sails.log.verbose(message),
    info: message => sails.log.info(message),
    warn: message => sails.log.warn(message),
    error: message => sails.log.error(message),
  };
}

/**
 * Maps Redbox migrations onto Umzug's RunnableMigration shape. The optional `down`
 * handler is forwarded verbatim so operators can perform manual rollbacks via Umzug;
 * see the Data Migrations wiki for the rollback contract and its caveats.
 */
export function toRunnableMigrations(migrations: RedboxMigration[]): RunnableMigration<typeof sails>[] {
  return migrations.map(migration => ({
    name: migration.name,
    up: migration.up,
    down: migration.down,
  }));
}

export async function runPendingMigrations(migrations: RedboxMigration[]): Promise<void> {
  if (migrations.length === 0) {
    return;
  }

  if (process.env.REDBOX_SKIP_MIGRATIONS === 'true') {
    sails.log.warn(
      `REDBOX_SKIP_MIGRATIONS=true – skipping ${migrations.length} registered data migration(s). ` +
        'Skipped migrations remain pending and will run on the next lift without this flag.'
    );
    return;
  }

  const orderedMigrations = [...migrations].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const migrationsByName = new Map(orderedMigrations.map(migration => [migration.name, migration]));
  const migrationModel = getMigrationModel();
  const appVersion = await readAppVersion();
  const startTimes = new Map<string, number>();

  // Latch + gate cell, bound to the lease once acquired below. A mutable
  // cell (rather than reassigned bindings) keeps the pre-acquisition
  // closures fail-closed when no lease is held yet.
  const leaseCell: { active?: MigrationLeaseHandle; renewalFailure?: Error } = {};
  const requireLiveLease = async (operation: string, connection?: Sails.Connection): Promise<void> => {
    const active = leaseCell.active;
    if (active === undefined) {
      throw new Error(`Data migrations: ${operation} rejected; no migration lease is held.`);
    }
    if (leaseCell.renewalFailure !== undefined) {
      throw new Error(
        `Data migrations: ${operation} rejected; migration lease renewal already failed for owner ` +
          `'${active.owner}' (fence ${active.fence}): ${leaseCell.renewalFailure.message}`
      );
    }
    await assertMigrationLeaseHeld(active);
    // Session-bound conditional owner+fence+unexpired write fence on the
    // marker session itself: a TTL takeover between the canonical read above
    // and the marker commit turns this fence into a 0-match (or a native
    // write conflict) instead of a stale commit. Proofs shared topology
    // because the lease collection is resolved from the marker connection;
    // a marker datastore without the lease represented fails closed here.
    if (connection !== undefined) {
      await fenceLeaseInMutationSession({ owner: active.owner, fence: active.fence }, connection, operation);
    }
  };
  const storage = createMigrationStorage(
    migrationModel,
    migrationsByName,
    appVersion,
    startTimes,
    async (operation, connection) => requireLiveLease(operation, connection)
  );

  const umzugMigrations = toRunnableMigrations(orderedMigrations).map(migration => ({
    ...migration,
    up: async (params: { name: string; path?: string; context: typeof sails }) => {
      // Ownership gate before each migration: a runner that lost the lease
      // (heartbeat failure or TTL takeover between migrations) stops here
      // instead of running the next migration unguarded.
      await requireLiveLease(`migration '${migration.name}'`);
      startTimes.set(migration.name, Date.now());
      return migration.up(params);
    },
  }));

  const umzug = new Umzug({
    migrations: umzugMigrations,
    context: sails,
    storage,
    logger: createLogger(),
  });

  const pending = await umzug.pending();
  if (pending.length === 0) {
    sails.log.info('Data migrations: 0 pending.');
    return;
  }
  sails.log.info(`Data migrations: ${pending.length} pending: ${pending.map(migration => migration.name).join(', ')}`);

  // Distributed migration lease: concurrent lifts must not run the same
  // migration (and its resumable checkpoints) twice. A live lease held by
  // another lift rejects here fail-closed; restart safety is preserved
  // because checkpoints remain durable and the lease is TTL-bounded with
  // owner+fence CAS release. The heartbeat below renews the lease every
  // half-TTL so migrations running longer than the 5-minute TTL keep sole
  // ownership; every checkpoint mutation verifies the fencing token, so a
  // runner superseded by TTL takeover fails closed instead of forking state.
  // Renewal latch: once a heartbeat renewal fails (TTL lapsed, takeover by a
  // successor, or a malformed/missing row), this runner is stale and must
  // stop. The latch rejects every subsequent migration `up` and every
  // `logMigration` instead of merely logging and continuing past the lease;
  // the release in `finally` is CAS-guarded and never removes the
  // successor's row.
  const lease = await acquireMigrationLease();
  leaseCell.active = lease;
  setActiveMigrationLease(lease);

  const heartbeat = setInterval(() => {
    lease.renew().catch((error: unknown) => {
      if (leaseCell.renewalFailure === undefined) {
        leaseCell.renewalFailure = error instanceof Error ? error : new Error(String(error));
      }
      sails.log.error(`Data migrations: lease renewal failed for owner '${lease.owner}': ${String(error)}`);
    });
  }, MIGRATION_LEASE_RENEW_INTERVAL_MS);
  // Do not keep the lift alive on the heartbeat alone.
  unrefInterval(heartbeat);
  try {
    await umzug.up();
  } finally {
    clearInterval(heartbeat);
    setActiveMigrationLease(undefined);
    await lease.release();
  }
}

/** Best-effort `unref` behind a runtime shape guard instead of a blind cast. */
function unrefInterval(handle: unknown): void {
  if (typeof handle !== 'object' || handle === null) return;
  const unref: unknown = Reflect.get(handle, 'unref');
  if (typeof unref !== 'function') return;
  Reflect.apply(unref, handle, []);
}
