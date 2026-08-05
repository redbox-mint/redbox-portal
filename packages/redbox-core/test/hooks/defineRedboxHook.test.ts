/**
 * Tests for `defineRedboxHook`, the helper that wraps a ReDBox hook definition into the
 * shape Sails expects from a hook factory.
 *
 * The behaviour under test is the `initialize` bridge. ReDBox hooks are written in two
 * different styles and both have to keep working:
 *
 *   - callback style:  `initialize(sails, done) { ...; done(); }`
 *   - promise style:   `async initialize(sails) { await ... }`
 *
 * Sails itself also decides how to drive a hook's `initialize` by inspecting the function's
 * arity (`initialize.length`): an arity of at least 1 means "I will call you with a `done`
 * callback". So the wrapper has to satisfy both directions at once — accept either author
 * style underneath, while always presenting a single-argument, promise-returning function
 * outward.
 *
 * An earlier implementation sniffed the author's function arity to guess which style was in
 * use. That is unreliable, because JavaScript's `Function.length` ignores parameters with
 * default values and rest parameters — `(sails, done = () => {})` and `(sails, ...rest)` both
 * report a length of 1 and were therefore misread as promise-style initializers, which meant
 * the hook resolved before the author's callback ever fired. The tests below pin down the
 * arity-free behaviour that replaced the sniffing.
 */
import { defineRedboxHook } from '../../src/hooks/defineRedboxHook';

// Chai is ESM-only, so `expect` is populated by the dynamic import in `before()` below.
let expect: Chai.ExpectStatic;

// A stand-in Sails app. Nothing under test reads from it; the tests only need a stable
// reference to assert that this exact object is threaded through to the hook callbacks.
const testSails = {} as Sails.Application;

/**
 * Builds a hook from `options`, runs the factory with the fake Sails app, and returns its
 * `initialize` — i.e. the wrapper that the tests exercise, not the initializer that was
 * passed in. Throws rather than returning `undefined` so each test can assume it exists.
 */
function getInitialize(
  options: Parameters<typeof defineRedboxHook>[0]
): (done?: (error?: Error) => void) => Promise<void> {
  const hook = defineRedboxHook(options)(testSails);
  if (!hook.initialize) {
    throw new Error('Expected hook initializer to be defined.');
  }
  return hook.initialize;
}

