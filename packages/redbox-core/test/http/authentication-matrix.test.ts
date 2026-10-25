import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import { sign } from 'jsonwebtoken';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { AuthenticationAccounts, type AnyRecord, type AuthBrandConfig } from '../../src/authentication/Accounts';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { HttpIdentity } from '../../src/http/express/identity';
import { createHttpAuthentication } from '../../src/http/express/authentication';
import {
  installAafAuthentication,
  installLocalAuthentication,
  installOidcAuthentication,
} from '../../src/http/express/identityProviders';
import { mountAuthenticationRoutes } from '../../src/http/express/login';
import { createHttpCsrf, mountCsrfTokenRoute } from '../../src/http/express/csrf';
import { httpAction, httpErrorHandler } from '../../src/http/express/middleware';

type Method = 'local' | 'aaf' | 'oidc' | 'oidc-named' | 'bearer' | 'session';
const methods: Method[] = ['local', 'aaf', 'oidc', 'oidc-named', 'bearer', 'session'];
const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const aafKey = 'synthetic-matrix-aaf-signature-key';
const token = 'synthetic-matrix-api-token';
const root = '/research';
const username = (method: Method) => (method === 'aaf' ? Buffer.from('subject').toString('base64') : 'person');
const isOidc = (method: Method) => method === 'oidc' || method === 'oidc-named';
const cookie = (response: Response) => response.headers.get('set-cookie')?.split(';')[0] ?? '';
const close = (server: Server) =>
  new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));

/** A real protocol peer: the production openid-client strategy performs state,
 * PKCE, token exchange and JWT/JWKS verification against these HTTP endpoints. */
async function provider() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const codes = new Map<string, { challenge: string; nonce?: string }>();
  const profile = {
    sub: 'subject',
    preferred_username: 'person',
    name: 'Provider Person',
    email: 'person@example.invalid',
  };
  let issuer = '';
  app.get('/authorize', (req, res) => {
    const code = randomUUID();
    codes.set(code, { challenge: String(req.query.code_challenge), nonce: req.query.nonce as string | undefined });
    const callback = new URL(String(req.query.redirect_uri));
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', String(req.query.state));
    res.redirect(callback.toString());
  });
  app.post('/token', (req, res) => {
    const request = codes.get(req.body.code);
    codes.delete(req.body.code);
    if (!request || createHash('sha256').update(req.body.code_verifier).digest('base64url') !== request.challenge) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }
    res.json({
      access_token: 'synthetic-provider-access',
      token_type: 'Bearer',
      expires_in: 60,
      id_token: sign({ ...profile, ...(request.nonce ? { nonce: request.nonce } : {}) }, key.privateKey, {
        algorithm: 'RS256',
        keyid: 'matrix',
        issuer,
        audience: 'matrix',
        expiresIn: 60,
      }),
    });
  });
  app.get('/jwks', (_req, res) =>
    res.json({ keys: [{ ...key.publicKey.export({ format: 'jwk' }), kid: 'matrix', alg: 'RS256', use: 'sig' }] })
  );
  app.get('/userinfo', (_req, res) => res.json(profile));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  issuer = `http://127.0.0.1:${address.port}`;
  return {
    issuer,
    metadata: {
      issuer,
      authorization_endpoint: issuer + '/authorize',
      token_endpoint: issuer + '/token',
      jwks_uri: issuer + '/jwks',
      userinfo_endpoint: issuer + '/userinfo',
      end_session_endpoint: issuer + '/logout',
      response_types_supported: ['code'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
    },
    close: () => close(server),
  };
}

