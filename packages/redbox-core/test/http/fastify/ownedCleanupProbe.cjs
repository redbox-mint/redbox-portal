const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createHook } = require('node:async_hooks');
const timers = new Map();
const hook = createHook({
  init(id, type, _trigger, resource) {
    if (type === 'Timeout')
      timers.set(id, {
        ref: new WeakRef(resource),
        // Retain creation frames now, but format/source-map only survivors.
        // Eager stack formatting on every request timer can itself delay I/O.
        origin: resource._idleTimeout >= 1000 ? new Error() : undefined,
      });
  },
  destroy(id) {
    timers.delete(id);
  },
});
hook.enable();
exports.mochaHooks = {
  async afterAll() {
    // The command's external timeout bounds this probe. Remove Mocha's own
    // current-hook timer before inventorying resources retained by the suites.
    this.timeout(0);
    await new Promise(resolve => setTimeout(resolve, 40));
    // Mocha resets a promise hook's timer after invoking its function, so clear
    // that current runnable only after the first await has returned.
    this.runnable().clearTimeout();
    const handles = process._getActiveHandles().map(h => ({
      type: h.constructor.name,
      listening: h.listening,
      connecting: h.connecting,
      remoteAddress: h.remoteAddress,
      localAddress: h.localAddress,
      fd: h.fd,
    }));
    const remaining = [...timers.values()].flatMap(t => {
      const value = t.ref.deref();
      return value && !value._destroyed && value.hasRef()
        ? [{ ms: value._idleTimeout, stack: t.origin?.stack ?? '<unexpected surviving short timer>' }]
        : [];
    });
    const active = handles.filter(h => h.listening || h.connecting || h.remoteAddress || h.localAddress);
    const receipt = {
      at: new Date().toISOString(),
      pid: process.pid,
      handles,
      activeNetwork: active,
      timers: remaining,
      beforeExitHarness: true,
    };
    if (process.env.FM036_PROBE) fs.writeFileSync(process.env.FM036_PROBE, JSON.stringify(receipt, null, 2));
    else process.stdout.write('Owned cleanup before exit: ' + JSON.stringify(receipt) + '\n');
    hook.disable();
    assert.deepEqual(active, [], 'All owned network handles must close before the exit harness');
    for (const timer of remaining) {
      const origin = timer.stack
        .split('\n')
        .find(line => line.trim().startsWith('at ') && !/node:|<anonymous>|ownedCleanupProbe|cleanup-probe/.test(line));
      assert.match(
        origin ?? '',
        /node_modules\/(?:@agendajs\/|agenda\/|@uppy\/companion\/)/,
        'Only attributed non-host vendor timers may remain'
      );
    }
  },
};
