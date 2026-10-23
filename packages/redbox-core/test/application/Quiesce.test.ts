import assert from 'node:assert/strict';
import { ApplicationRuntime } from '../../src/application';
import { persistenceOperation, runAcceptedPersistenceWork } from '../../src/persistence/runtime';

describe('quiesce admission and retry', () => {
  it('denies unrelated operations immediately while an admitted scope completes, without transferring scope between owners', async () => {
    const firstOwner = { config: {}, log: console },
      secondOwner = { config: {}, log: console };
    const first = new ApplicationRuntime(firstOwner),
      second = new ApplicationRuntime(secondOwner);
    await first.initialize();
    await second.initialize();
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    let completed = false;
    const accepted = runAcceptedPersistenceWork(firstOwner, async () => {
      await held;
      await persistenceOperation(firstOwner, async () => {
        completed = true;
      });
      await assert.rejects(
        persistenceOperation(secondOwner, async () => {}),
        /draining/
      );
    });
    const stopping = first.stop();
    second.quiesce();
    try {
      await assert.rejects(
        persistenceOperation(firstOwner, async () => {}),
        /draining/
      );
      assert.equal(completed, false);
      release();
      await accepted;
      await stopping;
    } finally {
      release();
      await first.stop();
      await second.stop();
    }
    assert.equal(completed, true);
  });
  it('retains a failed quiesce for retry and honors the configured bounded stop default', async () => {
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    let fail = true,
      closed = false;
    const app = new ApplicationRuntime(
      { config: {}, log: console },
      [
        {
          name: 'native',
          create: () => ({
            initialize: async () => {},
            quiesce: () => {
              if (fail) throw Error('Synthetic producer failure');
            },
            drain: () => held,
            close: async () => {
              closed = true;
            },
          }),
        },
      ],
      { stopDeadlineMs: 10 }
    );
    await app.initialize();
    await app.activate();
    await assert.rejects(app.stop(), /quiesce/);
    assert.equal(app.status().ready, false);
    assert.equal(app.status().cleanupPending, true);
    assert.equal(closed, false);
    fail = false;
    await assert.rejects(app.stop(), /deadline/);
    assert.equal(closed, false);
    release();
    await app.stop();
    assert.equal(closed, true);
    assert.equal(app.status().stopFailed, false);
  });
});