async function fixture(
  method: Method,
  options: {
    first?: boolean;
    brand?: string;
    disabled?: boolean;
    linked?: boolean;
    primaryDisabled?: boolean;
    orphan?: boolean;
    active?: boolean;
    customFields?: boolean;
    credentialFields?: readonly [string, string];
    denyEmail?: boolean;
    userInfo?: boolean;
    priorLogout?: boolean;
    logoutDisabled?: boolean;
    logoutAllowed?: boolean;
    logoutMissing?: boolean;
  } = {}
) {
  const idp = await provider();
  if (options.logoutMissing) Reflect.deleteProperty(idp.metadata, 'end_session_endpoint');
  const brand = (name: string) =>
    Object.assign(new BrandingModel(), {
      id: 'brand-' + name,
      name,
      roles: [{ id: 'role-' + name, name: 'Researcher', branding: 'brand-' + name }],
    });
  const brands: Record<string, BrandingModel> = { default: brand('default'), other: brand('other') };
  const users: AnyRecord[] = options.first
    ? []
    : [
        {
          id: 'user',
          username: username(method),
          name: 'Original Person',
          email: 'person@example.invalid',
          type: isOidc(method) ? 'oidc' : method === 'aaf' ? 'aaf' : 'local',
          roles: ['role-' + (options.brand ?? 'default')],
          loginDisabled: options.disabled === true,
          ...(options.linked ? { linkedPrimaryUserId: 'primary', accountLinkState: 'linked-alias' } : {}),
        },
      ];
  if (options.linked && !options.orphan)
    users.push({
      id: 'primary',
      username: 'primary-person',
      type: 'local',
      roles: ['role-default'],
      loginDisabled: options.primaryDisabled === true,
    });
  const writes: string[] = [];
  const repository = {
    async one(_kind: string, where: AnyRecord, query?: { populate?: string[] }) {
      const row = users.find(user => Object.entries(where).every(([name, value]) => user[name] === value));
      if (!row) return null;
      const result = structuredClone(row);
      if (query?.populate?.includes('roles'))
        result.roles = (row.roles as string[]).map(id => ({
          id,
          name: 'Researcher',
          branding: id.replace('role-', 'brand-'),
        }));
      return result;
    },
    async create(_kind: string, value: AnyRecord) {
      const row = { ...structuredClone(value), id: 'user' };
      users.push(row);
      writes.push('create');
      return structuredClone(row);
    },
    async update(_kind: string, where: AnyRecord, value: AnyRecord) {
      const row = users.find(user => user.id === where.id);
      if (!row) return [];
      Object.assign(row, structuredClone(value));
      writes.push('update');
      return [structuredClone(row)];
    },
    async verifyPassword(_id: string, password: string) {
      return password === 'password';
    },
    async findByApiTokenHash(hash: string, query?: { populate?: string[] }) {
      return hash === createHash('sha256').update(token).digest('base64')
        ? this.one('user', { id: 'user' }, query)
        : null;
    },
  };
  const identity = new HttpIdentity(repository as never);
  const accounts = new AuthenticationAccounts({
    repository,
    log: nothingLogger,
    defaultBrand: () => brands.default,
    getBrand: (name: string) => brands[name],
    authConfig: () => config,
    defaultAuthenticatedRole: (selected: BrandingModel) => selected.roles[0],
    nestedRoles: (_name: string, roles: unknown[]) => roles,
    authorizedEmails: () => ({
      enabled: true,
      domainsAaf: [options.denyEmail ? 'denied.invalid' : 'example.invalid'],
      domainsOidc: [options.denyEmail ? 'denied.invalid' : 'example.invalid'],
    }),
    resolveHook() {
      throw Error('No matrix hook selected');
    },
    event() {},
  } as never);
  const config: AuthBrandConfig = {
    active: options.active === false ? [] : ['aaf', 'oidc'],
    local: options.credentialFields
      ? { usernameField: options.credentialFields[0], passwordField: options.credentialFields[1] }
      : options.customFields
        ? { usernameField: 'loginName', passwordField: 'loginSecret' }
        : {},
    aaf: { opts: { secretOrKey: aafKey } },
    oidc: {
      logoutFromAuthServer: !options.logoutDisabled,
      ...(method === 'oidc-named' ? { identifier: 'institution' } : {}),
      discoverAttemptsMax: 1,
      userInfoSource: options.userInfo ? 'userinfo' : 'tokenset_claims',
      claimMappings: { username: 'preferred_username', email: 'email', name: 'name' },
      opts: {
        issuer: idp.metadata,
        client: { client_id: 'matrix' },
        params: { scope: 'openid profile email', prompt: 'login' },
      },
    } as AuthBrandConfig['oidc'],
  };
  const auth = createHttpAuthentication(identity);
  const app = express();
  app.set('query parser', 'extended');
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const store = new session.MemoryStore();
  app.use(
    session({
      name: 'matrix.sid',
      secret: 'synthetic-matrix-session-secret-32-characters',
      resave: false,
      saveUninitialized: false,
      store,
    })
  );
  app.use(auth.initialize, auth.session);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const url = origin + root;
  if (config.oidc && !Array.isArray(config.oidc))
    Reflect.set(config.oidc.opts.client as object, 'redirect_uris', [
      url + '/user/login_oidc' + (method === 'oidc-named' ? '?id=institution' : ''),
    ]);
  const providers = {
    passport: auth.passport,
    accounts,
    config,
    brand: (req: express.Request) => brands[String(req.params.branding ?? req.session.branding ?? 'default')],
  };
  installLocalAuthentication(providers);
  installAafAuthentication(providers);
  await installOidcAuthentication(providers);
  const router = express.Router();
  app.use(root, router);
  const csrf = createHttpCsrf({ origins: [origin], authenticateBearer: value => identity.bearer(value) });
  mountCsrfTokenRoute(router, csrf);
  router.get('/seed', (req, res) => {
    req.session.branding = 'default';
    req.session.portal = 'rdmp';
    if (typeof req.query.redirUrl === 'string') Reflect.set(req.session, 'redirUrl', req.query.redirUrl);
    if (options.priorLogout) Reflect.set(req.session, 'logoutUrl', idp.issuer + '/logout');
    res.json({ id: req.sessionID });
  });
  router.get(
    '/actor/:brand',
    httpAction(async (req, res) => {
      const actor = await auth.authenticate(req);
      if (!actor) {
        res.sendStatus(401);
        return;
      }
      if (!actor.roles.some(role => role.brandId === 'brand-' + req.params.brand)) {
        res.sendStatus(403);
        return;
      }
      res.json(actor);
    })
  );
  const audits: string[] = [];
  let failures = 0;
  mountAuthenticationRoutes(router, {
    passport: auth.passport,
    identity,
    rootContext: root,
    defaultBrand: 'default',
    defaultPortal: 'rdmp',
    validContext: (name, portal) => !!brands[name] && portal === 'rdmp',
    brandId: name => brands[name].id,
    postLoginPath: (name, portal) => `${root}/${name}/${portal}/welcome`,
    logoutOrigins: options.logoutAllowed === false ? [] : [idp.issuer],
    sessionCookie: { name: 'matrix.sid' },
    credentialFields: options.credentialFields ?? (options.customFields ? ['loginName', 'loginSecret'] : undefined),
    csrf: csrf.protect,
    audit: async action => {
      audits.push(action);
    },
    loginFailure: async () => {
      failures++;
    },
  });
  app.use(httpErrorHandler(nothingLogger));
  async function login(
    input: {
      cookie?: string;
      brand?: string;
      redirUrl?: string;
      password?: string;
      assertion?: string;
      noCsrf?: boolean;
      badState?: boolean;
      credentialBody?: Record<string, unknown> | null;
      credentialQuery?: Record<string, string>;
      credentialForm?: Record<string, string>;
    } = {}
  ) {
    if (isOidc(method)) {
      const params = new URLSearchParams({
        branding: input.brand ?? 'default',
        portal: 'rdmp',
        ...(input.redirUrl === undefined ? {} : { redirUrl: input.redirUrl }),
        ...(method === 'oidc-named' ? { id: 'institution' } : {}),
      });
      const begin = await fetch(url + '/user/begin_oidc?' + params, {
        redirect: 'manual',
        headers: { Cookie: input.cookie ?? '' },
      });
      if (begin.status === 302) await begin.arrayBuffer();
      if (begin.status !== 302) return begin;
      const authorize = await fetch(begin.headers.get('location')!, { redirect: 'manual' });
      await authorize.arrayBuffer();
      const callback = new URL(authorize.headers.get('location')!);
      if (input.badState) callback.searchParams.set('state', 'wrong-state');
      return fetch(callback, { redirect: 'manual', headers: { Cookie: cookie(begin) || input.cookie || '' } });
    }
    if (method === 'bearer')
      return fetch(url + '/actor/' + (input.brand ?? 'default'), {
        headers: {
          Authorization: 'Bearer ' + (input.password === 'wrong' ? 'invalid' : token),
          Cookie: input.cookie ?? '',
        },
      });
    let current = input.cookie ?? '';
    let csrfToken: string | undefined;
    if (method !== 'aaf' && !input.noCsrf) {
      const response = await fetch(url + '/csrfToken', { headers: { Cookie: current } });
      csrfToken = ((await response.json()) as { _csrf: string })._csrf;
      current = cookie(response) || current;
    }
    const body =
      method === 'aaf'
        ? {
            assertion:
              input.assertion ??
              sign(
                {
                  sub: 'subject',
                  'https://aaf.edu.au/attributes': { mail: 'person@example.invalid', cn: 'Provider Person' },
                },
                aafKey,
                { issuer: 'https://rapid.aaf.edu.au', expiresIn: 60 }
              ),
          }
        : options.customFields
          ? { loginName: username(method), loginSecret: input.password ?? 'password' }
          : { username: username(method), password: input.password ?? 'password' };
    const query = new URLSearchParams({
      ...input.credentialQuery,
      ...(input.redirUrl === undefined ? {} : { redirUrl: input.redirUrl }),
    });
    return fetch(url + '/user/login_' + (method === 'aaf' ? 'aaf' : 'local') + (query.size ? '?' + query : ''), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': input.credentialForm ? 'application/x-www-form-urlencoded' : 'application/json',
        'x-source': 'jsclient',
        Cookie: current,
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: input.credentialForm
        ? new URLSearchParams(input.credentialForm)
        : input.credentialBody === null
          ? undefined
          : JSON.stringify({ ...(input.credentialBody ?? body), branding: input.brand ?? 'default', portal: 'rdmp' }),
    });
  }
  async function logout(current: string) {
    const response = await fetch(url + '/csrfToken', { headers: { Cookie: current } });
    const value = (await response.json()) as { _csrf: string };
    return fetch(url + '/default/rdmp/user/logout', {
      method: 'POST',
      redirect: 'manual',
      headers: { Cookie: cookie(response) || current, 'X-CSRF-Token': value._csrf },
    });
  }
  return {
    url,
    idp,
    users,
    writes,
    audits,
    failures: () => failures,
    store,
    login,
    logout,
    close: async () => {
      await close(server);
      await idp.close();
    },
  };
}

