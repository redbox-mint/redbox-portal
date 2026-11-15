import assert from 'node:assert/strict';
import type {} from './fixtures/hooks.types';
import { request as httpRequest, Server } from 'node:http';
import sinon from 'sinon';
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ApplicationRuntime, type ApplicationModuleFactory } from '../../../dist/application';
import {
  defineController,
  bindControllerFactory,
  requestContext,
  type HttpHookContribution,
  type HttpFallbackContribution,
} from '../../../dist/http';
import { resolveExtensionsV2, bindExtensionFactory, type ExtensionProviderV2 } from '../../../dist/extensions';
import { resolveExtensions } from '../../../dist/extensions/resolution';
import { composeExtensionApplication } from '../../../dist/extensions/composition';
import { ExpressHost } from '../../../dist/http/express';
import { createControllerHost, type ControllerHostOptions } from '../../../dist/http/fastify/composition';
import { createNativePolicies } from '../../../dist/http/fastify/policies';
import type { FastifyHost } from '../../../dist/http/fastify/FastifyHost';
import type { RouteRegistration } from '../../../dist/http/fastify/routes';
import { coreFallbackReservedPrefixes } from '../../../dist/http/fastify/registry';
import { resolveRequestBrand, resolveRequestActor } from '../../../dist/http/context';
import { hasActiveHttpRequest, trackHttpRequestWork } from '../../../dist/middleware/requestLifetime';
import { hasActivePersistenceWork, persistenceOperation } from '../../../dist/persistence/runtime';

const noop = async () => undefined;
const unusedToken = async (): Promise<never> => {
  throw new Error('Unexpected token adapter');
};
const route: RouteRegistration = {
  provider: 'core',
  declaration: {
    name: 'read',
    method: 'get',
    path: '/known',
    controller: 'Probe',
    action: 'route',
    access: { kind: 'public' },
    head: { kind: 'deny', allow: 'GET' },
  },
};
const hook = (name: string, options: Partial<HttpHookContribution> = {}): HttpHookContribution =>
  ({ name, stage: 'beforeAction', scope: { kind: 'application' }, run: noop, ...options }) as HttpHookContribution;
const reg = <T>(declaration: T, provider = 'core') => ({ provider, declaration });
const fallback = (options: Partial<HttpFallbackContribution> = {}): HttpFallbackContribution => ({
  name: 'unmatched',
  prefix: '/',
  controller: 'Probe',
  action: 'fallback',
  access: { kind: 'public' },
  ...options,
});
function exchange(port: number, path: string, method = 'GET', body?: string, type = 'application/json') {
  return new Promise<{ status: number; text: string; headers: Record<string, unknown> }>((resolve, reject) => {
    const client = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        agent: false,
        headers: body === undefined ? {} : { 'content-type': type, 'content-length': Buffer.byteLength(body) },
      },
      response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => (text += chunk));
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode!, text, headers: response.headers }));
      }
    );
    client.on('error', reject);
    client.setTimeout(3000, () => client.destroy(new Error('FM-018 HTTP timeout')));
    client.end(body);
  });
}

