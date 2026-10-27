import assert from 'node:assert/strict';
import { ApplicationRuntime } from '../../src/application';

const owner = () => ({ config: {}, log: { warn() {} } });
describe('fixed initialization stages', () => {
  it('awaits persistence, modules, lexical runner stage, core, hooks and post-bootstrap once before activation', async () => {
    const order: string[] = [];
    const step = (name: string) => async () => {
      order.push(name);
    };
    const app = new ApplicationRuntime(
      owner(),
      [
        {
          name: 'storage',
          create: () => ({ initialize: step('storage'), activate: step('activate'), close: step('close') }),
        },
      ],
      {
        preparePersistence: step('indexes'),
        migrations: step('migrations'),
        coreBootstrap: [
          { name: 'contributors', requires: ['storage'], run: step('contributors') },
          { name: 'recordtypes-schema', requires: ['storage'], run: step('recordtypes-schema') },
        ],
        extensionBootstrap: [{ name: 'hook', run: step('hook') }],
        postBootstrap: [{ name: 'dashboard-targets', run: step('dashboard-targets') }],
      }
    );
    const init = app.initialize();
    assert.equal(app.initialize(), init);
    await init;
    assert.equal(app.status().ready, false);
    assert.deepEqual(order, [
      'indexes',
      'storage',
      'migrations',
      'contributors',
      'recordtypes-schema',
      'hook',
      'dashboard-targets',
    ]);
    await app.activate();
    await app.stop();
    assert.deepEqual(order.slice(-2), ['activate', 'close']);
  });
  it('cleans partial acquisition after each failing stage, reports the stage, and never starts later work', async () => {
    for (const failing of ['persistence', 'module', 'migrations', 'core', 'hook', 'post']) {
      const events: string[] = [];
      const fail = Error(failing);
      const step = (name: string) => async () => {
        events.push(name);
        if (name === failing) throw fail;
      };
      const app = new ApplicationRuntime(
        owner(),
        [
          {
            name: 'module',
            create: () => ({ initialize: step('module'), activate: step('activate'), close: step('close') }),
          },
        ],
        {
          preparePersistence: step('persistence'),
          migrations: step('migrations'),
          coreBootstrap: [{ name: 'core', run: step('core') }],
          extensionBootstrap: [{ name: 'hook', run: step('hook') }],
          postBootstrap: [{ name: 'post', run: step('post') }],
        }
      );
      await assert.rejects(app.initialize(), error => error === fail);
      assert.equal(app.status().ready, false);
      assert.equal(app.status().cleanupPending, false);
      assert(app.status().failure?.stage ?? app.status().failure?.module);
      assert(!events.includes('activate'));
      if (failing !== 'persistence') assert.equal(events.at(-1), 'close');
      await assert.rejects(app.activate());
    }
  });
  it('rejects missing schema/contributor/dashboard prerequisites offline', () => {
    assert.throws(
      () =>
        new ApplicationRuntime(owner(), [], {
          postBootstrap: [
            {
              name: 'schema',
              requires: ['storage'],
              run: async () => {
                throw Error('unreachable');
              },
            },
          ],
        }),
      /unavailable module/
    );
  });
});
