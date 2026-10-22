import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { MongoServerError } from 'mongodb';
import { PrismaCacheEntryRepository } from '../../src/persistence/cache/PrismaCacheEntryRepository';
import { CachePersistenceError, DuplicateCacheEntryError } from '../../src/persistence/cache/errors';
import { InvalidCacheEntryError } from '../../src/persistence/cache/validation';
import type { CorePrismaClient } from '../../src/persistence/prisma/client';
import type { CacheEntryRepository } from '../../src/persistence/cache/CacheEntryRepository';
import { mapBrandingError } from '../../src/controllers/BrandingControllerSupport';

describe('cache Prisma errors at the preview API boundary', function () {
  const marker = 'private-payload-and-database-details';
  const entry = { name: 'preview', ts_added: 1, data: { css: 'fixture' } };
  const id = 'abcdefabcdefabcdefabcdef';
  const operations = {
    read: (repo: CacheEntryRepository) => repo.findByName(entry.name),
    create: (repo: CacheEntryRepository) => repo.create(entry),
    update: (repo: CacheEntryRepository) => repo.updateByName(entry.name, entry),
    delete: (repo: CacheEntryRepository) => repo.deleteById(id),
  };
  const failing = (error: unknown) => {
    const reject = async () => {
      throw error;
    };
    return { orm: { cacheentry: { where: () => ({ first: reject, updateAndCount: reject, deleteAndCount: reject }), create: reject } } } as unknown as CorePrismaClient;
  };
  for (const [name, operation] of Object.entries(operations)) {
    for (const code of [18, 121]) {
      it(`redacts native ${name} failure ${code} and preserves the preview HTTP status`, async function () {
        const native = new MongoServerError({ message: marker, code, errInfo: { payload: marker } });
        const repo = new PrismaCacheEntryRepository(failing(native));
        await assert.rejects(operation(repo), error => {
          assert(error instanceof CachePersistenceError);
          assert.equal(error.code, 'cache-operation');
          assert.equal(error.cause, undefined);
          assert.doesNotMatch(inspect(error, { depth: null }), new RegExp(marker));
          const response = mapBrandingError(error);
          assert.equal(response.status, 500);
          assert.doesNotMatch(JSON.stringify(response), /private-payload|Mongo|BSON|errInfo/);
          return true;
        });
      });
    }
  }
  for (const operation of [operations.create, operations.update]) {
    it('retains duplicate classification and its safe public message', async function () {
      const repo = new PrismaCacheEntryRepository(failing(new MongoServerError({ message: marker, code: 11000 })));
      await assert.rejects(operation(repo), error => {
        assert(error instanceof DuplicateCacheEntryError);
        assert.equal(error.code, 'duplicate-cache-entry');
        assert.equal(mapBrandingError(error).status, 500);
        assert.doesNotMatch(JSON.stringify(mapBrandingError(error)), new RegExp(marker));
        return true;
      });
    });
  }
  it('retains controlled validation failures before driver dispatch', async function () {
    const repo = new PrismaCacheEntryRepository(failing(new Error(marker)));
    await assert.rejects(repo.create({ ...entry, name: '' }), InvalidCacheEntryError);
    await assert.rejects(repo.deleteById('invalid'), InvalidCacheEntryError);
  });
});
