// Real executable fixture: deliberately no uncaughtException/unhandledRejection
// handlers. The parent runs this with --unhandled-rejections=strict.
const { ApplicationRuntime } = require('../../../../dist/application');
const { ExpressHost } = require('../../../../dist/http/express/ExpressHost');
const { FastifyHost } = require('../../../../dist/http/fastify/FastifyHost');

const fastify = process.argv[2] === 'fastify';
const application = new ApplicationRuntime({ config: {}, log: { warn() {} } });
let socketError;
let failStatus = false;
const status = application.status.bind(application);
application.status = () => {
  if (failStatus) {
    failStatus = false;
    throw new Error('injected admission failure');
  }
  return status();
};
const host = new (fastify ? FastifyHost : ExpressHost)(application, {
  hostname: '127.0.0.1',
  port: 0,
  async prepare(app, server) {
    // Node installs its HTTP socket error listener before this listener runs.
    server.on('connection', socket => {
      if (!socketError) return;
      const code = socketError;
      socketError = undefined;
      // Read a partial method first so close cannot race unread client bytes.
      socket.once('data', () => {
        socket.emit('error', Object.assign(new Error('injected socket failure'), { code }));
      });
    });
    if (fastify) {
      app.addConstraintStrategy({
        name: 'survival',
        storage: () => new Map(),
        deriveConstraint(req, _context, done) {
          setImmediate(() => done(req.url === '/framework-error' ? new Error('private constraint error') : null));
        },
        mustMatchWhenDerived: false,
      });
      app.get('/constraint', { constraints: { survival: 'enabled' } }, async () => ({ ok: true }));
      app.addHook('onRequest', (req, _reply, done) => {
        if (req.url === '/sync-hook-error') throw new Error('injected synchronous hook failure');
        done();
      });
      app.addHook('onRequest', async req => {
        if (req.url === '/async-hook-error') throw new Error('injected asynchronous hook failure');
      });
      app.get('/probe', async () => ({ ok: true }));
    } else app.get('/probe', (_req, res) => res.json({ ok: true }));
  },
});

process.on('message', message => {
  // Rejection here must also terminate the child, rather than hide a fault.
  void (async () => {
    switch (message.command) {
      case 'activate':
        await host.activate();
        break;
      case 'status-error':
        failStatus = true;
        break;
      case 'socket-error':
        socketError = message.code;
        break;
      case 'ping':
        // Give delayed socket events/rejections an event-loop turn to surface.
        await new Promise(resolve => setImmediate(resolve));
        break;
      case 'stop':
        await host.stop();
        process.disconnect();
        return;
      default:
        throw new Error('Unknown fixture command');
    }
    process.send({ id: message.id });
  })();
});

void host.initialize().then(() => process.send({ port: host.address().port }));
