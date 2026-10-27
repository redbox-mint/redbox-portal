import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { ApplicationRuntime, type ApplicationModule } from '../../src/application';
import type { PersistenceOwner } from '../../src/persistence/owner';

const owner = (): PersistenceOwner => ({ config: Object.freeze({}), log: { warn() {} } });
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('application ownership and lifecycle', () => {
  const applications: ApplicationRuntime[] = [];
  afterEach(async () => {
    for (const app of applications.splice(0)) await app.stop();
  });
  function application(modules: ConstructorParameters<typeof ApplicationRuntime>[1] = []) {
    const app = new ApplicationRuntime(owner(), modules);
    applications.push(app);
    return app;
  }

  it('wires synchronously, joins concurrent calls and gates admission until activation completes', async () => {
    const initialized = deferred(),
      activated = deferred();
    let creates = 0,
      initializes = 0,
      activates = 0,
      drains = 0,
      closes = 0;
    const app = application([
      {
        name: 'pilot',
        create: () => {
          creates++;
          return {
            initialize: async () => {
              initializes++;
              await initialized.promise;
            },
            activate: async () => {
              activates++;
              await activated.promise;
            },
            drain: async () => {
              drains++;
            },
            close: async () => {
              closes++;
            },
          };
        },
      },
    ]);
    assert.equal(creates, 0);
    assert.equal(app.status().state, 'constructed');
    await assert.rejects(app.activate(), /initialization/);
    const start = app.initialize();
    assert.equal(app.initialize(), start);
    await turn();
    assert.equal(app.status().state, 'initializing');
    assert.equal(app.status().ready, false);
    assert.deepEqual([creates, initializes], [1, 1]);
    await assert.rejects(app.activate(), /initialization/);
    initialized.resolve();
    await start;
    assert.equal(app.status().state, 'initialized');
    assert.equal(app.status().ready, false);
    const activation = app.activate();
    assert.equal(app.activate(), activation);
    await turn();
    assert.equal(app.status().state, 'activating');
    assert.equal(app.status().ready, false);
    activated.resolve();
    await activation;
    await app.initialize();
    await app.activate();
    assert.equal(app.status().ready, true);
    const stop = app.stop();
    assert.equal(app.status().ready, false);
    assert.equal(app.stop(), stop);
    await stop;
    await app.stop();
    assert.equal(app.status().state, 'stopped');
    assert.deepEqual([creates, initializes, activates, drains, closes], [1, 1, 1, 1, 1]);
    await assert.rejects(app.initialize(), /fresh application/);
    await assert.rejects(app.activate(), /stop has begun/);
  });

  it('owns separate instances and caches and restarts using a fresh application', async () => {
    const instances: Map<string, string>[] = [];
    const factory = {
      name: 'cached',
      create: () => {
        const cache = new Map<string, string>();
        instances.push(cache);
        return {
          initialize: async () => {
            cache.set('value', 'initial');
          },
          close: async () => {
            cache.clear();
          },
        };
      },
    };
    const first = application([factory]),
      second = application([factory]);
    await Promise.all([first.initialize(), second.initialize()]);
    assert.notEqual(instances[0], instances[1]);
    instances[0].set('value', 'changed');
    assert.equal(instances[1].get('value'), 'initial');
    await first.stop();
    assert.equal(instances[0].size, 0);
    assert.equal(instances[1].get('value'), 'initial');
    const fresh = application([factory]);
    await fresh.initialize();
    assert.equal(instances.length, 3);
    assert.equal(instances[2].get('value'), 'initial');
  });

  it('validates selected registrations before factories run', () => {
    const create = (): ApplicationModule => {
      throw new Error('Must not construct');
    };
    for (const names of [['same', 'same'], [''], ['bad/name'], ['private\nvalue']])
      assert.throws(() => application(names.map(name => ({ name, create }))), /unique, bounded identifiers/);
  });

  it('refuses a second runtime on the same owner, including after a clean stop', async () => {
    const selectedOwner = owner();
    const app = new ApplicationRuntime(selectedOwner);
    applications.push(app);
    assert.throws(() => new ApplicationRuntime(selectedOwner), /one application/);
    await app.stop();
    assert.throws(() => new ApplicationRuntime(selectedOwner), /fresh owner/);
  });

  it('cleans partial initialization once and preserves the original failure', async () => {
    const failure = new Error('synthetic-private-value');
    const order: string[] = [];
    const app = application(
      ['first', 'second', 'third'].map(name => ({
        name,
        create: () => {
          order.push('create:' + name);
          return {
            initialize: async () => {
              order.push('init:' + name);
              if (name === 'second') throw failure;
            },
            close: async () => {
              order.push('close:' + name);
            },
          };
        },
      }))
    );
    await assert.rejects(app.initialize(), error => error === failure);
    assert.deepEqual(order, [
      'create:first',
      'init:first',
      'create:second',
      'init:second',
      'close:first',
      'close:second',
    ]);
    assert.equal(app.status().state, 'failed');
    assert.deepEqual(app.status().failure, { phase: 'initialize', module: 'second' });
    assert.equal(JSON.stringify(app.status()).includes('synthetic-private-value'), false);
    assert.equal(app.status().cleanupPending, false);
    assert.deepEqual(app.status().persistence.resources, []);
    await assert.rejects(app.initialize(), /stop has begun/);
    await app.stop();
    assert.equal(order.length, 6);
  });

  it('cleans prior acquisitions after a factory throws', async () => {
    let closed = 0;
    const failure = new Error('factory failed');
    const app = application([
      {
        name: 'first',
        create: () => ({
          initialize: async () => {},
          close: async () => {
            closed++;
          },
        }),
      },
      {
        name: 'second',
        create: () => {
          throw failure;
        },
      },
    ]);
    await assert.rejects(app.initialize(), error => error === failure);
    assert.equal(closed, 1);
    assert.deepEqual(app.status().failure, { phase: 'initialize', module: 'second' });
  });

  it('reports cleanup failure separately, retains the module and permits a stop retry only', async () => {
    const failure = new Error('initialization failed');
    let refuse = true,
      closes = 0;
    const app = application([
      {
        name: 'retained',
        create: () => ({
          initialize: async () => {
            throw failure;
          },
          close: async () => {
            closes++;
            if (refuse) throw new Error('close failed');
          },
        }),
      },
    ]);
    await assert.rejects(app.initialize(), error => error === failure);
    assert.equal(app.status().stopFailed, true);
    assert.equal(app.status().cleanupPending, true);
    assert.deepEqual(app.status().persistence.resources, ['module:retained']);
    const snapshot = app.status();
    snapshot.persistence.resources.length = 0;
    assert.deepEqual(app.status().persistence.resources, ['module:retained']);
    await assert.rejects(app.initialize(), /stop has begun/);
    await assert.rejects(app.activate(), /stop has begun/);
    refuse = false;
    await app.stop();
    assert.equal(closes, 2);
    assert.equal(app.status().state, 'stopped');
    assert.equal(app.status().stopFailed, false);
    assert.equal(app.status().cleanupPending, false);
  });

  it('retains all resources after a failed drain and closes once on retry', async () => {
    let refuse = true,
      closed = 0;
    const app = application([
      {
        name: 'draining',
        create: () => ({
          initialize: async () => {},
          drain: async () => {
            if (refuse) throw new Error('drain failed');
          },
          close: async () => {
            closed++;
          },
        }),
      },
    ]);
    await app.initialize();
    await app.activate();
    await assert.rejects(app.stop(), /drain failed/);
    assert.equal(closed, 0);
    assert.equal(app.status().ready, false);
    assert.equal(app.status().stopFailed, true);
    refuse = false;
    await app.stop();
    assert.equal(closed, 1);
  });

  it('cleans partially activated participants without activating the remaining modules', async () => {
    const order: string[] = [];
    const failure = new Error('activation failed');
    const app = application(
      ['first', 'second', 'third'].map(name => ({
        name,
        create: () => ({
          initialize: async () => {},
          activate: async () => {
            order.push('activate:' + name);
            if (name === 'second') throw failure;
          },
          drain: async () => {
            order.push('drain:' + name);
          },
          close: async () => {
            order.push('close:' + name);
          },
        }),
      }))
    );
    await app.initialize();
    await assert.rejects(app.activate(), error => error === failure);
    assert.equal(app.status().ready, false);
    assert.equal(app.status().state, 'failed');
    assert.deepEqual(app.status().failure, { phase: 'activate', module: 'second' });
    assert.deepEqual(order, [
      'activate:first',
      'activate:second',
      'drain:first',
      'drain:second',
      'drain:third',
      'close:first',
      'close:second',
      'close:third',
    ]);
  });

  for (const phase of ['initialize', 'activate'] as const) {
    it(`waits for in-flight ${phase} on stop and never enters the next stage`, async () => {
      const entered = deferred(),
        release = deferred();
      let later = 0,
        closed = 0;
      const app = application([
        {
          name: 'held',
          create: () => ({
            initialize: async () => {
              if (phase === 'initialize') {
                entered.resolve();
                await release.promise;
              }
            },
            activate: async () => {
              if (phase === 'activate') {
                entered.resolve();
                await release.promise;
              }
            },
            close: async () => {
              closed++;
            },
          }),
        },
        {
          name: 'later',
          create: () => ({
            initialize: async () => {
              if (phase === 'initialize') later++;
            },
            activate: async () => {
              if (phase === 'activate') later++;
            },
            close: async () => {
              closed++;
            },
          }),
        },
      ]);
      if (phase === 'activate') await app.initialize();
      const pending = phase === 'initialize' ? app.initialize() : app.activate();
      const rejected = assert.rejects(pending, /stop has begun/);
      await entered.promise;
      const stop = app.stop();
      assert.equal(app.stop(), stop);
      await turn();
      assert.equal(app.status().state, 'stopping');
      assert.equal(closed, 0);
      assert.equal(later, 0);
      await assert.rejects(app.activate(), /stop has begun/);
      release.resolve();
      await Promise.all([stop, rejected]);
      assert.equal(later, 0);
      assert.equal(closed, phase === 'initialize' ? 1 : 2);
      assert.equal(app.status().state, 'stopped');
    });
  }

  it('retains a slow acquisition after a stop deadline until an explicit retry', async () => {
    const entered = deferred(),
      release = deferred();
    let closes = 0;
    const app = application([
      {
        name: 'held',
        create: () => ({
          initialize: async () => {
            entered.resolve();
            await release.promise;
          },
          close: async () => {
            closes++;
          },
        }),
      },
    ]);
    const start = app.initialize();
    const rejected = assert.rejects(start, /stop has begun/);
    await entered.promise;
    await assert.rejects(app.stop({ deadlineMs: 10 }), /deadline exceeded/);
    assert.equal(closes, 0);
    assert.equal(app.status().cleanupPending, true);
    release.resolve();
    await rejected;
    await turn();
    assert.equal(closes, 0, 'Settling acquisition must not silently retry an expired stop');
    assert.equal(app.status().state, 'failed');
    await app.stop();
    assert.equal(closes, 1);
    assert.equal(app.status().state, 'stopped');
  });

  it('joins slow cleanup on retry without closing resources a second time', async () => {
    const closing = deferred(),
      release = deferred();
    let closes = 0;
    const app = application([
      {
        name: 'held',
        create: () => ({
          initialize: async () => {},
          close: async () => {
            closes++;
            closing.resolve();
            await release.promise;
          },
        }),
      },
    ]);
    await app.initialize();
    const expired = assert.rejects(app.stop({ deadlineMs: 10 }), /deadline exceeded/);
    await closing.promise;
    await expired;
    assert.equal(app.status().stopFailed, true);
    assert.deepEqual(app.status().persistence.resources, ['module:held']);
    const retry = app.stop();
    release.resolve();
    await retry;
    assert.equal(closes, 1);
    assert.equal(app.status().cleanupPending, false);
  });

  it('can stop before initialization and rejects invalid deadlines without beginning stop', async () => {
    const app = application();
    for (const deadlineMs of [0, -1, NaN, Infinity, 1.5])
      await assert.rejects(app.stop({ deadlineMs }), /positive integer/);
    assert.equal(app.status().state, 'constructed');
    await app.stop();
    await assert.rejects(app.initialize(), /fresh application/);
  });

  it('runs the compiled narrow entry without global Sails, legacy imports or process handlers', () => {
    execFileSync(
      process.execPath,
      [
        '-e',
        String.raw`
      const assert = require('node:assert/strict');
      const Module = require('node:module'), load = Module._load;
      Module._load = function(name, ...args) {
        assert(!/^sails(?:\/|$)/.test(name));
        return load.call(this, name, ...args);
      };
      assert.equal(global.sails, undefined);
      const events = ['SIGINT', 'SIGTERM', 'SIGUSR2'];
      const before = events.map(event => process.listeners(event));
      const { ApplicationRuntime } = require('./dist/application');
      const app = new ApplicationRuntime({ config: Object.freeze({}), log: { warn() {} } });
      (async () => {
        await app.initialize();
        assert.equal(app.status().ready, false);
        await app.activate();
        assert.equal(app.status().ready, true);
        await app.stop();
        assert.deepEqual(events.map(event => process.listeners(event)), before);
        assert(!Object.keys(require.cache).some(path => path.includes('/compat/sails/') || path === require.resolve('./dist/index.js')));
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `,
      ],
      { stdio: 'pipe' }
    );
  });
});
