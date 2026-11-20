import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  apiRouteRegistrations,
  coreRoutePrecedence,
  createPortalRouter,
  composeRoutes,
  coreRouteName,
  expressRuntimePath,
  translateRoutePath,
  type RouteDeclaration,
  type RouteRegistration,
  type RouteBinding,
  type RouteGuards,
  type RoutePrecedence,
} from '../../../dist/http/fastify/routes';
import { registerCoreApiRoutes } from '../../../dist/api-routes/route-registry';
import { composeControllers } from '../../../dist/http/fastify/registration';
import { defineController, bindControllerFactory } from '@researchdatabox/redbox-core/http';
import { inventoryRegistration, type InventoryRoute } from './inventory-fixture';

const packageRoot = path.resolve(__dirname, '../../..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const evidenceRoot = path.join(repositoryRoot, 'support/specs/fastify-migration/evidence');
interface InventoryRow extends InventoryRoute {
  name: string;
  kind: string;
  method: RouteDeclaration['method'];
  path: string;
  original: InventoryRoute['original'] & { method: string; controller?: string; action?: string };
  source: { file: string; export: string; index?: number };
  head: { behavior: string };
}
const inventory: { routes: InventoryRow[] } = JSON.parse(
  readFileSync(path.join(evidenceRoot, 'FM-002.inventory.json'), 'utf8')
);
const noGuards: RouteGuards = async () => {};
const actions = { action: () => (request: FastifyRequest) => request.params };
const app = () => createPortalRouter({ exposeHeadRoutes: false });
function route(name: string, overrides: Partial<RouteDeclaration> = {}, provider = 'core'): RouteRegistration {
  return {
    provider,
    declaration: {
      name,
      path: '/things/:id',
      method: 'get',
      controller: 'Example',
      action: 'read',
      access: { kind: 'public' },
      ...overrides,
    },
  };
}
const compose = (routes: readonly RouteRegistration[], policyNames: readonly string[] = [], rootContext = '') =>
  composeRoutes(routes, { policyNames, rootContext });
function sample(url: string): string {
  return url.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => 'Value_' + name).replace('*', 'One/Two/');
}
async function withRoutes(
  routes: readonly RouteRegistration[],
  run: (instance: FastifyInstance) => Promise<void>,
  guards = noGuards,
  policyNames: readonly string[] = [],
  precedence: readonly RoutePrecedence[] = []
) {
  const composition = await composeRoutes(routes, { policyNames, precedence });
  const instance = app();
  try {
    composition.install(instance, actions, guards);
    await run(instance);
  } finally {
    await instance.close();
  }
}

