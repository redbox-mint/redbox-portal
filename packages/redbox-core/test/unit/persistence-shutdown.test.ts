import { attachSailsPersistenceLifecycle } from '../../src/compat/sails/persistenceLifecycle';
import assert from 'node:assert/strict';
import { initializePersistence, registerPersistenceResource } from '../../src/persistence/runtime';

describe('Sails persistence shutdown entrypoint', () => {
  it('returns a failed drain without emitting lower, then permits a safe retry', async () => {
    const { Sails: Application } = require('sails');
    const application: Sails.Application & {
      once(event: string, listener: () => void): unknown;
      lower(callback: (error?: unknown) => void): void;
    } = new Application();
    Reflect.set(application, 'config', {});
    attachSailsPersistenceLifecycle(application);
    await initializePersistence(application);
    let refuse = true, closed = 0, lowered = 0, drains = 0;
    application.once('lower', () => { lowered++; });
    registerPersistenceResource(application, 'held', {
      drain: async () => { drains++; if (refuse) throw new Error('Synthetic drain failure.'); },
      close: async () => { closed++; },
    });
    const lower = () => new Promise<unknown>(resolve => application.lower(resolve));
    const [failure, concurrent] = await Promise.all([lower(), lower()]);
    try {
      assert(failure instanceof Error);
      assert.equal(concurrent, failure);
      assert.equal(drains, 1);
      assert.equal(lowered, 0);
      assert.equal(closed, 0);
    } finally { refuse = false; await lower(); }
    assert.equal(lowered, 1);
    assert.equal(closed, 1);
  });
});