describe('defineRedboxHook', function () {
  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  it('evaluates functional routes with the Sails application', function () {
    // `routes` may be a plain object or a factory function. When it is a function it must be
    // invoked once, with the Sails app, and its return value used verbatim as `hook.routes`.
    const routes = {};
    const hook = defineRedboxHook({
      routes: (sails: Sails.Application) => {
        expect(sails).to.equal(testSails);
        return routes;
      },
    })(testSails);

    // Identity check, not a deep equal: the exact object returned by the factory is passed
    // straight through without being copied or merged.
    expect(hook.routes).to.equal(routes);
  });

  it('accepts and waits for callback-style initializers', async function () {
    // Baseline callback case: the initializer finishes asynchronously (`setImmediate`) and
    // signals completion via `done()`. The wrapper's promise must not resolve until then, so
    // awaiting it is enough to guarantee `initialized` has been set.
    let initialized = false;
    const initialize = getInitialize({
      initialize(_sails, done) {
        setImmediate(() => {
          initialized = true;
          done();
        });
      },
    });

    await initialize();

    expect(initialized).to.equal(true);
  });

  it('waits for callback initializers with a default parameter', async function () {
    // Regression case #1 for the removed arity sniffing: a default value on `done` makes
    // `initialize.length === 1`, which the old implementation read as "promise style".
    let complete: ((error?: Error) => void) | undefined;
    let receivedArgumentCount = 0;
    const initialize = getInitialize({
      initialize(_sails: Sails.Application, done: (error?: Error) => void = () => {}) {
        // `arguments.length` reports what the wrapper actually passed, as opposed to the
        // declared arity — this is what proves the default value was never used.
        // eslint-disable-next-line prefer-rest-params
        receivedArgumentCount = arguments.length;
        // Deliberately do not complete yet; the test drives completion by hand below.
        complete = done;
      },
    });

    // Drive it the way Sails would, passing an outer `done` callback.
    let doneCallCount = 0;
    const initialization = initialize(() => {
      doneCallCount++;
    });
    // Yield one microtask so the wrapper has synchronously called the initializer and any
    // promise plumbing inside it has had a chance to run.
    await Promise.resolve();

    // The wrapper always supplies its own callback, so the default is shadowed.
    expect(receivedArgumentCount).to.equal(2);
    expect(complete).to.be.a('function');

    // The returned promise must still be pending: the initializer has not called back yet.
    // `settled` is sampled after a microtask turn, which is enough to catch a wrapper that
    // resolved eagerly instead of waiting for the callback.
    let settled = false;
    void initialization.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).to.equal(false);

    // Completing the callback resolves the wrapper's promise and notifies the outer `done`.
    complete?.();
    await initialization;

    // Completion is latched: a second call — even one reporting an error — is ignored, so a
    // sloppy initializer cannot re-enter Sails' callback or reject an already-settled hook.
    complete?.(new Error('ignored completion'));
    expect(doneCallCount).to.equal(1);
  });

  it('waits for callback initializers with a rest parameter', async function () {
    // Regression case #2 for the removed arity sniffing: rest parameters are also excluded
    // from `Function.length`, so this initializer likewise reports an arity of 1 despite
    // being callback style. The callback must still arrive, as `rest[0]`.
    let complete: (() => void) | undefined;
    const initialize = getInitialize({
      initialize(_sails: Sails.Application, ...rest: [(error?: Error) => void]) {
        complete = rest[0];
      },
    });

    // Note: no outer `done` here — the wrapper must supply its callback regardless of how it
    // was itself invoked.
    const initialization = initialize();
    await Promise.resolve();

    expect(complete).to.be.a('function');
    complete?.();
    // Awaiting would hang if the callback had not been wired through, so reaching the end of
    // the test is the assertion.
    await initialization;
  });

  it('completes Sails callback consumers for Promise initializers', async function () {
    // The other direction: a promise-style initializer that never touches `done`. The
    // wrapper still has to call Sails' callback once the promise settles.
    const initialize = getInitialize({
      initialize: async function initializePromise() {
        await Promise.resolve();
      },
    });

    // The exposed wrapper must declare exactly one parameter. Sails checks this arity to
    // decide whether to hand the hook a `done` callback, so an arity of 0 would silently
    // change how Sails drives initialization.
    expect(initialize.length).to.equal(1);

    // Consume it purely through the callback contract — the promise result is ignored here.
    await new Promise<void>((resolve, reject) => {
      initialize(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  it('passes initializer errors to Sails callback consumers', async function () {
    // A rejected initializer must surface as the callback's error argument, preserving the
    // original Error instance rather than wrapping or stringifying it.
    const error = new Error('initialization failed');
    const initialize = getInitialize({
      initialize: async function initializePromise() {
        throw error;
      },
    });

    // Using `resolve` directly as the Sails callback captures whatever error it is handed.
    // The wrapper's own promise is deliberately ignored (`void`): when a callback is present
    // the failure is reported through it, and the promise resolves instead of rejecting so
    // there is no unhandled rejection.
    const receivedError = await new Promise<Error | undefined>(resolve => {
      void initialize(resolve);
    });

    expect(receivedError).to.equal(error);
  });

  it('rejects when a Promise initializer fails without a Sails callback', async function () {
    // Same failure, but invoked without a callback — the error then has nowhere to go except
    // the returned promise, which must reject with the original Error.
    const error = new Error('initialization failed');
    const initialize = getInitialize({
      initialize: async function initializePromise() {
        throw error;
      },
    });

    let receivedError: unknown;
    try {
      await initialize();
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).to.equal(error);
  });

  it('normalizes synchronous initializer errors for Sails callback consumers', async function () {
    // Two things at once: a throw from the *synchronous* body of an initializer is caught
    // (rather than escaping the wrapper), and a non-Error throwable is normalized into an
    // Error so downstream Sails code can rely on `.message`.
    const initialize = getInitialize({
      initialize() {
        throw 'initialization failed';
      },
    });

    const receivedError = await new Promise<Error | undefined>(resolve => {
      void initialize(resolve);
    });

    expect(receivedError).to.be.instanceOf(Error);
    expect(receivedError?.message).to.equal('initialization failed');
  });
});
