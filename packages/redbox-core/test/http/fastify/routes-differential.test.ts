import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Agent, createServer, request as httpRequest, type RequestListener } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import express from 'express';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import inject from 'light-my-request';
import { parse, type Token } from 'path-to-regexp';
import fastify, { type HTTPMethods } from 'fastify';
import { inventory, inventoryRegistration, productionInventoryOrder } from './inventory-fixture';
import { getMergedApiRoutes, registerCoreApiRoutes } from '../../../dist/api-routes/route-registry';
import { validateApiRouteRequest } from '../../../dist/api-routes/validation';
import { updateMetaRoute } from '../../../dist/api-routes/groups/records';
import { httpErrorHandler } from '../../../dist/http/express/middleware';
import {
  apiRouteRegistrations,
  composeRoutes,
  coreRoutePrecedence,
  createPortalRouter,
  expressRuntimePath,
  portalRouterOptions,
  translateRoutePath,
  type RouteRegistration,
  type RoutePrecedence,
} from '../../../dist/http/fastify/routes';
import { routerConstraints, routerUrl } from '../../../dist/http/fastify/router';

const root = path.resolve(__dirname, '../../../../..');
const paths = [...new Set(inventory.routes.map(row => expressRuntimePath(row.original.path)))];
const query =
  'nested[key]=A+Person&tag=a&tag=b&blank=&flag=false&count=02&mix=a&mix[]=b&arr[21]=x&a[b][c][d][e][f][g]=v&bad=%ZZ&short=%E0%A4%A&__proto__[polluted]=yes&constructor[prototype][own]=yes&toString=own';
const thousandKeys = Array.from({ length: 1001 }, (_, index) => `k${index}=v`).join('&');
const noGuards = async () => {};
const rootPatterns = [
  '/',
  '/literal',
  '/:id',
  '/:id{/:other}',
  '/datastream{*tail}',
  '/*tail',
  '/:id.css',
  '/:id.json',
  '/:id.woff2',
];
const registration = (routePath: string): RouteRegistration => ({
  provider: 'differential',
  declaration: {
    name: 'differential',
    method: 'get',
    path: routePath,
    controller: 'Fixture',
    action: 'read',
    access: { kind: 'public' },
  },
});

/** Independent corpus generation from the original Express tokens, not Fastify's
 * translated alternatives. The real Express Router is the matching oracle.
 */
function alternatives(tokens: readonly Token[]): Token[][] {
  if (!tokens.length) return [[]];
  const [first, ...rest] = tokens;
  const starts = first.type === 'group' ? [...alternatives(first.tokens), []] : [[first]];
  return starts.flatMap(start => alternatives(rest).map(tail => [...start, ...tail]));
}
function corpus(routePath: string): string[] {
  const cases = new Set<string>(['/', '//']);
  const values = [
    '',
    'Value',
    '%2F',
    '%2f',
    'a%2Fb',
    '%2E',
    'a%2Eb',
    '%25',
    '%252F',
    'A%20B',
    'A%0AB',
    'a+b',
    'a%3Fb',
    'a%23b',
    '%ZZ',
    '%',
    '%E0%A4',
    '%C0%AF',
    'a//b',
    '/',
    'L'.repeat(1024),
    'L'.repeat(8192),
  ];
  for (const tokens of alternatives(parse(routePath).tokens)) {
    const render = (changed = -1, value = '') =>
      tokens
        .map((token, index) =>
          index === changed
            ? value
            : token.type === 'text'
              ? token.value
              : token.type === 'param'
                ? 'MiXeD_' + token.name
                : 'one/two/'
        )
        .join('');
    const base = render();
    for (const url of [base, base.toUpperCase(), base.replace(/\/+$/, '') || '/', base + '/', base + '//'])
      cases.add(url);
    tokens.forEach((token, index) => {
      if (token.type !== 'text') for (const value of values) cases.add(render(index, value));
      else {
        // Exercise raw static segments, suffix delimiters and each suffix letter.
        for (let position = 0; position < token.value.length; position++) {
          const char = token.value[position];
          if (/[A-Za-z./]/.test(char) && !(index === 0 && position === 0)) {
            const encoded = '%' + char.charCodeAt(0).toString(16).toUpperCase();
            cases.add(render(index, token.value.slice(0, position) + encoded + token.value.slice(position + 1)));
          }
        }
      }
    });
    for (let index = 1; index < base.length; index++)
      if (base[index] === '/') cases.add(base.slice(0, index) + '/' + base.slice(index));
    // No captures: malformed escapes should miss a literal route, rather than
    // becoming an eager decoding error before matching.
    cases.add(base + '%ZZ');
    cases.add(base + '%');
  }
  return [...cases].filter(url => url.startsWith('/'));
}

function corpusUrls(routePath: string, prefix: string): string[] {
  const urls = corpus(routePath).map(url => prefix + url + '?' + query);
  const valid =
    prefix +
    alternatives(parse(routePath).tokens)[0]
      .map(token => (token.type === 'text' ? token.value : token.type === 'param' ? 'Value' : 'one/two'))
      .join('');
  urls.push(valid + '?' + thousandKeys);
  const malformed = corpus(routePath).find(url => url.includes('%ZZ'));
  if (malformed) urls.push(prefix + malformed + '?apiVersion=2.0');
  if (prefix) urls.push(valid.replace(prefix, '/research%2Fv6'), valid.replace(prefix, '/research/v6x'));
  urls.push(...[...new Set(['/', prefix || '/', prefix + '/', prefix + '//'])].map(url => url + '?' + query));
  return [...new Set(urls)];
}

/** Candidate crossings from pairs of original Express alternatives. This only
 * generates targets: the two real routers still decide matching and ownership.
 */
interface Crossing {
  first: string;
  second: string;
  target: string;
}
function crossingUrls(routePaths = paths, visit?: (crossing: Crossing) => void): string[] {
  const templates = routePaths.flatMap(routePath =>
    alternatives(parse(routePath).tokens).map(tokens => ({
      routePath,
      parts: tokens
        .map(token => (token.type === 'text' ? token.value : token.type === 'param' ? ':' + token.name : '*'))
        .join('')
        .split('/'),
    }))
  );
  const result = new Set<string>();
  const concrete = (segment: string) => segment.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, 'Value').replace('*', 'one/two');
  for (let a = 0; a < templates.length; a++)
    for (let b = a + 1; b < templates.length; b++) {
      const left = templates[a].parts;
      const right = templates[b].parts;
      const parts: string[] = [];
      let compatible = true;
      for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const x = left[index];
        const y = right[index];
        if (x === undefined || y === undefined) {
          compatible = false;
          break;
        }
        if (x.includes('*') || y.includes('*')) {
          const rest = x.includes('*') ? right.slice(index) : left.slice(index);
          parts.push(...rest.map(concrete));
          break;
        }
        if (!x.startsWith(':') && !y.startsWith(':')) {
          if (x.toLowerCase() !== y.toLowerCase()) {
            compatible = false;
            break;
          }
          parts.push(x);
        } else if (!x.startsWith(':')) parts.push(x);
        else if (!y.startsWith(':')) parts.push(y);
        else parts.push(concrete(x.length > y.length ? x : y));
      }
      if (compatible) {
        const target = parts.join('/') || '/';
        result.add(target);
        if (templates[a].routePath !== templates[b].routePath)
          visit?.({ first: templates[a].routePath, second: templates[b].routePath, target });
      }
    }
  // A crossing central to the actual metadata/ALL upload table must be probed.
  assert(result.has('/Value/Value/record/type/attach'));
  return [...result];
}

