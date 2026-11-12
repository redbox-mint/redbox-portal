import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { join } from 'node:path';
import {
  createHttpLogger,
  drainHttpLogger,
  httpLogStats,
  httpLogFallbackIntervalMs,
} from '../../../src/http/fastify/logging';
import { PassThrough, Writable } from 'node:stream';
import pino from 'pino';
import sinon from 'sinon';
import fs from 'node:fs';
import { ApplicationRuntime } from '../../../src/application';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { hasActiveHttpRequest } from '../../../src/middleware/requestLifetime';
import { persistenceOperation } from '../../../src/persistence/runtime';
import { pinoLoggerDestinations } from '../../../src/utilities/PinoLoggerUtils';
import { log } from '../../../src/config/log.config';

const streamFailures = ['sync', 'async', 'epipe'] as const;
const workerFailures = ['worker-stream', 'worker-error-event', 'worker-exit', 'worker-exit-zero'] as const;
const points = ['normal', 'domain', 'post-send', 'on-response', 'duplicate'] as const;

function get(port: number, target: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; reason: string; headers: unknown; body: string }>((resolve, reject) => {
    const client = request({ hostname: '127.0.0.1', port, path: target, headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => (body += chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode!, reason: response.statusMessage!, headers: response.headers, body })
      );
      response.on('error', reject);
    });
    client.on('error', reject);
    client.setTimeout(5000, () => client.destroy(new Error('Stream survival request timed out')));
    client.end();
  });
}

