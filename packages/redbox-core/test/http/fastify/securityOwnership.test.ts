import assert from 'node:assert/strict';
import { request } from 'node:http';
import { ApplicationRuntime } from '../../../src/application';
import { bindControllerFactory, defineController, requestContext } from '../../../src/http';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { createControllerHost } from '../../../src/http/fastify/composition';
import { nativeBodyParserPlugin, prepareNativeParsers } from '../../../src/http/fastify/parsers';
import { installSafeHttpErrors } from '../../../src/http/fastify/responses';
import { createNativeCsrf } from '../../../src/http/fastify/csrf';
import { createNativePolicies } from '../../../src/http/fastify/policies';
import { validateRouteRequest } from '../../../src/http/fastify/validation';
import { z } from 'zod';
import { securityFixture, route, canonical, rawRequest } from './securityFixture';
import { hasActiveHttpRequest } from '../../../src/middleware/requestLifetime';
import { hasActivePersistenceWork } from '../../../src/persistence/runtime';

const owner = () => ({ config: {}, log: { warn() {} } });
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const sendStarted = async (work: Promise<void>) => {
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Delayed send did not start')), 2000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
};

describe('FM-016 sealed native parser and security ownership', function () {
  this.timeout(10000);
  for (const options of [
    { parserExclusions: ['/raw/'] },
    { parserExclusions: ['raw'] },
    { prefix: '/raw' },
    { decorate: true },
  ])
    it(`rejects unqualified native parser options ${JSON.stringify(options)}`, async () => {
      const application = new ApplicationRuntime(owner(), []);
      const host = new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        prepare: async app => {
          app.register(nativeBodyParserPlugin, options as never);
        },
      });
      try {
        await assert.rejects(host.initialize(), /Parser exclusions|preparation rejects/);
        assert.equal(host.address(), null);
      } finally {
        await host.stop();
      }
    });

  it('does not grant native parser capabilities to a plugin with the same name or marker', async () => {
    const application = new ApplicationRuntime(owner(), []);
    const impersonator = async function nativeBodyParserPlugin(app: any) {
      app.decorateRequest('secret', true);
    };
    Object.defineProperty(impersonator, Symbol.for('skip-override'), { value: true });
    const host = new FastifyHost(application, {
      hostname: '127.0.0.1',
      port: 0,
      prepare: async app => {
        app.register(impersonator);
      },
    });
    try {
      await assert.rejects(host.initialize(), /preparation rejects decorateRequest/);
    } finally {
      await host.stop();
    }
  });

  for (const [path, status] of [
    ['/RAW', 200],
    ['/raw/item', 200],
    ['/raw-other', 400],
  ] as const)
    it(`keeps raw parser exclusions case-insensitive and segment-bounded: ${path}`, async () => {
      const r = route(path, 'post');
      const f = await securityFixture(true, {
        routes: [{ ...r, declaration: { ...r.declaration, access: { kind: 'public' } } }],
        rawPrefixes: ['/portal/raw'],
        action: (req, reply) => reply.send({ unparsed: req.body === undefined, remaining: req.raw.readableLength }),
      });
      try {
        const result = await fetch(f.url + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"password":"body-secret",',
        });
        assert.equal(result.status, status);
        const body = (await result.json()) as any;
        if (status === 200) assert.equal(body.unparsed, true);
        else assert(!JSON.stringify(body).includes('body-secret'));
      } finally {
        await f.close();
      }
    });

  for (const encoding of ['identity', 'gzip'])
    it(`retains an in-flight ${encoding} parser through stop and disconnect`, async () => {
      const own = owner(),
        entered = Promise.withResolvers<void>();
      let closed = 0,
        actions = 0;
      const application = new ApplicationRuntime(own, [
        {
          name: 'borrowed',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closed++;
            },
          }),
        },
      ]);
      const host = new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        prepare: async app => {
          installSafeHttpErrors(app);
          app.addHook('preParsing', async () => {
            assert(hasActiveHttpRequest(own));
            assert(hasActivePersistenceWork(own));
            entered.resolve();
          });
          prepareNativeParsers(app);
          app.post('/probe', async () => {
            actions++;
            return {};
          });
        },
      });
      await host.initialize();
      await host.activate();
      const client = request({
        hostname: '127.0.0.1',
        port: host.address()!.port,
        path: '/probe',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': encoding, 'Transfer-Encoding': 'chunked' },
      });
      client.on('error', () => {});
      try {
        client.write(encoding === 'gzip' ? Buffer.from([0x1f, 0x8b, 0x08, 0x00]) : '{"password":"');
        await entered.promise;
        await turn();
        await assert.rejects(host.stop({ deadlineMs: 30 }), /deadline/);
        assert.equal(closed, 0);
        assert.equal(application.status().cleanupPending, true);
        client.destroy();
        await host.stop({ deadlineMs: 2000 });
        assert.equal(actions, 0);
        assert.equal(closed, 1);
        assert.equal(hasActiveHttpRequest(own), false);
      } finally {
        client.destroy();
        await host.stop({ deadlineMs: 2000 });
      }
    });

  it('retains response observations after bytes are sent and isolates their eventual rejection', async () => {
    const entered = Promise.withResolvers<void>(),
      held = Promise.withResolvers<void>();
    const r = route('/public', 'get');
    const f = await securityFixture(true, {
      routes: [{ ...r, declaration: { ...r.declaration, access: { kind: 'public' } } }],
      observers: {
        observe: async event => {
          if (event.phase === 'response') {
            entered.resolve();
            await held.promise;
            throw new Error('observer-secret');
          }
        },
        log: () => {
          throw new Error('logger-secret');
        },
      },
    });
    try {
      const response = await fetch(f.url + '/public');
      assert.equal(response.status, 200);
      await response.text();
      await entered.promise;
      await assert.rejects(f.host.stop({ deadlineMs: 30 }), /deadline/);
      assert.equal(f.host.status().stopped, false);
      held.resolve();
      await f.host.stop();
      assert.equal(f.host.status().stopped, true);
    } finally {
      held.resolve();
      await f.close();
    }
  });

  for (const mode of ['policy', 'csrf', 'allow'] as const)
    it(`binds ${mode} before extra guards and raw response publication in controller composition`, async () => {
      const application = new ApplicationRuntime(owner(), []),
        trace: string[] = [];
      const factory = defineController({
        name: 'SecurityProbe',
        actions: ['probe'],
        create: () => ({
          probe: async (_req: any, reply: any) => {
            trace.push('action');
            reply.hijack();
            reply.raw.writeHead(200);
            reply.raw.end('raw');
          },
        }),
      });
      const r = route('/probe');
      const host = await createControllerHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        controllers: [{ provider: 'core', declaration: factory }],
        bindings: [bindControllerFactory(factory, undefined)],
        routes: [
          {
            ...r,
            effectiveCsrf: mode === 'csrf' ? 'protect' : 'none',
            declaration: { ...r.declaration, controller: factory.name, access: { kind: 'policies', names: ['guard'] } },
          },
        ],
        routing: { policyNames: ['guard'] },
        guards: async () => {
          trace.push('extra');
        },
        security: {
          policies: {
            guard: async (_req, reply) => {
              trace.push('policy');
              if (mode === 'policy') reply.code(403).send();
            },
          },
          csrf: createNativeCsrf({ origins: [canonical] }),
        },
      });
      try {
        await host.initialize();
        await host.activate();
        const response = await fetch(`http://127.0.0.1:${host.address()!.port}/probe`, { method: 'POST' });
        assert.equal(response.status, mode === 'allow' ? 200 : 403);
        const body = await response.text();
        assert.deepEqual(trace, mode === 'allow' ? ['policy', 'extra', 'action'] : ['policy']);
        if (mode === 'allow') assert.equal(body, 'raw');
      } finally {
        await host.stop();
      }
    });

  it('rejects a protected route without security before acquiring application modules', async () => {
    let acquired = 0;
    const application = new ApplicationRuntime(owner(), [
      {
        name: 'borrowed',
        create: () => {
          acquired++;
          return { initialize: async () => {}, close: async () => {} };
        },
      },
    ]);
    await assert.rejects(
      createControllerHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        controllers: [],
        bindings: [],
        routes: [route()],
        routing: {
          policyNames: ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'],
        },
      }),
      /require native security/
    );
    assert.equal(acquired, 0);
  });
});

