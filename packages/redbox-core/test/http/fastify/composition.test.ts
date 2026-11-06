import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request, Server } from 'node:http';
import { connect } from 'node:net';
import type { FastifyReply, FastifyRequest } from 'fastify';
import sinon from 'sinon';
import { ApplicationRuntime, type ApplicationModuleFactory } from '../../../dist/application';
import {
  ApplicationStatusController,
  applicationStatusController,
  bindControllerFactory,
  defineController,
  type ApplicationStatusControllerInput,
  type ControllerRegistration,
} from '../../../dist/http';
import { createControllerHost, type ControllerHostOptions } from '../../../dist/http/fastify/composition';
import type { FastifyHost } from '../../../dist/http/fastify/FastifyHost';
import type { RouteRegistration } from '../../../dist/http/fastify/routes';
import { hasActiveHttpRequest, trackHttpRequestWork } from '../../../dist/middleware/requestLifetime';
import { hasActivePersistenceWork, persistenceOperation } from '../../../dist/persistence/runtime';

const registration = { provider: 'core', declaration: applicationStatusController };
const route: RouteRegistration = {
  provider: 'core',
  declaration: {
    name: 'internal-application-status',
    method: 'get',
    path: '/application-status',
    controller: applicationStatusController.name,
    action: 'status',
    access: { kind: 'public' },
  },
};
const path = '/prototype/application-status';

function exchange(port: number, target = path, method = 'GET') {
  const client = request({ hostname: '127.0.0.1', port, path: target, method, agent: false });
  const response = new Promise<{ status: number; text: string; length: string | undefined }>((resolve, reject) => {
    client.on('error', reject);
    client.on('response', incoming => {
      let text = '';
      incoming.setEncoding('utf8');
      incoming.on('data', chunk => (text += chunk));
      incoming.on('error', reject);
      incoming.on('end', () =>
        resolve({ status: incoming.statusCode!, text, length: incoming.headers['content-length'] })
      );
    });
  });
  void response.catch(() => {});
  client.setTimeout(2000, () => client.destroy(new Error('Controller composition HTTP timeout')));
  client.end();
  return { client, response };
}

async function refused(port: number) {
  const socket = connect({ host: '127.0.0.1', port });
  socket.setTimeout(2000, () => socket.destroy(new Error('Controller composition TCP timeout')));
  try {
    await assert.rejects(once(socket, 'connect'), { code: 'ECONNREFUSED' });
  } finally {
    socket.destroy();
  }
}

