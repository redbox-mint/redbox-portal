import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getMigrationLedgerRepository } from '../../persistence/runtime';
import {
  runApplicationMigrations,
  toRunnableMigrations,
  type ApplicationMigration,
} from '../../application/migrations';
export { toRunnableMigrations };
export type RedboxMigration = ApplicationMigration<typeof sails>;

/** Only the comparison adapter discovers global Sails, its version and legacy bypass input. */
export async function runPendingMigrations(migrations: RedboxMigration[]): Promise<void> {
  if (!migrations.length) return;
  if (process.env.REDBOX_SKIP_MIGRATIONS === 'true') {
    sails.log.warn(
      `REDBOX_SKIP_MIGRATIONS=true – skipping ${migrations.length} registered data migration(s). ` +
        'Skipped migrations remain pending and will run on the next lift without this flag.'
    );
    return;
  }
  let appVersion: string | undefined;
  try {
    const appPath = sails.config?.appPath || process.cwd();
    appVersion = (JSON.parse(await readFile(path.join(appPath, 'package.json'), 'utf8')) as { version?: string })
      .version;
  } catch {
    /* Version metadata remains optional, as before. */
  }
  await runApplicationMigrations(migrations, {
    context: sails,
    appVersion,
    ledger: getMigrationLedgerRepository(),
    log: {
      debug: message => sails.log.verbose(message),
      info: message => sails.log.info(message),
      warn: message => sails.log.warn(message),
      error: message => sails.log.error(message),
    },
  });
}