describe('Fastify source-derived route inventory', function () {
  this.timeout(180_000);
  it('reconciles the frozen FM-002 route baseline against current native composition', () => {
    const result = spawnSync(
      process.execPath,
      ['--no-experimental-strip-types', path.join(evidenceRoot, 'reconcile-FM-030.cjs'), '--check'],
      { cwd: repositoryRoot, timeout: 180_000, encoding: 'utf8' }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /migrated/);
  });
  it('derives all 152 API identities, actions, access and schema references from the registry', async () => {
    const source = registerCoreApiRoutes();
    const registrations = apiRouteRegistrations();
    assert.equal(source.length, 152);
    assert.equal(registrations.length, source.length);
    const policies = [
      ...new Set(registrations.flatMap(r => r.effectivePolicies!).filter((name): name is string => name !== false)),
    ];
    const names = new Set(registrations.map(route => route.declaration.name));
    const composition = await composeRoutes(registrations, {
      policyNames: policies,
      legacyOrder: true,
      precedence: coreRoutePrecedence.filter(override => names.has(override.winner) && names.has(override.over)),
    });
    assert.equal(composition.routes.length, 152);
    for (const registration of registrations) {
      const declaration = registration.declaration;
      const api = source.find(api => api === declaration.api)!;
      assert(api, declaration.name);
      assert.equal(declaration.api!.request, api.request);
      assert.equal(declaration.api!.responses, api.responses);
      const row = inventory.routes.find(row => row.name === declaration.name)!;
      assert.equal(row.kind, 'api');
      for (const key of ['method', 'path', 'controller', 'action', 'csrf'] as const)
        assert.equal(declaration[key], row.original[key], declaration.name + ': ' + key);
      assert.deepEqual(registration.effectivePolicies, row.access.effectivePolicies, row.name);
      assert.equal(declaration.head?.kind === 'deny', row.head.behavior === 'explicit-405');
    }
  });
  it('preserves named effects before default denial and uses explicit true for API public access', async () => {
    const source = {
      method: 'get' as const,
      path: '/fixture',
      controller: 'ExampleController',
      action: 'read',
      policy: ['noCache'],
    };
    const registrations = apiRouteRegistrations({ declarations: [source], configuration: {} });
    assert.deepEqual(registrations[0].declaration.access, { kind: 'policies', names: ['nocache'] });
    assert.deepEqual((await compose(registrations, ['nocache'])).routes[0].effectivePolicies, ['nocache', false]);
    const publicSource = { ...source, policy: undefined };
    const publicRoutes = apiRouteRegistrations({ declarations: [publicSource], configuration: { '*': true } });
    assert.deepEqual(publicRoutes[0].declaration.access, { kind: 'public' });
    assert.deepEqual((await compose(publicRoutes)).routes[0].effectivePolicies, []);
    const denied = apiRouteRegistrations({
      declarations: [publicSource],
      configuration: { '*': ['noCache'], Example: { read: false } },
    });
    assert.deepEqual((await compose(denied)).routes[0].effectivePolicies, [false]);
  });
  it('retains most-specific action/controller/global policy precedence and normalized target names', async () => {
    const source = {
      method: 'get' as const,
      path: '/fixture',
      controller: 'webservice/ExampleController',
      action: 'read',
      policy: ['before'],
    };
    const registrations = apiRouteRegistrations({
      declarations: [source],
      configuration: { '*': ['global'], 'webservice/Example': { '*': ['controller'], read: ['action'] } },
    });
    assert.deepEqual(
      (await compose(registrations, ['before', 'global', 'controller', 'action'])).routes[0].effectivePolicies,
      ['before', 'action']
    );
  });
  for (const field of ['method', 'path', 'controller', 'action', 'csrf', 'access', 'head'] as const) {
    it(`rejects API ${field} metadata drift during composition`, async () => {
      const source = { method: 'get' as const, path: '/fixture', controller: 'Example', action: 'read', csrf: false };
      const [registration] = apiRouteRegistrations({ declarations: [source], configuration: { '*': true } });
      const changes = {
        method: 'post',
        path: '/drift',
        controller: 'Other',
        action: 'other',
        csrf: true,
        access: { kind: 'deny' },
        head: { kind: 'none' },
      };
      const changed = {
        ...registration,
        declaration: { ...registration.declaration, [field]: changes[field] },
      } as RouteRegistration;
      await assert.rejects(compose([changed]), /API .*source mismatch/);
    });
  }
  it('detects drift in source policies/configuration as well as the normalized effective chain', async () => {
    const source = { method: 'get' as const, path: '/fixture', controller: 'Example', action: 'read', policy: ['one'] };
    const config = { '*': true };
    const [registration] = apiRouteRegistrations({ declarations: [source], configuration: config });
    await assert.rejects(compose([{ ...registration, effectivePolicies: ['two'] }], ['one', 'two']), /source mismatch/);
    source.policy = ['two'];
    await assert.rejects(compose([registration], ['one', 'two']), /source mismatch/);
  });
  for (const configuration of [{ '*': [] }, { Example: { read: [] } }, { '*': [''] }])
    it('rejects empty or malformed configured named policies', () =>
      assert.throws(() => apiRouteRegistrations({ configuration }), /non-empty/));
});

