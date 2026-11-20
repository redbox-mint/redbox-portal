import { assertGoldenNext, goldenControls } from './goldenContracts';
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
import { HttpIdentity } from '../../../src/authentication/HttpIdentity';
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
  it('requires explicit conversion scope and preserves both resolved TUS ownership splits', async () => {
    const consumerRequire = createRequire(packed.directory + '/package.json');
    const { createPortalFastifyApplication } = consumerRequire('@researchdatabox/redbox-core/portal');
    for (const declarations of [undefined, []])
      await assert.rejects(
        Reflect.apply(createPortalFastifyApplication, undefined, [{ http: { declarations } }]),
        /explicit nonempty conversion scope/
      );
    const rows = productionInventoryOrder().map(inventoryRegistration);
    const policies = [...new Set(rows.flatMap(r => r.effectivePolicies ?? []).filter((x): x is string => x !== false))];
    const plan = await composeRoutes(rows, {
      policyNames: policies,
      precedence: coreRoutePrecedence,
      legacyOrder: true,
    });
    assert.deepEqual(
      new Set(plan.routes.map(route => route.declaration.name)),
      new Set(rows.map(route => route.declaration.name))
    );
    const splits = coreRoutePrecedence.filter(rule =>
      rule.reason.startsWith('Retained attachment GET handles downloads before TUS ALL;')
    );
    assert.equal(splits.length, 2);
    for (const split of splits) {
      const overlap = plan.overlaps.find(
        overlap =>
          [overlap.first, overlap.second].includes(split.winner) && [overlap.first, overlap.second].includes(split.over)
      );
      assert(overlap, split.name);
      assert.deepEqual(overlap.precedence, split);
      assert(
        plan.bindings.some(binding => binding.route.declaration.name === split.winner && binding.method === 'GET'),
        split.name + ': download GET'
      );
      for (const method of ['PATCH'])
        assert(
          plan.bindings.some(binding => binding.route.declaration.name === split.over && binding.method === method),
          split.name + ': TUS ' + method
        );
    }
    await assert.rejects(
      composeRoutes(rows, {
        policyNames: policies,
        precedence: coreRoutePrecedence.filter(rule => !splits.includes(rule)),
        legacyOrder: true,
      }),
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
    for (const native of [true]) {
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
    for (const native of [true]) {
      const f = await fixture(native);
      try {
        const auth = await login(f, native);
        const headers = { Cookie: auth.cookie, 'X-CSRF-Token': auth.token, 'Content-Type': 'application/json' };
        const read = await observe(f, target, { headers });
        assert.equal(read.status, 200, JSON.stringify(read));
        assert.equal(
          (
            read.body as {
              data: {
                title: string;
              };
            }
          ).data.title,
          'Original'
        );
        assert(read.headers.etag);
        const results = [read];
        const cases: {
          body: unknown;
          extra: Record<string, string>;
          status: number;
        }[] = [
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
        {
          assert.equal(f.nativePlan!.scope.included.length, 2);
          assert.equal(f.nativePlan!.scope.excluded, 'All other unselected core families');
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
    assertGoldenNext('pilot-mongo', transcripts[0]);
  });
  it('revokes native credentials at logout', async () => {
    const f = await fixture(true);
    try {
      const auth = await login(f, true);
      assert.equal((await observe(f, target, { headers: { Cookie: auth.cookie } })).status, 200);
      const loggedOut = await fetch(f.url + '/default/rdmp/user/logout', {
        method: 'POST',
        headers: { Cookie: auth.cookie, 'X-CSRF-Token': auth.token },
        redirect: 'manual',
      });
      assert.equal(loggedOut.status, 302);
      await loggedOut.text();
      assert.equal((await observe(f, target, { headers: { Cookie: auth.cookie } })).status, 401);
    } finally {
      await f.close();
    }
  });
});

goldenControls('pilot-mongo');