async function fixture(kind: 'fastify' | 'express', failure: string, shape = 'direct') {
  const child = fork(join(__dirname, 'fixtures/logging-survival.cjs'), [kind, failure, shape], {
    execArgv: ['--unhandled-rejections=strict', '--no-experimental-strip-types'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout!.on('data', value => (output += value));
  child.stderr!.on('data', value => (output += value));
  const exit = once(child, 'exit');
  let id = 0;
  const next = () =>
    Promise.race([
      once(child, 'message').then(([message]) => message),
      exit.then(([code, signal]) => {
        throw new Error(`Logger child exited (${code}, ${signal}): ${output}`);
      }),
    ]);
  const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
  const stop = async () => {
    try {
      if (child.connected && child.exitCode === null && child.signalCode === null)
        child.send({ command: 'stop' }, () => {});
      return await exit;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const { port } = await next();
    assert(Number.isInteger(port));
    return {
      port,
      exit,
      output: () => output,
      async command(command: string) {
        const result = next();
        child.send({ command, id: ++id }, () => {});
        assert.deepEqual(await result, { id });
      },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

describe('FM-016 logger destination and worker survival', function () {
  this.timeout(30000);
  const cases = [
    ...streamFailures.flatMap(failure => ['direct', 'multistream', 'pipe'].map(shape => ({ failure, shape }))),
    ...workerFailures.map(failure => ({ failure, shape: 'direct' })),
    ...streamFailures.map(failure => ({ failure, shape: 'root' })),
  ];
  for (const { failure, shape } of cases)
    for (const point of points)
      it(`${failure} × ${shape} × ${point}: strict native child survives and drops later diagnostics`, async () => {
        const f = await fixture('fastify', failure, shape);
        try {
          await f.command('arm');
          const response = await get(f.port, `/${point}?password=query-secret`, {
            Authorization: 'Bearer credential-secret',
          });
          const failed = point === 'domain';
          assert.equal(response.status, failed ? 500 : 200);
          assert.equal(response.reason, failed ? 'Internal Server Error' : 'OK');
          assert.equal(response.body, failed ? '{"message":"Internal server error","details":""}' : '{"ok":true}');
          assert(!JSON.stringify(response).includes('secret'));
          await f.command('audit');
          for (const target of ['/healthz', '/readyz', '/probe']) assert.equal((await get(f.port, target)).status, 200);
          await f.command('ping');
          const [code, signal] = await f.stop();
          assert.equal(code, 0, f.output());
          assert.equal(signal, null, f.output());
          assert(!f.output().includes('secret'), 'Neither stderr nor stdout may disclose a transport exception');
        } finally {
          await f.stop();
        }
      });

  it('the unchanged production Express oracle serves a normal request with a healthy destination', async () => {
    const f = await fixture('express', 'none');
    try {
      await f.command('arm');
      const response = await get(f.port, '/portal/default/rdmp/api/named-query', {
        Authorization: 'Bearer pilot-api-token',
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await f.stop(), [0, null]);
    } finally {
      await f.stop();
    }
  });

  for (const failure of [...streamFailures, ...workerFailures])
    it(`records the existing Express production destination failure: ${failure}`, async () => {
      const f = await fixture('express', failure);
      try {
        await f.command('arm');
        if (failure === 'sync') {
          // Production chronicle catches synchronous destination throws, unlike
          // deferred stream errors. Record that survival instead of claiming a crash.
          assert.equal(
            (
              await get(f.port, '/portal/default/rdmp/api/named-query', {
                Authorization: 'Bearer pilot-api-token',
              })
            ).status,
            200
          );
          await f.command('audit-express-sync');
          await f.command('ping');
          assert.deepEqual(await f.stop(), [0, null]);
          assert(!f.output().includes('secret'));
          return;
        }
        const probe = () =>
          get(f.port, '/portal/default/rdmp/api/named-query', { Authorization: 'Bearer pilot-api-token' }).catch(
            () => undefined
          );
        await probe();
        // A zero-exit worker closes without emitting an error; the next actual
        // production request exposes thread-stream's failed-destination write.
        await new Promise(resolve => setTimeout(resolve, 150));
        await probe();
        const [code, signal] = await f.exit;
        assert.equal(code, 1, f.output());
        assert.equal(signal, null, f.output());
        assert.match(f.output(), /Error:|Unhandled.*error/);
      } finally {
        await f.stop();
      }
    });
});

describe('FM-016 shared logger destination registration', () => {
  it('retains bounded request correlation for export disposal failures without diagnostics or query values', async () => {
    const records: unknown[] = [];
    const logger = createHttpLogger(record => { records.push(record); });
    try {
      logger.error({ req: { id: 'req-42', url: '/export?token=query-secret' }, err: new Error('cursor-secret') }, 'HTTP_STREAM_DISPOSAL_FAILED');
      for (const id of ['secret\nforged', 'x'.repeat(101), { toString() { throw new Error('secret'); } }])
        logger.error({ req: { id, url: '/export?token=query-secret' } }, 'HTTP_STREAM_DISPOSAL_FAILED');
      assert.deepEqual(records, [
        { code: 'HTTP_STREAM_DISPOSAL_FAILED', level: 'error', path: '/export', requestId: 'req-42' },
        ...Array.from({ length: 3 }, () => ({ code: 'HTTP_STREAM_DISPOSAL_FAILED', level: 'error', path: '/export' })),
      ]);
      assert(!JSON.stringify(records).includes('secret'));
    } finally { await drainHttpLogger(logger); }
  });
  for (const shape of ['plain', 'null-prototype', 'default'])
    it(`preserves 00511d68b shared logger output and runtime/namespace levels: ${shape}`, async () => {
      const run = async (revision: string) => {
        const child = fork(join(__dirname, 'fixtures/logger-compatibility.cjs'), [revision, shape], {
          execArgv: ['--unhandled-rejections=strict', '--no-experimental-strip-types'],
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        let output = '',
          stderr = '';
        child.stdout!.on('data', data => (output += data));
        child.stderr!.on('data', data => (stderr += data));
        const result = once(child, 'message');
        const exit = once(child, 'exit');
        const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
        try {
          const [code, signal] = await exit;
          assert.deepEqual([code, signal], [0, null], stderr);
          const [message] = await result;
          const normalize = (text: string) =>
            text
              .replace(/"(?:pid|hostname|time|stack)":(?:"(?:\\.|[^"\\])*"|\d+),?/g, '')
              .replace(/(?:pid|hostname|time)=(?:"[^"]*"|\S+) ?/g, '');
          return { message: { ...message, lines: message.lines.map(normalize) }, output: normalize(output), stderr };
        } finally {
          clearTimeout(timer);
        }
      };
      const baseline = await run('baseline');
      const current = await run('current');
      assert.deepEqual(current, baseline);
      assert.deepEqual(current.message.levels, ['warn', 'trace']);
      assert.deepEqual(current.message.enabled, [false, true]);
      assert.equal(current.message.lines.length || current.output.trim().split('\n').length, 4);
    });

  it('shares one stream error listener across hosts and observes delayed errors without retaining diagnostics', async () => {
    const destination = new PassThrough();
    const parent = log.createPinoLogger('silent', destination);
    const baseline = destination.listenerCount('error');
    const loggers = Array.from({ length: 50 }, () =>
      createHttpLogger({ sources: pinoLoggerDestinations(parent.child({ name: 'safe' })), write() {} })
    );
    assert.equal(destination.listenerCount('error') - baseline, 1);
    destination.emit('error', new Error('transport-secret'));
    for (const logger of loggers) {
      const stats = httpLogStats(logger);
      assert(stats.degraded && stats.failures >= 1);
      logger.warn({ err: new Error('credential-secret') });
      assert.equal(httpLogStats(logger).dropped, 1);
    }
    destination.destroy();
    await Promise.all(loggers.map(drainHttpLogger));
  });

  it('registers explicit callback destinations before any diagnostic is written', async () => {
    const destination = new PassThrough();
    let writes = 0;
    const logger = createHttpLogger({ sources: [destination], write: () => writes++ });
    destination.emit('error', new Error('transport-secret'));
    logger.error('message-secret');
    assert.equal(writes, 0);
    assert.equal(httpLogStats(logger).dropped, 1);
    destination.destroy();
    await drainHttpLogger(logger);
  });
});

describe('FM-016 logging fallback and status', () => {
  it('stays visibly degraded until restart, even after pipe repair', async () => {
    const clock = sinon.useFakeTimers();
    const stderr = sinon.stub(fs, 'writeSync').returns(1);
    const source = new PassThrough();
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    source.pipe(destination);
    const parent = pino({ level: 'trace' }, source);
    const logger = createHttpLogger({ sources: [source], write: record => parent.warn(record) });
    try {
      destination.emit('error', new Error('pipe-secret'));
      await clock.tickAsync(102);
      assert.equal(httpLogStats(logger).degraded, true);
      assert.equal(lines.length, 0);
      source.pipe(destination);
      await clock.tickAsync(202);
      assert.equal(httpLogStats(logger).degraded, true);
      logger.warn('credential-secret');
      assert.equal(lines.length, 0);
      assert(!lines.join('').includes('secret'));
    } finally {
      await drainHttpLogger(logger);
      source.destroy();
      destination.destroy();
      stderr.restore();
      clock.restore();
    }
  });
  it('drops persistent failures and rate-limits fixed fallback codes without retries', async () => {
    const clock = sinon.useFakeTimers();
    const stderr = sinon.stub(fs, 'writeSync').returns(1);
    let writes = 0;
    const logger = createHttpLogger({
      sources: [],
      write() {
        writes++;
        throw new Error('sink-secret');
      },
    });
    try {
      logger.warn('credential-secret');
      for (let i = 0; i < 100; i++) logger.warn('credential-secret');
      assert.equal(stderr.callCount, 1);
      await clock.tickAsync(httpLogFallbackIntervalMs);
      logger.warn('credential-secret');
      assert.equal(stderr.callCount, 2);
      assert.equal(writes, 1);
      const stats = httpLogStats(logger);
      assert(stats.degraded && stats.failures === 1 && stats.dropped === 101);
      assert(stderr.args.every(args => args[0] === 2 && args[1] === 'HTTP_LOG_SINK_FAILURE\n'));
      assert(!JSON.stringify(stderr.args).includes('secret'));
    } finally {
      await drainHttpLogger(logger);
      stderr.restore();
      clock.restore();
    }
  });

  it('contains a broken stderr fd without recursively logging its exception', async () => {
    const clock = sinon.useFakeTimers();
    const stderr = sinon.stub(fs, 'writeSync').throws(new Error('stderr-secret'));
    const logger = createHttpLogger({
      sources: [],
      write() {
        throw new Error('sink-secret');
      },
    });
    try {
      logger.error('credential-secret');
      await clock.tickAsync(httpLogFallbackIntervalMs);
      logger.warn('credential-secret');
      assert.equal(stderr.callCount, 2);
      assert.equal(httpLogStats(logger).fallbackFailures, 2);
      assert.equal(httpLogStats(logger).fallbackWrites, 0);
    } finally {
      await drainHttpLogger(logger);
      stderr.restore();
      clock.restore();
    }
  });

  it('exposes degradation and rising counters on status/health without failing readiness, until operator restart', async () => {
    let broken = false;
    const host = new FastifyHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }, []), {
      hostname: '127.0.0.1',
      port: 0,
      logger: {
        sources: [],
        write() {
          if (broken) throw new Error('sink-secret');
        },
      },
      prepare: async app => {
        app.get('/log', req => {
          req.log.warn('credential-secret');
          return { ok: true };
        });
      },
    });
    try {
      await host.initialize();
      await host.activate();
      const port = host.address()!.port;
      assert.deepEqual(JSON.parse((await get(port, '/healthz')).body), { healthy: true });
      broken = true;
      await get(port, '/log');
      await get(port, '/log');
      const before = host.status().logging;
      assert(before.degraded && before.failures > 0 && before.dropped > 0);
      const health = await get(port, '/healthz');
      assert.equal(health.status, 200);
      const signal = JSON.parse(health.body);
      assert(signal.healthy && signal.logging.degraded && signal.logging.failures >= before.failures);
      assert(!JSON.stringify(signal).includes('secret'));
      assert.deepEqual(JSON.parse((await get(port, '/readyz')).body), { ready: true });
      broken = false;
      await get(port, '/log');
      assert(host.status().logging.degraded);
      assert(host.status().logging.dropped > before.dropped);
      assert.equal(JSON.parse((await get(port, '/healthz')).body).logging.degraded, true);
      assert.equal((await get(port, '/readyz')).status, 200);
    } finally {
      await host.stop();
    }
  });
});

describe('FM-016 async logger shutdown ownership', () => {
  for (const point of ['request', 'post-send', 'callback-sync', 'callback-async', 'outside-request'] as const)
    for (const rejects of [false, true])
      it(`retains ${point} ${rejects ? 'rejection' : 'fulfillment'} until the borrowed resource is safe to close`, async () => {
        const entered = Promise.withResolvers<void>(),
          held = Promise.withResolvers<void>();
        let closed = false,
          armed = false,
          closes = 0,
          writes = 0,
          started = 0;
        const owner = { config: {}, log: { warn() {} } };
        const host = new FastifyHost(
          new ApplicationRuntime(owner, [
            {
              name: 'borrowed',
              create: () => ({
                initialize: async () => {},
                close: async () => {
                  closed = true;
                  closes++;
                },
              }),
            },
          ]),
          {
            hostname: '127.0.0.1',
            port: 0,
            logger: {
              sources: [],
              write: async () => {
                if (!armed) return;
                started++;
                entered.resolve();
                await held.promise;
                assert.equal(closed, false);
                if (point !== 'outside-request') assert(hasActiveHttpRequest(owner));
                await persistenceOperation(owner, async () => {
                  writes++;
                });
                if (rejects) throw new Error('sink-secret');
              },
            },
            prepare: async app => {
              app.get('/log', (req, reply) => {
                if (point === 'request') req.log.warn('credential-secret');
                if (point.startsWith('callback'))
                  reply.then(
                    point === 'callback-sync'
                      ? () => {
                          throw new Error('callback-secret');
                        }
                      : async () => {
                          throw new Error('callback-secret');
                        },
                    error => {
                      throw error;
                    }
                  );
                reply.send({ ok: true });
                if (point === 'post-send') return Promise.reject(new Error('post-send-secret'));
              });
            },
          }
        );
        try {
          await host.initialize();
          await host.activate();
          armed = true;
          if (point === 'outside-request') Reflect.get(host, 'fastify').log.warn('credential-secret');
          else assert.equal((await get(host.address()!.port, '/log')).status, 200);
          await entered.promise;
          assert(host.status().logging.pending > 0);
          await assert.rejects(host.stop({ deadlineMs: 40 }), /deadline|owned/i);
          assert.equal(closed, false);
          assert.equal(writes, 0);
          held.resolve();
          await host.stop({ deadlineMs: 2000 });
          assert.equal(closed, true);
          assert(started > 0);
          assert.equal(writes, started, 'every accepted sink finishes its borrowed write before closure');
          assert.equal(host.status().logging.pending, 0);
          await host.stop();
          assert.equal(closes, 1);
        } finally {
          held.resolve();
          await host.stop({ deadlineMs: 2000 });
        }
      });
});

async function realDestination(mode: string, fault: string, full = false) {
  const fd = full ? fs.openSync('/dev/full', 'w') : undefined;
  const child = fork(join(__dirname, 'fixtures/logger-destinations.cjs'), [mode, fault], {
    execArgv: ['--unhandled-rejections=strict', '--no-experimental-strip-types'],
    stdio: ['ignore', fd ?? 'pipe', 'pipe', 'ipc'],
  });
  if (fd !== undefined) fs.closeSync(fd);
  let output = '';
  child.stdout?.on('data', data => {
    output += data;
  });
  child.stderr!.on('data', data => {
    output += data;
  });
  const exit = once(child, 'exit');
  const receive = () =>
    Promise.race([
      once(child, 'message').then(([message]) => message),
      exit.then(([code, signal]) => {
        throw new Error(`Real logger child exited (${code}, ${signal}): ${output}`);
      }),
    ]);
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
  let id = 0;
  const stop = async () => {
    try {
      if (child.connected && child.exitCode === null) child.send({ command: 'stop' }, () => {});
      return await exit;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const { port } = await receive();
    return {
      port,
      output: () => output,
      stop,
      breakPipe: () => child.stdout!.destroy(),
      command: async (command: string) => {
        const message = receive();
        child.send({ command, id: ++id });
        const response = await message;
        assert.equal(response.id, id);
        return response.result;
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
async function until(predicate: () => Promise<boolean>, ms = 4000) {
  const end = Date.now() + ms;
  while (!(await predicate())) {
    assert(Date.now() < end, 'Destination did not reach the required state');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('FM-016 real ReDBox destination failure containment', function () {
  this.timeout(20000);
  for (const mode of ['stdout', 'file', 'logfmt'])
    for (const fault of ['destroy', 'error', 'close', 'epipe'])
      it(`${mode} × ${fault}: visible loss until operator restart`, async () => {
        const f = await realDestination(mode, fault);
        try {
          assert.equal((await get(f.port, '/log')).status, 200);
          await f.command('fault');
          await until(async () => (await f.command('snapshot')).degraded);
          for (let i = 0; i < 5; i++) await get(f.port, '/log');
          const stats = await f.command('snapshot');
          assert(stats.degraded && stats.dropped >= 5);
          assert.equal((await get(f.port, '/readyz')).status, 200);
          assert.equal((await get(f.port, '/domain')).status, 500);
          assert.equal(JSON.parse((await get(f.port, '/healthz')).body).logging.degraded, true);
          assert(!JSON.stringify([f.output(), await f.command('contents')]).includes('secret'));
          assert.deepEqual(await f.stop(), [0, null]);
        } finally {
          await f.stop();
        }
      });

  for (const mode of ['stdout', 'file', 'logfmt'])
    it(`${mode} × real /dev/full: failed destination stays degraded and stop completes`, async () => {
      const f = await realDestination(mode, 'full', mode !== 'file');
      try {
        await get(f.port, '/log');
        await until(async () => (await f.command('snapshot')).degraded);
        const before = await f.command('snapshot');
        await get(f.port, '/log');
        assert((await f.command('snapshot')).dropped > before.dropped);
        assert.equal((await get(f.port, '/readyz')).status, 200);
        assert(!f.output().includes('secret'));
        assert.deepEqual(await f.stop(), [0, null]);
      } finally {
        await f.stop();
      }
    });

  it('failed asynchronous SonicBoom open (ENOENT) cannot hold host.stop or borrowed cleanup', async () => {
    const f = await realDestination('file', 'enoent');
    try {
      await until(async () => (await f.command('snapshot')).degraded);
      assert.equal((await get(f.port, '/domain')).status, 500);
      assert.equal((await get(f.port, '/readyz')).status, 200);
      const result = await f.command('stop-check');
      assert(result.elapsed < 750 && result.closed);
      assert.equal(result.pending, 0);
      assert(!f.output().includes('secret'));
      assert.deepEqual(await f.stop(), [0, null], f.output());
    } finally {
      await f.stop();
    }
  });

  it('contains an actual stdout pipe EPIPE until operator restart', async () => {
    const f = await realDestination('stdout', 'pipe');
    try {
      await get(f.port, '/log');
      f.breakPipe();
      await get(f.port, '/log');
      await until(async () => (await f.command('snapshot')).degraded);
      assert.equal((await get(f.port, '/readyz')).status, 200);
      assert(!f.output().includes('secret'));
      assert.deepEqual(await f.stop(), [0, null]);
    } finally {
      await f.stop();
    }
  });
});

describe('FM-016 destination state before ordinary dispatch', () => {
  for (const [key, value] of [
    ['errored', new Error('transport-secret')],
    ['writableErrored', new Error('transport-secret')],
    ['destroyed', true],
    ['closed', true],
    ['writable', false],
    ['writableEnded', true],
    ['writableFinished', true],
  ] as const)
    it(`contains silent ${key} without dispatch or false recovery`, async () => {
      const source = new PassThrough();
      let writes = 0;
      const logger = createHttpLogger({
        sources: [source],
        write() {
          writes++;
        },
      });
      try {
        logger.warn('before');
        assert.equal(writes, 1);
        Object.defineProperty(source, key, { value, configurable: true });
        logger.warn('credential-secret');
        assert.equal(writes, 1);
        const stats = httpLogStats(logger);
        assert(stats.degraded && stats.failures > 0 && stats.dropped === 1);
      } finally {
        delete (source as any)[key];
        await drainHttpLogger(logger);
        source.destroy();
      }
    });
  for (const event of ['close', 'finish'])
    it(`contains ${event} before the next write and stays visible until restart`, async () => {
      const source = new PassThrough();
      const logger = createHttpLogger({
        sources: [source],
        write() {
          assert.fail('failed destination dispatch');
        },
      });
      try {
        source.emit(event);
        logger.warn('credential-secret');
        assert(httpLogStats(logger).degraded);
        assert.equal(httpLogStats(logger).dropped, 1);
      } finally {
        await drainHttpLogger(logger);
        source.destroy();
      }
    });
});
