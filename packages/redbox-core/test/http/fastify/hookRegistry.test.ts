import assert from 'node:assert/strict';
import { request as httpRequest, METHODS, Server } from 'node:http';
import { setImmediate } from 'node:timers/promises';
import sinon from 'sinon';
import { z } from 'zod';
import { ApplicationRuntime } from '../../../dist/application';
import { defineController, bindControllerFactory, type HttpHookContribution } from '../../../dist/http';
import { createControllerHost, type ControllerHostOptions } from '../../../dist/http/fastify/composition';
import {
  installNativeAuthenticationRoutes,
  type NativeAuthentication,
  type NativeAuthenticationRoutesInput,
} from '../../../dist/http/fastify/authentication';
import { HttpRouteRegistry, coreFallbackReservedPrefixes } from '../../../dist/http/fastify/registry';
import { coreHttpNamespaces } from '../../../dist/http/fastify/coreNamespaces';
import type { FastifyHost } from '../../../dist/http/fastify/FastifyHost';

function exchange(port: number, path: string, method = 'GET', body?: unknown) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const bytes = body === undefined ? undefined : JSON.stringify(body);
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        agent: false,
        headers:
          bytes === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(bytes) },
      },
      response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          text += chunk;
        });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode!, text }));
      }
    );
    req.on('connect', (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode!, text: '' });
    });
    req.on('error', error => {
      // Node's host closes CONNECT without dispatch when no CONNECT owner exists.
      if (method === 'CONNECT' && (error as NodeJS.ErrnoException).code === 'ECONNRESET')
        resolve({ status: 0, text: '<host-closed-connect>' });
      else reject(new Error(method + ' ' + path + ': ' + error.message));
    });
    req.setTimeout(3000, () => req.destroy(new Error('Registry HTTP deadline')));
    req.end(bytes);
  });
}
const sample = (path: string) =>
  path
    .replace(/:branding/g, 'default')
    .replace(/:portal/g, 'rdmp')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, 'sample')
    .replace(/\*/g, 'sample');
const reg = <T>(declaration: T) => ({ provider: 'core', declaration });
const noop = async () => undefined;

