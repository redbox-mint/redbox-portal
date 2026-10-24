import { ApplicationRuntime } from '../../src/application';
import type { PersistenceOwner } from '../../src/persistence/owner';
import { cachePersistenceFailureForLog } from '../../src/persistence/cache/errors';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { assertPersistenceConfiguration } from '../../src/persistence/selection';
import { CachePersistenceError } from '../../src/persistence/cache/errors';
import {
  initializeCachePersistence,
  cleanupCachePersistence,
  getCacheEntryRepository,
} from '../../src/persistence/cache/runtime';
import * as runtime from '../../src/persistence/runtime';
import * as preflight from '../../src/persistence/cache/preflight';
import { InvalidCacheEntryError } from '../../src/persistence/cache/validation';
import { inspect } from 'node:util';

function fixture(): PersistenceOwner {
  return { config: {}, log: { verbose: sinon.stub(), error: sinon.stub(), warn: sinon.stub() } };
}

describe('cache persistence selection and lifecycle', function () {
  const apps: PersistenceOwner[] = [];
  afterEach(async function () {
    for (const app of apps.splice(0)) await cleanupCachePersistence(app);
    sinon.restore();
  });
  const use = () => {
    const app = fixture();
    apps.push(app);
    return app;
  };

  beforeEach(() => {
    sinon.stub(runtime, 'prismaDatabase').resolves({ orm: {} } as any);
    sinon.stub(runtime, 'mongoDatabase').resolves({} as any);
    sinon
      .stub(preflight, 'inspectCachePersistence')
      .resolves({ index: 'ready', mongoMajor: 9, duplicateNameGroups: 0 } as any);
  });
  it('defaults to Prisma and rejects every obsolete explicit selector', () => {
    assertPersistenceConfiguration({});
    for (const backend of ['waterline', 'mongodb', 'prisma'])
      assert.throws(
        () => assertPersistenceConfiguration({ persistence: { cache: { backend } } }),
        /selectors have been removed/
      );
  });

  it('requires explicit initialization, reuses one repository per app, and uses the Prisma owner', async function () {
    const app = use();
    assert.throws(() => getCacheEntryRepository(app), /not been initialized/);
    await Promise.all([initializeCachePersistence(app), initializeCachePersistence(app)]);
    const repository = getCacheEntryRepository(app);
    await initializeCachePersistence(app);
    assert.equal(getCacheEntryRepository(app), repository);
    assert.equal(repository.constructor.name, 'PrismaCacheEntryRepository');
    await Promise.all([cleanupCachePersistence(app), cleanupCachePersistence(app)]);
    assert.throws(() => getCacheEntryRepository(app), /not been initialized/);
    await initializeCachePersistence(app);
    assert.notEqual(getCacheEntryRepository(app), repository);
  });

  it('shares one application runtime across module-cache invalidation', async function () {
    const app = use();
    await initializeCachePersistence(app);
    const repository = getCacheEntryRepository(app);
    const runtimePath = require.resolve('../../src/persistence/cache/runtime');
    const savedModule = require.cache[runtimePath];
    try {
      delete require.cache[runtimePath];
      const reloaded: typeof import('../../src/persistence/cache/runtime') = require(runtimePath);
      assert.equal(reloaded.getCacheEntryRepository(app), repository);
      await reloaded.initializeCachePersistence(app);
      await reloaded.cleanupCachePersistence(app);
      assert.throws(() => getCacheEntryRepository(app), /not been initialized/);
    } finally {
      if (savedModule) require.cache[runtimePath] = savedModule;
    }
  });

  it('coalesces stop while a later module cleanup fails and retains the original cause', async () => {
    const app = use(), failure = new Error('existing shutdown failure');
    let refuse = true;
    const runtime = new ApplicationRuntime(app, [{ name: 'cacheConsumer', create: () => ({
      initialize: async () => {}, close: async () => { if (refuse) throw failure; },
    }) }], { preparePersistence: () => initializeCachePersistence(app) });
    await runtime.initialize();
    const repository = getCacheEntryRepository(app);
    const [first, second] = await Promise.all([runtime.stop().catch(error => error), runtime.stop().catch(error => error)]);
    assert(first instanceof Error); assert.equal(second, first);
    assert.equal(runtime.status().cleanupPending, true);
    assert(runtime.status().persistence.resources.includes('module:cacheConsumer'));
    await assert.rejects(repository.findByName('stale'), /no longer active/);
    refuse = false;
    await runtime.stop();
    assert.throws(() => getCacheEntryRepository(app), /not been initialized/);
    await runtime.stop();
  });

  it('retains a thrown shutdown failure until retry and then completes cleanup', async () => {
    const app = use(), failure = new Error('existing cleanup throw');
    let refuse = true;
    const runtime = new ApplicationRuntime(app, [{ name: 'cacheConsumer', create: () => ({
      initialize: async () => {}, close: async () => { if (refuse) throw failure; },
    }) }], { preparePersistence: () => initializeCachePersistence(app) });
    await runtime.initialize();
    await assert.rejects(runtime.stop());
    assert.equal(runtime.status().stopFailed, true);
    refuse = false; await runtime.stop();
    assert.throws(() => getCacheEntryRepository(app), /not been initialized/);
  });

  it('initialization failure closes persistence before returning the original error', async () => {
    const app = use(), failure = new Error('original extension failure');
    const runtime = new ApplicationRuntime(app, [], {
      preparePersistence: () => initializeCachePersistence(app),
      extensionBootstrap: [{ name: 'broken', run: async () => { throw failure; } }],
    });
    await assert.rejects(runtime.initialize(), error => error === failure);
    assert.throws(() => getCacheEntryRepository(app), /not been initialized/);
    await runtime.stop();
  });

  it('redacts direct and wrapped cache startup failures while preserving their original identity', async () => {
    const native = new Error('synthetic-private-cache-payload');
    const invalid = new InvalidCacheEntryError('Cache data must contain only finite JSON values', { cause: native });
    for (const failure of [invalid, new Error('migration failure', { cause: invalid })]) {
      const app = use();
      const runtime = new ApplicationRuntime(app, [], {
        preparePersistence: () => initializeCachePersistence(app),
        migrations: async () => { throw failure; },
      });
      await assert.rejects(runtime.initialize(), error => error === failure);
      assert.equal(invalid.cause, native);
      const diagnostic = cachePersistenceFailureForLog(failure);
      assert.doesNotMatch(inspect(diagnostic, { depth: null }), /synthetic-private-cache-payload/);
      assert.deepEqual(diagnostic, { name: invalid.name, message: invalid.message });
      assert.throws(() => getCacheEntryRepository(app), /not been initialized/);
      await runtime.stop();
    }
  });
});