describe('FM-016 reply completion observer failures', function () {
  this.timeout(10000);
  for (const asyncFailure of [false, true])
    it(`isolates ${asyncFailure ? 'async' : 'sync'} callback and logger failures without retaining secrets`, async () => {
      const application = new ApplicationRuntime(owner(), []),
        logged = Promise.withResolvers<void>(),
        messages: unknown[] = [];
      const host = new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        logger: record => {
          if (record.code !== 'HTTP_REPLY_CALLBACK_FAILED') return;
          messages.push(record);
          logged.resolve();
          throw new Error('logger-secret');
        },
        prepare: async app => {
          app.get('/probe', (_req, reply) => {
            const fail = () => {
              throw new Error('callback-secret password=credential-secret');
            };
            reply.then(asyncFailure ? async () => fail() : fail, fail);
            reply.send('safe');
          });
        },
      });
      try {
        await host.initialize();
        await host.activate();
        const response = await fetch(`http://127.0.0.1:${host.address()!.port}/probe`);
        assert.equal(await response.text(), 'safe');
        await logged.promise;
        await host.stop();
        assert.deepEqual(messages, [{ code: 'HTTP_REPLY_CALLBACK_FAILED', level: 'error' }]);
      } finally {
        await host.stop();
      }
    });
});

describe('FM-016 public-only composition safety', function () {
  this.timeout(10000);
  for (const malformed of [false, true])
    it(`sanitizes ${malformed ? 'parser' : 'domain'} failure without optional security bindings or fabricated context`, async () => {
      const application = new ApplicationRuntime(owner(), []);
      let actions = 0;
      const factory = defineController({
        name: 'PublicFailureProbe',
        actions: ['probe'],
        create: () => ({
          probe: async (req: any) => {
            actions++;
            assert.throws(() => requestContext(req), /not been resolved/);
            throw Object.assign(new Error('provider-secret password=credential-secret'), {
              status: 200,
              body: 'body-secret',
            });
          },
        }),
      });
      const r = route('/public');
      const host = await createControllerHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        controllers: [{ provider: 'core', declaration: factory }],
        bindings: [bindControllerFactory(factory, undefined)],
        routes: [{ ...r, declaration: { ...r.declaration, controller: factory.name, access: { kind: 'public' } } }],
        routing: { policyNames: [] },
      });
      try {
        await host.initialize();
        await host.activate();
        const response = await fetch(`http://127.0.0.1:${host.address()!.port}/public`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: malformed ? '{"password":"body-secret",' : '{}',
        });
        assert.equal(response.status, malformed ? 400 : 500);
        assert.deepEqual(await response.json(), {
          message: malformed ? 'Invalid request' : 'Internal server error',
          details: '',
        });
        assert.equal(actions, malformed ? 0 : 1);
      } finally {
        await host.stop();
      }
    });
});

