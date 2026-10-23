import assert from 'node:assert/strict';
import { request } from 'node:http';
import { persistenceStatus } from '../../src/persistence/runtime';
import { createHmac } from 'node:crypto';
import { authenticationFixture, localLogin, responseCookie, aafSecret } from './authenticationFixture';

function assertion(payload: object, secret = aafSecret): string {
  const encoded = [
    { alg: 'HS256', typ: 'JWT' },
    { iss: 'https://rapid.aaf.edu.au', exp: Math.floor(Date.now() / 1000) + 60, ...payload },
  ]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return encoded + '.' + createHmac('sha256', secret).update(encoded).digest('base64url');
}
describe('owned local/AAF authentication and Mongo session migration', function () {
  this.timeout(30000);
  let f: Awaited<ReturnType<typeof authenticationFixture>>;
  afterEach(async () => {
    await f?.close();
  });
  it('rotates anonymous sessions, returns safe users, persists audits, refreshes roles and invalidates logout', async () => {
    f = await authenticationFixture();
    const anonymous = await fetch(f.url + '/__test/session');
    const cookie = responseCookie(anonymous);
    const id = ((await anonymous.json()) as { id: string }).id;
    await f.native.db().collection('resumableUploadFixture').insertOne({ owner: f.user.id, offset: 1024 });
    const login = await localLogin(f.url, cookie);
    assert.equal(login.status, 200);
    const data = (await login.json()) as {
      user: { id: string; roles: { branding: string }[] };
      url: string;
      message: string;
    };
    assert.equal(data.user.id, f.user.id);
    assert.equal(data.user.roles[0].branding, f.brand.id);
    assert.equal(data.message, 'Login OK');
    assert.equal(data.url, '/portal/default/rdmp/home');
    assert(!JSON.stringify(data).includes('password'));
    assert(!JSON.stringify(data).includes('token'));
    const rotated = responseCookie(login);
    assert(rotated);
    assert.notEqual(rotated, cookie);
    assert.equal(await f.native.db().collection<{ _id: string }>('authSessions').countDocuments({ _id: id }), 0);
    assert.equal((await f.identities.list('useraudit', { action: 'login' })).length, 1);
    assert.equal((await f.identities.one('user', { id: f.user.id }))?.lastLogin != null, true);
    assert.equal((await fetch(f.url + '/user/info', { headers: { Cookie: cookie } })).status, 403);
    await f.identities.replaceMemberships('user', f.user.id, [f.reader.id]);
    const info = (await (await fetch(f.url + '/user/info', { headers: { Cookie: rotated } })).json()) as {
      user: { roles: { id: string }[] };
    };
    assert.deepEqual(
      info.user.roles.map(r => r.id),
      [f.reader.id]
    );
    assert.equal((await fetch(f.url + '/other/rdmp/user/info', { headers: { Cookie: rotated } })).status, 403);
    assert.equal((await fetch(f.url + '/default/rdmp/user/logout', { headers: { Cookie: rotated } })).status, 405);
    const logout = await fetch(f.url + '/default/rdmp/user/logout', {
      method: 'POST',
      redirect: 'manual',
      headers: { Cookie: rotated },
    });
    assert.equal(logout.status, 302);
    assert(responseCookie(logout).includes('redbox.v6.sid='));
    assert.equal((await fetch(f.url + '/user/info', { headers: { Cookie: rotated } })).status, 403);
    assert.equal((await f.identities.list('useraudit', { action: 'logout' })).length, 1);
    assert.equal(
      await f.native.db().collection('resumableUploadFixture').countDocuments({ owner: f.user.id, offset: 1024 }),
      1
    );
  });
  it('rejects invalid credentials, nonlocal accounts, malformed fields, and cross-brand login', async () => {
    f = await authenticationFixture();
    for (const body of [
      { username: 'pilot-admin', password: 'bad' },
      { username: 'missing', password: 'bad' },
    ]) {
      const res = await localLogin(f.url, '', body);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { message: 'Incorrect username/password', user: false });
    }
    for (const body of [
      { username: { $ne: '' }, password: 'x' },
      { username: ['pilot-admin'], password: 'x' },
      {},
      { username: 'x', password: 'x'.repeat(4097) },
    ])
      assert.equal((await localLogin(f.url, '', body)).status, 400);
    const wrong = await localLogin(f.url, '', {
      username: 'pilot-admin',
      password: 'pilot-password',
      branding: 'other',
    });
    assert.equal(((await wrong.json()) as { user: false }).user, false);
    assert.equal(await f.native.db().collection('authSessions').countDocuments(), 0);
    assert.equal(f.failures(), 3);
  });
  it('resolves linked accounts and refuses disabled, orphan and cyclic aliases', async () => {
    f = await authenticationFixture();
    const alias = await f.identities.create('user', {
      username: 'alias',
      name: 'Alias',
      email: 'alias@example.invalid',
      type: 'local',
      password: 'alias-password',
      linkedPrimaryUserId: f.user.id,
      accountLinkState: 'linked-alias',
    });
    const success = await localLogin(f.url, '', { username: 'alias', password: 'alias-password' });
    assert.equal(((await success.json()) as { user: { id: string } }).user.id, f.user.id);
    await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
    assert.equal(
      (
        (await (await localLogin(f.url, '', { username: 'alias', password: 'alias-password' })).json()) as {
          user: false;
        }
      ).user,
      false
    );
    await f.identities.update('user', { id: f.user.id }, { loginDisabled: false, linkedPrimaryUserId: alias.id });
    assert.equal(
      (
        (await (await localLogin(f.url, '', { username: 'alias', password: 'alias-password' })).json()) as {
          user: false;
        }
      ).user,
      false
    );
    await f.identities.remove('user', { id: f.user.id });
    assert.equal(
      (
        (await (await localLogin(f.url, '', { username: 'alias', password: 'alias-password' })).json()) as {
          user: false;
        }
      ).user,
      false
    );
  });
  it('requires login for valid signed old sessions and never deserializes their authentication payload', async () => {
    f = await authenticationFixture();
    const login = await localLogin(f.url);
    await login.json();
    const cookie = responseCookie(login);
    const stored = await f.native.db().collection('authSessions').findOne();
    assert(stored);
    const data = JSON.parse(stored.session);
    delete data.authenticationVersion;
    data.user = { id: f.user.id };
    data.grant = { secret: 'old-oauth-handshake' };
    await f.native
      .db()
      .collection('authSessions')
      .updateOne({ _id: stored._id }, { $set: { session: JSON.stringify(data) } });
    assert.equal((await fetch(f.url + '/user/info', { headers: { Cookie: cookie } })).status, 403);
    assert.equal(await f.native.db().collection('authSessions').countDocuments({ _id: stored._id }), 0);
    assert(
      !JSON.stringify(await f.native.db().collection('authSessions').find().toArray()).includes('old-oauth-handshake')
    );
  });
  it('does not publish a partly saved login when required auditing fails', async () => {
    f = await authenticationFixture({
      audit: async () => {
        throw new Error('private-audit-details');
      },
    });
    const res = await localLogin(f.url);
    assert.equal(res.status, 500);
    assert(!(await res.text()).includes('private-audit-details'));
    assert.equal(await f.native.db().collection('authSessions').countDocuments(), 0);
  });
  it('awaits login hooks and rejects authenticated identity replacement', async () => {
    let completed = false;
    f = await authenticationFixture({
      config: {
        local: {
          hooks: {
            onUpdate: { pre: [{ function: 'fixture', options: {} }], post: [{ function: 'post', options: {} }] },
          },
        },
      },
      hook: name =>
        name === 'post'
          ? async () => {
              completed = true;
            }
          : async user => ({ ...(user as object), additionalAttributes: { hook: true } }),
    });
    const res = await localLogin(f.url);
    assert.equal(res.status, 200);
    await res.json();
    assert(completed);
    assert.deepEqual((await f.identities.one('user', { id: f.user.id }))?.additionalAttributes, { hook: true });
  });
  it('verifies signed AAF assertions, email rules, provisioning, roles and disabled accounts', async () => {
    f = await authenticationFixture();
    const payload = {
      sub: 'aaf-subject',
      'https://aaf.edu.au/attributes': { mail: 'AAF@example.invalid', displayname: 'AAF Test' },
    };
    const send = (token: string) =>
      fetch(f.url + '/user/login_aaf', {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion: token }),
      });
    for (const token of [
      assertion(payload, 'wrong-secret'),
      assertion({ ...payload, exp: 1 }),
      assertion({ ...payload, iss: 'https://wrong.invalid' }),
      'malformed',
    ])
      assert.equal((await send(token)).status, 403);
    const good = await send(assertion(payload));
    assert.equal(good.status, 302);
    const user = await f.identities.one(
      'user',
      { username: Buffer.from('aaf-subject').toString('base64') },
      { populate: ['roles'] }
    );
    assert(user);
    assert.equal(user.email, 'aaf@example.invalid');
    assert.deepEqual(
      (user.roles as { id: string }[]).map(role => role.id),
      [f.reader.id]
    );
    assert.equal((await fetch(f.url + '/user/info', { headers: { Cookie: responseCookie(good) } })).status, 200);
    await f.identities.update('user', { id: user.id }, { loginDisabled: true });
    assert.equal((await send(assertion(payload))).status, 403);
    assert.equal(
      (await send(assertion({ sub: 'denied', 'https://aaf.edu.au/attributes': { mail: 'denied@other.invalid' } })))
        .status,
      403
    );
  });
  it('bounds local redirect inputs and rejects malformed provider selection', async () => {
    f = await authenticationFixture();
    for (const redir of ['https://evil.invalid', '//evil.invalid', '/outside', '/portal/\\evil.invalid']) {
      const res = await fetch(f.url + '/user/login_local?redirUrl=' + encodeURIComponent(redir), {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
      });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/portal/default/rdmp/home');
    }
    assert.equal((await fetch(f.url + '/user/begin_oidc?id[]=bad')).status, 400);
    assert.equal((await fetch(f.url + '/user/login_oidc?code=fake&state=fake', { redirect: 'manual' })).status, 400);
  });
  it('only issues secure cookies behind an explicitly trusted HTTPS proxy', async () => {
    f = await authenticationFixture({ secure: true, trustProxy: true });
    const res = await fetch(f.url + '/user/login_local', {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    assert.equal(res.status, 302);
    const cookie = res.headers.get('set-cookie')!;
    assert(cookie.includes('Secure'));
    assert(cookie.includes('HttpOnly'));
    assert(cookie.includes('SameSite=Lax'));
  });
  it('rejects hooks that mutate the authenticated identity in place', async () => {
    f = await authenticationFixture({
      config: { local: { hooks: { onUpdate: { pre: [{ function: 'replace', options: {} }] } } } },
      hook: () => async user => {
        Reflect.set(user as object, 'username', 'another-account');
        return user;
      },
    });
    const response = await localLogin(f.url);
    assert.equal(((await response.json()) as { user: false }).user, false);
    assert.equal((await f.identities.one('user', { id: f.user.id }))?.username, 'pilot-admin');
    assert.equal((await f.identities.list('useraudit')).length, 0);
  });
  it('retains accepted login audit and session writes through client abort and stop retry', async () => {
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    f = await authenticationFixture({
      audit: async () => {
        entered.resolve();
        await release.promise;
      },
    });
    const client = request(f.url + '/user/login_local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-source': 'jsclient' },
    });
    const closed = new Promise<void>(resolve => client.on('error', () => resolve()));
    client.end(JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }));
    try {
      await entered.promise;
      client.destroy();
      await closed;
      await assert.rejects(f.host.stop({ deadlineMs: 30 }), /deadline/);
      assert(persistenceStatus(f.owner).prismaClients > 0);
    } finally {
      release.resolve();
    }
    await f.host.stop();
    assert.equal(await f.native.db().collection('useraudit').countDocuments(), 1);
  });
});
