import { assertGoldenNext, goldenControls } from './goldenContracts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { authenticationFixture, aafAssertion, availablePort, type FixtureOptions } from './authenticationFixture';
import { oidcFixture } from './oidcFixture';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { hash } from 'bcryptjs';
type Fixture = Awaited<ReturnType<typeof authenticationFixture>>;
const enabled = process.env.HTTP_PILOT_TEST_MONGO_URL;
const cookie = (response: Response) => response.headers.get('set-cookie')?.split(';')[0] ?? '';
const localBody = { username: 'pilot-admin', password: 'pilot-password' };
const aafPayload = {
  sub: 'aaf-subject',
  'https://aaf.edu.au/attributes': {
    mail: 'AAF@EXAMPLE.INVALID',
    displayname: 'AAF Fixture',
    givenname: 'AAF',
    surname: 'Test',
  },
};
const post = (url: string, body?: unknown, credential = '', extra: Record<string, string> = {}) =>
  fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: credential, ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const local = (f: Fixture, body: unknown = localBody, credential = '') =>
  post(f.url + '/user/login_local', body, credential, { 'x-source': 'jsclient' });
const aaf = (f: Fixture, token = aafAssertion(aafPayload), credential = '') =>
  post(f.url + '/user/login_aaf', { assertion: token }, credential);
const info = (f: Fixture, credential: string, path = '/user/info') =>
  fetch(f.url + path, { headers: { Cookie: credential }, redirect: 'manual' });
