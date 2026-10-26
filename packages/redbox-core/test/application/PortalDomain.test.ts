import assert from 'node:assert/strict';
import { ApplicationRuntime } from '../../src/application';
import { portalDomain } from '../../src/application/portal/domain';

describe('production domain composition', () => {
  it('preserves class lifecycle methods and receivers when composing a selected factory', async () => {
    const calls: string[] = [];
    class Resource {
      async initialize() {
        calls.push('initialize');
      }
      async activate() {
        calls.push('activate');
      }
      quiesce() {
        calls.push('quiesce');
      }
      async drain() {
        calls.push('drain');
      }
      async close() {
        calls.push('close');
      }
    }
    const domain = portalDomain(
      'proof',
      [],
      () => new Resource(),
      value => value,
      (value): value is Resource => value instanceof Resource,
      () => ({})
    );
    const application = new ApplicationRuntime({ config: {}, log: { warn() {} } }, [
      { name: 'proof', create: domain.bind({ provider: 'core', declaration: domain.declaration }) },
    ]);
    await application.initialize();
    await application.activate();
    assert(domain.get() instanceof Resource);
    await application.stop();
    assert.deepEqual(calls, ['initialize', 'activate', 'quiesce', 'quiesce', 'drain', 'close']);
    assert.throws(() => domain.get(), /unavailable/);
  });

  it('forwards the application stop deadline through module composition', async () => {
    let observed: number | undefined;
    const application = new ApplicationRuntime({ config: {}, log: { warn() {} } }, [
      {
        name: 'deadline',
        create: () => ({
          initialize: async () => {},
          drain: async options => {
            observed = options?.deadline;
          },
          close: async () => {},
        }),
      },
    ]);
    await application.initialize();
    const before = Date.now();
    await application.stop({ deadlineMs: 500 });
    assert(observed && observed >= before + 500 && observed <= Date.now() + 500);
  });
});