describe('FM-018 scoped hooks and named unmatched fallback', function () {
  this.timeout(10000);
  const hosts: (FastifyHost | ExpressHost)[] = [];
  const releases: (() => void)[] = [];
  function barrier() {
    const result = Promise.withResolvers<void>();
    releases.push(result.resolve);
    return result;
  }
  afterEach(async () => {
    for (const release of releases.splice(0)) release();
    try {
      for (const host of hosts.splice(0)) await host.stop({ deadlineMs: 3000 });
    } finally {
      sinon.restore();
    }
  });
  async function fixture(
    options: Partial<ControllerHostOptions> = {},
    action?: (request: FastifyRequest, reply: FastifyReply) => unknown,
    modules: ApplicationModuleFactory[] = []
  ) {
    const trace: string[] = [];
    const logs: unknown[] = [];
    const owner = { config: {}, log: { warn() {} } };
    const application = new ApplicationRuntime(owner, modules);
    const factory = defineController({
      name: 'Probe',
      actions: ['route', 'fallback'],
      create: () => ({
        route(request: FastifyRequest, reply: FastifyReply) {
          trace.push('action');
          return action ? action(request, reply) : reply.send('route');
        },
        fallback(request: FastifyRequest, reply: FastifyReply) {
          trace.push('fallback');
          return action ? action(request, reply) : reply.send('fallback');
        },
      }),
    });
    const host = await createControllerHost(application, {
      hostname: '127.0.0.1',
      port: 0,
      controllers: [reg(factory)],
      bindings: [bindControllerFactory(factory, undefined)],
      routes: [route],
      routing: { policyNames: [] },
      logger: record => {
        logs.push(record);
      },
      ...options,
    });
    hosts.push(host);
    return {
      host,
      application,
      trace,
      logs,
      owner,
      async start() {
        await host.initialize();
        await host.activate();
        return host.address()!.port;
      },
    };
  }

  for (const method of ['GET', 'HEAD'])
    it(`does not redispatch matched ${method} callNotFound to static assets or fallback`, async () => {
      let staticCalls = 0;
      const f = await fixture(
        {
          routes: [{ ...route, declaration: { ...route.declaration, head: undefined } }],
          fallbacks: [reg(fallback())],
          staticAsset: async (_request, reply, beforeSend) => {
            staticCalls++;
            await beforeSend();
            return reply.send('public asset');
          },
        },
        (_request, reply) => reply.callNotFound()
      );
      const response = await exchange(await f.start(), '/known', method);
      assert.equal(response.status, 404);
      assert.equal(staticCalls, 0);
      assert(!f.trace.includes('fallback'));
      assert(!response.text.includes('public asset'));
    });

  it('prepares aliases once after hooks and validates their prepared live values', async () => {
    const trace: string[] = [];
    const f = await fixture(
      {
        routes: [
          {
            ...route,
            declaration: {
              ...route.declaration,
              method: 'post',
              head: undefined,
              validation: {
                body: { required: true, content: { 'application/json': { schema: z.object({ title: z.string() }) } } },
              },
            },
          },
        ],
        guards: async () => {
          trace.push('prelude');
        },
        actionPreparation: {
          applies: () => true,
          run: async (_binding, request) => {
            trace.push('prepare');
            assert.deepEqual(request.params, { id: 'hook' });
            assert.deepEqual(request.query, { name: 'hook' });
            request.body = { title: 'prepared' };
          },
        },
        hooks: [
          reg(
            hook('replace', {
              run: async request => {
                trace.push('hook');
                request.params = { id: 'hook' };
                request.query = { name: 'hook' };
              },
            })
          ),
        ],
      },
      (request, reply) => {
        trace.push('action');
        assert.deepEqual(request.body, { title: 'prepared' });
        return reply.send({ reached: true });
      }
    );
    const result = await exchange(await f.start(), '/known', 'POST');
    assert.equal(result.status, 200, result.text);
    assert.deepEqual(trace, ['prelude', 'hook', 'prepare', 'action']);
    trace.length = 0;
    assert.equal((await exchange(f.host.address()!.port, '/known', 'OPTIONS')).status, 200);
    assert.deepEqual(trace, ['hook'], 'Automatic OPTIONS never prepares action inputs');
  });

  const invalid: [string, HttpHookContribution[], RegExp][] = [
    [
      'unknown application scope fields',
      [hook('a', { scope: { kind: 'application', names: ['read'] } as never })],
      /scope fields/,
    ],
    ['missing scope', [hook('a', { scope: undefined })], /explicit scope/],
    ['empty route scope', [hook('a', { scope: { kind: 'routes', names: [] } })], /route scope/],
    ['unknown route scope', [hook('a', { scope: { kind: 'routes', names: ['missing'] } })], /route scope/],
    ['missing dependency', [hook('a', { requires: ['missing'] })], /missing hook/],
    ['self cycle', [hook('a', { requires: ['a'] })], /cycle/],
    ['cycle', [hook('a', { requires: ['b'] }), hook('b', { requires: ['a'] })], /cycle/],
    ['cross-stage edge', [hook('a', { requires: ['b'] }), hook('b', { stage: 'afterAuthentication' })], /cross-stage/],
    ['legacy afterRoutes', [hook('a', { stage: 'afterRoutes' as never })], /unsupported/],
    ['missing run', [hook('a', { run: undefined } as never)], /stage function/],
    ['bad requires', [hook('a', { requires: ['b', 'b'] }), hook('b')], /prerequisites/],
    ['replacement without target', [hook('a', { replaces: true })], /no target/],
    ['duplicate', [hook('a'), hook('a')], /duplicate/],
  ];
  for (const [label, declarations, expected] of invalid)
    it(`rejects ${label} offline before factories/acquisition/listen`, async () => {
      const listen = sinon.spy(Server.prototype, 'listen');
      let acquired = 0;
      await assert.rejects(
        fixture({ hooks: declarations.map(item => reg(item)) }, undefined, [
          {
            name: 'domain',
            create: () => {
              acquired++;
              throw new Error('acquired');
            },
          },
        ]),
        expected
      );
      assert.equal(acquired, 0);
      assert.equal(listen.callCount, 0);
    });

  it('orders dependencies first with provider/declaration ties and explicit named replacement, without running losing hooks', async () => {
    const calls: string[] = [];
    const h = (name: string, requires?: string[], replaces?: true) =>
      hook(name, {
        requires,
        replaces,
        run: async () => {
          calls.push(name);
        },
      });
    const providers: ExtensionProviderV2[] = [
      { name: 'z', root: '.', declaration: { apiVersion: 2, hooks: [h('z'), h('replace', [], true)] } },
      {
        name: 'core',
        root: '.',
        declaration: { apiVersion: 2, hooks: [h('core'), h('replace'), h('dependent', ['z']), h('eligible')] },
      },
      { name: 'a', root: '.', declaration: { apiVersion: 2, hooks: [h('a')] } },
    ];
    for (const input of [providers, [...providers].reverse()]) {
      const plan = await resolveExtensionsV2(input, { bindings: [], routing: { policyNames: [] } });
      assert.deepEqual(
        plan.hookPlan.hooks.map(item => item.declaration.name),
        ['core', 'eligible', 'a', 'z', 'dependent', 'replace']
      );
      assert.deepEqual(calls, []);
    }
    const f = await fixture({
      hooks: [reg(h('core')), reg(h('dependent', ['z'])), reg(h('eligible')), reg(h('a'), 'a'), reg(h('z'), 'z')],
    });
    await exchange(await f.start(), '/known');
    assert.deepEqual(calls, ['core', 'eligible', 'a', 'z', 'dependent']);
  });

  it('runs parsed/authenticated/context hooks before access and beforeAction after CSRF, core prelude and validation', async () => {
    const trace: string[] = [];
    const f = await fixture(
      {
        routes: [
          {
            ...route,
            declaration: {
              ...route.declaration,
              method: 'post',
              head: undefined,
              csrf: true,
              access: { kind: 'policies', names: ['allowed'] },
              validation: {
                body: {
                  required: true,
                  content: { 'application/json': { schema: z.object({ title: z.string().min(1) }) } },
                },
              },
            },
          },
        ],
        routing: { policyNames: ['allowed'] },
        security: {
          policies: {
            allowed: async () => {
              trace.push('policy');
            },
          },
          csrf: {
            protect: async () => {
              trace.push('csrf');
              return undefined;
            },
            apiProtect: noop,
            token: unusedToken,
          },
          prepare: async app => {
            app.addHook('preValidation', async request => {
              assert.equal((request.body as { title: string }).title, 'valid');
              trace.push('authentication');
            });
          },
          resolveContext: async (_binding, request) => {
            resolveRequestBrand(request, { id: 'b', name: 'brand' } as never, 'portal');
            resolveRequestActor(request, { id: 'u', roles: [{ id: 'r', name: 'Admin', brandId: 'b' }] } as never);
            trace.push('context');
          },
        },
        guards: async () => {
          trace.push('prelude');
        },
        hooks: [
          reg(
            hook('auth', {
              stage: 'afterAuthentication',
              run: async request => {
                assert.equal(requestContext(request).actor!.id, 'u');
                trace.push('afterAuthentication');
              },
            })
          ),
          reg(
            hook('before', {
              run: async () => {
                trace.push('beforeAction');
              },
            })
          ),
        ],
      },
      (_req, reply) => {
        trace.push('action');
        return reply.send('ok');
      }
    );
    assert.equal((await exchange(await f.start(), '/known', 'POST', '{"title":"valid"}')).status, 200);
    assert.deepEqual(trace, [
      'authentication',
      'context',
      'afterAuthentication',
      'policy',
      'csrf',
      'prelude',
      'beforeAction',
      'action',
    ]);
  });

  for (const denied of ['policy', 'csrf', 'validation'])
    it(`never runs beforeAction or action after ${denied} denies`, async () => {
      const trace: string[] = [];
      const f = await fixture({
        routes: [
          {
            ...route,
            declaration: {
              ...route.declaration,
              method: 'post',
              head: undefined,
              csrf: true,
              access: { kind: 'policies', names: ['allow'] },
              validation: {
                body: { required: true, content: { 'application/json': { schema: z.object({ title: z.string() }) } } },
              },
            },
          },
        ],
        routing: { policyNames: ['allow'] },
        hooks: [
          reg(
            hook('before', {
              run: async () => {
                trace.push('before');
              },
            })
          ),
        ],
        security: {
          policies: {
            allow: async (_req, reply) => {
              if (denied === 'policy') reply.code(403).send();
            },
          },
          csrf: {
            protect: async (_req, reply) => {
              if (denied === 'csrf') reply.code(403).send();
              return undefined;
            },
            apiProtect: noop,
            token: unusedToken,
          },
        },
      });
      assert.equal(
        (await exchange(await f.start(), '/known', 'POST', '{}')).status,
        denied === 'validation' ? 400 : 403
      );
      assert.deepEqual(trace, []);
      assert.deepEqual(f.trace, []);
    });

  for (const stage of ['afterAuthentication', 'beforeAction'] as const)
    for (const target of ['route', 'fallback'] as const)
      it(`terminates ${target} at ${stage} while slow asynchronous onSend owns the response`, async () => {
        const entered = barrier(),
          held = barrier();
        const calls: string[] = [];
        const f = await fixture({
          fallbacks: [reg(fallback())],
          fallbackReservedPrefixes: coreFallbackReservedPrefixes(),
          security: {
            policies: {},
            csrf: { protect: noop, apiProtect: noop, token: unusedToken },
            prepare: async app => {
              app.addHook('onSend', async (_req, _reply, payload) => {
                entered.resolve();
                await held.promise;
                return payload;
              });
            },
          },
          hooks: [
            reg(
              hook('first', {
                stage,
                run: async (_req, reply) => {
                  calls.push('early');
                  reply.code(202).send('early');
                },
              })
            ),
            reg(
              hook('later', {
                stage,
                run: async () => {
                  calls.push('later');
                },
              })
            ),
            reg(
              hook('downstream', {
                stage: 'beforeAction',
                run: async () => {
                  calls.push('downstream');
                },
              })
            ),
          ],
        });
        const port = await f.start();
        const response = exchange(port, target === 'route' ? '/known' : '/missing');
        await entered.promise;
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(calls, ['early']);
        assert.deepEqual(f.trace, []);
        held.resolve();
        const result = await response;
        assert.equal(result.status, 202);
        assert.equal(result.text, 'early');
        assert.deepEqual(calls, ['early']);
        assert.deepEqual(f.trace, []);
      });

  it('applies route scope only to named targets and explicit application scope to unmatched requests', async () => {
    const seen: string[] = [];
    const f = await fixture({
      hooks: [
        reg(
          hook('scoped', {
            stage: 'afterAuthentication',
            scope: { kind: 'routes', names: ['read'] },
            run: async () => {
              seen.push('route');
            },
          })
        ),
        reg(
          hook('global', {
            stage: 'afterAuthentication',
            run: async () => {
              seen.push('application');
            },
          })
        ),
      ],
    });
    const port = await f.start();
    await exchange(port, '/known');
    assert.deepEqual(seen, ['route', 'application']);
    seen.length = 0;
    await exchange(port, '/missing');
    assert.deepEqual(seen, ['application']);
    seen.length = 0;
    await exchange(port, '/healthz');
    assert.equal(seen.length, 0);
  });

  for (const stage of ['onResponse', 'onError'] as const)
    it(`isolates ${stage} mutation, throws/rejections and return values using detached snapshots and redacting logs`, async () => {
      const seen: unknown[] = [];
      let caught = 0;
      const make = (name: string, observe: (...args: any[]) => Promise<void>) =>
        reg({ name, stage, scope: { kind: 'routes' as const, names: ['read'] }, observe } as HttpHookContribution);
      const f = await fixture(
        {
          hooks: [
            make('mutate', async (request, error) => {
              seen.push(request, error);
              assert(Object.isFrozen(request));
              assert.equal(Object.getPrototypeOf(request), Object.prototype);
              for (const key of ['raw', 'server', 'session', 'headers', 'body', 'query', 'log', 'reply'])
                assert.equal(request[key], undefined);
              for (const [key, value] of [
                ['method', 'DELETE'],
                ['statusCode', 201],
                ['raw', {}],
              ] as const) {
                try {
                  Reflect.set(request, key, value);
                } catch {
                  caught++;
                }
                assert.notEqual(request[key], value);
              }
              if (error) {
                assert.deepEqual(Object.keys(error).sort(), ['code', 'requestId', 'statusCode']);
                assert(Object.isFrozen(error));
                assert.equal(error.statusCode, 500);
              }
              throw new Error('observation-secret');
            }),
            make('rejected', async () => {
              throw { secret: 'observation-secret' };
            }),
            make('last', async () => {
              seen.push('last');
              return { statusCode: 201, body: 'replace' } as never;
            }),
          ],
        },
        (_req, reply) => {
          if (stage === 'onError')
            throw Object.assign(new Error('provider-secret'), {
              statusCode: 418,
              headers: { credential: 'credential-secret' },
            });
          return reply.send('original');
        }
      );
      const result = await exchange(await f.start(), '/known?password=query-secret');
      assert.equal(result.status, stage === 'onError' ? 500 : 200);
      if (stage === 'onResponse') assert.equal(result.text, 'original');
      assert.equal(seen.at(-1), 'last');
      assert.equal((seen[0] as { url: string }).url, '/known');
      assert.equal(f.logs.filter((record: any) => record.code === 'HTTP_OBSERVATION_FAILED').length, 2);
      assert(!JSON.stringify({ seen, logs: f.logs, result }).includes('secret'));
      assert.deepEqual(f.trace, ['action']);
      void caught;
    });

  const badFallbacks: [string, HttpFallbackContribution[], RegExp][] = [
    ['missing target', [fallback({ replaces: true })], /no target/],
    ['equal prefix', [fallback(), fallback({ name: 'other', prefix: '/' })], /equal fallback/],
    ['case prefix', [fallback({ prefix: '/scope' }), fallback({ name: 'other', prefix: '/SCOPE' })], /equal fallback/],
    ['unknown policy', [fallback({ access: { kind: 'policies', names: ['unknown'] } })], /unknown policy/],
    ['empty policies', [fallback({ access: { kind: 'policies', names: [] as never } })], /non-empty/],
    ['pattern prefix', [fallback({ prefix: '/:branding' })], /literal/],
    ['dot prefix', [fallback({ prefix: '/a/..' })], /literal/],
    ['bad context', [fallback({ context: { branding: '../b', portal: 'p' } })], /context/],
    ['route name collision', [fallback({ name: 'read' })], /collides/],
    ['unlisted action', [fallback({ action: 'missing' })], /unlisted/],
  ];
  for (const [label, declarations, expected] of badFallbacks)
    it(`rejects fallback ${label} offline`, async () => {
      const listen = sinon.spy(Server.prototype, 'listen');
      await assert.rejects(
        fixture({
          fallbacks: declarations.map(item => reg(item)),
          fallbackReservedPrefixes: coreFallbackReservedPrefixes(),
        }),
        expected
      );
      assert.equal(listen.callCount, 0);
    });
  it('requires complete core reservations and security bindings before acquisition', async () => {
    await assert.rejects(
      fixture({ fallbacks: [reg(fallback())], fallbackReservedPrefixes: [] }),
      /Missing FM-002 namespace/
    );
    await assert.rejects(
      fixture({
        fallbacks: [reg(fallback({ access: { kind: 'deny' } }))],
        fallbackReservedPrefixes: coreFallbackReservedPrefixes(),
      }),
      /native security/
    );
  });

  it('chooses longest segment prefix and resolves a named replacement independently of declaration order', async () => {
    const f = await fixture({
      fallbacks: [
        reg(fallback({ action: 'route' })),
        reg(fallback({ name: 'scope', prefix: '/scope', action: 'route' })),
        reg(fallback({ name: 'scope', prefix: '/scope', action: 'fallback', replaces: true }), 'extension'),
      ],
      fallbackReservedPrefixes: coreFallbackReservedPrefixes(),
    });
    const port = await f.start();
    for (const path of ['/scope', '/SCOPE/child', '/scope/'])
      assert.equal((await exchange(port, path)).text, 'fallback');
    // Replaced longest match runs just once; no fallback chain or fallthrough to less specific access.
    assert.deepEqual(f.trace, ['fallback', 'fallback', 'fallback']);
  });

  it('cannot intercept probes, closed admission, existing routes, HEAD/405, OPTIONS/method misses, malformed paths or reserved asset roots', async () => {
    const f = await fixture({
      fallbacks: [reg(fallback())],
      fallbackReservedPrefixes: [
        ...coreFallbackReservedPrefixes(),
        '/assets',
        '/angular',
        '/js',
        '/styles',
        '/images',
        '/brand/portal/dynamic',
        '/robots.txt',
      ],
    });
    await f.host.initialize();
    const port = f.host.address()!.port;
    assert.equal((await exchange(port, '/unmatched')).status, 503);
    assert.deepEqual(f.trace, []);
    await f.host.activate();
    assert.equal((await exchange(port, '/healthz')).status, 200);
    assert.equal((await exchange(port, '/readyz')).status, 200);
    assert.equal((await exchange(port, '/known')).text, 'route');
    assert.equal((await exchange(port, '/known', 'HEAD')).status, 405);
    assert.equal((await exchange(port, '/known', 'OPTIONS')).headers.allow, 'GET, HEAD');
    for (const [path, method] of [
      ['/known', 'POST'],
      ['/known', 'PROPFIND'],
      ['/other', 'HEAD'],
      ['/other', 'OPTIONS'],
      ['/images/file', 'GET'],
      ['/IMAGES/file', 'POST'],
      ['/assets/nope', 'GET'],
      ['/angular/nope', 'GET'],
      ['/js/nope', 'GET'],
      ['/styles/nope', 'GET'],
      ['/brand/portal/dynamic/nope', 'GET'],
      ['/robots.txt', 'GET'],
      ['/scope/%zz', 'GET'],
      ['/scope/%2fimages', 'GET'],
      ['/a/../images', 'GET'],
      ['/a//images', 'GET'],
    ] as const)
      assert.equal((await exchange(port, path, method)).status, 404, method + ' ' + path);
    assert.deepEqual(f.trace, ['action']);
    assert.equal((await exchange(port, '/images-other')).text, 'fallback');
  });

  for (const root of ['', '/research/v6'])
    it(`preserves fallback prefix boundaries and reserved roots under ${root || 'global root'}`, async () => {
      const f = await fixture({
        routing: { policyNames: [], rootContext: root },
        fallbacks: [reg(fallback({ action: 'route' })), reg(fallback({ name: 'specific', prefix: '/scope' }))],
        fallbackReservedPrefixes: [...coreFallbackReservedPrefixes(), '/images'],
      });
      const port = await f.start();
      assert.equal((await exchange(port, root + '/scope/deep')).text, 'fallback');
      assert.equal((await exchange(port, root + '/scope-other')).text, 'route');
      assert.equal((await exchange(port, root + '/images/missing')).status, 404);
      assert.equal((await exchange(port, root + '/known', 'POST')).status, 404);
      if (root) assert.equal((await exchange(port, '/unmatched')).status, 404);
    });

  it('does not fall through from a denied specific fallback to a public broad fallback', async () => {
    const f = await fixture({
      fallbacks: [reg(fallback()), reg(fallback({ name: 'specific', prefix: '/private', access: { kind: 'deny' } }))],
      fallbackReservedPrefixes: coreFallbackReservedPrefixes(),
      security: { policies: {}, csrf: { protect: noop, apiProtect: noop, token: unusedToken } },
    });
    assert.equal((await exchange(await f.start(), '/private/missing')).status, 403);
    assert.deepEqual(f.trace, []);
  });

  it('resolves only declared fallback branding through native policies and fails closed when required context is absent', async () => {
    const policies = createNativePolicies({
      branding: {
        getBrand: async ({ name }: { name: string }) =>
          name === 'trusted' ? ({ id: 'trusted-id', name } as never) : (null as never),
      },
      portals: ['research'],
      pathRules: { getRulesFromPath: () => undefined, canRead: () => true } as never,
      defaultUnauthenticatedRole: () => undefined,
      authenticate: async () => false,
      emitRequestFailure: noop,
    });
    const f = await fixture(
      {
        routing: { policyNames: Object.keys(policies) },
        fallbackReservedPrefixes: coreFallbackReservedPrefixes(),
        fallbacks: [
          reg(
            fallback({
              prefix: '/trusted-path',
              context: { branding: 'trusted', portal: 'research' },
              access: { kind: 'policies', names: ['brandingandportal', 'checkauth'] },
            })
          ),
          reg(
            fallback({
              name: 'missing-context',
              prefix: '/attacker',
              access: { kind: 'policies', names: ['brandingandportal', 'checkauth'] },
            })
          ),
        ],
        security: { policies, csrf: { protect: noop, apiProtect: noop, token: unusedToken } },
      },
      (request, reply) => reply.send(requestContext(request).brand.name)
    );
    const port = await f.start();
    assert.equal((await exchange(port, '/trusted-path/attacker/other')).text, 'trusted');
    assert.equal((await exchange(port, '/attacker/trusted/research')).status, 404);
    assert.deepEqual(f.trace, ['fallback']);
  });

  for (const stage of ['afterAuthentication', 'beforeAction'] as const)
    it(`owns a disconnected pending ${stage} hook until it settles`, async () => {
      const entered = barrier(),
        held = barrier();
      let closed = 0;
      let completed = false;
      const f = await fixture(
        {
          hooks: [
            reg(
              hook('held', {
                stage,
                run: async () => {
                  entered.resolve();
                  await held.promise;
                  assert.equal(closed, 0);
                  completed = true;
                },
              })
            ),
          ],
        },
        undefined,
        [
          {
            name: 'borrowed',
            create: () => ({
              initialize: noop,
              close: async () => {
                assert(completed);
                closed++;
              },
            }),
          },
        ]
      );
      const port = await f.start();
      const client = httpRequest({ hostname: '127.0.0.1', port, path: '/known', agent: false });
      client.on('error', () => {});
      client.end();
      await entered.promise;
      const disconnected = new Promise<void>(resolve => client.once('close', () => resolve()));
      client.destroy();
      await disconnected;
      await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline/);
      assert.equal(closed, 0);
      held.resolve();
      await f.host.stop();
      assert.equal(closed, 1);
    });

  it('scopes error observation to the selected route even when parsing fails before the request pipeline', async () => {
    const seen: string[] = [];
    const f = await fixture({
      hooks: [
        reg({
          name: 'error',
          stage: 'onError',
          scope: { kind: 'routes', names: ['read'] },
          observe: async (request, error) => {
            seen.push(request.routeName!);
            assert.equal(error.statusCode, 400);
          },
        }),
      ],
    });
    assert.equal((await exchange(await f.start(), '/known', 'POST', '{')).status, 400);
    // A method miss has no selected route, so its application parser failure is not route-scoped.
    assert.equal(seen.length, 0);
    const second = await fixture({
      routes: [{ ...route, declaration: { ...route.declaration, method: 'post', head: undefined } }],
      hooks: [
        reg({
          name: 'error',
          stage: 'onError',
          scope: { kind: 'routes', names: ['read'] },
          observe: async (request, error) => {
            seen.push(request.routeName!);
            assert.equal(error.statusCode, 400);
          },
        }),
      ],
    });
    assert.equal((await exchange(await second.start(), '/known', 'POST', '{')).status, 400);
    assert.deepEqual(seen, ['read']);
  });

  it('retains existing-handler callNotFound and parser failure without dispatching fallback', async () => {
    const f = await fixture(
      { fallbacks: [reg(fallback())], fallbackReservedPrefixes: coreFallbackReservedPrefixes() },
      (_req, reply) => reply.callNotFound()
    );
    const port = await f.start();
    assert.equal((await exchange(port, '/known')).status, 404);
    assert.equal((await exchange(port, '/missing')).status, 404);
    assert.equal((await exchange(port, '/missing', 'POST', '{')).status, 400);
    assert.deepEqual(f.trace, ['action', 'fallback']);
  });

  it('enforces fallback access and CSRF with a declared context, never inferring it from arbitrary unmatched paths', async () => {
    let permitted = false,
      csrf = false;
    const seen: unknown[] = [];
    const f = await fixture({
      fallbacks: [
        reg(
          fallback({
            access: { kind: 'policies', names: ['brand', 'allow'] },
            csrf: true,
            context: { branding: 'trusted', portal: 'research' },
          })
        ),
      ],
      fallbackReservedPrefixes: coreFallbackReservedPrefixes(),
      routing: { policyNames: ['brand', 'allow'] },
      security: {
        policies: {
          brand: async request => {
            seen.push(request.params);
          },
          allow: async (_req, reply) => {
            if (!permitted) reply.code(403).send();
          },
        },
        csrf: {
          protect: async (_req, reply) => {
            if (!csrf) reply.code(403).send();
            return undefined;
          },
          apiProtect: noop,
          token: unusedToken,
        },
      },
    });
    const port = await f.start();
    assert.equal((await exchange(port, '/attacker/other/miss', 'POST')).status, 403);
    assert.deepEqual(f.trace, []);
    permitted = true;
    assert.equal((await exchange(port, '/attacker/other/miss', 'POST')).status, 403);
    assert.deepEqual(f.trace, []);
    csrf = true;
    assert.equal((await exchange(port, '/attacker/other/miss', 'POST')).status, 200);
    assert.deepEqual(seen, Array(3).fill({ branding: 'trusted', portal: 'research' }));
    assert.deepEqual(f.trace, ['fallback']);
  });

  for (const stage of ['afterAuthentication', 'beforeAction', 'onResponse', 'onError'] as const)
    it(`retains asynchronous ${stage} work after response/disconnect through stop deadline and retry`, async () => {
      const entered = barrier(),
        held = barrier();
      let closed = 0,
        completed = 0;
      let f: Awaited<ReturnType<typeof fixture>>;
      const work = async () => {
        entered.resolve();
        await held.promise;
        assert.equal(closed, 0);
        assert(hasActiveHttpRequest(f.owner));
        assert(hasActivePersistenceWork(f.owner));
        await persistenceOperation(f.owner, async () => {
          completed++;
        });
      };
      const contribution: HttpHookContribution =
        stage === 'onResponse' || stage === 'onError'
          ? { name: 'held', stage, scope: { kind: 'application' }, observe: work }
          : {
              name: 'held',
              stage,
              scope: { kind: 'application' },
              run: async (request, reply) => {
                reply.send('early');
                trackHttpRequestWork(request, work());
              },
            };
      f = await fixture(
        { hooks: [reg(contribution)] },
        (_req, reply) => {
          if (stage === 'onError') throw new Error('private');
          return reply.send('ok');
        },
        [
          {
            name: 'borrowed',
            create: () => ({
              initialize: noop,
              close: async () => {
                assert.equal(completed, 1);
                closed++;
              },
            }),
          },
        ]
      );
      const response = exchange(await f.start(), '/known');
      await entered.promise;
      if (stage !== 'onError') await response;
      await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline/);
      assert.equal(closed, 0);
      assert.equal(completed, 0);
      held.resolve();
      await response;
      await f.host.stop();
      await f.host.stop();
      assert.equal(completed, 1);
      assert.equal(closed, 1);
    });

  for (const target of ['/known', '/missing'])
    it(`retains Express beforeRoutes/afterRoutes dispatch differential for ${target}`, async () => {
      const traces: string[][] = [];
      const statuses: number[] = [];
      for (const native of [false, true]) {
        const trace: string[] = [];
        traces.push(trace);
        if (native) {
          const f = await fixture(
            {
              hooks: [
                reg(
                  hook('before', {
                    stage: 'afterAuthentication',
                    run: async () => {
                      trace.push('before');
                    },
                  })
                ),
              ],
              fallbacks: [reg(fallback())],
              fallbackReservedPrefixes: coreFallbackReservedPrefixes(),
            },
            (request, reply) => {
              trace.push(request.raw.url === '/known' ? 'route' : 'after');
              return reply.send('ok');
            }
          );
          statuses.push((await exchange(await f.start(), target)).status);
          await f.host.stop();
        } else {
          const resolved = resolveExtensions([
            {
              name: 'core',
              root: '.',
              declaration: {
                apiVersion: 1,
                handlers: [
                  {
                    name: 'before',
                    create: () => (_req, _res, next) => {
                      trace.push('before');
                      next();
                    },
                  },
                  {
                    name: 'route',
                    create: () => (_req, res) => {
                      trace.push('route');
                      res.send('ok');
                    },
                  },
                  {
                    name: 'after',
                    create: () => (_req, res) => {
                      trace.push('after');
                      res.send('ok');
                    },
                  },
                ],
                routes: [{ name: 'read', method: 'get', path: '/known', handler: 'route', access: 'public' }],
                middleware: [
                  { name: 'before', stage: 'beforeRoutes', handler: 'before' },
                  { name: 'after', stage: 'afterRoutes', handler: 'after' },
                ],
              },
            },
          ]);
          const composition = composeExtensionApplication({ config: {}, log: { warn() {} } }, resolved, {
            module: () => () => {
              throw new Error('unused');
            },
            handler: item => bindExtensionFactory(item.declaration, undefined as never),
          });
          const host = new ExpressHost(composition.application, {
            hostname: '127.0.0.1',
            port: 0,
            prepare: composition.prepare,
          });
          hosts.push(host);
          await host.initialize();
          await host.activate();
          statuses.push((await exchange(host.address()!.port, target)).status);
          await host.stop();
        }
      }
      assert.deepEqual(statuses, [200, 200]);
      assert.deepEqual(traces[0], traces[1]);
      assert.deepEqual(traces[0], target === '/known' ? ['before', 'route'] : ['before', 'after']);
    });
});
