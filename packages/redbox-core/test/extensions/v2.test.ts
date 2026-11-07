import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { MongoClient } from 'mongodb';
import sinon from 'sinon';
import { z } from 'zod';
import { ApplicationRuntime } from '../../dist/application';
import {
  loadInstalledExtensionProvidersV2,
  resolveExtensionsV2,
  type ExtensionProviderV2,
  type ExtensionResolutionV2Options,
  type RedboxExtensionV2,
} from '../../dist/extensions';
import { applicationStatusController, bindControllerFactory } from '../../dist/http';
import { apiRouteRegistrations } from '../../dist/http/fastify/routes';
import { createControllerHost } from '../../dist/http/fastify/composition';
import { createNativeCsrf } from '../../dist/http/fastify/csrf';
import { validateRouteRequest } from '../../dist/http/fastify/validation';
import type { ApiRouteDefinition } from '../../dist/api-routes/types';
import type { FastifyHost } from '../../dist/http/fastify/FastifyHost';

const packageRoot = path.resolve(__dirname, '../..');
const fixtures = path.join(__dirname, 'fixtures');
const core: ExtensionProviderV2 = {
  name: 'core',
  root: packageRoot,
  declaration: { apiVersion: 2, controllers: [applicationStatusController] },
};
const api: ApiRouteDefinition = {
  method: 'post',
  path: '/protected',
  controller: applicationStatusController.name,
  action: 'status',
  policy: ['allowed'],
  csrf: true,
  request: {
    body: { required: true, content: { 'application/json': { schema: z.object({ title: z.string().min(1) }) } } },
  },
  responses: { 200: { description: 'Original response metadata' } },
};
const coreRoutes = apiRouteRegistrations({
  declarations: [api],
  configuration: { ApplicationStatusController: { status: true } },
});
const options = (bindings: ExtensionResolutionV2Options['bindings']): ExtensionResolutionV2Options => ({
  bindings,
  coreRoutes,
  routing: { policyNames: ['allowed'] },
});
const provider = (name: string, declaration: RedboxExtensionV2): ExtensionProviderV2 => ({
  name,
  root: packageRoot,
  declaration,
});