describe('FM-018 complete route registry and universal hook pipeline', function () {
  this.timeout(60000);
  const hosts: FastifyHost[] = [];
  afterEach(async () => {
    sinon.restore();
    for (const host of hosts.splice(0)) await host.stop({ deadlineMs: 3000 });
  });
  async function fixture(rootContext = '', extra: Partial<ControllerHostOptions> = {}) {
    const trace: string[] = [];
    const factory = defineController({
      name: 'Registry',
      actions: ['known', 'fallback'],
      create: () => ({
        known(_request: unknown, reply: any) {
          trace.push('action');
          return reply.send('known');
        },
        fallback(_request: unknown, reply: any) {
          trace.push('FALLBACK');
          return reply.send('FALLBACK');
        },
      }),
    });
    const actor = {
      id: 'actor',
      username: 'actor',
      type: 'local',
      roles: [{ id: 'role', brandId: 'default', name: 'Admin' }],
    };
    const identity = {
      session: async () => {
        trace.push('action');
        return actor;
      },
      profile: async () => ({ id: 'actor', username: 'actor' }),
    } as unknown as NativeAuthenticationRoutesInput['identity'];
    const authentication = {
      actor: () => actor,
      accounts: {
        authenticateLocal: async () => {
          trace.push('action');
          return actor;
        },
      },
      providers: {
        begin: async () => {
          trace.push('action');
          return '/provider';
        },
        callback: async () => actor,
        aaf: async () => actor,
      },
    } as unknown as NativeAuthentication;
    const hooks: HttpHookContribution[] = [
      {
        name: 'after',
        stage: 'afterAuthentication',
        scope: { kind: 'application' },
        run: async () => {
          trace.push('afterAuthentication');
        },
      },
      {
        name: 'before',
        stage: 'beforeAction',
        scope: { kind: 'application' },
        run: async () => {
          trace.push('beforeAction');
        },
      },
      {
        name: 'response',
        stage: 'onResponse',
        scope: { kind: 'application' },
        observe: async () => {
          trace.push('onResponse');
        },
      },
    ];
    const host = await createControllerHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }, []), {
      hostname: '127.0.0.1',
      port: 0,
      logger: () => {},
      controllers: [reg(factory)],
      bindings: [bindControllerFactory(factory, undefined)],
      routing: { rootContext, policyNames: ['allowed'] },
      routes: [
        reg({
          name: 'known',
          method: 'get' as const,
          path: '/known',
          controller: 'Registry',
          action: 'known',
          access: { kind: 'policies' as const, names: ['allowed'] as [string] },
          csrf: true,
          validation: { query: z.object({ ok: z.literal('1') }) },
          head: { kind: 'deny' as const, allow: 'GET' },
        }),
      ],
      fallbacks: [
        reg({
          name: 'unmatched',
          prefix: '/',
          controller: 'Registry',
          action: 'fallback',
          access: { kind: 'public' as const },
        }),
      ],
      hooks: hooks.map(reg),
      guards: async () => {
        trace.push('prelude');
      },
      security: {
        policies: {
          allowed: async () => {
            trace.push('policy');
          },
        },
        csrf: {
          protect: async () => {
            trace.push('csrf');
          },
          apiProtect: noop,
          token: async () => {
            throw new Error('unused');
          },
        },
        prepare: async app => {
          app.addHook('onRequest', async request => {
            const values = new Map<string, unknown>([
              ['branding', 'default'],
              ['portal', 'rdmp'],
            ]);
            request.session = {
              get: (key: string) => values.get(key),
              set: (key: string, value: unknown) => {
                values.set(key, value);
              },
              save: noop,
              regenerate: noop,
              destroy: noop,
            } as any;
          });
          app.addHook('preValidation', async () => {
            trace.push('authentication');
          });
          app.addHook('preHandler', async () => {
            trace.push('global-guard');
          });
          installNativeAuthenticationRoutes(app, authentication, {
            identity,
            rootContext,
            defaultBrand: 'default',
            defaultPortal: 'rdmp',
            validContext: (brand, portal) => brand === 'default' && portal === 'rdmp',
            brandId: () => 'default',
            postLoginPath: () => rootContext + '/home',
            csrf: async () => {
              trace.push('native-csrf');
            },
            audit: noop,
            loginFailure: noop,
          });
          app.register(
            async child => {
              await Promise.resolve();
              child.get(
                '/ad-hoc/:id',
                {
                  preHandler: async () => {
                    trace.push('native-validation');
                  },
                },
                async (_request, reply) => {
                  trace.push('action');
                  return reply.send('native');
                }
              );
            },
            { prefix: rootContext + '/native' }
          );
        },
      },
      ...extra,
    });
    hosts.push(host);
    await host.initialize();
    await host.activate();
    return { host, trace, port: host.address()!.port };
  }

  for (const root of ['', '/research/v6']) {
    it(`preserves native authentication and late nested route method misses at ${root || '/'}`, async () => {
      const f = await fixture(root);
      for (const path of ['/user/info', '/default/rdmp/user/info', '/native/ad-hoc/owned']) {
        assert.equal((await exchange(f.port, root + path, 'POST')).status, 404, path);
        assert(!f.trace.includes('FALLBACK'));
      }
      assert.equal((await exchange(f.port, root + '/extension-unmatched')).text, 'FALLBACK');
    });
    it(`tests every FM-002 namespace × every Node method behind a catch-all fallback at ${root || '/'}`, async () => {
      const f = await fixture(root);
      let cases = 0;
      for (const namespace of coreHttpNamespaces) {
        const relative = (namespace.kind === 'pattern' ? namespace.example : namespace.path)
          .replace('${companion.route}', '/companion')
          .replace('${companion.server.path}', '/companion');
        const base = (namespace.global ? '' : root) + sample(relative);
        for (const path of namespace.kind === 'namespace' ? [base, base + '/missing-fm018'] : [base])
          for (const method of METHODS) {
            f.trace.length = 0;
            const response = await exchange(f.port, path || '/', method);
            assert.notEqual(response.text, 'FALLBACK', method + ' ' + path);
            assert(!f.trace.includes('FALLBACK'), method + ' ' + path);
            cases++;
          }
      }
      assert.equal(
        cases,
        coreHttpNamespaces.reduce((count, entry) => count + (entry.kind === 'namespace' ? 2 : 1), 0) * METHODS.length
      );
    });
    it(`runs both application request stages once and in order for every registered route at ${root || '/'}`, async () => {
      const f = await fixture(root);
      const registered = f.host.registeredRoutes();
      assert(registered.some(route => route.kind === 'native' && route.path.endsWith('/user/info')));
      assert(registered.some(route => route.path.endsWith('/native/ad-hoc/:id')));
      assert(registered.some(route => route.kind === 'declarative'));
      assert(registered.some(route => route.kind === 'automatic-options'));
      for (const route of registered) {
        f.trace.length = 0;
        const path = route.kind === 'automatic-options' ? root + '/known' : sample(route.path);
        const response = await exchange(
          f.port,
          path + '?ok=1&code=done',
          route.method,
          ['POST', 'PUT', 'PATCH'].includes(route.method)
            ? { username: 'actor', password: 'password', assertion: 'assertion' }
            : undefined
        );
        await setImmediate();
        const key = route.method + ' ' + route.path + ' ' + response.status + ' ' + f.trace.join(',');
        assert.equal(f.trace.filter(item => item === 'afterAuthentication').length, 1, key);
        assert.equal(f.trace.filter(item => item === 'beforeAction').length, 1, key);
        assert(f.trace.indexOf('authentication') < f.trace.indexOf('afterAuthentication'), key);
        assert(f.trace.indexOf('afterAuthentication') < f.trace.indexOf('global-guard'), key);
        assert(f.trace.indexOf('global-guard') < f.trace.indexOf('beforeAction'), key);
        for (const guard of ['policy', 'csrf', 'native-csrf', 'native-validation', 'prelude'])
          if (f.trace.includes(guard)) assert(f.trace.indexOf(guard) < f.trace.indexOf('beforeAction'), key);
        if (f.trace.includes('action')) assert(f.trace.indexOf('beforeAction') < f.trace.indexOf('action'), key);
        assert(f.trace.indexOf('beforeAction') < f.trace.indexOf('onResponse'), key);
      }
    });
  }
  it('runs all four application stages with native route identities for failures on every registered route', async () => {
    const trace: string[] = [];
    const observations: { name?: string; code: string }[] = [];
    const f = await fixture('', {
      hooks: [
        reg({
          name: 'after',
          stage: 'afterAuthentication',
          scope: { kind: 'application' },
          run: async () => {
            trace.push('afterAuthentication');
          },
        }),
        reg({
          name: 'before',
          stage: 'beforeAction',
          scope: { kind: 'application' },
          run: async () => {
            trace.push('beforeAction');
            throw new Error('private native failure');
          },
        }),
        reg({
          name: 'error',
          stage: 'onError',
          scope: { kind: 'application' },
          observe: async (request, error) => {
            trace.push('onError');
            observations.push({ name: request.routeName, code: error.code });
            assert(Object.isFrozen(request));
            assert(Object.isFrozen(error));
          },
        }),
        reg({
          name: 'response',
          stage: 'onResponse',
          scope: { kind: 'application' },
          observe: async () => {
            trace.push('onResponse');
          },
        }),
      ],
    });
    for (const route of f.host.registeredRoutes()) {
      trace.length = 0;
      observations.length = 0;
      const path = route.kind === 'automatic-options' ? '/known' : sample(route.path);
      const response = await exchange(f.port, path + '?ok=1', route.method);
      await setImmediate();
      assert.equal(response.status, 500, route.method + ' ' + route.path);
      assert.deepEqual(trace, ['afterAuthentication', 'beforeAction', 'onError', 'onResponse']);
      assert.deepEqual(observations, [{ name: route.name, code: 'HTTP_REQUEST_FAILED' }]);
      assert(!response.text.includes('private native failure'));
    }
  });
  it('fails composition for every individually omitted namespace, an empty list, and malformed reservations before listen', async () => {
    const listen = sinon.spy(Server.prototype, 'listen');
    const complete = coreFallbackReservedPrefixes();
    assert(complete.length > 0);
    for (const omitted of complete)
      assert.throws(
        () =>
          new HttpRouteRegistry(
            '',
            complete.filter(path => path !== omitted)
          ),
        /Missing FM-002 namespace/,
        omitted
      );
    await assert.rejects(fixture('', { fallbackReservedPrefixes: [] }), /Missing FM-002 namespace/);
    assert.throws(() => new HttpRouteRegistry('', [...complete, '/bad/..']), /Invalid reserved/);
    assert.equal(listen.callCount, 0);
  });
  it('reserves configured raw-provider namespaces and rejects defaults substituted for configured paths', async () => {
    const configuration = { companion: { route: '/uploads', server: { path: '/oauth-bridge' } } };
    const registry = new HttpRouteRegistry('/research', undefined, configuration);
    assert(registry.protects('/research/uploads/missing'));
    assert(registry.protects('/research/oauth-bridge/api/missing'));
    assert.throws(
      () => new HttpRouteRegistry('/research', coreFallbackReservedPrefixes(), configuration),
      /Missing FM-002 namespace/
    );
    const f = await fixture('/research', { namespaceConfiguration: configuration });
    for (const path of ['/uploads', '/oauth-bridge/api/missing'])
      for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
        assert.notEqual((await exchange(f.port, '/research' + path, method)).text, 'FALLBACK');
  });
  it('derives native wildcard mount ownership from registration, including missing roots and all methods', async () => {
    const f = await fixture('', {
      security: {
        policies: { allowed: noop },
        csrf: {
          protect: noop,
          apiProtect: noop,
          token: async () => {
            throw new Error('unused');
          },
        },
        prepare: async app => {
          app.get('/installed-assets/*', async (_request, reply) => reply.callNotFound());
        },
      },
    });
    for (const path of ['/installed-assets', '/installed-assets/missing'])
      for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        const response = await exchange(f.port, path, method);
        assert.notEqual(response.text, 'FALLBACK', method + ' ' + path);
        assert(!f.trace.includes('FALLBACK'));
      }
  });
  it('uses the actual route index and live router for extension method misses without treating synthetic OPTIONS as a catch-all owner', async () => {
    const f = await fixture('', {
      routes: [
        {
          provider: 'extension',
          declaration: {
            name: 'wildcard-read',
            method: 'get',
            path: '/vocabulary/:locale/*key',
            controller: 'Registry',
            action: 'known',
            access: { kind: 'public' },
          },
        },
        {
          provider: 'extension',
          declaration: {
            name: 'new-read',
            method: 'get',
            path: '/new-routes/:id',
            controller: 'Registry',
            action: 'known',
            access: { kind: 'public' },
          },
        },
      ],
    });
    assert.equal((await exchange(f.port, '/new-routes/item')).text, 'known');
    assert.equal((await exchange(f.port, '/vocabulary/en/nested/key')).text, 'known');
    assert.equal((await exchange(f.port, '/vocabulary/en/nested/key', 'POST')).status, 404);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND'])
      assert.equal((await exchange(f.port, '/new-routes/item', method)).status, 404, method);
    assert.equal((await exchange(f.port, '/new-routes/item/deeper')).text, 'FALLBACK');
    assert.equal((await exchange(f.port, '/genuinely-unmatched')).text, 'FALLBACK');
  });
  it('keeps registered global probes outside application hooks and ordinary admission', async () => {
    const f = await fixture('/research');
    for (const path of ['/healthz', '/readyz']) {
      f.trace.length = 0;
      assert.equal((await exchange(f.port, path)).status, 200);
      assert.deepEqual(f.trace, []);
    }
  });
  it('keeps the native lookup private at preparation and request boundaries', async () => {
    const f = await fixture('', {
      security: {
        policies: { allowed: noop },
        csrf: {
          protect: noop,
          apiProtect: noop,
          token: async () => {
            throw new Error('unused');
          },
        },
        prepare: async app => {
          assert.throws(() => Reflect.get(app, 'findRoute'), /Fastify preparation rejects/);
          app.get('/capability-check', async (request, reply) => {
            assert.throws(() => Reflect.get(request.server, 'findRoute'), /Fastify preparation rejects/);
            return reply.send('sealed');
          });
        },
      },
    });
    assert.equal((await exchange(f.port, '/capability-check')).text, 'sealed');
  });
  it('indexes valid native encoded paths and regex wildcard mounts without declarative grammar restrictions', async () => {
    const f = await fixture('', {
      security: {
        policies: { allowed: noop },
        csrf: {
          protect: noop,
          apiProtect: noop,
          token: async () => {
            throw new Error('unused');
          },
        },
        prepare: async app => {
          app.get('/%73cope/read', async (_request, reply) => reply.send('encoded'));
          app.get('/native-assets/:id(\\d+)/*', async (_request, reply) => reply.send('asset'));
          // Registering an explicit base after its wildcard must not duplicate the index.
          app.get('/native-assets/:id(\\d+)', async (_request, reply) => reply.callNotFound());
        },
      },
    });
    assert.equal((await exchange(f.port, '/%73cope/read')).text, 'encoded');
    assert.equal((await exchange(f.port, '/%73cope/read', 'POST')).status, 404);
    assert.equal((await exchange(f.port, '/native-assets/42/leaf')).text, 'asset');
    for (const path of ['/native-assets/42', '/native-assets/42/leaf'])
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        assert.equal((await exchange(f.port, path, method)).status, 404);
        assert(!f.trace.includes('FALLBACK'));
      }
    const names = f.host
      .registeredRoutes()
      .filter(route => route.kind === 'native')
      .map(route => route.name);
    assert.equal(new Set(names).size, names.length);
    assert(names.every(name => /^core-native-http-[a-f0-9]{16}$/.test(name)));
  });
  for (const asynchronous of [false, true])
    it(`contains native serializer faults after both application stages (async=${asynchronous})`, async () => {
      const f = await fixture('', {
        security: {
          policies: { allowed: noop },
          csrf: {
            protect: noop,
            apiProtect: noop,
            token: async () => {
              throw new Error('unused');
            },
          },
          prepare: async app => {
            app.get('/native/serializer', (_request, reply) => {
              const result = () => new Uint8Array([1]);
              reply.serializer((asynchronous ? async () => result() : result) as any);
              return { payload: true };
            });
          },
        },
      });
      const response = await exchange(f.port, '/native/serializer');
      assert.equal(response.status, 500);
      assert.deepEqual(JSON.parse(response.text), { message: 'Internal server error', details: '' });
      assert(f.trace.indexOf('afterAuthentication') < f.trace.indexOf('beforeAction'));
      assert(f.trace.includes('beforeAction'));
      assert.equal((await exchange(f.port, '/extension-unmatched')).text, 'FALLBACK');
    });
  for (const stage of ['afterAuthentication', 'beforeAction'] as const)
    it(`owns a native ${stage} hook after response through shutdown deadline and retry`, async () => {
      const entered = Promise.withResolvers<void>(),
        held = Promise.withResolvers<void>();
      const f = await fixture('', {
        hooks: [
          reg({
            name: 'held-native',
            stage,
            scope: { kind: 'application' as const },
            run: async (_request, reply) => {
              reply.send('early');
              entered.resolve();
              await held.promise;
            },
          }),
        ],
      });
      try {
        const response = exchange(f.port, '/native/ad-hoc/held');
        await entered.promise;
        assert.equal((await response).text, 'early');
        await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline/);
        assert(!f.trace.includes('action'));
        held.resolve();
        await f.host.stop();
      } finally {
        held.resolve();
      }
    });
  it('exposes immutable registry metadata without native lookup or registration capabilities', async () => {
    const f = await fixture();
    const registered = f.host.registeredRoutes();
    assert(Object.isFrozen(registered));
    for (const route of registered) {
      assert(Object.isFrozen(route));
      assert.deepEqual(Object.keys(route).sort(), ['kind', 'method', 'name', 'path']);
      assert.equal(Reflect.set(route, 'path', '/escape'), false);
    }
    assert.equal((await exchange(f.port, '/native/ad-hoc/a')).text, 'native');
    assert.equal((await exchange(f.port, '/native/ad-hoc/a', 'POST')).status, 404);
  });
  for (const stage of ['afterAuthentication', 'beforeAction'] as const)
    it(`terminates native dispatch at ${stage} with asynchronous onSend still pending`, async () => {
      const entered = Promise.withResolvers<void>(),
        held = Promise.withResolvers<void>();
      const f = await fixture('', {
        hooks: [
          reg({
            name: 'stop',
            stage,
            scope: { kind: 'application' as const },
            run: async (_request, reply) => {
              reply.code(202).send('early');
            },
          }),
        ],
        security: {
          policies: { allowed: noop },
          csrf: {
            protect: noop,
            apiProtect: noop,
            token: async () => {
              throw new Error('unused');
            },
          },
          prepare: async app => {
            app.addHook('onSend', async (_request, _reply, payload) => {
              entered.resolve();
              await held.promise;
              return payload;
            });
            app.get(
              '/native/only',
              {
                preHandler: async () => {
                  if (stage === 'afterAuthentication') throw new Error('downstream guard');
                },
              },
              async () => {
                throw new Error('downstream action');
              }
            );
          },
        },
      });
      try {
        const response = exchange(f.port, '/native/only');
        await entered.promise;
        held.resolve();
        assert.deepEqual(await response, { status: 202, text: 'early' });
      } finally {
        held.resolve();
      }
    });
});
