import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { once } from 'node:events';
import { Agent, request, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import { Readable, type Duplex } from 'node:stream';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { MongoClient } from 'mongodb';
import { Response as UndiciResponse } from 'undici';
import sinon from 'sinon';
import { ApplicationRuntime, type ApplicationModuleFactory } from '../../../dist/application';
// Compile the internal capability controls without executing their declarations.
import type {} from './fixtures/preparation.types';
import type { FastifyPreparation } from '../../../dist/http/fastify/preparation';
import { defineController, bindControllerFactory } from '../../../dist/http';
import { composeControllers } from '../../../dist/http/fastify/registration';
import { composeRoutes } from '../../../dist/http/fastify/routes';
import { createPortalRouter } from '../../../dist/http/fastify/router';
import { sealPreparation } from '../../../dist/http/fastify/preparation';
import { requestOwnership } from '../../../dist/http/fastify/requestOwnership';
import { FastifyHost, type FastifyHostOptions } from '../../../dist/http/fastify/FastifyHost';
import {
  hasActiveHttpRequest,
  retainHttpRequestFollowup,
  trackHttpRequestWork,
} from '../../../dist/middleware/requestLifetime';
import {
  hasActivePersistenceWork,
  mongoResourceDatabase,
  mongoDatabase,
  persistenceOperation,
  persistenceStatus,
} from '../../../dist/persistence/runtime';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const privateContext: symbol = require('fastify/lib/symbols').kRouteContext;
const publicAccess = ['property', 'descriptor', 'reflect', 'destructure', 'spread'] as const;
const payloadKinds = [
  'string',
  'buffer',
  'typed-array',
  'data-view',
  'buffer-like',
  'array-buffer',
  'object',
  'null',
  'async-iterable',
  'node-stream',
  'stream-like',
  'resume-only',
  'web-stream',
  'response',
  'undici-response',
] as const;
const streamKinds = ['node-stream', 'stream-like', 'resume-only', 'web-stream', 'response', 'undici-response'] as const;
const payloadEntries = [
  'send',
  'handler',
  'handler-promise',
  'onSend-promise',
  'onSend-callback',
  'route-onSend-promise',
  'route-onSend-callback',
  'preSerialization-promise',
  'preSerialization-callback',
  'route-preSerialization-promise',
  'route-preSerialization-callback',
  'error-handler',
  'error-handler-promise',
  'route-error',
  'route-error-promise',
  'not-found',
  'not-found-promise',
  'serializer',
  'serializer-promise',
  'serialize-helper',
] as const;
type PayloadKind = (typeof payloadKinds)[number];
type PayloadEntry = (typeof payloadEntries)[number];
function payloadFixture(kind: PayloadKind, read: () => void = () => {}) {
  let reads = 0;
  const pulled = () => {
    reads++;
    read();
  };
  const bytes = Uint8Array.from([0, ...Buffer.from('payload'), 0]);
  const source = new Readable({
    read() {
      pulled();
      this.push('payload');
      this.push(null);
    },
  });
  // Zero prefetch: construction is not a producer acquisition. The forbidden
  // Fastify consumer must never invoke pull, including after peer disconnect.
  const web = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled();
        controller.enqueue(Buffer.from('payload'));
        controller.close();
      },
    },
    { highWaterMark: 0 }
  );
  const values: Record<PayloadKind, () => unknown> = {
    string: () => 'payload',
    buffer: () => Buffer.from('payload'),
    'typed-array': () => new Uint8Array(bytes.buffer, 1, 7),
    'data-view': () => new DataView(bytes.buffer, 1, 7),
    'buffer-like': () => ({ buffer: bytes.buffer, byteOffset: 1, byteLength: 7 }),
    'array-buffer': () => bytes.buffer,
    object: () => ({ value: 'payload' }),
    null: () => null,
    'async-iterable': () => ({
      async *[Symbol.asyncIterator]() {
        pulled();
        yield 'payload';
      },
    }),
    'node-stream': () => source,
    'resume-only': () => ({
      on() {
        return this;
      },
      resume() {
        pulled();
        return this;
      },
    }),
    // A duck-typed stream with no Readable prototype, forwarding native methods.
    'stream-like': () =>
      new Proxy(
        {},
        {
          get(_target, key) {
            const value = Reflect.get(source, key, source);
            return typeof value === 'function' ? value.bind(source) : value;
          },
        }
      ),
    'web-stream': () => web,
    response: () => new Response(web),
    // Node and undici declare the same WHATWG body protocol through separate types.
    'undici-response': () => new UndiciResponse(web as unknown as ConstructorParameters<typeof UndiciResponse>[0]),
  };
  return {
    value: values[kind](),
    reads: () => reads,
    async close() {
      source.destroy();
      if (!web.locked) await web.cancel();
    },
  };
}
function installPayload(app: FastifyPreparation, entry: PayloadEntry, produce: () => unknown) {
  app.register(
    async stage => {
      const returns = entry.endsWith('-promise') ? async () => produce() : () => produce();
      const trigger = () => {
        throw new Error('payload matrix trigger');
      };
      const hookName = entry.includes('onSend') ? 'onSend' : 'preSerialization';
      if (entry.includes('onSend') || entry.includes('preSerialization')) {
        let used = false;
        const hook = entry.endsWith('-callback')
          ? (
              _request: FastifyRequest,
              _reply: FastifyReply,
              payload: unknown,
              done: (error: unknown, value?: unknown) => void
            ) => {
              if (used) return done(null, payload);
              used = true;
              void Promise.resolve()
                .then(produce)
                .then(value => {
                  // Native callback continuations may throw for invalid payloads.
                  try {
                    done(null, value);
                  } catch (error) {
                    done(error);
                  }
                }, done);
            }
          : async (_request: FastifyRequest, _reply: FastifyReply, payload: unknown) => {
              if (used) return payload;
              used = true;
              return produce();
            };
        if (!entry.startsWith('route-')) Reflect.apply(stage.addHook, stage, [hookName, hook]);
        stage.route({
          method: 'GET',
          url: '/probe',
          handler: () => ({ trigger: true }),
          ...(entry.startsWith('route-') ? { [hookName]: hook } : {}),
        });
      } else if (entry.startsWith('not-found')) stage.setNotFoundHandler(returns);
      else if (entry.startsWith('error-handler')) {
        stage.setErrorHandler(returns);
        stage.get('/probe', trigger);
      } else if (entry.startsWith('route-error')) stage.get('/probe', { errorHandler: returns }, trigger);
      else if (entry.startsWith('serializer') || entry === 'serialize-helper')
        stage.get('/probe', (_request, reply) => {
          reply.serializer(returns as (value: unknown) => string);
          return entry === 'serialize-helper' ? reply.serialize({ trigger: true }) : { trigger: true };
        });
      else if (entry === 'send') stage.get('/probe', async (_request, reply) => reply.send(await produce()));
      else stage.get('/probe', returns);
    },
    { prefix: '/matrix' }
  );
}
function installDiscardPayload(
  app: FastifyPreparation,
  mode: '204' | 'head',
  scope: 'plugin' | 'route',
  completion: 'promise' | 'callback',
  produce: () => unknown
) {
  app.register(async stage => {
    let used = false;
    const hook =
      completion === 'promise'
        ? async (_request: FastifyRequest, _reply: FastifyReply, payload: unknown) => {
            if (used) return payload;
            used = true;
            return produce();
          }
        : (
            _request: FastifyRequest,
            _reply: FastifyReply,
            payload: unknown,
            done: (error: unknown, value?: unknown) => void
          ) => {
            if (used) return done(null, payload);
            used = true;
            void Promise.resolve()
              .then(produce)
              .then(value => {
                try {
                  done(null, value);
                } catch (error) {
                  done(error);
                }
              }, done);
          };
    if (scope === 'plugin') Reflect.apply(stage.addHook, stage, ['onSend', hook]);
    stage.get(
      '/probe',
      {
        exposeHeadRoute: true,
        ...(scope === 'route' ? { onSend: hook } : {}),
      },
      (_request, reply) => {
        if (mode === '204') reply.code(204);
        return 'original';
      }
    );
  });
}
const mutateData = (req: FastifyRequest) => {
  const body = req.body as { items: number[]; remove?: boolean; extra?: boolean };
  const removed = body.items.pop();
  delete body.remove;
  delete req.headers['x-delete-me'];
  assert(
    req.validateInput(body, {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'integer' } } },
      additionalProperties: false,
    })
  );
  return { body, removed, keys: Object.keys(body), header: req.headers['x-delete-me'] ?? null };
};
const omittedCallbacks: [string, (req: FastifyRequest, reply: FastifyReply, fn: () => void) => unknown][] = [
  ['writeEarlyHints(callback)', (_req, reply, fn) => reply.writeEarlyHints({ link: '</x>; rel=preload' }, fn)],
  [
    'getDecorator(writeEarlyHints)(callback)',
    (_req, reply, fn) =>
      reply.getDecorator<FastifyReply['writeEarlyHints']>('writeEarlyHints')({ link: '</x>; rel=preload' }, fn),
  ],
  ...['on', 'once', 'addListener', 'prependListener', 'prependOnceListener'].map(
    name =>
      [
        `raw.${name}`,
        (req: FastifyRequest, _reply: FastifyReply, fn: () => void) =>
          Reflect.apply(Reflect.get(req.raw, name), req.raw, ['close', fn]),
      ] as [string, (req: FastifyRequest, reply: FastifyReply, fn: () => void) => unknown]
  ),
  ['raw.pipe', (req, reply) => req.raw.pipe(reply.raw)],
  ['raw.asyncIterator', req => Reflect.get(req.raw, Symbol.asyncIterator)()],
  ['raw.write(callback)', (_req, reply, fn) => reply.raw.write('x', fn)],
  ['raw.end(callback)', (_req, reply, fn) => reply.raw.end('x', fn)],
  ['signal.addEventListener', (req, _reply, fn) => req.signal.addEventListener('abort', fn)],
  [
    'signal.onabort',
    (req, _reply, fn) => {
      req.signal.onabort = fn;
    },
  ],
];
function publicRead(value: object, key: string, access: (typeof publicAccess)[number]) {
  const object = value as Record<string, unknown>;
  if (access === 'descriptor') {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
    return descriptor.get ? descriptor.get.call(object) : descriptor.value;
  }
  if (access === 'reflect') return Reflect.get(object, key);
  if (access === 'destructure') {
    const { [key]: value } = object;
    return value;
  }
  if (access === 'spread') return { ...object }[key];
  return object[key];
}

function exchange(
  port: number,
  path = '/probe',
  agent: Agent | false = false,
  payload?: unknown,
  method = payload === undefined ? 'GET' : 'POST'
) {
  const response = Promise.withResolvers<{ status: number; body: string }>();
  const client = request(
    {
      hostname: '127.0.0.1',
      port,
      path,
      agent,
      method,
      headers: payload === undefined ? {} : { 'content-type': 'application/json', 'x-delete-me': 'value' },
    },
    incoming => {
      let body = '';
      incoming.on('data', chunk => (body += chunk));
      incoming.on('error', response.reject);
      incoming.on('end', () => response.resolve({ status: incoming.statusCode!, body }));
    }
  );
  client.setTimeout(2000, () => client.destroy(new Error('Close fixture request timed out')));
  client.on('error', response.reject);
  client.end(payload === undefined ? undefined : JSON.stringify(payload));
  // Disconnect cases deliberately reject; attach an observer immediately.
  void response.promise.catch(() => {});
  return { client, response: response.promise };
}

