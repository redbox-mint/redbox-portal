import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { ApplicationRuntime } from '../../../src/application';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { composeRoutes } from '../../../src/http/fastify/routes';
import { httpLogStats, type HttpLogRecord } from '../../../src/http/fastify/logging';
import { rawRequest } from './securityFixture';

const points = [
  'handler-sync',
  'handler-async',
  'error-handler-sync',
  'error-handler-async',
  'preHandler',
  'validation',
  'parser',
  'preSerialization-sync',
  'preSerialization-async',
  'onSend-sync',
  'onSend-async',
  'serializer',
  'serializer-after-async-preSerialization',
] as const;
const kinds = ['normal', 'error', 'not-found', 'method-denial', 'generated-head', 'probe', 'fault'] as const;
const throws = ['error', 'object', 'string', 'null', 'undefined', 'false', 'zero', 'symbol'] as const;
function thrown(kind: (typeof throws)[number]): unknown {
  switch (kind) {
    case 'error':
      return Object.assign(new Error('exception-secret'), {
        statusCode: 418,
        headers: { 'X-Credential': 'credential-secret' },
      });
    case 'object':
      return { message: 'exception-secret', headers: { authorization: 'credential-secret' }, statusCode: 418 };
    case 'string':
      return 'exception-secret';
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    case 'false':
      return false;
    case 'zero':
      return 0;
    case 'symbol':
      return Symbol('exception-secret');
  }
}

describe('FM-016 single error boundary failure matrix', function () {
  this.timeout(10000);
  for (const point of points)
    for (const kind of kinds)
      for (const throwKind of throws)
        for (const repeated of [false, true])
          it(`${point} × ${kind} × ${throwKind} × ${repeated ? 'repeated' : 'one-shot'}`, async () => {
            const logs: Readonly<HttpLogRecord>[] = [];
            const application = new ApplicationRuntime({ config: {}, log: { warn() {} } }, []);
            let failures = 0,
              probeFault = false;
            const baseStatus = application.status.bind(application);
            application.status = () => {
              if (probeFault) {
                probeFault = false;
                failures++;
                throw thrown(throwKind);
              }
              return baseStatus();
            };
            const savedReplies = new WeakMap<object, any>();
            const fail = (reply?: any) => {
              if (!repeated && failures) return;
              failures++;
              if (reply) {
                for (const name of [
                  'X-Credential',
                  'Set-Cookie',
                  'WWW-Authenticate',
                  'Content-Disposition',
                  'Allow',
                  'Vary',
                  'Content-Encoding',
                ])
                  reply.header(name, 'credential-secret');
                reply.raw.statusMessage = 'reason-secret';
              }
              throw thrown(throwKind);
            };
            const host = new FastifyHost(application, {
              hostname: '127.0.0.1',
              port: 0,
              logger: record => {
                logs.push(record);
              },
              prepare: async app => {
                app.addHttpMethod('HEAD', { hasBody: true, overrideExisting: true });
                app.addHook('onRequest', (req, reply, done) => {
                  savedReplies.set(req, reply);
                  if (point.startsWith('serializer'))
                    reply.serializer(() => {
                      fail(reply);
                      return '{}';
                    });
                  done();
                });
                if (point === 'serializer-after-async-preSerialization')
                  app.addHook('preSerialization', async (_req, _reply, payload) => {
                    await Promise.resolve();
                    return payload;
                  });
                if (point === 'parser')
                  app.addContentTypeParser('application/fm016-fault', (_req, _body, done) => {
                    fail(savedReplies.get(_req));
                    done(null, {});
                  });
                if (point.startsWith('error-handler'))
                  app.setErrorHandler(
                    point.endsWith('async')
                      ? async (_error, _req, reply) => {
                          await Promise.resolve();
                          fail(reply);
                        }
                      : (_error, _req, reply) => fail(reply)
                  );
                if (['preHandler', 'validation'].includes(point))
                  app.addHook(point === 'validation' ? 'preValidation' : 'preHandler', (_req, reply, done) => {
                    fail(reply);
                    done();
                  });
                if (point.startsWith('onSend') || point.startsWith('preSerialization')) {
                  const phase = point.startsWith('onSend') ? 'onSend' : 'preSerialization';
                  app.addHook(
                    phase,
                    point.endsWith('async')
                      ? async (_req, reply, payload) => {
                          await Promise.resolve();
                          fail(reply);
                          return payload;
                        }
                      : (_req, reply, payload, done) => {
                          fail(reply);
                          done(null, payload);
                        }
                  );
                }
                const respond = (_req: any, reply: any) => {
                  if (point.startsWith('handler')) fail(reply);
                  if (point.startsWith('error-handler')) throw new Error('trigger-secret');
                  if (kind === 'fault') throw new Error('domain-secret');
                  return reply
                    .code(kind === 'error' ? 400 : kind === 'method-denial' ? 405 : kind === 'not-found' ? 404 : 200)
                    .send({ message: 'controlled' });
                };
                const action =
                  point === 'handler-async'
                    ? async (req: any, reply: any) => {
                        await Promise.resolve();
                        return respond(req, reply);
                      }
                    : respond;
                if (kind === 'not-found')
                  app.register(
                    async child => {
                      child.setNotFoundHandler(action);
                    },
                    { prefix: '/missing' }
                  );
                else if (kind === 'generated-head') {
                  const plan = await composeRoutes(
                    [
                      {
                        provider: 'fm016',
                        declaration: {
                          name: 'failure-head',
                          method: 'get',
                          path: '/failure',
                          controller: 'Probe',
                          action: 'probe',
                          access: { kind: 'public' },
                          head: { kind: 'deny', allow: 'GET' },
                        },
                      },
                    ],
                    { policyNames: [] }
                  );
                  plan.install(app, { action: () => action } as never, async (_binding, _req, reply) => {
                    if (point.startsWith('handler')) fail(reply);
                    if (point.startsWith('error-handler')) throw new Error('trigger-secret');
                  });
                } else app.post('/failure', action);
              },
            });
            try {
              await host.initialize();
              await host.activate();
              const method = kind === 'probe' ? 'GET' : kind === 'generated-head' ? 'HEAD' : 'POST';
              const path = kind === 'probe' ? '/healthz' : kind === 'not-found' ? '/missing/value' : '/failure';
              if (kind === 'probe' && point.startsWith('handler')) probeFault = true;
              const response = await rawRequest(
                `http://127.0.0.1:${host.address()!.port}${path}?password=query-secret`,
                method,
                point === 'parser' ? 'application/fm016-fault' : undefined,
                point === 'parser' ? '{}' : '',
                { Authorization: 'Bearer credential-secret' }
              );
              const bypass =
                (kind === 'probe' && !point.startsWith('handler')) ||
                (kind === 'fault' &&
                  [
                    'serializer',
                    'serializer-after-async-preSerialization',
                    'preSerialization-sync',
                    'preSerialization-async',
                    'onSend-sync',
                    'onSend-async',
                  ].includes(point)) ||
                (kind === 'generated-head' &&
                  [
                    'serializer',
                    'serializer-after-async-preSerialization',
                    'preSerialization-sync',
                    'preSerialization-async',
                  ].includes(point));
              assert.equal(failures, bypass ? 0 : 1, 'faults are written once; send hooks never rerun on fault output');
              const status = bypass ? (kind === 'probe' ? 200 : kind === 'generated-head' ? 405 : 500) : 500;
              assert.equal(response.status, status);
              assert.equal(
                response.statusMessage,
                status === 200 ? 'OK' : status === 405 ? 'Method Not Allowed' : 'Internal Server Error'
              );
              if (status === 500) {
                assert.equal(
                  response.text,
                  method === 'HEAD' ? '' : '{"message":"Internal server error","details":""}'
                );
                assert.equal(response.headers['content-length'], '48');
                assert.equal(response.headers['set-cookie'], undefined);
                assert.equal(response.headers['www-authenticate'], undefined);
                assert.equal(response.headers['content-disposition'], undefined);
                assert.equal(response.headers.allow, undefined);
                assert.equal(response.headers.vary, undefined);
              }
              assert(!inspect([response, logs], { depth: 10 }).includes('secret'));
              assert.equal((await rawRequest(`http://127.0.0.1:${host.address()!.port}/readyz`, 'GET')).status, 200);
            } finally {
              await host.stop();
            }
          });
});

