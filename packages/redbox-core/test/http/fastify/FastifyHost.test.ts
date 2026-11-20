import { assertGoldenNext, goldenControls } from './goldenContracts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import dns from 'node:dns';
import http from 'node:http';
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import sinon from 'sinon';
import { ApplicationRuntime, type ApplicationModuleFactory } from '../../../dist/application';
import { FastifyHost, type FastifyHostOptions } from '../../../dist/http/fastify/FastifyHost';

const deferred = () => Promise.withResolvers<void>();
const turn = () => new Promise<void>(done => setImmediate(done));

function exchange(port: number, path = '/probe', method = 'GET', body?: string, hostname = '127.0.0.1') {
  return new Promise<{ status: number; text: string; headers: IncomingHttpHeaders }>((done, reject) => {
    const req = request(
      {
        hostname,
        port,
        path,
        method,
        agent: false,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
      },
      res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (text += chunk));
        res.on('error', reject);
        res.on('end', () => done({ status: res.statusCode!, text, headers: res.headers }));
      }
    );
    req.setTimeout(2000, () => req.destroy(new Error('HTTP test request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

/** Preserve the exact request target; neither an HTTP client nor URL may normalize it. */
function rawExchange(port: number, target: string, method: string) {
  return new Promise<{ status: string; headers: Record<string, string>; text: string }>((done, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    let data = '';
    socket.setTimeout(2000, () => socket.destroy(new Error('Raw HTTP request timed out')));
    socket.on('error', reject);
    socket.on('data', chunk => (data += chunk));
    socket.on('connect', () => {
      socket.end(`${method} ${target} HTTP/1.1\r\nHost: fixture.invalid\r\nConnection: close\r\n\r\n`);
    });
    socket.on('end', () => {
      // Node's default CONNECT handling closes the socket without an HTTP response.
      if (!data) return done({ status: '', headers: {}, text: '' });
      const end = data.indexOf('\r\n\r\n');
      const [status, ...fields] = data.slice(0, end).split('\r\n');
      const headers: Record<string, string> = {};
      for (const field of fields) {
        const colon = field.indexOf(':');
        const name = field.slice(0, colon).toLowerCase();
        if (name !== 'date') headers[name] = field.slice(colon + 1).trim();
      }
      done({ status, headers, text: data.slice(end + 4) });
    });
  });
}

async function listen(server: Server) {
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  const address = server.address();
  assert(address && typeof address === 'object');
  return address.port;
}

async function close(server: Server) {
  await new Promise<void>((done, reject) => server.close(error => (error ? reject(error) : done())));
}

async function ephemeralPort() {
  const reservation = createServer();
  const port = await listen(reservation);
  await close(reservation);
  return port;
}

async function refused(port: number, hostname = '127.0.0.1') {
  await new Promise<void>((done, reject) => {
    const socket = connect({ host: hostname, port });
    socket.setTimeout(2000, () => socket.destroy(new Error('TCP test connection timed out')));
    socket.on('connect', () => {
      socket.destroy();
      reject(new Error('A socket was bound before preparation completed'));
    });
    socket.on('error', error => {
      try {
        assert.equal((error as NodeJS.ErrnoException).code, 'ECONNREFUSED');
        done();
      } catch (failure) {
        reject(failure);
      }
    });
  });
}

describe('internal late-listening Fastify host', function () {
  this.timeout(5000);
  const hosts: FastifyHost[] = [];
  const releases: (() => void)[] = [];
  afterEach(async () => {
    for (const release of releases.splice(0)) release();
    for (const host of hosts.splice(0)) await host.stop();
  });
  function barrier() {
    const value = deferred();
    releases.push(value.resolve);
    return value;
  }
  function compose(
    modules: ApplicationModuleFactory[] = [],
    prepare: FastifyHostOptions['prepare'] = async app => {
      app.get('/probe', async () => ({ ok: true }));
    },
    port = 0
  ) {
    const application = new ApplicationRuntime({ config: {}, log: { warn() {} } }, modules);
    const host = new FastifyHost(application, { hostname: '127.0.0.1', port, prepare });
    hosts.push(host);
    return { application, host };
  }
  function port(host: FastifyHost) {
    const address = host.address();
    assert(address);
    return address.port;
  }

  it('reaps a keep-alive connection that becomes idle after a held request drains during stop retry', async () => {
    const started = barrier(),
      release = barrier();
    let closed = 0;
    const { host } = compose(
      [
        {
          name: 'borrowed',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closed++;
            },
          }),
        },
      ],
      async app => {
        app.get('/probe', async (_request, reply) => {
          started.resolve();
          await release.promise;
          assert.equal(closed, 0, 'Accepted request retains its borrowed module');
          reply.header('connection', 'keep-alive');
          return { complete: true };
        });
      }
    );
    const agent = new http.Agent({ keepAlive: true });
    try {
      await host.initialize();
      await host.activate();
      const chosenPort = port(host);
      const response = new Promise<{ text: string; connection: string | undefined }>((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port: chosenPort, path: '/probe', agent }, res => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            text += chunk;
          });
          res.on('error', reject);
          res.on('end', () => resolve({ text, connection: res.headers.connection }));
        });
        req.on('error', reject);
        req.end();
      });
      await started.promise;
      await assert.rejects(host.stop({ deadlineMs: 20 }), /deadline/i);
      assert.equal(closed, 0);
      release.resolve();
      assert.deepEqual(await response, { text: '{"complete":true}', connection: 'keep-alive' });
      await host.stop({ deadlineMs: 1000 });
      assert.equal(closed, 1);
      assert.equal(host.status().stopped, true);
      await refused(chosenPort);
    } finally {
      release.resolve();
      agent.destroy();
      await host.stop();
    }
  });

  for (const family of [4, 6]) {
    it(`uses only the prepared server with dual-stack localhost DNS (IPv${family} first)`, async () => {
      const addresses = [
        { address: '127.0.0.1', family: 4 },
        { address: '::1', family: 6 },
      ].sort(address => (address.family === family ? -1 : 1));
      const originalLookup = dns.lookup;
      let dualLookups = 0;
      const lookup = sinon.stub(dns, 'lookup').callsFake(((...args: unknown[]) => {
        if (args[0] !== 'localhost') return Reflect.apply(originalLookup, dns, args);
        const callback = args.at(-1);
        assert(typeof callback === 'function');
        const all = typeof args[1] === 'object' && args[1] !== null && Reflect.get(args[1], 'all');
        process.nextTick(() => {
          if (all) {
            dualLookups++;
            callback(null, addresses);
          } else callback(null, addresses[0].address, addresses[0].family);
        });
      }) as typeof dns.lookup);
      const listening = sinon.spy(http.Server.prototype, 'listen');
      let preparedServer: Server | undefined;
      let preparations = 0,
        closed = 0,
        closeHooks = 0;
      const host = new FastifyHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }), {
        hostname: 'localhost',
        port: 0,
        prepare: async (app, server) => {
          preparations++;
          preparedServer = server;
          assert.equal(app.server, server);
          server.on('close', () => closed++);
          app.addHook('onClose', async () => {
            closeHooks++;
          });
          app.get('/probe', async () => ({ ok: true }));
        },
      });
      try {
        await new Promise<void>((done, reject) => {
          dns.lookup('localhost', { all: true }, (error, resolved) => {
            if (error) return reject(error);
            assert.deepEqual(resolved, addresses);
            done();
          });
        });
        await host.initialize();
        const chosenPort = port(host);
        assert(dualLookups >= 1, 'the DNS fixture supplies both real loopback addresses');
        assert.equal(listening.callCount, 1, 'Fastify must never create a secondary listening server');
        assert.equal(listening.firstCall.thisValue, preparedServer);
        assert.equal(preparations, 1);
        assert.equal(host.address()!.address, addresses[0].address);
        assert.equal((await exchange(chosenPort, '/probe', 'GET', undefined, addresses[0].address)).status, 503);
        await refused(chosenPort, addresses[1].address);
        await host.activate();
        assert.equal((await exchange(chosenPort, '/probe', 'GET', undefined, addresses[0].address)).status, 200);
        await host.stop();
        await host.stop();
        assert.deepEqual([closed, closeHooks], [1, 1]);
        assert.equal(preparedServer!.listening, false);
        for (const address of addresses) await refused(chosenPort, address.address);
      } finally {
        try {
          await host.stop();
        } finally {
          listening.restore();
          lookup.restore();
        }
      }
    });
  }

  for (const outcome of ['failure', 'stop'] as const) {
    it(`retains startup ownership without listening during hostname resolution (${outcome})`, async () => {
      const entered = barrier();
      const failure = Object.assign(new Error('injected lookup failure'), { code: 'ENOTFOUND' });
      const originalLookup = dns.lookup;
      let completeLookup = () => {};
      const lookup = sinon.stub(dns, 'lookup').callsFake(((...args: unknown[]) => {
        if (args[0] !== 'lookup.invalid') return Reflect.apply(originalLookup, dns, args);
        const callback = args.at(-1);
        assert(typeof callback === 'function');
        completeLookup = () => callback(outcome === 'failure' ? failure : null, '127.0.0.1', 4);
        entered.resolve();
      }) as typeof dns.lookup);
      let closed = 0;
      const application = new ApplicationRuntime({ config: {}, log: { warn() {} } }, [
        {
          name: 'resource',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closed++;
            },
          }),
        },
      ]);
      const host = new FastifyHost(application, { hostname: 'lookup.invalid', port: 0, prepare: async () => {} });
      const startup = assert.rejects(host.initialize(), outcome === 'failure' ? failure : /stop has begun/);
      try {
        await entered.promise;
        assert.equal(host.status().prepared, true);
        assert.equal(host.address(), null);
        const stopping = outcome === 'stop' ? host.stop() : undefined;
        await turn();
        assert.equal(closed, 0);
        completeLookup();
        await startup;
        await stopping;
        assert.equal(closed, 1);
        assert.equal(host.status().stopped, true);
        assert.equal(host.address(), null);
      } finally {
        completeLookup();
        try {
          await host.stop();
        } finally {
          lookup.restore();
        }
      }
    });
  }

  const requestTargets: Record<
    string,
    readonly (readonly [string, string, 'healthy' | 'ready' | 'miss' | 'connect'])[]
  > = {
    absolute: [
      ['GET', 'http://localhost:PORT/healthz', 'healthy'],
      ['GET', 'http://localhost:PORT/readyz', 'ready'],
      ['GET', 'HTTP://localhost:PORT/healthz?query=yes', 'healthy'],
      ['GET', 'https://[::1]:PORT/readyz?query=yes', 'ready'],
      ['HEAD', 'http://localhost:PORT/healthz', 'miss'],
      ['OPTIONS', 'http://localhost:PORT/readyz', 'miss'],
    ],
    asterisk: [
      ['OPTIONS', '*', 'miss'],
      ['GET', '*', 'miss'],
    ],
    authority: [['CONNECT', 'fixture.invalid:443', 'connect']],
    slashes: [
      ['GET', '//healthz', 'miss'],
      ['GET', '///readyz', 'miss'],
      ['GET', '//fixture.invalid/healthz', 'miss'],
      ['GET', 'http://localhost:PORT//readyz', 'miss'],
    ],
    query: [
      ['GET', '/healthz?x=%ZZ&next=/readyz', 'healthy'],
      ['GET', '/readyz??/healthz', 'ready'],
      ['GET', 'http://localhost:PORT/healthz?x=%ZZ', 'healthy'],
      ['GET', '/missing?next=/healthz', 'miss'],
    ],
    encoded: [
      ['GET', '/%68ealthz', 'miss'],
      ['GET', '/ready%7A', 'miss'],
      ['GET', '/%2fhealthz', 'miss'],
      ['GET', '/%2568ealthz', 'miss'],
      ['GET', '/healthz%3Fquery', 'miss'],
      ['GET', '/readyz%23fragment', 'miss'],
      ['GET', '/healthz%ZZ', 'miss'],
      ['GET', 'http://localhost:PORT/%68ealthz', 'miss'],
    ],
    exact: [
      ['GET', 'http://localhost:PORT/HEALTHZ', 'miss'],
      ['GET', 'http://localhost:PORT/readyz/', 'miss'],
      ['GET', 'http://localhost:PORT/research/healthz', 'miss'],
      ['GET', '/prefix/../healthz', 'miss'],
      ['GET', 'http://localhost:PORT/prefix/../readyz', 'miss'],
    ],
    fragment: [
      ['GET', '/healthz#fragment', 'healthy'],
      ['GET', 'http://localhost:PORT/readyz#fragment', 'ready'],
    ],
  };
  for (const [form, targets] of Object.entries(requestTargets)) {
    it(`enforces native admission and probes for ${form} request-target forms over raw sockets`, async () => {
      const observations = [];
      for (const Host of [FastifyHost]) {
        const application = new ApplicationRuntime({ config: {}, log: { warn() {} } });
        const host = new Host(application, { hostname: '127.0.0.1', port: 0, prepare: async () => {} });
        try {
          await host.initialize();
          const snapshots = [];
          for (const active of [false, true]) {
            if (active) await host.activate();
            for (const [method, target, kind] of targets) {
              const response = await rawExchange(
                host.address()!.port,
                target.replace('PORT', String(host.address()!.port)),
                method
              );
              snapshots.push(response);
              const status =
                kind === 'connect'
                  ? ''
                  : kind === 'healthy' || (kind === 'ready' && active)
                    ? '200'
                    : active
                      ? '404'
                      : '503';
              assert.equal(
                response.status.split(' ')[1] ?? '',
                status,
                `${Host.name}: ${method} ${target}, active=${active}`
              );
              if (kind === 'healthy') assert.equal(response.text, '{"healthy":true}');
              if (kind === 'ready') assert.equal(response.text, JSON.stringify({ ready: active }));
              if (kind === 'connect') assert.deepEqual(response, { status: '', headers: {}, text: '' });
            }
          }
          assert.equal(snapshots.length, targets.length * 2);
          observations.push(snapshots);
        } finally {
          await host.stop();
        }
      }
      assertGoldenNext('fastify-host', observations[0]);
    });
  }

  it('initializes the application, prepares the complete plugin graph, then binds exactly one server', async () => {
    const initializing = barrier(),
      initialized = barrier(),
      preparing = barrier(),
      prepared = barrier(),
      readying = barrier(),
      ready = barrier();
    const chosenPort = await ephemeralPort();
    let server: Server | undefined;
    let listeners = 0,
      preparations = 0;
    const { host, application } = compose(
      [
        {
          name: 'domain',
          create: () => ({
            initialize: async () => {
              initializing.resolve();
              await initialized.promise;
            },
            close: async () => {},
          }),
        },
      ],
      async (app, ownedServer) => {
        preparations++;
        assert.equal(application.status().state, 'initialized');
        assert.equal(app.server, ownedServer);
        server = ownedServer;
        server.on('listening', () => listeners++);
        preparing.resolve();
        await prepared.promise;
        app.register(async plugin => {
          plugin.register(async nested => {
            nested.addHook('onReady', async () => {
              readying.resolve();
              await ready.promise;
            });
            nested.get('/probe', async () => ({ ok: true }));
          });
        });
      },
      chosenPort
    );
    assert.deepEqual(host.status(), {
      ready: false,
      listening: false,
      prepared: false,
      stopped: false,
      stopFailed: false,
      failure: undefined,
      application: application.status(),
      logging: {
        degraded: false,
        diagnostics: 0,
        dropped: 0,
        failures: 0,
        fallbackFailures: 0,
        fallbackWrites: 0,
        pending: 0,
      },
    });
    await assert.rejects(host.activate(), /Await host initialization/);
    const work = host.initialize();
    assert.equal(host.initialize(), work);
    for (const [entered, release] of [
      [initializing, initialized],
      [preparing, prepared],
      [readying, ready],
    ]) {
      await entered.promise;
      assert.equal(host.address(), null);
      assert.equal(host.status().listening, false);
      assert.equal(host.status().prepared, false);
      assert.equal(listeners, 0);
      await refused(chosenPort);
      release.resolve();
    }
    await work;
    assert.equal(host.status().prepared, true);
    assert.equal(host.status().ready, false);
    assert.deepEqual(server!.address(), host.address());
    assert.equal(port(host), chosenPort);
    assert.equal(listeners, 1);
    assert.equal(preparations, 1);
    assert.equal((await exchange(chosenPort)).status, 503);
    const activating = host.activate();
    assert.equal(host.activate(), activating);
    await activating;
    assert.deepEqual(JSON.parse((await exchange(chosenPort)).text), { ok: true });
    assert.equal(host.status().ready, true);
    assert.deepEqual(host.status().application, application.status());
    await host.stop();
    assert.equal(host.address(), null);
    await refused(chosenPort);
  });

  it('refuses concurrent ordinary requests before parsing, plugin hooks, actions and fallback through activation', async () => {
    const entered = barrier(),
      release = barrier();
    let calls = 0,
      hooks = 0,
      fallbacks = 0;
    const { host } = compose(
      [
        {
          name: 'workers',
          create: () => ({
            initialize: async () => {},
            activate: async () => {
              entered.resolve();
              await release.promise;
            },
            close: async () => {},
          }),
        },
      ],
      async app => {
        app.register(
          async plugin => {
            plugin.addHook('onRequest', async () => {
              hooks++;
            });
            plugin.route({
              method: ['GET', 'POST', 'HEAD', 'OPTIONS'],
              url: '/probe',
              handler: async () => {
                calls++;
                return { ok: true };
              },
            });
            plugin.setNotFoundHandler((_request, reply) => {
              fallbacks++;
              return reply.code(404).send({ error: 'not-found' });
            });
          },
          { prefix: '/plugin' }
        );
      }
    );
    await host.initialize();
    const chosenPort = port(host);
    const activation = host.activate();
    await entered.promise;
    const requests = Array.from({ length: 32 }, (_, index) => {
      const method = ['GET', 'POST', 'HEAD', 'OPTIONS'][index % 4];
      return exchange(
        chosenPort,
        index % 3 ? '/plugin/probe' : '/plugin/missing',
        method,
        method === 'POST' ? '{broken' : undefined
      );
    });
    for (const [index, response] of (await Promise.all(requests)).entries()) {
      assert.equal(response.status, 503);
      assert.equal(response.text, index % 4 === 2 ? '' : '{"error":"application-not-ready"}');
      assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
      assert.equal(response.headers.etag, undefined);
    }
    assert.deepEqual([calls, hooks, fallbacks], [0, 0, 0]);
    assert.deepEqual(JSON.parse((await exchange(chosenPort, '/healthz')).text), { healthy: true });
    assert.equal((await exchange(chosenPort, '/readyz')).status, 503);
    release.resolve();
    await activation;
    assert.equal((await exchange(chosenPort, '/plugin/probe')).status, 200);
    assert.deepEqual([calls, hooks, fallbacks], [1, 1, 0]);
    assert.deepEqual(JSON.parse((await exchange(chosenPort, '/readyz')).text), { ready: true });
    assert.equal((await exchange(chosenPort, '/plugin/missing')).status, 404);
    assert.equal(fallbacks, 1);
  });

  it('enforces exact GET probe, admission and host-miss status/body/header contracts over real sockets', async () => {
    const targets = [
      ...['/healthz', '/readyz'].flatMap(path => [
        [path, 'GET'],
        [path + '?query=yes', 'GET'],
        [path.toUpperCase(), 'GET'],
        [path + '/', 'GET'],
        ['/research' + path, 'GET'],
        [path, 'HEAD'],
        [path, 'OPTIONS'],
        [path, 'POST'],
      ]),
      ['/absent', 'GET'],
      ['/absent', 'HEAD'],
    ];
    const observations = [];
    // Separate disposable runtimes/runs: these hosts share no application state.
    for (const Host of [FastifyHost]) {
      const application = new ApplicationRuntime({ config: {}, log: { warn() {} } });
      const host = new Host(application, { hostname: '127.0.0.1', port: 0, prepare: async () => {} });
      try {
        await host.initialize();
        const chosenPort = host.address()!.port;
        const snapshots = [];
        for (const active of [false, true]) {
          if (active) await host.activate();
          for (const [path, method] of targets) {
            const result = await exchange(chosenPort, path, method);
            const { date: _date, ...headers } = result.headers;
            snapshots.push({ ...result, headers });
          }
        }
        assert.equal(snapshots.length, targets.length * 2);
        for (const [index, result] of snapshots.entries()) {
          const [path, method] = targets[index % targets.length];
          const active = index >= targets.length;
          const status =
            method === 'GET' && path.split('?')[0] === '/healthz'
              ? 200
              : method === 'GET' && path.split('?')[0] === '/readyz'
                ? active
                  ? 200
                  : 503
                : active
                  ? 404
                  : 503;
          assert.equal(result.status, status, `${active} ${method} ${path}`);
          if (method === 'HEAD') assert.equal(result.text, '');
        }
        observations.push(snapshots);
      } finally {
        await host.stop();
      }
    }
    assertGoldenNext('fastify-host', observations[0]);
  });

  for (const phase of ['initialize', 'prepare', 'plugin', 'ready', 'listen', 'activate'] as const) {
    it(`closes admission and owned resources after ${phase} failure, preserving the original error`, async () => {
      const occupied = createServer();
      const chosenPort = phase === 'listen' ? await listen(occupied) : await ephemeralPort();
      const failure = new Error(`injected ${phase}`);
      let closed = 0,
        bound = 0;
      const { host, application } = compose(
        [
          {
            name: 'resource',
            create: () => ({
              initialize: async () => {
                if (phase === 'initialize') throw failure;
              },
              activate: async () => {
                if (phase === 'activate') throw failure;
              },
              close: async () => {
                closed++;
              },
            }),
          },
        ],
        async (app, server) => {
          server.on('listening', () => bound++);
          if (phase === 'prepare') throw failure;
          app.register(async plugin => {
            if (phase === 'plugin') throw failure;
            plugin.addHook('onReady', async () => {
              if (phase === 'ready') throw failure;
            });
            plugin.get('/probe', async () => ({ ok: true }));
          });
        },
        chosenPort
      );
      try {
        if (phase === 'activate') {
          await host.initialize();
          assert.equal((await exchange(chosenPort)).status, 503);
          await assert.rejects(host.activate(), error => error === failure);
        } else if (phase === 'listen') {
          await assert.rejects(host.initialize(), { code: 'EADDRINUSE' });
        } else await assert.rejects(host.initialize(), error => error === failure);
        assert.equal(host.status().failure, phase === 'activate' ? 'activate' : 'initialize');
        assert.equal(host.status().ready, false);
        assert.equal(host.status().stopped, true);
        assert.equal(application.status().ready, false);
        assert.equal(host.address(), null);
        assert.equal(closed, 1);
        assert.equal(bound, phase === 'activate' ? 1 : 0);
        await assert.rejects(host.initialize(), /fresh host/);
        await assert.rejects(host.activate(), /fresh host/);
      } finally {
        if (occupied.listening) await close(occupied);
      }
      await refused(chosenPort);
    });
  }

  it('reports failed activation as unhealthy while cleanup is pending and refuses every ordinary request', async () => {
    const closing = barrier(),
      release = barrier();
    const failure = new Error('activation failed');
    const { host } = compose(
      [
        {
          name: 'worker',
          create: () => ({
            initialize: async () => {},
            activate: async () => {
              throw failure;
            },
            close: async () => {},
          }),
        },
      ],
      async app => {
        app.addHook('preClose', async () => {
          closing.resolve();
          await release.promise;
        });
        app.get('/probe', async () => ({ ok: true }));
      }
    );
    await host.initialize();
    const chosenPort = port(host);
    const activation = assert.rejects(host.activate(), error => error === failure);
    await closing.promise;
    const health = await exchange(chosenPort, '/healthz');
    assert.equal(health.status, 503);
    assert.equal(health.text, '{"healthy":false}');
    assert.equal((await exchange(chosenPort, '/readyz')).text, '{"ready":false}');
    assert.equal((await exchange(chosenPort)).text, '{"error":"application-not-ready"}');
    release.resolve();
    await activation;
    await refused(chosenPort);
  });

  for (const phase of ['initialize', 'prepare', 'ready', 'activate'] as const) {
    it(`closes admission immediately and waits for ${phase} to settle when stopped`, async () => {
      const entered = barrier(),
        release = barrier();
      let settled = false,
        closed = 0,
        prepared = 0,
        activated = 0,
        bound = 0;
      const stage = async () => {
        entered.resolve();
        await release.promise;
        assert.equal(closed, 0, 'partially acquired collaborators must stay owned');
        settled = true;
      };
      const chosenPort = await ephemeralPort();
      const { host } = compose(
        [
          {
            name: 'resource',
            create: () => ({
              initialize: async () => {
                if (phase === 'initialize') await stage();
              },
              activate: async () => {
                activated++;
                if (phase === 'activate') await stage();
              },
              close: async () => {
                assert.equal(settled, true);
                closed++;
              },
            }),
          },
        ],
        async (app, server) => {
          prepared++;
          server.on('listening', () => bound++);
          if (phase === 'prepare') await stage();
          app.addHook('onReady', async () => {
            if (phase === 'ready') await stage();
          });
          app.get('/probe', async () => ({ ok: true }));
        },
        chosenPort
      );
      let startup: Promise<void>;
      if (phase === 'activate') {
        await host.initialize();
        startup = assert.rejects(host.activate(), /stop has begun/);
      } else startup = assert.rejects(host.initialize(), /stop has begun/);
      await entered.promise;
      const stopping = host.stop();
      assert.equal(host.stop(), stopping);
      assert.equal(host.status().ready, false);
      if (phase === 'activate') {
        assert.equal((await exchange(chosenPort)).status, 503);
        assert.equal((await exchange(chosenPort, '/readyz')).status, 503);
        assert.equal((await exchange(chosenPort, '/healthz')).status, 200);
      } else await refused(chosenPort);
      await turn();
      assert.equal(closed, 0);
      release.resolve();
      await startup;
      await stopping;
      assert.equal(closed, 1);
      assert.equal(bound, phase === 'activate' ? 1 : 0);
      assert.equal(prepared, phase === 'initialize' ? 0 : 1);
      assert.equal(activated, phase === 'activate' ? 1 : 0);
      assert.equal(host.status().stopped, true);
      await refused(chosenPort);
    });
  }

  it('handles stop in the actual listening event without opening admission or leaking a later listener', async () => {
    let stopping: Promise<void> | undefined;
    const { host } = compose([], async (_app, server) => {
      server.once('listening', () => {
        stopping = host.stop();
      });
    });
    await assert.rejects(host.initialize(), /stop has begun/);
    assert(stopping);
    await stopping;
    assert.equal(host.address(), null);
    assert.equal(host.status().stopped, true);
    assert.equal(host.status().ready, false);
  });

  it('stops before initialization without running preparation, and successful stop is idempotent', async () => {
    let preparations = 0;
    const { host } = compose([], async () => {
      preparations++;
    });
    await host.stop();
    await host.stop();
    assert.equal(preparations, 0);
    assert.equal(host.address(), null);
    assert.equal(host.status().stopped, true);
    await assert.rejects(host.initialize(), /fresh host/);
  });

  it('gates an active listener immediately on stop while transport quiesces', async () => {
    const closing = barrier(),
      release = barrier();
    const { host } = compose([], async app => {
      app.get('/probe', async () => ({ ok: true }));
      app.addHook('preClose', async () => {
        closing.resolve();
        await release.promise;
      });
    });
    await host.initialize();
    await host.activate();
    const chosenPort = port(host);
    assert.equal((await exchange(chosenPort)).status, 200);
    const stopping = host.stop();
    assert.equal(host.status().ready, false);
    await closing.promise;
    assert.equal((await exchange(chosenPort)).text, '{"error":"application-not-ready"}');
    assert.equal((await exchange(chosenPort, '/readyz')).text, '{"ready":false}');
    assert.equal((await exchange(chosenPort, '/healthz')).text, '{"healthy":true}');
    release.resolve();
    await stopping;
    assert.equal(host.status().stopped, true);
    await refused(chosenPort);
  });

  for (const [signal, mode] of [
    ['SIGINT', 'active'],
    ['SIGTERM', 'active'],
    ['SIGTERM', 'initializing'],
    ['SIGTERM', 'retry'],
  ] as const) {
    it(`owns opt-in ${signal} handling at the compiled executable boundary (${mode})`, async () => {
      const started = Date.now();
      let readyAt: number | undefined;
      const child = spawn(
        process.execPath,
        [
          '-e',
          `
          const assert = require('node:assert/strict');
          const mode = ${JSON.stringify(mode)};
          process.on('message', () => {});
          const signals = ['SIGINT', 'SIGTERM'];
          const before = signals.map(signal => process.listenerCount(signal));
          // Exercise the concrete lifecycle owner. The public barrel additionally
          // loads the Umzug migration graph, unrelated to signal ownership.
          const { ApplicationRuntime } = require('./dist/application/Application');
          const { FastifyHost } = require('./dist/http/fastify/FastifyHost');
          let release;
          const pending = new Promise(done => { release = done; });
          let closes = 0;
          const application = new ApplicationRuntime({ config: {}, log: { warn() {} } }, [{
            name: 'probe', create: () => ({
              async initialize() {
                if (mode === 'initializing') { process.send('ready'); await pending; }
              },
              quiesce() { release(); },
              async close() {
                closes++;
                if (mode === 'retry' && closes === 1) throw new Error('retry cleanup');
              }
            })
          }]);
          const host = new FastifyHost(application, { hostname: '127.0.0.1', port: 0, prepare: async () => {} });
          assert.deepEqual(signals.map(signal => process.listenerCount(signal)), before);
          const callbacks = {
            onStopped() {
              assert.equal(host.status().stopped, true);
              assert.equal(host.status().ready, false);
              assert.equal(host.address(), null);
              assert.deepEqual(signals.map(signal => process.listenerCount(signal)), before);
              assert.equal(closes, mode === 'retry' ? 2 : 1);
              console.log('stopped'); process.disconnect();
            },
            onError(error) {
              assert.equal(mode, 'retry');
              assert.match(error.message, /cleanup|retry/);
              assert.equal(host.status().stopFailed, true);
              assert.deepEqual(signals.map(signal => process.listenerCount(signal)), before.map(count => count + 1));
              process.send('retry');
            }
          };
          const remove = host.installSignalHandlers(callbacks);
          assert.equal(host.installSignalHandlers(callbacks), remove);
          host.initialize().then(async () => {
            await host.activate(); process.send('ready');
          }).catch(error => {
            assert.equal(mode, 'initializing');
            assert.match(error.message, /stop has begun/);
          });
          `,
        ],
        { cwd: resolve(__dirname, '../../..'), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
      );
      let stdout = '',
        stderr = '';
      child.stdout!.on('data', chunk => (stdout += chunk));
      child.stderr!.on('data', chunk => (stderr += chunk));
      const exited = once(child, 'exit');
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_done, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Signal child timed out during ' + (readyAt === undefined ? 'cold startup' : 'shutdown') + ': ' + stderr
              )
            ),
          3500
        );
      });
      const message = () =>
        Promise.race([
          once(child, 'message').then(([value]) => value),
          exited.then(([code]) => {
            throw new Error(`Signal child exited early (${code}): ${stderr}`);
          }),
          deadline,
        ]);
      try {
        assert.equal(await message(), 'ready');
        readyAt = Date.now();
        const next = mode === 'retry' ? message() : undefined;
        child.kill(signal);
        if (next) {
          assert.equal(await next, 'retry');
          child.kill(signal);
        }
        const [code, exitSignal] = await Promise.race([exited, deadline]);
        assert.equal(code, 0, stderr);
        assert.equal(exitSignal, null, stderr);
        assert.match(stdout, /stopped/);
        assert.equal(stderr, '');
        console.log(
          'FM043 signal timing ' +
            JSON.stringify({
              signal,
              mode,
              startupMs: readyAt - started,
              shutdownMs: Date.now() - readyAt,
              totalMs: Date.now() - started,
            })
        );
      } finally {
        clearTimeout(timer!);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await exited;
      }
    });
  }
});

goldenControls('fastify-host');
