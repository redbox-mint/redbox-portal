import assert from 'node:assert/strict';
import { resolveBrandConfiguration } from '../../src/configuration';
import { ApplicationRuntime } from '../../src/application';

describe('dynamic brand settings and declared configuration writes', () => {
  it('reads invalidated dynamic state each time and retains false/null and startup defaults', () => {
    const defaults = Object.freeze({ feature: Object.freeze({ enabled: true }) });
    let current: unknown = { feature: { enabled: false } };
    const input = { defaultBrand: 'default', defaults, readBrand: (name: string) => (name === 'other' ? {} : current) };
    assert.deepEqual(resolveBrandConfiguration('default', 'feature', input), { enabled: false });
    current = { feature: { enabled: true, revision: 2 } };
    assert.deepEqual(resolveBrandConfiguration('other', 'feature', input), { enabled: true, revision: 2 });
    current = { feature: null };
    assert.equal(resolveBrandConfiguration('default', 'feature', input), null);
    current = {};
    assert.equal(resolveBrandConfiguration('default', 'feature', input), defaults.feature);
    assert.equal(defaults.feature.enabled, true);
  });
  it('awaits declared configuration writes before readiness and cleanup and preserves their failure', async () => {
    const owner = { config: {}, log: { warn() {} } };
    const failure = Error('private database failure');
    let done!: () => void, entered!: () => void;
    const pending = new Promise<void>(resolve => { done = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const application = new ApplicationRuntime(owner, [], {
      coreBootstrap: [{ name: 'configuration-write', run: async () => { entered(); await pending; throw failure; } }],
    });
    let settled = false, closed = false;
    const waiting = application.initialize().catch(error => { settled = true; throw error; });
    const rejection = assert.rejects(waiting, error => error === failure);
    await started;
    const cleanup = application.stop().then(() => { closed = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(application.status().ready, false);
    assert.equal(settled, false); assert.equal(closed, false);
    done();
    await rejection; await cleanup;
    assert.equal(application.status().state, 'failed');
    assert.equal(application.status().cleanupPending, false);
    assert.deepEqual(application.status().failure, { phase: 'initialize', module: undefined, stage: 'coreBootstrap:configuration-write' });
    assert.equal(application.status().persistence.resources.length, 0);
  });
});
