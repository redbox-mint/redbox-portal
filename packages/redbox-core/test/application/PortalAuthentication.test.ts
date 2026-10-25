import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import sinon from 'sinon';
import { Passport } from 'passport';
import { sign } from 'jsonwebtoken';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { PortalHttp } from '../../src/application/portal/http';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { AuthenticationAccounts } from '../../src/authentication/Accounts';
import type { AuthBrandConfig } from '../../src/authentication/Accounts';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import * as middleware from '../../src/http/express/middleware';
import * as login from '../../src/http/express/login';
import * as pages from '../../src/http/express/pages';
import * as identityPersistence from '../../src/persistence/identity/runtime';
import * as brandPersistence from '../../src/persistence/branding/runtime';

const local = { usernameField: 'username', passwordField: 'password', postLoginRedir: 'researcher/home' };
const startup = { active: [], local };
const hydrated = {
  active: ['aaf'],
  local: { ...local, usernameField: 'loginName', passwordField: 'loginSecret', postLoginRedir: 'institution/welcome' },
  aaf: { opts: { secretOrKey: 'synthetic-production-aaf-key' } },
};
const brands = Object.fromEntries(
  ['default', 'other'].map(name => [
    name,
    Object.assign(new BrandingModel(), {
      id: 'brand-' + name,
      name,
      roles: [{ id: 'role-' + name, name: 'Researcher', branding: 'brand-' + name }],
    }),
  ])
);

async function binding(
  accounts: AuthenticationAccounts,
  settings: Record<string, AuthBrandConfig | undefined>,
  startupAuth: AuthBrandConfig = startup,
  failureRendering = false
) {
  const sandbox = sinon.createSandbox();
  const passport = new Passport();
  let input!: login.AuthenticationHttpInput;
  const stop = Error('authentication binding captured');
  sandbox.stub(identityPersistence, 'getIdentityRepositories').returns({} as never);
  sandbox
    .stub(brandPersistence, 'getBrandingRepository')
    .returns({ getBrand: async (query: { name: string }) => brands[query.name] } as never);
  sandbox.stub(middleware, 'prepareHttpMiddleware').callsFake(async (_router, options) => {
    await options.configureAuthentication!(passport);
    return { passport, authenticate: async () => false } as never;
  });
  sandbox.stub(login, 'mountAuthenticationRoutes').callsFake((_router, value) => {
    input = value;
    if (!failureRendering) throw stop;
  });
  if (failureRendering)
    sandbox.stub(pages, 'mountPageRoot').callsFake(() => {
      throw stop;
    });
  const portal = {
    owner: {},
    log: nothingLogger,
    config: {
      server: { publicUrl: 'http://localhost/research', rootContext: '/research' },
      auth: { defaultBrand: 'default', defaultPortal: 'rdmp', loginPath: 'user/login' },
      brandingConfigurationDefaults: { auth: startupAuth },
      redboxSession: { name: 'synthetic' },
      page: {},
      record: { contextVariables: {} },
      companion: { enabled: false },
    },
    data: {
      reference: {
        branding: {
          get: () => ({
            getBrand: (name: string) => brands[name],
            getDefault: () => brands.default,
            getBrandById: (id: string) => Object.values(brands).find(brand => brand.id === id),
            getActiveTypefaceFontInfo: () => null,
          }),
        },
        appConfigs: { get: () => ({ getAppConfigurationForBrand: (name: string) => ({ auth: settings[name] }) }) },
        forms: { get: () => ({}) },
        types: { get: () => ({}) },
        dashboards: { get: () => ({}) },
        reports: { get: () => ({}) },
        entries: { get: () => ({ listLanguages: async () => [] }) },
        translation: { get: () => ({ t: (_brand: string, _values: unknown, _language: string, key: string) => key }) },
      },
      accounts: { get: () => accounts },
    },
    providers: {},
    models: {},
    prepareExtensions: async () => {},
  };
  try {
    const host = new PortalHttp(portal as never, { appPath: '.', portals: ['rdmp', 'catalog'] });
    Reflect.set(host, 'artifacts', {
      bundleHash: () => '',
      view: (view: string, brand: string, portal: string) => [view, brand, portal].join(':'),
      layout: (brand: string, portal: string) => ['layout', brand, portal].join(':'),
      render: (file: string, locals: { body?: string }) =>
        `<section data-artifact="${file}">${locals.body ?? ''}</section>`,
    });
    await host.prepare(express.Router(), createServer()).catch(error => {
      if (error !== stop) throw error;
    });
    return { passport, input };
  } finally {
    sandbox.restore();
  }
}

