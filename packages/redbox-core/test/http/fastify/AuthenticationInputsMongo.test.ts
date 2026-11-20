import assert from 'node:assert/strict';
import { availablePort } from './authenticationFixture';
import { createPortalFastifyHost } from '../../../src/application/portal/host';
import { referenceProductionFixture } from './referenceProductionFixture';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { settleMutationWork } from './mutationDifferentialSupport';
import { oidcFixture } from './oidcFixture';
import { assertGolden, goldenControls } from './goldenContracts';
import { withoutSideEffects } from './noSideEffects';

const family = 'authenticationInputs';
const cookie = (response: Response) => response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
type Fixture = Awaited<ReturnType<typeof referenceProductionFixture>>;
const local = {
  default: {
    adminUser: 'pilot-admin',
    adminPw: 'pilot-password',
    email: 'synthetic@example.invalid',
    token: 'pilot-api-token',
  },
};
async function production(
  port: number,
  provider?: Awaited<ReturnType<typeof oidcFixture>>,
  identifier?: string,
  fields?: readonly [string, string]
) {
  return referenceProductionFixture(true, undefined, undefined, {
    declarations: [referenceReadDeclarations[0]],
    pages: {},
    // The fixture normally pins standard names. Bind the configured names here
    // just as the executable binds them before handing off to the native host.
    hostFactory: (portal, options) =>
      createPortalFastifyHost(portal, {
        ...options,
        login: {
          ...options.login,
          get credentialFields() {
            const local = portal.data.reference.appConfigs.get().getAppConfigurationForBrand('default').auth?.local;
            return [local?.usernameField ?? 'username', local?.passwordField ?? 'password'] as const;
          },
        },
      }),
    configuration: {
      server: {
        hostname: '127.0.0.1',
        port,
        rootContext: '/portal',
        publicUrl: `http://127.0.0.1:${port}/portal`,
        trustProxy: true,
        stopDeadlineMs: 30000,
      },
      brandingConfigurationDefaults: {
        auth: {
          ...(provider ? provider.config(port, 'allowed', identifier) : { active: ['local'] }),
          local: { ...local, ...(fields ? { usernameField: fields[0], passwordField: fields[1] } : {}) },
        },
      },
      auth: {
        roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
        rules: [],
        ...(provider ? { logoutOrigins: [provider.issuer] } : {}),
      },
    },
  });
}
const auditRows = (f: Fixture) => f.client.db().collection('useraudit').find().sort({ _id: 1 }).toArray();
async function csrf(f: Fixture, current = '') {
  const response = await fetch(f.url + '/csrfToken', { headers: { Cookie: current } });
  assert.equal(response.status, 200);
  const token = (await response.json())._csrf;
  assert.match(token, /^[a-f0-9]{64}$/);
  return { Cookie: current || cookie(response), Origin: new URL(f.url).origin, 'X-CSRF-Token': token };
}

async function wire(response: Response) {
  const headers = Object.fromEntries(response.headers.entries());
  const cookies = response.headers.getSetCookie();
  if (headers.expires && headers.expires !== '0') {
    const seconds = Number(/(?:^|, )max-age=(\d+)(?:,|$)/.exec(headers['cache-control'])?.[1]);
    const delta = (Date.parse(headers.expires) - Date.parse(headers.date)) / 1000;
    // Date and Expires are formatted on opposite sides of the response send.
    assert(Math.abs(delta - seconds) <= 1, 'Expires must agree with the advertised freshness lifetime');
    headers.expires = `${seconds}s after Date`;
  }
  for (const name of ['date', 'connection', 'keep-alive', 'x-request-id', 'set-cookie']) delete headers[name];
  if (headers.location)
    headers.location = headers.location.replace(
      /([?&](?:state|code|code_challenge|nonce|id_token_hint)=)[^&]+/g,
      '$1<opaque>'
    );
  const text = await response.text();
  if (headers['content-length']) assert.equal(Number(headers['content-length']), Buffer.byteLength(text));
  return {
    status: response.status,
    headers,
    cookies: cookies.map(value =>
      value
        .replace(/^[^=]+=[^;]*/, nameAndValue => nameAndValue.replace(/=.*/, '=<session>'))
        .replace(/Expires=[^;]+/i, 'Expires=<time>')
    ),
    text,
  };
}