describe('Fastify concrete Express pattern translation', () => {
  // Every concrete source row is mounted independently: this is pattern coverage,
  // not a claim that browser/controller families or integrations are converted.
  for (const row of inventory.routes) {
    it(`matches ${row.name}: ${row.original.method} ${row.original.path}`, async () => {
      const source = inventoryRegistration(row).declaration;
      assert.equal(source.path, row.original.path);
      assert.equal(source.method, row.original.method);
      assert.equal(expressRuntimePath(source.path), row.path);
      assert.equal(coreRouteName(source.method, source.path), row.name);
      const composition = await compose([route(row.name, { method: source.method, path: source.path })]);
      const instance = app();
      try {
        composition.install(instance, actions, noGuards);
        for (const translated of translateRoutePath(source.path)) {
          const url = sample(translated.template ?? translated.url);
          const response = await instance.inject({
            method: source.method === 'all' ? 'GET' : source.method.toUpperCase(),
            url,
          });
          assert.equal(response.statusCode, 200, url + ': ' + response.body);
          if (source.method !== 'head') {
            const params = response.json();
            for (const name of source.path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)) {
              if (name[1] === 'key' && source.path.endsWith(':key*')) continue;
              if (translated.url.includes(':' + name[1])) assert.equal(params[name[1]], 'Value_' + name[1], url);
              else assert.equal(params[name[1]], undefined, url);
            }
            if (translated.wildcard) assert.equal(params[translated.wildcard.name], 'One/Two/', url);
          }
        }
      } finally {
        await instance.close();
      }
    });
  }
  it('retains capture case, optional trailing slash, suffix params and root-context boundaries', async () => {
    const composition = await compose(
      [route('case', { path: '/:branding/:portal/locales/:lng/:ns.json' })],
      [],
      '/research/v6'
    );
    const instance = app();
    try {
      composition.install(instance, actions, noGuards);
      const result = await instance.inject('/RESEARCH/V6/MyBrand/MyPortal/LOCALES/en/Name.JSON/');
      assert.deepEqual(result.json(), { branding: 'MyBrand', portal: 'MyPortal', lng: 'en', ns: 'Name' });
      for (const url of [
        '/MyBrand/MyPortal/locales/en/Name.json',
        '/research/v6x/MyBrand/MyPortal/locales/en/Name.json',
        '/research%2Fv6/MyBrand/MyPortal/locales/en/Name.json',
        '/research/v6/research/v6/MyBrand/MyPortal/locales/en/Name.json',
      ])
        assert.equal((await instance.inject(url)).statusCode, 404, url);
    } finally {
      await instance.close();
    }
  });
  it('preserves required wildcard keys, once-only decoding and their significant trailing slash', async () => {
    await withRoutes([route('wildcard', { path: '/translations/:key*' })], async instance => {
      for (const [url, key] of [
        ['/translations/Group/title', 'Group/title'],
        ['/translations/Group%2Ftitle', 'Group/title'],
        ['/translations/Group/title/', 'Group/title/'],
        ['/translations/%252F', '%2F'],
        ['/translations/a+b', 'a+b'],
        ['/translations//', '/'],
      ])
        assert.equal((await instance.inject(url)).json().key, key, url);
      assert.equal((await instance.inject('/translations/')).statusCode, 404);
      assert.equal((await instance.inject('/translations')).statusCode, 404);
      for (const url of ['/translations/%ZZ', '/translations/%', '/translations/%E0%A4', '/translations/%C0%AF'])
        assert.equal((await instance.inject(url)).statusCode, 400);
    });
  });
  it('supports optional captures, encoded slashes/spaces and excludes extra path segments', async () => {
    await withRoutes([route('optional', { path: '/assets/:recordType{/:oid}' })], async instance => {
      assert.deepEqual((await instance.inject('/assets/Type')).json(), { recordType: 'Type' });
      assert.deepEqual((await instance.inject('/assets/Type/A%2FB%20C')).json(), { recordType: 'Type', oid: 'A/B C' });
      assert.equal((await instance.inject('/assets/Type/a/b')).statusCode, 404);
      assert.equal((await instance.inject('/assets/Type/%ZZ')).statusCode, 400);
    });
  });
  for (const suffix of ['.json', '.css', '.woff2'])
    it(`preserves suffix case matching and decoded capture data for ${suffix}`, async () => {
      await withRoutes([route('suffix-encoding', { path: '/assets/:name' + suffix })], async instance => {
        for (const [encoded, decoded] of [
          ['Mixed%2FCase', 'Mixed/Case'],
          ['A%0AB', 'A\nB'],
          ['%252F', '%2F'],
        ]) {
          const response = await instance.inject('/ASSETS/' + encoded + suffix.toUpperCase() + '/');
          assert.equal(response.statusCode, 200, response.body);
          assert.equal(response.json().name, decoded);
        }
      });
    });
  it('accepts the optional datastream suffix, with and without a separator', async () => {
    await withRoutes([route('suffix', { path: '/record/:oid/datastream*' })], async instance => {
      for (const url of [
        '/record/Oid/datastream',
        '/record/Oid/datastream/',
        '/record/Oid/datastreamlegacy',
        '/record/Oid/datastream/one/two',
      ])
        assert.equal((await instance.inject(url)).json().oid, 'Oid', url);
    });
  });
  for (const pattern of [
    '/x/:key*/suffix',
    '/x/:id?',
    '/x/(.*)',
    '/x/:id/:id',
    '/x/\\*',
    '/x?query',
    'relative',
    '/x/{*tail}/suffix',
    '/x/pre:id',
  ])
    it(`rejects unsupported grammar ${pattern}`, () => assert.throws(() => translateRoutePath(pattern)));
});