function patternClass(routePath: string): string {
  if (routePath === '/') return 'root';
  const tokens = parse(routePath).tokens;
  if (tokens.some(token => token.type === 'group' && token.tokens.some(child => child.type === 'wildcard')))
    return 'optional-wildcard';
  if (tokens.some(token => token.type === 'group')) return 'optional-segment';
  if (tokens.some(token => token.type === 'wildcard')) return 'required-wildcard';
  for (let index = 0; index < tokens.length; index++) {
    const next = tokens[index + 1];
    if (tokens[index].type === 'param' && next?.type === 'text' && next.value.startsWith('.'))
      return 'suffix' + next.value;
  }
  return tokens.some(token => token.type === 'param') ? 'parameters' : 'literal';
}

/** Preserve the exact target, including dot segments and malformed percent text:
 * URL()/fetch/inject's URL parser would otherwise normalize some corpus entries.
 */
async function exchange(dispatch: RequestListener, url: string, method: HTTPMethods = 'GET') {
  return inject(
    (request, response) => {
      request.url = url;
      dispatch(request, response);
    },
    { url: '/raw-target', method }
  );
}
function visibleParams(params: Record<string, unknown>, routePath: string): Record<string, unknown> {
  const result = Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, Array.isArray(value) ? value.join('/') : value])
  );
  // FM-003 explicitly treats datastream's ignored tail/array shape as incidental.
  if (routePath.endsWith('datastream{*tail}')) delete result.tail;
  return result;
}

/** Two attachment resources intentionally have GET ownership plus an ALL/TUS
 * owner for the other methods. Fuse only those inventoried pairs into a single
 * native ALL resource, with a GET action probe; every source identity is kept.
 */
function inventoryTable() {
  const ordered = productionInventoryOrder();
  const getOwners = new Map<string, RouteRegistration>();
  const registrationFor = inventoryRegistration;
  const fallthrough = ordered.filter(
    row => row.head.behavior === 'policies then next(); falls through to TUS ALL handler'
  );
  assert.equal(fallthrough.length, 2);
  for (const get of fallthrough) {
    const all = ordered.find(row => row.name === get.head.explicitTarget)!;
    assert(all && all.method === 'all' && all.path === get.path);
    getOwners.set(all.name, registrationFor(get));
  }
  const registrations = ordered.filter(row => !fallthrough.includes(row)).map(registrationFor);
  assert.equal(registrations.length, 333);
  assert.deepEqual(
    new Set([
      ...registrations.map(route => route.declaration.name),
      ...[...getOwners.values()].map(route => route.declaration.name),
    ]),
    new Set(inventory.routes.map(row => row.name))
  );
  // Keep GET-owned HEAD implicit, as the source does. Composition must preserve
  // its position beside GET rather than inventing a separately declared policy.
  return { registrations, getOwners };
}

async function fixture(
  input: string | readonly RouteRegistration[],
  prefix = '',
  getOwners: ReadonlyMap<string, RouteRegistration> = new Map(),
  legacyOrder = false,
  intended: readonly RoutePrecedence[] = []
) {
  const registrations = typeof input === 'string' ? [registration(input)] : input;
  const describeAction = (route: RouteRegistration, method: string) =>
    (method === 'GET' || route.declaration.method === 'head' ? getOwners.get(route.declaration.name) : undefined) ??
    route;
  const result = (route: RouteRegistration, params: Record<string, unknown>, query: unknown, url: string) => ({
    ...(typeof input === 'string' ? {} : { route: route.declaration.name }),
    params: visibleParams(params, expressRuntimePath(route.declaration.path)),
    query,
    url,
  });
  const composition = await composeRoutes(registrations, {
    policyNames: [
      ...new Set([
        'audit-guard',
        ...registrations
          .flatMap(route => route.effectivePolicies ?? [])
          .filter((name): name is string => name !== false),
      ]),
    ],
    rootContext: prefix,
    legacyOrder,
    precedence: [
      ...intended,
      ...coreRoutePrecedence.filter(
        override =>
          registrations.some(route => route.declaration.name === override.winner) &&
          registrations.some(route => route.declaration.name === override.over)
      ),
    ],
  });
  const old = express();
  old.set('query parser', 'extended');
  let expressCalls = 0;
  let expressRoute: string | undefined;
  let expressGuard: string | undefined;
  let expressGuardCalls = 0;
  const router = express.Router();
  for (const route of [...registrations].sort(
    (a, b) => Number(b.declaration.method === 'head') - Number(a.declaration.method === 'head')
  ))
    router[route.declaration.method](expressRuntimePath(route.declaration.path), (request, reply) => {
      expressGuard = route.declaration.name;
      expressGuardCalls++;
      if (route.declaration.access.kind !== 'public') {
        reply.status(403).end();
        return;
      }
      if (request.method === 'HEAD' && route.declaration.head?.kind === 'deny') {
        if (route.declaration.head.allow) reply.set('Allow', route.declaration.head.allow);
        reply.status(405).end();
        return;
      }
      const owner = describeAction(route, request.method);
      expressCalls++;
      expressRoute = owner.declaration.name;
      reply.json(result(owner, request.params, request.query, request.originalUrl));
    });
  old.use(prefix || '/', router);
  old.use((_request, reply) => reply.status(404).json({ error: 'not-found' }));
  old.use(httpErrorHandler(nothingLogger));
  const current = createPortalRouter({ exposeHeadRoutes: false });
  current.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ error: 'not-found' }));
  let fastifyCalls = 0;
  let fastifyRoute: string | undefined;
  let fastifyGuard: string | undefined;
  let fastifyGuardCalls = 0;
  composition.install(
    current,
    {
      action: declaration => request => {
        const owner = describeAction(
          { provider: 'differential', declaration: declaration as RouteRegistration['declaration'] },
          request.method
        );
        fastifyCalls++;
        fastifyRoute = owner.declaration.name;
        return result(owner, request.params as Record<string, unknown>, request.query, request.url);
      },
    },
    async (binding, _request, reply) => {
      fastifyGuard = binding.route.declaration.name;
      fastifyGuardCalls++;
      if (binding.route.declaration.access.kind !== 'public') reply.code(403).send();
    }
  );
  await current.ready();
  // Express on Node 26 changes ServerResponse's prototype; use actual HTTP for
  // the oracle instead of light-my-request's response interception.
  const server = createServer(old);
  const agent = new Agent({ keepAlive: true });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  await current.listen({ port: 0, host: '127.0.0.1' });
  const currentAddress = current.server.address();
  assert(currentAddress && typeof currentAddress === 'object');
  const network = (
    port: number,
    url: string,
    method: HTTPMethods = 'GET'
  ): Promise<{
    statusCode: number;
    body: string;
    headers: import('node:http').IncomingHttpHeaders;
    allow: string | undefined;
    json(): unknown;
  }> =>
    new Promise((resolve, reject) => {
      const client = httpRequest({ hostname: '127.0.0.1', port, path: url, agent, method }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          resolve({
            statusCode: response.statusCode!,
            body,
            headers: response.headers,
            allow: response.headers.allow,
            json: () => JSON.parse(body),
          });
        });
      });
      client.on('error', reject);
      client.setTimeout(5000, () => client.destroy(new Error('Differential request timed out')));
      client.end();
    });
  return {
    original: (url: string, method: HTTPMethods = 'GET') => network(address.port, url, method),
    migrated: (url: string, method: HTTPMethods = 'GET') => network(currentAddress.port, url, method),
    current,
    calls: () => ({
      expressCalls,
      fastifyCalls,
      expressRoute,
      fastifyRoute,
      expressGuard,
      fastifyGuard,
      expressGuardCalls,
      fastifyGuardCalls,
    }),
    async close() {
      agent.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
      await current.close();
    },
  };
}