async function pin(f: Fixture, key: string, value: unknown) {
  await settleMutationWork(f);
  const audited = (name: string) =>
    f.client
      .db()
      .collection(name)
      .find({}, { projection: { _id: 0 } })
      .sort({ _id: 1 })
      .toArray();
  const [audits, events] = await Promise.all([audited('useraudit'), audited('securityevent')]);
  const sessions = (await f.client.db().collection('referenceSessions').find().toArray()).map(row => {
    const { branding, portal, passport, authenticationVersion, logoutUrl, langCode } = JSON.parse(row.session);
    return { branding, portal, passport, authenticationVersion, logoutUrl, langCode };
  });
  const ids = new Map<string, string>([
    [f.brand.id, 'brand:default'],
    [f.otherBrand.id, 'brand:other'],
  ]);
  for (const row of await f.client.db().collection('user').find().toArray())
    ids.set(String(row._id), `user:${row.username}`);
  function clean(value: unknown): unknown {
    if (value instanceof Date) return '<time>';
    if (value && typeof value === 'object' && Reflect.get(value, '_bsontype') === 'ObjectId')
      return ids.get(String(value)) ?? String(value);
    if (typeof value === 'string') {
      if (/^\d{4}-\d\d-\d\dT/.test(value)) return '<time>';
      let result = value
        .replace(/("(?:createdAt|updatedAt|lastLogin)":)"\d{4}-\d\d-\d\dT[^"]+"/g, '$1"<time>"')
        .replace(/127\.0\.0\.1:\d+/g, 'fixture')
        .replace(/127\.0\.0\.1%3A\d+/gi, 'fixture');
      for (const [id, label] of ids) result = result.split(id).join(label);
      return result;
    }
    if (Array.isArray(value)) return value.map(item => clean(item));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, clean(v)])
      );
    return value;
  }
  assertGolden(family, key, clean({ result: value, audits, sessions, events }));
}

