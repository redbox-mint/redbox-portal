import { ILogger, noOpLogFunc } from '@researchdatabox/sails-ng-common';

/**
 * Logger implementation that uses sinon stubs.
 */
export function createSinonStubLogger(sinonSandbox: Pick<typeof import('sinon'), 'stub'>) {
  return {
    silent: noOpLogFunc,
    blank: sinonSandbox.stub(),
    fatal: sinonSandbox.stub(),
    crit: sinonSandbox.stub(),
    error: sinonSandbox.stub(),
    warn: sinonSandbox.stub(),
    info: sinonSandbox.stub(),
    log: sinonSandbox.stub(),
    debug: sinonSandbox.stub(),
    verbose: sinonSandbox.stub(),
    silly: sinonSandbox.stub(),
    trace: sinonSandbox.stub(),
  } satisfies ILogger;
}