// Submission is terminal while asynchronous send hooks still own the response.
describe('FM-016 denial submission with delayed async send', function () {
  this.timeout(10000);
  const cases = [
    { name: 'default deny', access: 'deny', status: 403 },
    { name: 'missing brand', path: '/missing/rdmp/api/probe/ok', policies: ['brandingandportal'], status: 404 },
    { name: 'invalid brand', path: '/bad!/rdmp/api/probe/ok', policies: ['brandingandportal'], status: 404 },
    { name: 'invalid portal', path: '/default/missing/api/probe/ok', policies: ['brandingandportal'], status: 404 },
    { name: 'bearer missing', policies: ['brandingandportal', 'iswebserviceauthenticated'], status: 401 },
    { name: 'bearer invalid', token: 'bad', policies: ['brandingandportal', 'iswebserviceauthenticated'], status: 401 },
    {
      name: 'foreign actor',
      token: 'foreign',
      policies: ['brandingandportal', 'iswebserviceauthenticated', 'brandactor'],
      status: 403,
    },
    { name: 'browser session required', policies: ['brandingandportal', 'browserauthenticated'], status: 302 },
    { name: 'actor role denied', token: 'good', policies: ['brandingandportal', 'checkauth'], status: 403 },
    { name: 'guest JSON role denied', policies: ['brandingandportal', 'checkauth'], status: 403 },
    { name: 'guest browser redirect', type: 'text/plain', policies: ['brandingandportal', 'checkauth'], status: 302 },
    {
      name: 'schema missing brand',
      schema: true,
      path: '/missing/rdmp/api/records/schemas/ok',
      policies: ['brandingandportal'],
      status: 404,
    },
    {
      name: 'schema bearer missing',
      schema: true,
      policies: ['brandingandportal', 'iswebserviceauthenticated'],
      status: 401,
    },
    {
      name: 'schema role denied',
      schema: true,
      token: 'good',
      policies: ['brandingandportal', 'checkrecordschemaauth'],
      status: 403,
    },
    { name: 'CSRF token', csrf: 'protect', status: 403 },
    { name: 'CSRF origin', csrf: 'protect', origin: 'https://foreign.invalid', status: 403 },
    { name: 'API CSRF invalid bearer', csrf: 'apiProtect', token: 'bad', status: 403 },
    { name: 'API CSRF origin', csrf: 'apiProtect', origin: 'https://foreign.invalid', status: 403 },
    {
      name: 'CSRF issuance origin',
      csrf: 'canonical-origin; generate and await session save',
      origin: 'https://foreign.invalid',
      status: 403,
    },
    { name: 'validation', validation: true, status: 400 },
    { name: 'malformed JSON', body: '{', status: 400, bypass: true },
    { name: 'unsupported JSON charset', type: 'application/json; charset=latin1', status: 415, bypass: true },
    { name: 'oversized JSON', body: JSON.stringify({ x: 'x'.repeat(1024 * 1024) }), status: 413, bypass: true },
    { name: 'malformed capture', path: '/default/rdmp/api/probe/%ZZ', status: 400 },
    { name: 'malformed capture method miss', method: 'DELETE', path: '/default/rdmp/api/probe/%ZZ', status: 400 },
    { name: 'generated HEAD denial', method: 'HEAD', head: true, status: 405, before: 1 },
    { name: 'normal 404', path: '/missing-route', status: 404 },
    { name: 'admission', activate: false, status: 503, bypass: true },
    { name: 'health probe', path: '/healthz', method: 'GET', status: 200, bypass: true },
    { name: 'readiness probe', path: '/readyz', method: 'GET', status: 200, bypass: true },
    { name: 'domain error writer', fault: true, status: 500, bypass: true },
    { name: 'void-returning guard', voidGuard: true, status: 403 },
    ...['onRequest', 'preValidation', 'preHandler'].map(hook => ({
      name: `${hook} callback error after submission`,
      hook,
      callback: true,
      callbackError: true,
      status: 500,
    })),
    ...['onRequest', 'preValidation', 'preHandler'].flatMap(hook =>
      [false, true].map(callback => ({
        name: `${hook} ${callback ? 'callback' : 'async'} send without return`,
        hook,
        callback,
        status: 403,
      }))
    ),
  ] as const;
  for (const item of cases)
    it(`${item.name}: no guard/action after submission and no duplicate response`, async () => {
      const c: any = item;
      const entered = Promise.withResolvers<void>(),
        held = Promise.withResolvers<void>();
      const logs: any[] = [];
      let actions = 0,
        additional = 0,
        afterPolicy = 0,
        sends = 0;
      const own = owner();
      const brand = { id: 'default-id', name: 'default' };
      const policies = createNativePolicies({
        branding: { getBrand: async ({ name }: any) => (name === 'default' ? brand : null) } as any,
        portals: ['rdmp'],
        pathRules: { getRulesFromPath: () => [{}], canRead: () => false } as any,
        defaultUnauthenticatedRole: () => undefined,
        authenticate: async req =>
          req.headers.authorization === 'Bearer good'
            ? {
                id: 'user',
                username: 'user',
                type: 'local',
                roles: [{ id: 'admin', name: 'Admin', brandId: brand.id }],
              }
            : req.headers.authorization === 'Bearer foreign'
              ? {
                  id: 'foreign',
                  username: 'foreign',
                  type: 'local',
                  roles: [{ id: 'other-admin', name: 'Admin', brandId: 'other' }],
                }
              : false,
        emitRequestFailure: async () => {},
      });
      const factory = defineController({
        name: 'Probe',
        actions: ['probe'],
        create: (_: undefined) => ({
          probe() {
            actions++;
            return {};
          },
        }),
      });
      const path = c.schema ? '/:branding/:portal/api/records/schemas/:key' : '/:branding/:portal/api/probe/:key';
      const host = await createControllerHost(new ApplicationRuntime(own, []), {
        hostname: '127.0.0.1',
        port: 0,
        logger: record => {
          logs.push(record);
        },
        controllers: [{ provider: 'fm016', declaration: factory }],
        bindings: [bindControllerFactory(factory, undefined)],
        routes: [
          {
            provider: 'fm016',
            declaration: {
              name: 'fm016.slow-denial',
              path,
              method: 'get',
              controller: 'Probe',
              action: 'probe',
              access:
                c.access === 'deny'
                  ? { kind: 'deny' }
                  : c.policies
                    ? { kind: 'policies', names: c.policies }
                    : { kind: 'public' },
              ...(c.head ? { head: { kind: 'deny', allow: 'GET' } } : {}),
            },
            effectivePolicies: c.access === 'deny' ? [false, 'after'] : c.policies ? [...c.policies, 'after'] : [],
            ...(c.csrf ? { effectiveCsrf: c.csrf } : {}),
          },
        ],
        routing: { policyNames: [...Object.keys(policies), 'after'] },
        security: {
          policies: {
            ...policies,
            after: async () => {
              afterPolicy++;
            },
          },
          csrf: createNativeCsrf({ origins: [canonical], authenticateBearer: async () => false }),
          prepare: async app => {
            if (c.hook)
              app.addHook(
                c.hook,
                c.callback
                  ? (_req: any, reply: any, done: any) => {
                      reply.code(403).send();
                      done(c.callbackError ? new Error('hook-secret') : undefined);
                    }
                  : async (_req: any, reply: any) => {
                      reply.code(403).send();
                    }
              );
            app.addHook('onSend', async (_req, _reply, payload) => {
              sends++;
              entered.resolve();
              await held.promise;
              return payload;
            });
          },
        },
        guards: async (_binding, req, reply) => {
          if (c.validation) {
            const valid = await validateRouteRequest(req, reply, {
              method: 'get',
              path,
              controller: 'Probe',
              action: 'probe',
              request: { query: z.object({ required: z.string() }) },
            });
            if (!valid) return reply;
          }
          if (c.fault) throw new Error('domain-secret');
          if (c.voidGuard) {
            reply.code(403).send();
            return;
          }
          additional++;
        },
      });
      try {
        await host.initialize();
        if (c.activate !== false) await host.activate();
        const response = rawRequest(
          `http://127.0.0.1:${host.address()!.port}` +
            (c.path ?? (c.schema ? '/default/rdmp/api/records/schemas/ok' : '/default/rdmp/api/probe/ok')),
          c.method ?? 'GET',
          c.type ?? 'application/json',
          c.body ?? '{}',
          {
            ...(c.token ? { Authorization: 'Bearer ' + c.token } : {}),
            ...(c.origin ? { Origin: c.origin } : {}),
          }
        );
        if (!c.bypass) {
          await sendStarted(entered.promise);
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(additional, c.before ?? 0, 'only FM-004 guards before a HEAD method denial may run');
        assert.equal(afterPolicy, 0);
        assert.equal(actions, 0);
        held.resolve();
        const result = await response;
        assert.equal(result.status, c.status);
        assert(!JSON.stringify([result, logs]).includes('secret'));
        await turn();
        assert.equal(additional, c.before ?? 0);
        assert.equal(actions, 0);
        assert.equal(sends, c.bypass ? 0 : 1);
        assert(!logs.some(record => record.code === 'HTTP_DUPLICATE_SEND'));
      } finally {
        held.resolve();
        await host.stop();
      }
    });
});

describe('FM-016 authentication early termination with delayed send', function () {
  this.timeout(10000);
  const cases = [
    { name: 'invalid login context', path: '/user/login_local?branding=missing', body: '{}', status: 400 },
    { name: 'invalid local credentials', path: '/user/login_local', body: '{}', status: 400 },
    {
      name: 'rejected local credentials',
      path: '/user/login_local',
      body: '{"username":"user","password":"credential-secret"}',
      status: 200,
    },
    { name: 'invalid AAF assertion', path: '/user/login_aaf', body: '{}', status: 400 },
    { name: 'rejected AAF assertion', path: '/user/login_aaf', body: '{"assertion":"credential-secret"}', status: 403 },
    {
      name: 'rendered AAF failure',
      path: '/user/login_aaf',
      body: '{"assertion":"credential-secret"}',
      html: true,
      status: 403,
    },
    { name: 'OIDC context', path: '/user/begin_oidc?branding=missing', method: 'GET', status: 400 },
    { name: 'OIDC HEAD', path: '/user/begin_oidc', method: 'HEAD', status: 405 },
    { name: 'anonymous info', path: '/user/info', method: 'GET', status: 403 },
    { name: 'foreign info', path: '/default/rdmp/user/info', method: 'GET', foreign: true, status: 403 },
    { name: 'invalid logout context', path: '/missing/rdmp/user/logout', status: 400 },
    { name: 'anonymous logout', path: '/default/rdmp/user/logout', status: 403 },
    { name: 'foreign logout', path: '/default/rdmp/user/logout', foreign: true, status: 403 },
    { name: 'logout GET', path: '/default/rdmp/user/logout', method: 'GET', status: 405 },
    { name: 'logout HEAD', path: '/default/rdmp/user/logout', method: 'HEAD', status: 405 },
    { name: 'local CSRF', path: '/user/login_local', csrf: true, status: 403 },
    { name: 'logout CSRF', path: '/default/rdmp/user/logout', csrf: true, status: 403 },
  ] as const;
  for (const item of cases)
    it(`${item.name}: no downstream authentication effects or second send`, async () => {
      const c: any = item;
      const entered = Promise.withResolvers<void>(),
        held = Promise.withResolvers<void>();
      const logs: any[] = [];
      let effects = 0,
        sends = 0;
      const { installNativeAuthenticationRoutes } = require('../../../src/http/fastify/authentication');
      const host = new FastifyHost(new ApplicationRuntime(owner(), []), {
        hostname: '127.0.0.1',
        port: 0,
        logger: record => {
          logs.push(record);
        },
        prepare: async app => {
          prepareNativeParsers(app);
          app.addHook('onRequest', async req => {
            req.session = {
              get: () => undefined,
              set: () => {
                effects++;
              },
              save: async () => {
                effects++;
              },
            } as any;
          });
          app.addHook('onSend', async (_req, _reply, payload) => {
            sends++;
            entered.resolve();
            await held.promise;
            return payload;
          });
          installNativeAuthenticationRoutes(
            app,
            {
              accounts: { authenticateLocal: async () => false },
              providers: { aaf: async () => false },
              actor: () => undefined,
            },
            {
              identity: {
                session: async () => (c.foreign ? { id: 'foreign', roles: [{ brandId: 'other' }] } : false),
                profile: async () => {
                  effects++;
                },
              },
              defaultBrand: 'default',
              defaultPortal: 'rdmp',
              validContext: (brand: string, portal: string) => brand === 'default' && portal === 'rdmp',
              brandId: () => 'default',
              postLoginPath: () => '/',
              audit: async () => {
                effects++;
              },
              loginFailure: async () => {},
              csrf: c.csrf ? createNativeCsrf({ origins: [canonical] }).protect : async () => {},
              ...(c.html
                ? {
                    renderAuthenticationFailure: async (_req: any, reply: any) => {
                      // Test the collaborator's void-returning shape as well as its caller.
                      reply.code(403).type('text/html').send('<p>Denied</p>');
                    },
                  }
                : {}),
            }
          );
        },
      });
      try {
        await host.initialize();
        await host.activate();
        const response = rawRequest(
          `http://127.0.0.1:${host.address()!.port}` + c.path,
          c.method ?? 'POST',
          'application/json',
          c.body ?? '{}',
          c.html ? { Accept: 'text/html' } : {}
        );
        void response.catch(() => {});
        await sendStarted(entered.promise);
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(effects, 0);
        assert.equal(sends, 1);
        held.resolve();
        assert.equal((await response).status, c.status);
        await turn();
        assert.equal(effects, 0);
        assert.equal(sends, 1);
        assert(!logs.some(record => record.code === 'HTTP_DUPLICATE_SEND'));
      } finally {
        held.resolve();
        await host.stop();
      }
    });
});
