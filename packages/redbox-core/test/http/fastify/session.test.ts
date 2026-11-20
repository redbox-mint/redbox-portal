import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request, type IncomingHttpHeaders } from 'node:http';
import { createHmac } from 'node:crypto';
import type { Db, CommandStartedEvent, MongoClient } from 'mongodb';
import sinon from 'sinon';

import cookiePlugin, { Signer } from '@fastify/cookie';
import sessionPlugin from '@fastify/session';
import type { FastifyRequest, FastifyInstance } from 'fastify';
import { ApplicationRuntime } from '../../../dist/application';
import { FastifyHost } from '../../../dist/http/fastify/FastifyHost';
import type { FastifyPreparation } from '../../../dist/http/fastify/preparation';
import type { PersistenceOwner } from '../../../dist/persistence/owner';
import {
  prepareNativeSessions,
  nativeSessionNamespace,
  type NativeSessionConfiguration,
} from '../../../dist/http/fastify/session';
import {
  mongoDatabase,
  mongoSessionDatabase,
  persistenceStatus,
  hasActivePersistenceWork,
} from '../../../dist/persistence/runtime';
import { prepareSessionIndexes } from '../../../dist/persistence/sessions/indexes';
import { hasActiveHttpRequest } from '../../../dist/middleware/requestLifetime';

const url = process.env.FM014_TEST_MONGO_URL;
if (url && !/\/fm014_sessions(?:\?|$)/.test(url))
  throw new Error('FM014_TEST_MONGO_URL must use disposable /fm014_sessions.');
const secret = 'fm014-root-secret-for-disposable-tests-0001';
declare module 'fastify' {
  interface Session {
    value?: string;
  }
}
interface StoredSession {
  _id: string;
  session: string;
  expires: Date;
  version?: number;
  lastModified?: Date;
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
interface Fixture {
  host: FastifyHost;
  application: ApplicationRuntime;
  owner: PersistenceOwner;
  database: Db;
  client: MongoClient;
  commands: string[];
  port: number;
  sessionConfig: NativeSessionConfiguration;
}
const config = (overrides: Partial<NativeSessionConfiguration> = {}): NativeSessionConfiguration => ({
  adapter: 'mongo',
  mongoUrl: url!,
  mongoOptions: { monitorCommands: true },
  secret,
  cookie: { secure: false, maxAge: 60_000 },
  ...overrides,
});

function exchange(port: number, path = '/read', cookie?: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; text: string; headers: IncomingHttpHeaders }>((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port, path, agent: false, headers: { ...headers, ...(cookie ? { cookie } : {}) } },
      res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', value => (text += value));
        res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode!, text, headers: res.headers }));
      }
    );
    req.setTimeout(4000, () => req.destroy(new Error('Session test request timed out.')));
    req.on('error', reject);
    req.end();
  });
}
function cookieOf(result: Awaited<ReturnType<typeof exchange>>) {
  const header = result.headers['set-cookie']?.[0];
  assert(header, result.text);
  return header.split(';', 1)[0];
}

describe('native session configuration', () => {
  it('rejects unsupported stores and weak/empty rotation keys before acquiring Mongo', async () => {
    const owner = { config: {}, log: { warn() {} } };
    for (const invalid of [
      { secret: '' },
      { secret: [] },
      { secret: ['long-enough-session-secret-for-tests', 'short'] },
      { adapter: 'memory' },
      { ttl: 0 },
      { touchAfter: -1 },
    ]) {
      await assert.rejects(
        prepareNativeSessions({} as FastifyPreparation, owner, {
          ...config(),
          ...invalid,
        } as NativeSessionConfiguration)
      );
      assert.equal(persistenceStatus(owner).pools, 0);
    }
  });
});

