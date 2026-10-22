import assert from 'node:assert/strict';
import { createSecureContext } from 'node:tls';
import { definePersistenceGroup } from '../../src/persistence/groupRuntime';
import * as sinon from 'sinon';
import { resolveDatastore } from '../../src/persistence/mongodb/configuration';
import { assertPersistenceConfiguration } from '../../src/persistence/selection';
import {
  initializePersistence,
  cleanupPersistence,
  registerPersistenceResource,
  persistenceOperation,
  mongoDatabase,
} from '../../src/persistence/runtime';
import { MongoClient } from 'mongodb';

function app(config: object = {}): Sails.Application {
  return { config, log: { warn() {} } } as unknown as Sails.Application;
}
describe('driver persistence foundation', function () {
  afterEach(() => sinon.restore());
  it('defaults migrated groups to Prisma and refuses unsupported/stale selectors without fallback', async () => {
    assertPersistenceConfiguration({});
    for (const value of [
      { surprise: {} },
      { groups: { unknown: { backend: 'waterline' } } },
      ...[
        'migration',
        'reference',
        'configuration',
        'progress',
        'harvest',
        'siem',
        'figshare',
        'vocabulary',
        'branding',
        'storage',
        'identity',
      ].map(group => ({
        groups: { [group]: { backend: 'mongodb' } },
      })),
    ])
      assert.throws(() => assertPersistenceConfiguration({ persistence: value }));
    await assert.rejects(
      initializePersistence(app({ persistence: { groups: { identity: { backend: 'mongodb' } } } })),
      (error: unknown) => error instanceof Error && Reflect.get(error, 'code') === 'configuration'
    );
  });
  it('resolves legacy protocol/split/escaping/credential precedence without models or managers', function () {
    for (const url of ['host:27018/app%25db', '://host:27018/app%25db', 'mongodb://host:27018/app%25db']) {
      const config = resolveDatastore({ url, maxPoolSize: 4 });
      assert.equal(config.database, 'app%db');
      assert.equal(new MongoClient(config.url, config.options).options.maxPoolSize, 4);
    }
    const cases = [
      { input: { url: 'mongodb://u:p%253Ass@host/a' }, user: 'u', pass: 'p:ss', db: 'a' },
      {
        input: { host: 'host', port: '27019', database: 'app%25db', user: 'u%25name', password: 'p%253Ass' },
        user: 'u%name',
        pass: 'p%3Ass',
        db: 'app%db',
      },
      { input: { url: 'mongodb://u:p@host/a', password: 'q%3Ar', database: 42 }, user: 'u', pass: 'q:r', db: '42' },
      {
        input: { url: 'mongodb://u:p@a,b/app', user: 'ignored', database: 'ignored' },
        user: 'u',
        pass: 'p',
        db: 'app',
      },
      {
        input: { url: 'mongodb://u:p@host/app?readPreferenceTags=dc:a,zone:b', user: 'ignored', database: 'ignored' },
        user: 'u',
        pass: 'p',
        db: 'app',
      },
    ];
    for (const { input, user, pass, db } of cases) {
      const config = resolveDatastore(input);
      const parsed = new MongoClient(config.url, config.options);
      assert.equal(config.database, db);
      assert.equal(parsed.options.credentials?.username, user);
      assert.equal(parsed.options.credentials?.password, pass);
    }
    const srv = resolveDatastore({ url: 'mongodb+srv://cluster.example/app?tls=true&authMechanism=MONGODB-X509' });
    assert.equal(new MongoClient(srv.url, srv.options).options.tls, true);
    assert.throws(
      () => resolveDatastore({ url: 'mongodb://secret:private@host/app', port: 'bad' }),
      error => !String(error).includes('private')
    );
    assert.throws(() => resolveDatastore({ url: 'mongodb://host/app?ignoreUndefined=true' }));
  });
  it('shares only equivalent effective connection policies, including authSource and options', function () {
    const key = (url: string, options = {}) => resolveDatastore({ url, ...options }).poolKey;
    assert.equal(key('mongodb://host/a'), key('mongodb://host/b'));
    assert.equal(key('mongodb://u:p@host/a?authSource=admin'), key('mongodb://u:p@host/b?authSource=admin'));
    assert.notEqual(key('mongodb://u:p@host/a'), key('mongodb://u:p@host/b'));
    assert.notEqual(key('mongodb://host/a'), key('mongodb://host/a', { maxPoolSize: 2 }));
    assert.notEqual(key('mongodb://host/a'), key('mongodb://host/a?tls=true'));
    // Opaque TLS contexts have identical enumerable shapes despite different
    // policies. Refuse them rather than sharing their pools by that shape.
    for (const secureContext of [createSecureContext(), createSecureContext({ minVersion: 'TLSv1.3' })])
      assert.throws(() => resolveDatastore({ url: 'mongodb://host/a', tls: true, secureContext }));
    assert.throws(() => resolveDatastore({ url: 'mongodb://host/a', pkFactory: { createPk: () => 'custom' } }));
  });
  it('initializes offline, survives reload, waits for active operations and drains before closing', async () => {
    const application = app();
    const sockets = sinon.stub(MongoClient.prototype, 'connect').rejects(new Error('unexpected connect'));
    await Promise.all([initializePersistence(application), initializePersistence(application)]);
    assert.equal(sockets.callCount, 0);
    const order: string[] = [];
    let finish!: () => void;
    const active = persistenceOperation(
      application,
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    await Promise.resolve();
    registerPersistenceResource(application, 'test', {
      drain: async () => {
        order.push('drain');
      },
      close: async () => {
        order.push('close');
      },
    });
    const close = cleanupPersistence(application);
    assert.throws(() => registerPersistenceResource(application, 'late', { close: async () => {} }), /shutdown/);
    await assert.rejects(
      persistenceOperation(application, async () => {}),
      /draining/
    );
    await assert.rejects(mongoDatabase(application, 'mongodb'), /shutdown/);
    finish();
    await Promise.all([close, active, cleanupPersistence(application)]);
    assert.deepEqual(order, ['drain', 'close']);
    assert.throws(() => registerPersistenceResource(application, 'late', { close: async () => {} }), /shutdown/);
    await initializePersistence(application);
    const modulePath = require.resolve('../../src/persistence/runtime');
    const saved = require.cache[modulePath];
    try {
      delete require.cache[modulePath];
      const loaded: typeof import('../../src/persistence/runtime') = require(modulePath);
      registerPersistenceResource(application, 'reload', {
        close: async () => {
          order.push('reload');
        },
      });
      await loaded.cleanupPersistence(application);
      assert.equal(order.at(-1), 'reload');
    } finally {
      require.cache[modulePath] = saved;
    }
  });
  it('retains failed resources for retry and preserves prior shutdown errors', async () => {
    const original = new Error('prior');
    const application = app({ beforeShutdown: (cb: (error: unknown) => void) => cb(original) });
    await initializePersistence(application);
    let fail = true;
    let closes = 0;
    registerPersistenceResource(application, 'retry', {
      drain: async () => {
        if (fail) throw new Error('drain');
      },
      close: async () => {
        closes++;
      },
    });
    await assert.rejects(cleanupPersistence(application), /drain failed/);
    assert.equal(closes, 0);
    fail = false;
    const failure = await new Promise(resolve => application.config.beforeShutdown!(resolve));
    assert.equal(failure, original);
    assert.equal(closes, 1);
    await cleanupPersistence(application);
    assert.equal(closes, 1);
  });

  it('starts bounded resource drains before waiting for a pending database acquisition', async () => {
    const application = app({ datastores: { mongodb: { url: 'mongodb://fixture/pending' } } });
    await initializePersistence(application);
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    sinon.stub(MongoClient.prototype, 'connect').callsFake(async function (this: MongoClient) {
      await held;
      return this;
    });
    const close = sinon.stub(MongoClient.prototype, 'close').resolves();
    const acquisition = mongoDatabase(application, 'mongodb');
    let fail = true;
    registerPersistenceResource(application, 'deadline', {
      drain: async () => {
        if (fail) throw new Error('deadline exceeded');
      },
      close: async () => {},
    });
    const cleanup = cleanupPersistence(application).then(
      () => 'closed',
      error => error
    );
    try {
      const result = await Promise.race([
        cleanup,
        new Promise(resolve => setTimeout(() => resolve('still waiting'), 50)),
      ]);
      assert.equal((result as { code?: string }).code, 'cleanup');
      assert.equal(close.called, false);
    } finally {
      release();
      await acquisition;
      await cleanup;
      fail = false;
      await cleanupPersistence(application);
    }
    assert.equal(close.calledOnce, true);
  });

  it('reports a failed drain before waiting for live operations, retaining both for retry', async () => {
    const application = app();
    await initializePersistence(application);
    let release!: () => void;
    const active = persistenceOperation(
      application,
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    await Promise.resolve();
    let fail = true;
    let closes = 0;
    registerPersistenceResource(application, 'deadline', {
      drain: async () => {
        if (fail) throw new Error('deadline exceeded');
      },
      close: async () => {
        closes++;
      },
    });
    registerPersistenceResource(application, 'held-session', { drain: () => active, close: async () => {} });
    const cleanup = cleanupPersistence(application).then(
      () => 'closed',
      error => error
    );
    try {
      const result = await Promise.race([
        cleanup,
        new Promise(resolve => setTimeout(() => resolve('still waiting'), 50)),
      ]);
      assert.equal((result as { code?: string }).code, 'cleanup');
      assert.equal(closes, 0);
      await assert.rejects(initializePersistence(application), /Finish failed/);
    } finally {
      release();
      await active;
      await cleanup;
      fail = false;
      await cleanupPersistence(application);
    }
    assert.equal(closes, 1);
  });
});

describe('app-scoped non-model resource ownership', function () {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'sails');
  afterEach(() => {
    sinon.restore();
    if (saved) Object.defineProperty(globalThis, 'sails', saved);
    else Reflect.deleteProperty(globalThis, 'sails');
  });
  it('disposes only the captured application GridFS clients and survives module reload', async () => {
    const { GridFSDriver } =
      require('../../src/storage/GridFSDriver') as typeof import('../../src/storage/GridFSDriver');
    const a = app({ datastores: { mongodb: { url: 'mongodb://fixture/a' } } });
    const b = app({ datastores: { mongodb: { url: 'mongodb://fixture/a' } } });
    await initializePersistence(a);
    await initializePersistence(b);
    const connect = sinon.stub(MongoClient.prototype, 'connect').resolvesThis();
    const close = sinon.stub(MongoClient.prototype, 'close').resolves();
    const bucket = () => ({
      find: () => ({ toArray: async () => [] }),
      openUploadStream: sinon.stub(),
      openDownloadStreamByName: sinon.stub(),
      delete: async () => {},
    });
    Object.assign(globalThis, { sails: a });
    await new GridFSDriver({}, bucket).exists('missing');
    const modulePath = require.resolve('../../src/storage/GridFSDriver');
    const module = require.cache[modulePath];
    try {
      delete require.cache[modulePath];
      const loaded: typeof import('../../src/storage/GridFSDriver') = require(modulePath);
      await new loaded.GridFSDriver({}, bucket).exists('missing');
      assert.equal(connect.callCount, 1);
    } finally {
      require.cache[modulePath] = module;
    }
    Object.assign(globalThis, { sails: b });
    await new GridFSDriver({}, bucket).exists('missing');
    assert.equal(connect.callCount, 2);
    await cleanupPersistence(a);
    assert.equal(close.getCalls().filter(call => call.thisValue === connect.firstCall.thisValue).length, 1);
    assert.equal(close.getCalls().filter(call => call.thisValue === connect.secondCall.thisValue).length, 0);
    await cleanupPersistence(a);
    await cleanupPersistence(b);
    assert.equal(close.getCalls().filter(call => call.thisValue === connect.secondCall.thisValue).length, 1);
  });
  it('retains an errored GridFS client and a failed close for app cleanup retry', async () => {
    const { GridFSDriver }: typeof import('../../src/storage/GridFSDriver') = require('../../src/storage/GridFSDriver');
    const application = app({ datastores: { mongodb: { url: 'mongodb://fixture/error' } } });
    Object.assign(globalThis, { sails: application });
    await initializePersistence(application);
    const close = sinon.stub(MongoClient.prototype, 'close');
    close.onFirstCall().rejects(new Error('injected close failure'));
    close.onSecondCall().resolves();
    const connect = sinon.stub(MongoClient.prototype, 'connect').resolvesThis();
    const bucket = () => ({
      find: () => ({ toArray: async () => [] }),
      openUploadStream: sinon.stub(),
      openDownloadStreamByName: sinon.stub(),
      delete: async () => {},
    });
    await new GridFSDriver({}, bucket).exists('missing');
    connect.firstCall.thisValue.emit('error', new Error('injected client error'));
    await assert.rejects(cleanupPersistence(application), /app-owned persistence pools/);
    assert.equal(close.callCount, 1);
    await assert.rejects(initializePersistence(application), /Finish failed/);
    await cleanupPersistence(application);
    assert.equal(close.callCount, 2);
  });

  it('closes the connect-mongo store created by middleware exactly once', async () => {
    const { redboxSession } =
      require('../../src/middleware/redboxSession') as typeof import('../../src/middleware/redboxSession');
    const MongoStore = require('connect-mongo').default as typeof import('connect-mongo').default;
    const store = { close: sinon.stub().resolves(), on: sinon.stub().returnsThis() };
    sinon.stub(MongoStore, 'create').returns(store as unknown as import('connect-mongo').default);
    const application = app();
    Object.assign(globalThis, { sails: application });
    await initializePersistence(application);
    sinon
      .stub(require('../../src/persistence/runtime'), 'mongoSessionDatabase')
      .resolves({ client: {}, databaseName: 'fixture' });
    redboxSession({ adapter: 'mongo', secret: 'fixture-only', mongoUrl: 'mongodb://localhost/fixture' });
    await cleanupPersistence(application);
    await cleanupPersistence(application);
    assert.equal(store.close.callCount, 1);
  });
});

describe('shared repository groups', () => {
  it('waits for startup, drains compound calls on the concrete owner and rejects stale handles after restart', async () => {
    const application = app();
    let started!: () => void;
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    const admitted = new Promise<void>(resolve => {
      started = resolve;
    });
    const group = definePersistenceGroup('fixture', async () => ({
      nested: {
        async read() {
          return 7;
        },
        async compound() {
          started();
          await held;
          return this.read();
        },
      },
    }));
    const starting = group.initialize(application);
    assert.throws(() => group.get(application), /not been initialized/);
    await starting;
    const repository = group.get(application);
    const pending = repository.nested.compound();
    await admitted;
    const closing = cleanupPersistence(application);
    await assert.rejects(repository.nested.read(), /draining/);
    release();
    assert.equal(await pending, 7);
    await closing;
    await group.initialize(application);
    await assert.rejects(repository.nested.read(), /active fixture/);
    assert.equal(await group.get(application).nested.read(), 7);
    await cleanupPersistence(application);
  });
});
