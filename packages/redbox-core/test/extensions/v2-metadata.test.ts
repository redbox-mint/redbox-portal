import assert from 'node:assert/strict';
import { defineController, bindControllerFactory } from '../../dist/http/controllers';
import type { HttpRouteDeclaration, PortalHttpMethod } from '../../dist/http/contracts';
import { resolveExtensionsV2, type ExtensionProviderV2 } from '../../dist/extensions';
import {
  composeRoutes,
  apiRouteRegistrations,
  coreRouteName,
  coreRoutePrecedence,
  createPortalRouter,
  type RouteComposition,
  type RouteRegistration,
} from '../../dist/http/fastify/routes';
import { inventory, inventoryRegistration } from '../http/fastify/inventory-fixture';

// Only the legacy controller namespace is adapted to FM-009's bounded names.
// Route names, executable contracts, policies and mount CSRF come from the real
// source inventory. No controller/service/resource factory runs in this table.
const registrations = inventory.routes.map(row => {
  const source = inventoryRegistration(row);
  const controller = source.declaration.controller.replace('/', '_');
  const api = source.declaration.api;
  return {
    ...source,
    declaration: { ...source.declaration, controller, ...(api ? { api: { ...api, controller } } : {}) },
    ...(source.apiConfiguration
      ? {
          apiConfiguration: Object.fromEntries(
            Object.entries(source.apiConfiguration).map(([key, value]) => [key.replace('/', '_'), value])
          ),
        }
      : {}),
  };
});
const byName = new Map(registrations.map(route => [route.declaration.name, route]));
const methods: readonly PortalHttpMethod[] = ['get', 'head', 'post', 'put', 'patch', 'delete', 'options'];
let factories = 0;
const controllers = [...new Set(registrations.map(r => r.declaration.controller))].map(name => {
  const actions = [
    ...new Set(registrations.filter(r => r.declaration.controller === name).map(r => r.declaration.action)),
  ];
  return defineController({
    name,
    actions,
    create: (_: undefined): Record<string, () => void> => {
      factories++;
      return Object.fromEntries(actions.map(action => [action, () => {}]));
    },
  });
});
const core: ExtensionProviderV2 = { name: 'core', root: __dirname, declaration: { apiVersion: 2, controllers } };
const bindings = controllers.map(controller => bindControllerFactory(controller, undefined));
const policyNames = [
  ...new Set(registrations.flatMap(r => r.effectivePolicies ?? []).filter((p): p is string => p !== false)),
];
const routing = (rootContext = '', legacyOrder = false, sources: readonly RouteRegistration[] = []) => ({
  policyNames,
  rootContext,
  legacyOrder,
  precedence: coreRoutePrecedence.filter(
    p => sources.some(r => r.declaration.name === p.winner) && sources.some(r => r.declaration.name === p.over)
  ),
});

function replacement(source: RouteRegistration, method = source.declaration.method): HttpRouteDeclaration {
  assert.notEqual(method, 'all', 'ALL stays internal; replace its frozen method reservations');
  const { declaration: d } = source;
  return {
    name: coreRouteName(method, d.path),
    method: method as PortalHttpMethod,
    path: d.path,
    controller: d.controller,
    action: d.action,
    access: d.access,
    ...(Object.hasOwn(d, 'csrf') ? { csrf: d.csrf } : {}),
    // Alias reservations inherit executable validation, not a mismatched GET API.
    ...(d.api && method === d.method ? { api: d.api } : {}),
    replaces: true,
  };
}
async function resolve(
  sources: readonly RouteRegistration[],
  routes: readonly HttpRouteDeclaration[],
  root = '',
  legacy = false
) {
  const extension: ExtensionProviderV2 = {
    name: 'replacement',
    root: __dirname,
    declaration: { apiVersion: 2, routes },
  };
  return resolveExtensionsV2([core, extension], {
    bindings,
    coreRoutes: sources,
    routing: routing(root, legacy, sources),
  });
}
function snapshot(plan: RouteComposition) {
  return {
    bindings: plan.bindings.map(b => ({
      name: b.route.declaration.name,
      method: b.method,
      path: b.path,
      kind: b.kind,
      access: b.route.declaration.access,
      policies: b.route.effectivePolicies,
      csrf: b.route.effectiveCsrf,
      declaredCsrf: b.route.declaration.csrf,
      head: b.route.declaration.head,
    })),
    // Includes all named legacy intent and synthesized OPTIONS/reserved-method
    // identities, witnesses and winners; replacements must not alter them.
    overlaps: plan.overlaps,
  };
}
function assertMetadata(actual: RouteRegistration, source: RouteRegistration) {
  assert.deepEqual(actual.declaration.access, source.declaration.access);
  assert.deepEqual(actual.effectivePolicies, source.effectivePolicies);
  assert.equal(actual.effectiveCsrf, source.effectiveCsrf);
  assert.equal(actual.declaration.csrf, source.declaration.csrf);
  assert.deepEqual(actual.declaration.head, source.declaration.head);
  assert.strictEqual(actual.apiConfiguration, source.apiConfiguration);
  assert.strictEqual(actual.declaration.validation, source.declaration.validation);
  assert.strictEqual(actual.declaration.api, source.declaration.api);
  assert.strictEqual(actual.declaration.api?.request, source.declaration.api?.request);
  assert.strictEqual(actual.declaration.api?.responses, source.declaration.api?.responses);
}

