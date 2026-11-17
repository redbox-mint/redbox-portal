import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sinon from 'sinon';
import { sign } from 'jsonwebtoken';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { AuthenticationAccounts } from '../../src/authentication/Accounts';
import type { AuthBrandConfig } from '../../src/authentication/Accounts';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import * as identityPersistence from '../../src/persistence/identity/runtime';

import fastify from 'fastify';
import { sourcePortal } from './sourcePortal';
import { nativeBindingFixture } from './nativeBindingFixture';
import * as sessions from '../../src/http/fastify/session';
import * as nativeAuth from '../../src/http/fastify/authentication';
import * as controllerComposition from '../../src/http/fastify/composition';
import { referenceProductionFixture } from '../http/fastify/referenceProductionFixture';
import { referenceReadDeclarations } from '../../src/http/referenceRoutes';
import { bootstrapDefaultAdministrator } from '../../src/identity/bootstrap';
import { createHash } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { persistenceStatus } from '../../src/persistence/runtime';

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

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });

async function binding(
  accounts: AuthenticationAccounts,
  settings: Record<string, AuthBrandConfig | undefined>,
  startupAuth: AuthBrandConfig = startup
) {
  const f = await nativeBindingFixture({
    server: { publicUrl: 'http://configured.example/research', rootContext: '/research' },
    brandingConfigurationDefaults: { auth: startupAuth },
  });
  const sandbox = sinon.createSandbox();
  const app = fastify();
  let host: Awaited<ReturnType<typeof sourcePortal.createHost>> | undefined;
  let retained = false;
  const close = async () => { sandbox.restore(); await app.close(); await host?.host.stop(); await f.close(); };
  try {
    const ref = f.portal.data.reference;
    sandbox.stub(ref.branding, 'get').returns({ getDefault: () => brands.default,
      getBrand: (name: string) => brands[name] } as never);
    sandbox.stub(ref.appConfigs, 'get').returns({ getAppConfigurationForBrand: (name: string) => ({ auth: settings[name] }) } as never);
    sandbox.stub(f.portal.data.accounts, 'get').returns(accounts);
    sandbox.stub(identityPersistence, 'getIdentityRepositories').returns({} as never);
    // This is an offline binding check. Actual persistence/session behavior is
    // exercised by the real production hosts in the callback tests below.
    sandbox.stub(sessions, 'prepareNativeSessions').resolves({} as never);
    const composition = sandbox.spy(controllerComposition, 'createControllerHost');
    const authentication = sandbox.spy(nativeAuth, 'prepareNativeAuthentication');
    const actions = sandbox.spy(nativeAuth, 'createNativeAuthenticationActions');
    host = await sourcePortal.createHost(f.portal);
    assert.equal(host.host.constructor.name, 'FastifyHost');
    const options = composition.firstCall.args[1];
    await options.security!.prepare!(app as never);
    const prepared = await authentication.firstCall.returnValue;
    retained = true;
    cleanups.push(close);
    return { providerConfig: authentication.firstCall.args[1].config, providers: prepared.providers,
      input: actions.firstCall.args[1] };
  } finally {
    if (!retained) await close();
  }
}

describe('production authentication configuration binding', function () {
  this.timeout(30000);
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
          const { providerConfig, providers, input } = await binding(
            {} as never,
            settings,
            layer === 'hydrated' ? startup : resolved.brandingConfigurationDefaults.auth
          );
          assert.equal(input.credentialFields?.[0], layer === 'core-default' ? 'username' : 'institutionUser');
          assert.equal(input.credentialFields?.[1], layer === 'core-default' ? 'password' : 'institutionPassword');
          assert.equal(!!providerConfig.active?.includes('aaf'), layer !== 'core-default' && method === 'aaf');
          if (layer !== 'core-default' && method.startsWith('oidc')) {
            const url = await providers.begin({ session: {} } as never, method === 'oidc-named' ? 'institution' : undefined);
            assert.equal(new URL(url).origin, 'https://identity.example.invalid');
          } else await assert.rejects(providers.begin({ session: {} } as never, undefined), /Unknown OIDC/);
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
        method === 'aaf' ? /signing key/ : /without provider configuration/
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
    const { providerConfig, providers, input } = await binding({} as never, settings);
    assert(providerConfig.active?.includes('aaf'), 'hydrated AAF provider is installed');
    assert.equal(providerConfig.local?.usernameField, 'loginName');
    assert.equal(providerConfig.local?.passwordField, 'loginSecret');
    assert.deepEqual(input.credentialFields, ['loginName', 'loginSecret']);
    assert.equal(input.postLoginPath('other', 'rdmp'), '/research/other/rdmp/other/welcome');
    settings.other.local.postLoginRedir = 'changed/welcome';
    assert.equal(input.postLoginPath('other', 'rdmp'), '/research/other/rdmp/changed/welcome');
  });
  it('falls back to startup settings when the hydrated auth block is absent', async () => {
    const { providerConfig, providers, input } = await binding({} as never, {});
    assert.equal(providerConfig.active?.includes('aaf'), false);
    assert.deepEqual(input.credentialFields, ['username', 'password']);
    assert.equal(input.postLoginPath('other', 'rdmp'), '/research/other/rdmp/researcher/home');
  });
});

