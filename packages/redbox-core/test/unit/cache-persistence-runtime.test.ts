import { attachSailsPersistenceLifecycle } from '../../src/compat/sails/persistenceLifecycle';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { assertPersistenceConfiguration } from '../../src/persistence/selection';
import { CachePersistenceError } from '../../src/persistence/cache/errors';
import {
  initializeCachePersistence,
  cleanupCachePersistence,
  getCacheEntryRepository,
} from '../../src/persistence/cache/runtime';
import { createGeneratedBootstrap } from '../../src/loader/bootstrapShimRuntime';
import * as runtime from '../../src/persistence/runtime';
import * as preflight from '../../src/persistence/cache/preflight';
import { InvalidCacheEntryError } from '../../src/persistence/cache/validation';
import { inspect } from 'node:util';

function fixture(previous?: (cb: (error?: unknown) => void) => void): Sails.Application {
  return {
    config: { beforeShutdown: previous },
    log: { verbose: sinon.stub(), error: sinon.stub(), warn: sinon.stub() },
    services: {},
  } as unknown as Sails.Application;
}

describe('cache persistence selection and lifecycle', function () {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'sails');
  const apps: Sails.Application[] = [];
  afterEach(async function () {
    for (const app of apps.splice(0)) await cleanupCachePersistence(app);
    if (saved) Object.defineProperty(globalThis, 'sails', saved);
    else Reflect.deleteProperty(globalThis, 'sails');
    sinon.restore();
  });
  const use = (previous?: (cb: (error?: unknown) => void) => void) => {
    const app = fixture(previous);
    attachSailsPersistenceLifecycle(app);
    apps.push(app);
    Object.assign(globalThis, { sails: app });
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
    assert.throws(getCacheEntryRepository, /not been initialized/);
    await Promise.all([initializeCachePersistence(app), initializeCachePersistence(app)]);
    const repository = getCacheEntryRepository();
    await initializeCachePersistence(app);
    assert.equal(getCacheEntryRepository(), repository);
    assert.equal(repository.constructor.name, 'PrismaCacheEntryRepository');
    await Promise.all([cleanupCachePersistence(app), cleanupCachePersistence(app)]);
    assert.throws(getCacheEntryRepository, /not been initialized/);
    await initializeCachePersistence(app);
    assert.notEqual(getCacheEntryRepository(), repository);
  });

  it('shares one application runtime across Sails module-cache invalidation', async function () {
    const app = use();
    await initializeCachePersistence(app);
    const repository = getCacheEntryRepository();
    const hook = app.config.beforeShutdown;
    const runtimePath = require.resolve('../../src/persistence/cache/runtime');
    const savedModule = require.cache[runtimePath];
    try {
      delete require.cache[runtimePath];
      const reloaded: typeof import('../../src/persistence/cache/runtime') = require(runtimePath);
      assert.equal(reloaded.getCacheEntryRepository(), repository);
      await reloaded.initializeCachePersistence(app);
      assert.equal(app.config.beforeShutdown, hook);
      await reloaded.cleanupCachePersistence(app);
      assert.throws(getCacheEntryRepository, /not been initialized/);
    } finally {
      if (savedModule) require.cache[runtimePath] = savedModule;
    }
  });

  it('chains the previous shutdown hook, preserves its error, and safely repeats cleanup', async function () {
    const failure = new Error('existing shutdown failure');
    const previous = sinon.stub().callsFake(cb => cb(failure));
    const app = use(previous);
    await initializeCachePersistence(app);
    const hook = app.config.beforeShutdown;
    await initializeCachePersistence(app);
    assert.equal(app.config.beforeShutdown, hook);
    for (let i = 0; i < 2; i++) {
      const error = await new Promise<unknown>(resolve => app.config.beforeShutdown!(resolve));
      assert.equal(error, failure);
      assert.throws(getCacheEntryRepository, /not been initialized/);
    }
    assert.equal(previous.callCount, 2);
  });

  it('preserves thrown shutdown errors and continues cleanup', async function () {
    const failure = new Error('existing hook throw');
    const app = use(() => {
      throw failure;
    });
    await initializeCachePersistence(app);
    assert.equal(await new Promise(resolve => app.config.beforeShutdown!(resolve)), failure);
    assert.throws(getCacheEntryRepository, /not been initialized/);
  });

  it('generated-bootstrap failure closes persistence before returning the original error', async function () {
    const app = use();
    const failure = new Error('original hook failure');
    const bootstrap = createGeneratedBootstrap(
      () => initializeCachePersistence(app),
      async () => {},
      [
        {
          name: 'broken',
          bootstrap: async () => {
            throw failure;
          },
        },
      ]
    );
    assert.equal(await new Promise(resolve => bootstrap(resolve)), failure);
    assert.throws(getCacheEntryRepository, /not been initialized/);
  });

  it('logs direct and wrapped cache startup failures without native payloads while preserving the original error', async function () {
    const native = new Error('synthetic-private-cache-payload');
    const invalid = new InvalidCacheEntryError('Cache data must contain only finite JSON values', { cause: native });
    for (const failure of [invalid, new Error('migration failure', { cause: invalid })]) {
      const app = use();
      const errors = app.log.error as sinon.SinonStub;
      const bootstrap = createGeneratedBootstrap(
        () => initializeCachePersistence(app),
        async () => {
          throw failure;
        },
        []
      );
      assert.equal(await new Promise(resolve => bootstrap(resolve)), failure);
      assert.equal(invalid.cause, native);
      assert.equal(errors.callCount, 1);
      assert.doesNotMatch(inspect(errors.args, { depth: null }), /synthetic-private-cache-payload/);
      assert.deepEqual(errors.firstCall.args, [{ name: invalid.name, message: invalid.message }]);
      assert.throws(getCacheEntryRepository, /not been initialized/);
    }
  });
});
