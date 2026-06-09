import { promises as fs } from 'fs';
import path from 'path';
import { Umzug, type MigrationMeta, type RunnableMigration, type UmzugStorage } from 'umzug';

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
    create: (values: { name: string; source?: string; appVersion?: string; ranAt: number }) => Promise<unknown>;
    destroy: (criteria: { name: string }) => Promise<unknown>;
}

async function readAppVersion(): Promise<string | undefined> {
    try {
        const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
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

function createMigrationStorage(
    migrationModel: MigrationModel,
    migrationsByName: Map<string, RedboxMigration>,
    appVersion: string | undefined
): UmzugStorage {
    return {
        async executed(): Promise<string[]> {
            const rows = await migrationModel.find().sort('ranAt ASC');
            return rows.map(row => row.name);
        },

        async logMigration({ name }: MigrationMeta): Promise<void> {
            const migration = migrationsByName.get(name);
            await migrationModel.create({
                name,
                source: migration?.source,
                appVersion,
                ranAt: Date.now(),
            });
        },

        async unlogMigration({ name }: MigrationMeta): Promise<void> {
            await migrationModel.destroy({ name });
        },
    };
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

    const orderedMigrations = [...migrations].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const migrationsByName = new Map(orderedMigrations.map(migration => [migration.name, migration]));
    const migrationModel = getMigrationModel();
    const appVersion = await readAppVersion();
    const storage = createMigrationStorage(migrationModel, migrationsByName, appVersion);

    const umzugMigrations = toRunnableMigrations(orderedMigrations);

    const umzug = new Umzug({
        migrations: umzugMigrations,
        context: sails,
        storage,
        logger: createLogger(),
    });

    await umzug.up();
}