// These callbacks use real production bootstrap, controllers, policies, sessions,
// account mapping and persistence. Express is never constructed by this fixture.
async function callbackFixture(denied: boolean) {
  let portal!: Awaited<ReturnType<typeof nativeBindingFixture>>['portal'];
  const selected: string[] = [];
  const sandbox = sinon.createSandbox();
  let restoreConfig = () => {};
  const f = await referenceProductionFixture(true, undefined, () => {
    const prepare = sessions.prepareNativeSessions;
    sandbox.stub(sessions, 'prepareNativeSessions').callsFake(async (...args) => {
      const store = await prepare(...args);
      const configs = portal.data.reference.appConfigs.get();
      const get = configs.getAppConfigurationForBrand.bind(configs);
      const override = sinon.stub(configs, 'getAppConfigurationForBrand').callsFake(name => {
        selected.push(name);
        return { ...get(name), auth: hydrated,
          authorizedDomainsEmails: denied ? { enabled: true, domainsAaf: ['allowed.invalid'] } : {} } as never;
      });
      restoreConfig = () => override.restore();
      return store;
    });
    return () => { sandbox.restore(); };
  }, {
    declarations: referenceReadDeclarations,
    pages: {}, portals: ['rdmp', 'catalog'], rootContext: '/research',
    hostFactory: async value => {
      portal = value as typeof portal;
      return sourcePortal.createHost(portal);
    },
    configuration: { brandingConfigurationDefaults: { auth: { ...hydrated, local: { ...hydrated.local, usernameField: 'username', passwordField: 'password', default: { adminUser: 'pilot-admin', adminPw: 'pilot-password', email: 'synthetic@example.invalid', token: 'pilot-api-token' } } } } },
    artifacts: async directory => {
      const errorFile = join(directory, 'views/other/catalog/403.ejs');
      const layoutFile = join(directory, 'views/other/_layouts/default.ejs');
      await mkdir(join(errorFile, '..'), { recursive: true });
      await mkdir(join(layoutFile, '..'), { recursive: true });
      await writeFile(errorFile, '<section data-artifact="403:other:catalog">Denied</section>');
      await writeFile(layoutFile, '<section data-artifact="layout:other:catalog"><%- body %></section>');
    },
  });
  assert.equal(f.host.constructor.name, 'FastifyHost');
  const branding = f.data.reference.branding.get();
  const other = branding.getBrand('other')!;
  const repository = identityPersistence.getIdentityRepositories(f.owner);
  const role = await repository.create('role', { name: 'Researcher' });
  await repository.assignBrandRoles(other.id, [role.id]);
  await branding.refreshBrandingCache(other.id);
  selected.length = 0;
  return { ...f, selected, async close() { restoreConfig(); await f.close(); } };
}
async function callbackHeaders(f: Awaited<ReturnType<typeof callbackFixture>>, source: string, portal: string) {
  const response = await fetch(f.url + '/csrfToken');
  const token = (await response.json())._csrf;
  const collection = f.client.db().collection('referenceSessions');
  if (source === 'session') {
    const saved = await collection.findOne();
    assert(saved);
    const value = JSON.parse(saved.session);
    value.branding = 'other'; value.portal = portal;
    await collection.updateOne({ _id: saved._id }, { $set: { session: JSON.stringify(value) } });
  }
  return { Cookie: response.headers.get('set-cookie')!.split(';')[0], 'X-CSRF-Token': token,
    'Content-Type': 'application/json', Accept: 'text/html' };
}
describe('validated AAF callback context in production composition', function () {
  this.timeout(60000);
  for (const source of ['body', 'query', 'session', 'invalid'] as const)
    it(source, async () => {
      const f = await callbackFixture(false);
      try {
        const headers = await callbackHeaders(f, source, 'rdmp');
        const assertion = sign({ sub: 'aaf-subject', 'https://aaf.edu.au/attributes': {
          mail: 'person@example.invalid', cn: 'AAF Person' } }, hydrated.aaf.opts.secretOrKey,
          { issuer: 'https://rapid.aaf.edu.au', expiresIn: '5m' });
        const response = await fetch(f.url + '/user/login_aaf' + (source === 'query' ? '?branding=other&portal=rdmp' : ''), {
          method: 'POST', redirect: 'manual', headers,
          body: JSON.stringify({ assertion, ...(source === 'body' ? { branding: 'other', portal: 'rdmp' }
            : source === 'invalid' ? { branding: ['other'], portal: 'rdmp' } : {}) }),
        });
        await response.text();
        assert.equal(response.status, source === 'invalid' ? 400 : 302);
        const users = await f.client.db().collection('user').find({ type: 'aaf' }).toArray();
        if (source === 'invalid') {
          assert.equal(users.length, 0);
          // Config is also read by CSRF/branding. No callback account lookup is permitted.
          assert.equal(f.selected.filter(name => name === 'other').length, 0);
        } else {
          assert.equal(users.length, 1);
          const account = f.data.accounts.get();
          const repository = identityPersistence.getIdentityRepositories(f.owner);
          const user = await repository.one('user', { username: users[0].username }, { populate: ['roles'] });
          assert(user);
          const other = f.data.reference.branding.get().getBrand('other')!;
          assert(user.roles);
          assert.deepEqual(user.roles.map((role: any) => role.id), [other.roles.find((role: any) => role.name === 'Researcher')!.id]);
          assert(f.selected.includes('other'));
          assert.equal(response.headers.get('location'), '/research/other/rdmp/institution/welcome');
        }
      } finally { await f.close(); }
    });
});
describe('rejected AAF callback context in production composition', function () {
  this.timeout(60000);
  for (const source of ['body', 'query', 'session'] as const)
    for (const reason of ['email', 'assertion'] as const)
      it(`${source}: ${reason}`, async () => {
        const f = await callbackFixture(true);
        try {
          const headers = await callbackHeaders(f, source, 'catalog');
          const assertion = reason === 'assertion' ? 'invalid' : sign({ sub: 'subject',
            'https://aaf.edu.au/attributes': { mail: 'person@denied.invalid', cn: 'Denied Person' } },
            hydrated.aaf.opts.secretOrKey, { issuer: 'https://rapid.aaf.edu.au', expiresIn: '5m' });
          const response = await fetch(f.url + '/user/login_aaf' + (source === 'query' ? '?branding=other&portal=catalog' : ''), {
            method: 'POST', headers, body: JSON.stringify({ assertion, ...(source === 'body' ? { branding: 'other', portal: 'catalog' } : {}) }),
          });
          const html = await response.text();
          assert.equal(response.status, 403, html);
          assert.match(html, /data-artifact="403:other:catalog"/);
          assert.match(html, /data-artifact="layout:other:catalog"/);
          const saved = await f.client.db().collection('referenceSessions').findOne();
          assert(saved);
          const session = JSON.parse(saved.session);
          assert.equal(session.branding, 'other');
          assert.equal(session.portal, 'catalog');
        } finally { await f.close(); }
      });
});

