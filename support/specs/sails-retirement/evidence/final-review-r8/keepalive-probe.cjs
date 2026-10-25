const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const root = process.env.REDBOX_REVIEW_ROOT || process.cwd();
const { fork } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');
async function server(mode) {
  let host;
  let listener;
  const observe = s => {
    listener = s;
    s.on('connection', socket => {
      const opened = performance.now();
      socket.on('close', () => process.send({ type: 'socket-close', ageMs: Math.round(performance.now() - opened) }));
    });
  };
  if (mode === 'express') {
    const { ExpressHost } = require(path.join(root, 'packages/redbox-core/dist/http/express/ExpressHost'));
    const { ApplicationRuntime } = require(path.join(root, 'packages/redbox-core/dist/application'));
    host = new ExpressHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }, []), {
      hostname: '127.0.0.1',
      port: 0,
      prepare: async (router, s) => {
        observe(s);
        router.get('/probe', (_req, res) => res.json({ ok: true }));
      },
    });
    await host.initialize();
    await host.activate();
  } else {
    listener = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
    });
    observe(listener);
    await new Promise(r => listener.listen(0, '127.0.0.1', r));
  }
  process.send({
    type: 'ready',
    port: listener.address().port,
    keepAliveTimeout: listener.keepAliveTimeout,
    keepAliveTimeoutBuffer: listener.keepAliveTimeoutBuffer,
  });
  process.on('message', async m => {
    if (m === 'stop') {
      if (host) await host.stop();
      else await new Promise(r => listener.close(r));
      process.exit(0);
    }
  });
}
async function client(mode) {
  const child = fork(__filename, ['server', mode], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const events = [];
  child.on('message', m => events.push(m));
  const ready = await new Promise((resolve, reject) => {
    child.on('message', m => m.type === 'ready' && resolve(m));
    child.once('error', reject);
  });
  assert.equal(ready.keepAliveTimeout, 5000);
  assert.equal(ready.keepAliveTimeoutBuffer, 1000);
  async function scenario(name, idle, blocked) {
    const agent = new http.Agent({ keepAlive: true });
    const request = () =>
      new Promise(resolve => {
        const req = http.get({ host: '127.0.0.1', port: ready.port, path: '/probe', agent }, res => {
          res.resume();
          res.once('end', () => resolve({ status: res.statusCode, reused: req.reusedSocket }));
        });
        req.once('error', e => resolve({ error: e.code, reused: req.reusedSocket }));
      });
    try {
      assert.equal((await request()).status, 200);
      const start = performance.now();
      await delay(idle);
      if (blocked) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, blocked);
      const elapsed = Math.round(performance.now() - start);
      const result = await request();
      console.log(JSON.stringify({ mode, scenario: name, idleMs: elapsed, ...result }));
      assert.equal(result.error, name === 'delayed-client-events' ? 'ECONNRESET' : undefined);
      if (name !== 'delayed-client-events') assert.equal(result.status, 200);
    } finally {
      agent.destroy();
    }
  }
  try {
    await scenario('before-expiry', 4800, 0);
    await scenario('after-expiry', 6200, 0);
    await scenario('delayed-client-events', 5900, 250);
  } finally {
    child.send('stop');
    await new Promise((resolve, reject) => {
      child.once('exit', code => (code === 0 ? resolve() : reject(new Error('server exit ' + code))));
    });
  }
  console.log(
    JSON.stringify({ mode, serverDefaults: ready, socketEvents: events.filter(e => e.type === 'socket-close') })
  );
}
(async () => {
  if (process.argv[2] === 'server') await server(process.argv[3]);
  else for (const mode of ['node', 'express']) await client(mode);
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
