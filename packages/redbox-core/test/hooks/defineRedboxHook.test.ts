import { defineRedboxHook } from '../../src/hooks/defineRedboxHook';

let expect: Chai.ExpectStatic;
const testSails = {} as Sails.Application;

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
    const routes = {};
    const hook = defineRedboxHook({
      routes: (sails: Sails.Application) => {
        expect(sails).to.equal(testSails);
        return routes;
      },
    })(testSails);

    expect(hook.routes).to.equal(routes);
  });

  it('accepts and waits for callback-style initializers', async function () {
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
    let complete: ((error?: Error) => void) | undefined;
    let receivedArgumentCount = 0;
    const initialize = getInitialize({
      initialize(_sails: Sails.Application, done: (error?: Error) => void = () => {}) {
        // eslint-disable-next-line prefer-rest-params
        receivedArgumentCount = arguments.length;
        complete = done;
      },
    });

    let doneCallCount = 0;
    const initialization = initialize(() => {
      doneCallCount++;
    });
    await Promise.resolve();

    expect(receivedArgumentCount).to.equal(2);
    expect(complete).to.be.a('function');
    let settled = false;
    void initialization.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).to.equal(false);

    complete?.();
    await initialization;
    complete?.(new Error('ignored completion'));
    expect(doneCallCount).to.equal(1);
  });

  it('waits for callback initializers with a rest parameter', async function () {
    let complete: (() => void) | undefined;
    const initialize = getInitialize({
      initialize(_sails: Sails.Application, ...rest: [(error?: Error) => void]) {
        complete = rest[0];
      },
    });

    const initialization = initialize();
    await Promise.resolve();

    expect(complete).to.be.a('function');
    complete?.();
    await initialization;
  });

  it('completes Sails callback consumers for Promise initializers', async function () {
    const initialize = getInitialize({
      initialize: async function initializePromise() {
        await Promise.resolve();
      },
    });

    expect(initialize.length).to.equal(1);
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
    const error = new Error('initialization failed');
    const initialize = getInitialize({
      initialize: async function initializePromise() {
        throw error;
      },
    });

    const receivedError = await new Promise<Error | undefined>(resolve => {
      void initialize(resolve);
    });

    expect(receivedError).to.equal(error);
  });

  it('rejects when a Promise initializer fails without a Sails callback', async function () {
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
