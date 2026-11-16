// No process-level error/rejection handlers: strict children must survive through
// the actual composition logger boundary. Express is an unchanged negative oracle.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Writable, PassThrough } = require('node:stream');
const path = require('node:path');
const pino = require(
  process.argv[4] === 'root' ? path.resolve(__dirname, '../../../../../../node_modules/pino') : 'pino'
);
const { ApplicationRuntime } = require('../../../../dist/application');
const { FastifyHost } = require('../../../../dist/http/fastify/FastifyHost');
const { httpLogStats } = require('../../../../dist/http/fastify/logging');
const { log } = require('../../../../dist/config/log.config');

const [kind, failure, shape = 'direct'] = process.argv.slice(2);
let armed = false;
// Worker destinations must follow the same arm boundary as in-process streams.
// Production initialization can write before the HTTP failure probe starts.
// Slot 1 acknowledges an actual healthy write in the worker before slot 0 arms it.
const workerArmed = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2));
const lines = [];
let writes = 0;
let faults = 0;
const problem = () => Object.assign(new Error('transport-secret credential-secret'), { code: 'EPIPE' });
let destination;
let transport;
if (failure.startsWith('worker-')) {
  transport = pino.transport({
    target: require.resolve('./logging-transport.cjs'),
    options: { failure, armed: workerArmed.buffer },
  });
  destination = transport;
  if (failure === 'worker-error-event') {
    const write = transport.write.bind(transport);
    transport.write = line => {
      const result = write(line);
      if (armed) setImmediate(() => transport.worker.emit('error', problem()));
      return result;
    };
  }
} else {
  const broken = new Writable({
    write(chunk, _encoding, callback) {
      writes++;
      lines.push(String(chunk));
      if (!armed || failure === 'none') return callback();
      faults++;
      if (failure === 'sync') {
        this.emit('error', problem());
        callback();
      } else if (failure === 'epipe') callback(problem());
      else {
        setImmediate(() => this.emit('error', problem()));
        callback();
      }
    },
  });
  if (shape === 'multistream') {
    destination = pino.multistream([
      { stream: broken },
      { stream: new Writable({ write: (_chunk, _encoding, done) => done() }) },
    ]);
  } else if (shape === 'pipe') {
    destination = new PassThrough();
    destination.pipe(broken);
  } else destination = broken;
}
const logger =
  shape === 'root'
    ? pino({ level: 'trace' }, destination)
    : log.createNamespaceLogger('fm016-stream', log.createPinoLogger('trace', destination));
if (shape === 'root') assert.equal(require('../../../../../../node_modules/pino/package.json').version, '10.3.1');
let host;
let production;

async function start() {
  if (kind === 'express') {
    // The retained real PortalHttp oracle, including its production chronicle,
    // actual mounts, actions, parsers, policies, sessions and final error handler.
    require('ts-node').register({ transpileOnly: true, project: 'test/tsconfig.json' });
    const { productionSecurityFixture } = require('../securityProductionFixture.ts');
    production = await productionSecurityFixture(undefined, false, logger);
    host = production.host;
  } else {
    host = new FastifyHost(new ApplicationRuntime({ config: {}, log: logger }, []), {
      hostname: '127.0.0.1',
      port: 0,
      ...(shape === 'root' ? { logger: { sources: [destination], write: record => logger.warn(record.code) } } : {}),
      prepare: async app => {
        app.addHook('onResponse', async req => {
          if (req.url.startsWith('/on-response')) throw new Error('exception-secret');
        });
        app.get('/normal', (req, reply) => {
          req.log.warn({ headers: { authorization: 'credential-secret' } }, 'message-secret');
          return reply.send({ ok: true });
        });
        app.get('/domain', () => {
          throw new Error('exception-secret');
        });
        app.get('/post-send', async (_req, reply) => {
          reply.send({ ok: true });
          await Promise.resolve();
          throw new Error('exception-secret');
        });
        app.get('/on-response', () => ({ ok: true }));
        app.get('/duplicate', (_req, reply) => {
          reply.send({ ok: true });
          reply.send({ password: 'credential-secret' });
        });
        app.get('/probe', () => ({ ok: true }));
      },
    });
    await host.initialize();
    await host.activate();
  }
  if (transport && !transport.ready) await once(transport, 'ready');
  if (transport) {
    // Prove startup writes have completed safely before exposing the probe.
    transport.write('{"level":30,"msg":"fixture initialization before arm"}\n');
    // thread-stream.flush() only waits for bytes already in its shared buffer;
    // it can acknowledge before the queued main-thread write runs. Drain that
    // queue and the worker, then let its scheduled empty flush finish before arm.
    transport.flushSync();
    await new Promise(setImmediate);
    assert(Atomics.load(workerArmed, 1) > 0, 'worker must consume the healthy startup write before arm');
  }
  process.send({ port: host.address().port });
}

process.on('message', message => {
  void (async () => {
    if (message.command === 'arm') {
      armed = true;
      Atomics.store(workerArmed, 0, 1);
    }
    else if (message.command === 'audit-express-sync') assert(faults > 0);
    else if (message.command === 'audit') {
      const native = Reflect.get(host, 'fastify').log;
      const deadline = Date.now() + 2000;
      while (!httpLogStats(native).degraded && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 10));
      const before = httpLogStats(native);
      assert(before.degraded && before.failures > 0);
      const written = writes;
      for (let i = 0; i < 100; i++) native.warn({ err: problem() }, 'message-secret');
      assert.equal(httpLogStats(native).dropped - before.dropped, 100);
      assert.equal(writes, written, 'degraded logging never refills the destination');
      assert(!lines.join('').includes('secret'));
    } else if (message.command === 'stop') {
      if (production) await production.close();
      else await host.stop();
      if (transport && !transport.destroyed) {
        const closed = once(transport, 'close');
        transport.end();
        await closed;
      }
      process.disconnect();
      return;
    } else if (message.command !== 'ping') throw new Error('Unknown stream fixture command');
    process.send({ id: message.id });
  })();
});
void start();
