import assert from 'node:assert/strict';
import { PersistenceError, safePersistenceFailure } from '../../src/persistence/errors';
import {
  CachePersistenceError,
  cachePersistenceFailureForLog,
  safePersistenceFailure as safeCacheFailure,
} from '../../src/persistence/cache/errors';
import { initializeMigrationPersistence, getMigrationLedgerRepository } from '../../src/persistence/migration/runtime';
import { cleanupPersistence, persistenceReady } from '../../src/persistence/runtime';
import { PrismaMigrationLedgerRepository } from '../../src/persistence/migration/PrismaMigrationLedgerRepository';
import type { CorePrismaClient } from '../../src/persistence/prisma/client';

describe('migration persistence ownership and diagnostics', function () {
  it('uses shared safe diagnostics and preserves the cache error contract', () => {
    const cache = new CachePersistenceError('example', 'Controlled cache diagnostic.');
    assert(cache instanceof PersistenceError);
    assert.equal(cache.name, 'CachePersistenceError');
    assert.equal(cache.code, 'example');
    assert.equal(safeCacheFailure(cache), cache);
    assert.deepEqual(cachePersistenceFailureForLog(new Error('wrapper', { cause: cache })), {
      name: cache.name,
      message: cache.message,
    });
    const native = Object.assign(new Error('mongodb://secret:payload@host'), { code: 18 });
    const shared = safePersistenceFailure(native);
    assert.equal(shared.name, 'PersistenceError');
    assert.equal(shared.code, 'authentication');
    assert(!('cause' in shared));
    assert(!JSON.stringify(cachePersistenceFailureForLog(new Error('wrapper', { cause: shared }))).includes('secret'));
    assert.equal(safePersistenceFailure(shared), shared);
  });

  it('redacts driver failures and duplicate details without swallowing operation errors', async () => {
    const native = Object.assign(new Error('sensitive ledger payload'), { code: 11000 });
    const repository = new PrismaMigrationLedgerRepository({
      orm: {
        migration: {
          create: async () => {
            throw native;
          },
        },
      },
    } as unknown as CorePrismaClient);
    await assert.rejects(repository.recordExecution({ name: 'a', ranAt: 1 }), (error: unknown) => {
      assert(error instanceof PersistenceError);
      assert.equal(error.code, 'duplicate-migration');
      assert(!('cause' in error));
      assert(!error.message.includes('sensitive'));
      return true;
    });
    await assert.rejects(repository.recordExecution({ name: '', ranAt: 1 }), /nonempty/);
    await assert.rejects(repository.recordExecution({ name: 'a', ranAt: NaN }), /finite/);
  });
});
