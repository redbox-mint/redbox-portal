import assert from 'node:assert/strict';
import { resolveBrandConfiguration } from '../../src/configuration';
import { awaitLegacyConfigurationWork, trackLegacyConfigurationWork } from '../../src/compat/sails/configurationWork';
import { cleanupPersistence } from '../../src/persistence/runtime';

describe('dynamic brand settings and tracked comparison writes', () => {
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
  it('awaits accepted legacy writes before readiness and cleanup, surfacing failure after siblings settle', async () => {
    const owner = { config: {}, log: { warn() {} } };
    let done!: () => void;
    const pending = new Promise<void>(resolve => {
      done = resolve;
    });
    trackLegacyConfigurationWork(owner, () => pending);
    trackLegacyConfigurationWork(owner, () => Promise.reject(Error('private database failure')));
    let settled = false;
    const waiting = awaitLegacyConfigurationWork(owner).catch(error => {
      settled = true;
      throw error;
    });
    const rejection = assert.rejects(waiting, error => error instanceof Error && !error.message.includes('private'));
    let closed = false;
    const cleanup = cleanupPersistence(owner).then(() => {
      closed = true;
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(closed, false);
    done();
    await rejection;
    await cleanup;
  });
});
