import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { AuditWriter, AuditWriteTimeout } from '../../src/services/record-audit/writer';

describe('Effect record audit writer', function () {
  afterEach(() => sinon.restore());

  it('retries transient failures with bounded exponential delay', async function () {
    const clock = sinon.useFakeTimers();
    const write = sinon.stub().rejects(new Error('temporary outage'));
    write.onThirdCall().resolves();
    const writing = new AuditWriter().run(write, { writeTimeoutMs: 1000 });

    await clock.tickAsync(50);
    assert.equal(write.callCount, 1);
    await clock.tickAsync(500);
    await writing;
    assert.equal(write.callCount, 3);
    assert.equal(clock.countTimers(), 0);
  });

  it('stops at the configured attempt count and preserves the original failure', async function () {
    const clock = sinon.useFakeTimers();
    const error = new Error('unavailable');
    const write = sinon.stub().rejects(error);
    const result = new AuditWriter().run(write, { writeAttempts: 2 }).catch(failure => failure);
    await clock.tickAsync(500);
    assert.equal(await result, error);
    assert.equal(write.callCount, 2);
    assert.equal(clock.countTimers(), 0);
  });

  it('holds permits for timed-out inserts and never starts cancelled waiters', async function () {
    const clock = sinon.useFakeTimers();
    const writer = new AuditWriter();
    const release: Array<() => void> = [];
    const write = sinon.stub().callsFake(() => new Promise<void>(resolve => { release.push(resolve); }));
    const policy = { writeTimeoutMs: 50, maxConcurrentWrites: 2, writeAttempts: 1 };
    const started = Array.from({ length: 4 }, () => writer.run(write, policy).catch(error => error));

    await clock.tickAsync(50);
    assert.equal(write.callCount, 2);
    for (const result of await Promise.all(started)) assert.ok(result instanceof AuditWriteTimeout);
    const stillBlocked = writer.run(write, policy).catch(error => error);
    await clock.tickAsync(50);
    assert.ok(await stillBlocked instanceof AuditWriteTimeout);
    assert.equal(write.callCount, 2);

    release.forEach(resolve => resolve());
    await clock.tickAsync(0);
    assert.equal(write.callCount, 2);
    const healthy = sinon.stub().resolves();
    await writer.run(healthy, policy);
    assert.equal(healthy.callCount, 1);
    assert.equal(clock.countTimers(), 0);
  });

  it('handles a late rejection without starting retries after the deadline', async function () {
    const clock = sinon.useFakeTimers();
    let reject!: (error: Error) => void;
    const write = sinon.stub().callsFake(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const result = new AuditWriter().run(write, { writeTimeoutMs: 50 }).catch(error => error);
    await clock.tickAsync(50);
    assert.ok(await result instanceof AuditWriteTimeout);
    reject(new Error('late rejection'));
    await clock.tickAsync(1000);
    assert.equal(write.callCount, 1);
    assert.equal(clock.countTimers(), 0);
  });
});