describe('Fastify close ownership and cleanup retry (FM-012)', function () {
  this.timeout(5000);
  const releases: (() => void)[] = [];
  const cleanups: (() => Promise<unknown>)[] = [];
  function barrier() {
    const value = Promise.withResolvers<void>();
    releases.push(value.resolve);
    return value;
  }
  beforeEach(() => {
    // Real MongoClient and runtime pool ownership, with only network acquisition
    // controlled. No database service is claimed by this lifecycle proof.
    sinon.stub(MongoClient.prototype, 'connect').resolvesThis();
  });
  afterEach(async () => {
    for (const release of releases.splice(0)) release();
    try {
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    } finally {
      sinon.restore();
    }
  });
  function fixture(
    prepare: FastifyHostOptions['prepare'] = async app => {
      app.get('/probe', async () => ({ ok: true }));
    },
    modules: ApplicationModuleFactory[] = [],
    owned = true
  ) {
    const owner = { config: {}, log: { warn() {} } };
    const application = new ApplicationRuntime(owner, modules);
    const host = new FastifyHost(application, {
      hostname: '127.0.0.1',
      port: 0,
      owner: owned ? owner : undefined,
      prepare,
    });
    let expectedFailure: unknown;
    cleanups.push(async () => {
      if (expectedFailure) await assert.rejects(host.stop({ deadlineMs: 2000 }), expectedFailure);
      else await host.stop({ deadlineMs: 2000 });
    });
    return {
      owner,
      application,
      host,
      expectFailure: (error: unknown) => {
        expectedFailure = error;
      },
    };
  }
  async function start(host: FastifyHost) {
    await host.initialize();
    await host.activate();
    return host.address()!.port;
  }
  function client(port: number, path = '/probe') {
    const result = exchange(port, path);
    cleanups.push(async () => {
      result.client.destroy();
    });
    return result;
  }
  async function socket(port: number) {
    const value = connect({ host: '127.0.0.1', port });
    value.setTimeout(2000, () => value.destroy(new Error('Close fixture socket timed out')));
    value.on('error', () => {});
    cleanups.push(async () => {
      if (!value.closed) {
        const closed = new Promise<void>(resolve => value.once('close', () => resolve()));
        value.destroy();
        await closed;
      }
    });
    await once(value, 'connect');
    return value;
  }

  const rejectedSurfaces: [string, (app: FastifyPreparation) => unknown][] = [
    ...[
      'setSchemaController',
      'setValidatorCompiler',
      'setSerializerCompiler',
      'setReplySerializer',
      'setSchemaErrorFormatter',
      'setChildLoggerFactory',
      'setGenReqId',
      'addSchema',
      'after',
      'ready',
      'listen',
      'close',
      'inject',
      'routing',
      'decorate',
      'decorateRequest',
      'decorateReply',
      'withTypeProvider',
      'unknownFutureAPI',
    ].map(
      name =>
        [name, (app: FastifyPreparation) => Reflect.apply(Reflect.get(app, name), app, [() => {}])] as [
          string,
          (app: FastifyPreparation) => unknown,
        ]
    ),
    ...['onListen', 'onRoute', 'onRegister', 'unknownHook'].map(
      name =>
        [`addHook(${name})`, (app: FastifyPreparation) => Reflect.apply(app.addHook, app, [name, async () => {}])] as [
          string,
          (app: FastifyPreparation) => unknown,
        ]
    ),
    ...['validatorCompiler', 'serializerCompiler', 'schemaErrorFormatter', 'childLoggerFactory', 'logSerializers'].map(
      name =>
        [
          `route.${name}`,
          (app: FastifyPreparation) =>
            app.route({ method: 'GET', url: '/unsafe', handler: async () => 'ok', [name]: () => {} }),
        ] as [string, (app: FastifyPreparation) => unknown]
    ),
    [
      'addConstraintStrategy(async)',
      app =>
        Reflect.get(
          app,
          'addConstraintStrategy'
        )({
          name: 'async',
          storage: () => new Map(),
          deriveConstraint: async () => 'value',
        }),
    ],
    [
      'addConstraintStrategy(callback)',
      app =>
        Reflect.get(
          app,
          'addConstraintStrategy'
        )({
          name: 'callback',
          storage: () => new Map(),
          deriveConstraint(_req: unknown, _ctx: unknown, done: Function) {
            done(null, 'value');
          },
        }),
    ],
    [
      'register options',
      app => app.register(async () => {}, { prefix: '/', ...{ logSerializers: { req: async () => {} } } }),
    ],
    ['register function options', app => Reflect.apply(app.register, app, [async () => {}, () => ({})])],
    [
      'route.constraints',
      app => app.route({ method: 'GET', url: '/', constraints: { unqualified: 'value' }, handler: async () => 'ok' }),
    ],
    ['replace API', app => Reflect.set(app, 'route', () => {})],
    ['replace prototype', app => Reflect.setPrototypeOf(app, {})],
    ['define decorator', app => Object.defineProperty(app, 'send', { value: () => {} })],
  ];
  for (const scope of ['root', 'plugin'] as const)
    for (const [name, register] of rejectedSurfaces) {
      it(`rejects unqualified ${scope} ${name} before listening`, async () => {
        let closes = 0;
        const f = fixture(
          async app => {
            if (scope === 'root') register(app);
            else
              app.register(async child => {
                register(child);
              });
          },
          [
            {
              name: 'dependency',
              create: () => ({
                initialize: async () => {},
                close: async () => {
                  closes++;
                },
              }),
            },
          ]
        );
        await assert.rejects(f.host.initialize(), /Fastify preparation rejects/);
        assert.equal(f.host.address(), null);
        await f.host.stop();
        await f.host.stop();
        assert.equal(closes, 1);
      });
    }

  it('keeps raw instances out of plugins, receivers, request/reply server and fluent/await results', async () => {
    const f = fixture(async app => {
      assert.equal(Object.getPrototypeOf(app), null);
      assert.equal(Object.getOwnPropertySymbols(app).length, 0);
      assert.equal(
        await app.register(async function (child) {
          assert.equal(this, child);
          assert.equal(
            await child.register(async nested => {
              nested.addHook('onRequest', function (request, reply, done) {
                assert.equal(this, nested);
                assert.equal(request.server as unknown, nested);
                assert.equal(reply.server as unknown, nested);
                assert.throws(() => Reflect.get(request.server, 'close'), /preparation rejects close/);
                done();
              });
              assert.equal(
                nested.get('/probe', function (request, reply) {
                  assert.equal(this as unknown, nested);
                  assert.equal(request.server, reply.server);
                  assert.equal(request.getDecorator('server') as unknown, nested);
                  assert.equal(reply.getDecorator('server') as unknown, nested);
                  assert.equal(reply.getDecorator<(status: number) => FastifyReply>('code')(200), reply);
                  return { ok: true };
                }),
                nested
              );
            }),
            child
          );
        }),
        app
      );
    });
    assert.equal((await client(await start(f.host)).response).status, 200);
  });

  it('freezes the native route snapshot after ownership wrapping and detaches caller hook arrays', async () => {
    const raw = createPortalRouter({ exposeHeadRoutes: false });
    const facade = sealPreparation(raw, requestOwnership({ config: {}, log: { warn() {} } }));
    let inspected = 0;
    raw.addHook('onRoute', options => {
      inspected++;
      assert(Object.isFrozen(options));
      assert(Object.isFrozen(options.preHandler));
      for (const key of ['handler', 'preHandler', 'validatorCompiler', 'serializerCompiler']) {
        assert.equal(Reflect.defineProperty(options, key, { value: () => {} }), false);
      }
    });
    const hooks = [async () => {}];
    facade.route({ method: 'GET', url: '/frozen', preHandler: hooks, handler: async () => 'original' });
    hooks.push(async () => {
      throw new Error('late hook');
    });
    try {
      await raw.ready();
      assert.equal(inspected, 1);
    } finally {
      await raw.close();
    }
  });

  for (const access of publicAccess) {
    it(`seals public Fastify values through ${access} access`, async () => {
      const f = fixture(async app => {
        // Test-only raw access seeds references the public metadata guard must map.
        const raw = Reflect.get(f.host, 'fastify') as FastifyInstance;
        const metadata = Object.freeze({
          server: raw,
          list: Object.freeze([raw]),
          get instance() {
            return raw;
          },
        });
        app.route({
          method: 'GET',
          url: '/probe',
          config: { metadata },
          handler(request, reply) {
            const viewedRequest = publicRead(reply, 'request', access) as FastifyRequest;
            assert.equal(viewedRequest, request);
            assert.equal(viewedRequest.server as unknown, app);
            assert.equal(reply.server as unknown, app);
            assert.equal(Object.getPrototypeOf(request), null);
            assert.equal(Object.getPrototypeOf(reply), null);
            const config = publicRead(request.routeOptions, 'config', access);
            const guarded = publicRead(config, 'metadata', access);
            assert.equal(reply.routeOptions.config, config);
            assert.equal(request.getDecorator<FastifyRequest['routeOptions']>('routeOptions').config, config);
            assert.equal(reply.getDecorator<FastifyRequest['routeOptions']>('routeOptions').config, config);
            assert.equal(Object.getPrototypeOf(guarded), null);
            assert.equal(publicRead(guarded, 'server', access), app);
            assert.equal(publicRead(guarded, 'instance', access), app);
            assert.equal([...guarded.list][0], app);
            assert.equal(guarded.list.map((value: unknown) => value)[0], app);
            assert.equal(Array.isArray(guarded.list), true);
            assert.equal(Object.getOwnPropertyDescriptor(guarded.list, 'length')!.value, 1);
            assert.equal(Object.getOwnPropertyDescriptor(guarded.list, 'length')!.writable, false);
            assert.equal(publicRead(app, 'server', access), raw.server);
            assert.equal(reply.getDecorator('request'), request);
            assert.equal(Reflect.get(request, privateContext), undefined);
            assert.equal(Object.getOwnPropertyDescriptor(request, privateContext), undefined);
            assert.equal(privateContext in request, false);
            assert.throws(() => Reflect.get(viewedRequest.server, 'close'), /preparation rejects close/);
            assert.throws(() => Reflect.get(guarded.server, 'addHook')('onRoute', () => {}), /preparation rejects/);
            assert.throws(() => Object.defineProperty(reply, 'send', { value: () => {} }), /cannot replace/);
            assert.throws(() => Reflect.setPrototypeOf(request, {}), /cannot replace/);
            for (const value of [request, reply, request.routeOptions, config, guarded]) {
              assert.deepEqual(Object.getOwnPropertySymbols(value), []);
              assert(Reflect.ownKeys(value).every(key => typeof key === 'string'));
            }
            return publicRead(reply, 'send', access)({ ok: true });
          },
        });
      });
      assert.deepEqual(await client(await start(f.host)).response, { status: 200, body: '{"ok":true}' });
    });
  }

  it('preserves native request-data identities, mutations and validation behavior over sockets', async () => {
    const raw = Fastify();
    raw.post('/probe', mutateData);
    await raw.listen({ host: '127.0.0.1', port: 0 });
    cleanups.push(() => raw.close());
    const input = { items: [1, 2], remove: true, extra: true };
    const expected = await exchange((raw.server.address() as { port: number }).port, '/probe', false, input).response;
    let native!: FastifyRequest;
    const f = fixture(async app => {
      Reflect.get(f.host, 'fastify').addHook(
        'preHandler',
        (req: FastifyRequest, _reply: FastifyReply, done: () => void) => {
          native = req;
          done();
        }
      );
      app.post('/probe', request => {
        for (const key of ['body', 'params', 'query', 'headers', 'raw'] as const) {
          if (key === 'raw') assert.equal(request.raw.headers, native.raw.headers);
          else assert.equal(request[key], native[key]);
        }
        assert.equal(request.getDecorator('body'), native.body);
        assert.equal(Object.getOwnPropertyDescriptor(request, 'body')!.value, native.body);
        assert.equal({ ...request }.body, native.body);
        const schema = { type: 'object', properties: { value: { type: 'integer' } }, additionalProperties: false };
        const validator = request.compileValidationSchema(schema);
        const value = { value: 1, extra: true };
        assert(validator(value));
        assert.deepEqual(value, { value: 1 });
        assert(request.getValidationFunction(schema)!({ value: 2 }));
        const invalid = { value: 'bad' };
        assert.equal(validator(invalid), false);
        assert(Array.isArray(validator.errors));
        return mutateData(request);
      });
    });
    assert.deepEqual(await exchange(await start(f.host), '/probe', false, input).response, expected);
    assert.deepEqual(JSON.parse(expected.body), { body: { items: [1] }, removed: 2, keys: ['items'], header: null });
  });

  for (const [name, operation] of omittedCallbacks) {
    it(`rejects unqualified ${name} before callback work starts`, async () => {
      let calls = 0;
      const f = fixture(async app => {
        app.get('/probe', (req, reply) => {
          assert.throws(
            () =>
              operation(req, reply, () => {
                calls++;
              }),
            /owned hooks\/module drains/
          );
          return 'ok';
        });
      });
      assert.equal((await client(await start(f.host)).response).body, 'ok');
      await f.host.stop();
      assert.equal(calls, 0);
    });
  }

  for (const kind of ['node', 'web', 'response'] as const) {
    it(`rejects unqualified send(${kind} stream) without starting its producer`, async () => {
      let reads = 0;
      const source = new Readable({
        read() {
          reads++;
          this.push(null);
        },
      });
      cleanups.push(async () => {
        source.destroy();
      });
      const f = fixture(async app => {
        app.get('/probe', (_req, reply) => {
          const payload = kind === 'node' ? source : kind === 'web' ? new ReadableStream() : new Response('x');
          assert.throws(() => reply.send(payload), /qualified module with drain\/hijack/);
          return 'ok';
        });
      });
      assert.equal((await client(await start(f.host)).response).body, 'ok');
      assert.equal(reads, 0);
    });
  }

  for (const entry of payloadEntries)
    for (const kind of payloadKinds) {
      it(`payload matrix: ${entry} / ${kind}`, async () => {
        const selected = payloadFixture(kind);
        cleanups.push(() => selected.close());
        const f = fixture(async app => installPayload(app, entry, () => selected.value));
        const actual = await client(await start(f.host), '/matrix/probe').response;
        if ((streamKinds as readonly string[]).includes(kind)) {
          assert.equal(actual.status, 500);
          assert.equal(actual.body, '{"message":"Internal server error","details":""}');
          assert.equal(selected.reads(), 0);
        } else {
          const original = payloadFixture(kind);
          const raw = Fastify();
          installPayload(raw as unknown as FastifyPreparation, entry, () => original.value);
          cleanups.push(async () => {
            await raw.close();
            await original.close();
          });
          await raw.listen({ host: '127.0.0.1', port: 0 });
          const expected = await client((raw.server.address() as { port: number }).port, '/matrix/probe').response;
          assert.deepEqual(actual, {
            ...expected,
            ...(expected.status === 500 ? { body: '{"message":"Internal server error","details":""}' } : {}),
          });
          assert.equal(selected.reads(), 0);
          assert.equal(original.reads(), 0);
        }
        await f.host.stop();
        await f.host.stop();
      });
    }

  it('preserves ignored non-promise callback-hook returns without consuming them', async () => {
    const selected = payloadFixture('node-stream');
    cleanups.push(() => selected.close());
    let errors = 0;
    const f = fixture(async app => {
      app.addHook('onError', async () => {
        errors++;
      });
      Reflect.apply(app.addHook, app, [
        'onSend',
        (
          _request: FastifyRequest,
          _reply: FastifyReply,
          payload: unknown,
          done: (error: unknown, value: unknown) => void
        ) => {
          done(null, payload);
          return selected.value;
        },
      ]);
      app.get('/probe', () => 'payload');
    });
    assert.deepEqual(await client(await start(f.host)).response, { status: 200, body: 'payload' });
    await f.host.stop();
    assert.equal(selected.reads(), 0);
    assert.equal(errors, 0);
  });

  for (const scope of ['plugin', 'route'] as const)
    for (const callback of [false, true]) {
      it(`checks retained onSend payload after in-place mutation (${scope}, callback=${callback})`, async () => {
        let pipes = 0;
        const mutate = (_request: FastifyRequest, _reply: FastifyReply, payload: unknown, done?: () => void) => {
          Object.assign(payload as object, {
            pipe() {
              pipes++;
            },
          });
          done?.();
        };
        const hook = callback
          ? mutate
          : async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => mutate(req, reply, payload);
        const f = fixture(async app => {
          if (scope === 'plugin') Reflect.apply(app.addHook, app, ['onSend', hook]);
          app.route({
            method: 'GET',
            url: '/probe',
            handler: () => Buffer.from('payload'),
            ...(scope === 'route' ? { onSend: hook } : {}),
          });
        });
        const response = await client(await start(f.host)).response;
        assert.equal(response.status, 500);
        assert.equal(response.body, '{"message":"Internal server error","details":""}');
        assert.equal(pipes, 0);
      });
    }

  it('sends native 103 early hints without a callback and preserves serialization helpers', async () => {
    const f = fixture(async app => {
      app.get('/probe', (req, reply) => {
        assert.equal(reply.writeEarlyHints({ link: '</x>; rel=preload' }) as unknown, reply);
        const schema = { type: 'object', properties: { value: { type: 'integer' } } };
        const serialize = reply.compileSerializationSchema(schema);
        assert.equal(serialize({ value: 1 }), '{"value":1}');
        assert.equal(reply.getSerializationFunction(schema)!({ value: 2 }), '{"value":2}');
        assert.equal(reply.serializeInput({ value: 3 }, schema), '{"value":3}');
        assert.equal(reply.serialize({ value: 4 }), '{"value":4}');
        assert.equal(req.signal.aborted, false);
        req.signal.throwIfAborted();
        return 'ok';
      });
    });
    const information: number[] = [];
    const sending = client(await start(f.host));
    sending.client.on('information', response => information.push(response.statusCode));
    assert.equal((await sending.response).body, 'ok');
    assert.deepEqual(information, [103]);
  });

  it('installs FM-009 bound controllers and FM-010 routes through the sealed core stage', async () => {
    const declaration = {
      name: 'sealed',
      method: 'get' as const,
      path: '/probe',
      controller: 'Example',
      action: 'read',
      access: { kind: 'public' as const },
    };
    const factory = defineController({
      name: 'Example',
      actions: ['read'],
      create: (input: { value: string }) => ({ read: async () => input.value }),
    });
    const controllers = composeControllers(
      [{ provider: 'core', declaration: factory }],
      [bindControllerFactory(factory, { value: 'bound' })],
      [declaration]
    );
    const routes = await composeRoutes([{ provider: 'core', declaration }], { policyNames: [] });
    const f = fixture(async app => {
      routes.install(app, controllers.instantiate(), async () => {});
    });
    assert.deepEqual(await client(await start(f.host)).response, { status: 200, body: 'bound' });
  });

  for (const phase of ['before-send', 'after-send', 'rejected', 'callback-rejects'] as const) {
    it(`retains reply.then ${phase} callback promises independently of transport`, async () => {
      const entered = barrier(),
        held = barrier();
      let closed = false,
        writes = 0;
      const callback = async () => {
        entered.resolve();
        await held.promise;
        assert.equal(closed, false);
        assert(hasActiveHttpRequest(f.owner));
        await persistenceOperation(f.owner, async () => {
          writes++;
        });
        if (phase === 'callback-rejects') throw new Error('visible completion failure');
      };
      const errors = sinon.spy();
      const f = fixture(
        async app => {
          // Test logger injection belongs at the native core boundary, before views.
          sinon.stub(f.owner.log, 'warn').callsFake(errors);
          app.get('/probe', (_request, reply) => {
            if (phase === 'after-send') {
              reply.send('early');
              reply.then(callback, error => {
                throw error;
              });
            } else if (phase === 'rejected') {
              reply.then(() => assert.fail('expected error callback'), callback);
              reply.raw.emit('error', new Error('controlled stream error'));
              reply.raw.destroy();
            } else {
              reply.then(callback, error => {
                throw error;
              });
              reply.send('early');
            }
          });
        },
        [
          {
            name: 'dependency',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                closed = true;
              },
            }),
          },
        ]
      );
      const sending = client(await start(f.host));
      if (phase !== 'rejected') await sending.response;
      await entered.promise;
      await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      assert.equal(closed, false);
      held.resolve();
      await f.host.stop();
      assert.equal(writes, 1);
      assert(closed);
      assert.equal(errors.callCount, phase === 'callback-rejects' ? 1 : 0);
      if (phase === 'callback-rejects') assert.deepEqual(errors.firstCall.args, ['HTTP_REPLY_CALLBACK_FAILED']);
    });
  }

  it('skips stale keep-alive timeout hooks after the accepted request lifetime has completed', async () => {
    let acceptedSocket!: Socket,
      calls = 0;
    const f = fixture(async app => {
      app.addHook('onTimeout', async () => {
        calls++;
      });
      app.get('/probe', request => {
        acceptedSocket = request.raw.socket;
        return 'ok';
      });
    });
    const agent = new Agent({ keepAlive: true });
    cleanups.push(async () => {
      agent.destroy();
    });
    assert.equal((await exchange(await start(f.host), '/probe', agent).response).body, 'ok');
    await turn();
    assert(acceptedSocket.listenerCount('timeout') > 0);
    acceptedSocket.emit('timeout');
    assert.equal(calls, 0);
    await f.host.stop();
  });

  it('preserves await/return reply thenable semantics without a circular lifetime lease', async () => {
    const f = fixture(async app => {
      app.get('/probe', async (_request, reply) => {
        reply.send('ok');
        await reply;
        return reply;
      });
    });
    assert.equal((await client(await start(f.host)).response).body, 'ok');
    await f.host.stop();
  });

  it('reaps idle keep-alive sockets once without force-closing active connections', async () => {
    let server!: Server,
      closeHooks = 0;
    const { host } = fixture(async (app, value) => {
      server = value;
      app.get('/probe', async () => ({ ok: true }));
      app.addHook('onClose', async () => {
        closeHooks++;
      });
    });
    const port = await start(host);
    const close = sinon.spy(server, 'close');
    const force = sinon.spy(server, 'closeAllConnections');
    const agent = new Agent({ keepAlive: true });
    cleanups.push(async () => {
      agent.destroy();
    });
    const sending = exchange(port, '/probe', agent);
    const connected = await new Promise<Socket>(resolve => sending.client.once('socket', resolve));
    assert.equal((await sending.response).status, 200);
    const closed = new Promise<void>(resolve => connected.once('close', () => resolve()));
    const stopping = host.stop();
    assert.equal(host.stop(), stopping);
    await stopping;
    await closed;
    await host.stop();
    assert.equal(close.callCount, 1);
    assert.equal(force.callCount, 0);
    assert.equal(closeHooks, 1);
  });

  it('finishes an in-flight response and gates pipelined work with the portal envelope during close', async () => {
    const entered = barrier(),
      release = barrier(),
      closing = barrier(),
      preClosed = barrier();
    let actions = 0;
    const { host } = fixture(async app => {
      app.addHook('preClose', async () => {
        closing.resolve();
        await preClosed.promise;
      });
      app.get('/hold', async () => {
        entered.resolve();
        await release.promise;
        return { accepted: true };
      });
      app.get('/probe', async () => {
        actions++;
        return { unexpected: true };
      });
    });
    const wire = await socket(await start(host));
    let data = '';
    wire.on('data', chunk => (data += chunk));
    const ended = once(wire, 'end');
    wire.write('GET /hold HTTP/1.1\r\nHost: fixture\r\n\r\n');
    await entered.promise;
    const stopping = host.stop();
    await closing.promise;
    wire.write('GET /probe HTTP/1.1\r\nHost: fixture\r\n\r\n');
    const denied = Promise.withResolvers<void>();
    wire.on('data', () => {
      if (data.includes('application-not-ready')) denied.resolve();
    });
    release.resolve();
    await denied.promise;
    preClosed.resolve();
    await ended;
    await stopping;
    assert.match(data, /HTTP\/1.1 200 /);
    assert.match(data, /HTTP\/1.1 503 /);
    assert.match(data, /connection: close/i);
    assert.match(data, /\{"error":"application-not-ready"\}/);
    assert.equal(actions, 0);
  });

  it('retains a partially received owned connection across a deadline without destroying it', async () => {
    const received = barrier();
    let closeHooks = 0,
      server!: Server,
      peer!: Socket;
    const { host } = fixture(async (app, value) => {
      server = value;
      server.on('connection', socket => {
        peer = socket;
        socket.once('data', received.resolve);
      });
      app.addHook('onClose', async () => {
        closeHooks++;
      });
    });
    const wire = await socket(await start(host));
    wire.write('GET /probe HTTP/1.1\r\nHost:');
    await received.promise;
    const close = sinon.spy(server, 'close');
    await assert.rejects(host.stop({ deadlineMs: 40 }), /deadline exceeded/);
    assert.equal(peer.destroyed, false);
    assert.equal(wire.destroyed, false);
    assert.equal(host.status().stopped, false);
    assert.equal(closeHooks, 0);
    wire.destroy();
    await host.stop();
    assert.equal(close.callCount, 1);
    assert.equal(closeHooks, 1);
  });

  for (const owned of [false, true]) {
    for (const mode of (owned
      ? ['disconnect', 'after-response', 'followup', 'stream']
      : ['disconnect', 'after-response', 'stream']) as readonly string[]) {
      it(`retains ${mode} work and borrowed Mongo until completion (owner=${owned})`, async () => {
        const entered = barrier(),
          held = barrier(),
          transportClosed = barrier();
        let server!: Server,
          hooks = 0,
          resourceCloses = 0,
          writes = 0;
        const poolClose = sinon.spy(MongoClient.prototype, 'close');
        const f = fixture(
          async (app, value) => {
            server = value;
            server.on('close', transportClosed.resolve);
            await mongoResourceDatabase(f.owner, 'borrowed', { mongoUrl: 'mongodb://127.0.0.1/fm012_control' });
            app.addHook('onClose', async () => {
              hooks++;
            });
            app.get('/probe', async (request, reply) => {
              const complete = async () => {
                await held.promise;
                assert.equal(poolClose.callCount, 0);
                if (owned) {
                  assert(hasActivePersistenceWork(f.owner));
                  assert(hasActiveHttpRequest(f.owner));
                  await persistenceOperation(f.owner, async () => {
                    writes++;
                  });
                } else writes++;
              };
              if (mode === 'stream') {
                reply.hijack();
                reply.raw.writeHead(200, { 'content-type': 'text/plain' });
                reply.raw.write('prefix');
              } else if (mode !== 'disconnect') reply.send({ accepted: true });
              if (mode === 'followup') await retainHttpRequestFollowup(f.owner, complete());
              else if (mode === 'after-response') trackHttpRequestWork(request, complete());
              else {
                entered.resolve();
                await complete();
              }
              entered.resolve();
            });
          },
          [
            {
              name: 'consumer',
              create: () => ({
                initialize: async () => {},
                close: async () => {
                  resourceCloses++;
                  assert.equal(writes, 1);
                },
              }),
            },
          ],
          owned
        );
        const sending = client(await start(f.host));
        await entered.promise;
        if (mode === 'disconnect' || mode === 'stream') sending.client.destroy();
        else await sending.response;
        await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
        await transportClosed.promise;
        assert.equal(resourceCloses, 0);
        assert.equal(poolClose.callCount, 0);
        assert.equal(hooks, 1, 'transport completion is independent of retained work');
        held.resolve();
        await f.host.stop();
        await f.host.stop();
        assert.equal(resourceCloses, 1);
        assert.equal(writes, 1);
        assert.equal(poolClose.callCount, 1);
        assert.equal(f.host.status().stopped, true);
        assert.equal(server.listening, false);
        poolClose.restore();
      });
    }
  }

  for (const operation of ['get', 'set', 'touch', 'destroy'] as const) {
    it(`owns a pending session ${operation} callback after client disconnect`, async () => {
      const entered = barrier(),
        held = barrier();
      const poolClose = sinon.spy(MongoClient.prototype, 'close');
      let callbackCompleted = false,
        closed = 0;
      const f = fixture(
        async app => {
          await mongoResourceDatabase(f.owner, 'sessions', { mongoUrl: 'mongodb://127.0.0.1/fm012_sessions' });
          // Focused store-operation seam, not the FM-014 native session adapter.
          app.addHook(
            operation === 'get' ? 'preHandler' : 'onSend',
            (request: FastifyRequest, _reply: FastifyReply, ...args: unknown[]) => {
              const done = args.at(-1) as (error?: Error) => void;
              const work = (async () => {
                entered.resolve();
                await held.promise;
                assert.equal(poolClose.callCount, 0);
                await persistenceOperation(f.owner, async () => {
                  callbackCompleted = true;
                });
                done();
              })();
              trackHttpRequestWork(request, work);
            }
          );
          app.get('/probe', async () => ({ ok: true }));
        },
        [
          {
            name: 'sessions',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                assert(callbackCompleted);
                closed++;
              },
            }),
          },
        ]
      );
      const sending = client(await start(f.host));
      await entered.promise;
      sending.client.destroy();
      await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      assert.equal(closed, 0);
      assert.equal(poolClose.callCount, 0);
      held.resolve();
      await f.host.stop();
      assert.equal(closed, 1);
      assert.equal(poolClose.callCount, 1);
    });
  }

  const hookNames = [
    'onRequest',
    'preParsing',
    'preValidation',
    'preHandler',
    'preSerialization',
    'onSend',
    'onResponse',
    'onError',
    'onTimeout',
    'onRequestAbort',
  ] as const;
  for (const registration of ['plugin', 'route'] as const) {
    for (const name of hookNames) {
      it(`owns returned ${registration} ${name} work after response/disconnect`, async () => {
        const entered = barrier(),
          held = barrier(),
          received = barrier();
        let closed = false,
          writes = 0;
        const work = async () => {
          entered.resolve();
          await held.promise;
          assert.equal(closed, false);
          assert(hasActiveHttpRequest(f.owner));
          assert(hasActivePersistenceWork(f.owner));
          await persistenceOperation(f.owner, async () => {
            writes++;
          });
        };
        const f = fixture(
          async app => {
            app.server.setTimeout(name === 'onTimeout' ? 30 : 0);
            await app.register(async parent => {
              parent.register(async nested => {
                if (name === 'onRequestAbort')
                  nested.addHook('onRequest', async () => {
                    received.resolve();
                  });
                const hook = ['preParsing', 'preSerialization', 'onSend', 'onError'].includes(name)
                  ? async function (
                      this: FastifyPreparation,
                      _request: FastifyRequest,
                      reply: FastifyReply,
                      payload: unknown
                    ) {
                      assert.equal(this, nested);
                      if (name === 'onSend' || name === 'preSerialization') reply.raw.end('early');
                      await work();
                      return payload;
                    }
                  : name === 'onRequestAbort'
                    ? async function (this: FastifyPreparation, _request: FastifyRequest) {
                        assert.equal(this, nested);
                        await work();
                      }
                    : async function (this: FastifyPreparation, _request: FastifyRequest, reply?: FastifyReply) {
                        assert.equal(this, nested);
                        if (name !== 'onResponse' && name !== 'onTimeout') reply!.send('early');
                        await work();
                      };
                if (registration === 'plugin') nested.addHook(name as any, hook as any);
                nested.route({
                  method: name === 'onRequestAbort' ? 'POST' : 'GET',
                  url: '/probe',
                  ...(registration === 'route' ? { [name]: hook } : {}),
                  handler: (_request, reply) => {
                    if (name === 'onError') throw new Error('controlled');
                    if (name === 'onTimeout') return;
                    return { ok: true };
                  },
                });
              });
            });
          },
          [
            {
              name: 'borrowed',
              create: () => ({
                initialize: async () => {},
                close: async () => {
                  closed = true;
                },
              }),
            },
          ]
        );
        const port = await start(f.host);
        if (name === 'onRequestAbort') {
          const raw = await socket(port);
          raw.write(
            'POST /probe HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 99\r\n\r\n{'
          );
          await received.promise;
          raw.destroy();
        } else {
          const sending = client(port);
          if (name === 'onTimeout' || name === 'onError') {
            // The hook must retain work independently of the disconnected transport.

            await entered.promise;
            sending.client.destroy();
          }
        }
        await entered.promise;
        await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
        assert.equal(closed, false);
        held.resolve();
        await f.host.stop();
        assert.equal(writes, 1);
        assert(closed);
      });
    }
  }

  for (const entry of [
    'not-found',
    'error-handler',
    'route-error',
    'promise-send',
    'parser',
    'callback-parser',
    'hijacked',
  ] as const) {
    it(`owns ${entry} returned work after an early response`, async () => {
      const entered = barrier(),
        held = barrier();
      let closed = false,
        writes = 0;
      const work = async () => {
        entered.resolve();
        await held.promise;
        assert.equal(closed, false);
        await persistenceOperation(f.owner, async () => {
          writes++;
        });
      };
      const handler = async (_request: FastifyRequest, reply: FastifyReply) => {
        if (entry === 'hijacked') {
          reply.hijack();
          reply.raw.end('early');
        } else if (entry === 'promise-send') {
          reply.send(work());
          return;
        } else reply.send('early');
        await work();
      };
      const f = fixture(
        async app => {
          app.register(
            async nested => {
              if (entry === 'not-found') nested.setNotFoundHandler(handler);
              else if (entry === 'error-handler')
                nested.setErrorHandler(async (_error, req, reply) => handler(req, reply));
              else if (entry === 'parser')
                nested.addContentTypeParser('application/fm012', async () => {
                  await work();
                  return {};
                });
              else if (entry === 'callback-parser')
                nested.addContentTypeParser('application/fm012', function (_request, _body, done) {
                  void work().then(() => done(null, {}), done);
                });
              if (entry !== 'not-found')
                nested.route({
                  method: entry.includes('parser') ? 'POST' : 'GET',
                  url: '/probe',
                  ...(entry === 'route-error'
                    ? { errorHandler: async (_error, req, reply) => handler(req, reply) }
                    : {}),
                  handler: entry.includes('parser')
                    ? async () => ({ ok: true })
                    : entry.includes('error')
                      ? async () => {
                          throw new Error('controlled');
                        }
                      : handler,
                });
            },
            entry === 'not-found' ? { prefix: '/fallback' } : {}
          );
        },
        [
          {
            name: 'borrowed',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                closed = true;
              },
            }),
          },
        ]
      );
      const port = await start(f.host);
      if (entry.includes('parser')) {
        const req = request({
          host: '127.0.0.1',
          port,
          path: '/probe',
          method: 'POST',
          headers: { 'content-type': 'application/fm012' },
        });
        req.on('error', () => {});
        req.end('data');
        await entered.promise;
        req.destroy();
      } else {
        const response = await client(port, entry === 'not-found' ? '/fallback/missing' : '/probe').response;
        if (entry === 'promise-send') assert.deepEqual(response, { status: 200, body: '{}' });
      }
      await entered.promise;
      await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      assert.equal(closed, false);
      held.resolve();
      await f.host.stop();
      assert.equal(writes, 1);
      assert(closed);
    });
  }

  for (const entry of [
    'callback-onResponse',
    'callback-abort',
    'callback-preHandler',
    'ordinary-promise-hook',
    'trailer',
  ] as const) {
    it(`owns ${entry} work until its native completion`, async () => {
      const entered = barrier(),
        held = barrier(),
        received = barrier();
      let closed = false,
        writes = 0;
      const work = async () => {
        entered.resolve();
        await held.promise;
        assert.equal(closed, false);
        await persistenceOperation(f.owner, async () => {
          writes++;
        });
      };
      const f = fixture(
        async app => {
          if (entry === 'callback-preHandler')
            app.addHook('preHandler', function (_request, _reply, done) {
              void work().then(() => done(), done);
            });
          if (entry === 'ordinary-promise-hook')
            app.addHook('onResponse', function () {
              return work();
            });
          if (entry === 'callback-onResponse') {
            app.addHook('onResponse', function (_request, _reply, done) {
              void work().then(() => done(), done);
            });
            // A second hook catches a lease gap between sequential callbacks.
            app.addHook('onResponse', async () => {
              assert.equal(closed, false);
            });
          }
          if (entry === 'callback-abort') {
            app.addHook('onRequest', async () => {
              received.resolve();
            });
            app.addHook('onRequestAbort', function (_request, done) {
              void work().then(() => done(), done);
            });
          }
          app.route({
            method: entry === 'callback-abort' ? 'POST' : 'GET',
            url: '/probe',
            handler: (_request, reply) => {
              if (entry === 'trailer')
                reply.trailer('x-check', async () => {
                  await work();
                  return 'complete';
                });
              return 'ok';
            },
          });
        },
        [
          {
            name: 'borrowed',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                closed = true;
              },
            }),
          },
        ]
      );
      const port = await start(f.host);
      if (entry === 'callback-abort') {
        const raw = await socket(port);
        raw.write(
          'POST /probe HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 99\r\n\r\n{'
        );
        await received.promise;
        raw.destroy();
      } else {
        const sending = client(port);
        await entered.promise;
        if (entry !== 'callback-onResponse') sending.client.destroy();
      }
      await entered.promise;
      await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      assert.equal(closed, false);
      held.resolve();
      await f.host.stop();
      assert.equal(writes, 1);
      assert(closed);
    });
  }

  for (const entry of ['reply-serializer'] as const) {
    it(`owns a promise submitted by ${entry} while Fastify rejects its unsupported payload`, async () => {
      const entered = barrier(),
        held = barrier();
      let closed = false,
        writes = 0;
      const serialize = () =>
        (async () => {
          entered.resolve();
          await held.promise;
          assert.equal(closed, false);
          await persistenceOperation(f.owner, async () => {
            writes++;
          });
          return 'late';
        })();
      const f = fixture(
        async app => {
          app.get('/probe', {}, async (_request, reply) => {
            if (entry === 'reply-serializer') reply.serializer(serialize as any);
            return { ok: true };
          });
        },
        [
          {
            name: 'borrowed',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                closed = true;
              },
            }),
          },
        ]
      );
      const sending = client(await start(f.host));
      await entered.promise;
      sending.client.destroy();
      await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      assert.equal(closed, false);
      held.resolve();
      await f.host.stop();
      assert(writes >= 1);
      assert(closed);
    });
  }

  it('preserves plugin async-local context while restoring accepted persistence ownership', async () => {
    const local = new AsyncLocalStorage<string>();
    const entered = barrier(),
      held = barrier();
    const f = fixture(async app => {
      app.addHook('onRequest', (_request, _reply, done) => local.run('plugin-context', done));
      app.addHook('preHandler', async () => {
        assert.equal(local.getStore(), 'plugin-context');
      });
      app.get('/probe', async (_request, reply) => {
        assert.equal(local.getStore(), 'plugin-context');
        reply.send('early');
        entered.resolve();
        await held.promise;
        assert.equal(local.getStore(), 'plugin-context');
        await persistenceOperation(f.owner, async () => {});
      });
    });
    await client(await start(f.host)).response;
    await entered.promise;
    await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
    held.resolve();
    await f.host.stop();
  });

  it('preserves Fastify async/callback signature validation', async () => {
    const f = fixture(async app => {
      app.addHook('onRequest', async function (_request, _reply, _done) {});
    });
    await assert.rejects(f.host.initialize(), /Async hooks should not use the 'done' argument/);
    await f.host.stop();
  });

  for (const entry of ['preValidation', 'preHandler', 'callNotFound'] as const) {
    it(`owns fallback ${entry} work`, async () => {
      const entered = barrier(),
        held = barrier();
      let closed = false,
        writes = 0;
      const work = async () => {
        entered.resolve();
        await held.promise;
        assert.equal(closed, false);
        await persistenceOperation(f.owner, async () => {
          writes++;
        });
      };
      const f = fixture(
        async app => {
          app.register(
            async child => {
              child.setNotFoundHandler(
                entry === 'callNotFound'
                  ? {}
                  : {
                      [entry]: async (_request: FastifyRequest, reply: FastifyReply) => {
                        reply.send('early');
                        await work();
                      },
                    },
                async (_request, reply) => {
                  reply.send('early');
                  if (entry === 'callNotFound') await work();
                }
              );
              child.get('/probe', async (_request, reply) => reply.callNotFound());
            },
            { prefix: '/fallback' }
          );
        },
        [
          {
            name: 'borrowed',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                closed = true;
              },
            }),
          },
        ]
      );
      await client(await start(f.host), entry === 'callNotFound' ? '/fallback/probe' : '/fallback/missing').response;
      await entered.promise;
      await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      assert.equal(closed, false);
      held.resolve();
      await f.host.stop();
      assert.equal(writes, 1);
      assert(closed);
    });
  }

  it('retains an explicitly owned asynchronous onResponse observation', async () => {
    const entered = barrier(),
      held = barrier();
    let closed = false,
      observed = false;
    const f = fixture(
      async app => {
        app.addHook('onResponse', async request => {
          await trackHttpRequestWork(
            request,
            (async () => {
              entered.resolve();
              await held.promise;
              assert.equal(closed, false);
              await persistenceOperation(f.owner, async () => {
                observed = true;
              });
            })()
          );
        });
        app.get('/probe', async () => ({ ok: true }));
      },
      [
        {
          name: 'observer',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closed = true;
            },
          }),
        },
      ]
    );
    assert.equal((await client(await start(f.host)).response).status, 200);
    await entered.promise;
    await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
    assert.equal(closed, false);
    held.resolve();
    await f.host.stop();
    assert(observed);
    assert(closed);
  });

  for (const phase of ['prepare', 'activate'] as const) {
    it(`keeps ${phase} acquisition owned after a stop deadline, then retries without a second transport close`, async () => {
      const entered = barrier(),
        held = barrier();
      let closes = 0,
        hooks = 0,
        server!: Server;
      const hold = async () => {
        entered.resolve();
        await held.promise;
        assert.equal(closes, 0);
      };
      const f = fixture(
        async (app, value) => {
          server = value;
          app.addHook('onClose', async () => {
            hooks++;
          });
          if (phase === 'prepare') await hold();
        },
        [
          {
            name: 'resource',
            create: () => ({
              initialize: async () => {},
              activate: phase === 'activate' ? hold : undefined,
              close: async () => {
                closes++;
              },
            }),
          },
        ]
      );
      if (phase === 'activate') await f.host.initialize();
      const startup = assert.rejects(phase === 'prepare' ? f.host.initialize() : f.host.activate(), /stop has begun/);
      await entered.promise;
      const close = sinon.spy(server, 'close');
      const stopping = f.host.stop({ deadlineMs: 40 });
      assert.equal(f.host.stop(), stopping);
      await assert.rejects(stopping, /deadline exceeded/);
      assert.equal(closes, 0);
      assert.equal(close.callCount, 0);
      held.resolve();
      await startup;
      await turn();
      assert.equal(closes, 0, 'settled acquisition does not silently retry expired stop');
      await f.host.stop();
      assert.equal(closes, 1);
      assert.equal(close.callCount, 1);
      assert.equal(hooks, 1);
    });
  }

  for (const phase of ['initialize', 'activate'] as const) {
    it(`closes transport after application-owned ${phase} rollback without mistaking quiesce for host stop`, async () => {
      const error = new Error('controlled application startup failure');
      let closes = 0,
        hooks = 0;
      const f = fixture(
        async app => {
          app.addHook('onClose', async () => {
            hooks++;
          });
          app.get('/probe', async () => ({ ok: true }));
        },
        [
          {
            name: 'failure',
            create: () => ({
              initialize: async () => {
                if (phase === 'initialize') throw error;
              },
              activate: async () => {
                if (phase === 'activate') throw error;
              },
              close: async () => {
                closes++;
              },
            }),
          },
        ]
      );
      if (phase === 'activate') {
        await f.host.initialize();
        await assert.rejects(f.host.activate(), error);
        assert.equal(hooks, 1);
      } else await assert.rejects(f.host.initialize(), error);
      assert.equal(f.host.address(), null);
      assert.equal(f.host.status().stopped, true);
      assert.equal(closes, 1);
    });
  }

  it('joins a still-running application close after caller timeout and never duplicates a successful close', async () => {
    const entered = barrier(),
      held = barrier();
    let closes = 0,
      hooks = 0;
    const f = fixture(
      async app => {
        app.get('/probe', async () => ({ ok: true }));
        app.addHook('onClose', async () => {
          hooks++;
        });
      },
      [
        {
          name: 'slow',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closes++;
              entered.resolve();
              await held.promise;
            },
          }),
        },
      ]
    );
    await start(f.host);
    const stopping = f.host.stop({ deadlineMs: 40 });
    await entered.promise;
    await assert.rejects(stopping, /deadline exceeded/);
    await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
    assert.equal(closes, 1);
    held.resolve();
    await f.host.stop();
    await f.host.stop();
    assert.equal(closes, 1);
    assert.equal(hooks, 1);
  });

  it('retries failed application cleanup while keeping borrowed Mongo open and close hooks single', async () => {
    let closes = 0,
      hooks = 0;
    const poolClose = sinon.spy(MongoClient.prototype, 'close');
    const f = fixture(
      async app => {
        await mongoResourceDatabase(f.owner, 'borrowed', { mongoUrl: 'mongodb://127.0.0.1/fm012_retry' });
        app.get('/probe', async () => ({ ok: true }));
        app.addHook('onClose', async () => {
          hooks++;
        });
      },
      [
        {
          name: 'retryable',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closes++;
              if (closes === 1) throw new Error('controlled consumer cleanup failure');
            },
          }),
        },
      ]
    );
    await start(f.host);
    await assert.rejects(f.host.stop(), /resource close failed/);
    assert.equal(poolClose.callCount, 0);
    assert.equal(f.application.status().cleanupPending, true);
    assert.equal(hooks, 1);
    await f.host.stop();
    await f.host.stop();
    assert.equal(closes, 2);
    assert.equal(poolClose.callCount, 1);
    assert.equal(hooks, 1);
    assert.equal(persistenceStatus(f.owner).pools, 0);
  });

  for (const owned of [false, true]) {
    it(`drains connected application-owned streams concurrently (owner option=${owned})`, async () => {
      const entered = barrier();
      let endStream = () => {},
        hooks = 0;
      const f = fixture(
        async app => {
          app.get('/probe', async (_request, reply) => {
            reply.hijack();
            reply.raw.writeHead(200, { 'content-type': 'text/plain' });
            reply.raw.write('prefix');
            endStream = () => reply.raw.end('suffix');
            entered.resolve();
          });
          // Fastify onClose owns no application cleanup and never awaits application.stop.
          app.addHook('onClose', async () => {
            hooks++;
          });
        },
        [
          {
            name: 'stream',
            create: () => ({
              initialize: async () => {},
              drain: async () => {
                endStream();
              },
              close: async () => {},
            }),
          },
        ],
        owned
      );
      const sending = client(await start(f.host));
      await entered.promise;
      await f.host.stop({ deadlineMs: 1000 });
      assert.deepEqual(await sending.response, { status: 200, body: 'prefixsuffix' });
      assert.equal(hooks, 1);
      assert.equal(f.application.status().state, 'stopped');
    });
  }

  it('retains an application-owned upgraded socket until its drain finishes', async () => {
    const upgraded = barrier(),
      draining = barrier(),
      held = barrier();
    let peer!: Duplex,
      hooks = 0;
    const f = fixture(
      async (app, server) => {
        await mongoResourceDatabase(f.owner, 'socket', { mongoUrl: 'mongodb://127.0.0.1/fm012_socket' });
        server.on('upgrade', (_request, socket) => {
          peer = socket;
          peer.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: fixture\r\n\r\n');
          upgraded.resolve();
        });
        app.addHook('onClose', async () => {
          hooks++;
        });
      },
      [
        {
          name: 'upgrade',
          create: () => ({
            initialize: async () => {},
            drain: async () => {
              draining.resolve();
              await held.promise;
              if (!peer || peer.closed) return;
              const closed = new Promise<void>(resolve => peer.once('close', () => resolve()));
              peer.end();
              await closed;
            },
            close: async () => {},
          }),
        },
      ]
    );
    const poolClose = sinon.spy(MongoClient.prototype, 'close');
    const wire = await socket(await start(f.host));
    wire.resume();
    const ended = once(wire, 'end');
    wire.write('GET /fixture HTTP/1.1\r\nHost: fixture\r\nConnection: Upgrade\r\nUpgrade: fixture\r\n\r\n');
    await upgraded.promise;
    const stopping = f.host.stop({ deadlineMs: 40 });
    await draining.promise;
    await assert.rejects(stopping, /deadline exceeded/);
    assert.equal(peer.destroyed, false);
    assert.equal(poolClose.callCount, 0);
    held.resolve();
    await ended;
    await f.host.stop();
    assert.equal(peer.destroyed, true);
    assert.equal(poolClose.callCount, 1);
    assert.equal(hooks, 1);
  });

  it('retains a failed consumer dependency frontier while closing independent branches, then closes dependencies once, last', async () => {
    const events: string[] = [];
    let consumerAttempts = 0,
      dependencyOpen = true,
      serviceOpen = true;
    const poolClose = sinon.spy(MongoClient.prototype, 'close');
    const f = fixture(
      async app => {
        await mongoResourceDatabase(f.owner, 'graph', { mongoUrl: 'mongodb://127.0.0.1/fm012_graph' });
        app.get('/probe', async () => ({ ok: true }));
      },
      [
        {
          name: 'dependency',
          requires: [],
          create: () => ({
            initialize: async () => {},
            close: async () => {
              assert.equal(consumerAttempts, 2);
              assert.equal(serviceOpen, false);
              assert.equal(poolClose.callCount, 0);
              dependencyOpen = false;
              events.push('dependency');
            },
          }),
        },
        {
          name: 'service',
          requires: ['dependency'],
          create: () => ({
            initialize: async () => {},
            close: async () => {
              assert(dependencyOpen);
              assert.equal(consumerAttempts, 2);
              serviceOpen = false;
              events.push('service');
            },
          }),
        },
        {
          name: 'consumer',
          requires: ['service'],
          create: () => ({
            initialize: async () => {},
            close: async () => {
              assert(serviceOpen);
              assert(dependencyOpen);
              consumerAttempts++;
              events.push('consumer:' + consumerAttempts);
              if (consumerAttempts === 1) throw new Error('controlled graph consumer failure');
            },
          }),
        },
        {
          name: 'peer',
          requires: ['dependency'],
          create: () => ({
            initialize: async () => {},
            close: async () => {
              assert(dependencyOpen);
              events.push('peer');
            },
          }),
        },
        {
          name: 'independent',
          requires: [],
          create: () => ({
            initialize: async () => {},
            close: async () => {
              events.push('independent');
            },
          }),
        },
      ]
    );
    await start(f.host);
    await assert.rejects(f.host.stop(), /resource close failed/);
    assert(dependencyOpen);
    assert(serviceOpen);
    assert.equal(poolClose.callCount, 0);
    assert.deepEqual(events, ['consumer:1', 'peer', 'independent']);
    assert.deepEqual(f.application.status().persistence.resources, [
      'module:dependency',
      'module:service',
      'module:consumer',
    ]);
    await f.host.stop();
    await f.host.stop();
    assert.deepEqual(events, ['consumer:1', 'peer', 'independent', 'consumer:2', 'service', 'dependency']);
    assert.equal(poolClose.callCount, 1);
    assert.equal(f.host.status().stopped, true);
  });

  it('retains explicitly declared downstream dependencies at the first failed consumer', async () => {
    const events: string[] = [];
    let attempts = 0,
      open = true;
    const f = fixture(undefined, [
      {
        name: 'consumer',
        requires: ['dependency'],
        create: () => ({
          initialize: async () => {},
          close: async () => {
            assert(open);
            attempts++;
            events.push('consumer');
            if (attempts === 1) throw new Error('controlled failure');
          },
        }),
      },
      {
        name: 'dependency',
        create: () => ({
          initialize: async () => {},
          close: async () => {
            open = false;
            events.push('dependency');
          },
        }),
      },
    ]);
    await start(f.host);
    await assert.rejects(f.host.stop(), /resource close failed/);
    assert(open);
    assert.deepEqual(events, ['consumer']);
    await f.host.stop();
    assert.deepEqual(events, ['consumer', 'consumer', 'dependency']);
  });

  for (const outcome of ['failure', 'interrupt', 'plugin-failure'] as const) {
    it(`owns queued plugin initialization after prepare ${outcome}`, async () => {
      const entered = barrier(),
        held = barrier(),
        preparation = barrier();
      let closed = false,
        finished = false;
      const f = fixture(
        async app => {
          assert.equal(
            app.initialConfig.pluginTimeout,
            0,
            'Only caller deadlines may bound plugin acquisition waiting'
          );
          app.register(async () => {
            entered.resolve();
            await held.promise;
            assert.equal(closed, false);
            await persistenceOperation(f.owner, async () => {
              finished = true;
            });
            if (outcome === 'plugin-failure') throw new Error('plugin failure');
          });
          if (outcome === 'interrupt') await preparation.promise;
          else if (outcome === 'failure') throw new Error('prepare failure');
        },
        [
          {
            name: 'dependency',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                closed = true;
                assert(finished);
              },
            }),
          },
        ]
      );
      const initialization = f.host.initialize();
      void initialization.catch(() => {});
      if (outcome === 'interrupt') {
        await turn();
        const stop = f.host.stop({ deadlineMs: 40 });
        preparation.resolve();
        await entered.promise;
        await assert.rejects(stop, /deadline exceeded/);
      } else {
        await entered.promise;
        await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      }
      assert.equal(closed, false);
      held.resolve();
      await assert.rejects(initialization, /prepare failure|plugin failure|stop has begun/);
      await f.host.stop();
      assert(closed);
    });
  }

  for (const order of ['forward', 'backward'] as const) {
    it(`uses the same explicit graph for ${order} dependencies and partial rollback`, async () => {
      let earlyClosed = 0,
        lateCreated = 0;
      const early = {
        name: 'early',
        requires: ['late'],
        create: () => ({
          initialize: async () => {
            throw new Error('early acquisition failed');
          },
          close: async () => {
            earlyClosed++;
          },
        }),
      };
      const late = {
        name: 'late',
        create: () => {
          lateCreated++;
          return { initialize: async () => {}, close: async () => {} };
        },
      };
      const f = fixture(undefined, order === 'forward' ? [early, late] : [late, early]);
      await assert.rejects(f.host.initialize(), /early acquisition failed/);
      await f.host.stop();
      await f.host.stop();
      assert.equal(earlyClosed, 1);
      assert.equal(lateCreated, order === 'forward' ? 0 : 1);
    });
  }

  it('does not infer a reverse edge from registration order', async () => {
    const events: string[] = [];
    const f = fixture(undefined, [
      {
        name: 'dependency',
        create: () => ({
          initialize: async () => {},
          close: async () => {
            events.push('dependency');
          },
        }),
      },
      {
        name: 'consumer',
        requires: ['dependency'],
        create: () => ({
          initialize: async () => {},
          close: async () => {
            events.push('consumer');
          },
        }),
      },
      {
        name: 'independent',
        create: () => ({
          initialize: async () => {},
          close: async () => {
            events.push('independent');
          },
        }),
      },
    ]);
    await start(f.host);
    await f.host.stop();
    assert.deepEqual(events, ['consumer', 'dependency', 'independent']);
  });

  it('rejects missing/cyclic module dependencies offline and validates the host application boundary', () => {
    const create = sinon.spy(() => ({ initialize: async () => {}, close: async () => {} }));
    for (const modules of [
      [{ name: 'one', requires: ['missing'], create }],
      [
        { name: 'one', requires: ['two'], create },
        { name: 'two', requires: ['one'], create },
      ],
    ])
      assert.throws(() => new ApplicationRuntime({ config: {}, log: { warn() {} } }, modules), /cleanup/);
    assert.equal(create.callCount, 0);
    const application = new ApplicationRuntime({ config: {}, log: { warn() {} } });
    const options = { hostname: '127.0.0.1', port: 0, prepare: async () => {} };
    assert.throws(
      () => new FastifyHost(application, { ...options, owner: { config: {}, log: { warn() {} } } }),
      /same persistence owner/
    );
    Object.defineProperty(application, 'registerHttpHost', { value: undefined });
    assert.throws(() => new FastifyHost(application, options), /registerHttpHost.*ApplicationRuntime/);
  });

  it('passes one absolute deadline through host and application despite a clock tick at the call boundary', async () => {
    let inherited: number | undefined, drained: number | undefined;
    const f = fixture(undefined, [
      {
        name: 'consumer',
        create: () => ({
          initialize: async () => {},
          drain: async options => {
            drained = options?.deadline;
          },
          close: async () => {},
        }),
      },
    ]);
    await start(f.host);
    const stop = f.application.stop.bind(f.application);
    sinon.stub(f.application, 'stop').callsFake(options => {
      inherited = options?.deadline;
      const shifted = Date.now() + 10;
      const clock = sinon.stub(Date, 'now').returns(shifted);
      try {
        return stop(options);
      } finally {
        clock.restore();
      }
    });
    await f.host.stop({ deadlineMs: 1000 });
    assert.equal(typeof inherited, 'number');
    assert.equal(drained, inherited, 'nested relative budgets cannot extend the host cutoff');
  });

  it('retains resources when an inherited absolute deadline has already expired', async () => {
    let drains = 0,
      closes = 0;
    const f = fixture(undefined, [
      {
        name: 'consumer',
        create: () => ({
          initialize: async () => {},
          drain: async () => {
            drains++;
          },
          close: async () => {
            closes++;
          },
        }),
      },
    ]);
    await start(f.host);
    await assert.rejects(f.application.stop({ deadlineMs: 5000, deadline: Date.now() - 1 }), /deadline exceeded/);
    assert.equal(drains, 0);
    assert.equal(closes, 0);
    await f.host.stop();
    assert.equal(drains, 1);
    assert.equal(closes, 1);
  });

  it('joins a still-running drain after a peer drain rejects, retaining all dependencies until explicit retry', async () => {
    const entered = barrier(),
      held = barrier();
    let refuse = true,
      failures = 0,
      drains = 0,
      closes = 0;
    const f = fixture(
      undefined,
      [
        {
          name: 'failed',
          requires: ['dependency'],
          create: () => ({
            initialize: async () => {},
            drain: async () => {
              failures++;
              if (refuse) throw new Error('controlled peer drain failure');
            },
            close: async () => {},
          }),
        },
        {
          name: 'held',
          requires: ['dependency'],
          create: () => ({
            initialize: async () => {},
            drain: async () => {
              drains++;
              entered.resolve();
              await held.promise;
            },
            close: async () => {},
          }),
        },
        {
          name: 'dependency',
          requires: [],
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closes++;
            },
          }),
        },
      ],
      false
    );
    const appStops = sinon.spy(f.application, 'stop');
    await start(f.host);
    const stopping = f.host.stop({ deadlineMs: 40 });
    await entered.promise;
    await assert.rejects(stopping, /deadline exceeded/);
    await assert.rejects(f.host.stop({ deadlineMs: 40 }), /deadline exceeded/);
    // A host deadline bounds its caller, not the underlying application wait.
    // Settle the second application attempt before releasing the first raw drain;
    // relying on timer registration order here makes the control nondeterministic.
    await assert.rejects(appStops.getCall(1).returnValue, /deadline exceeded/);
    assert.equal(drains, 1);
    assert.equal(failures, 1);
    assert.equal(closes, 0);
    refuse = false;
    held.resolve();
    await turn();
    await turn();
    await f.host.stop();
    assert.equal(drains, 2);
    assert.equal(failures, 2);
    assert.equal(closes, 1);
  });

  const stopControls = [
    { stage: 'quiesce', fault: 'error', open: true, retry: true },
    { stage: 'prepare', fault: 'hang', open: true, retry: true },
    { stage: 'drain', fault: 'error', open: true, retry: true },
    { stage: 'drain', fault: 'hang', open: true, retry: true },
    { stage: 'request', fault: 'error', open: false, retry: true },
    { stage: 'request', fault: 'hang', open: true, retry: true },
    { stage: 'transport', fault: 'error', open: false, retry: false },
    { stage: 'transport', fault: 'hang', open: false, retry: true },
    { stage: 'consumer', fault: 'error', open: true, retry: true },
    { stage: 'consumer', fault: 'hang', open: true, retry: true },
    { stage: 'dependency', fault: 'error', open: true, retry: true },
    { stage: 'dependency', fault: 'hang', open: true, retry: true },
    { stage: 'pool', fault: 'error', open: false, retry: true },
    { stage: 'pool', fault: 'hang', open: false, retry: true },
  ] as const;
  for (const row of stopControls) {
    it(`stop ordering control: ${row.stage} ${row.fault}, retry=${row.retry}`, async () => {
      const marker = new Error('controlled ' + row.stage + ' ' + row.fault);
      const entered = barrier(),
        held = barrier(),
        requestEntered = barrier();
      const events: string[] = [];
      let faulty = true,
        dependencyOpen = true,
        consumerClosed = false,
        poolsClosed = 0;
      let server!: Server,
        transportHooks = 0;
      const control = async (stage: string) => {
        events.push(stage);
        if (stage !== row.stage || !faulty) return;
        entered.resolve();
        if (row.fault === 'error') throw marker;
        await held.promise;
      };
      const closePool = MongoClient.prototype.close;
      const pool = sinon.stub(MongoClient.prototype, 'close').callsFake(async function (this: MongoClient) {
        assert.equal(dependencyOpen, false, 'consumers and dependencies close before the pool');
        await control('pool');
        await closePool.call(this);
        poolsClosed++;
      });
      const f = fixture(
        async (app, value) => {
          server = value;
          await mongoResourceDatabase(f.owner, 'matrix', { mongoUrl: 'mongodb://127.0.0.1/fm012_matrix' });
          app.setErrorHandler((_error, _request, reply) => reply.code(500).send({ error: 'controlled-request-error' }));
          app.addHook('onClose', async () => {
            transportHooks++;
            if (row.fault === 'hang') await control('transport');
          });
          app.get('/probe', async () => {
            requestEntered.resolve();
            await control('request');
            return { ok: true };
          });
          if (row.stage === 'prepare') await control('prepare');
        },
        [
          {
            name: 'consumer',
            requires: ['dependency'],
            create: () => ({
              initialize: async () => {},
              quiesce: () => {
                events.push('quiesce');
                if (row.stage === 'quiesce' && faulty) throw marker;
              },
              drain: async () => {
                await control('drain');
              },
              close: async () => {
                assert(dependencyOpen);
                await control('consumer');
                consumerClosed = true;
              },
            }),
          },
          {
            name: 'dependency',
            requires: [],
            create: () => ({
              initialize: async () => {},
              close: async () => {
                assert(consumerClosed);
                await control('dependency');
                dependencyOpen = false;
              },
            }),
          },
        ],
        false
      );
      let startup: Promise<void> | undefined;
      if (row.stage === 'prepare') {
        startup = assert.rejects(f.host.initialize(), /stop has begun/);
        await entered.promise;
      } else {
        const port = await start(f.host);
        const sending = client(port);
        await requestEntered.promise;
        if (row.stage !== 'request' || row.fault === 'error') {
          const response = await sending.response;
          assert.equal(response.status, row.stage === 'request' ? 500 : 200);
          if (row.stage === 'request') assert.equal(response.body, '{"error":"controlled-request-error"}');
        }
      }
      const nativeClose = server.close;
      const native =
        row.stage === 'transport' && row.fault === 'error'
          ? sinon.stub(server, 'close').callsFake(function (this: Server, done) {
              return nativeClose.call(this, () => done?.(marker));
            })
          : sinon.spy(server, 'close');
      // Clear startup/request observations; subsequent events describe shutdown.
      events.length = 0;
      const stopping = f.host.stop({ deadlineMs: 50 });
      assert.equal(f.host.status().ready, false, 'admission closes synchronously');
      assert.equal(f.host.stop(), stopping, 'concurrent callers join');
      const rejection =
        row.stage === 'request' && row.fault === 'error'
          ? undefined
          : assert.rejects(
              stopping,
              row.fault === 'hang'
                ? /deadline exceeded/
                : row.stage === 'transport'
                  ? marker
                  : row.stage === 'quiesce'
                    ? /quiesce failed/
                    : row.stage === 'drain'
                      ? /drain failed/
                      : row.stage === 'pool'
                        ? /app-owned persistence pools/
                        : /resource close failed/
            );
      if (row.fault === 'hang' && row.stage !== 'prepare' && row.stage !== 'request') await entered.promise;
      await (rejection ?? stopping);
      assert.equal(dependencyOpen, row.open, 'failed work retains exactly its dependency frontier');
      assert.equal(poolsClosed, row.open || row.stage === 'pool' ? 0 : 1);
      assert.equal(f.host.status().stopFailed, !!rejection);
      assert.equal(f.host.status().stopped, !rejection);
      if (row.stage !== 'prepare' && row.stage !== 'quiesce' && row.stage !== 'request')
        assert(events.indexOf('drain') < events.indexOf('consumer') || !events.includes('consumer'));
      if (row.open) assert(!events.includes('pool'));
      faulty = false;
      held.resolve();
      await startup;
      // Release the old owned stage/cleanup; retries join it, never duplicate it.
      await turn();
      await turn();
      if (row.retry) {
        await f.host.stop({ deadlineMs: 2000 });
        await f.host.stop();
        assert.equal(f.host.status().stopped, true);
        assert.equal(f.host.status().stopFailed, false);
      } else {
        await assert.rejects(f.host.stop(), marker);
        f.expectFailure(marker);
        assert.equal(f.host.status().stopped, false);
      }
      assert.equal(dependencyOpen, false);
      assert.equal(poolsClosed, 1);
      assert.equal(native.callCount, 1);
      assert.equal(transportHooks, 1);
      assert.equal(pool.callCount, row.stage === 'pool' && row.fault === 'error' ? 2 : 1);
      assert(events.indexOf('consumer') < events.indexOf('dependency'));
      assert(events.lastIndexOf('dependency') < events.indexOf('pool'));
    });
  }

  for (const failure of ['onClose', 'native-close'] as const) {
    it(`keeps irrecoverable ${failure} failure visible while retrying remaining application cleanup`, async () => {
      const error = new Error(`controlled ${failure} failure`);
      let hooks = 0,
        closes = 0,
        server!: Server;
      const f = fixture(
        async (app, value) => {
          server = value;
          app.get('/probe', async () => ({ ok: true }));
          app.addHook('onClose', async () => {
            hooks++;
            if (failure === 'onClose') throw error;
          });
        },
        [
          {
            name: 'retryable',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                closes++;
                if (closes === 1) throw new Error('controlled application close failure');
              },
            }),
          },
        ]
      );
      await start(f.host);
      let native: sinon.SinonStub | undefined;
      if (failure === 'native-close') {
        const close = server.close;
        native = sinon.stub(server, 'close').callsFake(function (this: Server, callback) {
          return close.call(this, () => callback?.(error));
        });
      }
      const stopped = sinon.spy(),
        reported = sinon.spy();
      const remove = f.host.installSignalHandlers({ onStopped: stopped, onError: reported });
      try {
        await assert.rejects(f.host.stop(), (result: AggregateError) => {
          assert(result instanceof AggregateError);
          assert(result.errors.includes(error));
          return true;
        });
        assert.equal(closes, 1);
        await assert.rejects(f.host.stop(), error);
        assert.equal(closes, 2, 'remaining cleanup retries despite permanent transport failure');
        assert.equal(f.application.status().state, 'stopped');
        assert.equal(f.host.status().stopped, false);
        assert.equal(f.host.status().stopFailed, true);
        process.emit('SIGTERM');
        // Join the signal-started attempt, then allow its callback to report.
        await assert.rejects(f.host.stop(), error);
        await turn();
        assert.equal(stopped.callCount, 0);
        assert.equal(reported.callCount, 1);
        assert.equal(reported.firstCall.args[0], error);
        assert.equal(hooks, 1);
        if (native) assert.equal(native.callCount, 1);
        f.expectFailure(error);
      } finally {
        remove();
      }
    });
  }
});