describe('FM-016 redacting logger transport isolation', () => {
  for (const asynchronous of [false, true])
    it(`isolates and counts ${asynchronous ? 'async' : 'sync'} sink failures on every logger level`, async () => {
      const records: Readonly<HttpLogRecord>[] = [];
      let armed = false;
      const host = new FastifyHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }, []), {
        hostname: '127.0.0.1',
        port: 0,
        logger: record => {
          records.push(record);
          if (!armed) return;
          if (asynchronous) return Promise.reject(new Error('sink-secret'));
          throw new Error('sink-secret');
        },
        prepare: async app => {
          app.get('/logging', (req, reply) => {
            // Replacement must fail even before the lazy logger view is read.
            assert.throws(() => {
              (req as any).log = {
                error() {
                  throw new Error('logger-secret');
                },
              };
            }, /cannot replace/);
            assert.throws(() => {
              (reply as any).log = {
                error() {
                  throw new Error('logger-secret');
                },
              };
            }, /cannot replace/);
            for (const logger of [req.log, reply.log, Reflect.get(host, 'fastify').log])
              for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
                logger[level](
                  {
                    req: { url: '/logging?password=query-secret' },
                    err: new Error('exception-secret'),
                    headers: { authorization: 'credential-secret' },
                    body: 'body-secret',
                  },
                  'message-secret'
                );
            return reply.send({ ok: true });
          });
        },
      });
      try {
        await host.initialize();
        await host.activate();
        const baseline = httpLogStats(Reflect.get(host, 'fastify').log);
        records.length = 0;
        armed = true;
        assert.equal(
          (await rawRequest(`http://127.0.0.1:${host.address()!.port}/logging?password=query-secret`, 'GET')).status,
          200
        );
        await new Promise(resolve => setImmediate(resolve));
        const stats = httpLogStats(Reflect.get(host, 'fastify').log);
        assert(records.length > 0, 'the failing transport must actually be invoked');
        assert.equal(stats.failures - baseline.failures, records.length);
        assert.equal(records.length + stats.dropped - baseline.dropped, 21);
        assert(records.every(record => record.path === '/logging' && record.code === 'HTTP_DIAGNOSTIC'));
        assert(!inspect(records).includes('secret'));
      } finally {
        await host.stop();
      }
    });
});
