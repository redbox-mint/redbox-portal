import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import sinon from 'sinon';
import { Passport } from 'passport';
import { sign } from 'jsonwebtoken';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { PortalHttp } from '../../src/application/portal/http';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { AuthenticationAccounts } from '../../src/authentication/Accounts';
import * as middleware from '../../src/http/express/middleware';
import * as login from '../../src/http/express/login';
import * as identityPersistence from '../../src/persistence/identity/runtime';
import * as brandPersistence from '../../src/persistence/branding/runtime';
import * as providers from '../../src/http/express/identityProviders';

const local = { usernameField: 'username', passwordField: 'password', postLoginRedir: 'researcher/home' };
const startup = { active: [], local };
const hydrated = { active: ['aaf'], local: { ...local, usernameField: 'loginName', passwordField: 'loginSecret', postLoginRedir: 'institution/welcome' },
  aaf: { opts: { secretOrKey: 'synthetic-production-aaf-key' } } };
const brands = Object.fromEntries(['default', 'other'].map(name => [name,
  Object.assign(new BrandingModel(), { id: 'brand-' + name, name, roles: [{ id: 'role-' + name, name: 'Researcher', branding: 'brand-' + name }] }),
]));

async function binding(accounts: AuthenticationAccounts, settings: Record<string, typeof hydrated | undefined>) {
  const sandbox = sinon.createSandbox();
  const passport = new Passport();
  let input!: login.AuthenticationHttpInput;
  const stop = Error('authentication binding captured');
  sandbox.stub(identityPersistence, 'getIdentityRepositories').returns({} as never);
  sandbox.stub(brandPersistence, 'getBrandingRepository').returns({} as never);
  sandbox.stub(providers, 'installOidcAuthentication').resolves();
  sandbox.stub(middleware, 'prepareHttpMiddleware').callsFake(async (_router, options) => {
    await options.configureAuthentication!(passport);
    return { passport, authenticate: async () => false } as never;
  });
  sandbox.stub(login, 'mountAuthenticationRoutes').callsFake((_router, value) => { input = value; throw stop; });
  const portal = {
    owner: {}, log: nothingLogger,
    config: { server: { publicUrl: 'http://localhost/research', rootContext: '/research' },
      auth: { defaultBrand: 'default', defaultPortal: 'rdmp', loginPath: 'user/login' },
      brandingConfigurationDefaults: { auth: startup }, redboxSession: { name: 'synthetic' }, page: {}, record: { contextVariables: {} }, companion: { enabled: false } },
    data: { reference: {
      branding: { get: () => ({ getBrand: (name: string) => brands[name], getDefault: () => brands.default }) },
      appConfigs: { get: () => ({ getAppConfigurationForBrand: (name: string) => ({ auth: settings[name] }) }) },
    }, accounts: { get: () => accounts } }, providers: {}, models: {}, prepareExtensions: async () => {},
  };
  try {
    await assert.rejects(new PortalHttp(portal as never, { appPath: '.' }).prepare(express.Router(), createServer()), error => error === stop);
    return { passport, input };
  } finally { sandbox.restore(); }
}

describe('production authentication configuration binding', () => {
  it('prepares providers/credential fields from hydrated default-brand settings and resolves redirects from current selected-brand settings', async () => {
    const settings = { default: hydrated, other: { ...hydrated, local: { ...hydrated.local, postLoginRedir: 'other/welcome' } } };
    const { passport, input } = await binding({} as never, settings);
    assert(Reflect.get(passport, '_strategy').call(passport, 'aaf-jwt'), 'hydrated AAF provider is installed');
    const strategy = Reflect.get(passport, '_strategy').call(passport, 'local');
    assert.equal(strategy._usernameField, 'loginName'); assert.equal(strategy._passwordField, 'loginSecret');
    assert.deepEqual(input.credentialFields, ['loginName', 'loginSecret']);
    assert.equal(input.postLoginPath('other', 'rdmp'), '/research/other/rdmp/other/welcome');
    settings.other.local.postLoginRedir = 'changed/welcome';
    assert.equal(input.postLoginPath('other', 'rdmp'), '/research/other/rdmp/changed/welcome');
  });
  it('falls back to startup settings when the hydrated auth block is absent', async () => {
    const { passport, input } = await binding({} as never, {});
    assert.equal(Reflect.get(passport, '_strategy').call(passport, 'aaf-jwt'), undefined);
    assert.deepEqual(input.credentialFields, ['username', 'password']);
    assert.equal(input.postLoginPath('other', 'rdmp'), '/research/other/rdmp/researcher/home');
  });
});

describe('validated AAF callback context in production composition', () => {
  for (const source of ['body', 'query', 'session', 'invalid'] as const) it(source, async () => {
    const users: Array<Record<string, any>> = [];
    const repository = {
      one: async (_kind: string, where: Record<string, unknown>) => users.find(user => Object.entries(where).every(([key, value]) => user[key] === value)) ?? null,
      create: async (_kind: string, value: Record<string, unknown>) => { const user = { ...value, id: 'aaf-user' }; users.push(user); return user; },
    };
    const selected: string[] = [];
    const accounts = new AuthenticationAccounts({ repository, log: nothingLogger,
      defaultBrand: () => brands.default, getBrand: (name: string) => brands[name],
      authConfig: (name: string) => { selected.push(name); return hydrated; },
      defaultAuthenticatedRole: (brand: BrandingModel) => brand.roles[0],
      nestedRoles: (_name: string, roles: unknown[]) => roles, authorizedEmails: () => ({}),
      resolveHook() { throw Error('unused'); }, event() {},
    } as never);
    const { passport, input } = await binding(accounts, { default: hydrated, other: hydrated });
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { ...(source === 'session' ? { branding: 'other', portal: 'rdmp' } : {}), save: (done: () => void) => done() } as never;
      req.logIn = ((_actor: unknown, done: () => void) => done()) as never;
      next();
    });
    login.mountAuthenticationRoutes(app, { ...input, passport,
      identity: { session: async () => users.length ? { id: 'aaf-user', username: 'aaf-user', roles: users[0].roles.map((id: string) => ({ id, brandId: id.replace('role-', 'brand-') })) } : false,
        profile: async () => users[0] } as never,
      audit: async () => {}, loginFailure: async () => {}, renderAuthenticationFailure: undefined,
    });
    app.use(middleware.httpErrorHandler(nothingLogger));
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert(address && typeof address !== 'string');
    try {
      const assertion = sign({ sub: 'aaf-subject', 'https://aaf.edu.au/attributes': { mail: 'person@example.invalid', cn: 'AAF Person' } },
        hydrated.aaf.opts.secretOrKey, { issuer: 'https://rapid.aaf.edu.au', expiresIn: '5m' });
      const response = await fetch(`http://127.0.0.1:${address.port}/user/login_aaf${source === 'query' ? '?branding=other&portal=rdmp' : ''}`, {
        method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion, ...(source === 'body' ? { branding: 'other', portal: 'rdmp' } : source === 'invalid' ? { branding: ['other'], portal: 'rdmp' } : {}) }),
      });
      await response.text();
      assert.equal(response.status, source === 'invalid' ? 400 : 302);
      if (source === 'invalid') { assert.equal(users.length, 0); assert.equal(selected.length, 0); }
      else {
        assert.deepEqual(users[0].roles, ['role-other']); assert(selected.every(name => name === 'other'));
        assert.equal(response.headers.get('location'), '/research/other/rdmp/institution/welcome');
      }
    } finally { await new Promise<void>(done => server.close(() => done())); }
  });
});
