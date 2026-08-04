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
    let complete: (() => void) | undefined;
    const initialize = getInitialize({
      initialize(_sails: Sails.Application, done: (error?: Error) => void = () => {}) {
        complete = done;
      },
    });

    const initialization = initialize();
    await Promise.resolve();

    expect(complete).to.be.a('function');
    let settled = false;
    void initialization.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).to.equal(false);

    complete?.();
    await initialization;
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

    await new Promise<void>(resolve => {
      initialize(receivedError => {
        expect(receivedError).to.equal(error);
        resolve();
      });
    });
  });
});
