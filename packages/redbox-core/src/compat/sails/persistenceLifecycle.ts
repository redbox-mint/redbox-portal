import { stopSailsApplication } from './application';
import { PersistenceError } from '../../persistence/errors';

interface Shutdown {
  lowering?: Promise<void>;
  signals?: object;
}
const key: unique symbol = Symbol.for('@researchdatabox/redbox-core/sails-shutdown/v1');
type Owner = Sails.Application & { [key]?: Shutdown };

/** Sails continues teardown on beforeShutdown errors; admission must precede lower(). */
export function guardSailsShutdown(app: Sails.Application): void {
  const application = app as Owner;
  const report = (error: unknown) => {
    app.log.error('Sails shutdown blocked; resources remain owned. Stop producers and retry shutdown.');
    if (error instanceof PersistenceError)
      app.log.error({ name: error.name, code: error.code, message: error.message });
  };
  const installSignals = (state: Shutdown) => {
    const listeners: unknown = Reflect.get(app, '_processListeners');
    if (!listeners || typeof listeners !== 'object' || state.signals === listeners) return;
    state.signals = listeners;
    for (const [name, event] of [
      ['sigint', 'SIGINT'],
      ['sigterm', 'SIGTERM'],
      ['sigusr2', 'SIGUSR2'],
    ] as const) {
      const previous: unknown = Reflect.get(listeners, name);
      if (typeof previous !== 'function' || !process.listeners(event).includes(previous as NodeJS.SignalsListener))
        continue;
      process.removeListener(event, previous as NodeJS.SignalsListener);
      const listener = () => {
        const lower: unknown = Reflect.get(app, 'lower');
        if (typeof lower !== 'function') return;
        Reflect.apply(lower, app, [
          (error?: unknown) => {
            if (error) {
              report(error);
              return;
            }
            // Successful Sails lower removes these listeners before re-signalling.
            if (event === 'SIGUSR2') process.kill(process.pid, event);
            else process.exit(0);
          },
        ]);
      };
      Reflect.set(listeners, name, listener);
      // Keep restart signals armed after a refused attempt so they can retry.
      process.on(event, listener);
    }
  };
  if (!application[key]) {
    const lower: unknown = Reflect.get(app, 'lower');
    if (typeof lower !== 'function') return;
    const state: Shutdown = {};
    Object.defineProperty(application, key, { value: state });
    Reflect.set(app, 'lower', (...args: unknown[]) => {
      const callback = typeof args[0] === 'function' ? args[0] : typeof args[1] === 'function' ? args[1] : undefined;
      const options = typeof args[0] === 'function' ? undefined : args[0];
      if (!state.lowering) {
        const exiting: unknown = Reflect.get(app, '_exiting');
        Reflect.set(app, '_exiting', true);
        const attempt = (async () => {
          try {
            await new Promise<void>((resolve, reject) => {
              const before = app.config.beforeShutdown;
              if (before) before(error => (error ? reject(error) : resolve()));
              else resolve();
            });
            await new Promise<void>((resolve, reject) => {
              const before = app.config.beforeShutdown;
              // The full producer/resource chain already succeeded. Sails reads
              // this synchronously; don't invoke the hooks a second time.
              app.config.beforeShutdown = done => done();
              try {
                Reflect.apply(lower, app, [options, (error?: unknown) => (error ? reject(error) : resolve())]);
              } finally {
                app.config.beforeShutdown = before;
              }
            });
          } catch (error) {
            Reflect.set(app, '_exiting', exiting);
            throw error;
          }
        })();
        state.lowering = attempt;
        const settled = () => {
          if (state.lowering === attempt) state.lowering = undefined;
        };
        void attempt.then(settled, settled);
      }
      void state.lowering.then(
        () => {
          if (callback) Reflect.apply(callback, undefined, []);
        },
        error => {
          if (callback) Reflect.apply(callback, undefined, [error]);
          else report(error);
        }
      );
    });
    const initialize: unknown = Reflect.get(app, 'initialize');
    if (typeof initialize === 'function') {
      // initialize() installs Sails' unconditional-exit signal handlers before
      // bootstrap. Also cover persistence initialized before initialize().
      Reflect.set(app, 'initialize', (...args: unknown[]) => {
        try {
          return Reflect.apply(initialize, app, args);
        } finally {
          installSignals(state);
        }
      });
    }
  }
  installSignals(application[key]!);
}

const lifecycleKey = Symbol.for('@researchdatabox/redbox-core/sails-persistence-lifecycle/v1');

/** Install only in the legacy host; standalone persistence never mutates host lifecycle. */
export function attachSailsPersistenceLifecycle(app: Sails.Application): void {
  guardSailsShutdown(app);
  if (Reflect.get(app, lifecycleKey)) return;
  Object.defineProperty(app, lifecycleKey, { value: true });
  const previous = app.config.beforeShutdown;
  app.config.beforeShutdown = cb => {
    let called = false;
    const finish = (error?: unknown): void => {
      if (called) return;
      called = true;
      stopSailsApplication(app).then(
        () => cb(error),
        failure => cb(error ?? failure)
      );
    };
    try {
      if (previous) previous(finish);
      else finish();
    } catch (error) {
      finish(error);
    }
  };
}
