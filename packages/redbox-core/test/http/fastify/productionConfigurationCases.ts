import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createHmac } from 'node:crypto';
import { mongoSessionDatabase } from '../../../src/persistence/runtime';
import { fixture, target, cookie } from './pilotMongoFixture';
import { nativeSessionNamespace } from '../../../src/http/fastify/session';

async function availablePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  return address.port;
}
export function productionConfigurationCases() {
  for (const trustProxy of [true, 1, ['loopback'], false, 0, ['10.0.0.0/8']])
    it(
      'production proxy trust ' + JSON.stringify(trustProxy) + ' controls secure sessions on both stacks',
      async () => {
        for (const native of [false, true]) {
          const f = await fixture(native, { server: { trustProxy }, session: { cookie: { secure: true } } });
          try {
            for (const protocol of ['https', 'http']) {
              const response = await fetch(f.url + '/csrfToken', { headers: { 'X-Forwarded-Proto': protocol } });
              assert.equal(response.status, 200);
              const trusted =
                trustProxy === true || trustProxy === 1 || (Array.isArray(trustProxy) && trustProxy[0] === 'loopback');
              assert.equal(
                !!response.headers.get('set-cookie'),
                trusted && protocol === 'https',
                JSON.stringify({ native, trustProxy, protocol })
              );
              await response.text();
            }
          } finally {
            await f.close();
          }
        }
      }
    );
  it('production listener, root, origin, session/cookie and local-auth settings take effect on both stacks', async () => {
    for (const native of [false, true]) {
      const port = await availablePort();
      const secret = 'nondefault-production-session-secret-00000000001';
      const f = await fixture(native, {
        server: {
          port,
          hostname: '127.0.0.1',
          rootContext: '/configured',
          publicUrl: 'https://configured.example.invalid/base',
          trustProxy: 1,
        },
        session: {
          name: 'configured.sid',
          secret,
          collection: 'configuredSessions',
          cookie: {
            secure: true,
            httpOnly: false,
            sameSite: 'strict',
            path: '/configured',
            domain: '.example.invalid',
            maxAge: 123456,
          },
        },
        auth: {
          defaultBrand: 'default',
          defaultPortal: 'research',
          loginPath: 'custom-login',
          postLogoutRedir: '/configured/signed-out',
          logoutOrigins: ['https://logout.example.invalid'],
        },
        portals: ['research'],
        providerConfiguration: { active: ['local'], local: { usernameField: 'email', passwordField: 'credential' } },
      });
      try {
        assert.equal(f.host.address()!.port, port);
        assert.equal(f.host.address()!.address, '127.0.0.1');
        assert(f.url.endsWith('/configured'));
        const forwarded = { 'X-Forwarded-Proto': 'https' };
        const response = await fetch(f.url + '/csrfToken', { headers: forwarded });
        const setCookie = response.headers.get('set-cookie')!;
        assert(setCookie.startsWith('configured.sid='));
        for (const fragment of ['Secure', 'SameSite=Strict', 'Path=/configured', 'Domain=.example.invalid', 'Expires='])
          assert(setCookie.includes(fragment), setCookie);
        assert(!setCookie.includes('HttpOnly'));
        const expiry = new Date(/Expires=([^;]+)/.exec(setCookie)![1]).getTime();
        assert(Math.abs(expiry - Date.now() - 123456) < 2000);
        const signed = decodeURIComponent(cookie(response).split('=').slice(1).join('='));
        const signingSecret = native
          ? createHmac('sha256', secret).update(nativeSessionNamespace).digest('base64url')
          : secret;
        assert(require('cookie-signature').unsign(signed.slice(2), signingSecret));
        const token = (await response.json())._csrf;
        const login = await fetch(f.url + '/user/login_local', {
          method: 'POST',
          redirect: 'manual',
          headers: {
            ...forwarded,
            Cookie: cookie(response),
            'X-CSRF-Token': token,
            'X-Source': 'jsclient',
            'Content-Type': 'application/json',
            Origin: 'https://configured.example.invalid',
          },
          body: JSON.stringify({ email: 'pilot-admin', credential: 'pilot-password' }),
        });
        assert.equal(login.status, 200, await login.clone().text());
        const authenticatedCookie = cookie(login);
        await login.text();
        const documents = await f.native.db().collection('configuredSessions').find().toArray();
        assert.equal(documents.length, 1);
        const saved = JSON.parse(documents[0].session);
        assert.equal(saved.branding, 'default');
        assert.equal(saved.portal, 'research');
        assert.equal(saved.passport.user, f.user.id);
        const freshToken = await fetch(f.url + '/csrfToken', {
          headers: { ...forwarded, Cookie: authenticatedCookie },
        });
        const authToken = (await freshToken.json())._csrf;
        const headers = {
          ...forwarded,
          Cookie: cookie(freshToken, authenticatedCookie),
          'X-CSRF-Token': authToken,
          'Content-Type': 'application/json',
        };
        const path = target.replace('/rdmp/', '/research/');
        const read = await fetch(f.url + path, { headers });
        assert.equal(read.status, 200, await read.clone().text());
        const tag = read.headers.get('etag')!;
        await read.text();
        const wrongPortal = await fetch(f.url + target, { headers });
        assert.equal(wrongPortal.status, 404);
        await wrongPortal.text();
        for (const [origin, status] of [
          ['https://portal.example.invalid', 403],
          ['https://configured.example.invalid', 200],
        ] as const) {
          const write = await fetch(f.url + path, {
            method: 'PUT',
            headers: { ...headers, Origin: origin, 'If-Match': tag },
            body: JSON.stringify({ title: 'Configured origin' }),
          });
          assert.equal(write.status, status, await write.clone().text());
          await write.text();
        }
        const logout = await fetch(f.url + '/default/research/user/logout', {
          method: 'POST',
          redirect: 'manual',
          headers,
        });
        assert.equal(logout.status, 302, await logout.clone().text());
        assert.equal(logout.headers.get('location'), '/configured/signed-out');
        assert(logout.headers.get('set-cookie')!.includes('Path=/configured'));
        assert(logout.headers.get('set-cookie')!.includes('Domain=.example.invalid'));
        await logout.text();
      } finally {
        await f.close();
      }
    }
  });
  it('production defaultBrand selects login context rather than a hardcoded brand on both stacks', async () => {
    for (const native of [false, true]) {
      const f = await fixture(native, { auth: { defaultBrand: 'other' } });
      try {
        const role = await f.identities.create('role', { name: 'OtherAdmin', branding: f.otherBrand.id });
        await f.identities.update('user', { id: f.user.id }, { roles: [f.role.id, role.id] });
        const response = await fetch(f.url + '/csrfToken');
        const csrf = (await response.json())._csrf;
        const login = await fetch(f.url + '/user/login_local', {
          method: 'POST',
          redirect: 'manual',
          headers: {
            Cookie: cookie(response),
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
            'X-Source': 'jsclient',
          },
          body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
        });
        assert.equal(login.status, 200, await login.clone().text());
        assert.equal((await login.json()).url, '/portal/other/rdmp/home');
        const documents = await f.native.db().collection('pilotSessions').find().toArray();
        assert.equal(documents.length, 1);
        assert.equal(JSON.parse(documents[0].session).branding, 'other');
      } finally {
        await f.close();
      }
    }
  });
  for (const origin of ['https://logout.example.invalid', 'https://refused.example.invalid'])
    it('production logoutOrigins ' + origin + ' governs provider redirects on both stacks', async () => {
      for (const native of [false, true]) {
        const f = await fixture(native, {
          auth: { logoutOrigins: ['https://logout.example.invalid'], postLogoutRedir: '/configured/signed-out' },
        });
        try {
          const response = await fetch(f.url + '/csrfToken');
          const csrf = (await response.json())._csrf;
          const login = await fetch(f.url + '/user/login_local', {
            method: 'POST',
            headers: {
              Cookie: cookie(response),
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrf,
              'X-Source': 'jsclient',
            },
            body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
          });
          assert.equal(login.status, 200, await login.clone().text());
          await login.text();
          await f.identities.update('user', { id: f.user.id }, { type: 'oidc' });
          const sessions = f.native.db().collection('pilotSessions');
          const saved = await sessions.findOne();
          assert(saved);
          const session = JSON.parse(saved.session);
          session.logoutUrl = origin + '/signout';
          await sessions.updateOne({ _id: saved._id }, { $set: { session: JSON.stringify(session) } });
          const next = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie(login) } });
          const token = (await next.json())._csrf;
          const logout = await fetch(f.url + '/default/rdmp/user/logout', {
            method: 'POST',
            redirect: 'manual',
            headers: { Cookie: cookie(next, cookie(login)), 'X-CSRF-Token': token },
          });
          assert.equal(logout.status, 302, await logout.clone().text());
          assert.equal(
            logout.headers.get('location'),
            origin === 'https://logout.example.invalid' ? origin + '/signout' : '/configured/signed-out'
          );
          await logout.text();
        } finally {
          await f.close();
        }
      }
    });
  it('production session database/options, TTL and touchAfter select the owned store on both stacks', async () => {
    for (const native of [false, true]) {
      const configuration = {
        adapter: 'mongo' as const,
        mongoUrl: '',
        dbName: 'fm019_round2_session_config',
        collection: 'configuredTtl',
        secret: 'configured-ttl-session-secret-00000000000000001',
        ttl: 321,
        touchAfter: 60,
        mongoOptions: { serverSelectionTimeoutMS: 3210 },
        cookie: { secure: false },
      };
      const f = await fixture(native, { session: configuration });
      const db = await mongoSessionDatabase(f.owner, {
        ...configuration,
        mongoUrl: process.env.HTTP_PILOT_TEST_MONGO_URL!,
      });
      try {
        assert.equal(db.databaseName, configuration.dbName);
        assert.equal(db.client.options.serverSelectionTimeoutMS, 3210);
        const response = await fetch(f.url + '/csrfToken');
        assert.equal(response.status, 200);
        await response.text();
        const saved = await db.collection(configuration.collection).findOne();
        assert(saved);
        assert(Math.abs(saved.expires.getTime() - Date.now() - 321000) < 3000);
        const next = await fetch(f.url + target, {
          headers: { Cookie: cookie(response), Authorization: 'Bearer pilot-api-token' },
        });
        assert.equal(next.status, 200);
        await next.text();
        const touched = await db.collection(configuration.collection).findOne();
        assert(touched);
        const third = await fetch(f.url + target, {
          headers: { Cookie: cookie(next, cookie(response)), Authorization: 'Bearer pilot-api-token' },
        });
        await third.text();
        const throttled = await db.collection(configuration.collection).findOne();
        assert.equal(
          throttled!.expires.getTime(),
          touched.expires.getTime(),
          'touchAfter suppresses repeated unchanged session touches'
        );
      } finally {
        await db.dropDatabase();
        await f.close();
      }
    }
  });
  it('production loginPath and explicit portal selection affect policy redirects on both stacks', async () => {
    for (const native of [false, true]) {
      const f = await fixture(native, {
        auth: { loginPath: 'configured-login', defaultPortal: 'research' },
        portals: ['rdmp'],
        policyConfiguration: { '*': ['brandingAndPortal', 'checkAuth'] },
      });
      try {
        const response = await fetch(f.url + target, { redirect: 'manual' });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/portal/default/rdmp/configured-login');
        await response.text();
      } finally {
        await f.close();
      }
    }
  });
  it('production stopDeadlineMs bounds retained shutdown work on both stacks', async () => {
    for (const native of [false, true]) {
      const f = await fixture(native, { server: { stopDeadlineMs: 35 } });
      const pending = Promise.withResolvers<void>();
      const stop = f.application.stop.bind(f.application);
      f.application.stop = async options => {
        await pending.promise;
        await stop(options);
      };
      try {
        const started = Date.now();
        await assert.rejects(f.host.stop(), /deadline/);
        assert(Date.now() - started < 1000);
      } finally {
        pending.resolve();
        f.application.stop = stop;
        await f.host.stop({ deadlineMs: 30000 });
        await f.close();
      }
    }
  });
}