describe('FM-010 original grammar before compatibility normalization', () => {
  const unsupported = [
    '/x/:key*tail',
    '/x/:key*b',
    '/x/:a*b',
    '/x/:a:b',
    '/x/:a.b*',
    '*x',
    '/x/:a*x',
    '/x/:a*/b',
    '/x/:key*/b',
    '/x/:key*/',
    '/x/:key*//',
    '/x/pre:key*',
    '/x/predatastream*',
    '/x/datastream*tail',
    '/x/datastream*/b',
    '/x/datastream*/',
    '/x/datastream*//',
    '/x/:id//',
    '/x/file//',
  ];
  for (const path of unsupported) {
    it(`rejects original syntax before rewriting or hashing ${path}`, () => {
      for (const normalize of [expressRuntimePath, translateRoutePath, (value: string) => coreRouteName('get', value)])
        assert.throws(() => normalize(path), /Unsupported|absolute path/, path);
    });
    for (const legacyOrder of [false, true])
      for (const rootContext of ['', '/research/v6'])
        it(`cannot compose ${path}, legacy=${legacyOrder}, root=${rootContext || '/'}`, async () => {
          await assert.rejects(
            composeRoutes([route('invalid', { path })], { policyNames: [], legacyOrder, rootContext }),
            /Unsupported|absolute path/
          );
        });
  }
  for (const [source, runtime] of [
    ['/x/:key*', '/x/*key'],
    ['/x/datastream*', '/x/datastream{*tail}'],
    ['/x/*x', '/x/*x'],
    ['/x/:id/', '/x/:id/'],
    ['/x/datastream{*tail}', '/x/datastream{*tail}'],
    ['/x/:id.CSS', '/x/:id.CSS'],
  ])
    it(`preserves the supported original spelling ${source}`, async () => {
      assert.equal(expressRuntimePath(source), runtime);
      assert.equal(coreRouteName('get', source), coreRouteName('get', runtime));
      await withRoutes([route('supported', { path: source })], async instance => {
        for (const translated of translateRoutePath(source)) {
          const response = await instance.inject(sample(translated.template ?? translated.url));
          assert.equal(response.statusCode, 200, response.body);
          if (translated.wildcard) assert.equal(response.json()[translated.wildcard.name], 'One/Two/');
        }
      });
    });
});