describe('pinned Fastify 5.12.8 close semantics', function () {
  this.timeout(5000);
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close().catch(() => {});
    sinon.restore();
  });
  function app() {
    const value = Fastify({ forceCloseConnections: false, return503OnClosing: false });
    apps.push(value);
    assert.equal(value.version, '5.12.8', 'upgrade requires requalifying close semantics');
    return value;
  }
  for (const kind of payloadKinds) {
    it(`classifies native ${kind} payloads with Fastify 5.12.8 semantics`, async () => {
      const selected = payloadFixture(kind);
      const value = app();
      try {
        if (kind === 'undici-response') {
          assert.equal(selected.value instanceof Response, false);
          assert.equal(Object.prototype.toString.call(selected.value), '[object Response]');
        }
        if (kind === 'stream-like') assert.equal(selected.value instanceof Readable, false);
        value.get('/probe', (_request, reply) => reply.send(selected.value));
        await value.listen({ host: '127.0.0.1', port: 0 });
        const response = await exchange((value.server.address() as { port: number }).port).response;
        assert.equal(response.status, 200);
        if (kind === 'resume-only') {
          assert.equal(response.body, '{}');
          assert.equal(selected.reads(), 0);
        } else if ((streamKinds as readonly string[]).includes(kind)) {
          assert.equal(response.body, 'payload');
          assert.equal(selected.reads(), 1);
        } else {
          assert.equal(selected.reads(), 0);
          if (kind === 'async-iterable' || kind === 'array-buffer') assert.equal(response.body, '{}');
          if (['string', 'buffer', 'typed-array', 'data-view', 'buffer-like'].includes(kind))
            assert.equal(response.body, 'payload');
        }
      } finally {
        await value.close();
        await selected.close();
      }
    });
  }
  for (const mode of ['204', 'head'] as const) {
    it(`starts resume-only onSend replacements natively for ${mode}`, async () => {
      const value = app();
      let resumes = 0,
        listeners = 0;
      const held = Promise.withResolvers<void>();
      let completed = false;
      let work: Promise<void> | undefined;
      installDiscardPayload(value as unknown as FastifyPreparation, mode, 'route', 'promise', () => ({
        on(event: string) {
          assert.equal(event, 'error');
          listeners++;
          return this;
        },
        resume() {
          resumes++;
          work = held.promise.then(() => {
            completed = true;
          });
          return this;
        },
      }));
      try {
        await value.listen({ host: '127.0.0.1', port: 0 });
        const response = await exchange(
          (value.server.address() as { port: number }).port,
          '/probe',
          false,
          undefined,
          mode === 'head' ? 'HEAD' : 'GET'
        ).response;
        assert.equal(response.status, mode === '204' ? 204 : 200);
        assert.equal(response.body, '');
        assert.equal(resumes, 1);
        assert.equal(listeners, 1);
        await value.close();
        assert.equal(completed, false, 'native close does not wait for producer completion');
      } finally {
        held.resolve();
        await work;
      }
    });
  }
  it('resolves listen before asynchronous onListen work (therefore sealed composition rejects it)', async () => {
    const value = app();
    const entered = Promise.withResolvers<void>(),
      held = Promise.withResolvers<void>();
    let completed = false;
    const work = held.promise.then(() => {
      completed = true;
    });
    value.addHook('onListen', async () => {
      entered.resolve();
      await work;
    });
    const listening = value.listen({ host: '127.0.0.1', port: 0 });
    try {
      await entered.promise;
      assert.equal(await Promise.race([listening.then(() => true), turn().then(() => false)]), true);
      assert.equal(completed, false);
    } finally {
      held.resolve();
      await work;
      await listening;
    }
  });

  it('closes the listener before onClose and runs child hooks before root in reverse registration order', async () => {
    const value = app();
    const events: string[] = [];
    value.server.on('close', () => events.push('server'));
    value.addHook('preClose', async () => {
      events.push('preClose');
    });
    value.addHook('onClose', async () => {
      events.push('root-first');
    });
    value.addHook('onClose', async () => {
      events.push('root-last');
    });
    value.register(async child => {
      child.addHook('onClose', async () => {
        events.push('child');
      });
    });
    await value.listen({ host: '127.0.0.1', port: 0 });
    await value.close();
    assert.deepEqual(events, ['preClose', 'server', 'child', 'root-last', 'root-first']);
    await value.close();
    assert.deepEqual(events, ['preClose', 'server', 'child', 'root-last', 'root-first']);
  });
  it('does not rerun rejected onClose hooks on a second raw Fastify close', async () => {
    const value = app();
    const error = new Error('controlled raw Fastify close failure');
    let hooks = 0;
    value.addHook('onClose', async () => {
      hooks++;
      throw error;
    });
    await value.listen({ host: '127.0.0.1', port: 0 });
    await assert.rejects(value.close(), error);
    // Avvio consumes the close queue; a subsequent raw call resolves. The host
    // must retain the FIRST rejected promise rather than trusting a second call.
    await value.close();
    assert.equal(hooks, 1);
  });
  it('discards server.close callback failures, which the host must preserve itself', async () => {
    const value = app();
    await value.listen({ host: '127.0.0.1', port: 0 });
    const close = value.server.close;
    const error = new Error('controlled native callback failure');
    const native = sinon.stub(value.server, 'close').callsFake(function (this: Server, callback) {
      return close.call(this, () => callback?.(error));
    });
    await value.close();
    assert.equal(native.callCount, 1);
  });
});