function assertGuards(
  before: ReturnType<Awaited<ReturnType<typeof fixture>>['calls']>,
  after: ReturnType<Awaited<ReturnType<typeof fixture>>['calls']>,
  label: string
) {
  assert.equal(
    after.fastifyGuardCalls - before.fastifyGuardCalls,
    after.expressGuardCalls - before.expressGuardCalls,
    label + ': guard count'
  );
  if (after.expressGuardCalls !== before.expressGuardCalls)
    assert.equal(after.fastifyGuard, after.expressGuard, label + ': guard identity');
}

let comparisons = 0;
let setComparisons = 0;
describe('FM-010 retained Express/Fastify differential corpus', function () {
  this.timeout(30_000);
  it('covers every concrete inventory path and every inventory pattern class', () => {
    assert.equal(inventory.routes.length, 335);
    assert.deepEqual(
      [...new Set(paths.map(patternClass))].sort(),
      [
        'literal',
        'optional-segment',
        'optional-wildcard',
        'parameters',
        'required-wildcard',
        'root',
        'suffix.css',
        'suffix.json',
        'suffix.woff2',
      ].sort()
    );
    assert(paths.every(routePath => corpus(routePath).includes('/')));
    assert.deepEqual(new Set(rootPatterns.map(patternClass)), new Set(paths.map(patternClass)));
  });
  const representatives = [...new Map(paths.map(routePath => [patternClass(routePath), routePath])).values()];
  const targets = [
    ...paths.map(routePath => ({ routePath, prefix: '' })),
    ...representatives.map(routePath => ({ routePath, prefix: '/research/v6' })),
    ...rootPatterns.flatMap(routePath => ['', '/research/v6'].map(prefix => ({ routePath, prefix }))),
  ];
  for (const { routePath, prefix } of targets)
    it(`compares raw matching, captures and bounded queries for ${prefix}${routePath}`, async () => {
      const f = await fixture(routePath, prefix);
      try {
        const urls = corpusUrls(routePath, prefix);
        for (const url of urls) {
          const before = f.calls();
          const [expected, actual] = await Promise.all([f.original(url), f.migrated(url)]);
          comparisons++;
          const label = JSON.stringify({
            routePath,
            url: url.length > 400 ? url.slice(0, 160) + `…(${url.length} chars)` : url,
          });
          assert.equal(actual.statusCode, expected.statusCode, label);
          assert.equal(
            f.calls().fastifyCalls - before.fastifyCalls,
            f.calls().expressCalls - before.expressCalls,
            label + ': action dispatch'
          );
          assertGuards(before, f.calls(), label);
          assert.deepEqual(actual.json(), expected.json(), label);
          assert.equal(Reflect.get(Object.prototype, 'polluted'), undefined);
        }
      } finally {
        await f.close();
      }
    });
  after(() => {
    process.stdout.write(
      `FM-010 differential: ${comparisons} URL comparisons, ${paths.length} unique inventory paths, ${representatives.length} pattern classes.\n`
    );
  });
});

describe('FM-010 complete inventory route-set differential', function () {
  this.timeout(180_000);
  const table = inventoryTable();
  const crossings = crossingUrls();
  for (const prefix of ['', '/research/v6'])
    it(`rejects the unresolved complete table in native mode, root=${prefix || '/'}`, async () => {
      await assert.rejects(
        fixture(table.registrations, prefix, table.getOwners, false),
        /route collision|route overlap|cannot retain winner/
      );
    });
  for (const prefix of ['', '/research/v6'])
    describe(`all 335 source declarations together, root=${prefix || '/'}`, () => {
      let f: Awaited<ReturnType<typeof fixture>>;
      before(async () => {
        f = await fixture(table.registrations, prefix, table.getOwners, true);
      });
      after(async () => {
        await f?.close();
      });
      it('compares generated crossings between inventory patterns for every declared method class', async () => {
        const failures: string[] = [];
        for (const target of crossings)
          for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND'] as const) {
            const url = prefix + target + '?' + query;
            const before = f.calls();
            const [expected, actual] = await Promise.all([f.original(url, method), f.migrated(url, method)]);
            setComparisons++;
            const label = method + ' ' + url;
            try {
              assert.equal(actual.statusCode, expected.statusCode, label);
              const after = f.calls();
              assertGuards(before, after, label);
              assert.equal(
                after.fastifyCalls - before.fastifyCalls,
                after.expressCalls - before.expressCalls,
                label + ': dispatch count'
              );
              if (after.expressCalls !== before.expressCalls)
                assert.equal(after.fastifyRoute, after.expressRoute, label + ': dispatch identity');
              assert.equal(actual.allow, expected.allow, label + ': Allow');
              if (actual.body && actual.headers['content-type']?.includes('application/json'))
                assert.deepEqual(actual.json(), expected.json(), label);
              else assert.equal(actual.body, expected.body, label);
            } catch (error) {
              failures.push(String(error));
            }
          }
        assert.deepEqual(failures, []);
      });
      for (const row of inventory.routes)
        it(`compares the full-table corpus for ${row.name} ${row.method} ${row.path}`, async () => {
          const methods = [
            ...new Set<HTTPMethods>([
              row.method === 'all' ? 'GET' : (row.method.toUpperCase() as HTTPMethods),
              'HEAD',
              'OPTIONS',
            ]),
          ];
          for (const url of corpusUrls(expressRuntimePath(row.original.path), prefix))
            for (const method of methods) {
              const before = f.calls();
              const [expected, actual] = await Promise.all([f.original(url, method), f.migrated(url, method)]);
              setComparisons++;
              const label = JSON.stringify({
                row: row.name,
                method,
                url: url.length > 400 ? url.slice(0, 160) + '…' : url,
              });
              assert.equal(actual.statusCode, expected.statusCode, label);
              const after = f.calls();
              assertGuards(before, after, label);
              assert.equal(
                after.fastifyCalls - before.fastifyCalls,
                after.expressCalls - before.expressCalls,
                label + ': dispatch count'
              );
              if (after.expressCalls !== before.expressCalls)
                assert.equal(after.fastifyRoute, after.expressRoute, label + ': dispatch identity');
              assert.equal(actual.headers.allow, expected.allow, label + ': Allow');
              if (actual.body && actual.headers['content-type']?.includes('application/json'))
                assert.deepEqual(actual.json(), expected.json(), label);
              else assert.equal(actual.body, expected.body, label);
            }
        });
    });
  after(() => {
    process.stdout.write(
      `FM-010 route sets: ${setComparisons} URL/method comparisons, ${crossings.length} generated pattern crossings, all 335 inventory identities, two root contexts.\n`
    );
  });
});

