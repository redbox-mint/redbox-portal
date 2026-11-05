import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import {
  apiRouteRegistrations,
  composeRoutes,
  coreRouteName,
  createPortalRouter,
  expressRuntimePath,
  type RouteDeclaration,
  type RouteRegistration,
} from '../../../dist/http/fastify/routes';
import { resolveExtensions, type OwnedHttpRoute } from '../../../dist/extensions/resolution';
import { portalOwnedHttpRoutes } from '../../../dist/http/express/ownedRoutes';

const repository = path.resolve(__dirname, '../../../../..');
interface InventoryRow {
  name: string;
  method: RouteDeclaration['method'];
  path: string;
  original: { path: string; csrf?: boolean };
  controller: string;
  action: string;
  head: { behavior: string };
  access: { effectivePolicies: (string | false)[] };
  replacementTargets: { name: string; method: Exclude<RouteDeclaration['method'], 'all'> }[];
}
const inventory: { routes: InventoryRow[] } = JSON.parse(
  readFileSync(path.join(repository, 'support/specs/fastify-migration/evidence/FM-002.inventory.json'), 'utf8')
);
const owned = portalOwnedHttpRoutes({
  server: { rootContext: '' },
  companion: { enabled: false, route: '/companion' },
});
const api = new Map(apiRouteRegistrations().map(route => [route.declaration.name, route]));
const fixture = (
  name: string,
  method: RouteDeclaration['method'],
  routePath: string,
  provider = 'core'
): RouteRegistration => ({
  provider,
  declaration: { name, method, path: routePath, controller: 'Fixture', action: name, access: { kind: 'public' } },
});
const policies = (routes: readonly RouteRegistration[]) => [
  ...new Set(
    routes
      .flatMap(route => [
        ...(route.effectivePolicies ?? []),
        ...(route.declaration.access.kind === 'policies' ? route.declaration.access.names : []),
      ])
      .filter((name): name is string => name !== false)
  ),
];

function source(row: InventoryRow): RouteRegistration {
  const declaration = api.get(row.name);
  if (declaration) return declaration;
  const effective = row.access.effectivePolicies;
  return {
    ...fixture(row.name, row.method, row.original.path),
    effectivePolicies: effective,
    declaration: {
      ...fixture(row.name, row.method, row.original.path).declaration,
      controller: row.controller || 'Fixture',
      action: row.action || 'read',
      csrf: row.original.csrf,
      access: effective.includes(false)
        ? { kind: 'deny' }
        : effective.length
          ? { kind: 'policies', names: effective as [string, ...string[]] }
          : { kind: 'public' },
      ...(row.method === 'get' && row.head.behavior === 'explicit-405'
        ? { head: { kind: 'deny', allow: 'GET' } as const }
        : {}),
    },
  };
}

function expressReplacement(declaration: RouteDeclaration, reservations: readonly OwnedHttpRoute[] = owned) {
  return resolveExtensions(
    [
      {
        name: 'hook',
        root: '/installed/hook',
        declaration: {
          apiVersion: 1,
          handlers: [
            {
              name: 'probe',
              create: () => {
                throw new Error('offline resolver ran a factory');
              },
            },
          ],
          routes: [
            {
              name: declaration.name,
              method: declaration.method as Exclude<RouteDeclaration['method'], 'all'>,
              path: expressRuntimePath(declaration.path),
              access: 'public',
              handler: 'probe',
              replaces: true,
            },
          ],
        },
      },
    ],
    [],
    reservations
  );
}
function errorOf(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return String(error);
  }
}

