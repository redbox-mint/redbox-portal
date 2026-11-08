import assert from 'node:assert/strict';
import { request as httpRequest, Server } from 'node:http';
import { setImmediate } from 'node:timers/promises';
import type { FastifyRequest, FastifyReply } from 'fastify';
import sinon from 'sinon';
import { ApplicationRuntime } from '../../../dist/application';
import { defineController, bindControllerFactory, type HttpHookContribution } from '../../../dist/http';
import { createControllerHost, type ControllerHostOptions } from '../../../dist/http/fastify/composition';
import type { FastifyHost } from '../../../dist/http/fastify/FastifyHost';

const reg = <T>(declaration: T) => ({ provider: 'core', declaration });
const route = (name: string, method: 'get' | 'head' | 'options', path: string) =>
  reg({ name, method, path, controller: 'Identity', action: 'run', access: { kind: 'public' as const } });
const noop = async () => undefined;
function exchange(port: number, path: string, method = 'GET', headers: Record<string, string> = {}) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method, headers, agent: false }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        text += chunk;
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode!, text }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Identity HTTP deadline')));
    req.end();
  });
}
const token = (request: FastifyRequest) => {
  const config = request.routeOptions.config;
  assert(Object.isFrozen(config));
  const values = Object.values(config).filter(value => typeof value === 'symbol');
  assert.equal(values.length, 1);
  return values[0] as symbol;
};