describe('Historical authentication input acceptance through production Fastify', function () {
  this.timeout(45000);
  for (const query of [
    'id[provider]=institution',
    'id=' + 'x'.repeat(4097),
    'id=provider%0Aname',
    'id=provider%00name',
  ]) {
    const name = 'rejects malformed OIDC selection: ' + (query.length > 100 ? 'overlong' : query);
    it(name, async () => {
      const provider = await oidcFixture();
      let f: Fixture | undefined;
      try {
        const port = await availablePort();
        f = await production(port, provider, 'institution');
        const target = f.url + '/user/begin_oidc?' + query;
        const result = await withoutSideEffects(f, async () => wire(await fetch(target, { redirect: 'manual' })));
        assert.equal(result.status, 400);
        assert.equal(provider.calls.authorization, 0);
        assert.deepEqual(await auditRows(f), []);
        // NUL and LF are rejected by different predicates of the same
        // identifier guard and share the archived wire and no-effect contract.
        await pin(f, query.includes('%00') ? name.replace('%00', '%0A') : name, { result, provider: provider.calls });
      } finally {
        await f?.close();
        await provider.close();
      }
    });
  }
  for (const identifier of ['institution.example.edu', 'urn:identity:research', 'institution α']) {
    const name = 'named OIDC input acceptance: ' + identifier;
    it(name, async () => {
      const provider = await oidcFixture();
      let f: Fixture | undefined;
      try {
        const port = await availablePort();
        f = await production(port, provider, identifier);
        const begin = await fetch(f.url + '/user/begin_oidc?id=' + encodeURIComponent(identifier), {
          redirect: 'manual',
        });
        assert.equal(begin.status, 302);
        const anonymous = cookie(begin);
        assert(anonymous);
        const target = new URL(begin.headers.get('location')!);
        assert.equal(target.searchParams.get('portal_provider'), identifier);
        const issued = await fetch(target, { redirect: 'manual' });
        assert.equal(issued.status, 302);
        const callback = await fetch(issued.headers.get('location')!, {
          headers: { Cookie: anonymous },
          redirect: 'manual',
        });
        assert.equal(callback.status, 302);
        const active = cookie(callback);
        assert(active && active !== anonymous);
        assert.deepEqual(
          (await auditRows(f)).map(row => row.action),
          ['login']
        );
        const info = await fetch(f.url + '/user/info', { headers: { Cookie: active }, redirect: 'manual' });
        assert.equal(info.status, 200);
        const logout = await fetch(f.url + '/default/rdmp/user/logout', {
          method: 'POST',
          headers: await csrf(f, active),
          redirect: 'manual',
        });
        assert.equal(new URL(logout.headers.get('location')!).origin, provider.issuer);
        assert.equal(provider.calls.authorization, 1);
        assert.equal(provider.calls.pkce, 1);
        const revoked = await fetch(f.url + '/user/info', { headers: { Cookie: active }, redirect: 'manual' });
        assert.equal(revoked.status, 403);
        await pin(f, name, {
          result: await Promise.all([begin, issued, callback, info, logout, revoked].map(wire)),
          provider: provider.calls,
        });
      } finally {
        await f?.close();
        await provider.close();
      }
    });
  }
  it('rejects an unknown OIDC identifier with a configured provider', async () => {
    const provider = await oidcFixture();
    let f: Fixture | undefined;
    try {
      f = await production(await availablePort(), provider, 'institution');
      const fixture = f;
      await withoutSideEffects(fixture, async () => {
        const denied = await wire(
          await fetch(fixture.url + '/user/begin_oidc?id=unregistered', { redirect: 'manual' })
        );
        assert.equal(denied.status, 500);
        assert.deepEqual(JSON.parse(denied.text), { message: 'Internal server error', details: '' });
        assert.equal(denied.headers.location, undefined);
        assert.deepEqual(denied.cookies, []);
        assert.equal(provider.calls.authorization, 0);
      });
      const allowed = await fetch(f.url + '/user/begin_oidc?id=institution', { redirect: 'manual' });
      assert.equal(allowed.status, 302);
      assert.equal(new URL(allowed.headers.get('location')!).searchParams.get('portal_provider'), 'institution');
    } finally {
      await f?.close();
      await provider.close();
    }
  });
  const valid = { username: 'pilot-admin', password: 'pilot-password' };
  const fields = ['credentials[name]', 'credentials[secret]'] as const;
  const nested = { [fields[0]]: valid.username, [fields[1]]: valid.password };
  const localCases: {
    name: string;
    fields?: readonly [string, string];
    json?: unknown;
    query?: Record<string, string>;
    form?: Record<string, string>;
    status?: number;
    accepted?: false;
  }[] = [
    { name: 'body', json: valid },
    { name: 'query without body', query: valid },
    { name: 'empty configured fields retain strategy defaults', fields: ['', ''], json: valid },
    {
      name: 'body username and query password',
      json: { username: valid.username },
      query: { password: valid.password },
    },
    {
      name: 'query username and body password',
      query: { username: valid.username },
      json: { password: valid.password },
    },
    { name: 'empty body fields use query fallback', json: { username: '', password: '' }, query: valid },
    { name: 'body takes precedence', json: { ...valid, password: 'wrong' }, query: valid, accepted: false },
    {
      name: 'custom query fields',
      fields: ['loginName', 'loginSecret'],
      query: { loginName: valid.username, loginSecret: valid.password },
    },
    { name: 'nested body fields', fields, json: { credentials: { name: valid.username, secret: valid.password } } },
    { name: 'nested query fields', fields, query: nested },
    { name: 'nested form fields', fields, form: nested },
    {
      name: 'form username and query password',
      form: { username: valid.username },
      query: { password: valid.password },
    },
    { name: 'missing credential', json: { username: valid.username }, status: 400, accepted: false },
    { name: 'structured credential', json: { ...valid, username: [valid.username] }, status: 400, accepted: false },
    { name: 'overlong credential', json: { ...valid, password: 'x'.repeat(4097) }, status: 400, accepted: false },
  ];
  for (const row of localCases) {
    const name = 'local input acceptance: ' + row.name;
    it(name, async () => {
      const f = await production(await availablePort(), undefined, undefined, row.fields);
      try {
        const query = row.query ? '?' + new URLSearchParams(row.query).toString() : '';
        const credentials = await csrf(f);
        const send = () =>
          fetch(f.url + '/user/login_local' + query, {
            method: 'POST',
            redirect: 'manual',
            headers: {
              ...credentials,
              'x-source': 'jsclient',
              ...(row.form
                ? { 'Content-Type': 'application/x-www-form-urlencoded' }
                : row.json
                  ? { 'Content-Type': 'application/json' }
                  : {}),
            },
            body: row.form ? new URLSearchParams(row.form) : row.json ? JSON.stringify(row.json) : undefined,
          });
        const response = row.accepted === false ? await withoutSideEffects(f, send) : await send();
        const result = await wire(response);
        assert.equal(result.status, row.status ?? 200, result.text);
        if (row.accepted !== false) assert(cookie(response));
        assert.deepEqual(
          (await auditRows(f)).map(row => row.action),
          row.accepted === false ? [] : ['login']
        );
        if (result.status === 200) assert.equal(Boolean(JSON.parse(result.text).user), row.accepted !== false);
        await pin(f, name, result);
      } finally {
        await f.close();
      }
    });
  }
});

