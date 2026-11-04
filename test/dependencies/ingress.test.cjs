const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const zlib = require('node:zlib');

const root = createRequire(path.resolve(__dirname, '../../package.json'));
const core = createRequire(path.resolve(__dirname, '../../packages/redbox-core/package.json'));
const storage = createRequire(path.resolve(__dirname, '../../packages/sails-hook-redbox-storage-mongo/package.json'));
const request = root('supertest');

// Resolve through each consumer, since the portal and standalone packages have
// independent installs and use different body-parser majors / Skipper versions.
for (const [name, consumer, dependency] of [
  ['portal Skipper', root, 'skipper'],
  ['core Skipper', core, 'skipper'],
  ['storage Skipper', storage, 'skipper'],
  ['core Express', core, 'express'],
]) {
  const fromConsumer = createRequire(consumer.resolve(`${dependency}/package.json`));
  const bodyParser = fromConsumer('body-parser');

  test(`${name}: compressed JSON, size limits and malformed compressed bodies`, async () => {
    const parser = bodyParser.json({ limit: '128b' });
    const app = http.createServer((req, res) => parser(req, res, (error) => {
      res.statusCode = error ? error.status || 500 : 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(error ? { type: error.type } : req.body));
    }));

    for (const [encoding, encode] of [['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync]]) {
      const response = await request(app).post('/').type('json').serialize((data) => data)
        .set('Content-Encoding', encoding).send(encode(Buffer.from('{"ok":true}'))).expect(200);
      assert.deepEqual(response.body, { ok: true });
      await request(app).post('/').type('json').serialize((data) => data).set('Content-Encoding', encoding)
        .send(encode(Buffer.from(JSON.stringify({ text: 'x'.repeat(512) })))).expect(413);
      const trailing = await request(app).post('/').type('json').serialize((data) => data)
        .set('Content-Encoding', encoding)
        .send(Buffer.concat([encode(Buffer.from('{"ok":true}')), Buffer.from('trailing garbage')]));
      // A complete frame may finish before the decoder encounters trailing
      // bytes. The security requirement is safe cleanup in either case.
      assert.ok([200, 400].includes(trailing.status));
      if (trailing.status === 200) assert.deepEqual(trailing.body, { ok: true });
      await request(app).post('/').type('json').serialize((data) => data)
        .set('Content-Encoding', encoding).send(Buffer.from('invalid compressed frame')).expect(400);
    }
    // Decoder errors can arrive after parsing completes. A subsequent request
    // also verifies that malformed input has not terminated the server.
    await request(app).post('/').send({ stillAlive: true }).expect(200);
    assert.throws(() => bodyParser.json({ limit: 'not-a-limit' }));
    assert.throws(() => bodyParser.json({ limit: NaN }));
  });
}

test('Sails router preserves named, optional, wildcard and custom-regexp routes', async () => {
  const Router = createRequire(root.resolve('sails/package.json'))('@sailshq/router');
  const router = Router();
  router.get('/:branding/:portal/record/view/:oid', (req, res) => res.end(JSON.stringify(req.params)));
  router.get('/preview/:token([a-z0-9]+).css', (req, res) => res.end(req.params.token));
  router.get('/optional/:id?', (req, res) => res.end(req.params.id || 'empty'));
  router.get('/files/*', (req, res) => res.end(req.params[0]));
  router.get('/:a-:b', (req, res) => res.end(JSON.stringify(req.params)));
  const app = http.createServer((req, res) => router(req, res, (error) => {
    res.statusCode = error ? error.status || 500 : 404;
    res.end();
  }));
  const response = await request(app).get('/DEFAULT/rdmp/record/view/abc%20def/').expect(200);
  assert.deepEqual(JSON.parse(response.text), { branding: 'DEFAULT', portal: 'rdmp', oid: 'abc def' });
  await request(app).get('/preview/abc123.css').expect(200, 'abc123');
  await request(app).get('/preview/abc-123.css').expect(404);
  await request(app).get('/optional').expect(200, 'empty');
  await request(app).get('/optional/123').expect(200, '123');
  await request(app).get('/files/a/b.txt').expect(200, 'a/b.txt');
  await request(app).get('/default/rdmp/record/view/%E0%A4%A').expect(400);
  const pair = await request(app).get('/left-right').expect(200);
  assert.deepEqual(JSON.parse(pair.text), { a: 'left', b: 'right' });
});

test('Sails router rejects ambiguous parameter attack without quadratic backtracking', () => {
  const routerRequire = createRequire(root.resolve('@sailshq/router/package.json'));
  const regexp = routerRequire('path-to-regexp')('/:a-:b');
  const start = performance.now();
  assert.equal(regexp.test(`/a${'-a'.repeat(32_000)}/a`), false);
  assert.ok(performance.now() - start < 1000, '64 KB route rejection should finish within one second');
});

for (const [name, consumer] of [['portal', root], ['storage', storage]]) {
  const skipperRequire = createRequire(consumer.resolve('skipper/package.json'));
  const multiparty = skipperRequire('multiparty');

  test(`${name}: multipart inherited field names do not crash and malformed input is rejected`, async () => {
    const app = http.createServer((req, res) => {
      new multiparty.Form().parse(req, (error, fields) => {
        res.statusCode = error ? 400 : 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(error ? { error: error.message } : fields));
      });
    });
    const response = await request(app).post('/')
      .field('__proto__', 'first').field('__proto__', 'second')
      .field('constructor', 'first').field('constructor', 'second').field('toString', 'string-data')
      .field('normal', 'ordinary-data').expect(200);
    assert.deepEqual(response.body.constructor, ['first', 'second']);
    assert.deepEqual(response.body.toString, ['string-data']);
    assert.deepEqual(response.body.normal, ['ordinary-data']);
    assert.equal(Object.prototype[0], undefined);
    await request(app).post('/').set('Content-Type', 'multipart/form-data; boundary=broken')
      .send('--broken\r\nContent-Disposition: form-data; name="field"\r\n\r\nunfinished').expect(400);
    await request(app).post('/').field('normal', 'still alive').expect(200);
  });

  test(`${name}: Skipper still streams multipart uploads and text fields`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-upload-'));
    try {
      const skipper = consumer('skipper')();
      const app = root('express')();
      app.use(skipper);
      app.post('/', (req, res) => {
        req.file('attachment').upload({ dirname: directory }, async (uploadError, files) => {
          try {
            assert.ifError(uploadError);
            assert.equal(files.length, 1);
            assert.equal(await fs.readFile(files[0].fd, 'utf8'), 'uploaded content');
            res.end(req.body.title);
          } catch (failure) { res.statusCode = 500; res.end(failure.message); }
        });
      });
      await request(app).post('/').field('title', 'dataset')
        .attach('attachment', Buffer.from('uploaded content'), 'dataset.txt').expect(200, 'dataset');
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
}

test('compression returns a readable gzip response', async () => {
  const compression = root('compression')({ threshold: 0 });
  const content = 'dataset metadata '.repeat(100);
  const app = http.createServer((req, res) => compression(req, res, () => {
    res.setHeader('Content-Type', 'text/plain');
    res.end(content);
  }));
  const response = await request(app).get('/').set('Accept-Encoding', 'gzip').expect(200);
  assert.equal(response.headers['content-encoding'], 'gzip');
  assert.equal(response.text, content);
});

test('WebSocket fragmented messages and TypedArray close reasons preserve their bytes', async () => {
  const { WebSocket, WebSocketServer, Sender } = root('ws');
  // Unsupported TypedArrays must be rejected before a close frame is sent.
  assert.throws(() => new Sender({}).close(1000, new Float32Array(20), false, () => {}), TypeError);
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1', skipUTF8Validation: true });
  await once(server, 'listening');
  const connected = once(server, 'connection');
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { skipUTF8Validation: true });
  try {
    const [peer] = await connected;
    const received = once(peer, 'message');
    await once(client, 'open');
    client.send(Buffer.from('dataset '), { fin: false });
    client.send(Buffer.from('metadata'), { fin: true });
    const [message] = await received;
    assert.equal(message.toString(), 'dataset metadata');
    const closed = once(client, 'close');
    peer.close(1000, new Uint8Array(80));
    const [code, reason] = await closed;
    assert.equal(code, 1000);
    assert.deepEqual(reason, Buffer.alloc(80));
  } finally {
    client.terminate();
    for (const peer of server.clients) peer.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('WebSocket fragment limits reject an excessive tiny-fragment stream', async () => {
  const { WebSocket, WebSocketServer } = root('ws');
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1', maxFragments: 4 });
  await once(server, 'listening');
  const connected = once(server, 'connection');
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  try {
    const [peer] = await connected;
    const failure = once(peer, 'error');
    const closed = once(client, 'close');
    await once(client, 'open');
    for (let i = 0; i < 5; i++) client.send(Buffer.alloc(1), { fin: false });
    const [error] = await failure;
    assert.equal(error.code, 'WS_ERR_TOO_MANY_BUFFERED_PARTS');
    const [code] = await closed;
    assert.equal(code, 1008);
  } finally {
    client.terminate();
    for (const peer of server.clients) peer.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Engine.IO accepts matching WebSocket upgrades and rejects mismatched protocol revisions', async () => {
  const engine = root('engine.io');
  const WebSocket = root('ws');
  const app = http.createServer();
  const server = engine.attach(app, { allowEIO3: false });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const origin = `http://127.0.0.1:${app.address().port}`;
  const sockets = [];
  try {
    for (const revision of ['3', null, '4']) {
      const handshake = await fetch(`${origin}/engine.io/?EIO=4&transport=polling`);
      const packet = await handshake.text();
      assert.equal(packet[0], '0');
      const { sid } = JSON.parse(packet.slice(1));
      const url = new URL(`${origin.replace('http:', 'ws:')}/engine.io/?transport=websocket&sid=${sid}`);
      if (revision) url.searchParams.set('EIO', revision);
      const ws = new WebSocket(url);
      sockets.push(ws);
      if (revision === '4') {
        await once(ws, 'open');
        ws.send('2probe');
        const [message] = await once(ws, 'message');
        assert.equal(message.toString(), '3probe');
        ws.send('5');
        const upgraded = server.clients[sid];
        if (upgraded.transport.name !== 'websocket') await once(upgraded, 'upgrade');
        assert.equal(upgraded.transport.name, 'websocket');
      } else {
        const response = await new Promise((resolve, reject) => {
          ws.once('unexpected-response', (req, res) => { res.resume(); req.destroy(); resolve(res.statusCode); });
          ws.once('open', () => reject(new Error('mismatched protocol was accepted')));
          ws.once('error', reject);
        });
        assert.equal(response, 400);
      }
    }
  } finally {
    for (const ws of sockets) {
      // Rejected clients have no underlying socket to terminate.
      if (ws.readyState === WebSocket.OPEN) ws.terminate();
    }
    server.close();
    await new Promise((resolve) => app.close(resolve));
  }
});