describe('FM-017 installed API2 extension composition', function () {
  this.timeout(15000);
  let root: string;
  const hosts: FastifyHost[] = [];
  beforeEach(async () => {
    // Inside this package so public dependency imports resolve exactly as installed packages do.
    root = await mkdtemp(path.join(packageRoot, '.fm017-'));
    await mkdir(path.join(root, 'node_modules'));
  });
  afterEach(async () => {
    try {
      for (const host of hosts.splice(0)) await host.stop({ deadlineMs: 2000 });
    } finally {
      sinon.restore();
      await rm(root, { recursive: true, force: true });
    }
  });
  async function install(legacy = false) {
    const packages = legacy
      ? [['api1-http', 'fm017-api1-http']]
      : [
          ['api2-commonjs', 'fm017-commonjs'],
          ['api2-esm', 'fm017-esm'],
        ];
    for (const [directory, name] of packages)
      await cp(path.join(fixtures, directory), path.join(root, 'node_modules', name), { recursive: true });
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        dependencies: Object.fromEntries(packages.map(([, name]) => [name, '1.0.0'])),
        hookLoadPriority: legacy ? [] : ['fm017-commonjs', 'fm017-esm'],
      })
    );
  }
  async function loaded() {
    await install();
    const result = await loadInstalledExtensionProvidersV2(root, { core: core.declaration });
    const declarations = result.providers.flatMap(p => p.declaration.controllers ?? []);
    const created: string[] = [];
    let audits = 0;
    const bindings = declarations.map(factory => {
      if (factory === applicationStatusController) {
        const binding = bindControllerFactory(applicationStatusController, {
          application: {
            status: () => {
              throw new Error('Losing core factory ran');
            },
          },
        });
        return Object.assign(
          () => {
            created.push('core');
            return binding();
          },
          { factory }
        );
      }
      // Collection erasure belongs at the explicit application binding boundary.
      const input =
        factory.name === 'GreetingController'
          ? { prefix: 'Hello ', name: () => 'API2', created: (name: string) => created.push(name) }
          : {
              application: { status: () => ({ source: 'subclass' }) },
              audit: () => audits++,
              created: (name: string) => created.push(name),
            };
      return Object.assign(() => factory.create(input as never), { factory });
    });
    return { ...result, bindings, created, audits: () => audits };
  }

  it('imports CJS/ESM and resolves bindings/data without opening resources or running any factory/work', async () => {
    await install();
    const blocked = () => {
      throw new Error('Inspection attempted resource acquisition');
    };
    const probes = [
      sinon.stub(net.Socket.prototype, 'connect').callsFake(blocked),
      sinon.stub(net.Server.prototype, 'listen').callsFake(blocked),
      sinon.stub(tls, 'connect').callsFake(blocked),
      sinon.stub(MongoClient.prototype, 'connect').callsFake(blocked),
      sinon.stub(fs.promises, 'open').callsFake(blocked),
      sinon.stub(fs, 'open').callsFake(blocked),
      sinon.stub(fs, 'createReadStream').callsFake(blocked),
      sinon.stub(fs, 'createWriteStream').callsFake(blocked),
      sinon.stub(fs, 'watch').callsFake(blocked),
    ];
    const opened = sinon.spy(fs, 'openSync');
    const loaded = await loadInstalledExtensionProvidersV2(root, { core: core.declaration });
    const factories = loaded.providers.flatMap(p => p.declaration.controllers ?? []);
    // Each binding needs its own exact descriptor identity.
    const selectedBindings = factories.map(factory => Object.assign(() => blocked(), { factory }));
    const original = loaded.providers.find(p => p.name === 'fm017-commonjs')!.declaration;
    const result = await resolveExtensionsV2(loaded.providers, {
      ...options(selectedBindings),
      hookLoadPriority: loaded.hookLoadPriority,
    });
    assert.deepEqual(
      result.providers.map(p => p.name),
      ['core', 'fm017-esm', 'fm017-commonjs']
    );
    assert.deepEqual(
      result.modules.map(p => p.declaration.name),
      ['service', 'dependent']
    );
    assert.deepEqual(
      result.controllerPlan.controllers.map(p => p.provider),
      ['fm017-commonjs', 'fm017-esm']
    );
    for (const probe of probes) assert.equal(probe.callCount, 0);
    // Module source/manifest reads are allowed; no write-capable resource files may be opened.
    for (const call of opened.getCalls()) assert.equal(call.args[1], 'r');
    const cjs = result.providers.find(p => p.name === 'fm017-commonjs')!.declaration;
    for (const field of [
      'config',
      'forms',
      'workflows',
      'jobs',
      'configModels',
      'contributors',
      'migrations',
      'bootstrap',
      'modules',
    ] as const)
      assert.strictEqual(cjs[field], original[field]);
    assert.strictEqual(result.modules[0].declaration, cjs.modules![0]);
    assert.strictEqual(result.migrations[0].declaration, cjs.migrations![0]);
    assert.strictEqual(result.bootstrap[0].declaration, cjs.bootstrap![0]);
    assert.deepEqual(result.views, [
      path.join(root, 'node_modules/fm017-commonjs/views'),
      path.join(root, 'node_modules/fm017-esm/views'),
    ]);
    assert.deepEqual(
      result.assets,
      result.views.map(p => p.replace(/views$/, 'assets'))
    );
  });

  it('preserves core policies, CSRF and executable Zod input through a subclass, with explicit different inputs for a new controller', async () => {
    const input = await loaded();
    const result = await resolveExtensionsV2(input.providers, {
      ...options(input.bindings),
      hookLoadPriority: input.hookLoadPriority,
    });
    assert.deepEqual(input.created, []);
    const resolved = result.routePlan.routes.find(r => r.declaration.name === coreRoutes[0].declaration.name)!;
    assert.strictEqual(resolved.declaration, coreRoutes[0].declaration);
    assert.strictEqual(resolved.declaration.api!.request, api.request);
    assert.strictEqual(resolved.declaration.api!.responses, api.responses);
    assert.deepEqual(resolved.effectivePolicies, ['allowed']);
    assert.equal(resolved.declaration.csrf, true);
    const application = new ApplicationRuntime({ config: {}, log: { warn() {} } }, []);
    const host = await createControllerHost(application, {
      port: 0,
      hostname: '127.0.0.1',
      controllers: result.controllerRegistrations,
      bindings: input.bindings,
      moduleNames: result.modules.map(m => m.declaration.name),
      routes: result.routeRegistrations,
      routing: { policyNames: ['allowed'] },
      security: {
        policies: {
          allowed: async (request, reply) => {
            if (request.headers['x-allowed'] !== 'yes') return reply.code(401).send();
          },
        },
        csrf: createNativeCsrf({
          origins: ['http://portal.test'],
          authenticateBearer: async token => token === 'csrf-proof',
        }),
      },
      guards: async (binding, request, reply) => {
        // FM-016 action prelude: validation follows required policies and CSRF.
        if (binding.route.declaration.api) await validateRouteRequest(request, reply, binding.route.declaration.api);
      },
    });
    hosts.push(host);
    await host.initialize();
    await host.activate();
    const url = 'http://127.0.0.1:' + host.address()!.port;
    const call = (headers: Record<string, string>, body: object = { title: 'valid' }) =>
      fetch(url + '/protected', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const good = { 'x-allowed': 'yes', authorization: 'Bearer csrf-proof' };
    assert.equal((await call({})).status, 401);
    assert.equal((await call({ 'x-allowed': 'yes' })).status, 403);
    assert.equal((await call({ ...good, origin: 'http://foreign.test' })).status, 403);
    assert.equal((await call(good, { title: 42 })).status, 400);
    assert.equal(input.audits(), 0);
    const success = await call(good);
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { source: 'subclass' });
    assert.deepEqual(await (await fetch(url + '/greeting')).json(), { greeting: 'Hello API2' });
    assert.equal(input.audits(), 1);
    assert.deepEqual(input.created.sort(), ['greeting', 'replacement']);
  });

  it('changes access only through complete explicit named route replacement and retains old/new security for inspection', async () => {
    const input = await loaded();
    const declaration = {
      name: coreRoutes[0].declaration.name,
      method: 'post' as const,
      path: api.path,
      controller: api.controller,
      action: api.action,
      access: { kind: 'public' } as const,
      csrf: false,
    };
    const changing = provider('change-access', { apiVersion: 2, routes: [declaration] });
    await assert.rejects(
      resolveExtensionsV2([...input.providers, changing], options(input.bindings)),
      /requires replaces: true/
    );
    const replacement = provider('change-access', { apiVersion: 2, routes: [{ ...declaration, replaces: true }] });
    const plan = await resolveExtensionsV2([...input.providers, replacement], options(input.bindings));
    const route = plan.routePlan.routes.find(r => r.declaration.name === declaration.name)!;
    assert.deepEqual(route.effectivePolicies, []);
    assert.equal(route.declaration.csrf, false);
    assert.equal(route.declaration.api, undefined);
    assert.strictEqual(route.replaced!.declaration.api!.request, api.request);
    assert.deepEqual(route.replaced!.effectivePolicies, ['allowed']);
    assert.equal(route.replaced!.declaration.csrf, true);
    await assert.rejects(
      resolveExtensionsV2(
        [
          ...input.providers,
          provider('incomplete', {
            apiVersion: 2,
            routes: [{ ...declaration, replaces: true, access: undefined! }],
          }),
        ],
        options(input.bindings)
      ),
      /requires explicit access/
    );
    const host = await createControllerHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }, []), {
      port: 0,
      hostname: '127.0.0.1',
      controllers: plan.controllerRegistrations,
      bindings: input.bindings,
      moduleNames: plan.modules.map(m => m.declaration.name),
      routes: plan.routeRegistrations,
      routing: { policyNames: ['allowed'] },
    });
    hosts.push(host);
    await host.initialize();
    await host.activate();
    // Only the explicit route replacement removes policy/CSRF/schema requirements.
    const response = await fetch('http://127.0.0.1:' + host.address()!.port + api.path, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { source: 'subclass' });
  });

  it('normalizes extension API sources under their stable names and retains ordered effects before default denial', async () => {
    const input = await loaded();
    const source = { ...api, path: '/extension-api' };
    const route = {
      ...coreRoutes[0].declaration,
      method: 'post' as const,
      name: 'stable-extension-api',
      path: source.path,
      api: source,
    };
    const extension = provider('api-extension', { apiVersion: 2, routes: [route] });
    const opts = { ...options(input.bindings), apiConfiguration: {} };
    const result = await resolveExtensionsV2([...input.providers, extension], opts);
    const resolved = result.routePlan.routes.find(r => r.declaration.name === route.name)!;
    assert.strictEqual(resolved.declaration.api, source);
    assert.deepEqual(resolved.effectivePolicies, ['allowed', false]);
    assert.equal(resolved.declaration.name, 'stable-extension-api');
    for (const change of [{ access: { kind: 'public' } as const }, { csrf: false }])
      await assert.rejects(
        resolveExtensionsV2(
          [
            ...input.providers,
            provider('api-extension', {
              apiVersion: 2,
              routes: [{ ...route, ...change }],
            }),
          ],
          opts
        ),
        /API (policy\/HEAD )?source mismatch/
      );
    assert.deepEqual(input.created, []);
  });

  it('retains named module replacement and non-HTTP provider data under the same priority rules', async () => {
    const input = await loaded();
    const module = {
      name: 'service',
      replaces: true as const,
      create: () => {
        throw new Error('Do not acquire');
      },
    };
    const extension = provider('data-replacement', {
      apiVersion: 2,
      modules: [module],
      config: { example: { enabled: false } },
    });
    const result = await resolveExtensionsV2([...input.providers, extension], {
      ...options(input.bindings),
      hookLoadPriority: ['data-replacement'],
    });
    assert.strictEqual(result.modules[0].declaration, module);
    assert.equal(result.providers.at(-1)!.name, extension.name);
    await assert.rejects(
      resolveExtensionsV2(
        [
          ...input.providers,
          provider(extension.name, {
            ...extension.declaration,
            modules: [{ ...module, replaces: undefined }],
          }),
        ],
        { ...options(input.bindings), hookLoadPriority: [extension.name] }
      ),
      /duplicate requires replaces: true/
    );
    await assert.rejects(
      resolveExtensionsV2(
        [
          ...input.providers,
          provider(extension.name, {
            ...extension.declaration,
            modules: [{ ...module, name: 'absent' }],
          }),
        ],
        options(input.bindings)
      ),
      /replacement has no target/
    );
    assert.deepEqual(input.created, []);
  });

  it('rejects installed API1 HTTP contributions with package, constructs, API2 conversion and migration link', async () => {
    await install(true);
    await assert.rejects(loadInstalledExtensionProvidersV2(root), error => {
      assert(error instanceof Error);
      for (const text of [
        'Extension fm017-api1-http',
        'expected apiVersion 2',
        'handlers',
        'routes[].handler',
        'middleware',
        'integrations',
        'defineController',
        'controller/action',
        'scoped hooks/fallbacks',
        'extension-api2.md',
      ])
        assert(error.message.includes(text), error.message);
      return true;
    });
  });
  for (const construct of ['handlers', 'middleware', 'integrations', 'routes[].handler', 'data-only API1'])
    it(`rejects ${construct} even when mixed into an apiVersion 2 declaration`, async () => {
      const legacy =
        construct === 'routes[].handler'
          ? { routes: [{ handler: 'old' }] }
          : construct === 'data-only API1'
            ? { apiVersion: 1, config: {} }
            : { [construct]: [] };
      await assert.rejects(
        resolveExtensionsV2([provider('bad-hook', { apiVersion: 2, ...legacy } as RedboxExtensionV2)], options([])),
        /Extension bad-hook: expected apiVersion 2/
      );
    });
  for (const [label, change, pattern] of [
    [
      'undeclared controller replacement',
      (p: ExtensionProviderV2[]) =>
        p.map(x => ({
          ...x,
          declaration: {
            ...x.declaration,
            controllers: x.declaration.controllers?.map(c => ({ ...c, replaces: undefined })),
          },
        })),
      /requires replaces: true/,
    ],
    [
      'missing module',
      (p: ExtensionProviderV2[]) => p.map(x => ({ ...x, declaration: { ...x.declaration, modules: [] } })),
      /missing/,
    ],
    [
      'module cycle',
      (p: ExtensionProviderV2[]) => [
        ...p,
        provider('cycle', {
          apiVersion: 2,
          modules: [
            { name: 'loop', requires: ['loop'], create: () => ({ initialize: async () => {}, close: async () => {} }) },
          ],
        }),
      ],
      /dependency cycle/,
    ],
    [
      'unknown controller binding',
      (p: ExtensionProviderV2[]) => p.filter(x => x.name !== 'fm017-esm'),
      /unknown controller binding/,
    ],
    [
      'missing controller target',
      (p: ExtensionProviderV2[]) => [
        ...p,
        provider('bad-route', {
          apiVersion: 2,
          routes: [
            {
              name: 'missing',
              method: 'get',
              path: '/missing',
              controller: 'missing',
              action: 'read',
              access: { kind: 'public' },
            },
          ],
        }),
      ],
      /missing controller/,
    ],
    [
      'unknown policy',
      (p: ExtensionProviderV2[]) => [
        ...p,
        provider('bad-route', {
          apiVersion: 2,
          routes: [
            {
              name: 'policy',
              method: 'get',
              path: '/policy',
              controller: 'GreetingController',
              action: 'greet',
              access: { kind: 'policies', names: ['missing'] },
            },
          ],
        }),
      ],
      /unknown policy/,
    ],
    [
      'controller access metadata',
      (p: ExtensionProviderV2[]) =>
        p.map(x => ({
          ...x,
          declaration: {
            ...x.declaration,
            controllers: x.declaration.controllers?.map(c => ({ ...c, access: { kind: 'public' } })),
          },
        })),
      /change access with an explicit route replacement/,
    ],
    [
      'route overlap',
      (p: ExtensionProviderV2[]) => [
        ...p,
        provider('overlap', {
          apiVersion: 2,
          routes: [
            {
              name: 'other-greeting',
              method: 'get',
              path: '/:name',
              controller: 'GreetingController',
              action: 'greet',
              access: { kind: 'public' },
            },
          ],
        }),
      ],
      /overlap/,
    ],
    [
      'missing route replacement target',
      (p: ExtensionProviderV2[]) => [
        ...p,
        provider('missing', {
          apiVersion: 2,
          routes: [
            {
              name: 'absent',
              method: 'get',
              path: '/absent',
              controller: 'GreetingController',
              action: 'greet',
              replaces: true,
              access: { kind: 'public' },
            },
          ],
        }),
      ],
      /replacement has no target/,
    ],
  ] as const)
    it(`fails ${label} offline`, async () => {
      const input = await loaded();
      await assert.rejects(resolveExtensionsV2(change(input.providers), options(input.bindings)), pattern);
      assert.deepEqual(input.created, []);
    });

  it('uses first-listed-highest provider precedence before construction, rejects missing binding and preserves action exposure', async () => {
    const input = await loaded();
    const factory = { ...input.providers.find(p => p.name === 'fm017-commonjs')!.declaration.controllers![0] };
    const higher = provider('higher', { apiVersion: 2, controllers: [factory] });
    const bindings = [
      ...input.bindings,
      Object.assign(
        () => {
          throw new Error('Inspection ran selected factory');
        },
        { factory }
      ),
    ];
    const result = await resolveExtensionsV2([...input.providers, higher], {
      ...options(bindings),
      hookLoadPriority: ['higher', 'fm017-commonjs'],
    });
    assert.equal(result.controllerPlan.controllers[0].provider, 'higher');
    await assert.rejects(
      resolveExtensionsV2([...input.providers, higher], { ...options(input.bindings), hookLoadPriority: ['higher'] }),
      /missing controller binding/
    );
    await assert.rejects(
      resolveExtensionsV2(
        [
          ...input.providers,
          provider('higher', { apiVersion: 2, controllers: [{ ...factory, actions: ['status', 'helper'] }] }),
        ],
        options(input.bindings)
      ),
      /preserve action exposure/
    );
    await assert.rejects(
      resolveExtensionsV2(input.providers, { ...options(input.bindings), hookLoadPriority: ['undiscovered'] }),
      /undiscovered/
    );
    assert.deepEqual(input.created, []);
  });
});