describe('FM-010 every frozen replacement identity against Express resolution', () => {
  const targets = new Map(
    inventory.routes.flatMap(row => row.replacementTargets.map(target => [target.name, { row, target }] as const))
  );
  const collections = inventory.routes.filter(row => !targets.has(row.name));
  it('enumerates all 658 stable names, including 636 method targets and 194 HEAD names', () => {
    assert.equal(targets.size, 636);
    assert.equal(collections.length, 22);
    assert.equal([...targets.values()].filter(value => value.target.method === 'head').length, 194);
    assert.deepEqual(
      new Set([...targets.keys(), ...collections.map(row => row.name)]),
      new Set(inventory.routes.flatMap(row => [row.name, ...row.replacementTargets.map(target => target.name)]))
    );
    assert([...targets.keys()].every(name => owned.some(route => route.name === name)));
  });
  for (const { row, target } of targets.values())
    it(`resolves ${target.method} ${target.name} with its source ownership and metadata intact`, async () => {
      const original = source(row);
      const replacement: RouteRegistration = {
        ...fixture(target.name, target.method, row.original.path, 'hook'),
        declaration: {
          ...fixture(target.name, target.method, row.original.path).declaration,
          action: 'replacement',
          access: { kind: 'policies', names: ['replacement'] },
          csrf: false,
          replaces: true,
        },
      };
      const old = expressReplacement(replacement.declaration);
      assert.equal(old.routes[0].declaration.name, target.name);
      const composition = await composeRoutes([original, replacement], {
        policyNames: [...policies([original]), 'replacement'],
      });
      const selected = composition.routes.find(route => route.declaration.name === target.name)!;
      assert.equal(selected.provider, old.routes[0].provider);
      assert.equal(selected.declaration, replacement.declaration);
      assert.equal(selected.replaced!.provider, original.provider);
      assert.equal(selected.replaced!.declaration.method, target.method);
      assert.equal(selected.replaced!.declaration.path, original.declaration.path);
      assert.equal(selected.replaced!.declaration.api, original.declaration.api);
      assert.deepEqual(selected.replaced!.effectivePolicies, original.effectivePolicies ?? []);
      assert.equal(selected.replaced!.declaration.csrf, original.declaration.csrf);
      if (target.name !== row.name) {
        assert.equal(selected.replaced!.aliasOf!.declaration, original.declaration);
        const retained = composition.routes.find(route => route.declaration.name === row.name)!;
        assert.equal(retained.declaration, original.declaration);
        assert.equal(retained.declaration.api, original.declaration.api);
        assert.deepEqual(retained.effectivePolicies, original.effectivePolicies ?? []);
        assert(
          !composition.bindings.some(
            binding =>
              binding.route === retained &&
              binding.kind !== 'automatic-options' &&
              binding.method === target.method.toUpperCase()
          )
        );
        assert(
          composition.bindings.some(
            binding => binding.route === retained && binding.method !== target.method.toUpperCase()
          )
        );
      }
      const current = createPortalRouter();
      try {
        let calls: string[] = [];
        composition.install(current, { action: () => () => ({ ok: true }) }, async (binding, _request, reply) => {
          calls.push(binding.route.provider);
          reply.code(binding.route.provider === 'hook' ? 403 : 401).send();
        });
        const url = row.path
          .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, 'Value')
          .replace(/\{[^}]*\}/g, '')
          .replace('*key', 'one/two');
        const response = await current.inject({ method: target.method.toUpperCase(), url });
        assert.equal(response.statusCode, 403, target.name + ': ' + url);
        assert.deepEqual(calls, ['hook']);
        if (target.method === 'head' && row.method === 'get') {
          calls = [];
          assert.equal((await current.inject({ method: 'GET', url })).statusCode, 401);
          assert.deepEqual(calls, [original.provider]);
        }
        if (row.method === 'all') {
          if (target.method === 'get') {
            calls = [];
            assert.equal((await current.inject({ method: 'HEAD', url })).statusCode, 401);
            assert.deepEqual(calls, [original.provider]);
          }
          calls = [];
          assert.equal((await current.inject({ method: 'PROPFIND', url })).statusCode, 401);
          assert.deepEqual(calls, [original.provider]);
        }
      } finally {
        await current.close();
      }
      if (row.method === 'all' && target.method === 'get') {
        // Independent frozen reservations must remain independent through
        // replacement chains too: replacing GET cannot retarget HEAD history.
        const headReplacement: RouteRegistration = {
          ...fixture(coreRouteName('head', row.path), 'head', row.original.path, 'head-hook'),
          declaration: {
            ...fixture(coreRouteName('head', row.path), 'head', row.original.path).declaration,
            replaces: true,
          },
        };
        assert.equal(expressReplacement(headReplacement.declaration).routes[0].provider, 'hook');
        for (const replacements of [
          [replacement, headReplacement],
          [headReplacement, replacement],
        ]) {
          const chained = await composeRoutes([original, ...replacements], {
            policyNames: [...policies([original]), 'replacement'],
          });
          const head = chained.routes.find(route => route.declaration.name === headReplacement.declaration.name)!;
          assert.equal(head.replaced!.aliasOf!.declaration, original.declaration);
          assert(
            !chained.bindings.some(binding => binding.route.declaration.name === row.name && binding.method === 'HEAD')
          );
          assert(chained.bindings.some(binding => binding.route === head && binding.method === 'HEAD'));
        }
      }
      // Frozen reservations retain method/path exactly as the Express resolver.
      for (const change of [
        { method: target.method === 'post' ? ('put' as const) : ('post' as const) },
        { path: '/different-target' },
      ]) {
        const changed = { ...replacement, declaration: { ...replacement.declaration, ...change } };
        assert(
          errorOf(() =>
            expressReplacement(
              changed.declaration,
              owned.filter(route => route.name === target.name)
            )
          )
        );
        await assert.rejects(
          composeRoutes([original, changed], { policyNames: [...policies([original]), 'replacement'] }),
          /retain its method and path/
        );
      }
    });
  for (const row of collections)
    it(`keeps internal ALL collection ${row.name} outside the API1 method-target namespace`, async () => {
      assert.equal(row.method, 'all');
      const original = source(row);
      const replacement = {
        ...fixture(row.name, 'get', row.path, 'hook'),
        declaration: {
          ...fixture(row.name, 'get', row.path).declaration,
          replaces: true as const,
        },
      };
      assert.match(
        errorOf(() => expressReplacement(replacement.declaration))!,
        /replacement has no target/
      );
      await assert.rejects(
        composeRoutes([original, replacement], { policyNames: policies([original]) }),
        /retain its method and path/
      );
    });
  it('keeps alias history across two HEAD replacements without changing its GET source', async () => {
    const row = inventory.routes.find(row => row.name === 'core-http-get-443ff9adb3d2b64f')!;
    const original = source(row);
    const name = 'core-http-head-443ff9adb3d2b64f';
    const first = {
      ...fixture(name, 'head', row.path, 'first'),
      declaration: { ...fixture(name, 'head', row.path).declaration, replaces: true as const },
    };
    const second = { ...first, provider: 'second', declaration: { ...first.declaration, action: 'second' } };
    const result = await composeRoutes([original, first, second], { policyNames: policies([original]) });
    const head = result.routes.find(route => route.declaration.name === name)!;
    assert.equal(head.provider, 'second');
    assert.equal(head.replaced!.provider, 'first');
    assert.equal(head.replaced!.replaced!.aliasOf!.declaration, original.declaration);
    assert.equal(result.routes.find(route => route.declaration.name === row.name)!.declaration, original.declaration);
  });
  it('retains GET captures and API metadata when a frozen HEAD replacement renames its own captures', async () => {
    const row = inventory.routes.find(row => row.name === 'core-http-get-443ff9adb3d2b64f')!;
    const original = source(row);
    const name = 'core-http-head-443ff9adb3d2b64f';
    const replacement: RouteRegistration = {
      ...fixture(name, 'head', '/:brand/:site/api/records/metadata/:recordId', 'hook'),
      declaration: {
        ...fixture(name, 'head', '/:brand/:site/api/records/metadata/:recordId').declaration,
        replaces: true as const,
        access: { kind: 'policies', names: ['replacement'] as const },
      },
    };
    assert.equal(expressReplacement(replacement.declaration).routes[0].declaration.path, replacement.declaration.path);
    const composition = await composeRoutes([original, replacement], {
      policyNames: [...policies([original]), 'replacement'],
    });
    const current = createPortalRouter();
    const seen: { provider: string; params: unknown }[] = [];
    try {
      composition.install(current, { action: () => () => null }, async (binding, request, reply) => {
        seen.push({ provider: binding.route.provider, params: { ...(request.params as Record<string, string>) } });
        reply.code(403).send();
      });
      for (const method of ['HEAD', 'GET'] as const)
        assert.equal(
          (await current.inject({ method, url: '/Brand/Portal/api/records/metadata/A%2FB' })).statusCode,
          403
        );
      assert.deepEqual(seen, [
        { provider: 'hook', params: { brand: 'Brand', site: 'Portal', recordId: 'A/B' } },
        { provider: original.provider, params: { branding: 'Brand', portal: 'Portal', oid: 'A/B' } },
      ]);
      assert.equal(
        composition.routes.find(route => route.declaration.name === row.name)!.declaration.api,
        original.declaration.api
      );
    } finally {
      await current.close();
    }
  });
});

