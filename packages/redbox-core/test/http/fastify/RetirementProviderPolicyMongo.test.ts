import assert from 'node:assert/strict';
import { oidcFixture } from './oidcFixture';
import { getMetaRoute } from '../../../src/api-routes/groups/records';
import { availablePort } from './authenticationFixture';
import { referenceProductionFixture } from './referenceProductionFixture';
import { settleMutationWork } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';

const family = 'retirementProviderPolicy';
const offlist = 'https://logout-not-approved.invalid/terminate';
const allowedSubject = 'allowed';
const cookie = (r: Response) => r.headers.getSetCookie()[0]?.split(';')[0] ?? '';
const fingerprint = async (r: Response, origin: string) => {
  const headers = Object.fromEntries(r.headers.entries());
  for (const k of ['date', 'connection', 'keep-alive', 'x-request-id', 'set-cookie']) delete headers[k];
  if (headers.location) headers.location = headers.location.replaceAll(origin, '<portal>');
  if (headers.expires && headers.expires !== '0') {
    const lifetime = Date.parse(headers.expires) - Date.parse(r.headers.get('date')!);
    assert(Math.abs(lifetime - 31536000000) <= 1000, 'Private cache expiry follows the one-year max-age');
    headers.expires = '<date plus one year>';
  }
  return {
    status: r.status,
    headers,
    cookies: r.headers
      .getSetCookie()
      .map(v => v.replace(/^([^=]+)=[^;]*/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')),
    text: (await r.text()).replaceAll(origin, '<portal>'),
  };
};

describe('Provider redirect allowlist through the production host', function () {
  this.timeout(120000);
  for (const boundary of ['login', 'logout', 'approved'] as const)
    it(
      boundary === 'approved'
        ? 'persists an approved provider logout endpoint and redirects logout there'
        : `refuses an off-list provider endpoint at ${boundary}`,
      async () => {
        const port = await availablePort();
        const portalOrigin = `http://127.0.0.1:${port}`;
        const provider = await oidcFixture();
        let f: Awaited<ReturnType<typeof referenceProductionFixture>> | undefined;
        try {
          const config = provider.config(port, allowedSubject);
          const oidc = Array.isArray(config.oidc) ? config.oidc[0]! : config.oidc!;
          if (boundary === 'login') oidc.opts.issuer = provider.metadata({ end_session_endpoint: offlist });
          f = await referenceProductionFixture(true, undefined, undefined, {
            declarations: [getMetaRoute],
            pages: {},
            configuration: {
              server: {
                hostname: '127.0.0.1',
                port,
                rootContext: '/portal',
                publicUrl: portalOrigin + '/portal',
                stopDeadlineMs: 30000,
              },
              brandingConfigurationDefaults: {
                auth: {
                  ...config,
                  local: {
                    default: {
                      adminUser: 'pilot-admin',
                      adminPw: 'pilot-password',
                      email: 'pilot-admin@example.invalid',
                      token: 'pilot-api-token',
                    },
                  },
                },
              },
              auth: {
                roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
                rules: [],
                logoutOrigins: [provider.issuer],
              },
            },
          });
          const begin = await fetch(f.url + '/user/begin_oidc', { redirect: 'manual' });
          assert.equal(begin.status, 302);
          const anonymous = cookie(begin);
          assert(anonymous);
          const issued = await fetch(begin.headers.get('location')!, { redirect: 'manual' });
          assert.equal(issued.status, 302);
          const callback = await fetch(issued.headers.get('location')!, {
            headers: { Cookie: anonymous },
            redirect: 'manual',
          });
          assert.equal(callback.status, 302, await callback.clone().text());
          const active = cookie(callback);
          assert(active && active !== anonymous);
          const store = f.client.db().collection('referenceSessions');
          const entries = await store.find().toArray();
          const persisted = entries.find(row => JSON.parse(row.session).passport?.user);
          assert(persisted);
          const credentials = JSON.parse(persisted.session);
          if (boundary === 'login') assert.equal(credentials.logoutUrl, undefined);
          else {
            assert.equal(typeof credentials.logoutUrl, 'string');
            assert.equal(new URL(credentials.logoutUrl).origin, provider.issuer);
            assert.equal(new URL(credentials.logoutUrl).pathname, '/logout');
            if (boundary === 'logout')
              assert.equal(
                (
                  await store.updateOne(
                    { _id: persisted._id },
                    { $set: { session: JSON.stringify({ ...credentials, logoutUrl: offlist }) } }
                  )
                ).modifiedCount,
                1
              );
            if (boundary === 'logout')
              assert.equal(JSON.parse((await store.findOne({ _id: persisted._id }))!.session).logoutUrl, offlist);
          }
          const token = await fetch(f.url + '/csrfToken', { headers: { Cookie: active } });
          assert.equal(token.status, 200);
          const csrf = (await token.json())._csrf;
          assert.match(csrf, /^[a-f0-9]{64}$/);
          const logout = await fetch(f.url + '/default/rdmp/user/logout', {
            method: 'POST',
            redirect: 'manual',
            headers: { Cookie: active, Origin: portalOrigin, 'X-CSRF-Token': csrf },
          });
          assert.equal(logout.status, 302, await logout.clone().text());
          const location = new URL(logout.headers.get('location')!, portalOrigin);
          if (boundary === 'approved') {
            assert.equal(location.href, new URL(credentials.logoutUrl).href);
            assert.equal(location.origin, provider.issuer);
            assert.equal(location.pathname, '/logout');
          } else {
            assert.equal(location.origin, portalOrigin);
            assert.equal(location.pathname, '/default/rdmp/home');
            assert.equal(location.search, '');
          }
          const info = await fetch(f.url + '/user/info', { headers: { Cookie: active } });
          assert.equal(info.status, 403);
          await settleMutationWork(f);
          const audits = (await f.client.db().collection('useraudit').find().sort({ _id: 1 }).toArray()).map(
            row => row.action
          );
          assert.deepEqual(audits, ['login', 'logout']);
          assert(!(await store.find().toArray()).some(row => JSON.parse(row.session).passport?.user));
          assert.equal(provider.calls.token, 1);
          assert.equal(provider.calls.pkce, 1);
          assert.equal(provider.calls.userinfo, 1);
          assert.equal(provider.calls.logout, 0);
          if (boundary !== 'approved')
            assertGolden(family, boundary, {
              wire: await Promise.all([callback, logout, info].map(r => fingerprint(r, portalOrigin))),
              state: {
                audits,
                authenticatedSession: false,
                savedLogoutOrigin: boundary === 'login' ? null : 'provider',
                provider: provider.calls,
              },
            });
        } finally {
          try {
            await f?.close();
          } finally {
            await provider.close();
          }
        }
      }
    );
});
goldenControls(family);
