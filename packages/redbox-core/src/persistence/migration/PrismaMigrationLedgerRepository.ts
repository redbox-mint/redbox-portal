import { normalizePersistenceField, coercePersistenceQueryScalar } from '../scalars';
import { persistenceStringTimestamps } from '../timestamps';
import type { CorePrismaClient } from '../prisma/client';
import { MongoFieldFilter } from '@prisma/orm-mongo/query-ast';
import { PersistenceError } from '../errors';
import type { MigrationExecution, MigrationLedgerRepository } from './MigrationLedgerRepository';

function migrationName(value: unknown, stored = false): string {
  if (stored && typeof value !== 'string')
    throw new PersistenceError('invalid-migration', 'Stored migration names must use nonempty strings.');
  let name: unknown;
  try {
    name = normalizePersistenceField(value, { type: 'string', required: true }, false);
  } catch {
    throw new PersistenceError('invalid-migration', 'A migration requires a nonempty string name.');
  }
  if (typeof name !== 'string' || !name.length)
    throw new PersistenceError('invalid-migration', 'A migration requires a nonempty string name.');
  return name;
}

/** Private physical codec; no BSON/driver types are exported through the package root. */
export class PrismaMigrationLedgerRepository implements MigrationLedgerRepository {
  constructor(private readonly client: CorePrismaClient) {}

  async executedNames(): Promise<string[]> {
    return this.operation(async () => {
      const rows = await this.client.orm.migration.select('name').orderBy({ ranAt: 1 }).all().toArray();
      return rows.map(row => {
        return migrationName(row.name, true);
      });
    });
  }

  async isExecuted(name: string): Promise<boolean> {
    const value = coercePersistenceQueryScalar(name, 'string');
    if (value !== null && typeof value !== 'string')
      throw new PersistenceError('invalid-migration', 'Migration lookup requires a string name.');
    return this.operation(async () =>
      Boolean(await this.client.orm.migration.where(MongoFieldFilter.eq('name', value)).select('_id').first())
    );
  }

  async recordExecution(entry: MigrationExecution): Promise<void> {
    const values = {
      name: migrationName(entry.name),
      ranAt: 0,
      durationMs: 0,
      source: '',
      appVersion: '',
      executedBy: '',
    };
    for (const field of ['source', 'appVersion', 'ranAt', 'durationMs', 'executedBy'] as const) {
      try {
        Reflect.set(
          values,
          field,
          normalizePersistenceField(
            entry[field],
            {
              type: field === 'ranAt' || field === 'durationMs' ? 'number' : 'string',
              required: field === 'ranAt',
            },
            false
          )
        );
      } catch {
        throw new PersistenceError(
          'invalid-migration',
          'Migration fields require finite numeric milliseconds and scalar string metadata.'
        );
      }
    }
    await this.operation(async () => {
      // Match observed loaded-model defaults. No upsert, replacement or retry of bodies.
      await this.client.orm.migration.create({ ...values, ...persistenceStringTimestamps({}, false) });
    });
  }

  async removeExecution(name: string): Promise<void> {
    const value = coercePersistenceQueryScalar(name, 'string');
    if (value !== null && typeof value !== 'string')
      throw new PersistenceError('invalid-migration', 'Migration lookup requires a string name.');
    await this.operation(async () => {
      await this.client.orm.migration.where(MongoFieldFilter.eq('name', value)).deleteAndCount();
    });
  }

  private async operation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new PersistenceError('duplicate-migration', 'A ledger entry with that migration name already exists.');
      throw new PersistenceError(
        'migration-operation',
        'Migration ledger operation failed. Inspect datastore availability and permissions.'
      );
    }
  }
}