goldenControls(family);

describe('OIDC callback rejection on the production host', function () {
  this.timeout(120000);
  for (const failure of ['provider denied', 'state missing', 'state mismatch'] as const)
    it(`does not authenticate when ${failure}`, async () => {
      const provider = await oidcFixture();
      let f: Fixture | undefined;
      try {
        if (failure === 'provider denied') provider.setMode('access-denied');
        f = await production(await availablePort(), provider, 'institution');
        const begin = await fetch(f.url + '/user/begin_oidc?id=institution', { redirect: 'manual' });
        assert.equal(begin.status, 302);
        const sid = cookie(begin);
        assert(sid);
        const registered = new URL(begin.headers.get('location')!);
        assert.equal(registered.origin, provider.issuer);
        const authorization = await fetch(registered, { redirect: 'manual' });
        assert.equal(authorization.status, 302);
        const target = new URL(authorization.headers.get('location')!);
        assert.equal(target.origin, new URL(f.url).origin);
        const store = f.client.db().collection('referenceSessions');
        const session = await store.findOne();
        assert(session);
        const key = new URL(provider.issuer).host;
        const state = JSON.parse(session.session);
        assert.match(state[key].code_verifier, /^[a-zA-Z0-9_-]+$/);
        assert.equal(state[key].state, target.searchParams.get('state'));
        const actors = () => f!.client.db().collection('user').find().sort({ _id: 1 }).toArray();
        const before = await actors();
        if (failure === 'state missing') {
          delete state[key];
          assert.equal(
            (await store.updateOne({ _id: session._id }, { $set: { session: JSON.stringify(state) } })).modifiedCount,
            1
          );
        } else if (failure === 'state mismatch') target.searchParams.set('state', 'wrong-state');
        const refusal = await withoutSideEffects(
          f,
          async () =>
            wire(
              await fetch(target, {
                headers: { Cookie: sid, Accept: 'application/json' },
                redirect: 'manual',
              })
            ),
          failure === 'state missing'
            ? undefined
            : {
                expectedConsumedOidcState: { sessionId: String(session._id), issuerHost: key },
              }
        );
        assert.equal(refusal.status, 403, refusal.text);
        assert.deepEqual(JSON.parse(refusal.text), { message: 'Authentication rejected', user: false });
        assert.equal(refusal.headers.location, undefined);
        assert.equal(provider.calls.authorization, 1);
        assert.equal(provider.calls.token, 0);
        assert.equal(provider.calls.userinfo, 0);
        assert.deepEqual(await actors(), before);
        assert.deepEqual(await auditRows(f), []);
        const persisted = (await store.find().toArray()).map(row => JSON.parse(row.session));
        assert(persisted.every(row => !row.passport?.user && !row.authenticationVersion));
        await pin(f, 'OIDC denial ' + failure, {
          result: [await wire(begin), await wire(authorization), refusal],
          provider: provider.calls,
          authenticatedSessionCount: persisted.filter(row => row.passport?.user).length,
          accountsUnchanged: true,
        });
      } finally {
        await f?.close();
        await provider.close();
      }
    });
});
