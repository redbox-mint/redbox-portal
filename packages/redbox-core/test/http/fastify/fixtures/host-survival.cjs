// Real executable fixture: deliberately no uncaughtException/unhandledRejection
// handlers. The parent runs this with --unhandled-rejections=strict.
const { ApplicationRuntime } = require('../../../../dist/application');
const { ExpressHost } = require('../../../../dist/http/express/ExpressHost');
const { FastifyHost } = require('../../../../dist/http/fastify/FastifyHost');

const native = process.argv[2] === 'native';
const security = process.argv[2].endsWith('-security');
const fastify = process.argv[2].startsWith('fastify');
const diagnostics = process.argv[2].endsWith('-diagnostics');
const defaultLogger = process.argv[2] === 'fastify-default-diagnostics';
const diagnosticLogs = [];
let loggerFault;
const diagnosticThrow = kind => {
  switch (kind) {
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    case 'false':
      return false;
    case 'zero':
      return 0;
    case 'string':
      return 'exception-secret';
    case 'symbol':
      return Symbol('exception-secret');
    case 'object':
      return { message: 'exception-secret', headers: { authorization: 'credential-secret' } };
    default:
      return Object.assign(new Error('exception-secret'), { headers: { authorization: 'credential-secret' } });
  }
};
const application = new ApplicationRuntime({
  config: {},
  log: {
    warn(code) {
      if (!defaultLogger) return;
      diagnosticLogs.push({ code, level: 'warn' });
      if (loggerFault === 'sync') throw new Error('logger-secret');
      if (loggerFault === 'async') return Promise.reject(new Error('logger-secret'));
    },
  },
});
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
const host = native
  ? (() => {
      const app = require('../../../../dist/http/fastify/router').createPortalRouter();
      app.addConstraintStrategy({
        name: 'survival',
        storage: () => new Map(),
        deriveConstraint(req, _context, done) {
          setImmediate(() => done(new Error('private constraint error')));
        },
        mustMatchWhenDerived: false,
      });
      app.get('/constraint', { constraints: { survival: 'enabled' } }, async () => ({ ok: true }));
      return {
        initialize: () => app.listen({ host: '127.0.0.1', port: 0 }),
        address: () => app.server.address(),
        stop: () => app.close(),
      };
    })()
  : new (fastify ? FastifyHost : ExpressHost)(application, {
      hostname: '127.0.0.1',
      port: 0,
      ...(diagnostics && !defaultLogger
        ? {
            logger(record) {
              diagnosticLogs.push(record);
              if (loggerFault === 'sync') throw new Error('logger-secret');
              if (loggerFault === 'async') return Promise.reject(new Error('logger-secret'));
            },
          }
        : {}),
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
        if (security) {
          if (fastify) {
            require('../../../../dist/http/fastify/responses').installSafeHttpErrors(app);
            require('../../../../dist/http/fastify/parsers').prepareNativeParsers(app);
            app.post('/body', async () => ({ ok: true }));
          } else {
            const { httpBodyParser, httpErrorHandler } = require('../../../../dist/http/express/middleware');
            app.use(httpBodyParser());
            app.post('/body', (_req, res) => res.json({ ok: true }));
            app.use(httpErrorHandler({ error() {}, warn() {} }));
          }
        }
        if (fastify) {
          if (diagnostics) {
            app.addHook('preSerialization', (req, _reply, payload, done) => {
              if (req.url.includes('pending') || req.url.startsWith('/serializer-failure'))
                setTimeout(() => done(null, payload), 10);
              else done(null, payload);
            });
            app.addHook('onRequest', (req, reply, done) => {
              if (req.url.startsWith('/serializer-failure'))
                reply.serializer(() => {
                  reply.header('X-Credential', 'credential-secret');
                  reply.header('Set-Cookie', 'password=credential-secret');
                  reply.raw.statusMessage = 'reason-secret';
                  throw diagnosticThrow(req.query.kind);
                });
              done();
            });
            app.addHook('onSend', (req, reply, payload, done) => {
              if (req.url.startsWith('/hook-failure')) {
                reply.header('X-Credential', 'credential-secret');
                reply.header('Set-Cookie', 'password=credential-secret');
                reply.raw.statusMessage = 'reason-secret';
                throw diagnosticThrow(req.query.kind);
              }
              done(null, payload);
            });
            app.get('/late-failure', async (req, reply) => {
              reply.send({ ok: true });
              await Promise.resolve();
              throw diagnosticThrow(req.query.kind);
            });
            app.get('/sync-after-send', (req, reply) => {
              reply.send({ ok: true });
              throw diagnosticThrow(req.query.kind);
            });
            const doubleSend = (_req, reply) => {
              reply.send({ ok: true });
              reply.send({ password: 'credential-secret' });
              return { password: 'credential-secret' };
            };
            app.get('/double-send', doubleSend);
            app.get('/double-send-pending', doubleSend);
            app.get('/reject-while-pending', async (req, reply) => {
              reply.send({ ok: true });
              await Promise.resolve();
              throw diagnosticThrow(req.query.kind);
            });
            app.get('/native-logging', (req, reply) => {
              const logger = Reflect.get(host, 'fastify').log;
              for (const log of [logger, req.log, reply.log])
                for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
                  log[level](
                    {
                      req: { url: '/native-logging?password=query-secret' },
                      err: diagnosticThrow('error'),
                      headers: { cookie: 'credential-secret' },
                      body: 'body-secret',
                    },
                    'message-secret'
                  );
              return { ok: true };
            });
            app.get('/hook-failure', async () => ({ ok: true }));
            app.get('/serializer-failure', async () => ({ ok: true }));
          }
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
      case 'logger-fault':
        loggerFault = message.code;
        break;
      case 'audit-diagnostics': {
        const assert = require('node:assert/strict');
        const { inspect } = require('node:util');
        const { httpLogStats } = require('../../../../dist/http/fastify/logging');
        assert(!inspect(diagnosticLogs, { depth: 10 }).includes('secret'));
        assert(httpLogStats(Reflect.get(host, 'fastify').log).failures > 0);
        break;
      }
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
