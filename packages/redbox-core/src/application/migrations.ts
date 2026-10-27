import os from 'os';
import { Umzug, type MigrationMeta, type RunnableMigration, type UmzugStorage } from 'umzug';
import type { MigrationLedgerRepository } from '../persistence/migration/MigrationLedgerRepository';

export interface ApplicationMigration<Context extends object = object> {
  name: string;
  source?: string;
  up: (params?: { context: Context }) => Promise<void>;
  down?: (params?: { context: Context }) => Promise<void>;
}

function createMigrationStorage<Context extends object>(
  ledger: MigrationLedgerRepository,
  migrationsByName: Map<string, ApplicationMigration<Context>>,
  appVersion: string | undefined,
  startTimes: Map<string, number>
): UmzugStorage {
  return {
    async executed(): Promise<string[]> {
      return ledger.executedNames();
    },

    async logMigration({ name }: MigrationMeta): Promise<void> {
      const migration = migrationsByName.get(name);
      const startedAt = startTimes.get(name);
      await ledger.recordExecution({
        name,
        source: migration?.source,
        appVersion,
        ranAt: Date.now(),
        ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
        executedBy: os.hostname(),
      });
    },

    async unlogMigration({ name }: MigrationMeta): Promise<void> {
      await ledger.removeExecution(name);
    },
  };
}

/**
 * Maps Redbox migrations onto Umzug's RunnableMigration shape. The optional `down`
 * handler is forwarded verbatim so operators can perform manual rollbacks via Umzug;
 * see the Data Migrations wiki for the rollback contract and its caveats.
 */
export function toRunnableMigrations<Context extends object>(
  migrations: ApplicationMigration<Context>[]
): RunnableMigration<Context>[] {
  return migrations.map(migration => ({
    name: migration.name,
    up: migration.up,
    down: migration.down,
  }));
}

export interface MigrationInputs<Context extends object> {
  readonly ledger: MigrationLedgerRepository;
  readonly appVersion?: string;
  readonly context: Context;
  readonly log: {
    debug(message: unknown): void;
    info(message: unknown): void;
    warn(message: unknown): void;
    error(message: unknown): void;
  };
}

export async function runApplicationMigrations<Context extends object>(
  migrations: ApplicationMigration<Context>[],
  input: MigrationInputs<Context>
): Promise<void> {
  if (migrations.length === 0) {
    return;
  }

  const orderedMigrations = [...migrations].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const migrationsByName = new Map(orderedMigrations.map(migration => [migration.name, migration]));
  const { ledger, appVersion } = input;
  const startTimes = new Map<string, number>();
  const storage = createMigrationStorage(ledger, migrationsByName, appVersion, startTimes);

  const umzugMigrations = toRunnableMigrations(orderedMigrations).map(migration => ({
    ...migration,
    up: async (params: { name: string; path?: string; context: Context }) => {
      startTimes.set(migration.name, Date.now());
      return migration.up(params);
    },
  }));

  const umzug = new Umzug<Context>({
    migrations: umzugMigrations,
    context: input.context,
    storage,
    logger: input.log,
  });

  const pending = await umzug.pending();
  if (pending.length === 0) {
    input.log.info('Data migrations: 0 pending.');
    return;
  }
  input.log.info(`Data migrations: ${pending.length} pending: ${pending.map(migration => migration.name).join(', ')}`);

  await umzug.up();
}