describe('production local administrator credential persistence', function () {
  this.timeout(90000);
  for (const [label, usernameField, passwordField] of [
    ['default', 'username', 'password'],
    ['custom', 'loginName', 'loginSecret'],
  ]) it(`${label} HTTP fields: fresh startup, local login and restart preserve canonical credentials and roles`, async () => {
    const auth = { active: ['local'], local: {
      usernameField, passwordField, postLoginRedir: 'researcher/home',
      default: { adminUser: 'pilot-admin', adminPw: 'pilot-password', email: 'synthetic@example.invalid', token: 'pilot-api-token' },
    } };
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: referenceReadDeclarations, pages: {}, bootstrapAdministrator: true,
      hostFactory: portal => sourcePortal.createHost(portal),
      configuration: { brandingConfigurationDefaults: { auth } },
    });
    let restarted: Awaited<ReturnType<typeof sourcePortal.createApplication>> | undefined;
    let nextHost: Awaited<ReturnType<typeof sourcePortal.createHost>>['host'] | undefined;
    const login = async (url: string, password: string, fields = [usernameField, passwordField]) => {
      const csrf = await fetch(url + '/csrfToken');
      assert.equal(csrf.status, 200);
      const cookie = csrf.headers.get('set-cookie')!.split(';')[0];
      const response = await fetch(url + '/user/login_local', { method: 'POST', redirect: 'manual', headers: {
        Cookie: cookie, 'X-CSRF-Token': (await csrf.json())._csrf,
        'Content-Type': 'application/json', 'X-Source': 'jsclient',
      }, body: JSON.stringify({ branding: 'default', portal: 'rdmp', [fields[0]]: 'pilot-admin', [fields[1]]: password }) });
      return { response, body: await response.json(), cookie };
    };
    try {
      assert.equal(f.host.constructor.name, 'FastifyHost');
      assert.equal(f.portal.application.status().ready, true);
      const repository = identityPersistence.getIdentityRepositories(f.owner);
      const users = f.client.db().collection('user');
      assert.equal(await users.countDocuments({ username: 'pilot-admin' }), 1);
      const seeded = (await users.findOne({ username: 'pilot-admin' }))!;
      assert.notEqual(seeded.password, 'pilot-password');
      assert.equal(seeded.token, createHash('sha256').update('pilot-api-token').digest('base64'));
      if (label === 'custom') {
        assert.equal('loginName' in seeded, false);
        assert.equal('loginSecret' in seeded, false);
        const wrongFields = await login(f.url, 'pilot-password', ['username', 'password']);
        assert.equal(wrongFields.response.status, 400);
        assert.equal(wrongFields.body.user, undefined);
      }
      const administrator = (await repository.one('user', { username: 'pilot-admin' }, { populate: ['roles'] }))!;
      const roles = await repository.list('role', { branding: f.brand.id });
      const adminRole = roles.find(role => role.name === 'Admin')!;
      assert.deepEqual((administrator.roles as { id: string }[]).map(role => role.id).sort(), roles.map(role => role.id).sort());
      const initial = await login(f.url, 'pilot-password');
      assert.equal(initial.response.status, 200);
      assert.equal(initial.body.message, 'Login OK');
      assert.equal(initial.body.user.username, 'pilot-admin');
      assert.notEqual(initial.response.headers.get('set-cookie')!.split(';')[0], initial.cookie, 'login rotates the session');

      // The other local-user persistence writers must also ignore HTTP field names.
      const created = await firstValueFrom(f.data.users.get().addLocalUser('new-local', 'New Local', 'new@example.invalid', 'new-password'));
      assert.equal(created.username, 'new-local');
      assert.equal(await repository.verifyPassword(created.id!, 'new-password'), true);
      await firstValueFrom(f.data.users.get().updateUserDetails(administrator.id, 'Operator Admin', '', 'operator-password'));
      assert.equal(await repository.verifyPassword(administrator.id, 'operator-password'), true);
      const saved = (await users.findOne({ username: 'pilot-admin' }))!;
      await repository.replaceMemberships('user', administrator.id, [adminRole.id]);

      // An unrelated matching account cannot acquire administrator membership.
      const reader = (await repository.one('user', { username: 'reader' }, { populate: ['roles'] }))!;
      await assert.rejects(bootstrapDefaultAdministrator({ repository, roles, administrator: adminRole,
        auth: { ...auth, local: { ...auth.local, default: { ...auth.local.default, adminUser: 'reader' } } } }), /without its administrator role/);
      assert.deepEqual((await repository.one('user', { id: reader.id }, { populate: ['roles'] }))!.roles, reader.roles);
      await assert.rejects(bootstrapDefaultAdministrator({ repository, roles: [], administrator: adminRole, auth }), /selected bootstrap roles/);

      await f.host.stop();
      assert.equal(persistenceStatus(f.owner).pools, 0);
      restarted = await sourcePortal.createApplication(f.applicationOptions);
      nextHost = (await sourcePortal.createHost(restarted)).host;
      assert.equal(nextHost.constructor.name, 'FastifyHost');
      await nextHost.initialize();
      await nextHost.activate();
      assert.equal(restarted.application.status().ready, true);
      const active = identityPersistence.getIdentityRepositories(restarted.owner);
      assert.equal(await users.countDocuments({ username: 'pilot-admin' }), 1);
      const after = (await users.findOne({ username: 'pilot-admin' }))!;
      assert.equal(after.password, saved.password);
      assert.equal(after.token, saved.token);
      assert.equal(after.name, 'Operator Admin');
      assert.deepEqual(((await active.one('user', { id: administrator.id }, { populate: ['roles'] }))!.roles as { id: string }[]).map(role => role.id), [adminRole.id]);
      assert.equal(await active.verifyPassword(administrator.id, 'pilot-password'), false);
      const url = 'http://127.0.0.1:' + nextHost.address()!.port + restarted.config.server.rootContext;
      const resumed = await login(url, 'operator-password');
      assert.equal(resumed.response.status, 200);
      assert.equal(resumed.body.message, 'Login OK');
      assert.equal(resumed.body.user.id, administrator.id);
      await nextHost.stop();
      assert.equal(persistenceStatus(restarted.owner).pools, 0);
    } finally {
      try { if (nextHost) await nextHost.stop(); else await restarted?.application.stop(); }
      finally { await f.close(); }
    }
  });
});