describe('authentication method compatibility matrix', function () {
  this.timeout(15000);
  const credentialInputs: {
    name: string;
    fields?: readonly [string, string];
    body: Record<string, unknown> | null;
    query?: Record<string, string>;
    form?: Record<string, string>;
    status?: number;
    allowed?: boolean;
  }[] = [
    { name: 'body', body: { username: 'person', password: 'password' } },
    { name: 'query without body', body: null, query: { username: 'person', password: 'password' } },
    {
      name: 'empty configured fields retain strategy defaults',
      fields: ['', ''],
      body: { username: 'person', password: 'password' },
    },
    { name: 'body username and query password', body: { username: 'person' }, query: { password: 'password' } },
    { name: 'query username and body password', body: { password: 'password' }, query: { username: 'person' } },
    {
      name: 'empty body fields use query fallback',
      body: { username: '', password: '' },
      query: { username: 'person', password: 'password' },
    },
    {
      name: 'body takes precedence',
      body: { username: 'person', password: 'wrong' },
      query: { username: 'person', password: 'password' },
      allowed: false,
    },
    {
      name: 'custom query fields',
      fields: ['loginName', 'loginSecret'],
      body: null,
      query: { loginName: 'person', loginSecret: 'password' },
    },
    {
      name: 'nested body fields',
      fields: ['credentials[name]', 'credentials[secret]'],
      body: { credentials: { name: 'person', secret: 'password' } },
    },
    {
      name: 'nested query fields',
      fields: ['credentials[name]', 'credentials[secret]'],
      body: null,
      query: { 'credentials[name]': 'person', 'credentials[secret]': 'password' },
    },
    {
      name: 'nested form fields',
      fields: ['credentials[name]', 'credentials[secret]'],
      body: null,
      form: { 'credentials[name]': 'person', 'credentials[secret]': 'password' },
    },
    {
      name: 'form username and query password',
      body: null,
      form: { username: 'person' },
      query: { password: 'password' },
    },
    { name: 'missing credential', body: { username: 'person' }, status: 400, allowed: false },
    {
      name: 'structured credential',
      body: { username: ['person'], password: 'password' },
      status: 400,
      allowed: false,
    },
    {
      name: 'overlong credential',
      body: { username: 'person', password: 'x'.repeat(4097) },
      status: 400,
      allowed: false,
    },
  ];
  for (const row of credentialInputs)
    it('local input acceptance: ' + row.name, async () => {
      const f = await fixture('local', { credentialFields: row.fields });
      try {
        const response = await f.login({
          credentialBody: row.body,
          credentialQuery: row.query,
          credentialForm: row.form,
        });
        const result = (await response.json()) as { message: string; user?: unknown };
        assert.equal(response.status, row.status ?? 200, JSON.stringify(result));
        if (row.allowed !== false) {
          assert.equal(result.message, 'Login OK');
          assert(cookie(response));
          assert.deepEqual(f.audits, ['login']);
        } else {
          assert.equal(cookie(response), '');
          assert.deepEqual(f.audits, []);
          if (response.status === 200) assert.equal(result.user, false);
        }
      } finally {
        await f.close();
      }
    });
  for (const method of methods)
    describe(method, () => {
      for (const state of [
        'first',
        'returning',
        'other-brand',
        'disabled',
        'linked',
        'disabled-primary',
        'orphan',
      ] as const)
        it(state, async () => {
          const f = await fixture(method, {
            first: state === 'first',
            brand: state === 'other-brand' ? 'other' : undefined,
            disabled: state === 'disabled',
            linked: ['linked', 'disabled-primary', 'orphan'].includes(state),
            primaryDisabled: state === 'disabled-primary',
            orphan: state === 'orphan',
          });
          try {
            const response = await f.login();
            const body = await response.text();
            const allowed =
              state === 'returning' ||
              state === 'linked' ||
              (state === 'first' && (method === 'aaf' || isOidc(method)));
            assert.equal(
              response.status,
              allowed
                ? method === 'bearer' || method === 'local' || method === 'session'
                  ? 200
                  : 302
                : method === 'local' || method === 'session'
                  ? 200
                  : state === 'other-brand' && method === 'bearer'
                    ? 403
                    : method === 'bearer'
                      ? 401
                      : 403,
              body
            );
            if (allowed) {
              if (method === 'bearer') {
                assert.equal(cookie(response), '');
                assert.equal(f.audits.length, 0);
              } else {
                assert(cookie(response));
                assert.deepEqual(f.audits, ['login']);
                const info = await fetch(f.url + '/user/info', { headers: { Cookie: cookie(response) } });
                const data = (await info.json()) as { user: { id: string } };
                assert.equal(info.status, 200);
                assert.equal(data.user.id, state === 'linked' ? 'primary' : 'user');
              }
              if (state === 'first') {
                assert.equal(f.users.length, 1);
                assert.deepEqual(f.users[0].roles, ['role-default']);
                assert.deepEqual(f.writes, ['create']);
              }
            } else {
              assert.equal(cookie(response), '', 'denied login issues no session');
              if (method === 'local' || method === 'session') assert.equal(JSON.parse(body).user, false);
              if (state === 'first') assert.equal(f.users.length, 0);
            }
            if (['disabled', 'disabled-primary'].includes(state)) assert.equal(f.writes.length, 0);
            if (state === 'other-brand')
              assert.deepEqual(f.users[0].roles, ['role-other'], 'login cannot grant a foreign account new membership');
          } finally {
            await f.close();
          }
        });
      it('invalid credential', async () => {
        const f = await fixture(method);
        try {
          const response = await f.login({ password: 'wrong', badState: true, assertion: 'invalid' });
          const body = await response.text();
          assert.equal(
            response.status,
            method === 'local' || method === 'session' ? 200 : method === 'bearer' ? 401 : 403,
            body
          );
          assert.equal(cookie(response), '');
          assert.equal(f.writes.length, 0);
        } finally {
          await f.close();
        }
      });
      if (method !== 'bearer')
        for (const redirect of ['default', 'query', 'session', 'unsafe'] as const)
          it('redirect and regeneration: ' + redirect, async () => {
            const f = await fixture(method);
            try {
              const target = root + '/default/rdmp/record/edit/123';
              const seed = await fetch(
                f.url + '/seed' + (redirect === 'session' ? '?redirUrl=' + encodeURIComponent(target) : '')
              );
              const initial = cookie(seed);
              await seed.arrayBuffer();
              const response = await f.login({
                cookie: initial,
                redirUrl:
                  redirect === 'query' ? target : redirect === 'unsafe' ? 'https://foreign.invalid/' : undefined,
              });
              const body = await response.text();
              assert.equal(response.status, method === 'local' || method === 'session' ? 200 : 302, body);
              const destination =
                method === 'local' || method === 'session' ? JSON.parse(body).url : response.headers.get('location');
              assert.equal(
                destination,
                redirect === 'query' || redirect === 'session' ? target : root + '/default/rdmp/welcome'
              );
              assert(cookie(response));
              assert.notEqual(cookie(response), initial);
              assert.equal((await fetch(f.url + '/user/info', { headers: { Cookie: initial } })).status, 403);
              const logout = await f.logout(cookie(response));
              await logout.arrayBuffer();
              assert.equal(logout.status, 302);
              const location = logout.headers.get('location')!;
              assert.equal(
                location,
                isOidc(method) ? f.idp.issuer + '/logout?client_id=matrix' : root + '/default/rdmp/home'
              );
              assert.equal((await fetch(f.url + '/user/info', { headers: { Cookie: cookie(response) } })).status, 403);
            } finally {
              await f.close();
            }
          });
      it('inactive external provider settings', async () => {
        const f = await fixture(method, { active: false });
        try {
          const response = await f.login();
          await response.arrayBuffer();
          assert.equal(response.status, method === 'aaf' || isOidc(method) ? 500 : 200);
          if (method === 'aaf' || isOidc(method)) {
            assert.equal(f.writes.length, 0);
            assert.equal((await fetch(f.url + '/user/info', { headers: { Cookie: cookie(response) } })).status, 403);
          }
        } finally {
          await f.close();
        }
      });
      if (isOidc(method))
        for (const option of ['disabled', 'unlisted'] as const)
          it(`provider logout ${option}`, async () => {
            const f = await fixture(method, {
              logoutDisabled: option === 'disabled',
              logoutAllowed: option !== 'unlisted',
            });
            try {
              const response = await f.login();
              await response.arrayBuffer();
              assert.equal(response.status, 302);
              const logout = await f.logout(cookie(response));
              await logout.arrayBuffer();
              assert.equal(logout.status, 302);
              assert.equal(logout.headers.get('location'), root + '/default/rdmp/home');
            } finally {
              await f.close();
            }
          });
      if (method === 'local' || method === 'session')
        it('custom credential fields and CSRF', async () => {
          const f = await fixture(method, { customFields: true });
          try {
            const denied = await f.login({ noCsrf: true });
            await denied.arrayBuffer();
            assert.equal(denied.status, 403);
            assert.equal(f.writes.length, 0);
            const response = await f.login();
            assert.equal(response.status, 200);
            assert.equal(((await response.json()) as { message: string }).message, 'Login OK');
          } finally {
            await f.close();
          }
        });
      if (method === 'local' || method === 'aaf')
        it('replaces an earlier OIDC logout destination', async () => {
          const f = await fixture(method, { priorLogout: true });
          try {
            const seed = await fetch(f.url + '/seed');
            const initial = cookie(seed);
            await seed.arrayBuffer();
            const response = await f.login({ cookie: initial });
            await response.arrayBuffer();
            const logout = await f.logout(cookie(response));
            await logout.arrayBuffer();
            assert.equal(logout.headers.get('location'), root + '/default/rdmp/home');
          } finally {
            await f.close();
          }
        });
      if (isOidc(method))
        it('clears prior provider logout when the completed provider has no logout endpoint', async () => {
          const f = await fixture(method, { priorLogout: true, logoutMissing: true });
          try {
            const seed = await fetch(f.url + '/seed');
            const previous = cookie(seed);
            await seed.arrayBuffer();
            const response = await f.login({ cookie: previous });
            await response.arrayBuffer();
            assert.equal(response.status, 302);
            const logout = await f.logout(cookie(response));
            await logout.arrayBuffer();
            assert.equal(logout.headers.get('location'), root + '/default/rdmp/home');
          } finally {
            await f.close();
          }
        });
      if (method === 'session' || method === 'bearer')
        for (const change of ['disabled', 'role-revoked', 'primary-disabled', 'primary-missing'] as const)
          it('fresh credential resolution after ' + change, async () => {
            const f = await fixture(method, { linked: change.startsWith('primary-') });
            try {
              const response = await f.login();
              await response.arrayBuffer();
              assert.equal(response.status, 200);
              if (change === 'disabled') f.users[0].loginDisabled = true;
              if (change === 'role-revoked') f.users[0].roles = [];
              if (change === 'primary-disabled') f.users[1].loginDisabled = true;
              if (change === 'primary-missing') f.users.splice(1);
              const probe = await fetch(f.url + '/actor/default', {
                headers: method === 'bearer' ? { Authorization: 'Bearer ' + token } : { Cookie: cookie(response) },
              });
              await probe.arrayBuffer();
              assert.equal(probe.status, change === 'role-revoked' ? 403 : 401);
            } finally {
              await f.close();
            }
          });
      if (method === 'aaf' || isOidc(method))
        it('authorized-email refusal on provisioning only', async () => {
          const first = await fixture(method, { first: true, denyEmail: true });
          try {
            const response = await first.login();
            await response.arrayBuffer();
            assert.equal(response.status, 403);
            assert.equal(first.users.length, 0);
          } finally {
            await first.close();
          }
          const returning = await fixture(method, { denyEmail: true });
          try {
            const response = await returning.login();
            await response.arrayBuffer();
            assert.equal(response.status, 302);
          } finally {
            await returning.close();
          }
        });
      if (isOidc(method))
        it('userinfo endpoint and mapped profile', async () => {
          const f = await fixture(method, { first: true, userInfo: true });
          try {
            const response = await f.login();
            await response.arrayBuffer();
            assert.equal(response.status, 302);
            assert.equal(f.users[0].name, 'Provider Person');
            assert.equal(f.users[0].email, 'person@example.invalid');
          } finally {
            await f.close();
          }
        });
    });
});
