// Real ReDBox destination tests, in strict isolated processes with no global
// rejection/exception suppressor. No synthetic acknowledgement or flush stub.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pino = require('pino');
const { log } = require('../../../../dist/config/log.config');
const { ApplicationRuntime } = require('../../../../dist/application');
const { FastifyHost } = require('../../../../dist/http/fastify/FastifyHost');
const { pinoLoggerDestinations } = require('../../../../dist/utilities/PinoLoggerUtils');
const [mode, fault] = process.argv.slice(2);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fm016-r9-destination-'));
const file = path.join(directory, fault === 'enoent' ? 'missing/out.log' : 'out.log');
if (mode === 'file' && fault === 'full') fs.symlinkSync('/dev/full', file);
// Direct SonicBoom for the failed-open row avoids Pino's separate process-exit
// flush hook on an unopened fd. The host borrows this actual async file sink.
const destination =
  fault === 'enoent'
    ? new (require('sonic-boom'))({ dest: file, sync: false })
    : mode === 'logfmt'
      ? undefined
      : pino.destination({ dest: mode === 'file' ? file : 1, sync: false });
const parent = log.createNamespaceLogger('fm016-real', log.createPinoLogger('trace', destination));
const stream = pinoLoggerDestinations(parent)[0];
let closed = false;
const application = new ApplicationRuntime({ config: {}, log: parent }, [
  {
    name: 'borrowed',
    create: () => ({
      initialize: async () => {},
      close: async () => {
        closed = true;
      },
    }),
  },
]);
const host = new FastifyHost(application, {
  hostname: '127.0.0.1',
  port: 0,
  prepare: async app => {
    app.get('/log', req => {
      req.log.warn({ password: 'credential-secret' }, 'message-secret');
      return { ok: true };
    });
    app.get('/domain', () => {
      throw new Error('domain-secret');
    });
  },
});
async function closeStream() {
  if (stream.worker) await stream.worker.terminate();
  // A failed async open has no descriptor and never emits close. The borrowed
  // destination is not host-owned; this child has nothing to release in that case.
  else if (!stream.destroyed && !stream.errored && fault !== 'enoent') stream.destroy();
}
process.on('message', message => {
  void (async () => {
    let result;
    if (message.command === 'fault') {
      if (fault === 'destroy') {
        if (stream.worker) await stream.worker.terminate();
        else Object.getPrototypeOf(stream).destroy.call(stream);
      } else if (fault === 'close') stream.end();
      else if (fault === 'error' || fault === 'epipe')
        stream.emit(
          'error',
          Object.assign(new Error('transport-secret'), { code: fault === 'epipe' ? 'EPIPE' : 'EIO' })
        );
    } else if (message.command === 'snapshot') {
      result = host.status().logging;
    } else if (message.command === 'contents') {
      result =
        mode === 'file' && fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink()
          ? fs.readFileSync(file, 'utf8')
          : '';
    } else if (message.command === 'stop-check') {
      const start = Date.now();
      await host.stop({ deadlineMs: 750 });
      result = { elapsed: Date.now() - start, closed, pending: host.status().logging.pending };
    } else if (message.command === 'stop') {
      await host.stop({ deadlineMs: 750 });
      await closeStream();
      fs.rmSync(directory, { recursive: true, force: true });
      process.disconnect();
      return;
    } else throw new Error('Unknown real-destination fixture command');
    process.send({ id: message.id, result });
  })();
});
void (async () => {
  await host.initialize();
  await host.activate();
  if (stream.worker && !stream.ready) await once(stream, 'ready');
  process.send({ port: host.address().port });
})();
