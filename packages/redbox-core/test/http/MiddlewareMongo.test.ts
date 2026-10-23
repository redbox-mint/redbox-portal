import assert from 'node:assert/strict';
import { get } from 'node:http';
import MongoStore from 'connect-mongo';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ExpressHost, prepareHttpMiddleware, httpErrorHandler, httpAction } from '../../src/http/express';
import { prepareSessionIndexes } from '../../src/persistence/sessions/indexes';
import { persistenceStatus } from '../../src/persistence/runtime';
import { mongoFixture } from './mongoFixture';

const deferred = () => Promise.withResolvers<void>();

describe('standalone Mongo sessions and accepted HTTP ownership', function () {
  this.timeout(30_000);
  let f: Awaited<ReturnType<typeof mongoFixture>>;
  let host: ExpressHost | undefined;
  let release = () => {};
  beforeEach(async () => {
    f = await mongoFixture();
  });
  afterEach(async () => {
    release();
    sinon.restore();
    await host?.stop();
    host = undefined;
    await f?.close();
  });
  function config() {
    return {
      name: 'redbox.v6.sid',
      secret: 'synthetic-secret-at-least-32-characters-long',
      adapter: 'mongo',
      mongoUrl: process.env.HTTP_PILOT_TEST_MONGO_URL!.replace('/sr_p4_http', '/' + f.native.db().databaseName),
      collection: 'pilotSessions',
      cookie: { secure: false },
    };
  }
  async function start() {
    const options = config();
    await prepareSessionIndexes(f.owner, options, 'ensure');
    host = new ExpressHost(f.application, {
      owner: f.owner,
      hostname: '127.0.0.1',
      port: 0,
      prepare: async router => {
        const auth = await prepareHttpMiddleware(router, {
          owner: f.owner,
          identity: f.identity,
          session: options,
          log: nothingLogger,
        });
        router.post('/__test/login', auth.local, (_req, res) => res.json({ success: true }));
        router.get(
          '/__test/actor',
          httpAction(async (req, res) => {
            res.json(await auth.authenticate(req));
          })
        );
        router.get(
          '/__test/save',
          httpAction(async (req, res) => {
            req.session.branding = 'default';
            res.json({ success: true });
          })
        );
        router.use(httpErrorHandler(nothingLogger));
      },
    });
    await host.initialize();
    await host.activate();
    return 'http://127.0.0.1:' + host.address()!.port;
  }
  it('prepares TTL indexes explicitly and persists a real rotated Passport session with fresh actor reads', async () => {
    const before = await prepareSessionIndexes(f.owner, config(), 'inspect');
    assert.equal(before[0].index, 'missing');
    assert.equal(await f.native.db().listCollections({ name: 'pilotSessions' }).hasNext(), false);
    const url = await start();
    const indexes = await f.native.db().collection('pilotSessions').listIndexes().toArray();
    assert(indexes.some(index => index.name === 'expires_1' && index.expireAfterSeconds === 0));
    const login = await fetch(url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    assert.equal(login.status, 200);
    await login.json();
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const actor = await (await fetch(url + '/__test/actor', { headers: { Cookie: cookie } })).json();
    assert.equal(Reflect.get(actor as object, 'id'), f.user.id);
    const stored = await f.native.db().collection('pilotSessions').findOne();
    assert(stored);
    assert(!String(stored.session).includes('pilot-password'));
    assert(!String(stored.session).includes('roles'));
    await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
    assert.equal(await (await fetch(url + '/__test/actor', { headers: { Cookie: cookie } })).json(), false);
    assert.deepEqual(await f.native.db().collection('pilotSessions').listIndexes().toArray(), indexes);
  });

  it('refuses missing session TTL readiness without performing HTTP-startup DDL', async () => {
    const options = config();
    host = new ExpressHost(f.application, {
      owner: f.owner,
      hostname: '127.0.0.1',
      port: 0,
      prepare: async router => {
        await prepareHttpMiddleware(router, {
          owner: f.owner,
          identity: f.identity,
          session: options,
          log: nothingLogger,
        });
      },
    });
    await assert.rejects(host.initialize(), /Session indexes are not ready/);
    assert.equal(await f.native.db().listCollections({ name: 'pilotSessions' }).hasNext(), false);
    assert.equal(persistenceStatus(f.owner).pools, 0);
    assert.equal(persistenceStatus(f.owner).prismaClients, 0);
  });

  it('reports a conflicting TTL definition and never replaces it during explicit ensure', async () => {
    const collection = f.native.db().collection('pilotSessions');
    await collection.createIndex({ expires: 1 }, { name: 'expires_1', expireAfterSeconds: 60 });
    const before = await collection.listIndexes().toArray();
    assert.equal((await prepareSessionIndexes(f.owner, config(), 'inspect'))[0].index, 'conflicting');
    assert.equal((await prepareSessionIndexes(f.owner, config(), 'ensure'))[0].index, 'conflicting');
    assert.deepEqual(await collection.listIndexes().toArray(), before);
  });

  for (const abort of [false, true])
    it(`retains a real delayed Mongo session write through ${abort ? 'abort' : 'response'} and failed stop/retry`, async () => {
      const entered = deferred(),
        held = deferred(),
        saved = deferred();
      release = held.resolve;
      const original = MongoStore.prototype.set;
      sinon.stub(MongoStore.prototype, 'set').callsFake(function (this: MongoStore, sid, value, callback) {
        entered.resolve();
        void held.promise.then(() => {
          original.call(this, sid, value, error => {
            callback?.(error);
            saved.resolve();
          });
        });
      });
      const url = await start();
      const client = get(url + '/__test/save');
      const body = new Promise<void>(resolve => {
        client.on('response', response => {
          response.resume();
          response.on('end', resolve);
          response.on('close', resolve);
        });
        client.on('error', () => resolve());
      });
      await entered.promise;
      if (abort) {
        client.destroy();
        await body;
      }
      await assert.rejects(host!.stop({ deadlineMs: 30 }), /deadline/);
      assert(persistenceStatus(f.owner).pools > 0);
      assert(persistenceStatus(f.owner).prismaClients > 0);
      held.resolve();
      await saved.promise;
      await body;
      await host!.stop();
      assert.equal(await f.native.db().collection('pilotSessions').countDocuments(), 1);
      assert.equal(persistenceStatus(f.owner).pools, 0);
      assert.equal(persistenceStatus(f.owner).prismaClients, 0);
    });

  it('does not disguise a failed session write as a clean durable save or leak the owner', async () => {
    sinon.stub(MongoStore.prototype, 'set').callsFake((_sid, _value, callback) => {
      queueMicrotask(() => callback?.(new Error('secret-session-error')));
    });
    const url = await start();
    const response = await fetch(url + '/__test/save')
      .then(async res => ({ status: res.status, body: await res.text() }))
      .catch(() => undefined);
    // express-session may already have emitted headers/body before its callback.
    // A transport close is permitted; it must never emit the raw store error.
    assert.equal(response, undefined, 'A failed session save must interrupt the successful response');
    await host!.stop();
    assert.equal(await f.native.db().collection('pilotSessions').countDocuments(), 0);
    assert.equal(persistenceStatus(f.owner).pools, 0);
  });

  it('owns late Passport session deserialization after client abort until the repository read settles', async () => {
    const url = await start();
    const login = await fetch(url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    await login.json();
    const entered = deferred(),
      held = deferred();
    release = held.resolve;
    const read = f.identity.session.bind(f.identity);
    sinon.stub(f.identity, 'session').callsFake(async id => {
      entered.resolve();
      await held.promise;
      return read(id);
    });
    const client = get(url + '/__test/actor', { headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] } });
    const closed = new Promise<void>(resolve => client.on('error', () => resolve()));
    await entered.promise;
    client.destroy();
    await closed;
    await assert.rejects(host!.stop({ deadlineMs: 30 }), /deadline/);
    assert(persistenceStatus(f.owner).prismaClients > 0);
    held.resolve();
    await host!.stop();
    assert.equal(persistenceStatus(f.owner).prismaClients, 0);
  });
});