describe('FM-018 matched registration identity', function () {
  this.timeout(15000);
  const hosts: FastifyHost[] = [];
  afterEach(async () => {
    sinon.restore();
    for (const host of hosts.splice(0)) await host.stop({ deadlineMs: 3000 });
  });
  async function fixture(
    root: string,
    options: Partial<ControllerHostOptions>,
    action: (request: FastifyRequest, reply: FastifyReply) => unknown = (request, reply) => reply.send(request.params)
  ) {
    const factory = defineController({ name: 'Identity', actions: ['run'], create: () => ({ run: action }) });
    const host = await createControllerHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }, []), {
      hostname: '127.0.0.1',
      port: 0,
      logger: () => {},
      controllers: [reg(factory)],
      bindings: [bindControllerFactory(factory, undefined)],
      routes: [],
      routing: { rootContext: root, policyNames: [] },
      ...options,
    });
    hosts.push(host);
    await host.initialize();
    await host.activate();
    return { host, port: host.address()!.port };
  }
  const security = (prepare: NonNullable<ControllerHostOptions['security']>['prepare']) => ({
    policies: {},
    csrf: {
      protect: noop,
      apiProtect: noop,
      token: async () => {
        throw new Error('unused');
      },
    },
    prepare,
  });
  for (const root of ['', '/research/v6']) {
    it(`explicit wildcard OPTIONS keeps its scoped terminal hook beside synthetic OPTIONS at ${root || '/'}`, async () => {
      const events: string[] = [];
      const observations: string[] = [];
      const f = await fixture(
        root,
        {
          routes: [route('explicit-options', 'options', '/*tail')],
          hooks: [
            reg({
              name: 'deny-options',
              stage: 'afterAuthentication',
              scope: { kind: 'routes', names: ['explicit-options'] },
              run: async (request, reply) => {
                events.push('after:' + (request.params as { tail: string }).tail);
                reply.code(403).send('denied');
              },
            } satisfies HttpHookContribution),
            reg({
              name: 'downstream',
              stage: 'beforeAction',
              scope: { kind: 'application' },
              run: async () => {
                events.push('before');
              },
            } satisfies HttpHookContribution),
            reg({
              name: 'response',
              stage: 'onResponse',
              scope: { kind: 'application' },
              observe: async request => {
                observations.push(request.routeName!);
              },
            } satisfies HttpHookContribution),
          ],
        },
        (_request, reply) => {
          events.push('action');
          return reply.send('action');
        }
      );
      const pair = f.host.registeredRoutes().filter(entry => entry.method === 'OPTIONS' && entry.path === root + '/*');
      assert.equal(pair.length, 2);
      assert.deepEqual(new Set(pair.map(entry => entry.kind)), new Set(['declarative', 'automatic-options']));
      assert.deepEqual(await exchange(f.port, root + '/abc', 'OPTIONS'), { status: 403, text: 'denied' });
      await setImmediate();
      assert.deepEqual(events, ['after:abc']);
      assert.deepEqual(observations, ['explicit-options']);
    });
    it(`explicit wildcard OPTIONS normalizes the actual capture before its hook and action at ${root || '/'}`, async () => {
      const events: string[] = [];
      const f = await fixture(root, {
        routes: [route('explicit-options', 'options', '/*tail')],
        hooks: [
          reg({
            name: 'capture',
            stage: 'afterAuthentication',
            scope: { kind: 'routes', names: ['explicit-options'] },
            run: async request => {
              events.push(JSON.stringify(request.params));
            },
          } satisfies HttpHookContribution),
        ],
      });
      const response = await exchange(f.port, root + '/abc/def/', 'OPTIONS');
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.text), { tail: 'abc/def/' });
      assert.deepEqual(events, [JSON.stringify({ tail: 'abc/def/' })]);
    });
    it(`constrained native method arrays retain stages and pre-stage error identities at ${root || '/'}`, async () => {
      const seen: { method: string; url: string; name: string; error: boolean }[] = [];
      const stages: string[] = [];
      const identities = new Map<string, symbol>();
      const names = new Map<string, string>();
      const f = await fixture(root, {
        hooks: [
          reg({
            name: 'after',
            stage: 'afterAuthentication',
            scope: { kind: 'application' },
            run: async request => {
              const label = (request.routeOptions.config as { label?: string }).label;
              const key = request.method + ':' + label;
              const identity = token(request);
              if (identities.has(key)) assert.equal(identity, identities.get(key));
              else identities.set(key, identity);
              stages.push('after:' + label);
            },
          } satisfies HttpHookContribution),
          reg({
            name: 'before',
            stage: 'beforeAction',
            scope: { kind: 'application' },
            run: async request => {
              stages.push('before:' + (request.routeOptions.config as { label?: string }).label);
            },
          } satisfies HttpHookContribution),
          reg({
            name: 'response',
            stage: 'onResponse',
            scope: { kind: 'application' },
            observe: async request => {
              seen.push({ method: request.method, url: request.url, name: request.routeName!, error: false });
            },
          } satisfies HttpHookContribution),
          reg({
            name: 'error',
            stage: 'onError',
            scope: { kind: 'application' },
            observe: async request => {
              seen.push({ method: request.method, url: request.url, name: request.routeName!, error: true });
            },
          } satisfies HttpHookContribution),
        ],
        security: security(async app => {
          app.addHook('preValidation', async request => {
            if (request.headers['x-test-failure']) throw new Error('private');
          });
          for (const constrained of [true, false])
            app.route({
              method: ['GET', 'POST'],
              url: root + '/*',
              constraints: constrained ? { redboxNonemptyPath: 'nonempty' } : undefined,
              config: { label: constrained ? 'captured' : 'bare' },
              handler: async (request, reply) => {
                const label = (request.routeOptions.config as { label?: string }).label;
                stages.push('action:' + label);
                return reply.send(label);
              },
            });
        }),
      });
      // The constraint distinguishes '/' only at the global root. A prefixed
      // pair still shares one route URL and exercises per-registration identity.
      const paths = root ? [root + '/abc'] : ['/abc', '/'];
      for (const method of ['GET', 'POST'])
        for (const path of paths) {
          stages.length = 0;
          seen.length = 0;
          const label = path === '/' ? 'bare' : 'captured';
          assert.equal((await exchange(f.port, path, method)).text, label);
          await setImmediate();
          assert.deepEqual(stages, ['after:' + label, 'before:' + label, 'action:' + label]);
          assert.equal(seen.length, 1);
          names.set(method + ':' + label, seen[0].name);
          assert(f.host.registeredRoutes().some(route => route.name === seen[0].name && route.method === method));
        }
      assert.equal(new Set(names.values()).size, names.size);
      if (!root) {
        assert.notEqual(identities.get('GET:captured'), identities.get('GET:bare'));
        assert.equal(identities.get('GET:captured'), identities.get('POST:captured'));
      }
      for (const method of ['GET', 'POST'])
        for (const path of paths) {
          stages.length = 0;
          seen.length = 0;
          const label = path === '/' ? 'bare' : 'captured';
          assert.equal((await exchange(f.port, path, method, { 'x-test-failure': '1' })).status, 500);
          await setImmediate();
          assert.deepEqual(stages, []);
          assert.deepEqual(
            seen.map(value => [value.name, value.error]),
            [
              [names.get(method + ':' + label), true],
              [names.get(method + ':' + label), false],
            ]
          );
        }
    });
    for (const explicit of [false, true])
      it(`GET and ${explicit ? 'explicit' : 'synthetic'} HEAD keep their registration scope at ${root || '/'}`, async () => {
        const events: string[] = [];
        const tokens = new Map<string, symbol>();
        const f = await fixture(
          root,
          {
            routes: [route('read', 'get', '/pair/:id'), ...(explicit ? [route('head', 'head', '/pair/:id')] : [])],
            routing: {
              rootContext: root,
              policyNames: [],
              precedence: explicit
                ? [{ name: 'explicit-head', winner: 'head', over: 'read', reason: 'HEAD has its own scoped hooks.' }]
                : [],
            },
            hooks: ['read', ...(explicit ? ['head'] : [])].map(name =>
              reg({
                name: 'after-' + name,
                stage: 'afterAuthentication',
                scope: { kind: 'routes', names: [name] },
                run: async request => {
                  events.push(request.method + ':' + name + ':' + (request.params as { id: string }).id);
                  tokens.set(request.method, token(request));
                },
              } satisfies HttpHookContribution)
            ),
          },
          (_request, reply) => {
            events.push('action');
            return reply.send('ok');
          }
        );
        for (const method of ['GET', 'HEAD']) {
          events.length = 0;
          assert.equal((await exchange(f.port, root + '/pair/value', method)).status, 200);
          assert.deepEqual(events, [
            method + ':' + (method === 'HEAD' && explicit ? 'head' : 'read') + ':value',
            'action',
          ]);
        }
        assert.notEqual(tokens.get('GET'), tokens.get('HEAD'));
      });
  }
  it('synthetic OPTIONS has a distinct context and never inherits the constrained wildcard scope', async () => {
    const names: string[] = [];
    let scoped = 0;
    const tokens: symbol[] = [];
    const f = await fixture('', {
      routes: [route('explicit-options', 'options', '/*tail')],
      hooks: [
        reg({
          name: 'scoped',
          stage: 'afterAuthentication',
          scope: { kind: 'routes', names: ['explicit-options'] },
          run: async () => {
            scoped++;
          },
        } satisfies HttpHookContribution),
        reg({
          name: 'tokens',
          stage: 'afterAuthentication',
          scope: { kind: 'application' },
          run: async request => {
            tokens.push(token(request));
          },
        } satisfies HttpHookContribution),
        reg({
          name: 'names',
          stage: 'onResponse',
          scope: { kind: 'application' },
          observe: async request => {
            names.push(request.routeName!);
          },
        } satisfies HttpHookContribution),
      ],
    });
    assert.equal((await exchange(f.port, '/abc', 'OPTIONS')).status, 200);
    assert.equal((await exchange(f.port, '/', 'OPTIONS')).status, 404);
    await setImmediate();
    assert.equal(scoped, 1);
    assert.deepEqual(names, ['explicit-options', 'portal.automatic-options']);
    assert.equal(tokens.length, 2);
    assert.notEqual(tokens[0], tokens[1]);
  });
  it('native automatic HEAD and shared configs across plugin prefixes keep distinct contexts', async () => {
    const stages: string[] = [];
    const tokens = new Map<string, symbol>();
    const shared = { label: 'shared' };
    const f = await fixture('', {
      hooks: [
        reg({
          name: 'after',
          stage: 'afterAuthentication',
          scope: { kind: 'application' },
          run: async request => {
            stages.push('after');
            tokens.set(request.method + ' ' + request.raw.url, token(request));
          },
        } satisfies HttpHookContribution),
        reg({
          name: 'before',
          stage: 'beforeAction',
          scope: { kind: 'application' },
          run: async () => {
            stages.push('before');
          },
        } satisfies HttpHookContribution),
      ],
      security: security(async app => {
        const handler = async (_request: FastifyRequest, reply: FastifyReply) => {
          stages.push('action');
          return reply.send('ok');
        };
        app.get('/echo', { config: shared, exposeHeadRoute: true }, handler);
        for (const prefix of ['/first', '/second'])
          app.register(
            async child => {
              child.get('/echo', { config: shared, exposeHeadRoute: true }, handler);
            },
            { prefix }
          );
      }),
    });
    for (const path of ['/echo', '/first/echo', '/second/echo'])
      for (const method of ['GET', 'HEAD']) {
        stages.length = 0;
        assert.equal((await exchange(f.port, path, method)).status, 200);
        assert.deepEqual(stages, ['after', 'before', 'action']);
      }
    assert.equal(new Set(tokens.values()).size, 6);
    assert.deepEqual(shared, { label: 'shared' });
  });
  for (const constraints of [{ version: '1.0.0' }, { host: 'example.test' }])
    it(`keeps unqualified ${Object.keys(constraints)[0]} constraints outside the sealed preparation API`, async () => {
      const listen = sinon.spy(Server.prototype, 'listen');
      await assert.rejects(
        fixture('', {
          security: security(async app => {
            app.route({ method: 'GET', url: '/versioned', constraints, handler: async () => 'no' });
          }),
        }),
        /route.constraints/
      );
      assert.equal(listen.callCount, 0);
    });
});