describe('FM-010 generated crossing guard differential in every composition mode', function () {
  this.timeout(600_000);
  const pairs = new Map<string, { first: string; second: string; targets: Set<string> }>();
  const generated = crossingUrls([...new Set([...paths, ...rootPatterns])], crossing => {
    const key = JSON.stringify([crossing.first, crossing.second]);
    const pair = pairs.get(key) ?? { ...crossing, targets: new Set<string>() };
    pair.targets.add(crossing.target);
    pairs.set(key, pair);
  });
  const outcomes = { rejected: 0, accepted: 0, comparisons: 0 };
  const auditedMethods = ['get', 'head', 'post', 'put', 'patch', 'delete', 'options', 'all'] as const;
  const methodPairs = [...auditedMethods.map(method => [method, method] as const), ['get', 'options'] as const];
  it('includes every full-inventory crossing and all root-level pattern classes', () => {
    assert(crossingUrls().every(target => generated.includes(target)));
    assert([...pairs.values()].some(pair => pair.first === '/*tail' || pair.second === '/*tail'));
    assert.deepEqual(new Set(rootPatterns.map(patternClass)), new Set(paths.map(patternClass)));
  });
  for (const legacyOrder of [false, true])
    for (const prefix of ['', '/research/v6'])
      it(`compares every crossing's declaration guard, legacy=${legacyOrder}, root=${prefix || '/'}`, async () => {
        for (const pair of pairs.values())
          for (const methods of methodPairs)
            for (const reverse of [false, true]) {
              const routes: RouteRegistration[] = [pair.first, pair.second].map((routePath, index) => ({
                ...registration(routePath),
                declaration: {
                  ...registration(routePath).declaration,
                  name: index ? 'public-second' : 'protected-first',
                  method: methods[index],
                  access: index ? { kind: 'public' } : { kind: 'policies', names: ['audit-guard'] },
                },
              }));
              if (reverse) routes.reverse();
              let f: Awaited<ReturnType<typeof fixture>>;
              try {
                f = await fixture(routes, prefix, new Map(), legacyOrder);
              } catch (error) {
                assert.match(String(error), /route collision|route overlap/);
                outcomes.rejected++;
                continue;
              }
              outcomes.accepted++;
              try {
                for (const target of new Set([...pair.targets, '/', '//']))
                  for (const method of [
                    ...new Set<HTTPMethods>([
                      ...methods.flatMap(method =>
                        method === 'all'
                          ? (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND'] as const)
                          : [method.toUpperCase() as HTTPMethods]
                      ),
                      'GET',
                      'HEAD',
                      'OPTIONS',
                    ]),
                  ]) {
                    const url = prefix + target;
                    const before = f.calls();
                    const [expected, actual] = await Promise.all([f.original(url, method), f.migrated(url, method)]);
                    outcomes.comparisons++;
                    const label = JSON.stringify({
                      pair: [pair.first, pair.second],
                      methods,
                      legacyOrder,
                      prefix,
                      reverse,
                      method,
                      url,
                    });
                    assert.equal(actual.statusCode, expected.statusCode, label);
                    assertGuards(before, f.calls(), label);
                    assert.equal(actual.allow, expected.allow, label);
                    assert.equal(actual.body, expected.body, label);
                  }
              } finally {
                await f.close();
              }
            }
      });
  after(() => {
    assert.equal(outcomes.accepted + outcomes.rejected, pairs.size * 8 * methodPairs.length);
    assert(outcomes.accepted > 0 && outcomes.rejected > 0);
    process.stdout.write(
      `FM-010 crossing guards: ${pairs.size} pattern pairs, ${generated.length} targets, ${outcomes.rejected} rejected / ${outcomes.accepted} accepted compositions, ${outcomes.comparisons} HTTP comparisons; both orders, modes and roots, all eight declaration methods plus GET/OPTIONS.\n`
    );
  });
});

describe('FM-010 all-method route overlap matrix', () => {
  const methods = ['get', 'head', 'post', 'put', 'patch', 'delete', 'options', 'all'] as const;
  const overlaps = [
    ['exact', '/x/:id', '/x/:other'],
    ['param-static', '/x/:id', '/x/fixed'],
    ['static-param', '/x/fixed', '/x/:id'],
    ['wildcard-param', '/x/*tail', '/x/:id'],
    ['param-wildcard', '/x/:id', '/x/*tail'],
    ['wildcard-static', '/x/*tail', '/x/fixed'],
    ['static-wildcard', '/x/fixed', '/x/*tail'],
  ];
  const outcomes = { rejected: 0, accepted: 0, comparisons: 0 };
  for (const left of methods)
    for (const right of methods)
      for (const [kind, first, second] of overlaps)
        for (const reverse of [false, true])
          for (const legacyOrder of [false, true])
            for (const prefix of ['', '/research/v6'])
              it(`${left}/${right} ${kind}, reverse=${reverse}, legacy=${legacyOrder}, root=${prefix || '/'}`, async () => {
                const routes: RouteRegistration[] = [first, second].map((routePath, index) => ({
                  ...registration(routePath),
                  declaration: {
                    ...registration(routePath).declaration,
                    name: index ? 'public' : 'protected',
                    method: index ? right : left,
                    access: index ? { kind: 'public' } : { kind: 'policies', names: ['audit-guard'] },
                  },
                }));
                if (reverse) routes.reverse();
                let f: Awaited<ReturnType<typeof fixture>>;
                try {
                  f = await fixture(routes, prefix, new Map(), legacyOrder);
                } catch (error) {
                  assert.match(String(error), /route overlap|route collision/);
                  outcomes.rejected++;
                  return;
                }
                outcomes.accepted++;
                try {
                  for (const method of [
                    'GET',
                    'HEAD',
                    'POST',
                    'PUT',
                    'PATCH',
                    'DELETE',
                    'OPTIONS',
                    'PROPFIND',
                  ] as const) {
                    const url = prefix + '/x/fixed';
                    const before = f.calls();
                    const [expected, actual] = await Promise.all([f.original(url, method), f.migrated(url, method)]);
                    outcomes.comparisons++;
                    assert.equal(actual.statusCode, expected.statusCode, method);
                    assert.equal(actual.allow, expected.allow, method);
                    assert.equal(actual.body, expected.body, method);
                    assertGuards(before, f.calls(), method);
                  }
                } finally {
                  await f.close();
                }
              });
  after(() => {
    assert.equal(outcomes.rejected + outcomes.accepted, 8 * 8 * 7 * 2 * 2 * 2);
    assert.equal(outcomes.rejected, 3584);
    assert.equal(outcomes.accepted, 0);
    process.stdout.write(
      `FM-010 all-method matrix: ${outcomes.rejected} rejected / ${outcomes.accepted} Express-identical compositions, ${outcomes.comparisons} HTTP comparisons; all 64 declaration-method pairs, seven overlaps, both orders/modes/roots.\n`
    );
  });
});

describe('FM-010 declared HEAD ownership with identical access metadata', () => {
  const overlaps = [
    ['/x/:id', '/x/:other'],
    ['/x/:id', '/x/fixed'],
    ['/x/fixed', '/x/:id'],
    ['/x/*tail', '/x/:id'],
    ['/x/:id', '/x/*tail'],
    ['/x/*tail', '/x/fixed'],
    ['/x/fixed', '/x/*tail'],
  ];
  const outcomes = { rejected: 0, matched: 0 };
  for (const [head, fallback] of overlaps)
    for (const fallbackMethod of ['get', 'all'] as const)
      for (const reverse of [false, true])
        for (const legacyOrder of [false, true])
          for (const prefix of ['', '/research/v6'])
            it(`retains declared HEAD over ${fallbackMethod}, ${head}/${fallback}, reverse=${reverse}, legacy=${legacyOrder}, root=${prefix || '/'}`, async () => {
              const routes: RouteRegistration[] = [head, fallback].map((routePath, index) => ({
                ...registration(routePath),
                declaration: {
                  ...registration(routePath).declaration,
                  name: index ? 'fallback' : 'declared-head',
                  method: index ? fallbackMethod : 'head',
                },
              }));
              if (reverse) routes.reverse();
              let f: Awaited<ReturnType<typeof fixture>>;
              try {
                f = await fixture(routes, prefix, new Map(), legacyOrder);
              } catch (error) {
                assert.match(String(error), /route collision|route overlap|cannot retain winner/);
                outcomes.rejected++;
                return;
              }
              try {
                const before = f.calls();
                const [expected, actual] = await Promise.all([
                  f.original(prefix + '/x/fixed', 'HEAD'),
                  f.migrated(prefix + '/x/fixed', 'HEAD'),
                ]);
                assert.equal(actual.statusCode, expected.statusCode);
                assertGuards(before, f.calls(), 'identical-access HEAD ownership');
                assert.equal(f.calls().fastifyGuard, 'declared-head');
                assert.equal(f.calls().fastifyRoute, 'declared-head');
                outcomes.matched++;
              } finally {
                await f.close();
              }
            });
  after(() => {
    assert.equal(outcomes.rejected + outcomes.matched, 112);
    process.stdout.write(
      `FM-010 identical-access HEAD ownership: ${outcomes.rejected} rejected / ${outcomes.matched} matched Express, 112 overlap/order/mode/root cases.\n`
    );
  });
});

describe('FM-010 review regressions', () => {
  for (const legacyOrder of [false, true])
    for (const prefix of ['', '/research/v6']) {
      it(`validates OPTIONS-only malformed captures on GET/HEAD misses, legacy=${legacyOrder}, root=${prefix || '/'}`, async () => {
        const source = registration('/submit/:id');
        const route = { ...source, declaration: { ...source.declaration, method: 'options' as const } };
        const f = await fixture([route], prefix, new Map(), legacyOrder);
        try {
          for (const method of ['GET', 'HEAD'] as const)
            for (const target of ['%ZZ', '%', '%E0%A4', 'Value', 'A%2FB']) {
              const before = f.calls();
              const url = prefix + '/submit/' + target;
              const [expected, actual] = await Promise.all([f.original(url, method), f.migrated(url, method)]);
              assert.equal(expected.statusCode, ['Value', 'A%2FB'].includes(target) ? 404 : 400);
              assert.equal(actual.statusCode, expected.statusCode, method + ' ' + url);
              assert.equal(actual.body, expected.body, url);
              assertGuards(before, f.calls(), url);
            }
          const fallbackMiss = prefix + '/unmatched/%ZZ';
          for (const method of ['GET', 'HEAD', 'OPTIONS'] as const) {
            const [expected, actual] = await Promise.all([
              f.original(fallbackMiss, method),
              f.migrated(fallbackMiss, method),
            ]);
            assert.equal(expected.statusCode, 404);
            assert.equal(actual.statusCode, 404, method + ': fallback must not validate captures');
          }
          assert.equal(f.calls().fastifyGuardCalls, 0);
          assert.equal(f.calls().expressGuardCalls, 0);
        } finally {
          await f.close();
        }
      });
      it(`defers OPTIONS synthesis to a required wildcard guard only for valid captures, legacy=${legacyOrder}, root=${prefix || '/'}`, async () => {
        const root = registration('/');
        const options = registration('/*tail');
        const f = await fixture(
          [
            root,
            {
              ...options,
              declaration: {
                ...options.declaration,
                name: 'protected-options',
                method: 'options',
                access: { kind: 'policies', names: ['audit-guard'] },
              },
            },
          ],
          prefix,
          new Map(),
          legacyOrder,
          [
            {
              name: 'root-options',
              reason: 'The exact root resource precedes the general OPTIONS-only protocol wildcard.',
              winner: 'differential',
              over: 'protected-options',
            },
          ]
        );
        try {
          for (const target of new Set([prefix || '/', prefix + '/', prefix + '//', prefix + '/value/'])) {
            const before = f.calls();
            const [expected, actual] = await Promise.all([
              f.original(target, 'OPTIONS'),
              f.migrated(target, 'OPTIONS'),
            ]);
            assert.equal(actual.statusCode, expected.statusCode, target);
            assert.equal(actual.allow, expected.allow, target);
            assert.equal(actual.body, expected.body, target);
            assertGuards(before, f.calls(), target);
          }
        } finally {
          await f.close();
        }
      });
      it(`matches required root wildcards only with actual captured data, legacy=${legacyOrder}, root=${prefix || '/'}`, async () => {
        const f = await fixture([registration('/*tail')], prefix, new Map(), legacyOrder);
        try {
          for (const target of new Set([
            '/',
            prefix || '/',
            prefix + '/',
            prefix + '//',
            prefix + '/a/',
            prefix + '/%2F',
          ]))
            for (const method of ['GET', 'HEAD', 'OPTIONS'] as const) {
              const before = f.calls();
              const [expected, actual] = await Promise.all([f.original(target, method), f.migrated(target, method)]);
              assert.equal(actual.statusCode, expected.statusCode, method + ' ' + target);
              assert.equal(actual.body, expected.body, target);
              assert.equal(actual.allow, expected.allow, target);
              assertGuards(before, f.calls(), target);
            }
          const bare = prefix || '/';
          assert.equal(
            f.current.findRoute({ method: 'GET', url: routerUrl(bare), constraints: routerConstraints(bare) }),
            null
          );
        } finally {
          await f.close();
        }
      });
      for (const later of ['/x/fixed', '/x/:id'])
        for (const reverse of [false, true])
          it(`preserves or rejects wildcard guard ownership, ${later}, reverse=${reverse}, legacy=${legacyOrder}, root=${prefix || '/'}`, async () => {
            const routes: RouteRegistration[] = ['/x/*tail', later].map((routePath, index) => ({
              ...registration(routePath),
              declaration: {
                ...registration(routePath).declaration,
                name: index ? 'public' : 'protected',
                access: index ? { kind: 'public' } : { kind: 'policies', names: ['audit-guard'] },
              },
            }));
            if (reverse) routes.reverse();
            let f: Awaited<ReturnType<typeof fixture>>;
            try {
              f = await fixture(routes, prefix, new Map(), legacyOrder);
            } catch (error) {
              assert.match(String(error), /route collision|route overlap/);
              return;
            }
            try {
              for (const method of ['GET', 'HEAD', 'OPTIONS'] as const) {
                const before = f.calls();
                const [expected, actual] = await Promise.all([
                  f.original(prefix + '/x/fixed', method),
                  f.migrated(prefix + '/x/fixed', method),
                ]);
                assert.equal(actual.statusCode, expected.statusCode);
                assertGuards(before, f.calls(), later);
              }
            } finally {
              await f.close();
            }
          });
    }
  it('retains structural collision checks before legacy exclusions and rejects unsupported compound ownership', async () => {
    for (const paths of [
      ['/x/:kind/edit', '/x/form/:name', '/x/form/:renamed'],
      ['/x/:kind/first/fixed', '/x/static/:a/:b'],
      ['/x/:id', '/x/fixed'],
    ]) {
      const routes = paths.map((routePath, index) => ({
        ...registration(routePath),
        declaration: { ...registration(routePath).declaration, name: 'legacy-' + index },
      }));
      await assert.rejects(
        composeRoutes(routes, { policyNames: [], legacyOrder: true }),
        /route collision|route overlap|requires explicit ownership/
      );
    }
  });
  for (const prefix of ['', '/research/v6'])
    it(`preserves legacy crossed-route ownership using native exclusions, root=${prefix || '/'}`, async () => {
      const routes = ['/x/:kind/edit', '/x/form/:name'].map((routePath, index) => ({
        ...registration(routePath),
        declaration: { ...registration(routePath).declaration, name: index ? 'later' : 'earlier' },
      }));
      const f = await fixture(routes, prefix, new Map(), true, [
        {
          name: 'legacy-crossing',
          reason: 'Retain the earlier legacy edit resource at the crossed form resource.',
          winner: 'earlier',
          over: 'later',
        },
      ]);
      try {
        for (const target of ['/x/form/edit', '/X/FORM/EDIT', '/x/form/%65dit', '/x/form/A%2FB', '/x/form/Value'])
          for (const method of ['GET', 'HEAD', 'OPTIONS'] as const) {
            const url = prefix + target;
            const [expected, actual] = await Promise.all([f.original(url, method), f.migrated(url, method)]);
            assert.equal(actual.statusCode, expected.statusCode, url);
            assert.equal(actual.body, expected.body, url);
            assert.equal(actual.allow, expected.allow, url);
            assert.equal(f.calls().fastifyRoute, f.calls().expressRoute, url);
          }
      } finally {
        await f.close();
      }
    });
  for (const method of ['HEAD', 'OPTIONS'] as const)
    it(`preserves malformed capture errors before method rejection or synthesized ${method}`, async () => {
      const route = registration('/submit/:id');
      const f = await fixture([{ ...route, declaration: { ...route.declaration, method: 'post' } }]);
      try {
        for (const [target, status] of [
          ['%ZZ', 400],
          ['Value', method === 'HEAD' ? 404 : 200],
        ] as const) {
          const url = '/submit/' + target;
          const expected = await f.original(url, method);
          const actual = await f.migrated(url, method);
          assert.equal(expected.statusCode, status);
          assert.equal(actual.statusCode, status);
          assert.equal(actual.body, expected.body);
          assert.equal(actual.allow, expected.allow);
        }
        assert.equal(f.calls().expressCalls, 0);
        assert.equal(f.calls().fastifyCalls, 0);
      } finally {
        await f.close();
      }
    });
  it('keeps regex parameter bounds native and permits long, encoded-slash values at the portal bound', async () => {
    const limited = fastify({ routerOptions: { ...portalRouterOptions, maxParamLength: 128 } });
    try {
      for (const path of translateRoutePath('/limits/:id')) limited.get(path.url, async request => request.params);
      assert.equal((await limited.inject('/limits/' + 'x'.repeat(128))).statusCode, 200);
      assert.equal((await limited.inject('/limits/' + 'x'.repeat(129))).statusCode, 414);
      assert.deepEqual((await limited.inject('/limits/A%2FB')).json(), { id: 'A/B' });
    } finally {
      await limited.close();
    }
    const current = createPortalRouter();
    try {
      const routes = ['/limits/:id', '/limits/:key*'].map((routePath, index) => ({
        ...registration(routePath),
        declaration: { ...registration(routePath).declaration, name: index ? 'wildcard' : 'parameter' },
      }));
      const composition = await composeRoutes(routes, {
        policyNames: [],
        rootContext: '/research/v6',
        precedence: [
          {
            name: 'parameter-first',
            reason: 'The parameter resource precedes the catch-all translation fallback.',
            winner: 'parameter',
            over: 'wildcard',
          },
        ],
      });
      composition.install(
        current,
        {
          action: declaration => request => ({
            owner: (declaration as RouteRegistration['declaration']).name,
            params: request.params,
          }),
        },
        noGuards
      );
      const value = 'A'.repeat(8192) + '/Value';
      const response = await current.inject('/research/v6/limits/' + encodeURIComponent(value));
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { owner: 'parameter', params: { id: value } });
    } finally {
      await current.close();
    }
  });
  for (const queryMerge of ['', '&merge=true'])
    it(`keeps declared path/query/body precedence after regex matching, query=${queryMerge || 'absent'}`, async () => {
      const current = createPortalRouter();
      try {
        const route = registration(updateMetaRoute.path);
        const composition = await composeRoutes([{ ...route, declaration: { ...route.declaration, method: 'put' } }], {
          policyNames: [],
        });
        composition.install(
          current,
          {
            action: () => request =>
              validateApiRouteRequest(request as Parameters<typeof validateApiRouteRequest>[0], updateMetaRoute),
          },
          noGuards
        );
        const response = await current.inject({
          method: 'PUT',
          url: '/Brand/Portal/api/records/metadata/A%2FB?oid=query-value' + queryMerge,
          payload: { oid: 'body-value', merge: false },
        });
        assert.equal(response.statusCode, 200);
        const result = response.json();
        assert.equal(result.valid, true, JSON.stringify(result.issues));
        assert.equal(result.params.oid, 'A/B');
        assert.equal(result.query.merge, !!queryMerge);
      } finally {
        await current.close();
      }
    });
  for (const prefix of ['', '/research/v6'])
    for (const reverse of [false, true])
      for (const method of ['GET', 'HEAD', 'OPTIONS'] as const)
        it(`backtracks from an empty param to a wildcard: ${method}, reverse=${reverse}, root=${prefix || '/'}`, async () => {
          const routes = ['/translations/:entry', '/translations/:key*'].map((routePath, index) => ({
            ...registration(routePath),
            declaration: { ...registration(routePath).declaration, name: index ? 'wildcard' : 'parameter' },
          }));
          if (reverse) {
            await assert.rejects(
              fixture(routes.reverse(), prefix, new Map(), false, [
                {
                  name: 'translation-priority',
                  reason: 'The specific translation entry precedes the general translation key fallback.',
                  winner: 'parameter',
                  over: 'wildcard',
                },
              ]),
              /cannot retain winner/
            );
            return;
          }
          const f = await fixture(routes, prefix, new Map(), false, [
            {
              name: 'translation-priority',
              reason: 'The specific translation entry precedes the general translation key fallback.',
              winner: 'parameter',
              over: 'wildcard',
            },
          ]);
          try {
            const url = prefix + '/translations//';
            const [expected, actual] = await Promise.all([f.original(url, method), f.migrated(url, method)]);
            assert.equal(expected.statusCode, 200);
            assert.equal(actual.statusCode, expected.statusCode);
            assert.equal(actual.headers.allow, expected.allow);
            assert.deepEqual(f.calls(), {
              expressCalls: method === 'OPTIONS' ? 0 : 1,
              fastifyCalls: method === 'OPTIONS' ? 0 : 1,
              expressRoute: method === 'OPTIONS' ? undefined : 'wildcard',
              fastifyRoute: method === 'OPTIONS' ? undefined : 'wildcard',
              expressGuard: method === 'OPTIONS' ? undefined : 'wildcard',
              fastifyGuard: method === 'OPTIONS' ? undefined : 'wildcard',
              expressGuardCalls: method === 'OPTIONS' ? 0 : 1,
              fastifyGuardCalls: method === 'OPTIONS' ? 0 : 1,
            });
            if (method === 'GET') {
              assert.deepEqual(actual.json(), expected.json());
              assert.deepEqual(actual.json(), { route: 'wildcard', params: { key: '/' }, query: {}, url });
            } else assert.equal(actual.body, expected.body);
          } finally {
            await f.close();
          }
        });
  it('retains prefixed root slash aliases and omits empty-param methods from OPTIONS', async () => {
    const declarations = [
      registration('/'),
      {
        ...registration('/:id'),
        declaration: { ...registration('/:id').declaration, name: 'post-param', method: 'post' as const },
      },
    ];
    const composition = await composeRoutes(declarations, { policyNames: [], rootContext: '/research/v6' });
    const instance = createPortalRouter();
    try {
      composition.install(instance, { action: () => () => ({ ok: true }) }, noGuards);
      for (const url of ['/research/v6', '/research/v6/', '/research/v6//']) {
        assert.equal((await instance.inject(url)).statusCode, 200, url);
        const response = await instance.inject({ method: 'OPTIONS', url });
        assert.equal(response.statusCode, 200, url);
        assert.equal(response.headers.allow, 'GET, HEAD', url);
      }
      assert.equal((await instance.inject('/research/v6///')).statusCode, 404);
    } finally {
      await instance.close();
    }
  });
  it('does not mistake empty param captures for overlap with an explicit HEAD policy', async () => {
    const head: RouteRegistration = {
      ...registration('/:id'),
      declaration: {
        ...registration('/:id').declaration,
        name: 'head-param',
        method: 'head',
        access: { kind: 'deny' },
      },
    };
    const composition = await composeRoutes([registration('/'), head], {
      policyNames: [],
      rootContext: '/research/v6',
    });
    const instance = createPortalRouter();
    try {
      composition.install(instance, { action: () => () => ({ ok: true }) }, async (binding, _request, reply) => {
        if (binding.route.effectivePolicies.includes(false)) reply.code(403).send();
      });
      assert.equal((await instance.inject({ method: 'HEAD', url: '/research/v6//' })).statusCode, 200);
      assert.equal((await instance.inject({ method: 'HEAD', url: '/research/v6/Value' })).statusCode, 403);
    } finally {
      await instance.close();
    }
  });
  for (const kind of ['spread copies', 'merged role metadata'] as const)
    it(`retains all three administration HEAD denials through ${kind}`, async () => {
      const declarations =
        kind === 'spread copies'
          ? registerCoreApiRoutes().map(api => ({ ...api }))
          : getMergedApiRoutes({ auth: { rules: [] } });
      const registrations = apiRouteRegistrations({ declarations }).filter(
        registration =>
          registration.declaration.method === 'get' &&
          registration.declaration.controller === 'webservice/AdminController'
      );
      assert.equal(registrations.length, 3);
      const names = registrations
        .flatMap(registration => registration.effectivePolicies!)
        .filter((name): name is string => name !== false);
      const composition = await composeRoutes(registrations, { policyNames: [...new Set(names)] });
      const current = createPortalRouter();
      let actions = 0;
      let guards = 0;
      try {
        composition.install(
          current,
          {
            action: () => () => {
              actions++;
              return { ok: true };
            },
          },
          async () => {
            guards++;
          }
        );
        for (const registration of registrations) {
          assert.equal(registration.declaration.head?.kind, 'deny');
          const url = registration.declaration.path.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, 'Value');
          const response = await current.inject({ method: 'HEAD', url });
          assert.equal(response.statusCode, 405);
          assert.equal(response.headers.allow, 'GET');
          assert.equal(response.body, '');
        }
        assert.equal(actions, 0);
        assert.equal(guards, 3);
      } finally {
        await current.close();
      }
    });
  it('rejects installation with a default or substituted query parser', async () => {
    const composition = await composeRoutes([registration('/input')], { policyNames: [] });
    for (const querystringParser of [undefined, (_query: string) => ({})]) {
      const instance = fastify({ routerOptions: { ...portalRouterOptions, querystringParser } });
      try {
        assert.throws(() => composition.install(instance, { action: () => () => null }, noGuards), /querystringParser/);
      } finally {
        await instance.close();
      }
    }
  });
  it('rejects installation without pre-router raw path protection', async () => {
    const composition = await composeRoutes([registration('/input')], { policyNames: [] });
    const instance = fastify({ routerOptions: portalRouterOptions });
    try {
      assert.throws(() => composition.install(instance, { action: () => () => null }, noGuards), /createPortalRouter/);
    } finally {
      await instance.close();
    }
  });
  it('rejects empty brand/portal/optional captures before guards while preserving encoded slash and wildcard values', async () => {
    for (const [routePath, invalid, valid, params] of [
      ['/:branding/:portal/x', '//P/x', '/%2F/P/x', { branding: '/', portal: 'P' }],
      ['/:branding/:portal/x', '/B//x', '/B/%2F/x', { branding: 'B', portal: '/' }],
      ['/assets/:recordType{/:oid}', '/assets/T//', '/assets/T/%2F', { recordType: 'T', oid: '/' }],
      ['/translations/:key*', '/translations/', '/translations//', { key: '/' }],
    ] as const) {
      const composition = await composeRoutes([registration(routePath)], { policyNames: [] });
      const instance = createPortalRouter();
      let guards = 0;
      try {
        composition.install(instance, { action: () => request => request.params }, async () => {
          guards++;
        });
        await instance.ready();
        assert.equal((await exchange(instance.routing, invalid)).statusCode, 404);
        assert.equal(guards, 0);
        assert.deepEqual((await exchange(instance.routing, valid)).json(), params);
        assert.equal(guards, 1);
      } finally {
        await instance.close();
      }
    }
  });
  for (const suffix of ['.json', '.css', '.woff2'])
    it(`matches every literal ${suffix} character before decoding the capture`, async () => {
      const composition = await composeRoutes([registration('/x/:id' + suffix)], { policyNames: [] });
      const instance = createPortalRouter();
      let guards = 0;
      try {
        composition.install(
          instance,
          {
            action: () => request => ({
              params: request.params,
              url: request.url,
              original: request.originalUrl,
              raw: request.raw.url,
            }),
          },
          async () => {
            guards++;
          }
        );
        for (let index = 0; index < suffix.length; index++) {
          const escaped =
            suffix.slice(0, index) + '%' + suffix.charCodeAt(index).toString(16) + suffix.slice(index + 1);
          assert.equal((await instance.inject('/x/Name' + escaped)).statusCode, 404, escaped);
        }
        assert.equal(guards, 0);
        const url = '/x/A%2FB%252E' + suffix.toUpperCase();
        assert.deepEqual((await instance.inject(url)).json(), {
          params: { id: 'A/B%2E' },
          url,
          original: url,
          raw: url,
        });
        assert.equal(guards, 1);
      } finally {
        await instance.close();
      }
    });
});

