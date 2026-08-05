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
function getInitialize(options: Parameters<typeof defineRedboxHook>[0]): () => Promise<void> {
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
    let routesCallCount = 0;
    let receivedSails: Sails.Application | undefined;
    const hook = defineRedboxHook({
      routes: (sails: Sails.Application) => {
        routesCallCount++;
        receivedSails = sails;
        return routes;
      },
    })(testSails);

    // Evaluated exactly once, with the Sails app the hook factory was called with.
    expect(routesCallCount).to.equal(1);
    expect(receivedSails).to.equal(testSails);
    // Identity check, not a deep equal: the exact object returned by the factory is passed
    // straight through without being copied or merged.
    expect(hook.routes).to.equal(routes);
    // Hooks always get a `defaults` object, even when the definition omits one.
    expect(hook.defaults).to.deep.equal({});
  });

  it('accepts and waits for callback-style initializers', async function () {
    // Baseline callback case: the initializer finishes asynchronously (`setImmediate` defers
    // to a later event-loop tick) and signals completion via `done()`. The wrapper's promise
    // must not resolve until then, so awaiting it is enough to guarantee `initialized` is set.
    let initialized = false;
    let receivedSails: Sails.Application | undefined;
    const initialize = getInitialize({
      initialize(sails, done) {
        receivedSails = sails;
        setImmediate(() => {
          initialized = true;
          done();
        });
      },
    });

    const initialization = initialize();

    // The initializer has started - and been handed the Sails app - but its deferred body has
    // not run yet, so this is the "still in flight" state the wrapper has to wait out.
    expect(receivedSails).to.equal(testSails);
    expect(initialized).to.equal(false);

    await initialization;

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

    // Nothing has run yet: the initializer is only invoked when `initialize` is called, so a
    // `complete` that is already set would mean the helper above, not this call, ran it.
    expect(complete).to.equal(undefined);

    // Drive it the way Sails would, by passing an outer `done` callback.
    let doneCallCount = 0;
    const initialization = initialize(() => {
      doneCallCount++;
    });

    // Yield one turn of the microtask queue. The wrapper calls the initializer synchronously,
    // so `complete` is already assigned by this point; the yield matters because it also lets
    // the wrapper's promise branch run. Had the wrapper misread this initializer as
    // promise-style, it would have settled during this turn - so anything still pending after
    // the yield is pending because the wrapper is genuinely waiting on the callback.
    await Promise.resolve();

    // The wrapper always supplies its own callback, so the declared default is shadowed. This
    // is the assertion that separates the two branches: on the promise branch the initializer
    // would have been called with one argument and `done` would be the local `() => {}`, which
    // is still "a function" - so the argument count, not `complete`, is what proves the fix.
    expect(receivedArgumentCount).to.equal(2);
    expect(complete).to.be.a('function');

    // Nothing has completed yet, so Sails' callback must not have fired.
    expect(doneCallCount).to.equal(0);

    // The returned promise must still be pending. `.then()` callbacks are themselves queued as
    // microtasks, so `settled` cannot be read on the same turn it is registered - the second
    // yield below is what gives an already-resolved promise the chance to set it. Without that
    // yield the assertion would pass trivially and catch nothing.
    let settled = false;
    void initialization.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).to.equal(false);

    // Completing the callback resolves the wrapper's promise and notifies the outer `done`.
    complete?.();
    await initialization;
    expect(doneCallCount).to.equal(1);

    // Completion is latched: a second call - even one reporting an error - is ignored, so a
    // sloppy initializer cannot re-enter Sails' callback or reject an already-settled hook.
    complete?.(new Error('ignored completion'));
    expect(doneCallCount).to.equal(1);
  });

  it('waits for callback initializers with a rest parameter', async function () {
    // Regression case #2 for the removed arity sniffing: rest parameters are also excluded
    // from `Function.length`, so this initializer likewise reports an arity of 1 despite
    // being callback style.
    //
    // Where `rest[0]` comes from: the wrapper always calls the initializer as
    // `initializer(sails, initializerDone)`. A rest parameter collects every argument after
    // the declared ones into an array, so `sails` binds to `_sails` and everything after it -
    // here just the wrapper's own callback - lands in `rest`. `rest[0]` is therefore the same
    // `done` that the previous test received as a named parameter; the tuple type
    // `[(error?: Error) => void]` is what tells TypeScript to expect exactly that one entry.
    let complete: (() => void) | undefined;
    let receivedRestLength = -1;
    const initialize = getInitialize({
      initialize(_sails: Sails.Application, ...rest: [(error?: Error) => void]) {
        receivedRestLength = rest.length;
        complete = rest[0];
      },
    });

    // Not yet run, so the assignment below can only come from the call that follows.
    expect(complete).to.equal(undefined);

    // Note: no outer `done` here - the wrapper must supply its callback to the initializer
    // regardless of how the wrapper itself was invoked.
    const initialization = initialize();

    // As in the previous test, one microtask turn. The initializer runs synchronously, but
    // yielding here lets the wrapper's promise branch settle if it took it by mistake, so the
    // state observed below is the state the wrapper really intends.
    await Promise.resolve();

    // Exactly one trailing argument, and it is the completion callback - a promise-style
    // invocation would have passed none and left `rest` empty.
    expect(receivedRestLength).to.equal(1);
    expect(complete).to.be.a('function');

    // Completing through `rest[0]` must settle the wrapper's promise. If the callback had not
    // been wired through, this await would never resolve and mocha would time out - so
    // reaching the end of the test is itself the assertion.
    complete?.();
    await initialization;
  });

  it('completes Sails callback consumers for Promise initializers', async function () {
    // The other direction: a promise-style initializer that never touches `done`. The
    // wrapper still has to call Sails' callback once the promise settles.
    let initializerRan = false;
    const initialize = getInitialize({
      initialize: async function initializePromise() {
        await Promise.resolve();
        initializerRan = true;
      },
    });

    // The exposed wrapper must have no callback parameter. Sails would otherwise pass a
    // callback to an async function and reject it as an unexpected callback.
    expect(initialize.length).to.equal(0);
    await initialize();

    // The initializer completed after its callback fired.
    expect(initializerRan).to.equal(true);
  });

  it('surfaces asynchronous initializer errors', async function () {
    // A rejected initializer must surface as the callback's error argument, preserving the
    // original Error instance rather than wrapping or stringifying it.
    const error = new Error('initialization failed');
    const initialize = getInitialize({
      initialize: async function initializePromise() {
        throw error;
      },
    });

    let receivedError: unknown;
    try {
      await initialize();
    } catch (caughtError) {
      receivedError = caughtError;
    }

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

  it('surfaces synchronous initializer errors', async function () {
    // A throw from the synchronous body of an initializer is caught rather than escaping
    // the wrapper, and non-Error throwables are normalized for Sails.
    const initialize = getInitialize({
      initialize() {
        throw 'initialization failed';
      },
    });

    let receivedError: unknown;
    try {
      await initialize();
    } catch (caughtError) {
      receivedError = caughtError;
    }

    expect(receivedError).to.be.instanceOf(Error);
    expect((receivedError as Error).message).to.equal('initialization failed');
  });
});