type HeadKind = 'explicit' | 'implicit-head' | 'denied-head' | 'GET-owned' | 'replaced' | 'ALL-owned';
const kinds: readonly HeadKind[] = ['explicit', 'implicit-head', 'denied-head', 'GET-owned', 'replaced', 'ALL-owned'];
function headRoutes(kind: HeadKind, routePath: string, side: string): RouteRegistration[] {
  const method = kind === 'explicit' ? 'head' : kind === 'ALL-owned' ? 'all' : 'get';
  const name = ['GET-owned', 'replaced'].includes(kind) ? coreRouteName('get', routePath) : side;
  const original = fixture(name, method, routePath, side);
  const ownedRoute: RouteRegistration = {
    ...original,
    declaration: {
      ...original.declaration,
      action: side,
      access: side === 'right' ? { kind: 'policies', names: ['protected'] } : { kind: 'public' },
      ...(kind === 'denied-head' ? { head: { kind: 'deny', allow: 'GET' } as const } : {}),
    },
  };
  if (kind !== 'replaced') return [ownedRoute];
  return [
    ownedRoute,
    {
      ...ownedRoute,
      provider: side + '-replacement',
      declaration: {
        ...ownedRoute.declaration,
        name: coreRouteName('head', routePath),
        method: 'head',
        replaces: true,
      },
    },
  ];
}

