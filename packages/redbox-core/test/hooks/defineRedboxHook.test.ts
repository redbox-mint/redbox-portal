import assert from 'node:assert/strict';
import { bindExtensionFactory, bindExtensionWork } from '../../src/extensions/composition';

// V6 authors return an owned promise. Callback-only providers are bridged by their
// authored operation, rather than an arity-sniffing framework hook factory.
describe('explicit extension bindings', () => {
  const input = Object.freeze({ portal: 'test' });
  it('binds a factory once and preserves its input and result identities', () => {
    let calls = 0;
    const result = {};
    const create = bindExtensionFactory({ name: 'routes', create(received: typeof input) {
      assert.equal(received, input);
      calls++;
      return result;
    } }, input);
    assert.equal(calls, 0);
    assert.equal(create(), result);
    assert.equal(calls, 1);
  });
  it('awaits an authored callback bridge', async () => {
    let initialized = false;
    const run = bindExtensionWork({ run: received => new Promise<void>(resolve => {
      assert.equal(received, input);
      setImmediate(() => { initialized = true; resolve(); });
    }) }, input);
    const work = run();
    assert.equal(initialized, false);
    await work;
    assert.equal(initialized, true);
  });
  it('does not infer completion from default-parameter arity', async () => {
    let complete!: () => void;
    const run = bindExtensionWork({ run(received: typeof input, unused = 'authored default') {
      assert.equal(received, input);
      assert.equal(unused, 'authored default');
      return new Promise<void>(resolve => { complete = resolve; });
    } }, input);
    const work = run();
    let settled = false;
    void work.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);
    complete();
    await work;
    complete();
  });
  it('does not supply hidden callback arguments to rest-parameter operations', async () => {
    let complete!: () => void;
    const run = bindExtensionWork({ run(received: typeof input, ...rest: unknown[]) {
      assert.equal(received, input);
      assert.deepEqual(rest, []);
      return new Promise<void>(resolve => { complete = resolve; });
    } }, input);
    const work = run();
    complete();
    await work;
  });
  it('returns the authored promise to its consumer', async () => {
    let initialized = false;
    const authored = Promise.resolve().then(() => { initialized = true; });
    const run = bindExtensionWork({ run: () => authored }, input);
    assert.equal(run(), authored);
    await authored;
    assert.equal(initialized, true);
  });
  it('preserves asynchronous error identity', async () => {
    const failure = new Error('initialization failed');
    const run = bindExtensionWork({ run: async () => { throw failure; } }, input);
    await assert.rejects(run(), error => error === failure);
  });
  it('propagates callback-provider failure through an authored promise', async () => {
    const failure = new Error('callback failed');
    const run = bindExtensionWork({ run: () => new Promise<void>((_resolve, reject) => {
      setImmediate(() => reject(failure));
    }) }, input);
    await assert.rejects(run(), error => error === failure);
  });
  it('surfaces a synchronous authored operation error', () => {
    const failure = new Error('initialization failed');
    const run = bindExtensionWork({ run() { throw failure; } }, input);
    assert.throws(run, error => error === failure);
  });
});
