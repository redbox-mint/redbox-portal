import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ApplicationRuntime } from '../../src/application';
import type { ApplicationInitialization } from '../../src/application';

function application(initialization: ApplicationInitialization) {
  return new ApplicationRuntime({ config: {}, log: { warn() {}, error() {} } }, [], initialization);
}

describe('owned bootstrap stages without generated shims', () => {
  it('awaits preparation, migrations, core and ordered extension bootstrap', async () => {
    const order: string[] = [];
    const app = application({
      preparePersistence: async () => { order.push('prepare'); },
      migrations: async () => { order.push('migration'); },
      coreBootstrap: [{ name: 'core', run: async () => { order.push('core'); } }],
      extensionBootstrap: ['one', 'two'].map(name => ({ name, run: async () => { order.push(name); } })),
    });
    await app.initialize();
    assert.deepEqual(order, ['prepare', 'migration', 'core', 'one', 'two']);
    assert.equal(app.status().state, 'initialized');
    await app.stop();
  });
  it('does not export secret-bearing config snapshots through retired environment flags', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'redbox-bootstrap-retired-'));
    const cwd = process.cwd();
    const previous = process.env.EXPORT_BOOTSTRAP_CONFIG_JSON;
    try {
      process.chdir(directory);
      process.env.EXPORT_BOOTSTRAP_CONFIG_JSON = 'true';
      const app = application({});
      await app.initialize();
      assert.deepEqual(await readdir(directory), []);
      await app.stop();
    } finally {
      process.chdir(cwd);
      if (previous === undefined) delete process.env.EXPORT_BOOTSTRAP_CONFIG_JSON;
      else process.env.EXPORT_BOOTSTRAP_CONFIG_JSON = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('keeps post-bootstrap work owned and reports failure instead of suppressing it', async () => {
    const failure = new Error('disk full');
    const app = application({ postBootstrap: [{ name: 'explicit-export', run: async () => { throw failure; } }] });
    await assert.rejects(app.initialize(), error => error === failure);
    assert.equal(app.status().failure?.stage, 'postBootstrap:explicit-export');
    assert.equal(app.status().state, 'failed');
    assert.equal(app.status().cleanupPending, false);
  });
  it('propagates extension failure and prevents later bootstrap work', async () => {
    const failure = new Error('hook exploded');
    let later = false;
    const app = application({ extensionBootstrap: [
      { name: 'broken-hook', run: async () => { throw failure; } },
      { name: 'later', run: async () => { later = true; } },
    ] });
    await assert.rejects(app.initialize(), error => error === failure);
    assert.equal(later, false);
    assert.equal(app.status().failure?.stage, 'extensionBootstrap:broken-hook');
  });
  it('propagates synchronous preparation errors before core bootstrap', async () => {
    const failure = new Error('prepare exploded');
    let core = false;
    const app = application({ preparePersistence() { throw failure; }, coreBootstrap: [
      { name: 'core', run: async () => { core = true; } },
    ] });
    await assert.rejects(app.initialize(), error => error === failure);
    assert.equal(core, false);
  });
  it('awaits preparation and prevents migrations after asynchronous failure', async () => {
    const failure = new Error('service initialization failed');
    let reject!: (error: Error) => void;
    let migrated = false;
    const app = application({
      preparePersistence: () => new Promise<void>((_resolve, fail) => { reject = fail; }),
      migrations: async () => { migrated = true; },
    });
    const work = app.initialize();
    while (!reject) await new Promise(resolve => setImmediate(resolve));
    assert.equal(migrated, false);
    assert.equal(app.status().state, 'initializing');
    reject(failure);
    await assert.rejects(work, error => error === failure);
    assert.equal(migrated, false);
  });
});