/** Every accepted named inventory exception has a direct Express oracle, beyond
 * the complete-table corpus. Reverse order may fail composition: a name/reason
 * does not permit a priority that disagrees with the Express stack.
 */
describe('FM-010 each declared inventory precedence against Express', function () {
  this.timeout(30_000);
  const rows = new Map(productionInventoryOrder().map(row => [row.name, row]));
  const accepted = new Set<string>();
  const counts = { accepted: 0, rejected: 0, comparisons: 0 };
  const report = JSON.parse(
    readFileSync(path.join(root, 'support/specs/fastify-migration/evidence/FM-010.overlaps.json'), 'utf8')
  );
  for (const override of coreRoutePrecedence)
    for (const reverse of [false, true])
      for (const legacyOrder of [false, true])
        for (const prefix of ['', '/research/v6'])
          it(`${override.name}, reverse=${reverse}, legacy=${legacyOrder}, root=${prefix || '/'}`, async () => {
            const routes = [rows.get(override.winner)!, rows.get(override.over)!].map(inventoryRegistration);
            if (reverse) routes.reverse();
            let f: Awaited<ReturnType<typeof fixture>>;
            try {
              f = await fixture(routes, prefix, new Map(), legacyOrder);
            } catch (error) {
              assert.match(String(error), /cannot retain winner|route collision|requires explicit ownership/);
              counts.rejected++;
              return;
            }
            counts.accepted++;
            accepted.add(override.name);
            try {
              const witness = report.find((entry: { name: string }) => entry.name === override.name).witness;
              const targets = new Set<string>([witness, witness.toUpperCase(), '/', '//']);
              for (const route of routes)
                for (const tokens of alternatives(parse(expressRuntimePath(route.declaration.path)).tokens)) {
                  const render = (changed = -1, value = '') =>
                    tokens
                      .map((token, index) =>
                        index === changed
                          ? value
                          : token.type === 'text'
                            ? token.value
                            : token.type === 'param'
                              ? 'Value'
                              : 'one/two/'
                      )
                      .join('');
                  targets.add(render());
                  tokens.forEach((token, index) => {
                    if (token.type !== 'text')
                      for (const value of ['', '%ZZ', 'A%2FB']) targets.add(render(index, value));
                  });
                }
              const methods = new Set<HTTPMethods>([
                'GET',
                'HEAD',
                'OPTIONS',
                ...routes.flatMap(route =>
                  route.declaration.method === 'all'
                    ? (['POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND'] as const)
                    : [route.declaration.method.toUpperCase() as HTTPMethods]
                ),
              ]);
              for (const target of targets)
                for (const method of methods) {
                  const url = prefix + target;
                  for (const version of target.includes('%ZZ') ? ['', '?apiVersion=2.0'] : ['']) {
                    const before = f.calls();
                    const [expected, actual] = await Promise.all([
                      f.original(url + version, method),
                      f.migrated(url + version, method),
                    ]);
                    counts.comparisons++;
                    const label = override.name + ': ' + method + ' ' + url + version;
                    assert.equal(actual.statusCode, expected.statusCode, label);
                    assert.equal(actual.allow, expected.allow, label);
                    assert.equal(actual.body, expected.body, label);
                    assertGuards(before, f.calls(), label);
                    if (f.calls().expressCalls !== before.expressCalls)
                      assert.equal(f.calls().fastifyRoute, f.calls().expressRoute, label + ': handler identity');
                  }
                }
            } finally {
              await f.close();
            }
          });
  after(() => {
    assert.deepEqual(
      accepted,
      new Set(coreRoutePrecedence.map(override => override.name)),
      'every declared override must have an accepted, HTTP-compared composition'
    );
    assert.equal(counts.accepted + counts.rejected, coreRoutePrecedence.length * 8);
    process.stdout.write(
      `FM-010 declared overrides: ${coreRoutePrecedence.length} individually covered, ${counts.accepted} accepted / ${counts.rejected} rejected compositions, ${counts.comparisons} HTTP comparisons.\n`
    );
  });
});