describe('FM-017 inventory-derived API2 replacement metadata', function () {
  this.timeout(15000);
  after(() => assert.equal(factories, 0, 'offline inspection must not construct controllers'));

  it('covers all 335 inventoried declarations, including every derived security source', () => {
    assert.equal(registrations.length, 335);
    for (const [index, route] of registrations.entries()) {
      const row = inventory.routes[index];
      assert.equal(route.declaration.name, row.name);
      assert.deepEqual(route.effectivePolicies, row.access.effectivePolicies);
      assert.equal(route.declaration.path, row.original.path);
    }
    assert.equal(registrations.filter(r => r.declaration.head?.kind === 'deny').length, 3);
    assert(registrations.some(r => r.declaration.validation));
    assert(registrations.some(r => r.effectiveCsrf && r.declaration.csrf === false));
  });

  for (const source of registrations.filter(r => r.declaration.method !== 'all'))
    it(`retains all normalized metadata for ${source.declaration.name} ${source.declaration.path}`, async () => {
      for (const root of ['', '/research/v6'])
        for (const legacy of [false, true]) {
          const baseline = await composeRoutes([source], routing(root, legacy));
          const result = await resolve([source], [replacement(source)], root, legacy);
          const selected = result.routePlan.routes.find(r => r.declaration.name === source.declaration.name)!;
          assertMetadata(selected, source);
          assert.equal(selected.provider, 'replacement');
          assert.strictEqual(selected.replaced!.declaration, source.declaration);
          assert.deepEqual(selected.paths, baseline.routes[0].paths);
          assert.deepEqual(snapshot(result.routePlan), snapshot(baseline));
        }
    });

  for (const source of registrations.filter(r => ['all', 'get'].includes(r.declaration.method)))
    it(`retains frozen method reservations and synthesized identities for ${source.declaration.name}`, async () => {
      for (const method of source.declaration.method === 'all' ? methods : (['head'] as const)) {
        const route = replacement(source, method);
        const expected: RouteRegistration = {
          ...source,
          provider: 'replacement',
          declaration: {
            ...source.declaration,
            ...route,
            head: undefined,
            api: undefined,
            validation: source.declaration.api?.request ?? source.declaration.validation,
          },
        };
        const baseline = await composeRoutes([source, expected], routing('/research/v6', true));
        const result = await resolve([source], [route], '/research/v6', true);
        const selected = result.routePlan.routes.find(r => r.declaration.name === route.name)!;
        assertMetadata(selected, expected);
        assert.equal(selected.replaced!.aliasOf!.declaration.name, source.declaration.name);
        assert.deepEqual(snapshot(result.routePlan), snapshot(baseline));
      }
    });

  for (const original of registrations.filter(r => r.declaration.api))
    it(`retains default denial and ordered policy effects for ${original.declaration.name}`, async () => {
      const source = {
        ...original,
        ...apiRouteRegistrations({ declarations: [original.declaration.api!], configuration: {} })[0],
      };
      const baseline = await composeRoutes([source], routing());
      const result = await resolve([source], [replacement(source)]);
      assertMetadata(result.routePlan.routes[0], source);
      assert(source.effectivePolicies!.includes(false));
      assert.deepEqual(snapshot(result.routePlan), snapshot(baseline));
    });

  it('keeps ALL HEAD ownership after a changed GET reservation and a later HEAD replacement', async () => {
    const source = registrations.find(r => r.declaration.method === 'all' && r.declaration.access.kind === 'policies')!;
    const get = { ...replacement(source, 'get'), access: { kind: 'public' } as const, csrf: false };
    const head = replacement(source, 'head');
    const result = await resolve([source], [get, head]);
    const selected = result.routePlan.routes.find(r => r.declaration.name === head.name)!;
    assert.deepEqual(selected.effectivePolicies, source.effectivePolicies);
    assert.equal(selected.effectiveCsrf, source.effectiveCsrf);
    assert.equal(selected.replaced!.aliasOf!.declaration.name, source.declaration.name);
    assert.deepEqual(result.routePlan.routes.find(r => r.declaration.name === get.name)!.effectivePolicies, []);
  });

  it('changes an executable browser schema only through an explicit route source change', async () => {
    const source = registrations.find(r => r.declaration.validation && !r.declaration.api)!;
    const result = await resolve([source], [{ ...replacement(source), api: undefined }]);
    const selected = result.routePlan.routes[0];
    assert.equal(selected.declaration.validation, undefined);
    assert.strictEqual(selected.replaced!.declaration.validation, source.declaration.validation);
    assert.deepEqual(selected.effectivePolicies, source.effectivePolicies);
    assert.equal(selected.effectiveCsrf, source.effectiveCsrf);
  });

  it('keeps normalized HEAD metadata under an extension-authored stable API name', async () => {
    const source = registrations.find(r => r.declaration.head?.kind === 'deny')!;
    const route = { ...replacement(source), name: 'extension-admin-reader', replaces: undefined };
    const extension: ExtensionProviderV2 = {
      name: 'extension',
      root: __dirname,
      declaration: { apiVersion: 2, routes: [route] },
    };
    const result = await resolveExtensionsV2([core, extension], {
      bindings,
      apiConfiguration: source.apiConfiguration,
      routing: routing(),
    });
    const selected = result.routePlan.routes[0];
    assert.equal(selected.declaration.name, route.name);
    assert.deepEqual(selected.declaration.head, source.declaration.head);
    assert.deepEqual(selected.effectivePolicies, source.effectivePolicies);
    assert.strictEqual(selected.declaration.api, source.declaration.api);
    assert(result.routePlan.bindings.some(b => b.kind === 'denied-head' && b.route.declaration.name === route.name));
  });

  // All three admin GET declarations have HEAD denials derived outside API2's
  // public route shape. Retaining the API schema must compose and still deny.
  for (const source of registrations.filter(r => r.declaration.head?.kind === 'deny'))
    it(`keeps admin HEAD denial executable when replacing ${source.declaration.path}`, async () => {
      const result = await resolve([source], [replacement(source)]);
      const app = createPortalRouter({ exposeHeadRoutes: false });
      let actions = 0;
      const guarded: string[] = [];
      try {
        result.routePlan.install(
          app,
          {
            action: () => () => {
              actions++;
              return 'action';
            },
          },
          async binding => {
            guarded.push(binding.kind);
            assertMetadata(binding.route, source);
          }
        );
        const url = source.declaration.path
          .replace(/:branding/g, 'default')
          .replace(/:portal/g, 'rdmp')
          .replace(/:configKey/g, 'test');
        const response = await app.inject({ method: 'HEAD', url });
        assert.equal(response.statusCode, 405);
        assert.equal(response.headers.allow, 'GET');
        assert.equal(response.body, '');
        assert.deepEqual(guarded, ['denied-head']);
        assert.equal(actions, 0);
      } finally {
        await app.close();
      }
    });

  for (const precedence of coreRoutePrecedence)
    it(`retains precedence intent and composition failures for ${precedence.name}`, async () => {
      const sources = [byName.get(precedence.winner)!, byName.get(precedence.over)!];
      const routes = sources.filter(r => r.declaration.method !== 'all').map(r => replacement(r));
      for (const reverse of [false, true]) {
        const ordered = reverse ? [...sources].reverse() : sources;
        let baseline: RouteComposition;
        try {
          baseline = await composeRoutes(ordered, routing('', true, ordered));
        } catch (error) {
          assert.match(String(error), /cannot retain winner|route collision|requires explicit ownership/);
          await assert.rejects(resolve(ordered, routes, '', true), (actual: unknown) => {
            assert.equal(String(actual), String(error));
            return true;
          });
          continue;
        }
        const result = await resolve(ordered, routes, '', true);
        assert.deepEqual(snapshot(result.routePlan), snapshot(baseline));
        assert(result.routePlan.overlaps.some(o => o.precedence?.name === precedence.name));
      }
    });

  it('preserves metadata across provider replacement chains and explicit API schema omission', async () => {
    const source = registrations.find(r => r.declaration.head?.kind === 'deny')!;
    const route = replacement(source);
    const { api: _api, ...withoutApi } = route;
    const provider = (name: string, routes: readonly HttpRouteDeclaration[]): ExtensionProviderV2 => ({
      name,
      root: __dirname,
      declaration: { apiVersion: 2, routes },
    });
    const result = await resolveExtensionsV2([core, provider('first', [route]), provider('second', [withoutApi])], {
      bindings,
      coreRoutes: [source],
      hookLoadPriority: ['second', 'first'],
      routing: routing(),
    });
    const selected = result.routePlan.routes[0];
    assertMetadata(selected, source);
    assert.equal(selected.provider, 'second');
    assert.equal(selected.replaced!.provider, 'first');
    assert.strictEqual(selected.replaced!.replaced!.declaration, source.declaration);
    await assert.rejects(
      resolve([source], [{ ...route, access: { kind: 'public' } }]),
      /API policy\/HEAD source mismatch/
    );
    await assert.rejects(
      resolve([source], [{ ...route, head: { kind: 'none' } } as HttpRouteDeclaration]),
      /invalid API2 route/
    );
    const changed = await resolve([source], [{ ...route, api: undefined, access: { kind: 'public' }, csrf: false }]);
    const publicRoute = changed.routePlan.routes[0];
    assert.deepEqual(publicRoute.effectivePolicies, []);
    assert.equal(publicRoute.effectiveCsrf, undefined);
    assert.equal(publicRoute.declaration.validation, undefined);
    assert.equal(publicRoute.declaration.api, undefined);
    assert.deepEqual(publicRoute.replaced!.effectivePolicies, source.effectivePolicies);
    assert.equal(publicRoute.replaced!.effectiveCsrf, source.effectiveCsrf);
  });

  for (const missing of ['replaces', 'access'] as const)
    it(`does not inherit a missing ${missing} from an earlier replacement provider`, async () => {
      const source = registrations.find(
        r => !r.declaration.api && r.declaration.method !== 'all' && r.declaration.access.kind === 'policies'
      )!;
      const route = replacement(source);
      const { [missing]: _missing, ...incomplete } = route;
      const provider = (name: string, route: HttpRouteDeclaration): ExtensionProviderV2 => ({
        name,
        root: __dirname,
        declaration: { apiVersion: 2, routes: [route] },
      });
      await assert.rejects(
        resolveExtensionsV2([core, provider('first', route), provider('second', incomplete as HttpRouteDeclaration)], {
          bindings,
          coreRoutes: [source],
          hookLoadPriority: ['second', 'first'],
          routing: routing(),
        }),
        missing === 'replaces' ? /requires replaces: true/ : /requires explicit access/
      );
    });

  for (const api of [true, false])
    it(`retains inherited validation and CSRF for reordered equivalent access, api=${api}`, async () => {
      const source = registrations.find(
        r =>
          !!r.declaration.api === api &&
          (api || r.declaration.validation) &&
          r.declaration.method !== 'all' &&
          r.declaration.access.kind === 'policies'
      )!;
      assert(source.declaration.access.kind === 'policies');
      const { api: _api, ...route } = replacement(source);
      const result = await resolve(
        [source],
        [{ ...route, access: { names: [...source.declaration.access.names], kind: 'policies' } }]
      );
      assertMetadata(result.routePlan.routes[0], source);
      assert.strictEqual(result.routePlan.routes[0].declaration.access, source.declaration.access);
    });
});