describe('Fastify route collisions and explicit policies', () => {
  for (const [first, second] of [
    ['/THING/:id', '/thing/:other/'],
    ['/x/:id.json', '/X/:name.JSON'],
    ['/x{/:id}', '/x'],
    ['/x{/:id}', '/x/:renamed'],
    ['/x/*tail', '/X/*different'],
    ['/x/datastream*', '/x/datastream'],
  ])
    for (const reverse of [false, true])
      it(`rejects real-router structural collision ${first} / ${second}, reverse=${reverse}`, async () => {
        const routes = [route('first', { path: first }), route('second', { path: second })];
        await assert.rejects(compose(reverse ? routes.reverse() : routes), /route collision|route overlap|Unsupported/);
      });
  it('rejects method/ALL collisions rather than silently selecting declaration order', async () => {
    for (const reverse of [false, true]) {
      const routes = [route('all', { method: 'all' }), route('get')];
      await assert.rejects(compose(reverse ? routes.reverse() : routes), /route collision|route overlap|Unsupported/);
    }
  });
  for (const method of ['get', 'head', 'post', 'put', 'patch', 'delete', 'options', 'all'] as const)
    for (const legacyOrder of [false, true])
      for (const rootContext of ['', '/research/v6'])
        it(`rejects differing guards for ${method} before native wildcard specificity, legacy=${legacyOrder}, root=${rootContext || '/'}`, async () => {
          const protectedRoute = route('protected', {
            method,
            path: '/x/*tail',
            access: { kind: 'policies', names: ['protected'] },
          });
          const publicRoute = route('public', { method, path: '/x/fixed' });
          for (const reverse of [false, true])
            await assert.rejects(
              composeRoutes(reverse ? [publicRoute, protectedRoute] : [protectedRoute, publicRoute], {
                policyNames: ['protected'],
                legacyOrder,
                rootContext,
              }),
              /route overlap/
            );
        });
  for (const [field, alter] of [
    [
      'policies',
      (value: RouteRegistration) => ({
        ...value,
        declaration: { ...value.declaration, access: { kind: 'deny' as const } },
      }),
    ],
    [
      'policy order',
      (value: RouteRegistration) => ({
        ...value,
        declaration: {
          ...value.declaration,
          access: { kind: 'policies' as const, names: ['second', 'first'] as const },
        },
      }),
    ],
    ['CSRF flag', (value: RouteRegistration) => ({ ...value, declaration: { ...value.declaration, csrf: true } })],
    ['selected CSRF guard', (value: RouteRegistration) => ({ ...value, effectiveCsrf: 'apiProtect' })],
    ['validation', (value: RouteRegistration) => ({ ...value, declaration: { ...value.declaration, validation: {} } })],
    [
      'public flag',
      (value: RouteRegistration) => ({
        ...value,
        declaration: { ...value.declaration, access: { kind: 'public' as const } },
        effectivePolicies: ['first', 'second'],
      }),
    ],
  ] as const)
    it(`compares effective ${field} for all expanded bindings`, async () => {
      const original = route('first', {
        method: 'put',
        path: '/x/:id',
        access: { kind: 'policies', names: ['first', 'second'] },
      });
      const altered = alter(route('second', { ...original.declaration, name: 'second', path: '/x/fixed' }));
      await assert.rejects(
        composeRoutes([original, altered], { policyNames: ['first', 'second'], legacyOrder: true }),
        /route overlap/
      );
    });
  it('accepts a named, reasoned override only when the native router retains its winner', async () => {
    const routes = [
      route('protected', { method: 'put', path: '/x/*tail', access: { kind: 'deny' } }),
      route('public', { method: 'put', path: '/x/fixed' }),
    ];
    const intended = {
      name: 'public-status-resource',
      reason: 'The fixed resource deliberately exposes its public status within the protected namespace.',
      winner: 'public',
      over: 'protected',
    };
    const composition = await composeRoutes([...routes].reverse(), { policyNames: [], precedence: [intended] });
    assert.equal(composition.overlaps.find(overlap => overlap.firstMethods.includes('PUT'))!.precedence, intended);
    for (const precedence of [
      [{ ...intended, reason: '' }],
      [{ ...intended, winner: 'missing' }],
      [{ ...intended, winner: 'protected', over: 'public' }],
      [{ ...intended, methods: ['GET'] as const }],
      [intended, { ...intended, name: 'conflicting' }],
    ])
      await assert.rejects(composeRoutes(routes, { policyNames: [], precedence }), /precedence|route overlap/);
  });
  it('uses the same installed find-my-way module as Fastify for composition probes', () => {
    const { createRequire } = require('node:module');
    const fastifyRequire = createRequire(require.resolve('fastify'));
    assert.equal(fastifyRequire.resolve('find-my-way'), require.resolve('find-my-way'));
    assert.equal(require('find-my-way/package.json').version, '9.10.0');
  });
  it('uses actual router precedence for distinct static, parametric and wildcard routes', async () => {
    for (const reverse of [false, true]) {
      const routes = [
        route('static', { path: '/x/fixed' }),
        route('param', { path: '/x/:id' }),
        route('wild', { path: '/x/*tail' }),
      ];
      if (reverse) {
        await assert.rejects(composeRoutes(routes.reverse(), { policyNames: [] }), /route overlap/);
        continue;
      }
      await withRoutes(
        routes,
        async instance => {
          assert.deepEqual((await instance.inject('/x/fixed')).json(), {});
          assert.deepEqual((await instance.inject('/x/value')).json(), { id: 'value' });
          assert.deepEqual((await instance.inject('/x/value/extra')).json(), { tail: 'value/extra' });
        },
        noGuards,
        [],
        [
          {
            name: 'fixed-before-parameter',
            reason: 'The exact resource precedes the parameter resource.',
            winner: 'static',
            over: 'param',
          },
          {
            name: 'fixed-before-fallback',
            reason: 'The exact resource precedes the wildcard fallback.',
            winner: 'static',
            over: 'wild',
          },
          {
            name: 'parameter-before-fallback',
            reason: 'The parameter resource precedes the wildcard fallback.',
            winner: 'param',
            over: 'wild',
          },
        ]
      );
    }
  });
  for (const reverse of [false, true]) {
    it(`keeps explicit protected HEAD ahead of public GET with capture renaming, reverse=${reverse}`, async () => {
      const routes = [
        route('get'),
        route(
          'head',
          { method: 'head', path: '/THINGS/:headId/', access: { kind: 'policies', names: ['headers'] } },
          'hook'
        ),
      ];
      const seen: RouteBinding[] = [];
      const guards: RouteGuards = async (binding, request, reply) => {
        seen.push(binding);
        if (binding.route.effectivePolicies.includes('headers')) {
          assert.equal((request.params as { headId: string }).headId, 'Sensitive');
          reply.code(403).send();
        }
      };
      await withRoutes(
        reverse ? routes.reverse() : routes,
        async instance => {
          assert.equal((await instance.inject('/things/Sensitive')).statusCode, 200);
          const head = await instance.inject({ method: 'HEAD', url: '/things/Sensitive' });
          assert.equal(head.statusCode, 403);
          assert.equal(head.body, '');
        },
        guards,
        ['headers'],
        [
          {
            name: 'explicit-head',
            reason: 'Preserve the explicitly declared HEAD guard over GET inference.',
            winner: 'head',
            over: 'get',
          },
        ]
      );
      assert.deepEqual(
        seen.map(binding => binding.route.declaration.name),
        ['get', 'head']
      );
    });
    it(`rejects inferred HEAD which overlaps a different explicit policy, reverse=${reverse}`, async () => {
      const routes = [
        route('get', { path: '/x/fixed' }),
        route('head', { method: 'head', path: '/x/:id', access: { kind: 'deny' } }),
      ];
      await assert.rejects(compose(reverse ? routes.reverse() : routes), /route overlap/);
    });
  }
  it('finds cross-segment and wildcard HEAD overlaps using the actual router', async () => {
    for (const [getPath, headPath] of [
      ['/x/:id/fixed', '/x/static/:value'],
      ['/x/static/more', '/x/*tail'],
      ['/x/thing.json', '/x/:id.json'],
      ['/x/datastream*', '/x/:kind'],
      ['/x/datastream*', '/x/:kind.json'],
      ['/x/:first.json/:second', '/x/:first/:second.css'],
      ['/x/:first.json/:second.extra.css', '/x/:first.extra.json/:second.css'],
    ])
      await assert.rejects(
        compose([
          route('get', { path: getPath }),
          route('head', { method: 'head', path: headPath, access: { kind: 'deny' } }),
        ]),
        /route overlap|route collision|Unsupported/
      );
  });
  it('rejects a differently named HEAD route that would erase a GET-owned HEAD denial in either order', async () => {
    for (const reverse of [false, true]) {
      const declarations = [
        route('admin', { head: { kind: 'deny', allow: 'GET' } }),
        route('public-head', { method: 'head' }, 'hook'),
      ];
      await assert.rejects(
        compose(reverse ? declarations.reverse() : declarations),
        /route overlap|route collision|Unsupported/
      );
    }
  });
  it('runs implicit HEAD through the GET guards and action, suppressing only the body', async () => {
    let guards = 0;
    let calls = 0;
    const composition = await compose([route('get')]);
    const instance = app();
    try {
      composition.install(
        instance,
        {
          action: () => (_request, reply) => {
            calls++;
            return reply.send({ hello: 'world' });
          },
        },
        async () => {
          guards++;
        }
      );
      const get = await instance.inject('/things/value');
      const head = await instance.inject({ method: 'HEAD', url: '/things/value' });
      assert.equal(head.statusCode, 200);
      assert.equal(head.body, '');
      assert.equal(head.headers['content-length'], get.headers['content-length']);
      assert.equal(guards, 2);
      assert.equal(calls, 2);
    } finally {
      await instance.close();
    }
  });
  it('runs GET-owned HEAD denial after policies/CSRF and before action work', async () => {
    const calls: string[] = [];
    const instance = app();
    const composition = await compose(
      [route('admin', { head: { kind: 'deny', allow: 'GET' }, access: { kind: 'policies', names: ['nocache'] } })],
      ['nocache']
    );
    try {
      composition.install(
        instance,
        {
          action: () => () => {
            calls.push('action');
          },
        },
        async (_binding, request, reply) => {
          calls.push('policies');
          if (request.headers['x-deny']) {
            reply.code(403).send();
            return;
          }
          calls.push('csrf');
        }
      );
      const denied = await instance.inject({ method: 'HEAD', url: '/things/value' });
      assert.equal(denied.statusCode, 405);
      assert.equal(denied.headers.allow, 'GET');
      assert.equal(denied.body, '');
      assert.deepEqual(calls, ['policies', 'csrf']);
      calls.length = 0;
      assert.equal(
        (await instance.inject({ method: 'HEAD', url: '/things/value', headers: { 'x-deny': 'yes' } })).statusCode,
        403
      );
      assert.deepEqual(calls, ['policies']);
    } finally {
      await instance.close();
    }
  });
  it('supports inventoried OIDC explicit HEAD denial without invoking GET', async () => {
    const routes = [
      route('oidc-get', { path: '/user/begin_oidc' }),
      route('core-http-head-e3ee2548904017ea', { method: 'head', path: '/user/begin_oidc', action: 'deny' }),
    ];
    const composition = await composeRoutes(routes, {
      policyNames: [],
      precedence: [
        {
          name: 'oidc-head',
          reason: 'The explicit OIDC HEAD action precedes provider-start GET inference.',
          winner: 'core-http-head-e3ee2548904017ea',
          over: 'oidc-get',
        },
      ],
    });
    const instance = app();
    try {
      composition.install(
        instance,
        {
          action: target => (_request, reply) => {
            assert.equal(target.action, 'deny');
            return reply.code(405).send();
          },
        },
        noGuards
      );
      const result = await instance.inject({ method: 'HEAD', url: '/user/begin_oidc' });
      assert.equal(result.statusCode, 405);
      assert.equal(result.headers.allow, undefined);
    } finally {
      await instance.close();
    }
  });
  it('does not synthesize health HEAD from old offline identity reservations', async () => {
    const composition = await compose([route('probe-fixture', { path: '/healthz', head: { kind: 'none' } })]);
    assert(!composition.bindings.some(binding => binding.method === 'HEAD'));
  });
  it('synthesizes accumulated OPTIONS/Allow without route guards, and preserves method-miss 404', async () => {
    let guarded = 0;
    await withRoutes(
      [route('get'), route('post', { method: 'post' })],
      async instance => {
        const response = await instance.inject({
          method: 'OPTIONS',
          url: '/things/value',
          headers: { origin: 'https://foreign.invalid', 'access-control-request-method': 'POST' },
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.body, 'GET, HEAD, POST');
        assert.equal(response.headers.allow, 'GET, HEAD, POST');
        assert.equal(response.headers['access-control-allow-origin'], undefined);
        assert.equal(guarded, 0);
        assert.equal((await instance.inject({ method: 'DELETE', url: '/things/value' })).statusCode, 404);
        assert.equal((await instance.inject({ method: 'OPTIONS', url: '/missing' })).statusCode, 404);
      },
      async () => {
        guarded++;
      },
      [],
      [
        {
          name: 'get-before-post',
          reason: 'GET and POST share this resource and retain their separate methods.',
          winner: 'get',
          over: 'post',
        },
      ]
    );
  });
  it('keeps explicit OPTIONS and ALL guards, including PROPFIND', async () => {
    const seen: string[] = [];
    await withRoutes(
      [route('all', { method: 'all', path: '/' })],
      async instance => {
        for (const method of ['OPTIONS', 'PROPFIND', 'PATCH', 'HEAD'] as const)
          assert.equal((await instance.inject({ method, url: '/' })).statusCode, 200);
      },
      async binding => {
        seen.push(binding.method);
      }
    );
    assert.deepEqual(seen, ['OPTIONS', 'PROPFIND', 'PATCH', 'HEAD']);
  });
  it('defers automatic OPTIONS to an overlapping explicit guarded OPTIONS policy', async () => {
    await withRoutes(
      [route('get', { path: '/x/static' }), route('options', { method: 'options', path: '/x/:id' })],
      async instance => {
        assert.equal((await instance.inject({ method: 'OPTIONS', url: '/x/static' })).statusCode, 403);
      },
      async (binding, _request, reply) => {
        assert.equal(binding.route.declaration.name, 'options');
        reply.code(403).send();
      },
      [],
      [
        {
          name: 'get-options',
          reason: 'The explicit OPTIONS protocol handler shares the GET namespace.',
          winner: 'get',
          over: 'options',
        },
      ]
    );
  });
  it('preserves replacement history and complete access metadata without constructing losing controllers', async () => {
    const first = route('stable', { csrf: true, access: { kind: 'policies', names: ['old'] } });
    const replacement = route(
      'stable',
      { replaces: true, csrf: false, path: '/new/:id', access: { kind: 'policies', names: ['new'] } },
      'hook'
    );
    const composition = await compose([first, replacement], ['old', 'new']);
    assert.equal(composition.routes.length, 1);
    assert.equal(composition.routes[0].provider, 'hook');
    assert.deepEqual(composition.routes[0].effectivePolicies, ['new']);
    assert.deepEqual(composition.routes[0].replaced!.effectivePolicies, ['old']);
    assert.equal(composition.routes[0].replaced!.declaration.csrf, true);
    assert.equal(composition.routes[0].declaration.csrf, false);
  });
  it('rejects missing, implicit and duplicate-provider replacement targets', async () => {
    await assert.rejects(compose([route('missing', { replaces: true })]), /no target/);
    await assert.rejects(compose([route('same'), route('same', {}, 'hook')]), /requires replaces/);
    await assert.rejects(compose([route('same'), route('same', { replaces: true })]), /duplicate route/);
  });
  it('preserves route policies when the typed controller implementation is replaced', async () => {
    const base = defineController({
      name: 'Example',
      actions: ['read'],
      create: (_input: { label: string }) => ({ read: () => 'base' }),
    });
    const replacement = defineController({
      ...base,
      replaces: true as const,
      create: (input: { label: string }) => ({ read: () => input.label }),
    });
    const composition = await compose(
      [route('get', { access: { kind: 'policies', names: ['protected'] } })],
      ['protected']
    );
    const controllers = composeControllers(
      [
        { provider: 'core', declaration: base },
        { provider: 'hook', declaration: replacement },
      ],
      [bindControllerFactory(replacement, { label: 'replacement' })],
      composition.routes.map(route => route.declaration)
    );
    const instance = app();
    try {
      let guarded = 0;
      composition.install(instance, controllers.instantiate(), async binding => {
        assert.deepEqual(binding.route.effectivePolicies, ['protected']);
        guarded++;
      });
      assert.equal((await instance.inject('/things/id')).body, 'replacement');
      assert.equal(guarded, 1);
    } finally {
      await instance.close();
    }
  });
  it('rejects empty/unknown policy declarations and attempts to discard denial or named effects', async () => {
    await assert.rejects(
      compose([route('empty', { access: { kind: 'policies', names: [] } } as unknown as Partial<RouteDeclaration>)]),
      /non-empty policies/
    );
    await assert.rejects(
      compose([
        route('boolean-name', { access: { kind: 'policies', names: [false] } } as unknown as Partial<RouteDeclaration>),
      ]),
      /non-empty policies/
    );
    await assert.rejects(
      compose([route('unknown', { access: { kind: 'policies', names: ['unknown'] } })]),
      /unknown policy/
    );
    await assert.rejects(
      compose([{ ...route('deny', { access: { kind: 'deny' } }), effectivePolicies: ['known'] }], ['known']),
      /lost its denial/
    );
    await assert.rejects(
      compose(
        [{ ...route('lost', { access: { kind: 'policies', names: ['known'] } }), effectivePolicies: [false] }],
        ['known']
      ),
      /policy order/
    );
  });
  it('requires the host router configuration used for offline collision checks', async () => {
    const composition = await compose([route('get')]);
    const instance = fastify();
    try {
      assert.throws(() => composition.install(instance, actions, noGuards), /router option/);
    } finally {
      await instance.close();
    }
  });
  it('does not depend on Fastify implicit HEAD defaults when installing', async () => {
    const composition = await composeRoutes(
      [route('get'), route('head', { method: 'head', access: { kind: 'deny' } })],
      {
        policyNames: [],
        precedence: [
          {
            name: 'head-denial',
            reason: 'The explicit HEAD route deliberately denies this GET resource.',
            winner: 'head',
            over: 'get',
          },
        ],
      }
    );
    const instance = createPortalRouter({ exposeHeadRoutes: true });
    try {
      composition.install(instance, actions, async (binding, _request, reply) => {
        if (binding.route.effectivePolicies.includes(false)) reply.code(403).send();
      });
      assert.equal((await instance.inject({ method: 'HEAD', url: '/things/id' })).statusCode, 403);
    } finally {
      await instance.close();
    }
  });
});
