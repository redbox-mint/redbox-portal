let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import { Writable } from 'stream';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as sinon from 'sinon';
import { ILogger, isLogger, logAtLevel, nothingLogger } from '@researchdatabox/sails-ng-common';
import { CoreBase } from '../../src/CoreBase';
import { isPinoLogger, log, logfmtTransportOptions } from '../../src/config/log.config';
import { createSinonStubLogger } from '../logger.test';

type LogLine = { level: string; name?: string; msg?: string; [key: string]: unknown };

function createSink() {
  const lines: LogLine[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { lines, stream };
}

class Probe extends CoreBase {
  protected _loggerNamespaceSuffix = 'Service';
  public get publicLogger(): ILogger {
    return this.logger;
  }
}

class Other extends CoreBase {
  protected _loggerNamespaceSuffix = 'Service';
  public get publicLogger(): ILogger {
    return this.logger;
  }
}

describe('log config', function () {
  let priorSails: unknown;

  beforeEach(function () {
    priorSails = (global as any).sails;
  });

  afterEach(function () {
    (global as any).sails = priorSails;
    sinon.restore();
  });

  it('only accepts a parent logger that can create child loggers', function () {
    const { stream } = createSink();
    expect(isPinoLogger(log.createPinoLogger('info', stream))).to.equal(true);
    expect(isPinoLogger({ level: 'info' })).to.equal(false);
    expect(isPinoLogger(nothingLogger)).to.equal(false);
    expect(() => log.createNamespaceLogger('Example', { level: 'info' } as unknown as ILogger)).to.throw(
      "Expected parentLogger to be a pino logger with a 'child' function"
    );
  });

  it('provides namespace loggers to services, using the configured namespace levels', function () {
    const { lines, stream } = createSink();
    const parent = log.createPinoLogger('info', stream);
    const fallback = createSinonStubLogger(sinon);
    (global as any).sails = {
      config: {
        log: { ...log, customLogger: parent },
        lognamespace: { ProbeService: 'warn' },
      },
      log: fallback,
    };

    const probe = new Probe();
    const other = new Other();
    probe.publicLogger.info('probe info');
    probe.publicLogger.warn({ structured: { value: 1 } }, 'probe warn');
    other.publicLogger.verbose('other verbose');
    // Namespace loggers without a configured level follow later changes to the parent level.
    parent.level = 'verbose';
    other.publicLogger.verbose('other verbose after');

    expect(probe.publicLogger).to.not.equal(fallback);
    expect(fallback.warn.called).to.equal(false);
    expect(lines.map(line => [line.level, line.name, line.msg])).to.deep.equal([
      ['warn', 'ProbeService', 'probe warn'],
      ['verbose', 'OtherService', 'other verbose after'],
    ]);
    expect(lines[0].structured).to.deep.equal({ value: 1 });
  });

  it('falls back to the sails logger when the namespace logger cannot be created', function () {
    const { stream } = createSink();
    const fallback = createSinonStubLogger(sinon);
    const factory = sinon.stub().throws(new Error('broken factory'));
    (global as any).sails = {
      config: { log: { createNamespaceLogger: factory, customLogger: log.createPinoLogger('info', stream) } },
      log: fallback,
    };

    const probe = new Probe();
    expect(probe.publicLogger).to.equal(fallback);
    expect(probe.publicLogger).to.equal(fallback);
    expect(factory.callCount).to.equal(1);
    expect(fallback.warn.callCount).to.equal(1);
  });

  it('keeps the established logger contract for hook implementations', function () {
    const hookLogger: ILogger = {
      silly: () => undefined,
      verbose: () => undefined,
      trace: () => undefined,
      debug: () => undefined,
      log: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      crit: () => undefined,
      fatal: () => undefined,
      silent: () => undefined,
      blank: () => undefined,
    };
    expect(isLogger(hookLogger)).to.equal(true);
  });

  it('logs at a level from config, using info for unknown levels', function () {
    const logger = createSinonStubLogger(sinon);
    logAtLevel(logger, 'verbose', 'a');
    logAtLevel(logger, 'notice', 'b');
    expect(logger.verbose.calledOnceWithExactly('a')).to.equal(true);
    expect(logger.info.calledOnceWithExactly('b')).to.equal(true);
    expect(logger.warn.calledOnce).to.equal(true);
  });

  it('keeps blank calls silent for parent, namespace, and sails loggers', function () {
    const { lines, stream } = createSink();
    const parent = log.createPinoLogger('info', stream);
    const child = log.createNamespaceLogger('Example', parent);
    const captainsLog = require('captains-log');
    const sailsLog = captainsLog({ custom: parent, inspect: false, level: 'info' });

    parent.blank();
    child.blank('ignored payload');
    sailsLog.blank();
    parent.info('still logs messages');

    expect(lines.map(line => [line.level, line.msg])).to.deep.equal([['info', 'still logs messages']]);
  });

  it('preserves logfmt field names and string values on one line per event', async function () {
    const createTransport = require('../../logfmt-transport.cjs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logfmt-transport-'));
    const file = path.join(dir, 'out.log');
    const transport = await createTransport({ ...logfmtTransportOptions, destination: file, sync: true });
    try {
      const logger = log.createPinoLogger('info', transport);
      const messages = ['plain', '', 'first\nsecond', '\n', 'a\r\nb', 'a\tb', 'quote " slash \\ literal \\n'];
      for (const message of messages) {
        logger.info({ nestedValue: { http2Status: 'ok' }, number0: 0, falseValue: false }, message);
      }
      const closed = once(transport, 'close');
      transport.end();
      await closed;

      const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
      expect(lines).to.have.length(messages.length);
      for (const [index, line] of lines.entries()) {
        expect(line).to.include('nested_value_http_2_status=ok number_0=0 false_value=false');
        expect(line).to.match(/time=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d{4}/);
        const value = line.match(/(?:^| )msg=("(?:\\.|[^"\\])*"|[^ ]*)(?: |$)/);
        expect(value).to.not.equal(null);
        const encoded = value![1];
        expect(encoded.startsWith('"') ? JSON.parse(encoded) : encoded).to.equal(messages[index]);
      }
    } finally {
      transport.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps structured objects when logging through the sails logger', function () {
    let captainsLog: (config: unknown) => ILogger;
    try {
      captainsLog = require('captains-log');
    } catch {
      this.skip();
      return;
    }
    const { lines, stream } = createSink();
    const sailsLog = captainsLog({ custom: log.createPinoLogger('info', stream), inspect: false, level: 'info' });
    sailsLog.error({ errors: [{ message: 'failed' }], res: { statusCode: 500 } }, 'Request chronicle');

    expect(lines).to.have.length(1);
    expect(lines[0]).to.deep.include({
      level: 'error',
      msg: 'Request chronicle',
      errors: [{ message: 'failed' }],
      res: { statusCode: 500 },
    });
  });
});