/** Real Express router, applying the resolver's explicit-HEAD-first order. No
 * catch-all fixture handler can silently mask the selected route's guard.
 */
async function expressHead(routes: readonly RouteRegistration[], prefix: string, target: string) {
  const app = express();
  const router = express.Router();
  const guards: string[] = [];
  for (const route of [...routes].sort(
    (a, b) => Number(b.declaration.method === 'head') - Number(a.declaration.method === 'head')
  ))
    router[route.declaration.method](expressRuntimePath(route.declaration.path), (_request, reply) => {
      guards.push(route.declaration.action);
      reply.set('x-guard', route.declaration.action);
      if (
        route.declaration.access.kind !== 'policies' &&
        route.declaration.head?.kind === 'deny' &&
        route.declaration.head.allow
      )
        reply.set('Allow', route.declaration.head.allow);
      reply
        .status(
          route.declaration.access.kind === 'policies' ? 403 : route.declaration.head?.kind === 'deny' ? 405 : 200
        )
        .end();
    });
  app.use(prefix || '/', router);
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const response = await new Promise<{ status: number; guard: string | undefined; allow: string | undefined }>(
      (resolve, reject) => {
        const client = httpRequest(
          { host: '127.0.0.1', port: address.port, path: prefix + target, method: 'HEAD', agent: false },
          reply => {
            reply.resume();
            reply.on('end', () =>
              resolve({
                status: reply.statusCode!,
                guard: reply.headers['x-guard'] as string | undefined,
                allow: reply.headers.allow,
              })
            );
          }
        );
        client.on('error', reject);
        client.setTimeout(5000, () => client.destroy(new Error('HEAD audit request timed out')));
        client.end();
      }
    );
    return { ...response, guards };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
}

