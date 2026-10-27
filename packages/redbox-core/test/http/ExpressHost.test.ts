import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ApplicationRuntime, type ApplicationModuleFactory } from '../../src/application';
import { ExpressHost } from '../../src/http/express';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('standalone Express 5 host', function () {
  this.timeout(10_000);
  const hosts: ExpressHost[] = [];
  afterEach(async () => {
    for (const host of hosts.splice(0)) await host.stop();
  });
  function compose(
    modules: ApplicationModuleFactory[] = [],
    prepare: ConstructorParameters<typeof ExpressHost>[1]['prepare'] = async router => {
      router.get('/probe', (_req, res) => {
        res.json({ ok: true });
      });
    },
    port = 0
  ) {
    const application = new ApplicationRuntime({ config: {}, log: { warn() {} } }, modules);
    const host = new ExpressHost(application, { hostname: '127.0.0.1', port, prepare });
    hosts.push(host);
    return { application, host };
  }
  function url(host: ExpressHost, path = '/probe') {
    assert(host.address());
    return `http://127.0.0.1:${host.address()!.port}${path}`;
  }

  it('gates initialization and initialized-but-inactive requests, joins calls and serves no absent legacy routes', async () => {
    const entered = deferred(),
      release = deferred();
    let initialized = 0,
      activated = 0,
      prepared = 0;
    const { host } = compose(
      [
        {
          name: 'probe',
          create: () => ({
            initialize: async () => {
              initialized++;
              entered.resolve();
              await release.promise;
            },
            activate: async () => {
              activated++;
            },
            close: async () => {},
          }),
        },
      ],
      async router => {
        prepared++;
        router.get('/probe', (_req, res) => {
          res.json({ ok: true });
        });
      }
    );
    await assert.rejects(host.activate(), /Await host initialization/);
    const initializing = host.initialize();
    assert.equal(host.initialize(), initializing);
    await entered.promise;
    assert.equal((await fetch(url(host))).status, 503);
    assert.equal((await fetch(url(host, '/readyz'))).status, 503);
    release.resolve();
    await initializing;
    assert.equal(host.status().application.state, 'initialized');
    assert.equal((await fetch(url(host))).status, 503);
    const activating = host.activate();
    assert.equal(host.activate(), activating);
    await activating;
    assert.deepEqual(await (await fetch(url(host))).json(), { ok: true });
    assert.equal((await fetch(url(host, '/readyz'))).status, 200);
    assert.equal((await fetch(url(host, '/default/rdmp/api/recordtypes/getAll'))).status, 404);
    assert.deepEqual([initialized, activated, prepared], [1, 1, 1]);
    const stopping = host.stop();
    assert.equal(host.stop(), stopping);
    await stopping;
    assert.equal(host.address(), null);
    assert.equal(host.status().ready, false);
    await assert.rejects(host.initialize(), /fresh host/);
  });

  it('keeps requests gated during asynchronous listener preparation', async () => {
    const entered = deferred(),
      release = deferred();
    const { host } = compose([], async router => {
      entered.resolve();
      await release.promise;
      router.get('/probe', (_req, res) => {
        res.end('ready');
      });
    });
    const work = host.initialize();
    await entered.promise;
    assert.equal((await fetch(url(host))).status, 503);
    release.resolve();
    await work;
    assert.equal((await fetch(url(host))).status, 503);
    await host.activate();
    assert.equal(await (await fetch(url(host))).text(), 'ready');
  });

  it('cleans startup resources and listener on preparation failure, retaining the original error', async () => {
    const failure = new Error('preparation failed');
    let closed = 0;
    const { host, application } = compose(
      [
        {
          name: 'probe',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closed++;
            },
          }),
        },
      ],
      async () => {
        throw failure;
      }
    );
    await assert.rejects(host.initialize(), error => error === failure);
    assert.equal(closed, 1);
    assert.equal(host.address(), null);
    assert.equal(application.status().ready, false);
    assert.equal(host.status().failure, 'initialize');
  });

  it('cleans listener on runtime initialization and activation failure', async () => {
    for (const phase of ['initialize', 'activate'] as const) {
      let closed = 0;
      const failure = new Error(phase);
      const { host } = compose([
        {
          name: 'probe',
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
      ]);
      if (phase === 'initialize') await assert.rejects(host.initialize(), error => error === failure);
      else {
        await host.initialize();
        await assert.rejects(host.activate(), error => error === failure);
      }
      assert.equal(host.address(), null);
      assert.equal(closed, 1);
      assert.equal(host.status().ready, false);
    }
  });

  it('reports a bind failure without initializing modules or leaving the runtime usable', async () => {
    const occupied = createServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    const address = occupied.address();
    assert(address && typeof address === 'object');
    let initialized = 0;
    try {
      const { host, application } = compose(
        [
          {
            name: 'probe',
            create: () => ({
              initialize: async () => {
                initialized++;
              },
              close: async () => {},
            }),
          },
        ],
        async () => {},
        address.port
      );
      await assert.rejects(host.initialize(), { code: 'EADDRINUSE' });
      assert.equal(initialized, 0);
      assert.equal(host.address(), null);
      assert.equal(application.status().state, 'stopped');
    } finally {
      await new Promise<void>(resolve => occupied.close(() => resolve()));
    }
  });

  it('stops during initialization without opening admission or starting a subsequent stage', async () => {
    const entered = deferred(),
      release = deferred();
    let second = 0;
    const { host } = compose([
      {
        name: 'slow',
        create: () => ({
          initialize: async () => {
            entered.resolve();
            await release.promise;
          },
          close: async () => {},
        }),
      },
      {
        name: 'next',
        create: () => ({
          initialize: async () => {
            second++;
          },
          close: async () => {},
        }),
      },
    ]);
    const initializing = assert.rejects(host.initialize(), /stop has begun/);
    await entered.promise;
    const stopping = host.stop();
    assert.equal((await fetch(url(host))).status, 503);
    release.resolve();
    await initializing;
    await stopping;
    assert.equal(second, 0);
    assert.equal(host.address(), null);
  });

  it('joins an immediate stop while binding and never leaks a later listener', async () => {
    const { host } = compose();
    const initializing = assert.rejects(host.initialize(), /stop has begun/);
    await Promise.resolve();
    await host.stop();
    await initializing;
    assert.equal(host.address(), null);
  });

  it('waits for an admitted HTTP response before application cleanup and reports a retryable stop timeout', async () => {
    const entered = deferred(),
      release = deferred();
    let closed = false;
    const { host } = compose(
      [
        {
          name: 'probe',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              closed = true;
            },
          }),
        },
      ],
      async router => {
        router.get('/probe', async (_req, res) => {
          entered.resolve();
          await release.promise;
          assert.equal(closed, false);
          res.end('completed');
        });
      }
    );
    await host.initialize();
    await host.activate();
    const response = fetch(url(host));
    await entered.promise;
    try {
      await assert.rejects(host.stop({ deadlineMs: 20 }), /deadline exceeded/);
      assert.equal(closed, false);
      assert.equal(host.status().stopFailed, true);
      assert.equal(host.status().ready, false);
      await assert.rejects(host.stop({ deadlineMs: 20 }), /deadline exceeded/);
      assert.equal(closed, false, 'A retry still waits for the admitted response');
    } finally {
      release.resolve();
    }
    assert.equal(await (await response).text(), 'completed');
    await host.stop();
    assert.equal(closed, true);
    assert.equal(host.status().stopFailed, false);
  });

  it('installs signals only explicitly and handles a real SIGTERM in the compiled standalone host', async () => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
      const assert = require('node:assert/strict');
      const before = process.listenerCount('SIGTERM');
      const { ApplicationRuntime } = require('./dist/application');
      const { ExpressHost } = require('./dist/http/express');
      assert.equal(process.listenerCount('SIGTERM'), before);
      assert.equal(require('./node_modules/express/package.json').version, '5.3.0');
      const application = new ApplicationRuntime({ config: {}, log: { warn() {} } });
      const host = new ExpressHost(application, { hostname: '127.0.0.1', port: 0, prepare: async () => {} });
      host.installSignalHandlers({ onStopped() {
        assert.equal(host.status().stopped, true);
        assert.equal(host.address(), null);
        assert.equal(process.listenerCount('SIGTERM'), before);
        assert.equal(Object.keys(require.cache).some(p => /node_modules\\/sails\\/|dist\\/compat\\//.test(p)), false);
        console.log('stopped'); process.disconnect();
      }, onError(error) { console.error(error); process.exitCode = 1; process.disconnect(); } });
      host.initialize().then(() => host.activate()).then(() => process.send('ready'));
    `,
      ],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
    );
    let stdout = '',
      stderr = '';
    child.stdout!.on('data', data => {
      stdout += data;
    });
    child.stderr!.on('data', data => {
      stderr += data;
    });
    try {
      await once(child, 'message');
      child.kill('SIGTERM');
      const [code] = await once(child, 'exit');
      assert.equal(code, 0, stderr);
      assert.match(stdout, /stopped/);
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });

  it('retries after the host deadline expires before the prior application stop attempt settles', async () => {
    const owner = { config: {}, log: { warn() {} } };
    const application = new ApplicationRuntime(owner);
    const stop = application.stop.bind(application);
    const oldAttempt = Promise.withResolvers<void>();
    let calls = 0;
    application.stop = options => (++calls === 1 ? oldAttempt.promise : stop(options));
    const host = new ExpressHost(application, { owner, hostname: '127.0.0.1', port: 0, prepare: async () => {} });
    hosts.push(host);
    await host.initialize();
    await host.activate();
    await assert.rejects(host.stop({ deadlineMs: 10 }), /deadline/);
    const retry = host.stop();
    assert.equal(calls, 1, 'A retry first waits for the old application attempt');
    oldAttempt.reject(new Error('old application deadline'));
    await retry;
    assert.equal(calls, 2);
    assert.equal(host.status().stopped, true);
  });

  it('does not start an automatic application retry after the retry deadline has expired', async () => {
    const owner = { config: {}, log: { warn() {} } };
    const application = new ApplicationRuntime(owner);
    const stop = application.stop.bind(application);
    const oldAttempt = Promise.withResolvers<void>();
    let calls = 0;
    application.stop = options => (++calls === 1 ? oldAttempt.promise : stop(options));
    const host = new ExpressHost(application, { owner, hostname: '127.0.0.1', port: 0, prepare: async () => {} });
    hosts.push(host);
    await host.initialize();
    await host.activate();
    await assert.rejects(host.stop({ deadlineMs: 10 }), /deadline/);
    await assert.rejects(host.stop({ deadlineMs: 10 }), /deadline/);
    oldAttempt.reject(new Error('old application deadline'));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(calls, 1, 'Expired host retries must not schedule later application cleanup');
    await host.stop();
    assert.equal(calls, 2);
  });
});
