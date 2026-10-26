let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import { Writable } from 'stream';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as sinon from 'sinon';
import { ILogger, isLogger, logAtLevel, nothingLogger } from '@researchdatabox/sails-ng-common';
import { bindExtensionFactory } from '../../src/extensions/composition';
import { isPinoLogger, log, logfmtTransportOptions } from '../../src/config/log.config';
import { createSinonStubLogger } from '../logger.test';
import assert from 'node:assert/strict';
import { InvalidCacheEntryError } from '../../src/persistence/cache/validation';
import { DuplicateCacheEntryError } from '../../src/persistence/cache/errors';
import { ApplicationRuntime } from '../../src/application';

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

describe('log config', function () {
  afterEach(() => sinon.restore());

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
    const probe = log.createNamespaceLogger('ProbeService', parent, undefined, 'warn');
    const other = log.createNamespaceLogger('OtherService', parent);
    probe.info('probe info');
    probe.warn({ structured: { value: 1 } }, 'probe warn');
    other.verbose('other verbose');
    // Namespace loggers without a configured level follow later changes to the parent level.
    parent.level = 'verbose';
    other.verbose('other verbose after');

    expect(probe).to.not.equal(fallback);
    expect(fallback.warn.called).to.equal(false);
    expect(lines.map(line => [line.level, line.name, line.msg])).to.deep.equal([
      ['warn', 'ProbeService', 'probe warn'],
      ['verbose', 'OtherService', 'other verbose after'],
    ]);
    expect(lines[0].structured).to.deep.equal({ value: 1 });
  });

  it('binds the explicitly supplied logger without invoking a namespace factory', function () {
    const fallback = createSinonStubLogger(sinon);
    const factory = sinon.stub(log, 'createNamespaceLogger').throws(new Error('broken factory'));
    const create = bindExtensionFactory(
      {
        name: 'probe',
        create: (input: { log: ILogger }) => ({ write: () => input.log.warn('fallback remains usable') }),
      },
      { log: fallback }
    );
    create().write();
    expect(factory.callCount).to.equal(0);
    expect(fallback.warn.calledOnceWithExactly('fallback remains usable')).to.equal(true);
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

  it('keeps blank calls silent for parent, namespace, and injected service loggers', function () {
    const { lines, stream } = createSink();
    const parent = log.createPinoLogger('info', stream);
    const child = log.createNamespaceLogger('Example', parent);
    const service = child;

    parent.blank();
    child.blank('ignored payload');
    service.blank();
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

  it('keeps structured objects through the injected application logger', function () {
    const { lines, stream } = createSink();
    const service = log.createPinoLogger('info', stream);
    service.error({ errors: [{ message: 'failed' }], res: { statusCode: 500 } }, 'Request chronicle');
    expect(lines).to.have.length(1);
    expect(lines[0]).to.deep.include({
      level: 'error',
      msg: 'Request chronicle',
      errors: [{ message: 'failed' }],
      res: { statusCode: 500 },
    });
  });

  it('redacts cache causes in initialization diagnostics and safe lifecycle status logs', async function () {
    const native = new Error('synthetic-private-cache-payload');
    for (const cacheError of [
      new InvalidCacheEntryError('Stored cache entry does not match the cache persistence contract', { cause: native }),
      new DuplicateCacheEntryError(native),
    ]) {
      for (const failure of [cacheError, new Error('Migration failed', { cause: cacheError })]) {
        const { lines, stream } = createSink();
        const logger = log.createPinoLogger('error', stream);
        const app = new ApplicationRuntime({ config: {}, log: logger }, [], {
          coreBootstrap: [
            {
              name: 'failing-bootstrap',
              run: async () => {
                throw failure;
              },
            },
          ],
        });
        let returned: unknown;
        try {
          await app.initialize();
        } catch (error) {
          returned = error;
          logger.error(error, 'Initialization failed');
          logger.error({ name: error instanceof Error ? error.name : 'Error', status: app.status() }, 'Startup failed');
        } finally {
          await app.stop();
        }
        assert.equal(returned, failure);
        assert.equal(cacheError.cause, native);
        assert.equal(lines.length, 2);
        assert.equal(lines[1].msg, 'Startup failed');
        assert.equal(lines[1].status && Reflect.get(lines[1].status as object, 'ready'), false);
        assert.doesNotMatch(JSON.stringify(lines), /synthetic-private-cache-payload/);
        assert.match(JSON.stringify(lines), new RegExp(cacheError.name));
      }
    }
  });

  it('preserves non-cache error diagnostics through the Pino error serializer', function () {
    const { lines, stream } = createSink();
    const failure = new Error('ordinary failure', { cause: new Error('ordinary cause') });
    log.createPinoLogger('error', stream).error(failure, 'Startup failed');
    assert.match(JSON.stringify(lines), /ordinary failure.*ordinary cause/);
    assert.match(JSON.stringify(lines), /stack/);
  });
});