// Same file so the five-repeat qualification includes real-pool regressions.
describe('FM-012 real Mongo ownership regressions', function () {
  this.timeout(10000);
  let native: MongoClient;
  let url: string;
  let counter = 0;
  const cleanup: (() => Promise<unknown>)[] = [];
  const releases: (() => void)[] = [];
  before(async function () {
    if (!process.env.FM012_TEST_MONGO_URL) return this.skip();
    const base = new URL(process.env.FM012_TEST_MONGO_URL);
    assert.equal(base.pathname, '/fm012_close');
    url = base.href;
    native = await new MongoClient(url).connect();
    assert.match((await native.db().command({ buildInfo: 1 })).version, /^9\./);
  });
  afterEach(async () => {
    releases.splice(0).forEach(resolve => resolve());
    for (const close of cleanup.splice(0).reverse()) await close();
    sinon.restore();
  });
  after(async () => {
    await native?.close();
  });
  function deferred() {
    const value = Promise.withResolvers<void>();
    releases.push(value.resolve);
    return value;
  }
  function owner() {
    const connection = new URL(url);
    connection.pathname += '_' + process.pid + '_' + counter++;
    cleanup.push(() => native.db(connection.pathname.slice(1)).dropDatabase());
    return { config: { datastores: { mongodb: { url: connection.href, maxPoolSize: 2 } } }, log: { warn() {} } };
  }
  for (const mode of ['204', 'head'] as const)
    for (const scope of ['plugin', 'route'] as const)
      for (const completion of ['promise', 'callback'] as const)
        for (const disconnect of [false, true]) {
          it(`guards resume-only ${mode} / ${scope} / ${completion} / ${disconnect ? 'disconnect' : 'connected'} with real Mongo`, async () => {
            const selected = owner(),
              entered = deferred(),
              held = deferred();
            const poolClose = sinon.spy(MongoClient.prototype, 'close');
            let closes = 0,
              writes = 0,
              hooks = 0,
              errors = 0,
              producerWrites = 0;
            const producerWork: Promise<unknown>[] = [];
            const payload = payloadFixture('resume-only', () => {
              const work = held.promise.then(() =>
                persistenceOperation(selected, async () => {
                  await (await mongoDatabase(selected, 'mongodb')).collection('producer').insertOne({ mode });
                  producerWrites++;
                })
              );
              producerWork.push(work);
              void work.catch(() => {});
            });
            cleanup.push(() => payload.close());
            const application = new ApplicationRuntime(selected, [
              {
                name: 'borrowed',
                create: () => ({
                  initialize: async () => {
                    await mongoDatabase(selected, 'mongodb');
                  },
                  close: async () => {
                    closes++;
                    assert.equal(writes, 1);
                  },
                }),
              },
            ]);
            const host = new FastifyHost(application, {
              hostname: '127.0.0.1',
              port: 0,
              prepare: async app => {
                app.addHook('onClose', async () => {
                  hooks++;
                });
                app.addHook('onError', async (_request, _reply, error) => {
                  assert.equal(error.message, 'HTTP_REQUEST_FAILED');
                  errors++;
                });
                installDiscardPayload(app, mode, scope, completion, async () => {
                  entered.resolve();
                  await held.promise;
                  assert.equal(closes, 0);
                  assert.equal(poolClose.callCount, 0);
                  await persistenceOperation(selected, async () => {
                    await (
                      await mongoDatabase(selected, 'mongodb')
                    )
                      .collection('writes')
                      .insertOne({ mode, scope, completion, disconnect });
                    writes++;
                  });
                  return payload.value;
                });
              },
            });
            cleanup.push(() => host.stop());
            await host.initialize();
            await host.activate();
            const sending = exchange(
              host.address()!.port,
              '/probe',
              false,
              undefined,
              mode === 'head' ? 'HEAD' : 'GET'
            );
            await entered.promise;
            if (disconnect) {
              const disconnected = new Promise<void>(resolve => sending.client.once('close', resolve));
              sending.client.destroy();
              await disconnected;
            }
            await assert.rejects(host.stop({ deadlineMs: 25 }), /deadline exceeded/);
            assert.equal(closes, 0);
            assert.equal(poolClose.callCount, 0);
            held.resolve();
            if (!disconnect) {
              const response = await sending.response;
              assert.equal(response.status, 500);
              if (mode === 'head') assert.equal(response.body, '');
              else assert.equal(response.body, '{"message":"Internal server error","details":""}');
            }
            await host.stop();
            await host.stop();
            assert.equal(errors, 1);
            assert.equal(payload.reads(), 0);
            assert.equal(producerWork.length, 0);
            assert.equal(producerWrites, 0);
            assert.equal(writes, 1);
            assert.equal(closes, 1);
            assert.equal(poolClose.callCount, 1);
            assert.equal(hooks, 1);
            const db = native.db(new URL(selected.config.datastores.mongodb.url).pathname.slice(1));
            assert.equal(await db.collection('writes').countDocuments(), 1);
            assert.equal(await db.collection('producer').countDocuments(), 0);
          });
        }
  for (const entry of payloadEntries)
    for (const kind of streamKinds) {
      it(`disconnect payload matrix: ${entry} / ${kind} keeps the real borrowed pool`, async () => {
        const selected = owner(),
          entered = deferred(),
          held = deferred();
        const poolClose = sinon.spy(MongoClient.prototype, 'close');
        let closes = 0,
          writes = 0,
          hooks = 0,
          producerWrites = 0;
        const producerWork: Promise<unknown>[] = [];
        const payload = payloadFixture(kind, () => {
          // A missed guard would leave this producer alive after disconnect.
          const work = held.promise.then(() =>
            persistenceOperation(selected, async () => {
              await (await mongoDatabase(selected, 'mongodb')).collection('producer').insertOne({ entry });
              producerWrites++;
            })
          );
          producerWork.push(work);
          void work.catch(() => {});
        });
        cleanup.push(() => payload.close());
        const application = new ApplicationRuntime(selected, [
          {
            name: 'borrowed',
            create: () => ({
              initialize: async () => {
                await mongoDatabase(selected, 'mongodb');
              },
              close: async () => {
                closes++;
                assert.equal(writes, 1);
              },
            }),
          },
        ]);
        const host = new FastifyHost(application, {
          hostname: '127.0.0.1',
          port: 0,
          prepare: async app => {
            app.addHook('onClose', async () => {
              hooks++;
            });
            installPayload(app, entry, async () => {
              entered.resolve();
              await held.promise;
              assert.equal(closes, 0);
              assert.equal(poolClose.callCount, 0);
              await persistenceOperation(selected, async () => {
                await (await mongoDatabase(selected, 'mongodb')).collection('writes').insertOne({ entry, kind });
                writes++;
              });
              return payload.value;
            });
          },
        });
        cleanup.push(() => host.stop());
        await host.initialize();
        await host.activate();
        const sending = exchange(host.address()!.port, '/matrix/probe');
        await entered.promise;
        const disconnected = new Promise<void>(resolve => sending.client.once('close', resolve));
        sending.client.destroy();
        await disconnected;
        await assert.rejects(host.stop({ deadlineMs: 25 }), /deadline exceeded/);
        assert.equal(closes, 0);
        assert.equal(poolClose.callCount, 0);
        held.resolve();
        await host.stop();
        await host.stop();
        assert.equal(payload.reads(), 0);
        assert.equal(producerWork.length, 0);
        assert.equal(producerWrites, 0);
        assert.equal(writes, 1);
        assert.equal(closes, 1);
        assert.equal(poolClose.callCount, 1);
        assert.equal(hooks, 1);
        assert.equal(
          await native
            .db(new URL(selected.config.datastores.mongodb.url).pathname.slice(1))
            .collection('writes')
            .countDocuments(),
          1
        );
      });
    }
  for (const entry of [
    'callback-this',
    'native-data',
    'early-hints',
    'raw-events',
    'raw-write',
    'signal-events',
    'send-stream',
    'trailer-callback',
    'hijack',
  ] as const) {
    it(`qualifies ${entry} with real sockets and a borrowed Mongo pool`, async () => {
      const selected = owner(),
        entered = deferred(),
        held = deferred();
      const poolClose = sinon.spy(MongoClient.prototype, 'close');
      let writes = 0,
        closes = 0,
        callbacks = 0,
        reads = 0,
        transportCloses = 0;
      const source = new Readable({
        read() {
          reads++;
          this.push(null);
        },
      });
      cleanup.push(async () => {
        source.destroy();
      });
      const application = new ApplicationRuntime(selected, [
        {
          name: 'borrowed',
          create: () => ({
            initialize: async () => {
              await mongoDatabase(selected, 'mongodb');
            },
            close: async () => {
              closes++;
            },
          }),
        },
      ]);
      const write = async () => {
        entered.resolve();
        await held.promise;
        assert.equal(closes, 0);
        assert.equal(poolClose.callCount, 0);
        await persistenceOperation(selected, async () => {
          await (await mongoDatabase(selected, 'mongodb')).collection('writes').insertOne({ entry });
          writes++;
        });
      };
      const retained = ['callback-this', 'native-data', 'trailer-callback', 'hijack'].includes(entry);
      const host = new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        prepare: async app => {
          app.addHook('onClose', async () => {
            transportCloses++;
          });
          app.post('/probe', async (req, reply) => {
            if (entry === 'callback-this') {
              (req.body as { items: number[] }).items.forEach(function (this: FastifyRequest) {
                assert.equal(this, req);
                assert.equal(this.server as unknown, app);
                assert.throws(() => Reflect.get(this.server, 'close')(), /preparation rejects close/);
              }, req);
              assert.equal(transportCloses, 0);
            }
            if (entry === 'native-data')
              assert.deepEqual(mutateData(req), { body: { items: [1] }, removed: 2, keys: ['items'], header: null });
            const callback = async () => {
              callbacks++;
              await write();
            };
            if (entry === 'early-hints')
              assert.throws(
                () => reply.writeEarlyHints({ link: '</x>; rel=preload' }, callback),
                /owned hooks\/module drains/
              );
            if (entry === 'raw-events')
              assert.throws(() => req.raw.once('close', callback), /owned hooks\/module drains/);
            if (entry === 'raw-write') assert.throws(() => reply.raw.end('x', callback), /owned hooks\/module drains/);
            if (entry === 'signal-events')
              assert.throws(() => req.signal.addEventListener('abort', callback), /owned hooks\/module drains/);
            if (entry === 'send-stream') assert.throws(() => reply.send(source), /qualified module with drain\/hijack/);
            if (entry === 'trailer-callback') {
              reply.trailer('x-done', (view, _payload, done) => {
                assert.equal(view, reply);
                void write().then(() => done(null, 'done'), done);
              });
              return 'early';
            }
            if (entry === 'hijack') {
              reply.hijack();
              reply.raw.writeHead(200);
              reply.raw.write('early');
            } else reply.send('early');
            if (!retained) held.resolve();
            await write();
            if (entry === 'hijack') reply.raw.end('done');
          });
        },
      });
      cleanup.push(() => host.stop());
      await host.initialize();
      await host.activate();
      const sending = exchange(host.address()!.port, '/probe', false, { items: [1, 2], remove: true, extra: true });
      if (!['trailer-callback', 'hijack'].includes(entry)) assert.equal((await sending.response).status, 200);
      await entered.promise;
      if (retained) {
        await assert.rejects(host.stop({ deadlineMs: 40 }), /deadline exceeded/);
        assert.equal(closes, 0);
        assert.equal(poolClose.callCount, 0);
      }
      held.resolve();
      assert.equal((await sending.response).status, 200);
      await host.stop();
      await host.stop();
      assert.equal(callbacks, 0);
      assert.equal(reads, 0);
      assert.equal(writes, 1);
      assert.equal(closes, 1);
      assert.equal(poolClose.callCount, 1);
      assert.equal(transportCloses, 1);
      assert.equal(
        await native
          .db(new URL(selected.config.datastores.mongodb.url).pathname.slice(1))
          .collection('writes')
          .countDocuments(),
        1
      );
    });
  }
  for (const access of publicAccess) {
    it(`retains a real pool during observations using ${access} public views`, async () => {
      const selected = owner(),
        entered = deferred(),
        held = deferred();
      const poolClose = sinon.spy(MongoClient.prototype, 'close');
      let writes = 0,
        closes = 0;
      const application = new ApplicationRuntime(selected, [
        {
          name: 'borrowed',
          create: () => ({
            initialize: async () => {
              await mongoDatabase(selected, 'mongodb');
            },
            close: async () => {
              assert.equal(writes, 1);
              closes++;
            },
          }),
        },
      ]);
      const host = new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        prepare: async app => {
          const raw = Reflect.get(host, 'fastify') as FastifyInstance;
          app.addHook('onResponse', async (request, reply) => {
            const viewedRequest = publicRead(reply, 'request', access) as FastifyRequest;
            const config = publicRead(viewedRequest.routeOptions, 'config', access);
            const server = publicRead(config, 'server', access);
            assert.equal(viewedRequest, request);
            assert.equal(viewedRequest.server as unknown, app);
            assert.equal(server, app);
            assert.throws(() => Reflect.apply(server.addHook, server, ['onRoute', () => {}]), /preparation rejects/);
            assert.deepEqual(Object.getOwnPropertySymbols(viewedRequest), []);
            entered.resolve();
            await held.promise;
            assert.equal(closes, 0);
            assert.equal(poolClose.callCount, 0);
            await persistenceOperation(selected, async () => {
              await (await mongoDatabase(selected, 'mongodb')).collection('writes').insertOne({ access });
              writes++;
            });
          });
          app.route({ method: 'GET', url: '/probe', config: { server: raw }, handler: async () => 'ok' });
        },
      });
      cleanup.push(() => host.stop());
      await host.initialize();
      await host.activate();
      assert.equal((await exchange(host.address()!.port).response).status, 200);
      await entered.promise;
      await assert.rejects(host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      assert.equal(closes, 0);
      assert.equal(poolClose.callCount, 0);
      held.resolve();
      await host.stop();
      await host.stop();
      assert.equal(closes, 1);
      assert.equal(poolClose.callCount, 1);
      assert.equal(
        await native
          .db(new URL(selected.config.datastores.mongodb.url).pathname.slice(1))
          .collection('writes')
          .countDocuments(),
        1
      );
    });
  }
  for (const entry of [
    'not-found',
    'error-handler',
    'hook',
    'plugin',
    'then-before',
    'then-after',
    'then-error',
  ] as const) {
    it(`keeps a live application Mongo pool for pending ${entry} work`, async () => {
      const selected = owner(),
        entered = deferred(),
        held = deferred();
      const poolClose = sinon.spy(MongoClient.prototype, 'close');
      let closed = false,
        writes = 0;
      const application = new ApplicationRuntime(selected, [
        {
          name: 'borrowed',
          create: () => ({
            initialize: async () => {
              await mongoDatabase(selected, 'mongodb');
            },
            close: async () => {
              closed = true;
              assert.equal(writes, 1);
            },
          }),
        },
      ]);
      const work = async () => {
        entered.resolve();
        await held.promise;
        assert.equal(closed, false);
        assert.equal(poolClose.callCount, 0);
        await persistenceOperation(selected, async () => {
          const db = await mongoDatabase(selected, 'mongodb');
          await db.collection('writes').insertOne({ entry });
          writes++;
        });
      };
      const host = new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        prepare: async app => {
          if (entry === 'plugin') {
            app.register(async () => {
              await work();
            });
            throw new Error('failed after queuing plugin');
          }
          const handler = async (_request: FastifyRequest, reply: FastifyReply) => {
            reply.send('early');
            await work();
          };
          if (entry === 'not-found')
            app.register(
              async child => {
                child.setNotFoundHandler(handler);
              },
              { prefix: '/fallback' }
            );
          if (entry === 'error-handler') app.setErrorHandler(async (_error, request, reply) => handler(request, reply));
          if (entry === 'hook')
            app.addHook('onResponse', async () => {
              await work();
            });
          if (entry !== 'not-found')
            app.get('/probe', async (_request, reply) => {
              if (entry === 'then-error') {
                reply.then(() => assert.fail('expected error callback'), work);
                reply.raw.emit('error', new Error('controlled stream error'));
                reply.raw.destroy();
                return;
              }
              if (entry === 'then-before') {
                reply.then(work, error => {
                  throw error;
                });
                reply.send('early');
                return;
              }
              if (entry === 'then-after') {
                reply.send('early');
                reply.then(work, error => {
                  throw error;
                });
                return;
              }
              if (entry === 'error-handler') throw new Error('controlled');
              return { ok: true };
            });
        },
      });
      cleanup.push(() => host.stop());
      const initialization = host.initialize();
      void initialization.catch(() => {});
      if (entry !== 'plugin') {
        await initialization;
        await host.activate();
        const sending = exchange(host.address()!.port, entry === 'not-found' ? '/fallback/missing' : '/probe');
        if (entry !== 'then-error') await sending.response;
      }
      await entered.promise;
      await assert.rejects(host.stop({ deadlineMs: 40 }), /deadline exceeded/);
      assert.equal(poolClose.callCount, 0);
      held.resolve();
      if (entry === 'plugin') await assert.rejects(initialization, /queuing plugin/);
      await host.stop();
      await host.stop();
      assert.equal(poolClose.callCount, 1);
      assert.equal(writes, 1);
      assert(closed);
      assert.equal(
        await native
          .db(new URL(selected.config.datastores.mongodb.url).pathname.slice(1))
          .collection('writes')
          .countDocuments(),
        1
      );
    });
  }

  for (const probe of ['/healthz', '/readyz']) {
    it(`keeps prepared hooks out of reserved ${probe} responses with a real borrowed Mongo pool`, async () => {
      const selected = owner(),
        closing = deferred(),
        release = deferred();
      const poolClose = sinon.spy(MongoClient.prototype, 'close');
      let preparedCalls = 0,
        moduleClosed = false;
      const prepared = async () => {
        preparedCalls++;
        await persistenceOperation(selected, async () => {
          await (await mongoDatabase(selected, 'mongodb')).collection('writes').insertOne({ probe });
        });
      };
      const application = new ApplicationRuntime(selected, [
        {
          name: 'borrowed',
          create: () => ({
            initialize: async () => {
              await mongoDatabase(selected, 'mongodb');
            },
            close: async () => {
              moduleClosed = true;
            },
          }),
        },
      ]);
      const host = new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        prepare: async app => {
          app.addHook('onSend', async (_request, _reply, payload) => {
            await prepared();
            return payload;
          });
          app.addHook('onResponse', async () => {
            await prepared();
          });
          app.addHook('onResponse', (_request, _reply, done) => {
            void prepared().then(() => done(), done);
          });
          app.addHook('preClose', async () => {
            closing.resolve();
            await release.promise;
          });
          app.get(
            probe,
            {
              onResponse: async () => {
                await prepared();
              },
            },
            async () => {
              throw new Error('reserved route ran');
            }
          );
        },
      });
      cleanup.push(() => host.stop());
      await host.initialize();
      const port = host.address()!.port;
      for (const active of [false, true]) {
        if (active) await host.activate();
        const response = await exchange(port, probe).response;
        assert.equal(response.status, probe === '/healthz' || active ? 200 : 503);
      }
      const stopping = host.stop();
      await closing.promise;
      await exchange(port, probe).response;
      assert.equal(preparedCalls, 0);
      release.resolve();
      await stopping;
      assert(moduleClosed);
      assert.equal(poolClose.callCount, 1);
      assert.equal(
        await native
          .db(new URL(selected.config.datastores.mongodb.url).pathname.slice(1))
          .collection('writes')
          .countDocuments(),
        0
      );
    });
  }

  for (const surface of [
    'setSchemaController',
    'setValidatorCompiler',
    'setSerializerCompiler',
    'onRoute',
    'onListen',
    'async-constraint',
    'callback-constraint',
  ] as const) {
    it(`rejects ${surface} composition before any callback can borrow the live Mongo pool`, async () => {
      const selected = owner();
      const poolClose = sinon.spy(MongoClient.prototype, 'close');
      let invoked = 0,
        closes = 0;
      const application = new ApplicationRuntime(selected, [
        {
          name: 'borrowed',
          create: () => ({
            initialize: async () => {
              await mongoDatabase(selected, 'mongodb');
            },
            close: async () => {
              closes++;
            },
          }),
        },
      ]);
      const callback = async () => {
        invoked++;
        await (await mongoDatabase(selected, 'mongodb')).collection('writes').insertOne({ surface });
      };
      const host = new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        prepare: async app => {
          if (surface === 'onRoute' || surface === 'onListen') {
            Reflect.apply(app.addHook, app, [
              surface,
              surface === 'onListen'
                ? callback
                : (route: Record<string, unknown>) => {
                    route.validatorCompiler = () => callback;
                  },
            ]);
          } else if (surface.includes('constraint'))
            Reflect.get(
              app,
              'addConstraintStrategy'
            )({
              name: 'unsafe',
              storage: () => new Map(),
              deriveConstraint:
                surface === 'async-constraint'
                  ? callback
                  : (_req: unknown, _ctx: unknown, done: Function) => {
                      void callback().then(() => done(null, 'value'));
                    },
            });
          else Reflect.get(app, surface)({ compilersFactory: { buildValidator: () => callback } });
        },
      });
      cleanup.push(() => host.stop());
      await assert.rejects(host.initialize(), /Fastify preparation rejects/);
      await host.stop();
      await host.stop();
      assert.equal(host.address(), null);
      assert.equal(invoked, 0);
      assert.equal(closes, 1);
      assert.equal(poolClose.callCount, 1);
    });
  }

  it('retains a real pool and a failed consumer dependency until the successful retry', async () => {
    const selected = owner(),
      events: string[] = [];
    const poolClose = sinon.spy(MongoClient.prototype, 'close');
    let open = true,
      attempts = 0;
    let borrowed!: Awaited<ReturnType<typeof mongoDatabase>>;
    const application = new ApplicationRuntime(selected, [
      {
        name: 'dependency',
        create: () => ({
          initialize: async () => {
            borrowed = await mongoDatabase(selected, 'mongodb');
          },
          close: async () => {
            open = false;
            events.push('dependency');
          },
        }),
      },
      {
        name: 'consumer',
        requires: ['dependency'],
        create: () => ({
          initialize: async () => {},
          close: async () => {
            assert(open);
            assert.equal(poolClose.callCount, 0);
            events.push('consumer');
            attempts++;
            await borrowed.collection('retry').insertOne({ attempts });
            if (attempts === 1) throw new Error('close failed');
          },
        }),
      },
    ]);
    const host = new FastifyHost(application, { hostname: '127.0.0.1', port: 0, prepare: async () => {} });
    cleanup.push(() => host.stop());
    await host.initialize();
    await host.activate();
    await assert.rejects(host.stop(), /resource close failed/);
    assert(open);
    assert.equal(poolClose.callCount, 0);
    await host.stop();
    await host.stop();
    assert.deepEqual(events, ['consumer', 'consumer', 'dependency']);
    assert.equal(poolClose.callCount, 1);
  });

  it('closes a real pool after partial acquisition rollback with a not-yet-acquired dependency', async () => {
    const selected = owner();
    const poolClose = sinon.spy(MongoClient.prototype, 'close');
    let earlyCloses = 0,
      lateCreates = 0;
    const application = new ApplicationRuntime(selected, [
      {
        name: 'early',
        requires: ['late'],
        create: () => ({
          initialize: async () => {
            await mongoDatabase(selected, 'mongodb');
            throw new Error('partial init');
          },
          close: async () => {
            earlyCloses++;
          },
        }),
      },
      {
        name: 'late',
        create: () => {
          lateCreates++;
          return { initialize: async () => {}, close: async () => {} };
        },
      },
    ]);
    const host = new FastifyHost(application, { hostname: '127.0.0.1', port: 0, prepare: async () => {} });
    cleanup.push(() => host.stop());
    await assert.rejects(host.initialize(), /partial init/);
    await host.stop();
    await host.stop();
    assert.equal(earlyCloses, 1);
    assert.equal(lateCreates, 0);
    assert.equal(poolClose.callCount, 1);
  });
});
