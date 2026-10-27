import assert from 'node:assert/strict';
import { scheduledJobs } from 'node-schedule';
import { ScheduledWork } from '../../src/queues';
import { ApplicationRuntime } from '../../src/application';

describe('owned cron activation', () => {
  it('keeps timers absent until activation, schedules once, and drains actual callback work', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    let calls = 0;
    const baseline = Object.keys(scheduledJobs);
    const schedule = new ScheduledWork(
      [
        {
          name: 'work',
          interval: '* * * * * *',
          run: async () => {
            calls++;
            await held;
          },
        },
      ],
      console
    );
    await schedule.initialize();
    assert.deepEqual(Object.keys(scheduledJobs), baseline);
    await schedule.activate();
    await schedule.activate();
    const added = Object.keys(scheduledJobs).filter(name => !baseline.includes(name));
    assert.equal(added.length, 1);
    scheduledJobs[added[0]].invoke();
    await Promise.resolve();
    assert.equal(calls, 1);
    let drained = false;
    const draining = schedule.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    assert.equal(drained, false);
    assert.deepEqual(Object.keys(scheduledJobs), baseline);
    release();
    await draining;
    await schedule.close();
    await assert.rejects(schedule.activate(), /stopping/);
  });
  it('cleans already registered timers if a later interval fails activation', async () => {
    const baseline = Object.keys(scheduledJobs);
    const schedule = new ScheduledWork(
      [
        { name: 'first', interval: '* * * * * *', run: async () => {} },
        { name: 'invalid', interval: 'invalid', run: async () => {} },
      ],
      console
    );
    const app = new ApplicationRuntime({ config: {}, log: console }, [{ name: 'cron', create: () => schedule }]);
    await app.initialize();
    await assert.rejects(app.activate(), /invalid interval/);
    assert.deepEqual(Object.keys(scheduledJobs), baseline);
    assert.equal(app.status().cleanupPending, false);
  });
});
