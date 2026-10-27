import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { authenticationFixture, responseCookie } from './authenticationFixture';

/** Focused library probe plus real browser-contract/session/policy execution. */
describe('synchronizer CSRF on standalone Mongo HTTP', function () {
  this.timeout(30000);
  let f: Awaited<ReturnType<typeof authenticationFixture>>;
  beforeEach(async () => {
    f = await authenticationFixture({ protectCsrf: true });
  });
  afterEach(async () => {
    await f?.close();
  });
  async function token(cookie = '') {
    const res = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control')!, /no-store/);
    const body = (await res.json()) as { _csrf: string };
    assert.match(body._csrf, /^[a-f0-9]{64}$/);
    return { token: body._csrf, cookie: responseCookie(res) || cookie };
  }
  function post(path: string, cookie: string, csrf?: string, extra: Record<string, string> = {}, body: unknown = {}) {
    return fetch(f.url + path, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    });
  }
  async function login() {
    const before = await token();
    const res = await post(
      '/user/login_local',
      before.cookie,
      before.token,
      { 'x-source': 'jsclient' },
      { username: 'pilot-admin', password: 'pilot-password' }
    );
    assert.equal(res.status, 200);
    await res.json();
    const cookie = responseCookie(res);
    return { before, ...(await token(cookie)) };
  }
  it('retains the Angular endpoint/header contract and binds tokens to the session', async () => {
    const first = await token(),
      second = await token();
    assert.notEqual(first.token, second.token);
    const credentials = { username: 'pilot-admin', password: 'pilot-password' };
    for (const [cookie, value] of [
      [first.cookie, undefined],
      [first.cookie, 'invalid'],
      [second.cookie, first.token],
      ['', first.token],
    ]) {
      const res = await post('/user/login_local', cookie!, value, {}, credentials);
      assert.equal(res.status, 403);
    }
    assert.equal((await token(first.cookie)).token, first.token);
    const success = await post('/user/login_local', first.cookie, first.token, { 'x-source': 'jsclient' }, credentials);
    assert.equal(success.status, 200);
    assert.notEqual(responseCookie(success), first.cookie);
    const after = await token(responseCookie(success));
    assert.notEqual(after.token, first.token);
    assert.equal((await post('/default/rdmp/__test/protected', after.cookie, first.token)).status, 403);
    assert.equal((await post('/default/rdmp/__test/protected', after.cookie, after.token)).status, 200);
  });
  it('protects logout and rejects stale cookies/tokens after invalidation', async () => {
    const current = await login();
    assert.equal((await post('/default/rdmp/user/logout', current.cookie)).status, 403);
    assert.equal((await post('/default/rdmp/user/logout', current.cookie, 'invalid')).status, 403);
    assert.equal((await post('/default/rdmp/user/logout', current.cookie, current.token)).status, 302);
    assert.equal((await post('/default/rdmp/__test/protected', current.cookie, current.token)).status, 401);
  });
  it('denies cross-origin token acquisition and writes even with a valid token or forged forwarded authority', async () => {
    const current = await login();
    const deniedOrigins: Record<string, string>[] = [
      { Origin: 'https://evil.invalid' },
      { Origin: 'null' },
      { 'Sec-Fetch-Site': 'cross-site' },
      { 'Sec-Fetch-Site': 'same-site' },
    ];
    for (const headers of deniedOrigins) {
      assert.equal((await fetch(f.url + '/csrfToken', { headers })).status, 403);
      assert.equal((await post('/default/rdmp/__test/protected', current.cookie, current.token, headers)).status, 403);
    }
    assert.equal(
      (
        await post('/default/rdmp/__test/protected', current.cookie, current.token, {
          Origin: 'https://evil.invalid',
          'X-Forwarded-Host': 'evil.invalid',
          'X-Forwarded-Proto': 'https',
        })
      ).status,
      403
    );
    const origin = new URL(f.url).origin;
    assert.equal(
      (await post('/default/rdmp/__test/protected', current.cookie, current.token, { Origin: origin })).status,
      200
    );
  });
  it('never turns a token into tenant/role/schema permission and uses only verified API exemptions', async () => {
    const current = await login();
    assert.equal((await post('/other/rdmp/__test/protected', current.cookie, current.token)).status, 403);
    await f.identities.replaceMemberships('user', f.user.id, [f.reader.id]);
    assert.equal((await post('/default/rdmp/api/__test/protected', current.cookie, current.token)).status, 403);
    const schemaDenied = await post('/default/rdmp/__test/schema', current.cookie, current.token);
    assert.equal(schemaDenied.status, 403);
    assert.match(schemaDenied.headers.get('content-type')!, /application\/problem\+json/);
    // Browser/schema routes remain protected even when a valid API credential is present.
    assert.equal(
      (
        await post('/default/rdmp/__test/schema', current.cookie, undefined, {
          Authorization: 'Bearer pilot-api-token',
        })
      ).status,
      403
    );
    await f.identities.replaceMemberships('user', f.user.id, [f.role.id]);
    assert.equal(
      (await post('/default/rdmp/api/__test/protected', '', undefined, { Authorization: 'Bearer pilot-api-token' }))
        .status,
      200
    );
    assert.equal(
      (await post('/default/rdmp/api/__test/protected', current.cookie, undefined, { Authorization: 'Bearer forged' }))
        .status,
      401
    );
    assert.equal(
      (
        await post('/default/rdmp/__test/protected', current.cookie, undefined, {
          Authorization: 'Bearer pilot-api-token',
        })
      ).status,
      403
    );
  });
  it('accepts form tokens, rejects ambiguous token fields and does not exempt malformed provider assertions', async () => {
    const current = await login();
    const url = f.url + '/default/rdmp/__test/protected';
    const res = await fetch(url, {
      method: 'POST',
      headers: { Cookie: current.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: current.token }),
    });
    assert.equal(res.status, 200);
    assert.equal((await post('/default/rdmp/__test/protected?_csrf=' + current.token, current.cookie)).status, 403);
    assert.equal(
      (await post('/default/rdmp/__test/protected', current.cookie, undefined, {}, { _csrf: [current.token] })).status,
      403
    );
    assert.equal(
      (await post('/default/rdmp/__test/protected', current.cookie, 'bad', {}, { _csrf: current.token })).status,
      403
    );
    assert.equal((await post('/user/login_aaf', '', undefined, {}, { assertion: 'invalid' })).status, 403);
    assert.equal((await post('/user/login_aaf', '', undefined, {}, { assertion: ['invalid'] })).status, 400);
  });
  it('runs the repeatable Bruno session/token/login/write/logout contract without skips', async () => {
    const collection = path.resolve('test/http/fixtures/bruno-security');
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        path.resolve('../../test/bruno/node_modules/@usebruno/cli/bin/bru.js'),
        'run',
        '--env-var',
        'host=' + f.url,
        '--reporter-skip-all-headers',
      ],
      { cwd: collection, timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    console.log(stdout.split('\n').slice(-22).join('\n'));
    assert.equal(await f.native.db().collection('csrfProbeWrites').countDocuments(), 1);
  });
});