(url ? describe : describe.skip)('native session boundary with real Mongo', function () {
  this.timeout(10_000);
  const fixtures: Fixture[] = [];
  const releases: (() => void)[] = [];
  afterEach(async () => {
    for (const release of releases.splice(0)) release();
    for (const f of fixtures.splice(0)) {
      if (!f.host.status().stopped)
        await f.database
          .admin()
          .command({ configureFailPoint: 'failCommand', mode: 'off' })
          .catch(() => {});
      await f.host.stop();
    }
    sinon.restore();
  });

  async function fixture(
    settings: Partial<NativeSessionConfiguration> = {},
    trustProxy = false,
    install?: (app: FastifyPreparation, database: Db, native: FastifyInstance) => void,
    maintainIndexes = true
  ): Promise<Fixture> {
    const sessionConfig = config(settings);
    const owner = { config: { datastores: { mongodb: { url, monitorCommands: true } } }, log: { warn() {} } };
    const application = new ApplicationRuntime(owner);
    let database!: Db;
    let client!: MongoClient;
    const commands: string[] = [];
    const host = new FastifyHost(application, {
      hostname: '127.0.0.1',
      port: 0,
      owner,
      trustProxy,
      prepare: async app => {
        database = await mongoDatabase(owner, 'mongodb');
        client = database.client;
        await database.dropDatabase();
        client.on('commandStarted', event => commands.push(event.commandName));
        if (maintainIndexes) await prepareSessionIndexes(owner, { ...sessionConfig }, 'ensure');
        commands.length = 0;
        await prepareNativeSessions(app, owner, sessionConfig);
        assert.strictEqual((await mongoSessionDatabase(owner, { ...sessionConfig })).client, client);
        app.get('/read', async req => ({
          value: req.session.get('value') ?? null,
          id: req.session.sessionStoreId,
          generation: req.session.sessionId,
        }));
        app.get('/change', async req => {
          req.session.set('value', 'saved');
          return { id: req.session.sessionStoreId };
        });
        app.get('/rotate', async req => {
          await req.session.regenerate();
          return { id: req.session.sessionStoreId };
        });
        app.get('/destroy', async req => {
          await req.session.destroy();
          return { ok: true };
        });
        app.get('/explicit', async req => {
          req.session.set('value', 'explicit');
          await req.session.save();
          return { ok: true };
        });
        app.setErrorHandler((_error, _req, reply) => reply.code(500).send({ error: 'session-failed' }));
        install?.(app, database, Reflect.get(host, 'fastify'));
      },
    });
    // Register cleanup before initialization so preparation failures remain owned.
    const value = {
      host,
      application,
      owner,
      get database() {
        return database;
      },
      get client() {
        return client;
      },
      commands,
      get port() {
        return host.address()!.port;
      },
      sessionConfig,
    };
    fixtures.push(value);
    await host.initialize();
    await host.activate();
    return value;
  }

  it('borrows exactly one connected client/pool, creates no indexes, and leaves TTL DDL to maintenance', async () => {
    const { MongoClient } = await import('mongodb');
    const poolClients: MongoClient[] = [];
    const connectionClients: MongoClient[] = [];
    const originalConnect = MongoClient.prototype.connect;
    const connect = sinon.stub(MongoClient.prototype, 'connect').callsFake(function (this: MongoClient) {
      this.on('connectionPoolCreated', () => poolClients.push(this));
      this.on('connectionCreated', () => connectionClients.push(this));
      return originalConnect.call(this);
    });
    const f = await fixture();
    assert.equal(connect.callCount, 1);
    assert.deepEqual(poolClients, [f.client]);
    assert(connectionClients.length > 0);
    assert.deepEqual([...new Set(connectionClients)], [f.client]);
    assert.equal(persistenceStatus(f.owner).pools, 1);
    const initialIndexes = await f.database.collection<StoredSession>('sessions').listIndexes().toArray();
    const close = sinon.spy(f.client, 'close');
    const first = await exchange(f.port, '/change');
    assert.equal(first.status, 200);
    assert.equal((await exchange(f.port, '/read', cookieOf(first))).status, 200);
    assert.equal(connect.callCount, 1);
    assert.equal(close.callCount, 0);
    assert(!f.commands.includes('createIndexes'));
    assert.deepEqual(await f.database.collection<StoredSession>('sessions').listIndexes().toArray(), initialIndexes);
    assert.equal((await prepareSessionIndexes(f.owner, { ...f.sessionConfig }, 'inspect'))[0].index, 'ready');
    assert.equal((await prepareSessionIndexes(f.owner, { ...f.sessionConfig }, 'ensure'))[0].index, 'ready');
    assert.equal(
      (await f.database.collection<StoredSession>('sessions').listIndexes().toArray()).find(
        index => index.name === 'expires_1'
      )!.expireAfterSeconds,
      0
    );
    assert.equal(close.callCount, 0);
    await f.host.stop();
    assert.equal(close.callCount, 1); // application owner, never Fastify/store
    assert.equal(persistenceStatus(f.owner).pools, 0);
  });

  it('refuses startup without the explicit TTL index and never creates it automatically', async () => {
    await assert.rejects(fixture({}, false, undefined, false), /Session indexes are not ready/);
    const f = fixtures[0];
    assert(!f.commands.includes('createIndexes'));
    assert.equal(f.host.address(), null);
    assert.equal(persistenceStatus(f.owner).pools, 0);
  });

  it('does not initialize anonymous state; saves, looks up, touches, rotates and destroys native sessions', async () => {
    const f = await fixture();
    assert.equal((await exchange(f.port)).headers['set-cookie'], undefined);
    assert.equal(await f.database.collection<StoredSession>('sessions').countDocuments(), 0);
    const saved = await exchange(f.port, '/change');
    const cookie = cookieOf(saved);
    const read = await exchange(f.port, '/read', cookie);
    assert.equal(JSON.parse(read.text).value, 'saved');
    assert.equal(read.headers['set-cookie'], undefined);
    const id = JSON.parse(read.text).id;
    const before = await f.database.collection<StoredSession>('sessions').findOne({ _id: nativeSessionNamespace + id });
    const rotated = await exchange(f.port, '/rotate', cookie);
    assert.equal(rotated.status, 200);
    assert.equal(JSON.parse((await exchange(f.port, '/read', cookie)).text).value, null);
    const current = cookieOf(rotated);
    assert.equal((await exchange(f.port, '/explicit', current)).status, 200);
    assert.equal(JSON.parse((await exchange(f.port, '/read', current)).text).value, 'explicit');
    assert.equal((await exchange(f.port, '/destroy', current)).status, 200);
    assert.equal(JSON.parse((await exchange(f.port, '/read', current)).text).value, null);
    assert.equal(await f.database.collection<StoredSession>('sessions').countDocuments(), 0);
    assert(before?.expires instanceof Date);
  });

  for (const rolling of [false, true])
    it(`refreshes TTL without replacing session data, rolling=${rolling}`, async () => {
      const f = await fixture({ rolling });
      const saved = await exchange(f.port, '/change');
      const id = JSON.parse(saved.text).id;
      const collection = f.database.collection<StoredSession>('sessions');
      const before = await collection.findOne({ _id: nativeSessionNamespace + id });
      await collection.updateOne({ _id: before!._id }, { $set: { expires: new Date(Date.now() + 10_000) } });
      f.commands.length = 0;
      const result = await exchange(f.port, '/read', cookieOf(saved));
      assert.equal(result.status, 200);
      assert.equal(!!result.headers['set-cookie'], rolling);
      const after = await collection.findOne({ _id: before!._id });
      assert(after!.expires.getTime() > Date.now() + 50_000);
      assert.equal(after!.session, before!.session);
      assert.deepEqual(f.commands, ['find', 'update', 'find']);
    });

  it('retains configured touchAfter throttling without postponing explicit saves', async () => {
    const f = await fixture({ touchAfter: 30 });
    const saved = await exchange(f.port, '/change');
    const cookie = cookieOf(saved);
    f.commands.length = 0;
    assert.equal((await exchange(f.port, '/read', cookie)).status, 200);
    assert.deepEqual(f.commands, ['find']);
    await f.database.collection<StoredSession>('sessions').updateOne({}, { $set: { lastModified: new Date(0) } });
    f.commands.length = 0;
    assert.equal((await exchange(f.port, '/read', cookie)).status, 200);
    assert.deepEqual(f.commands, ['find', 'update']);
    f.commands.length = 0;
    assert.equal((await exchange(f.port, '/explicit', cookie)).status, 200);
    assert(f.commands.includes('update'));
  });

  it('uses the configured database and collection through the same application pool and maintenance path', async () => {
    const f = await fixture({ dbName: 'fm014_sessions_secondary', collection: 'portalSessions' });
    const database = await mongoSessionDatabase(f.owner, { ...f.sessionConfig });
    assert.strictEqual(database.client, f.client);
    assert.equal(database.databaseName, 'fm014_sessions_secondary');
    assert.equal((await exchange(f.port, '/change')).status, 200);
    assert.equal(await database.collection('portalSessions').countDocuments(), 1);
    assert.equal((await prepareSessionIndexes(f.owner, { ...f.sessionConfig }, 'inspect'))[0].index, 'ready');
    await database.dropDatabase();
  });

  it('defaults to secure, HttpOnly, Lax cookies and honors proxy=false even when the host trusts the proxy', async () => {
    const defaults = { secure: undefined, httpOnly: undefined, sameSite: undefined };
    const f = await fixture({ cookie: defaults, proxy: false }, true);
    const result = await exchange(f.port, '/change', undefined, { 'x-forwarded-proto': 'https' });
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(await f.database.collection('sessions').countDocuments(), 1);
    await f.host.stop();
    const trusted = await fixture({ cookie: defaults }, true);
    const saved = await exchange(trusted.port, '/change', undefined, { 'x-forwarded-proto': 'https' });
    const header = saved.headers['set-cookie']![0];
    assert(header.includes('Secure') && header.includes('HttpOnly') && header.includes('SameSite=Lax'));
  });

  it('refuses expired and wrong-version documents without waiting for Mongo TTL deletion', async () => {
    const f = await fixture();
    for (const changed of [{ expires: new Date(0) }, { version: 0 }]) {
      const saved = await exchange(f.port, '/change');
      await f.database.collection<StoredSession>('sessions').updateOne({}, { $set: changed });
      assert.equal(JSON.parse((await exchange(f.port, '/read', cookieOf(saved))).text).value, null);
      await f.database.collection<StoredSession>('sessions').deleteMany({});
    }
  });

  for (const trustProxy of [false, true])
    for (const secure of [false, true]) {
      it(`preserves cookie attributes and forwarded HTTPS with trustProxy=${trustProxy}, secure=${secure}`, async () => {
        const f = await fixture(
          {
            name: 'configured.sid',
            cookie: {
              secure,
              path: '/',
              domain: 'fixture.invalid',
              httpOnly: true,
              sameSite: 'strict',
              maxAge: 120_000,
            },
          },
          trustProxy
        );
        const saved = await exchange(f.port, '/change', undefined, { 'x-forwarded-proto': 'https' });
        assert.equal(saved.status, 200);
        assert.equal(await f.database.collection<StoredSession>('sessions').countDocuments(), 1); // even without secure transport
        const header = saved.headers['set-cookie']?.[0];
        if (secure && !trustProxy) return assert.equal(header, undefined);
        assert(header);
        assert(header.startsWith('configured.sid=s%3A'), header);
        assert(
          header.includes('Path=/') &&
            header.includes('Domain=fixture.invalid') &&
            header.includes('HttpOnly') &&
            header.includes('SameSite=Strict')
        );
        assert.equal(header.includes('Secure'), trustProxy); // false is Express auto mode
        assert(Math.abs(Date.parse(header.match(/Expires=([^;]+)/)![1]) - Date.now() - 120_000) < 2000);
        assert.equal(
          JSON.parse((await exchange(f.port, '/read', cookieOf(saved), { 'x-forwarded-proto': 'https' })).text).value,
          'saved'
        );
      });
    }

  it('retains configured SameSite=None in HTTP auto mode and session-specific proxy overrides', async () => {
    const f = await fixture({ proxy: true, cookie: { secure: false, sameSite: 'none' } });
    const http = await exchange(f.port, '/change');
    assert(cookieOf(http));
    assert(http.headers['set-cookie']![0].includes('SameSite=None'));
    assert(!http.headers['set-cookie']![0].includes('Secure'));
    const forwarded = await exchange(f.port, '/change', undefined, { 'x-forwarded-proto': 'https' });
    assert(forwarded.headers['set-cookie']![0].includes('Secure'));
  });

  it('honors cookie path and session-cookie fallback TTL, resave and saveUninitialized', async () => {
    const f = await fixture(
      { cookie: { secure: false, path: '/scoped' }, ttl: 123, resave: true, saveUninitialized: true },
      false,
      app => {
        app.get('/scoped/read', async () => ({ ok: true }));
      }
    );
    assert.equal((await exchange(f.port, '/read')).headers['set-cookie'], undefined);
    const saved = await exchange(f.port, '/scoped/read');
    assert(saved.headers['set-cookie']![0].includes('Path=/scoped'));
    assert(!saved.headers['set-cookie']![0].includes('Expires='));
    const document = await f.database.collection<StoredSession>('sessions').findOne({});
    assert(Math.abs(document!.expires.getTime() - Date.now() - 123_000) < 2000);
    f.commands.length = 0;
    assert.equal((await exchange(f.port, '/scoped/read', cookieOf(saved))).status, 200);
    assert(f.commands.includes('update'));
  });

  it('rejects Express, unsigned, tampered and malformed cookies and accepts same-host signing-key rotation', async () => {
    const f = await fixture({ secret: [secret + '-new', secret] });
    const saved = await exchange(f.port, '/change');
    const nativeCookie = cookieOf(saved);
    const decoded = decodeURIComponent(nativeCookie.split('=', 2)[1]).slice(2);
    const signer = new Signer(
      createHmac('sha256', secret + '-new')
        .update(nativeSessionNamespace)
        .digest('base64url')
    );
    const unsigned = signer.unsign(decoded);
    assert(unsigned.valid && unsigned.value);
    const previousSigner = new Signer(createHmac('sha256', secret).update(nativeSessionNamespace).digest('base64url'));
    const previousCookie = 'redbox.sid=' + encodeURIComponent('s:' + previousSigner.sign(unsigned.value));
    assert.equal(JSON.parse((await exchange(f.port, '/read', previousCookie)).text).value, 'saved');
    const expressCookie = 'redbox.sid=' + encodeURIComponent('s:' + new Signer(secret).sign(JSON.parse(saved.text).id));
    for (const cookie of [expressCookie, 'redbox.sid=unsigned', nativeCookie + 'tampered', 'redbox.sid=%ZZ'])
      assert.equal(JSON.parse((await exchange(f.port, '/read', cookie)).text).value, null);
    assert.equal(await f.database.collection<StoredSession>('sessions').countDocuments(), 1);
  });

  it('keeps namespace/version isolation even if the root key is deliberately reused', async () => {
    const f = await fixture();
    const legacyId = 'legacy-session';
    await f.database.collection<StoredSession>('sessions').insertOne({
      _id: legacyId,
      expires: new Date(Date.now() + 60_000),
      session: JSON.stringify({ cookie: {}, user: { id: 'old' }, authenticationVersion: 6 }),
    });
    const signed = new Signer(createHmac('sha256', secret).update(nativeSessionNamespace).digest('base64url')).sign(
      legacyId
    );
    assert.equal(
      JSON.parse((await exchange(f.port, '/read', 'redbox.sid=' + encodeURIComponent('s:' + signed))).text).value,
      null
    );
    assert.equal(await f.database.collection<StoredSession>('sessions').countDocuments(), 1);
  });

  for (const action of ['rotate', 'destroy'])
    it(`does not resurrect a session from a stale save after concurrent ${action}`, async () => {
      const loaded = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      releases.push(release.resolve);
      const f = await fixture({}, false, app => {
        app.get('/stale', async req => {
          req.session.set('value', 'stale');
          loaded.resolve();
          await release.promise;
          await req.session.save();
          return { ok: true };
        });
      });
      const cookie = cookieOf(await exchange(f.port, '/change'));
      const stale = exchange(f.port, '/stale', cookie);
      await loaded.promise;
      const winner = await exchange(f.port, '/' + action, cookie);
      assert.equal(winner.status, 200);
      release.resolve();
      const result = await stale;
      assert.equal(result.status, 500);
      assert.equal(result.headers['set-cookie'], undefined);
      const rows = await f.database.collection<StoredSession>('sessions').find().toArray();
      assert.equal(rows.length, action === 'rotate' ? 1 : 0);
      for (const row of rows) assert(!row.session.includes('stale'));
    });

  it('keeps ordinary plugins sealed while exact native plugin decorators and Symbols work', async () => {
    const f = await fixture({}, false, app => {
      assert.throws(() => Reflect.get(app, 'decorate'), /no qualified ownership contract/);
      assert.throws(() => Reflect.get(app, 'decryptSession'), /no qualified ownership contract/);
      assert.throws(() => app.register(sessionPlugin, {} as never), /session store/);
      assert.throws(() => app.register(cookiePlugin, { idGenerator: () => '' } as never), /register options/);
      app.get('/seal', async (req, reply) => {
        assert.equal(Object.getPrototypeOf(req), null);
        assert.equal(Object.getPrototypeOf(req.session), null);
        assert.throws(() => Reflect.get(req.server, 'decorate'), /no qualified ownership contract/);
        assert.throws(() => Reflect.get(req.server, 'decryptSession'), /no qualified ownership contract/);
        assert.throws(() => reply.setCookie('unqualified', 'value'), /owned hooks\/module drains/);
        assert.strictEqual(req.getDecorator('session'), req.session);
        assert.strictEqual(req.session.resetMaxAge(), req.session);
        assert.throws(() => Reflect.deleteProperty(req.session, 'resetMaxAge'), /property deletion/);
        req.session.value = 'temporary';
        assert.equal(req.session.get('value'), 'temporary');
        assert.equal(Reflect.deleteProperty(req.session, 'value'), true);
        assert.equal(req.session.get('value'), undefined);
        assert.throws(() => Reflect.deleteProperty(req.session, 'save'), /property deletion/);
        return { ok: true };
      });
    });
    assert.equal((await exchange(f.port, '/seal')).status, 200);
  });

  for (const [command, route] of [
    ['find', '/read'],
    ['insert', '/change'],
    ['update', '/read'],
    ['delete', '/destroy'],
  ] as const) {
    it(`reports a real Mongo ${command} failure without disclosing details or issuing a success cookie`, async () => {
      const f = await fixture();
      const cookie = command === 'insert' ? undefined : cookieOf(await exchange(f.port, '/change'));
      await f.database.admin().command({
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: { failCommands: [command], errorCode: 112 },
      });
      const result = await exchange(f.port, route, cookie);
      assert.equal(result.status, 500, result.text);
      assert.equal(result.headers['set-cookie'], undefined);
      assert.deepEqual(JSON.parse(result.text), { error: 'session-failed' });
      await f.host.stop();
      assert.equal(persistenceStatus(f.owner).pools, 0);
    });
  }

  for (const operation of ['get', 'set', 'save', 'touch', 'destroy', 'regenerate'] as const) {
    it(`owns real ${operation} through disconnect, stop deadline and retry without closing the borrowed client`, async () => {
      const reached = Promise.withResolvers<void>();
      const completed = Promise.withResolvers<void>();
      const f = await fixture({}, false, app => {
        app.get('/detached', (req, reply) => {
          const session = req.session;
          if (operation === 'set' || operation === 'save') session.set('value', 'detached');
          const callback = (error?: Error) => {
            try {
              assert.ifError(error);
              assert(hasActiveHttpRequest(f.owner));
              assert(hasActivePersistenceWork(f.owner));
              completed.resolve();
            } catch (failure) {
              completed.reject(failure);
            }
          };
          if (operation === 'destroy') session.destroy(callback);
          else if (operation === 'regenerate') session.regenerate(callback);
          else session.save(callback);
          reply.hijack();
          reply.raw.end('accepted');
        });
      });
      const initial = operation === 'set' ? undefined : cookieOf(await exchange(f.port, '/change'));
      const command =
        operation === 'get'
          ? 'find'
          : operation === 'set'
            ? 'insert'
            : ['destroy', 'regenerate'].includes(operation)
              ? 'delete'
              : 'update';
      await f.database.admin().command({
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: { failCommands: [command], blockConnection: true, blockTimeMS: 500 },
      });
      const listener = (event: CommandStartedEvent) => {
        if (event.commandName === command) reached.resolve();
      };
      f.client.on('commandStarted', listener);
      const close = sinon.spy(f.client, 'close');
      const req = request({
        hostname: '127.0.0.1',
        port: f.port,
        path: ['set', 'save', 'destroy', 'regenerate'].includes(operation) ? '/detached' : '/read',
        agent: false,
        headers: initial ? { cookie: initial } : {},
      });
      req.on('error', () => {});
      req.end();
      try {
        await reached.promise;
        const disconnected = new Promise<void>(resolve => req.once('close', resolve));
        req.destroy();
        await disconnected;
        await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline|drain/);
        assert.equal(close.callCount, 0);
        assert.equal(persistenceStatus(f.owner).pools, 1);
        await f.host.stop();
        if (['set', 'save', 'destroy', 'regenerate'].includes(operation)) await completed.promise;
        assert.equal(close.callCount, 1);
        assert.equal(persistenceStatus(f.owner).operations, 0);
        assert.equal(persistenceStatus(f.owner).pools, 0);
      } finally {
        req.destroy();
        f.client.off('commandStarted', listener);
      }
    });
  }

  const handleAccess = [
    'get',
    'property',
    'reflect',
    'descriptor',
    'destructure',
    'getter',
    'get-getter',
    'getter-descriptor',
    'spread',
  ] as const;
  for (const operation of ['save', 'reload', 'regenerate', 'destroy'] as const)
    for (const access of handleAccess)
      it(`owns returned ${operation} handle via ${access} through callback completion and stop retry`, async () => {
        const started = Promise.withResolvers<void>();
        const completed = Promise.withResolvers<void>();
        void completed.promise.catch(() => {});
        const release = Promise.withResolvers<void>();
        releases.push(release.resolve);
        let sameHandle = false;
        const f = await fixture({}, false, (app, _database, native) => {
          // Test-only native seam: exercise a getter returning an inherited/own
          // Session method without granting definition access to application views.
          native.addHook('preHandler', (request, _reply, done) => {
            Object.defineProperty(request.session, 'methodHandle', {
              configurable: true,
              enumerable: true,
              get() {
                return Reflect.get(this, operation);
              },
            });
            done();
          });
          app.get('/returned-method', (req, reply) => {
            const session = req.session;
            let handle: unknown;
            if (access === 'get') handle = Reflect.apply(session.get, session, [operation]);
            else if (access === 'reflect') handle = Reflect.get(session, operation);
            else if (access === 'descriptor') handle = Object.getOwnPropertyDescriptor(session, operation)!.value;
            else if (access === 'destructure') {
              const { [operation]: value } = session;
              handle = value;
            } else if (access === 'getter') handle = Reflect.get(session, 'methodHandle');
            else if (access === 'get-getter') handle = Reflect.apply(session.get, session, ['methodHandle']);
            else if (access === 'getter-descriptor')
              handle = Object.getOwnPropertyDescriptor(session, 'methodHandle')!.value;
            else if (access === 'spread') handle = Reflect.get({ ...session }, 'methodHandle');
            else handle = session[operation];
            sameHandle = handle === session[operation];
            Reflect.apply(handle as (...args: unknown[]) => unknown, undefined, [
              async (error?: Error) => {
                try {
                  assert.ifError(error);
                  started.resolve();
                  await release.promise;
                  assert(hasActiveHttpRequest(f.owner));
                  assert(hasActivePersistenceWork(f.owner));
                  completed.resolve();
                } catch (failure) {
                  completed.reject(failure);
                }
              },
            ]);
            reply.hijack();
            reply.raw.end('accepted');
          });
        });
        const cookie = cookieOf(await exchange(f.port, '/change'));
        const close = sinon.spy(f.client, 'close');
        assert.equal((await exchange(f.port, '/returned-method', cookie)).text, 'accepted');
        await started.promise;
        await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline|drain/);
        assert.equal(close.callCount, 0);
        assert.equal(persistenceStatus(f.owner).pools, 1);
        assert(sameHandle, 'Every accessor must return the canonical guarded method.');
        release.resolve();
        await f.host.stop();
        await completed.promise;
        assert.equal(close.callCount, 1);
        assert.equal(persistenceStatus(f.owner).pools, 0);
      });

  it('persists sessions for absolute targets and preserves the original target for actions', async () => {
    const target = 'http://example.test/absolute?next=%2Fscope%2Fread';
    const f = await fixture({}, false, app => {
      app.get('/absolute', req => {
        assert.equal(req.raw.url, target);
        assert.equal(req.url, target);
        req.session.set('value', 'absolute');
        return { ok: true };
      });
    });
    const result = await exchange(f.port, target);
    assert.equal(result.status, 200, result.text);
    assert.equal(JSON.parse((await exchange(f.port, '/read', cookieOf(result))).text).value, 'absolute');
    assert.equal(await f.database.collection('sessions').countDocuments(), 1);
  });

  it('retains asynchronous explicit-session callbacks after the response and fences stale store references', async () => {
    const started = Promise.withResolvers<void>();
    const completed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    releases.push(release.resolve);
    let stale!: FastifyRequest['sessionStore'];
    const f = await fixture({}, false, app => {
      app.get('/callback', (req, reply) => {
        stale = req.sessionStore;
        req.session.save(async error => {
          try {
            assert.ifError(error);
            started.resolve();
            await release.promise;
            assert(hasActivePersistenceWork(f.owner));
            assert(hasActiveHttpRequest(f.owner));
            completed.resolve();
          } catch (failure) {
            completed.reject(failure);
          }
        });
        reply.hijack();
        reply.raw.end('accepted');
      });
    });
    assert.equal((await exchange(f.port, '/callback')).text, 'accepted');
    await started.promise;
    await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline|drain/);
    assert.equal(persistenceStatus(f.owner).pools, 1);
    release.resolve();
    await f.host.stop();
    await completed.promise;
    let error: Error | undefined;
    stale.get('anything', failure => (error = failure));
    assert.match(error!.message, /active owned HTTP request/);
    await turn();
    assert.equal(persistenceStatus(f.owner).pools, 0);
  });
});