describe('FM-010 HEAD kind x overlap x order guard audit', () => {
  const outcomes = { rejected: 0, matchedExpress: 0 };
  const overlaps = [
    ['exact', '/x/:id', '/x/:other'],
    ['param-static', '/x/:id', '/x/fixed'],
    ['static-param', '/x/fixed', '/x/:id'],
    ['wildcard-param', '/x/*tail', '/x/:id'],
    ['param-wildcard', '/x/:id', '/x/*tail'],
    ['wildcard-static', '/x/*tail', '/x/fixed'],
    ['static-wildcard', '/x/fixed', '/x/*tail'],
  ];
  for (const left of kinds)
    for (const right of kinds)
      for (const [overlap, first, second] of overlaps)
        for (const reverse of [false, true])
          for (const prefix of ['', '/research/v6'])
            for (const legacyOrder of [false, true])
              it(`${left} / ${right}, ${overlap}, reverse=${reverse}, root=${prefix || '/'}, legacy=${legacyOrder}`, async () => {
                const blocks = [headRoutes(left, first, 'left'), headRoutes(right, second, 'right')];
                const routes = (reverse ? blocks.reverse() : blocks).flat();
                let composition: Awaited<ReturnType<typeof composeRoutes>>;
                try {
                  composition = await composeRoutes(routes, {
                    policyNames: ['protected'],
                    rootContext: prefix,
                    legacyOrder,
                  });
                } catch (error) {
                  assert.match(String(error), /route collision|route overlap|requires replaces/);
                  outcomes.rejected++;
                  return;
                }
                const old = await expressHead(routes, prefix, '/x/fixed');
                const current = createPortalRouter();
                const guards: string[] = [];
                try {
                  composition.install(current, { action: () => () => null }, async (binding, _request, reply) => {
                    const route = binding.route.declaration;
                    guards.push(route.action);
                    reply.header('x-guard', route.action);
                    if (route.access.kind === 'policies') reply.code(403).send();
                  });
                  const result = await current.inject({ method: 'HEAD', url: prefix + '/x/fixed' });
                  assert.equal(result.statusCode, old.status);
                  assert.equal(result.headers['x-guard'], old.guard);
                  assert.equal(result.headers.allow, old.allow);
                  assert.deepEqual(guards, old.guards);
                  outcomes.matchedExpress++;
                } finally {
                  await current.close();
                }
              });
  for (const kind of kinds)
    for (const legacyOrder of [false, true])
      it(`binds and dispatches a non-overlapping ${kind} control, legacy=${legacyOrder}`, async () => {
        const routes = [...headRoutes(kind, '/x/:id', 'left'), ...headRoutes('explicit', '/unrelated/:id', 'right')];
        const composition = await composeRoutes(routes, { policyNames: ['protected'], legacyOrder });
        const current = createPortalRouter();
        const guards: string[] = [];
        try {
          composition.install(current, { action: () => () => null }, async (binding, _request, reply) => {
            guards.push(binding.route.declaration.action);
            if (binding.route.declaration.access.kind === 'policies') reply.code(403).send();
          });
          assert.equal(
            (await current.inject({ method: 'HEAD', url: '/x/fixed' })).statusCode,
            kind === 'denied-head' ? 405 : 200
          );
          assert.equal((await current.inject({ method: 'HEAD', url: '/unrelated/fixed' })).statusCode, 403);
          assert.deepEqual(guards, ['left', 'right']);
        } finally {
          await current.close();
        }
      });
  after(() => {
    assert.equal(outcomes.rejected + outcomes.matchedExpress, 2016);
    assert(outcomes.rejected > 0);
    process.stdout.write(
      `FM-010 HEAD matrix: ${outcomes.rejected} rejected, ${outcomes.matchedExpress} matched Express guards, 2016 overlap/order/root/mode cases plus twelve binding controls.\n`
    );
  });
});
