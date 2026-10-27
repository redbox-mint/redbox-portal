import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import type { PersistenceOwner } from '../../src/persistence/owner';
import { cleanupPersistence, initializePersistence } from '../../src/persistence/runtime';

describe('framework-independent persistence owner', () => {
  it('accepts a structural owner without changing its configuration or process listeners', async () => {
    const owner: PersistenceOwner = { config: Object.freeze({}), log: { warn() {} } };
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];
    const listeners = signals.map(event => process.listeners(event));
    await initializePersistence(owner);
    await cleanupPersistence(owner);
    assert.deepEqual(Object.keys(owner.config), []);
    assert.deepEqual(signals.map(event => process.listeners(event)), listeners);
  });

  it('loads compiled persistence with no Sails global, module, or lifecycle adapter', () => {
    execFileSync(
      process.execPath,
      [
        '-e',
        String.raw`
      const assert = require('node:assert/strict');
      const Module = require('node:module');
      const load = Module._load;
      Module._load = function(name, ...args) {
        assert(!/^sails(?:\/|$)/.test(name), 'Unexpected Sails import: ' + name);
        return load.call(this, name, ...args);
      };
      assert.equal(global.sails, undefined);
      const runtime = require('./dist/persistence/runtime');
      const { definePersistenceGroup } = require('./dist/persistence/groupRuntime');
      const owner = { config: Object.freeze({}), log: { warn() {} } };
      (async () => {
        await runtime.initializePersistence(owner);
        const group = definePersistenceGroup('isolated', async () => ({ read: async () => 42 }));
        await group.initialize(owner);
        assert.equal(await group.get(owner).read(), 42);
        await runtime.cleanupPersistence(owner);
        assert(!Object.keys(require.cache).some(path => path.includes('/compat/sails/')));
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `,
      ],
      { cwd: process.cwd(), stdio: 'pipe' }
    );
  });
});