async function normalize(f: Fixture, value: unknown): Promise<unknown> {
  const ids = new Map<string, string>([
    [f.brand.id, 'brand:default'],
    [f.otherBrand.id, 'brand:other'],
    [f.role.id, 'role:Admin'],
    [f.reader.id, 'role:Researcher'],
  ]);
  for (const user of await f.identities.list('user')) ids.set(user.id, 'user:' + user.username);
  function visit(value: unknown): unknown {
    if (typeof value === 'string')
      return (
        ids.get(value) ??
        (/^\d{4}-\d\d-\d\dT/.test(value)
          ? '<timestamp>'
          : value
              .replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://fixture')
              .replace(/http%3A%2F%2F127\.0\.0\.1%3A\d+/g, 'http%3A%2F%2Ffixture'))
      );
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, visit(value)]));
    return value;
  }
  return visit(value);
}
async function observe(response: Response) {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* redirect/empty/plain response */
  }
  if (body && typeof body === 'object')
    assert(!JSON.stringify(body).match(/"(?:password|token|passwordHash|tokenHash)"/));
  return {
    status: response.status,
    body: response.status === 302 ? '<redirect>' : body,
    location: response.headers.get('location'),
    cache: response.headers.get('cache-control'),
    pragma: response.headers.get('pragma'),
    expires: response.headers.get('expires'),
    cookie: response.headers.getSetCookie().map(value =>
      value
        .split(';')
        .slice(1)
        .map(item => item.trim())
        .sort()
    ),
  };
}
async function effects(f: Fixture) {
  return {
    events: f.events,
    audits: (await f.identities.list('useraudit')).map(row => ({ action: row.action, user: row.user })),
    sessions: await f.native.db().collection('authSessions').countDocuments(),
  };
}
async function differential(run: (f: Fixture, native: boolean) => Promise<unknown>, options: FixtureOptions = {}) {
  const results: unknown[] = [];
  for (const native of [true]) {
    const f = await authenticationFixture(native, options);
    try {
      results.push(await normalize(f, await run(f, native)));
    } finally {
      await f.close();
    }
  }
  assertGoldenNext('authentication', results[0]);
}
(enabled ? describe : describe.skip)(
  'FM-015 retained Express/native authentication differential (real Mongo)',
  function () {
    this.timeout(45000);
    it('rotates local login, saves safe mapped profiles/audits, refreshes roles and destroys logout', async () => {
      await differential(async f => {
        const initial = await fetch(f.url + '/__test/session');
        const old = cookie(initial);
        await initial.json();
        assert(old);
        const login = await local(f, localBody, old);
        const active = cookie(login);
        assert(active);
        assert.notEqual(active, old);
        const result = [await observe(login)];
        assert.equal(result[0].status, 200);
        assert.equal((await f.identities.one('user', { id: f.user.id }))?.lastLogin != null, true);
        assert.equal(await f.native.db().collection('authSessions').countDocuments(), 1);
        result.push(await observe(await info(f, old)));
        assert.equal(result.at(-1)!.status, 403);
        await f.identities.replaceMemberships('user', f.user.id, [f.reader.id]);
        result.push(await observe(await info(f, active)));
        assert.equal(result.at(-1)!.status, 200);
        result.push(await observe(await info(f, active, '/other/rdmp/user/info')));
        assert.equal(result.at(-1)!.status, 403);
        result.push(await observe(await post(f.url + '/default/rdmp/user/logout', undefined, active)));
        assert.equal(result.at(-1)!.status, 302);
        result.push(await observe(await info(f, active)));
        assert.equal(result.at(-1)!.status, 403);
        assert.equal(await f.native.db().collection('authSessions').countDocuments(), 0);
        return { result, effects: await effects(f) };
      });
    });
    for (const [name, body, status] of [
      ['wrong password', { ...localBody, password: 'bad' }, 200],
      ['missing user', { username: 'missing', password: 'bad' }, 200],
      ['object credential', { username: { $ne: '' }, password: 'x' }, 400],
      ['array credential', { username: ['pilot-admin'], password: 'x' }, 400],
      ['empty credential', {}, 400],
      ['oversize credential', { ...localBody, password: 'x'.repeat(4097) }, 400],
      ['cross brand', { ...localBody, branding: 'other' }, 200],
      ['invalid context', { ...localBody, portal: 'missing' }, 400],
    ] as const)
      it('local denial: ' + name, async () =>
        differential(async f => {
          const result = await observe(await local(f, body));
          assert.equal(result.status, status);
          if (status === 200) assert.deepEqual(result.body, { message: 'Incorrect username/password', user: false });
          assert.equal(await f.native.db().collection('authSessions').countDocuments(), 0);
          return { result, effects: await effects(f) };
        })
      );
    for (const state of ['linked', 'disabled', 'primary-disabled', 'orphan', 'cycle', 'nonlocal'] as const)
      it('local account state: ' + state, async () =>
        differential(async f => {
          const alias = await f.identities.create('user', {
            name: 'Alias',
            email: 'alias@example.invalid',
            username: 'alias',
            type: state === 'nonlocal' ? 'oidc' : 'local',
            password: 'alias-password',
            roles: [f.reader.id],
            linkedPrimaryUserId: f.user.id,
            accountLinkState: 'linked-alias',
            loginDisabled: state === 'disabled',
          });
          if (state === 'primary-disabled')
            await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
          if (state === 'orphan') await f.identities.remove('user', { id: f.user.id });
          if (state === 'cycle')
            await f.identities.update('user', { id: f.user.id }, { linkedPrimaryUserId: alias.id });
          const result = await observe(await local(f, { username: 'alias', password: 'alias-password' }));
          const body = result.body as {
            user:
              | false
              | {
                  id: string;
                };
          };
          assert.equal(!!body.user, state === 'linked');
          if (body.user) assert.equal(body.user.id, f.user.id);
          return { result, effects: await effects(f) };
        })
      );
    it('local custom bracket fields and query fallback preserve Passport lookup', async () =>
      differential(
        async f => {
          const good = await local(f, { credentials: { login: 'pilot-admin', secret: 'pilot-password' } });
          assert.equal(good.status, 200);
          const first = await observe(good);
          assert(
            (
              first.body as {
                user: unknown;
              }
            ).user
          );
          const query = await post(
            f.url + '/user/login_local?credentials[login]=pilot-admin&credentials[secret]=pilot-password',
            {},
            '',
            { 'x-source': 'jsclient' }
          );
          const second = await observe(query);
          assert(
            (
              second.body as {
                user: unknown;
              }
            ).user
          );
          return { first, second, effects: await effects(f) };
        },
        { config: { local: { usernameField: 'credentials[login]', passwordField: 'credentials[secret]' } } }
      ));
    it('uses fresh passwords and awaits profile hooks; identity replacement is rejected', async () => {
      await differential(
        async f => {
          const first = await observe(await local(f));
          assert(
            (
              first.body as {
                user: unknown;
              }
            ).user
          );
          assert.deepEqual((await f.identities.one('user', { id: f.user.id }))?.additionalAttributes, { hook: true });
          await f.identities.update('user', { id: f.user.id }, { password: await hash('new-password', 10) });
          const old = await observe(await local(f));
          assert.equal(
            (
              old.body as {
                user: unknown;
              }
            ).user,
            false
          );
          const fresh = await observe(await local(f, { ...localBody, password: 'new-password' }));
          assert(
            (
              fresh.body as {
                user: unknown;
              }
            ).user
          );
          return { first, old, fresh, effects: await effects(f) };
        },
        {
          config: {
            local: {
              hooks: {
                onUpdate: {
                  pre: [{ function: 'enrich', options: {} }],
                  post: [{ function: 'after', options: {} }],
                  postSync: [{ function: 'sync', options: {} }],
                },
              },
            },
          },
          hook: name => async user =>
            name === 'enrich' ? { ...(user as object), additionalAttributes: { hook: true } } : user,
        }
      );
      await differential(
        async f => {
          const result = await observe(await local(f));
          assert.equal(
            (
              result.body as {
                user: unknown;
              }
            ).user,
            false
          );
          assert.equal((await f.identities.one('user', { id: f.user.id }))?.username, 'pilot-admin');
          return { result, effects: await effects(f) };
        },
        {
          config: { local: { hooks: { onUpdate: { pre: [{ function: 'replace', options: {} }] } } } },
          hook: () => async user => {
            Reflect.set(user as object, 'username', 'hijacked');
            return user;
          },
        }
      );
    });
    it('uses the default local fields when configured field names are empty', async () =>
      differential(
        async f => {
          const result = await observe(await local(f));
          assert.equal(result.status, 200);
          assert(
            (
              result.body as {
                user: unknown;
              }
            ).user
          );
          return result;
        },
        { config: { local: { usernameField: '', passwordField: '' } } }
      ));
    for (const failure of ['callback', 'throw'])
      it('handles AAF key-provider ' + failure + ' failures like Express', async () =>
        differential(
          async f => {
            const result = await observe(await aaf(f));
            assert.equal(result.status, failure === 'callback' ? 403 : 500);
            assert(!JSON.stringify(result).includes('private-key-provider-detail'));
            assert.equal(await f.native.db().collection('authSessions').countDocuments(), 0);
            return { result, effects: await effects(f) };
          },
          {
            config: {
              active: ['aaf'],
              aaf: {
                opts: {
                  secretOrKeyProvider: (_request: unknown, _token: string, done: (error: unknown) => void) => {
                    const error = new Error('private-key-provider-detail');
                    if (failure === 'throw') throw error;
                    done(error);
                  },
                },
              },
            },
          }
        )
      );
    for (const state of ['linked', 'disabled', 'primary-disabled', 'orphan', 'cycle'])
      it('bearer account state: ' + state, async () =>
        differential(async f => {
          const alias = await f.identities.create('user', {
            name: 'Alias',
            email: 'alias@example.invalid',
            username: 'alias',
            type: 'aaf',
            token: createHash('sha256').update('alias-token').digest('base64'),
            roles: [f.reader.id],
            linkedPrimaryUserId: f.user.id,
            accountLinkState: 'linked-alias',
            loginDisabled: state === 'disabled',
          });
          if (state === 'primary-disabled')
            await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
          if (state === 'orphan') await f.identities.remove('user', { id: f.user.id });
          if (state === 'cycle')
            await f.identities.update('user', { id: f.user.id }, { linkedPrimaryUserId: alias.id });
          const result = await observe(
            await fetch(f.url + '/__test/actor', { headers: { Authorization: 'Bearer alias-token' } })
          );
          assert.equal(!!result.body, state === 'linked');
          if (result.body)
            assert.equal(
              (
                result.body as {
                  id: string;
                }
              ).id,
              f.user.id
            );
          assert.equal(await f.native.db().collection('authSessions').countDocuments(), 0);
          return result;
        })
      );
    it('isolates native provider keys, actors, sessions and shutdown between applications', async () => {
      const first = await authenticationFixture(true);
      let second: Fixture | undefined;
      try {
        second = await authenticationFixture(true, {
          config: { active: ['aaf'], aaf: { opts: { secretOrKey: 'second-application-key', algorithms: ['HS256'] } } },
        });
        const response = await local(first);
        const active = cookie(response);
        await response.json();
        assert.equal((await info(first, active)).status, 200);
        assert.equal((await info(second, active)).status, 403);
        assert.equal((await aaf(first)).status, 302);
        assert.equal((await aaf(second)).status, 403);
        assert.equal((await aaf(second, aafAssertion(aafPayload, 'second-application-key'))).status, 302);
        await first.host.stop();
        const remaining = await local(second);
        assert.equal(remaining.status, 200);
        assert(
          (
            (await remaining.json()) as {
              user: unknown;
            }
          ).user
        );
      } finally {
        await first.close();
        await second?.close();
      }
    });
    for (const version of [undefined, 5, 7])
      it('rejects signed session authentication version ' + version, async () =>
        differential(async f => {
          const login = await local(f);
          const active = cookie(login);
          await login.json();
          const saved = await f.native.db().collection('authSessions').findOne();
          assert(saved);
          const payload = JSON.parse(saved.session);
          payload.authenticationVersion = version;
          payload.user = { id: f.user.id };
          payload.grant = 'legacy-secret';
          await f.native
            .db()
            .collection('authSessions')
            .updateOne({ _id: saved._id }, { $set: { session: JSON.stringify(payload) } });
          const result = await observe(await info(f, active));
          assert.equal(result.status, 403);
          assert.equal(await f.native.db().collection('authSessions').countDocuments({ _id: saved._id }), 0);
          assert(
            !JSON.stringify(await f.native.db().collection('authSessions').find().toArray()).includes('legacy-secret')
          );
          return { result, effects: await effects(f) };
        })
      );
    it('refreshes bearer tokens and disabled users, gives explicit bearer precedence over session', async () =>
      differential(async f => {
        const response = await local(f);
        const active = cookie(response);
        await response.json();
        const result = [];
        for (const authorization of [
          undefined,
          'Bearer wrong',
          'Basic secret',
          '',
          'Bearer pilot-api-token',
          'bearer pilot-api-token',
          'Bearer  pilot-api-token',
        ]) {
          const res = await fetch(f.url + '/__test/actor', {
            headers: { Cookie: active, ...(authorization === undefined ? {} : { Authorization: authorization }) },
          });
          result.push(await observe(res));
          const found: unknown = result.at(-1)!.body;
          assert.equal(
            !!found,
            authorization === undefined || authorization?.toLowerCase() === 'bearer pilot-api-token'
          );
        }
        await f.identities.update(
          'user',
          { id: f.user.id },
          { token: createHash('sha256').update('rotated-token').digest('base64') }
        );
        for (const token of ['pilot-api-token', 'rotated-token'])
          result.push(
            await observe(await fetch(f.url + '/__test/actor', { headers: { Authorization: 'Bearer ' + token } }))
          );
        assert.equal(result.at(-2)!.body, false);
        assert(result.at(-1)!.body);
        await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
        result.push(await observe(await info(f, active)));
        assert.equal(result.at(-1)!.status, 403);
        result.push(
          await observe(await fetch(f.url + '/__test/actor', { headers: { Authorization: 'Bearer rotated-token' } }))
        );
        assert.equal(result.at(-1)!.body, false);
        return { result, effects: await effects(f) };
      }));
    for (const method of ['body', 'query', 'duplicate', 'session-precedence'] as const)
      it('bearer token source: ' + method, async () =>
        differential(async f => {
          let credential = '';
          if (method === 'session-precedence') {
            const login = await local(f);
            credential = cookie(login);
            await login.json();
          }
          const response = await post(
            f.url + '/__test/actor' + (method === 'query' ? '?access_token=pilot-api-token' : ''),
            method === 'query' ? {} : { access_token: method === 'session-precedence' ? 'wrong' : 'pilot-api-token' },
            credential,
            method === 'duplicate' ? { Authorization: 'Bearer pilot-api-token' } : {}
          );
          const result = await observe(response);
          assert.equal(!!result.body, method !== 'duplicate');
          return result;
        })
      );
    for (const [name, token, status] of [
      ['valid', aafAssertion(aafPayload), 302],
      ['bad signature', aafAssertion(aafPayload, 'wrong'), 403],
      ['expired', aafAssertion({ ...aafPayload, exp: 1 }), 403],
      ['issuer', aafAssertion({ ...aafPayload, iss: 'https://wrong.invalid' }), 403],
      ['algorithm', aafAssertion(aafPayload, undefined, 'HS512'), 403],
      ['malformed', 'malformed', 403],
      ['missing', '', 400],
      [
        'email denial',
        aafAssertion({ sub: 'denied', 'https://aaf.edu.au/attributes': { mail: 'denied@outside.invalid' } }),
        403,
      ],
      ['missing subject', aafAssertion({ 'https://aaf.edu.au/attributes': { mail: 'valid@example.invalid' } }), 403],
    ] as const)
      it('AAF signature/profile: ' + name, async () =>
        differential(async f => {
          let anonymous = '';
          if (status === 302) {
            const response = await fetch(f.url + '/__test/session');
            anonymous = cookie(response);
            await response.json();
            assert(anonymous);
          }
          const response = await aaf(f, token, anonymous);
          const active = cookie(response);
          const result = await observe(response);
          assert.equal(result.status, status);
          let profile: unknown;
          if (status === 302) {
            assert(active);
            assert.notEqual(active, anonymous);
            assert.equal((await info(f, anonymous)).status, 403);
            const user = await f.identities.one(
              'user',
              { name: 'AAF Fixture', username: Buffer.from('aaf-subject').toString('base64') },
              { populate: ['roles'] }
            );
            assert(user);
            assert.equal(user.email, 'aaf@example.invalid');
            assert.equal(user.displayname, 'AAF Fixture');
            profile = await observe(await info(f, active));
            assert.equal(
              (
                profile as {
                  status: number;
                }
              ).status,
              200
            );
            const logout = await post(f.url + '/default/rdmp/user/logout', undefined, active);
            assert.equal(logout.status, 302);
            await logout.arrayBuffer();
            assert.equal((await info(f, active)).status, 403);
          } else assert.equal(await f.identities.one('user', { username: 'denied' }), null);
          return { result, profile, effects: await effects(f) };
        })
      );
    for (const state of ['disabled', 'linked', 'primary-disabled', 'orphan', 'cycle'])
      it('AAF existing account: ' + state, async () =>
        differential(async f => {
          const alias = await f.identities.create('user', {
            name: 'AAF Fixture',
            username: Buffer.from('aaf-subject').toString('base64'),
            type: 'aaf',
            email: 'aaf@example.invalid',
            roles: [f.reader.id],
            ...(state === 'disabled'
              ? { loginDisabled: true }
              : { linkedPrimaryUserId: f.user.id, accountLinkState: 'linked-alias' }),
          });
          if (state === 'primary-disabled')
            await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
          if (state === 'orphan') await f.identities.remove('user', { id: f.user.id });
          if (state === 'cycle')
            await f.identities.update('user', { id: f.user.id }, { linkedPrimaryUserId: alias.id });
          const result = await observe(await aaf(f));
          assert.equal(result.status, state === 'linked' ? 302 : 403);
          return { result, effects: await effects(f) };
        })
      );
    it('preserves configured AAF subject/attribute fields, audience, and not-before policy', async () => {
      await differential(
        async f => {
          const token = aafAssertion({
            subject: 'mapped-subject',
            attributes: { mail: 'MAPPED@EXAMPLE.INVALID', cn: 'Mapped AAF' },
            aud: 'redbox-fixture',
            nbf: Math.floor(Date.now() / 1000) + 3600,
          });
          const good = await observe(await aaf(f, token));
          assert.equal(good.status, 302);
          const user = await f.identities.one('user', { username: Buffer.from('mapped-subject').toString('base64') });
          assert(user);
          assert.equal(user.name, 'Mapped AAF');
          assert.equal(user.email, 'mapped@example.invalid');
          const bad = await observe(
            await aaf(
              f,
              aafAssertion({ subject: 'wrong-audience', attributes: { mail: 'valid@example.invalid' }, aud: 'wrong' })
            )
          );
          assert.equal(bad.status, 403);
          return { good, bad, effects: await effects(f) };
        },
        {
          config: {
            active: ['aaf'],
            aaf: {
              usernameField: 'subject',
              attributesField: 'attributes',
              opts: {
                secretOrKey: 'fm015-synthetic-aaf-signature-secret',
                algorithms: ['HS256'],
                audience: 'redbox-fixture',
              },
            },
          },
        }
      );
    });
    it('required audit failure destroys the rotated session and records safe failure events', async () =>
      differential(
        async f => {
          const response = await local(f);
          const result = await observe(response);
          assert.equal(result.status, 500);
          assert(!JSON.stringify(result).includes('private-audit-detail'));
          assert.equal(await f.native.db().collection('authSessions').countDocuments(), 0);
          assert.equal(f.events.filter(event => event.eventType === 'authentication.login.failure').length, 1);
          assert(!JSON.stringify(f.events).includes('pilot-password'));
          return { result, effects: await effects(f) };
        },
        {
          audit: async () => {
            throw new Error('private-audit-detail');
          },
        }
      ));
    for (const provider of ['local', 'aaf'])
      it(provider + ' accepts the real URL-encoded credential form', async () =>
        differential(async f => {
          const response = await fetch(f.url + '/user/login_' + provider, {
            method: 'POST',
            redirect: 'manual',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(provider === 'local' ? localBody : { assertion: aafAssertion(aafPayload) }),
          });
          const result = await observe(response);
          assert.equal(result.status, 302);
          return { result, effects: await effects(f) };
        })
      );
    for (const accept of [
      'text/html',
      'application/json',
      'text/html;q=0,application/json',
      'application/json;q=1,text/html;q=0.1',
      '*/*',
    ])
      it('negotiates provider rejection for Accept ' + accept, async () =>
        differential(
          async f => {
            const response = await post(
              f.url + '/user/login_aaf',
              {
                assertion: aafAssertion({
                  sub: 'denied',
                  'https://aaf.edu.au/attributes': { mail: 'denied@outside.invalid' },
                }),
              },
              '',
              { Accept: accept }
            );
            const result = await observe(response);
            assert.equal(result.status, 403);
            assert.equal(typeof result.body === 'string', accept === 'text/html' || accept === '*/*');
            return { result, effects: await effects(f) };
          },
          { renderFailure: true }
        )
      );
    it('preserves session/version work on explicit OIDC HEAD and implicit info/logout HEAD', async () =>
      differential(async f => {
        const result = [];
        for (const state of ['anonymous', 'valid', 'old', 'tampered']) {
          let credential = '';
          if (state !== 'anonymous') {
            const response = await local(f);
            credential = cookie(response);
            await response.json();
            if (state === 'tampered') credential += 'tamper';
            if (state === 'old') {
              const saved = await f.native.db().collection('authSessions').findOne();
              assert(saved);
              const payload = JSON.parse(saved.session);
              payload.authenticationVersion = 5;
              await f.native
                .db()
                .collection('authSessions')
                .updateOne({ _id: saved._id }, { $set: { session: JSON.stringify(payload) } });
            }
          }
          for (const path of ['/user/begin_oidc', '/user/info', '/default/rdmp/user/logout']) {
            const response = await fetch(f.url + path, {
              method: 'HEAD',
              redirect: 'manual',
              headers: { Cookie: credential },
            });
            const observation = await observe(response);
            assert.equal(observation.body, '');
            assert.equal(observation.status, path.endsWith('info') ? (state === 'valid' ? 200 : 403) : 405);
            result.push(observation);
          }
          await f.native.db().collection('authSessions').deleteMany({});
        }
        return { result, effects: await effects(f) };
      }));
    it('retains AAF asynchronous signing-key callback through disconnect and stop retry', async () => {
      for (const native of [true]) {
        const entered = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>();
        const f = await authenticationFixture(native, {
          config: {
            active: ['aaf'],
            aaf: {
              opts: {
                algorithms: ['HS256'],
                secretOrKeyProvider: async (
                  _request: unknown,
                  _token: string,
                  done: (error: unknown, key?: string) => void
                ) => {
                  entered.resolve();
                  await release.promise;
                  done(null, 'fm015-synthetic-aaf-signature-secret');
                },
              },
            },
          },
        });
        let client: ReturnType<typeof request> | undefined;
        try {
          client = request(f.url + '/user/login_aaf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const closed = new Promise<void>(resolve => client!.once('error', () => resolve()));
          client.end(JSON.stringify({ assertion: aafAssertion(aafPayload) }));
          await entered.promise;
          client.destroy();
          await closed;
          await assert.rejects(f.host.stop({ deadlineMs: 30 }), /deadline/);
          assert(persistenceStatus(f.owner).prismaClients > 0);
          release.resolve();
          await f.host.stop();
          assert.equal(persistenceStatus(f.owner).prismaClients, 0);
          assert.equal(await f.native.db().collection('useraudit').countDocuments(), 1);
        } finally {
          release.resolve();
          client?.destroy();
          await f.close();
        }
      }
    });
    for (const kind of ['local', 'aaf', 'bearer'])
      it('retains ' + kind + ' callback work through disconnect and stop retry', async () => {
        for (const native of [true]) {
          const entered = Promise.withResolvers<void>(),
            release = Promise.withResolvers<void>();
          const block = async () => {
            entered.resolve();
            await release.promise;
          };
          const f = await authenticationFixture(native, kind === 'bearer' ? { bearer: block } : { audit: block });
          let client: ReturnType<typeof request> | undefined;
          try {
            const path = kind === 'local' ? '/user/login_local' : kind === 'aaf' ? '/user/login_aaf' : '/__test/actor';
            client = request(f.url + path, {
              method: kind === 'bearer' ? 'GET' : 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(kind === 'bearer' ? { Authorization: 'Bearer pilot-api-token' } : {}),
              },
            });
            const closed = new Promise<void>(resolve => client!.once('error', () => resolve()));
            client.end(
              kind === 'local'
                ? JSON.stringify(localBody)
                : kind === 'aaf'
                  ? JSON.stringify({ assertion: aafAssertion(aafPayload) })
                  : undefined
            );
            await entered.promise;
            client.destroy();
            await closed;
            await assert.rejects(f.host.stop({ deadlineMs: 30 }), /deadline/);
            assert(persistenceStatus(f.owner).prismaClients > 0);
            release.resolve();
            await f.host.stop();
            assert.equal(persistenceStatus(f.owner).prismaClients, 0);
            assert.equal(await f.native.db().collection('useraudit').countDocuments(), kind === 'bearer' ? 0 : 1);
          } finally {
            release.resolve();
            client?.destroy();
            await f.close();
          }
        }
      });
  }
);
(enabled ? describe : describe.skip)(
  'FM-015 OIDC protocol differential with real local issuer and native Mongo sessions',
  function () {
    this.timeout(45000);
    for (const scenario of [
      'good',
      'claims',
      'named',
      'metadata',
      'logout-disabled',
      'denied',
      'access-denied',
      'wrong-state',
      'missing-session',
      'replay',
      'token-error',
      'wrong-audience',
      'wrong-issuer',
      'expired',
      'userinfo-error',
      'wrong-subject',
      'disabled',
      'linked',
      'primary-disabled',
      'orphan',
      'cycle',
    ])
      it('OIDC ' + scenario, async () => {
        const observations: unknown[] = [];
        for (const native of [true]) {
          const provider = await oidcFixture();
          let f: Fixture | undefined;
          try {
            const port = await availablePort();
            const config = provider.config(
              port,
              scenario === 'denied' ? 'denied' : 'allowed',
              scenario === 'named' ? 'campus' : undefined,
              scenario === 'claims'
            );
            if (scenario === 'metadata') {
              const oidc = config.oidc;
              assert(oidc && !Array.isArray(oidc));
              const discovery = await fetch(provider.issuer + '/.well-known/openid-configuration');
              oidc.opts.issuer = await discovery.json();
            }
            if (scenario === 'logout-disabled') {
              const oidc = config.oidc;
              assert(oidc && !Array.isArray(oidc));
              Reflect.set(oidc, 'logoutFromAuthServer', false);
            }
            f = await authenticationFixture(native, {
              port,
              config,
              logoutOrigins: [provider.issuer],
            });
            if (['disabled', 'linked', 'primary-disabled', 'orphan', 'cycle'].includes(scenario)) {
              const alias = await f.identities.create('user', {
                name: 'OIDC Fixture',
                username: 'allowed',
                type: 'oidc',
                email: 'allowed@example.invalid',
                roles: [f.reader.id],
                ...(scenario === 'disabled'
                  ? { loginDisabled: true }
                  : { linkedPrimaryUserId: f.user.id, accountLinkState: 'linked-alias' }),
              });
              if (scenario === 'primary-disabled')
                await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
              if (scenario === 'orphan') await f.identities.remove('user', { id: f.user.id });
              if (scenario === 'cycle')
                await f.identities.update('user', { id: f.user.id }, { linkedPrimaryUserId: alias.id });
            }
            provider.setMode(scenario);
            const begin = await fetch(f.url + '/user/begin_oidc' + (scenario === 'named' ? '?id=campus' : ''), {
              redirect: 'manual',
            });
            assert.equal(begin.status, 302);
            const anonymous = cookie(begin);
            assert(anonymous);
            const target = new URL(begin.headers.get('location')!);
            assert(target.searchParams.get('state'));
            assert(target.searchParams.get('code_challenge'));
            await begin.arrayBuffer();
            const authorized = await fetch(target, { redirect: 'manual' });
            assert.equal(authorized.status, 302);
            const callback = new URL(authorized.headers.get('location')!);
            await authorized.arrayBuffer();
            if (scenario === 'wrong-state') callback.searchParams.set('state', 'wrong');
            const response = await fetch(callback, {
              redirect: 'manual',
              headers: { Cookie: scenario === 'missing-session' ? '' : anonymous },
            });
            const active = cookie(response);
            const result = [await observe(response)];
            const success = ['good', 'claims', 'named', 'metadata', 'logout-disabled', 'replay', 'linked'].includes(
              scenario
            );
            assert.equal(result[0].status, success ? 302 : scenario === 'missing-session' ? 400 : 403);
            if (success) {
              assert(active);
              assert.notEqual(active, anonymous);
              assert.equal((await info(f, anonymous)).status, 403);
              const account = await f.identities.one('user', { username: 'allowed' });
              assert(account);
              assert.equal(account.email, 'allowed@example.invalid');
              assert.deepEqual(account.additionalAttributes, { 'department.name': 'Research' });
              result.push(await observe(await info(f, active)));
              assert.equal(result.at(-1)!.status, 200);
              if (scenario === 'replay') {
                result.push(await observe(await fetch(callback, { redirect: 'manual', headers: { Cookie: active } })));
                assert.equal(result.at(-1)!.status, 403);
              }
              const logout = await post(f.url + '/default/rdmp/user/logout', undefined, active);
              if (!['linked', 'logout-disabled'].includes(scenario))
                assert.equal(new URL(logout.headers.get('location')!).origin, provider.issuer);
              else assert.equal(logout.headers.get('location'), '/portal/default/rdmp/home');
              result.push(await observe(logout));
              assert.equal(result.at(-1)!.status, 302);
              result.push(await observe(await info(f, active)));
              assert.equal(result.at(-1)!.status, 403);
            }
            assert(provider.calls.discovery > 0);
            assert.equal(provider.calls.authorization, 1);
            if (success) assert.equal(provider.calls.pkce, 1);
            observations.push(await normalize(f, { result, calls: provider.calls, effects: await effects(f) }));
          } finally {
            await f?.close();
            await provider.close();
          }
        }
        assertGoldenNext('authentication', observations[0]);
      });
    it('retains OIDC callback audit/session work after disconnect and stop deadline', async () => {
      for (const native of [true]) {
        const provider = await oidcFixture();
        const entered = Promise.withResolvers<void>(),
          release = Promise.withResolvers<void>();
        let f: Fixture | undefined;
        let client: ReturnType<typeof request> | undefined;
        try {
          const port = await availablePort();
          f = await authenticationFixture(native, {
            port,
            config: provider.config(port),
            audit: async () => {
              entered.resolve();
              await release.promise;
            },
          });
          const begin = await fetch(f.url + '/user/begin_oidc', { redirect: 'manual' });
          const anonymous = cookie(begin);
          const authorize = begin.headers.get('location')!;
          await begin.arrayBuffer();
          const authorized = await fetch(authorize, { redirect: 'manual' });
          const callback = authorized.headers.get('location')!;
          await authorized.arrayBuffer();
          client = request(callback, { headers: { Cookie: anonymous } });
          const closed = new Promise<void>(resolve => client!.once('error', () => resolve()));
          client.end();
          await entered.promise;
          client.destroy();
          await closed;
          await assert.rejects(f.host.stop({ deadlineMs: 30 }), /deadline/);
          assert(persistenceStatus(f.owner).prismaClients > 0);
          release.resolve();
          await f.host.stop();
          assert.equal(persistenceStatus(f.owner).prismaClients, 0);
          assert.equal(await f.native.db().collection('useraudit').countDocuments(), 1);
        } finally {
          release.resolve();
          client?.destroy();
          await f?.close();
          await provider.close();
        }
      }
    });
    for (const outcome of ['allowed', 'denied'])
      it('retains the actual OIDC token exchange after disconnect: ' + outcome, async () => {
        for (const native of [true]) {
          const provider = await oidcFixture();
          const entered = Promise.withResolvers<void>(),
            release = Promise.withResolvers<void>();
          let f: Fixture | undefined;
          let client: ReturnType<typeof request> | undefined;
          try {
            const port = await availablePort();
            f = await authenticationFixture(native, { port, config: provider.config(port, outcome) });
            const begin = await fetch(f.url + '/user/begin_oidc', { redirect: 'manual' });
            const anonymous = cookie(begin);
            const authorize = begin.headers.get('location')!;
            await begin.arrayBuffer();
            const authorized = await fetch(authorize, { redirect: 'manual' });
            const callback = authorized.headers.get('location')!;
            await authorized.arrayBuffer();
            provider.pauseToken(async () => {
              entered.resolve();
              await release.promise;
            });
            client = request(callback, { headers: { Cookie: anonymous } });
            const closed = new Promise<void>(resolve => client!.once('error', () => resolve()));
            client.end();
            await entered.promise;
            client.destroy();
            await closed;
            await assert.rejects(f.host.stop({ deadlineMs: 30 }), /deadline/);
            assert(persistenceStatus(f.owner).prismaClients > 0);
            release.resolve();
            await f.host.stop();
            assert.equal(persistenceStatus(f.owner).prismaClients, 0);
            assert.equal(await f.native.db().collection('useraudit').countDocuments(), outcome === 'allowed' ? 1 : 0);
            assert.equal(provider.calls.pkce, 1);
          } finally {
            release.resolve();
            client?.destroy();
            await f?.close();
            await provider.close();
          }
        }
      });
    it('fails awaited discovery before admission with bounded retries and owned cleanup', async () => {
      for (const native of [true]) {
        const provider = await oidcFixture();
        try {
          provider.setMode('discovery-error');
          const port = await availablePort();
          const config = provider.config(port);
          const oidc = config.oidc;
          assert(oidc && !Array.isArray(oidc));
          oidc.discoverAttemptsMax = 2;
          oidc.discoverFailureSleep = 1;
          await assert.rejects(authenticationFixture(native, { port, config }), /OIDC discovery failed/);
          assert.equal(provider.calls.discovery, 2);
        } finally {
          await provider.close();
        }
      }
    });
    for (const scope of ['', false])
      it('preserves OIDC authorization parameters for scope ' + JSON.stringify(scope), async () => {
        const results: unknown[] = [];
        for (const native of [true]) {
          const provider = await oidcFixture();
          let f: Fixture | undefined;
          try {
            const port = await availablePort();
            const config = provider.config(port);
            const oidc = config.oidc;
            assert(oidc && !Array.isArray(oidc));
            oidc.opts.params!.scope = scope;
            // A static authorization-endpoint query parameter must survive URL construction.
            const metadata = (await (
              await fetch(provider.issuer + '/.well-known/openid-configuration')
            ).json()) as Record<string, unknown>;
            metadata.authorization_endpoint = provider.issuer + '/authorize?tenant=campus';
            oidc.opts.issuer = metadata;
            f = await authenticationFixture(native, { port, config });
            const begin = await fetch(f.url + '/user/begin_oidc', { redirect: 'manual' });
            assert.equal(begin.status, 302);
            const target = new URL(begin.headers.get('location')!);
            await begin.arrayBuffer();
            assert(!target.searchParams.has('scope'));
            assert.equal(target.searchParams.get('tenant'), 'campus');
            for (const key of ['state', 'code_challenge']) {
              assert(target.searchParams.get(key));
              target.searchParams.set(key, '<random>');
            }
            results.push(await normalize(f, Object.fromEntries(target.searchParams)));
          } finally {
            await f?.close();
            await provider.close();
          }
        }
        assertGoldenNext('authentication', results[0]);
      });
    it('keeps OIDC configuration and handshake state local to each native application', async () => {
      const firstProvider = await oidcFixture(),
        secondProvider = await oidcFixture();
      let first: Fixture | undefined, second: Fixture | undefined;
      try {
        const firstPort = await availablePort(),
          secondPort = await availablePort();
        first = await authenticationFixture(true, { port: firstPort, config: firstProvider.config(firstPort) });
        second = await authenticationFixture(true, { port: secondPort, config: secondProvider.config(secondPort) });
        const beginA = await fetch(first.url + '/user/begin_oidc', { redirect: 'manual' });
        const beginB = await fetch(second.url + '/user/begin_oidc', { redirect: 'manual' });
        const cookieA = cookie(beginA),
          cookieB = cookie(beginB);
        const targetA = beginA.headers.get('location')!,
          targetB = beginB.headers.get('location')!;
        assert.equal(new URL(targetA).origin, firstProvider.issuer);
        assert.equal(new URL(targetB).origin, secondProvider.issuer);
        assert.notEqual(new URL(targetA).searchParams.get('state'), new URL(targetB).searchParams.get('state'));
        await beginA.arrayBuffer();
        await beginB.arrayBuffer();
        const authorized = await fetch(targetA, { redirect: 'manual' });
        const callback = authorized.headers.get('location')!;
        await authorized.arrayBuffer();
        const cross = new URL(callback);
        cross.port = String(secondPort);
        const denial = await fetch(cross, { redirect: 'manual', headers: { Cookie: cookieB } });
        assert.equal(denial.status, 403);
        await denial.arrayBuffer();
        assert.equal(firstProvider.calls.token, 0);
        assert.equal(secondProvider.calls.token, 0);
        await second.host.stop();
        const success = await fetch(callback, { redirect: 'manual', headers: { Cookie: cookieA } });
        assert.equal(success.status, 302);
        await success.arrayBuffer();
        assert.equal(firstProvider.calls.pkce, 1);
        assert.equal(secondProvider.calls.token, 0);
      } finally {
        await first?.close();
        await second?.close();
        await firstProvider.close();
        await secondProvider.close();
      }
    });
  }
);

goldenControls('authentication');

describe('authentication persisted-audit assertion control', () => {
  it('rejects a login/logout observation with both persisted audits suppressed', () => {
    const { golden, assertGolden } = require('./goldenContracts') as typeof import('./goldenContracts');
    const key =
      'FM-015 retained Express/native authentication differential (real Mongo) rotates local login, saves safe mapped profiles/audits, refreshes roles and destroys logout #0';
    const value = structuredClone(golden('authentication', key)) as any;
    let suppressed = 0;
    function suppress(node: any) {
      if (!node || typeof node !== 'object') return;
      for (const [name, item] of Object.entries(node)) {
        if (name === 'audits' && Array.isArray(item) && item.length) {
          suppressed += item.length;
          node[name] = [];
        } else suppress(item);
      }
    }
    suppress(value);
    assert(suppressed >= 2, 'Control must suppress the recorded login/logout audits');
    assert.throws(() => assertGolden('authentication', key, value), assert.AssertionError);
  });
});
