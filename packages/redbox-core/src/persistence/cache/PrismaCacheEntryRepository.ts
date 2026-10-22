import { MongoFieldFilter } from '@prisma/orm-mongo/query-ast';
import type { CorePrismaClient } from '../prisma/client';
import type { CacheEntryRecord, CacheEntryRepository, CacheEntryWrite } from './CacheEntryRepository';
import { CachePersistenceError, DuplicateCacheEntryError } from './errors';
import { PersistenceError } from '../errors';
import { assertCacheEntryWrite, assertCacheEntryRecord, InvalidCacheEntryError } from './validation';
import { coercePersistenceQueryScalar } from '../scalars';
import { persistenceStringTimestamps } from '../timestamps';

function nameFilter(name: string): MongoFieldFilter {
  const value = coercePersistenceQueryScalar(name, 'string');
  if (value !== null && typeof value !== 'string')
    throw new PersistenceError('scalar-validation', 'Cache lookup requires a string name.');
  return MongoFieldFilter.eq('name', value);
}

/** Prisma maps existing BSON ObjectIds, JSON, doubles and string timestamps without a rewrite. */
export class PrismaCacheEntryRepository implements CacheEntryRepository {
  constructor(private readonly client: CorePrismaClient) {}

  async findByName(name: string): Promise<CacheEntryRecord | null> {
    const row = await this.client.orm.cacheentry
      .where(nameFilter(name))
      .first()
      .catch(error => this.operationFailure(error));
    if (!row) return null;
    assertCacheEntryRecord(row);
    const record: CacheEntryRecord = { id: row._id, name: row.name, data: row.data, ts_added: row.ts_added };
    for (const key of ['createdAt', 'updatedAt'] as const) {
      if (row[key] !== undefined && row[key] !== null) {
        if (typeof row[key] !== 'string') throw new InvalidCacheEntryError('Cache timestamps must be strings');
        record[key] = row[key];
      }
    }
    return record;
  }

  async create(entry: CacheEntryWrite): Promise<void> {
    assertCacheEntryWrite(entry);
    try {
      await this.client.orm.cacheentry.create({
        name: entry.name,
        data: entry.data ?? null,
        ts_added: entry.ts_added,
        ...persistenceStringTimestamps({}, false),
      });
    } catch (error) {
      this.operationFailure(error);
    }
  }

  async updateByName(name: string, entry: CacheEntryWrite): Promise<void> {
    assertCacheEntryWrite(entry);
    try {
      await this.client.orm.cacheentry.where(nameFilter(name)).updateAndCount({
        name: entry.name,
        ts_added: entry.ts_added,
        ...persistenceStringTimestamps({}, true),
        ...(Object.hasOwn(entry, 'data') ? { data: entry.data } : {}),
      });
    } catch (error) {
      this.operationFailure(error);
    }
  }

  async deleteById(id: string): Promise<void> {
    if (typeof id !== 'string' || !/^[0-9a-f]{24}$/i.test(id))
      throw new InvalidCacheEntryError('Cache ID must use the standard ObjectId mapping');
    await this.client.orm.cacheentry
      .where({ _id: id.toLowerCase() })
      .deleteAndCount()
      .catch(error => this.operationFailure(error));
  }

  private operationFailure(error: unknown): never {
    if (error instanceof PersistenceError || error instanceof InvalidCacheEntryError) throw error;
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 11000) throw new DuplicateCacheEntryError(error);
      if (error.code === 'RUNTIME.DECODE_FAILED')
        throw new InvalidCacheEntryError('Stored cache entry does not match the cache persistence contract');
    }
    throw new CachePersistenceError('cache-operation', 'Cache persistence operation failed.');
  }
}
