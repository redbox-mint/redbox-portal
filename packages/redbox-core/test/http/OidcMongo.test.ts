import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { authenticationFixture, responseCookie } from './authenticationFixture';
import type { AuthBrandConfig } from '../../src/authentication/Accounts';

/** Runs the repository's pinned Keycloak realm; no fake authorization/token endpoint. */
describe('owned OIDC with real Keycloak and Mongo sessions', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof authenticationFixture>>;
  before(async () => {
    assert(process.env.OIDC_TEST_ISSUER, 'OIDC_TEST_ISSUER is required, never skipped');
    const realm = JSON.parse(
      await readFile(path.resolve('../../support/integration-testing/keycloakdb/import/redbox-realm.json'), 'utf8')
    );
    const client = realm.clients.find((item: { clientId: string }) => item.clientId === 'redbox');
    const config: AuthBrandConfig = {
      active: ['local', 'oidc'],
      oidc: {
        discoverAttemptsMax: 1,
        userInfoSource: 'tokenset_claims',
        opts: {
          issuer: process.env.OIDC_TEST_ISSUER,
          client: {
            client_id: 'redbox',
            client_secret: client.secret,
            redirect_uris: ['http://localhost:1500/user/login_oidc'],
          },
          params: { scope: 'openid profile email' },
        },
        claimMappings: { username: 'preferred_username', email: 'email', name: 'name' },
      } as AuthBrandConfig['oidc'],
    };
    f = await authenticationFixture({ rootContext: '', port: 1500, config });
  });
  after(async () => {
    await f?.close();
  });
  async function authorization(username = 'test-exception') {
    const begin = await fetch(f.url + '/user/begin_oidc', { redirect: 'manual' });
    assert.equal(begin.status, 302);
    const url = begin.headers.get('location')!;
    const cookie = responseCookie(begin);
    const params = new URL(url).searchParams;
    assert(params.get('state'));
    assert(params.get('code_challenge'));
    assert.equal(params.get('code_challenge_method'), 'S256');
    const page = await fetch(url, { redirect: 'manual' });
    assert.equal(page.status, 200);
    const cookies = page.headers
      .getSetCookie()
      .map(value => value.split(';')[0])
      .join('; ');
    const dom = new JSDOM(await page.text());
    const action = dom.window.document.querySelector('form')?.getAttribute('action');
    dom.window.close();
    assert(action);
    const login = await fetch(action, {
      method: 'POST',
      redirect: 'manual',
      headers: { Cookie: cookies, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password: 'password', credentialId: '' }),
    });
    assert.equal(login.status, 302);
    const callback = new URL(login.headers.get('location')!);
    callback.hostname = '127.0.0.1';
    return { cookie, callback };
  }
  it('performs PKCE/state login, provisions allowed accounts, rotates sessions, records audit and rejects replay', async () => {
    const first = await authorization();
    const begin2 = await fetch(f.url + '/user/begin_oidc', { redirect: 'manual' });
    assert.notEqual(
      new URL(begin2.headers.get('location')!).searchParams.get('state'),
      first.callback.searchParams.get('state')
    );
    const success = await fetch(first.callback, { redirect: 'manual', headers: { Cookie: first.cookie } });
    assert.equal(success.status, 302);
    assert.equal(success.headers.get('location'), '/default/rdmp/home');
    const cookie = responseCookie(success);
    assert.notEqual(cookie, first.cookie);
    const info = await fetch(f.url + '/user/info', { headers: { Cookie: cookie } });
    assert.equal(info.status, 200);
    const data = (await info.json()) as { user: { username: string; roles: { id: string }[] } };
    assert.equal(data.user.username, 'test-exception');
    assert.deepEqual(
      data.user.roles.map(role => role.id),
      [f.reader.id]
    );
    assert(!JSON.stringify(data).includes('access_token'));
    assert.equal((await f.identities.list('useraudit', { action: 'login' })).length, 1);
    const replay = await fetch(first.callback, { redirect: 'manual', headers: { Cookie: cookie } });
    assert.equal(replay.status, 403);
  });
  it('refuses wrong state, another session, provider-denied email and disabled accounts', async () => {
    const wrong = await authorization();
    wrong.callback.searchParams.set('state', 'wrong-state');
    assert.equal((await fetch(wrong.callback, { redirect: 'manual', headers: { Cookie: wrong.cookie } })).status, 403);
    const noSession = await authorization();
    assert.equal((await fetch(noSession.callback, { redirect: 'manual' })).status, 400);
    const external = await authorization('test-external');
    assert.equal(
      (await fetch(external.callback, { redirect: 'manual', headers: { Cookie: external.cookie } })).status,
      403
    );
    assert.equal(await f.identities.one('user', { username: 'test-external' }), null);
    await f.identities.update('user', { username: 'test-exception' }, { loginDisabled: true });
    const disabled = await authorization();
    assert.equal(
      (await fetch(disabled.callback, { redirect: 'manual', headers: { Cookie: disabled.cookie } })).status,
      403
    );
  });
  it('runs the four existing allowed-provider Bruno protocol requests against this host', async () => {
    await f.identities.update('user', { username: 'test-exception' }, { loginDisabled: false });
    const collection = path.resolve('../../test/bruno');
    const folder = '6 - OpenID Connect Allowed/';
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        path.join(collection, 'node_modules/@usebruno/cli/bin/bru.js'),
        'run',
        ...[
          'Begin OIDC login for allowed user.bru',
          'Keycloak login page for allowed user.bru',
          'Keycloak login action for allowed user.bru',
          'RedBox OIDC return login for allowed user.bru',
        ].map(file => folder + file),
        '--env',
        'int-test',
        '--env-var',
        'host=http://localhost:1500',
        '--reporter-skip-all-headers',
      ],
      { cwd: collection, timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    console.log(stdout.split('\n').slice(-23).join('\n'));
  });
});
