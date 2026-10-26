import assert from 'node:assert/strict';
import { ApplicationRuntime } from '../../src/application';
import { registerPersistenceResource } from '../../src/persistence/runtime';

describe('owned application persistence shutdown', () => {
  it('coalesces a failed drain, retains resources and permits an explicit retry', async () => {
    const owner = { config: {}, log: { warn() {} } };
    const application = new ApplicationRuntime(owner, []);
    await application.initialize();
    let refuse = true, closed = 0, drains = 0;
    registerPersistenceResource(owner, 'held', {
      drain: async () => { drains++; if (refuse) throw new Error('Synthetic drain failure.'); },
      close: async () => { closed++; },
    });
    const stop = () => application.stop().catch(error => error);
    const [failure, concurrent] = await Promise.all([stop(), stop()]);
    try {
      assert(failure instanceof Error);
      assert.equal(concurrent, failure);
      assert.equal(drains, 1);
      assert.equal(application.status().state, 'failed');
      assert.equal(application.status().cleanupPending, true);
      assert.equal(closed, 0);
    } finally { refuse = false; await application.stop(); }
    assert.equal(application.status().state, 'stopped');
    assert.equal(application.status().cleanupPending, false);
    assert.equal(closed, 1);
  });
});
