import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import {
  availableLogLevels,
  consoleLogger,
  isAvailableLogLevel,
  isLogger,
  logAtLevel,
  nothingLogger,
} from '../../src/logger.model';

describe('shared logger adapters', () => {
  afterEach(() => sinon.restore());

  it('accepts existing application loggers and rejects incomplete or non-callable implementations', () => {
    assert.equal(isLogger(consoleLogger), true);
    assert.equal(isLogger(nothingLogger), true);
    for (const value of [undefined, null, [], 'logger', { ...nothingLogger, warn: 'warn' }, { info() {} }]) {
      assert.equal(isLogger(value), false);
    }
    for (const level of availableLogLevels) assert.equal(isAvailableLogLevel(level), true);
    for (const value of [undefined, null, 1, {}, 'notice', 'INFO', 'constructor']) {
      assert.equal(isAvailableLogLevel(value), false);
    }
  });

  it('preserves the logger receiver and structured arguments when dispatching a configured level', () => {
    const details = { operation: 'audit', count: 1 };
    const logger = { ...nothingLogger, info: sinon.spy(), warn: sinon.spy() };
    logAtLevel(logger, 'info', details, 'Audit event');
    assert.equal(logger.info.calledOn(logger), true);
    assert.equal(logger.info.calledOnceWithExactly(details, 'Audit event'), true);
    logAtLevel(logger, 'notice', details, 'Fallback event');
    assert.equal(logger.warn.calledOnce, true);
    assert.match(String(logger.warn.firstCall.args[0]), /Unknown log level 'notice'/);
    assert.equal(logger.info.secondCall.calledWithExactly(details, 'Fallback event'), true);
  });

  const methods = {
    fatal: 'error',
    crit: 'error',
    error: 'error',
    warn: 'warn',
    info: 'info',
    log: 'log',
    debug: 'debug',
    verbose: 'debug',
    silly: 'debug',
    trace: 'trace',
  } as const;
  for (const [level, method] of Object.entries(methods)) {
    it(`routes ${level} messages and structured details to console.${method}`, () => {
      const output = sinon.stub(console, method);
      const details = { requestId: 'request-1' };
      consoleLogger[level as keyof typeof methods]('Message', details);
      assert.equal(output.calledOnceWithExactly('Message', details), true);
    });
  }

  it('emits an empty line for blank and keeps silent and discarded logs quiet', () => {
    const output = sinon.stub(console, 'log');
    consoleLogger.blank('ignored payload');
    assert.equal(output.calledOnceWithExactly(''), true);
    output.resetHistory();
    consoleLogger.silent('private payload');
    for (const level of availableLogLevels) nothingLogger[level]('private payload');
    assert.equal(output.called, false);
  });
});