describe('FM-013 declared controller host composition over a real listener', function () {
  this.timeout(5000);
  const hosts: FastifyHost[] = [];
  const releases: (() => void)[] = [];
  function barrier() {
    const value = Promise.withResolvers<void>();
    releases.push(value.resolve);
    return value;
  }
  afterEach(async () => {
    for (const release of releases.splice(0)) release();
    try {
      for (const host of hosts.splice(0)) await host.stop({ deadlineMs: 2000 });
    } finally {
      sinon.restore();
    }
  });
  async function fixture(
    modules: ApplicationModuleFactory[] = [],
    configure: (application: ApplicationRuntime) => Partial<ControllerHostOptions> = () => ({})
  ) {
    const owner = { config: {}, log: { warn() {} } };
    const application = new ApplicationRuntime(owner, modules);
    const host = await createControllerHost(application, {
      hostname: '127.0.0.1',
      port: 0,
      controllers: [registration],
      bindings: [bindControllerFactory(applicationStatusController, { application })],
      routes: [route],
      routing: { policyNames: [], rootContext: '/prototype' },
      guards: async binding => {
        // This prototype has only an explicitly public route, with no security adapter.
        assert.deepEqual(binding.route.effectivePolicies, []);
        assert.equal(binding.route.declaration.csrf, undefined);
      },
      ...configure(application),
    });
    hosts.push(host);
    return { application, host, owner };
  }

  it('constructs the real core controller once after initialization and admits it only after activation', async () => {
    const entered = barrier(),
      initialized = barrier(),
      activating = barrier(),
      active = barrier();
    let creates = 0,
      calls = 0;
    let observed: ReturnType<ApplicationRuntime['status']> | undefined;
    const listen = sinon.spy(Server.prototype, 'listen');
    const f = await fixture(
      [
        {
          name: 'domain',
          create: () => ({
            initialize: async () => {
              entered.resolve();
              await initialized.promise;
            },
            activate: async () => {
              activating.resolve();
              await active.promise;
            },
            close: async () => {},
          }),
        },
      ],
      application => ({
        bindings: [
          Object.assign(
            () => {
              assert.equal(application.status().state, 'initialized');
              assert.equal(listen.callCount, 0);
              creates++;
              return applicationStatusController.create({
                application: {
                  status() {
                    calls++;
                    observed = application.status();
                    return observed;
                  },
                },
              });
            },
            { factory: applicationStatusController }
          ),
        ],
      })
    );
    assert.equal(creates, 0);
    assert.equal(f.host.address(), null);
    const starting = f.host.initialize();
    assert.equal(f.host.initialize(), starting);
    await entered.promise;
    assert.equal(f.host.address(), null);
    assert.equal(listen.callCount, 0);
    initialized.resolve();
    await starting;
    assert.equal(creates, 1);
    assert.equal(listen.callCount, 1);
    const port = f.host.address()!.port;
    const activation = f.host.activate();
    assert.equal(f.host.activate(), activation);
    await activating.promise;
    for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS']) {
      const response = await exchange(port, path, method).response;
      assert.equal(response.status, 503);
      assert.equal(response.text, method === 'HEAD' ? '' : '{"error":"application-not-ready"}');
    }
    assert.equal(calls, 0);
    assert.equal((await exchange(port, '/healthz').response).text, '{"healthy":true}');
    assert.equal((await exchange(port, '/readyz').response).text, '{"ready":false}');
    active.resolve();
    await activation;
    for (const target of [path, '/PROTOTYPE/APPLICATION-STATUS/']) {
      const response = await exchange(port, target).response;
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.text), JSON.parse(JSON.stringify(observed)));
      assert.equal(observed!.state, 'active');
      assert.equal(observed!.ready, true);
    }
    const head = await exchange(port, path, 'HEAD').response;
    assert.equal(head.status, 200);
    assert.equal(head.text, '');
    assert(Number(head.length) > 0);
    assert.equal(calls, 3, 'implicit HEAD executes the same declared action');
    const options = await exchange(port, path, 'OPTIONS').response;
    assert.equal(options.status, 200);
    assert.equal(options.text, 'GET, HEAD');
    for (const target of ['/application-status', '/prototype/helper'])
      assert.equal((await exchange(port, target).response).status, 404);
    assert.equal(calls, 3);
    await f.host.stop();
    await f.host.stop();
    await refused(port);
    assert.equal(f.host.status().stopped, true);
    assert.equal(f.application.status().cleanupPending, false);
  });

  const invalid: [string, Partial<ControllerHostOptions>, RegExp][] = [
    ['missing binding', { bindings: [] }, /missing controller binding/],
    ['missing controller', { controllers: [], bindings: [] }, /missing controller/],
    [
      'unlisted action',
      { routes: [{ ...route, declaration: { ...route.declaration, action: 'helper' } }] },
      /unlisted/,
    ],
    [
      'unknown policy',
      {
        routes: [{ ...route, declaration: { ...route.declaration, access: { kind: 'policies', names: ['absent'] } } }],
      },
      /unknown policy/,
    ],
    [
      'case/slash collision',
      {
        routes: [
          route,
          { ...route, declaration: { ...route.declaration, name: 'collision', path: '/APPLICATION-STATUS/' } },
        ],
      },
      /collision/,
    ],
  ];
  for (const [name, options, error] of invalid) {
    it(`rejects ${name} offline before application or controller acquisition`, async () => {
      let acquisitions = 0;
      const listen = sinon.spy(Server.prototype, 'listen');
      const hostRegistration = sinon.spy(ApplicationRuntime.prototype, 'registerHttpHost');
      const create = sinon.spy(applicationStatusController, 'create');
      await assert.rejects(
        fixture(
          [
            {
              name: 'domain',
              create: () => {
                acquisitions++;
                throw new Error('offline module acquisition');
              },
            },
          ],
          () => options
        ),
        error
      );
      assert.equal(acquisitions, 0);
      assert.equal(create.callCount, 0);
      assert.equal(hostRegistration.callCount, 0);
      assert.equal(listen.callCount, 0);
    });
  }

  it('rejects a non-callable selected action after initialization, before listen, and cleans the application', async () => {
    let closed = 0;
    const broken: ControllerRegistration = {
      name: applicationStatusController.name,
      actions: ['status'],
      create: () => ({ status: 1 }),
    };
    const listen = sinon.spy(Server.prototype, 'listen');
    const f = await fixture(
      [
        {
          name: 'domain',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closed++;
            },
          }),
        },
      ],
      application => ({
        controllers: [{ provider: 'core', declaration: broken }],
        bindings: [
          Object.assign(
            () => {
              assert.equal(application.status().state, 'initialized');
              return broken.create(undefined as never);
            },
            { factory: broken }
          ),
        ],
      })
    );
    await assert.rejects(f.host.initialize(), /missing or non-callable/);
    assert.equal(closed, 1);
    assert.equal(listen.callCount, 0);
    assert.equal(f.host.status().failure, 'initialize');
    assert.equal(f.host.status().stopped, true);
  });

  it('stop during initialization retains acquired collaborators and never constructs a controller or listens', async () => {
    const entered = barrier(),
      held = barrier();
    let closed = 0;
    const create = sinon.spy(applicationStatusController, 'create');
    const listen = sinon.spy(Server.prototype, 'listen');
    const f = await fixture([
      {
        name: 'domain',
        create: () => ({
          initialize: async () => {
            entered.resolve();
            await held.promise;
          },
          close: async () => {
            closed++;
          },
        }),
      },
    ]);
    const starting = f.host.initialize();
    void starting.catch(() => {});
    await entered.promise;
    await assert.rejects(f.host.stop({ deadlineMs: 30 }), /deadline/);
    assert.equal(closed, 0);
    assert.equal(create.callCount, 0);
    held.resolve();
    await assert.rejects(starting, /stop has begun/);
    await f.host.stop();
    assert.equal(closed, 1);
    assert.equal(create.callCount, 0);
    assert.equal(listen.callCount, 0);
  });

  for (const mode of [
    'returned-after-response',
    'tracked-after-response',
    'disconnected-action',
    'reply-then',
    'store-callback',
  ]) {
    it(`retains ${mode} through the bound action, transport close, deadline and retry`, async () => {
      const entered = barrier(),
        held = barrier();
      let completed = 0,
        closed = 0;
      const close = sinon.spy(Server.prototype, 'close');
      const f = await fixture(
        [
          {
            name: 'borrowed',
            create: () => ({
              initialize: async () => {},
              close: async () => {
                assert.equal(completed, 1);
                closed++;
              },
            }),
          },
        ],
        application => {
          class RetainedStatusController extends ApplicationStatusController {
            public override async status(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
              const complete = async () => {
                entered.resolve();
                await held.promise;
                assert.equal(closed, 0);
                assert(hasActiveHttpRequest(f.owner));
                assert(hasActivePersistenceWork(f.owner));
                await persistenceOperation(f.owner, async () => {
                  completed++;
                });
              };
              if (mode === 'reply-then') {
                reply.then(complete, complete);
                super.status(request, reply);
              } else if (mode === 'store-callback') {
                // Pending store-callback ownership seam only; native sessions are FM-014.
                trackHttpRequestWork(
                  request,
                  new Promise<void>((resolve, reject) => {
                    void complete().then(() => resolve(), reject);
                  })
                );
              } else if (mode === 'disconnected-action') {
                await complete();
              } else {
                super.status(request, reply);
                if (mode === 'tracked-after-response') trackHttpRequestWork(request, complete());
                else await complete();
              }
              return undefined;
            }
          }
          const factory = defineController({
            name: 'RetainedStatus',
            actions: ['status'],
            create: (input: ApplicationStatusControllerInput) => new RetainedStatusController(input),
          });
          return {
            controllers: [{ provider: 'core', declaration: factory }],
            bindings: [bindControllerFactory(factory, { application })],
            routes: [{ ...route, declaration: { ...route.declaration, controller: factory.name } }],
          };
        }
      );
      await f.host.initialize();
      await f.host.activate();
      const port = f.host.address()!.port;
      const sending = exchange(port);
      try {
        await entered.promise;
        if (mode === 'disconnected-action' || mode === 'store-callback') {
          const disconnected = new Promise<void>(resolve => sending.client.once('close', () => resolve()));
          sending.client.destroy();
          await disconnected;
        } else assert.equal((await sending.response).status, 200);
        const stopping = f.host.stop({ deadlineMs: 30 });
        assert.equal(f.host.stop(), stopping);
        assert.equal(f.host.status().ready, false);
        await assert.rejects(stopping, /deadline/);
        assert.equal(closed, 0);
        assert.equal(completed, 0);
        assert.equal(f.application.status().cleanupPending, true);
        assert.equal(f.host.status().stopFailed, true);
        assert.equal(f.host.address(), null, 'transport closure cannot release accepted action/callback work');
        assert.equal(close.callCount, 1);
        held.resolve();
        await f.host.stop();
        await f.host.stop();
        assert.equal(close.callCount, 1);
        assert.equal(completed, 1);
        assert.equal(closed, 1);
        assert.equal(f.application.status().cleanupPending, false);
        assert.equal(f.host.status().stopFailed, false);
      } finally {
        sending.client.destroy();
      }
    });
  }

  it('retries failed consumer cleanup without closing its declared dependency or closing transport twice', async () => {
    const events: string[] = [];
    let attempts = 0;
    const close = sinon.spy(Server.prototype, 'close');
    const f = await fixture([
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
            if (++attempts === 1) throw new Error('consumer cleanup failure');
          },
        }),
      },
    ]);
    await f.host.initialize();
    await f.host.activate();
    assert.equal((await exchange(f.host.address()!.port).response).status, 200);
    await assert.rejects(f.host.stop(), /Persistence resource close failed/);
    assert.deepEqual(events, ['consumer']);
    assert.equal(f.host.status().stopped, false);
    assert.equal(f.host.status().stopFailed, true);
    await f.host.stop();
    await f.host.stop();
    assert.deepEqual(events, ['consumer', 'consumer', 'dependency']);
    assert.equal(close.callCount, 1);
    assert.equal(f.host.status().stopped, true);
  });
});
