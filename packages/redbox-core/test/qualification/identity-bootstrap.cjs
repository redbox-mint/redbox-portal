// Disposable real-Mongo bootstrap qualification; no Sails setup or fixture users.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { MongoClient } = require('mongodb');
const { ApplicationRuntime } = require('../../dist/application');
const runtime = require('../../dist/persistence/runtime');
const { ensureBrandingPersistenceIndexes } = require('../../dist/persistence/branding/preflight');
const { bootstrapDefaultAdministrator, bootstrapPathRules } = require('../../dist/identity');

test(
  'owned identity bootstrap: awaited membership, restart, credentials and stored policy',
  { timeout: 30000 },
  async () => {
    assert.equal(global.sails, undefined);
    const url = process.env.SR_IDENTITY_BOOTSTRAP_MONGO_URL;
    assert(url, 'SR_IDENTITY_BOOTSTRAP_MONGO_URL is required; this qualification cannot skip');
    assert.equal(new URL(url).pathname, '/sr_p7_identity_bootstrap');
    const native = await new MongoClient(url).connect();
    const owner = { config: { datastores: { mongodb: { url }, redboxStorage: { url } } }, log: console };
    let app;
    let releaseMembership;
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0, 'use a fresh disposable database');
      await runtime.initializePersistence(owner);
      await ensureBrandingPersistenceIndexes(owner);
      await runtime.initializeBrandingPersistence(owner);
      const effects = [];
      await runtime.initializeIdentityPersistence(owner, {
        assignPendingAccess: async user => effects.push(user.username),
      });
      const repository = runtime.getIdentityRepositories(owner);
      const brand = await runtime.getBrandingRepository(owner).createBrand({ name: 'default' });
      const roles = [];
      for (const name of ['Admin', 'Librarians', 'Researcher', 'Guest'])
        roles.push(await repository.create('role', { name, branding: brand.id }));
      const rules = Object.freeze([
        Object.freeze({ path: '/:branding/:portal/admin(/*)', role: 'Admin', can_update: true }),
        Object.freeze({ path: '/:branding/:portal/home', role: 'Guest', can_read: true }),
      ]);
      const auth = {
        local: {
          default: {
            adminUser: 'bootstrap-admin',
            adminPw: 'bootstrap-password',
            email: 'bootstrap@example.invalid',
            token: 'bootstrap-token',
          },
        },
      };
      const input = { repository, auth, roles, administrator: roles[0] };
      await assert.rejects(
        bootstrapPathRules({
          repository,
          brandId: brand.id,
          rules: [...rules, { path: '/missing', role: 'Missing' }],
          readRules: () => repository.list('pathrule'),
          roleId: name => roles.find(role => role.name === name)?.id,
        }),
        /unavailable role/
      );
      assert.equal(
        await native.db().collection('pathrule').countDocuments(),
        0,
        'validate every role before the first policy write'
      );
      let user;
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      releaseMembership = release.resolve;
      app = new ApplicationRuntime(owner, [], {
        coreBootstrap: [
          {
            name: 'identity',
            run: async () => {
              user = await bootstrapDefaultAdministrator({
                ...input,
                repository: {
                  ...repository,
                  addMemberships: async (...args) => {
                    await repository.addMemberships(...args);
                    entered.resolve();
                    await release.promise;
                  },
                },
              });
              await bootstrapPathRules({
                repository,
                brandId: brand.id,
                rules,
                readRules: () => repository.list('pathrule'),
                roleId: name => roles.find(role => role.name === name)?.id,
              });
            },
          },
        ],
      });
      const initializing = app.initialize();
      await Promise.race([entered.promise, initializing]);
      assert.equal(app.status().state, 'initializing');
      assert.equal(app.status().ready, false);
      await assert.rejects(app.activate(), /Await application initialization/);
      release.resolve();
      await initializing;
      await app.activate();
      assert.equal(app.status().ready, true);
      const loaded = await repository.one('user', { id: user.id }, { populate: ['roles'] });
      assert.equal(loaded.roles.length, 4);
      assert.equal(await native.db().collection('role_users__user_roles').countDocuments(), 4);
      for (const role of roles) {
        const saved = await repository.one('role', { id: role.id }, { populate: ['users'] });
        assert.deepEqual(
          saved.users.map(item => item.id),
          [user.id]
        );
      }
      assert.equal(await repository.verifyPassword(user.id, 'bootstrap-password'), true);
      const credentialsBefore = await native.db().collection('user').findOne({ username: 'bootstrap-admin' });
      assert.notEqual(credentialsBefore.password, 'bootstrap-password');
      assert.equal(credentialsBefore.token, createHash('sha256').update('bootstrap-token').digest('base64'));
      assert.equal('password' in loaded, false);
      assert.equal('token' in loaded, false);
      assert.equal(rules[0].role, 'Admin', 'bootstrap must not replace immutable role names with database IDs');
      const policies = await repository.list('pathrule');
      assert.equal(policies.length, 2);
      await repository.update('pathrule', { id: policies[0].id }, { can_update: false, can_read: true });
      await repository.replaceMemberships('user', user.id, [roles[0].id]);
      await app.stop();

      const nextOwner = { config: owner.config, log: console };
      const next = new ApplicationRuntime(
        nextOwner,
        [
          {
            name: 'identityPersistence',
            create: () => ({
              initialize: () =>
                runtime.initializeIdentityPersistence(nextOwner, {
                  assignPendingAccess: async user => effects.push('restart:' + user.username),
                }),
              close: async () => {},
            }),
          },
        ],
        {
          coreBootstrap: [
            {
              name: 'identity',
              run: async () => {
                const active = runtime.getIdentityRepositories(nextOwner);
                user = await bootstrapDefaultAdministrator({
                  ...input,
                  repository: active,
                  auth: {
                    local: {
                      default: { adminUser: 'bootstrap-admin', adminPw: 'changed-password', token: 'changed-token' },
                    },
                  },
                });
                await bootstrapPathRules({
                  repository: active,
                  brandId: brand.id,
                  rules: [],
                  readRules: () => active.list('pathrule'),
                  roleId: name => roles.find(role => role.name === name)?.id,
                });
              },
            },
          ],
        }
      );
      app = next;
      await next.initialize();
      await next.activate();
      const active = runtime.getIdentityRepositories(nextOwner);
      assert.equal((await active.one('user', { id: user.id }, { populate: ['roles'] })).roles.length, 1);
      assert.equal(await native.db().collection('role_users__user_roles').countDocuments(), 1);
      const credentialsAfter = await native.db().collection('user').findOne({ username: 'bootstrap-admin' });
      assert.equal(credentialsAfter.password, credentialsBefore.password);
      assert.equal(credentialsAfter.token, credentialsBefore.token);
      assert.equal(await active.verifyPassword(user.id, 'bootstrap-password'), true);
      assert.equal(await active.verifyPassword(user.id, 'changed-password'), false);
      assert.equal((await active.one('pathrule', { id: policies[0].id })).can_update, false);
      const unrelated = await active.create('user', {
        username: 'unrelated',
        type: 'local',
        name: 'Unrelated User',
        email: 'unrelated@example.invalid',
        password: 'unrelated-password',
      });
      await assert.rejects(
        bootstrapDefaultAdministrator({
          ...input,
          repository: active,
          auth: { local: { default: { adminUser: 'unrelated', adminPw: 'new-password' } } },
        }),
        /without its administrator role/
      );
      assert.equal((await active.one('user', { id: unrelated.id }, { populate: ['roles'] })).roles.length, 0);
      assert.equal(await active.verifyPassword(unrelated.id, 'unrelated-password'), true);
      assert.deepEqual(effects, ['restart:unrelated']);
      await assert.rejects(
        runtime.initializeIdentityPersistence(nextOwner, { assignPendingAccess: async () => {} }),
        /already bound/
      );
      await next.stop();
      assert.equal(next.status().persistence.pools, 0);
      assert.equal(next.status().persistence.prismaClients, 0);
      const forbidden = Object.keys(require.cache).filter(file =>
        /[/\\](compat[/\\]sails|CoreService\.js|CoreBase\.js|node_modules[/\\]sails[/\\])/.test(file)
      );
      assert.deepEqual(forbidden, [], 'the owned identity import graph must exclude the comparison host');
    } finally {
      releaseMembership?.();
      const stops = await Promise.allSettled([app?.stop(), runtime.cleanupPersistence(owner)]);
      try {
        await native.db().dropDatabase();
      } finally {
        await native.close();
      }
      for (const result of stops) if (result.status === 'rejected') throw result.reason;
    }
  }
);
