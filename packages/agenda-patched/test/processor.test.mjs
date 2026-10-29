import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { createHook } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { setImmediate as immediate } from 'node:timers/promises';
const requireCore = createRequire(new URL('../../redbox-core/package.json', import.meta.url));
const { JobProcessor } = await import(new URL('./JobProcessor.js', import.meta.resolve(requireCore.resolve('agenda'))));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function setup(t, { lifetime = 600000, isExpired = async () => false } = {}) {
  const timers = [];
  const hook = createHook({
    init(_id, type, _trigger, resource) {
      if (type === 'Timeout' && resource._idleTimeout === lifetime / 2) {
        if (new Error().stack.includes('JobProcessor.js')) timers.push(resource);
      }
    },
  }).enable();
  const agenda = Object.assign(new EventEmitter(), {
    attrs: {},
    definitions: {},
    db: { getNextJobToRun: async () => undefined },
    logJobEvent() {},
  });
  const errors = [];
  agenda.on('error', error => errors.push(error));
  const processor = new JobProcessor(agenda, 1, 0, 20);
  agenda.definitions.job = { lockLifetime: lifetime, concurrency: 1 };
  const run = deferred();
  const job = {
    attrs: { _id: 'id', name: 'job', lockedAt: new Date() },
    run: () => run.promise,
    isExpired,
    cancel(error) {
      this.canceled = error;
    },
  };
  processor.lockedJobs.push(job);
  processor.updateStatus('job', 'locked', 1);
  const processing = processor.runOrRetry(job);
  t.after(async () => {
    processor.notificationUnsubscribe = undefined;
    processor.stop();
    run.resolve();
    await processing;
    hook.disable();
  });
  return { processor, run, job, processing, errors, timers };
}
function cleared(timers) {
  assert(timers.length > 0, 'watchdog did not start');
  assert(
    timers.every(timer => timer._destroyed),
    'watchdog timer is still armed'
  );
}
for (const failure of [false, true]) {
  test(`settled run cancels pending watchdog (reject=${failure})`, async t => {
    const s = setup(t);
    if (failure) s.run.reject(new Error('initial persistence failed'));
    else s.run.resolve();
    await s.processing;
    cleared(s.timers);
    assert.equal(s.errors.length, failure ? 1 : 0);
    assert.equal(s.processor.runningJobs.length, 0);
    assert.equal(s.processor.watchdogControllers.size, 0);
  });
}
test('stop cancels monitoring without completing a running job', async t => {
  const s = setup(t);
  s.processor.stop();
  await immediate();
  cleared(s.timers);
  assert.equal(s.processor.runningJobs.length, 1);
  assert.equal(s.job.canceled, undefined);
  s.run.resolve();
  await s.processing;
  assert.equal(s.processor.runningJobs.length, 0);
  assert.deepEqual(s.errors, []);
});
test('stop clears watchdog before notification cleanup throws', async t => {
  const s = setup(t);
  s.processor.notificationUnsubscribe = () => {
    throw new Error('cleanup failed');
  };
  assert.throws(() => s.processor.stop(), /cleanup failed/);
  await immediate();
  cleared(s.timers);
});
for (const mode of ['timeout', 'abort']) {
  test(`drain ${mode} clears monitoring and retains the running job`, async t => {
    const s = setup(t);
    const result = await s.processor.drain(
      mode === 'timeout'
        ? { timeout: 0 }
        : {
            signal: AbortSignal.abort(),
          }
    );
    assert.equal(result[mode === 'timeout' ? 'timedOut' : 'aborted'], true);
    cleared(s.timers);
    assert.equal(s.processor.runningJobs.length, 1);
    assert.equal(s.job.canceled, undefined);
  });
}
for (const reason of ['expired', 'lost lock', 'lock check error']) {
  test(`active watchdog still detects ${reason}`, async t => {
    const s = setup(t, {
      lifetime: 80,
      isExpired: async () => {
        if (reason === 'lock check error') throw new Error('read failed');
        return reason === 'expired';
      },
    });
    if (reason === 'lost lock') s.job.attrs.lockedAt = undefined;
    await s.processing;
    assert.equal(s.errors.length, 1);
    assert.match(
      s.errors[0].message,
      reason === 'expired' ? /execution took more than/ : reason === 'lost lock' ? /no lockedAt date/ : /read failed/
    );
    assert.equal(s.job.canceled, s.errors[0]);
    cleared(s.timers);
  });
}
for (const stop of [false, true]) {
  for (const rejectCheck of [false, true]) {
    test(`in-flight lock check cannot rearm after ${stop ? 'stop' : 'completion'} (reject=${rejectCheck})`, async t => {
      const checking = deferred();
      const checked = deferred();
      const s = setup(t, {
        lifetime: 80,
        isExpired: () => {
          checking.resolve();
          return checked.promise;
        },
      });
      await checking.promise;
      if (stop) s.processor.stop();
      else {
        s.run.resolve();
        await s.processing;
      }
      // Stale results and disconnect failures must not cancel the completed/stopped job.
      if (rejectCheck) checked.reject(new Error('backend closed'));
      else checked.resolve(true);
      await immediate();
      assert.equal(s.timers.length, 1);
      cleared(s.timers);
      assert.deepEqual(s.errors, []);
      assert.equal(s.job.canceled, undefined);
    });
  }
}
