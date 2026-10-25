import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import sinon from 'sinon';
import { Passport } from 'passport';
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

