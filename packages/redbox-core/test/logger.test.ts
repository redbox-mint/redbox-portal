import {ILogger, noOpLogFunc} from "@researchdatabox/sails-ng-common";

/**
 * Logger implementation that uses sinon stubs.
 */
export function createSinonStubLogger(sinonSandbox?: any): ILogger {
  return {
    silent: noOpLogFunc,
    blank: sinonSandbox.stub(),
    fatal: sinonSandbox.stub(),
    crit: sinonSandbox.stub(),
    emerg: sinonSandbox.stub(),
    error: sinonSandbox.stub(),
    alert: sinonSandbox.stub(),
    warn: sinonSandbox.stub(),
    warning: sinonSandbox.stub(),
    info: sinonSandbox.stub(),
    log: sinonSandbox.stub(),
    notice: sinonSandbox.stub(),
    debug: sinonSandbox.stub(),
    verbose: sinonSandbox.stub(),
    silly: sinonSandbox.stub(),
    trace: sinonSandbox.stub(),
  };
}
