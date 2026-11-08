import sinon from 'sinon';
import { productionConfigurationCases } from './productionConfigurationCases';
import { productionCompositionInputCases } from './productionCompositionInputs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { Document } from 'mongodb';
import { inventory, inventoryRegistration, productionInventoryOrder } from './inventory-fixture';
import { composeRoutes, coreRoutePrecedence } from '../../../dist/http/fastify/routes';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { initializeIdentityPersistence, getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { ExpressHost } from '../../../src/http/express/ExpressHost';
import { prepareHttpMiddleware } from '../../../src/http/express/middleware';
import { HttpIdentity } from '../../../src/http/express/identity';
import {
  packed,
  preparePilot,
  fixture,
  login,
  observe,
  normalize,
  target,
  cookie,
  rollbackSecret,
  verifyCookies,
  rootSecret,
} from './pilotMongoFixture';
describe('FM-019 production controller/session/domain installed pilot', function () {
  this.timeout(360000);
  before(async () => {
    await preparePilot();
  });
  after(async () => {
    await packed?.close();
  });
  it('bootstraps API2 once and gives the host the same priority-ordered installation and module graph', async () => {
    const requireInstalled = createRequire(packed.directory + '/package.json');
    const production = requireInstalled('@researchdatabox/redbox-core/portal');
    await assert.rejects(
      production.createPortalApplication({ appPath: packed.application, log: { warn() {} } }),
      /expected apiVersion 1 declaration/
    );
    const resolution = requireInstalled(
      packed.directory + '/node_modules/@researchdatabox/redbox-core/dist/extensions/v2.js'
    );
    const composition = requireInstalled(
      packed.directory + '/node_modules/@researchdatabox/redbox-core/dist/http/fastify/composition.js'
    );
    const controllers = requireInstalled(
      packed.directory + '/node_modules/@researchdatabox/redbox-core/dist/http/fastify/registration.js'
    );
    const resolve = sinon.spy(resolution, 'resolveExtensionsV2');
    const host = sinon.spy(composition, 'createControllerHost');
    const compose = sinon.spy(controllers, 'composeControllers');
    try {
      const f = await fixture(true);
      try {
        assert.equal(resolve.callCount, 1);
        assert.equal(compose.callCount, 1);
        assert.equal(host.callCount, 1);
        const installation = f.nativePlan!.resolved;
        assert.strictEqual(host.firstCall.args[1].composition, installation);
        assert.strictEqual(host.firstCall.args[1].moduleNames, installation.moduleNames);
        assert(installation.moduleNames.includes('PilotModule'));
        assert.deepEqual(
          installation.providers.map(p => p.name),
          ['core', 'fm019-api2-pilot', 'z-base', 'a-replacement']
        );
        assert.deepEqual(installation.hookLoadPriority, ['a-replacement']);
        assert(Object.isFrozen(installation));
        assert(Object.isFrozen(installation.providers[1].declaration));
        assert(Object.isFrozen(installation.controllerPlan.controllers));
        for (const name of [
          'providers',
          'moduleNames',
          'bindings',
          'routeRegistrations',
          'controllerRegistrations',
          'hookRegistrations',
        ] as const)
          assert(Object.isFrozen(installation[name]));
        const response = await fetch(f.url + '/installation-order');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { provider: 'a-replacement', initialized: true });
        const custom = f.owner.config.custom;
        assert(custom && typeof custom === 'object' && 'installationOrder' in custom);
        assert.equal(custom.installationOrder, 'a-replacement');
      } finally {
        await f.close();
      }
    } finally {
      resolve.restore();
      host.restore();
      compose.restore();
    }
  });
  productionConfigurationCases();
  productionCompositionInputCases();
  it('applies selected installed-API denial over real HTTP, with an allowed positive control', async () => {
    for (const denied of [false, true]) {
      const policyConfiguration = { '*': true, ProbeController: { read: !denied } };
      const f = await fixture(true, { policyConfiguration });
      try {
        const route = f.nativePlan!.resolved.routeRegistrations.find(r => r.declaration.name === 'installation.probe');
        assert(route);
        assert.strictEqual(route.apiConfiguration, f.nativePlan!.resolved.policyConfiguration);
        assert.deepEqual(route.effectivePolicies, denied ? ['nocache', false] : ['nocache']);
        for (const method of ['GET', 'HEAD']) {
          const response = await fetch(f.url + '/installed-probe', { method });
          assert.equal(response.status, denied ? 403 : 200);
          assert.match(response.headers.get('cache-control')!, /no-store/);
          const body = await response.text();
          if (method === 'HEAD') assert.equal(body, '');
          else if (!denied) assert.deepEqual(JSON.parse(body), { reached: true });
          else assert(!body.includes('reached'));
        }
      } finally {
        await f.close();
      }
    }
  });
  it('retains full inventory rejection for both deferred TUS splits', async () => {
    const consumerRequire = createRequire(packed.directory + '/package.json');
    const { createPortalFastifyApplication } = consumerRequire('@researchdatabox/redbox-core/portal');
    for (const declarations of [undefined, []])
      await assert.rejects(
        Reflect.apply(createPortalFastifyApplication, undefined, [{ http: { declarations } }]),
        /explicit nonempty conversion scope/
      );
    const rows = productionInventoryOrder().map(inventoryRegistration);
    const policies = [...new Set(rows.flatMap(r => r.effectivePolicies ?? []).filter((x): x is string => x !== false))];
    await assert.rejects(
      composeRoutes(rows, { policyNames: policies, precedence: coreRoutePrecedence, legacyOrder: true }),
      error => {
        assert.match(String(error), /route overlap/);
        assert.equal((String(error).match(/requires named precedence with a reason/g) ?? []).length, 2);
        return true;
      }
    );
    assert.equal(inventory.routes.length, 335);
  });
  it('preserves selected production policy denial through assembly, HEAD and replacement', async () => {
    const policyConfiguration = { 'webservice/RecordController': { getMeta: false, updateMeta: false } };
    for (const native of [false, true]) {
      const f = await fixture(native, { policyConfiguration });
      try {
        const auth = await login(f, native);
        for (const method of ['GET', 'HEAD', 'PUT']) {
          const r = await fetch(f.url + target, {
            method,
            headers: { Cookie: auth.cookie, 'Content-Type': 'application/json' },
            ...(method === 'PUT' ? { body: '[]' } : {}),
          });
          assert.equal(r.status, 403);
          await r.text();
        }
        const saved = await f.storage.getMeta('fm019-record');
        assert.equal(saved.metadata.title, 'Original');
        assert.equal(saved.revision, 0);
        if (native)
          for (const route of f.nativePlan!.resolved.routeRegistrations.filter(
            r => r.declaration.api?.controller === 'webservice/RecordController'
          ))
            assert.deepEqual(route.effectivePolicies, [false]);
      } finally {
        await f.close();
      }
    }
  });
  it('compares authenticated reads, strict mutations, guards, ETags and persisted state to current Express', async () => {
    const transcripts: unknown[] = [];
    for (const native of [false, true]) {
      const f = await fixture(native);
      try {
        const auth = await login(f, native);
        const headers = { Cookie: auth.cookie, 'X-CSRF-Token': auth.token, 'Content-Type': 'application/json' };
        const read = await observe(f, target, { headers });
        assert.equal(read.status, 200, JSON.stringify(read));
        assert.equal((read.body as { data: { title: string } }).data.title, 'Original');
        assert(read.headers.etag);
        const results = [read];
        const cases: { body: unknown; extra: Record<string, string>; status: number }[] = [
          { body: [], extra: {}, status: 400 },
          { body: { title: 'Missing precondition' }, extra: {}, status: 428 },
          { body: { title: 'Updated', retained: true }, extra: { 'If-Match': read.headers.etag! }, status: 200 },
          { body: { title: 'Stale' }, extra: { 'If-Match': read.headers.etag! }, status: 412 },
          { body: { title: 'No CSRF' }, extra: { 'X-CSRF-Token': 'invalid' }, status: 403 },
          { body: { title: 'Bad bearer' }, extra: { Authorization: 'Bearer invalid' }, status: 401 },
          { body: { title: 'Bad origin' }, extra: { Origin: 'https://evil.invalid' }, status: 403 },
        ];
        for (const c of cases) {
          const result = await observe(f, target, {
            method: 'PUT',
            headers: { ...headers, ...c.extra },
            body: JSON.stringify(c.body),
          });
          assert.equal(result.status, c.status, JSON.stringify(result));
          results.push(result);
        }
        const latest = await observe(f, target, { headers });
        results.push(latest);
        results.push(await observe(f, target, { headers: { ...headers, 'X-ReDBox-Api-Version': '1.0' } }));
        const legacy = await observe(f, target + '?merge=true', {
          method: 'PUT',
          headers: { ...headers, 'If-Match': latest.headers.etag!, 'X-ReDBox-Api-Version': '1.0' },
          body: JSON.stringify({ v1: true }),
        });
        assert.equal(legacy.status, 200, JSON.stringify(legacy));
        results.push(legacy);
        const saved = await f.storage.getMeta('fm019-record');
        assert.deepEqual(saved.metadata, { title: 'Updated', retained: true, v1: true });
        assert.equal(saved.revision, 2);
        transcripts.push(
          normalize(
            {
              results,
              persisted: { metadata: saved.metadata, revision: saved.revision, authorization: saved.authorization },
            },
            f
          )
        );
        if (native) {
          assert.equal(f.nativePlan!.scope.included.length, 2);
          assert.match(f.nativePlan!.scope.excluded, /FM-034 TUS/);
          assert.equal(
            f.nativePlan!.resolved.controllerPlan.controllers.find(
              x => x.declaration.name === 'webservice/RecordController'
            )!.provider,
            'fm019-api2-pilot'
          );
          assert.equal(
            (await fetch(f.url + target, { headers })).headers.get('x-institution'),
            'Installed institution'
          );
          const count = () => f.native.db().collection('institutionPublication').countDocuments();
          for (const c of [
            { title: '', csrf: auth.token, status: 400 },
            { title: 'ok', csrf: 'invalid', status: 403 },
            { title: 'ok', csrf: auth.token, status: 200 },
          ]) {
            const r = await fetch(f.url + '/default/rdmp/institution/publish', {
              method: 'POST',
              headers: { ...headers, 'X-CSRF-Token': c.csrf },
              body: JSON.stringify({ title: c.title }),
            });
            assert.equal(
              r.status,
              c.status,
              JSON.stringify({ body: await r.clone().text(), headers: Object.fromEntries(r.headers) })
            );
            await r.text();
            assert.equal(r.headers.get('x-pilot-guarded'), c.status === 200 ? 'true' : null);
          }
          assert.equal(await count(), 1);
          const denied = await fetch(f.url + '/default/rdmp/institution/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          assert.equal(denied.status, 401);
          await denied.text();
          assert.equal(await count(), 1);
          const foreign = await fetch(f.url + '/other/rdmp/institution/publish', {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: 'Foreign brand' }),
          });
          assert.equal(foreign.status, 403);
          await foreign.text();
          assert.equal(await count(), 1);
        }
      } finally {
        await f.close();
        assert.equal(persistenceStatus(f.owner).pools, 0);
      }
    }
    assert.deepEqual(transcripts[1], transcripts[0]);
  });
  it('forces login at cutover and rejects old, revoked and native credentials after rollback with fresh root', async () => {
    // Use a real Express-issued cookie; copy its stored row to native Mongo so
    // rejection proves the signature/namespace boundary, not a missing record.
    const old = await fixture(false);
    let oldAuth: Awaited<ReturnType<typeof login>>, oldRows: Document[];
    try {
      oldAuth = await login(old, false);
      oldRows = await old.native.db().collection('pilotSessions').find().toArray();
    } finally {
      await old.close();
    }
    const f = await fixture(true);
    try {
      assert.equal(f.user.id, old.user.id);
      assert.equal(f.role.id, old.role.id);
      assert.equal(f.brand.id, old.brand.id);
      await f.native.db().collection('pilotSessions').insertMany(oldRows!);
      await verifyCookies(f, false, 'synthetic-secret-at-least-32-characters-long', [oldAuth!.cookie]);
      const denied = await observe(f, target, { headers: { Cookie: oldAuth!.cookie } });
      assert.equal(denied.status, 401);
      const auth = await login(f, true);
      assert.equal((await observe(f, target, { headers: { Cookie: auth.cookie } })).status, 200);
      const nativeRows = await f.native.db().collection('pilotSessions').find().toArray();
      for (let index = nativeRows.length - 1; index >= 0; index--)
        if (!String(nativeRows[index]._id).startsWith('redbox-fastify-v1:')) nativeRows.splice(index, 1);
      const live = await login(f, true);
      for (const row of await f.native.db().collection('pilotSessions').find().toArray()) {
        if (
          String(row._id).startsWith('redbox-fastify-v1:') &&
          !nativeRows.some(previous => String(previous._id) === String(row._id))
        )
          nativeRows.push(row);
      }
      const loggedOut = await fetch(f.url + '/default/rdmp/user/logout', {
        method: 'POST',
        headers: { Cookie: auth.cookie, 'X-CSRF-Token': auth.token },
        redirect: 'manual',
      });
      assert.equal(loggedOut.status, 302);
      await loggedOut.text();
      assert.equal((await observe(f, target, { headers: { Cookie: auth.cookie } })).status, 401);
      // Roll back to the unchanged Express production middleware on a fresh root.
      // Retain both formats, including the old Express row, to test no revival.
      await f.host.stop();
      const { ApplicationRuntime } = require('../../../src/application');
      await f.native.db().collection('pilotSessions').deleteMany({});
      await f.native
        .db()
        .collection('pilotSessions')
        .insertMany([...oldRows!, ...nativeRows]);
      await verifyCookies(f, false, 'synthetic-secret-at-least-32-characters-long', [oldAuth!.cookie]);
      await verifyCookies(f, true, rootSecret, [auth.cookie, live.cookie]);
      const rollbackOwner = { config: f.owner.config, log: f.owner.log };
      const app = new ApplicationRuntime(rollbackOwner, [
        {
          name: 'identity',
          create: () => ({ initialize: () => initializeIdentityPersistence(rollbackOwner), close: async () => {} }),
        },
      ]);
      const rollback = new ExpressHost(app, {
        owner: rollbackOwner,
        hostname: '127.0.0.1',
        port: 0,
        prepare: async router => {
          const middleware = await prepareHttpMiddleware(router, {
            owner: rollbackOwner,
            identity: new HttpIdentity(getIdentityRepositories(rollbackOwner)),
            session: {
              adapter: 'mongo',
              mongoUrl: String((f.owner.config as { datastores: { mongodb: { url: string } } }).datastores.mongodb.url),
              name: 'redbox.v6.sid',
              secret: rollbackSecret,
              collection: 'pilotSessions',
              cookie: { secure: false },
            },
            log: require('@researchdatabox/sails-ng-common').nothingLogger,
          });
          router.post('/login', middleware.local, (_req, res) => res.json({ success: true }));
          router.get('/actor', async (req, res) =>
            res.status((await middleware.authenticate(req)) ? 200 : 401).json({})
          );
        },
      });
      await rollback.initialize();
      await rollback.activate();
      try {
        for (const credential of [oldAuth!.cookie, auth.cookie, live.cookie]) {
          const r = await fetch('http://127.0.0.1:' + rollback.address()!.port + '/actor', {
            headers: { Cookie: credential },
          });
          assert.equal(r.status, 401);
          await r.text();
        }
        const fresh = await fetch('http://127.0.0.1:' + rollback.address()!.port + '/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
        });
        assert.equal(fresh.status, 200);
        await fresh.text();
        const accepted = await fetch('http://127.0.0.1:' + rollback.address()!.port + '/actor', {
          headers: { Cookie: cookie(fresh) },
        });
        assert.equal(accepted.status, 200);
        await accepted.text();
      } finally {
        await rollback.stop();
      }
    } finally {
      await f.close();
    }
  });
});