describe('production authentication configuration binding', () => {
  for (const method of ['local', 'aaf', 'oidc', 'oidc-named'] as const) {
    for (const layer of ['core-default', 'extension', 'application', 'environment', 'local', 'hydrated'] as const)
      it(`${method} from ${layer}`, async () => {
        const directory = await mkdtemp(join(tmpdir(), 'sr-auth-layer-'));
        try {
          const config = {
            active: method === 'local' ? [] : [method === 'aaf' ? 'aaf' : 'oidc'],
            local: {
              usernameField: 'institutionUser',
              passwordField: 'institutionPassword',
              postLoginRedir: layer + '/welcome',
            },
            aaf: { opts: { secretOrKey: 'synthetic-layer-aaf-key' } },
            oidc: {
              discoverAttemptsMax: 1,
              ...(method === 'oidc-named' ? { identifier: 'institution' } : {}),
              opts: {
                issuer: {
                  issuer: 'https://identity.example.invalid',
                  authorization_endpoint: 'https://identity.example.invalid/authorize',
                  token_endpoint: 'https://identity.example.invalid/token',
                  jwks_uri: 'https://identity.example.invalid/jwks',
                },
                client: { client_id: 'institution' },
              },
            },
          };
          const selectedConfig = { ...config, oidc: method === 'oidc-named' ? [config.oidc] : config.oidc };
          const values = { brandingConfigurationDefaults: { auth: selectedConfig } };
          const file = join(directory, 'configuration.cjs');
          await writeFile(file, 'module.exports = ' + JSON.stringify(values));
          const resolved = await loadPortalConfiguration({
            env: { REDBOX_SESSION_SECRET: 'synthetic-layer-session-secret-over-32-characters' },
            ...(layer === 'extension'
              ? { extensions: { providers: [{ name: 'institution', declaration: { config: values } }] } as never }
              : {}),
            ...(['application', 'environment', 'local'].includes(layer) ? { files: { [layer]: file } } : {}),
          });
          const settings = layer === 'hydrated' ? { default: selectedConfig } : {};
          const { passport, input } = await binding(
            {} as never,
            settings,
            layer === 'hydrated' ? startup : resolved.brandingConfigurationDefaults.auth
          );
          const get = (name: string) => Reflect.get(passport, '_strategy').call(passport, name);
          assert(get('local'), 'local remains installed independently of active provider list');
          assert.equal(get('local')._usernameField, layer === 'core-default' ? 'username' : 'institutionUser');
          assert.equal(get('local')._passwordField, layer === 'core-default' ? 'password' : 'institutionPassword');
          assert.equal(!!get('aaf-jwt'), layer !== 'core-default' && method === 'aaf');
          assert.equal(
            !!get(method === 'oidc-named' ? 'oidc-institution' : 'oidc'),
            layer !== 'core-default' && method.startsWith('oidc')
          );
          assert.equal(
            input.postLoginPath('default', 'rdmp'),
            '/research/default/rdmp/' + (layer === 'core-default' ? 'researcher/home' : layer + '/welcome')
          );
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      });
  }
  for (const method of ['aaf', 'oidc'] as const)
    it(`refuses active ${method} without required provider settings before admission`, async () => {
      await assert.rejects(
        binding({} as never, { default: { active: [method] } }),
        method === 'aaf' ? /secret or key/ : /without provider configuration/
      );
    });
  it('accepts only documented auth environment inputs and rejects auth CLI selectors', async () => {
    const env = {
      REDBOX_SESSION_SECRET: 'synthetic-layer-session-secret-over-32-characters',
      REDBOX_ADMIN_USER: 'admin-from-env',
      REDBOX_ADMIN_PASSWORD: 'synthetic-env-password',
      REDBOX_ADMIN_EMAIL: 'admin@example.invalid',
      REDBOX_ADMIN_TOKEN: 'synthetic-env-token',
    };
    const resolved = await loadPortalConfiguration({ env });
    assert.deepEqual(resolved.brandingConfigurationDefaults.auth.local.default, {
      adminUser: 'admin-from-env',
      adminPw: 'synthetic-env-password',
      email: 'admin@example.invalid',
      token: 'synthetic-env-token',
    });
    await assert.rejects(loadPortalConfiguration({ env: { ...env, REDBOX_AUTH_ACTIVE: 'oidc' } }), /unsupported input/);
    await assert.rejects(loadPortalConfiguration({ env, argv: ['--auth=oidc'] }), /unsupported input/);
  });
  it('prepares providers/credential fields from hydrated default-brand settings and resolves redirects from current selected-brand settings', async () => {
    const settings = {
      default: hydrated,
      other: { ...hydrated, local: { ...hydrated.local, postLoginRedir: 'other/welcome' } },
    };
    const { passport, input } = await binding({} as never, settings);
    assert(Reflect.get(passport, '_strategy').call(passport, 'aaf-jwt'), 'hydrated AAF provider is installed');
    const strategy = Reflect.get(passport, '_strategy').call(passport, 'local');
    assert.equal(strategy._usernameField, 'loginName');
    assert.equal(strategy._passwordField, 'loginSecret');
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
  for (const source of ['body', 'query', 'session', 'invalid'] as const)
    it(source, async () => {
      const users: Array<Record<string, any>> = [];
      const repository = {
        one: async (_kind: string, where: Record<string, unknown>) =>
          users.find(user => Object.entries(where).every(([key, value]) => user[key] === value)) ?? null,
        create: async (_kind: string, value: Record<string, unknown>) => {
          const user = { ...value, id: 'aaf-user' };
          users.push(user);
          return user;
        },
      };
      const selected: string[] = [];
      const accounts = new AuthenticationAccounts({
        repository,
        log: nothingLogger,
        defaultBrand: () => brands.default,
        getBrand: (name: string) => brands[name],
        authConfig: (name: string) => {
          selected.push(name);
          return hydrated;
        },
        defaultAuthenticatedRole: (brand: BrandingModel) => brand.roles[0],
        nestedRoles: (_name: string, roles: unknown[]) => roles,
        authorizedEmails: () => ({}),
        resolveHook() {
          throw Error('unused');
        },
        event() {},
      } as never);
      const { passport, input } = await binding(accounts, { default: hydrated, other: hydrated });
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.session = {
          ...(source === 'session' ? { branding: 'other', portal: 'rdmp' } : {}),
          save: (done: () => void) => done(),
        } as never;
        req.logIn = ((_actor: unknown, done: () => void) => done()) as never;
        next();
      });
      login.mountAuthenticationRoutes(app, {
        ...input,
        passport,
        identity: {
          session: async () =>
            users.length
              ? {
                  id: 'aaf-user',
                  username: 'aaf-user',
                  roles: users[0].roles.map((id: string) => ({ id, brandId: id.replace('role-', 'brand-') })),
                }
              : false,
          profile: async () => users[0],
        } as never,
        audit: async () => {},
        loginFailure: async () => {},
        renderAuthenticationFailure: undefined,
      });
      app.use(middleware.httpErrorHandler(nothingLogger));
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      assert(address && typeof address !== 'string');
      try {
        const assertion = sign(
          { sub: 'aaf-subject', 'https://aaf.edu.au/attributes': { mail: 'person@example.invalid', cn: 'AAF Person' } },
          hydrated.aaf.opts.secretOrKey,
          { issuer: 'https://rapid.aaf.edu.au', expiresIn: '5m' }
        );
        const response = await fetch(
          `http://127.0.0.1:${address.port}/user/login_aaf${source === 'query' ? '?branding=other&portal=rdmp' : ''}`,
          {
            method: 'POST',
            redirect: 'manual',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assertion,
              ...(source === 'body'
                ? { branding: 'other', portal: 'rdmp' }
                : source === 'invalid'
                  ? { branding: ['other'], portal: 'rdmp' }
                  : {}),
            }),
          }
        );
        await response.text();
        assert.equal(response.status, source === 'invalid' ? 400 : 302);
        if (source === 'invalid') {
          assert.equal(users.length, 0);
          assert.equal(selected.length, 0);
        } else {
          assert.deepEqual(users[0].roles, ['role-other']);
          assert(selected.every(name => name === 'other'));
          assert.equal(response.headers.get('location'), '/research/other/rdmp/institution/welcome');
        }
      } finally {
        await new Promise<void>(done => server.close(() => done()));
      }
    });
});

