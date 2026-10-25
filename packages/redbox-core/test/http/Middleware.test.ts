import assert from 'node:assert/strict';
import session from 'express-session';
import { gzipSync } from 'node:zlib';
import sinon from 'sinon';
import { of, EMPTY, throwError, concat, from } from 'rxjs';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../src/application';
import {
  ExpressHost,
  HttpIdentity,
  prepareHttpMiddleware,
  httpErrorHandler,
  httpAction,
  singleHttpResult,
} from '../../src/http/express';
import { currentRequestChronicle } from '../../src/utilities/RequestChronicleContext';

describe('per-application HTTP middleware and completion', function () {
  this.timeout(10_000);
  const hosts: ExpressHost[] = [];
  afterEach(async () => {
    for (const host of hosts.splice(0)) await host.stop();
    sinon.restore();
  });

  async function fixture(options: { trustProxy?: boolean; secureCookie?: boolean } = {}) {
    const owner = { config: {}, log: { warn() {} } };
    const application = new ApplicationRuntime(owner);
    const identity = new HttpIdentity({
      one: sinon.stub().resolves(null),
      verifyPassword: sinon.stub().resolves(false),
      findByApiTokenHash: sinon.stub().resolves(null),
    });
    sinon
      .stub(identity, 'local')
      .callsFake(async (username, password) => (password === 'valid' ? { id: username, username, roles: [] } : false));
    const store = new session.MemoryStore();
    const get = sinon.spy(store, 'get');
    const set = sinon.spy(store, 'set');
    const info = sinon.spy();
    const log = { ...nothingLogger, info, warn: info, error: info };
    const host = new ExpressHost(application, {
      owner,
      hostname: '127.0.0.1',
      port: 0,
      trustProxy: options.trustProxy,
      prepare: async router => {
        const auth = await prepareHttpMiddleware(router, {
          owner,
          identity,
          session: {
            name: 'redbox.v6.sid',
            secret: 'synthetic-secret-at-least-32-chars-long',
            cookie: { secure: options.secureCookie ?? false },
            store,
          },
          log,
          logSettings: { successSampleRate: 1, successSampleExcludePattern: '' },
        });
        router.post('/login', auth.local, (_req, res) => res.json({ success: true }));
        router.get(
          '/actor',
          httpAction(async (req, res) => {
            res.json(await auth.authenticate(req));
          })
        );
        router.post(
          '/parse',
          httpAction(async (req, res) => {
            const chronicle = currentRequestChronicle();
            assert(chronicle);
            await Promise.resolve();
            assert.equal(currentRequestChronicle(), chronicle);
            const body = await singleHttpResult(from(Promise.resolve(req.body)));
            assert.equal(currentRequestChronicle(), chronicle);
            res.json(body);
          })
        );
        router.get(
          '/failure',
          httpAction(async () => {
            await singleHttpResult(throwError(() => Error('secret-test-error')));
          })
        );
        router.get(
          '/after-headers',
          httpAction(async (_req, res) => {
            res.write('partial');
            throw Error('secret-after-headers');
          })
        );
        router.use(httpErrorHandler(log));
      },
    });
    hosts.push(host);
    await host.initialize();
    await host.activate();
    return { host, get, set, info, url: 'http://127.0.0.1:' + host.address()!.port };
  }
  it('loads/parses/logs once and keeps Passport, cookies and request contexts isolated between applications', async () => {
    const a = await fixture(),
      b = await fixture();
    const login = await fetch(a.url + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'valid' }),
    });
    assert.equal(login.status, 200);
    await login.json();
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    // Passport saves the rotated authenticated session, then express-session
    // persists the response's session. Store reads still occur once per request.
    assert.equal(a.set.callCount, 2);
    a.info.resetHistory();
    a.get.resetHistory();
    const response = await fetch(a.url + '/parse', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'once' }),
    });
    assert.deepEqual(await response.json(), { name: 'once' });
    assert.equal(a.get.callCount, 1);
    assert.equal(a.info.callCount, 1);
    assert.equal(await (await fetch(b.url + '/actor', { headers: { Cookie: cookie } })).json(), false);
    assert.equal(b.get.callCount, 1);
    assert.equal(b.set.callCount, 0);
  });

  it('maps malformed parser and async failures once and closes errors after headers', async () => {
    const f = await fixture();
    const malformed = await fetch(f.url + '/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"secret-test"',
    });
    assert.equal(malformed.status, 400);
    assert(!JSON.stringify(await malformed.json()).includes('secret-test'));
    const failure = await fetch(f.url + '/failure');
    assert.equal(failure.status, 500);
    assert(!JSON.stringify(await failure.json()).includes('secret-test'));
    await assert.rejects(fetch(f.url + '/after-headers').then(response => response.text()));
  });

  it('returns client errors for unsupported and malformed encoded parser bodies without leaking payloads', async () => {
    const f = await fixture();
    for (const contentType of ['application/json', 'application/x-www-form-urlencoded']) {
      const cases: Array<{ headers: Record<string, string>; body: RequestInit['body']; status: number }> = [
        { headers: { 'Content-Type': contentType + '; charset=not-a-charset' }, body: 'secret-test-body', status: 415 },
        {
          headers: { 'Content-Type': contentType, 'Content-Encoding': 'unknown' },
          body: 'secret-test-body',
          status: 415,
        },
        { headers: { 'Content-Type': contentType, 'Content-Encoding': 'gzip' }, body: 'secret-test-body', status: 400 },
        {
          headers: { 'Content-Type': contentType, 'Content-Encoding': 'gzip' },
          body: new Uint8Array(gzipSync('secret-test'.repeat(110000))),
          status: 413,
        },
      ];
      for (const test of cases) {
        const response = await fetch(f.url + '/parse', { method: 'POST', ...test });
        assert.equal(response.status, test.status, JSON.stringify(test.headers));
        assert(!JSON.stringify(await response.json()).includes('secret-test'));
      }
    }
    const deep = await fetch(f.url + '/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'field' + '[nested]'.repeat(34) + '=secret-test-body',
    });
    assert.equal(deep.status, 400);
    assert(!JSON.stringify(await deep.json()).includes('secret-test'));
    assert.equal(
      (
        await fetch(f.url + '/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      200
    );
  });

  it('requires a completed single Observable result instead of taking the first emission', async () => {
    assert.equal(await singleHttpResult(of('one')), 'one');
    await assert.rejects(singleHttpResult(EMPTY));
    await assert.rejects(singleHttpResult(of('first', 'second')));
    await assert.rejects(
      singleHttpResult(
        concat(
          of('first'),
          throwError(() => Error('late'))
        )
      ),
      /late/
    );
  });

  it('accepts forwarded HTTPS for secure cookies only with explicit proxy trust', async () => {
    for (const trustProxy of [false, true]) {
      const f = await fixture({ trustProxy, secureCookie: true });
      const login = await fetch(f.url + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
        body: JSON.stringify({ username: 'alice', password: 'valid' }),
      });
      assert.equal(login.status, 200);
      await login.json();
      const cookie = login.headers.get('set-cookie');
      if (trustProxy) assert.match(cookie!, /; HttpOnly; Secure; SameSite=Lax/);
      else assert.equal(cookie, null);
    }
  });
});