describe('FM-010 round-6 narrowed composition regressions', () => {
  for (const legacyOrder of [false, true])
    for (const rootContext of ['', '/research/v6']) {
      for (const sibling of [false, true])
        it(`rejects required glued wildcards before native lookup, sibling=${sibling}, legacy=${legacyOrder}, root=${rootContext || '/'}`, async () => {
          const routes = [registration('/x/file*tail')];
          if (sibling)
            routes.push({
              ...registration('/x/:id'),
              declaration: { ...registration('/x/:id').declaration, name: 'sibling' },
            });
          await assert.rejects(
            composeRoutes(routes, { policyNames: [], rootContext, legacyOrder }),
            /Unsupported wildcard.*terminal/
          );
        });
      for (const reverse of [false, true])
        it(`rejects encoded literal / malformed capture crossings, reverse=${reverse}, legacy=${legacyOrder}, root=${rootContext || '/'}`, async () => {
          const routes = [
            {
              ...registration('/submit/:id'),
              declaration: { ...registration('/submit/:id').declaration, name: 'options', method: 'options' as const },
            },
            registration('/submit/%ZZ'),
          ];
          if (reverse) routes.reverse();
          await assert.rejects(
            composeRoutes(routes, { policyNames: [], rootContext, legacyOrder }),
            /Unsupported route literal/
          );
          // Keep the original Express before-method decode behavior and reversed
          // 200 control visible, for GET/HEAD and both API versions.
          const old = express();
          const router = express.Router();
          for (const route of routes)
            router[route.declaration.method](route.declaration.path, (_request, reply) =>
              reply.set('x-handler', route.declaration.name).send('ok')
            );
          old.use(rootContext || '/', router);
          old.use(httpErrorHandler(nothingLogger));
          const server = createServer(old);
          server.listen(0, '127.0.0.1');
          await once(server, 'listening');
          const address = server.address();
          assert(address && typeof address === 'object');
          try {
            for (const method of ['GET', 'HEAD'])
              for (const version of ['', '?apiVersion=2.0']) {
                const status = await new Promise<number>((resolve, reject) => {
                  const req = httpRequest(
                    {
                      host: '127.0.0.1',
                      port: address.port,
                      path: rootContext + '/submit/%ZZ' + version,
                      method,
                      agent: false,
                    },
                    reply => {
                      reply.resume();
                      reply.on('end', () => resolve(reply.statusCode!));
                    }
                  );
                  req.on('error', reject);
                  req.end();
                });
                assert.equal(status, reverse ? 200 : 400);
              }
          } finally {
            await new Promise<void>(resolve => server.close(() => resolve()));
          }
        });
    }
  for (const unsupported of [
    '/x/file*tail',
    '/x/{*tail}',
    '/x{/*tail}',
    '/x{/:one}{/:two}',
    '/x{/:id}/other',
    '/x/{literal}',
    '/x/:id.txt',
    '/x/%2F',
    '/x/Name%2Ecss',
  ])
    it(`rejects non-inventoried pattern construct ${unsupported}`, async () => {
      await assert.rejects(composeRoutes([registration(unsupported)], { policyNames: [] }), /Unsupported/);
    });
});