describe('rejected AAF callback context in production composition', () => {
  for (const source of ['body', 'query', 'session'] as const)
    for (const reason of ['email', 'assertion'] as const)
      it(`${source}: ${reason}`, async () => {
        const accounts = new AuthenticationAccounts({
          repository: { one: async () => null },
          log: nothingLogger,
          defaultBrand: () => brands.default,
          getBrand: (name: string) => brands[name],
          authConfig: () => hydrated,
          defaultAuthenticatedRole: (brand: BrandingModel) => brand.roles[0],
          nestedRoles: (_name: string, roles: unknown[]) => roles,
          authorizedEmails: () => ({ enabled: true, domainsAaf: ['allowed.invalid'] }),
          resolveHook() {
            throw Error('unused');
          },
          event() {},
        } as never);
        const { passport, input } = await binding(accounts, { default: hydrated, other: hydrated }, startup, true);
        const app = express();
        app.use(express.json());
        let saved!: { branding: string; portal: string };
        app.use((req, _res, next) => {
          saved =
            source === 'session' ? { branding: 'other', portal: 'catalog' } : { branding: 'default', portal: 'rdmp' };
          req.session = saved as never;
          next();
        });
        login.mountAuthenticationRoutes(app, { ...input, passport, loginFailure: async () => {} });
        app.use(middleware.httpErrorHandler(nothingLogger));
        const server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const address = server.address();
        assert(address && typeof address !== 'string');
        try {
          const assertion =
            reason === 'assertion'
              ? 'invalid'
              : sign(
                  {
                    sub: 'subject',
                    'https://aaf.edu.au/attributes': { mail: 'person@denied.invalid', cn: 'Denied Person' },
                  },
                  hydrated.aaf.opts.secretOrKey,
                  { issuer: 'https://rapid.aaf.edu.au', expiresIn: '5m' }
                );
          const response = await fetch(
            `http://127.0.0.1:${address.port}/user/login_aaf${source === 'query' ? '?branding=other&portal=catalog' : ''}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'text/html' },
              body: JSON.stringify({
                assertion,
                ...(source === 'body' ? { branding: 'other', portal: 'catalog' } : {}),
              }),
            }
          );
          const html = await response.text();
          assert.equal(response.status, 403, html);
          assert.match(html, /data-artifact="403:other:catalog"/);
          assert.match(html, /data-artifact="layout:other:catalog"/);
          assert.equal(saved.branding, 'other');
          assert.equal(saved.portal, 'catalog');
        } finally {
          await new Promise<void>(done => server.close(() => done()));
        }
      });
});
