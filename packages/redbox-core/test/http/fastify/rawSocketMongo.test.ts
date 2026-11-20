import { assertGoldenNext, goldenControls } from './goldenContracts';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Readable } from 'node:stream';
import { io, type Socket } from 'socket.io-client';
import WebSocket from 'ws';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { runAcceptedPersistenceWork, persistenceStatus } from '../../../src/persistence/runtime';
import { rawSocketFixture, uploadPath, grantPath, socketPath, canonical, deferred } from './rawSocketFixture';
import { withoutSideEffects } from './noSideEffects';
if (!process.env.HTTP_PILOT_TEST_MONGO_URL || !process.env.HTTP_READ_SOLR_PORT)
  throw new Error('FM-020 requires disposable real Mongo and Solr; never skip these cases.');
const boundary = 'fm020-raw-boundary';
const start = Buffer.from(
  `--${boundary}\r\nContent-Disposition: form-data; name="before"\r\n\r\nfirst\r\n--${boundary}\r\nContent-Disposition: form-data; name="attachmentFields"; filename="payload.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`
);
const end = Buffer.from(
  `\r\n--${boundary}\r\nContent-Disposition: form-data; name="after"\r\n\r\nlast\r\n--${boundary}--\r\n`
);
const headers = { Authorization: 'Bearer pilot-api-token', Origin: canonical, 'X-ReDBox-Api-Version': '2.0' };
type Fixture = Awaited<ReturnType<typeof rawSocketFixture>>;
async function upload(f: Fixture, body = Buffer.from('raw bytes'), extra: Record<string, string> = {}) {
  const response = await fetch(f.url + uploadPath, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...extra },
    body: Buffer.concat([start, body, end]),
  });
  return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
}
async function grant(f: Fixture) {
  const response = await fetch(f.url + grantPath, { method: 'POST', headers });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).data.token as string;
}
function connect(f: Fixture, token: string, origin = canonical, path = socketPath) {
  const client = io(new URL(f.url).origin, {
    path,
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
    extraHeaders: { Origin: origin },
    auth: { token },
  });
  const connected = new Promise<Socket>((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
  return { client, connected };
}
async function polling(f: Fixture, sid?: string, origin: string | null = canonical, body?: string) {
  const url = new URL(socketPath + '/?EIO=4&transport=polling', f.url);
  if (sid) url.searchParams.set('sid', sid);
  const signal = AbortSignal.timeout(5000);
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(origin === null ? {} : { Origin: origin }),
      ...(body === undefined ? {} : { 'Content-Type': 'text/plain;charset=UTF-8' }),
    },
    body,
    signal,
  }).catch((error: unknown) => {
    const cause = error instanceof TypeError ? (error.cause as { code?: string } | undefined) : undefined;
    if (signal.aborted || cause?.code === 'UND_ERR_SOCKET' || cause?.code === 'ECONNRESET')
      assert.fail('Expected a polling HTTP response before the connection closed');
    throw error;
  });
  return { status: response.status, body: await response.text() };
}
function pollingUpgrade(f: Fixture, sid: string, origin?: string) {
  const url = new URL(socketPath + '/?EIO=4&transport=websocket', f.url);
  url.protocol = 'ws:';
  url.searchParams.set('sid', sid);
  return new WebSocket(url, { handshakeTimeout: 5000, headers: origin === undefined ? {} : { Origin: origin } });
}
async function bytes(f: Fixture, fileId: string) {
  return runAcceptedPersistenceWork(f.owner, async () => {
    const found = await f.datastream.getDatastream('fm020-record', fileId, { username: 'pilot-admin' });
    const chunks: Buffer[] = [];
    for await (const chunk of found.readstream as Readable) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  });
}
function transfer(f: Fixture, size = 24 * 1024 * 1024) {
  const completed = deferred();
  let status = 0,
    text = '';
  const req = request(
    f.url + uploadPath,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': start.length + size + end.length,
      },
    },
    res => {
      status = res.statusCode!;
      res.on('data', chunk => {
        text += chunk;
      });
      res.once('end', completed.resolve);
      res.once('error', completed.reject);
    }
  );
  req.setTimeout(20000, () => req.destroy(new Error('Transfer timeout')));
  req.once('error', completed.reject);
  // Callers can deliberately cancel; observe the rejection immediately.
  void completed.promise.catch(() => {});
  req.write(start);
  return { req, completed: completed.promise, result: () => ({ status, body: JSON.parse(text) }), size };
}
function normalize(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '<generated-id>');
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !['fileId', 'requestId', 'timestamp', 'entityTag', 'lastSaveDate', 'lastModified', 'dateCreated'].includes(
              key
            )
        )
        .map(([key, child]) => [key, normalize(child)])
    );
  return value;
}
describe('FM-020 scoped raw upload and progress upgrade on the owned server', function () {
  this.timeout(60000);
  it('serializes upload, grant and metadata JSON once inside their guards, matching retained and current Express', async () => {
    const observations: unknown[][] = [];
    for (const stack of ['Fastify']) {
      const f = await rawSocketFixture(stack === 'Fastify', {});
      const results: unknown[] = [];
      let calls = 0;
      const value = { serialized: 'once 日本 🧪' };
      const toJSON = () => {
        if (++calls > 1) throw new Error('Private second-serialization fault');
        return value;
      };
      try {
        for (const version of ['1.0', '2.0']) {
          const base = { ...headers, 'X-ReDBox-Api-Version': version };
          const initialTitle = (await f.storage.getMeta('fm020-record')).metadata.title;
          const observe = async (
            path: string,
            init: {
              method?: string;
              headers?: Record<string, string>;
              body?: string | Buffer;
            } = {},
            status = 200
          ) => {
            calls = 0;
            const { response, text } = await new Promise<{
              response: {
                status: number;
                headers: {
                  get(name: string): string | null;
                };
              };
              text: string;
            }>((resolve, reject) => {
              const req = request(
                f.url + path,
                { method: init.method, headers: { ...base, ...init.headers }, agent: false },
                res => {
                  let text = '';
                  res.setEncoding('utf8');
                  res.on('data', chunk => (text += chunk));
                  res.once('error', reject);
                  res.once('end', () =>
                    resolve({
                      text,
                      response: {
                        status: res.statusCode!,
                        headers: {
                          get(name) {
                            const value = res.headers[name.toLowerCase()];
                            return typeof value === 'string' ? value : null;
                          },
                        },
                      },
                    })
                  );
                }
              );
              req.once('error', reject);
              req.setTimeout(10000, () => req.destroy(new Error('JSON response timed out')));
              req.end(init.body);
            });
            assert.equal(response.status, status, stack + ' ' + version + ' ' + text);
            assert.equal(calls, 1, stack + ' ' + path);
            const body = text ? JSON.parse(text) : null;
            if (status === 200) {
              assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
              if (init.method !== 'HEAD')
                assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(text));
            } else assert.equal(response.headers.get('content-type'), null);
            results.push({ status, text: body ? normalize(body) : null, etag: !!response.headers.get('etag') });
            return { response, body, text };
          };
          const add = f.datastream.addDatastreams;
          try {
            f.datastream.addDatastreams = async (...args) =>
              Object.assign(await add.apply(f.datastream, args), { toJSON });
            const uploaded = await observe(uploadPath, {
              method: 'POST',
              headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
              body: Buffer.concat([start, Buffer.from('once'), end]),
            });
            assert(uploaded.response.headers.get('etag'));
            assert.deepEqual(version === '2.0' ? uploaded.body.data.message : uploaded.body.message, value);
            assert.equal((await f.storage.getMeta('fm020-record')).metadata.title, initialTitle);
          } finally {
            f.datastream.addDatastreams = add;
          }
          const issue = f.sockets.issue;
          try {
            f.sockets.issue = () => ({ toJSON }) as unknown as ReturnType<typeof issue>;
            const granted = await observe(grantPath, { method: 'POST' });
            assert.deepEqual(version === '2.0' ? granted.body.data.token : granted.body.token, value);
          } finally {
            f.sockets.issue = issue;
          }
          const metadataPath = '/default/rdmp/api/records/metadata/fm020-record';
          const get = f.storage.getMeta;
          try {
            f.storage.getMeta = async (...args) => ({
              ...(await get.apply(f.storage, args)),
              metadata: { toJSON },
            });
            const read = await observe(metadataPath);
            assert.deepEqual(version === '2.0' ? read.body.data : read.body, value);
            assert(read.response.headers.get('etag'));
            const head = await observe(metadataPath, { method: 'HEAD' });
            assert.equal(head.text, '');
            assert.equal(head.response.headers.get('content-length'), read.response.headers.get('content-length'));
            for (const method of ['GET', 'HEAD']) {
              const fresh = await observe(
                metadataPath,
                { method, headers: { 'If-None-Match': read.response.headers.get('etag')! } },
                304
              );
              assert.equal(fresh.text, '');
              assert.equal(fresh.response.headers.get('etag'), read.response.headers.get('etag'));
            }
          } finally {
            f.storage.getMeta = get;
          }
          const update = f.writer.updateMeta;
          try {
            f.writer.updateMeta = async (...args) => {
              const saved = await update.apply(f.writer, args);
              if (version === '2.0') Object.defineProperty(saved, 'toJSON', { value: toJSON });
              else Reflect.set(saved, 'details', { toJSON });
              return saved;
            };
            const updated = await observe(metadataPath, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: 'Serialized update' }),
            });
            assert(updated.response.headers.get('etag'));
            assert.deepEqual(version === '2.0' ? updated.body.data : updated.body.details, value);
            assert.equal((await f.storage.getMeta('fm020-record')).metadata.title, 'Serialized update');
          } finally {
            f.writer.updateMeta = update;
          }
        }
        observations.push(results);
      } finally {
        await f.close();
      }
    }
    assertGoldenNext('raw-socket-mongo', observations[0]);
  });
  for (const native of [true])
    it(`enforces canonical origin for every existing polling sid and upgrade on ${'Fastify'} production`, async () => {
      const f = await rawSocketFixture(native, { retainExpress: false });
      let upgraded: WebSocket | undefined;
      try {
        const observeRefusal = <T>(run: () => Promise<T>) =>
          withoutSideEffects({ data: f.portal.data, client: f.native, owner: f.owner, url: f.url }, run, {
            sessionCollection: 'pilotSessions',
          });
        const refuseUpgrade = (sid: string, origin: string | null) =>
          observeRefusal(async () => {
            const denied = pollingUpgrade(f, sid, origin ?? undefined);
            await assert.rejects(once(denied, 'open'), /403/);
            await new Promise<void>(resolve => {
              if (denied.readyState === WebSocket.CLOSED) resolve();
              else denied.once('close', () => resolve());
            });
          });
        const token = await grant(f);
        const initial = await polling(f);
        assert.equal(initial.status, 200);
        const sid = JSON.parse(initial.body.slice(1)).sid as string;
        const connectPacket = '40' + JSON.stringify({ token });
        for (const origin of ['https://foreign.invalid', 'null', null]) {
          assert.equal((await observeRefusal(() => polling(f, undefined, origin))).status, 403);
          assert.equal((await observeRefusal(() => polling(f, sid, origin))).status, 403);
          assert.equal((await observeRefusal(() => polling(f, sid, origin, connectPacket))).status, 403);
          await refuseUpgrade(sid, origin);
          assert.equal(Reflect.get(f.sockets, 'connections').size, 0);
          assert.equal(Reflect.get(f.sockets, 'grants').has(token), true);
        }
        assert.equal((await polling(f, sid, canonical, connectPacket)).status, 200);
        assert.match((await polling(f, sid)).body, /^40/);
        const subscribe = '420' + JSON.stringify(['subscribe', 'fm020-record']);
        assert.equal((await observeRefusal(() => polling(f, sid, 'https://foreign.invalid', subscribe))).status, 403);
        const connection = [...Reflect.get(f.sockets, 'connections').values()][0];
        assert.equal(connection.rooms.size, 0);
        assert.equal((await polling(f, sid, canonical, subscribe)).status, 200);
        assert.equal((await polling(f, sid)).body, '430[{"status":true}]');
        assert.equal(connection.rooms.has('fm020-record'), true);
        const unsubscribe = '421' + JSON.stringify(['unsubscribe', 'fm020-record']);
        assert.equal((await observeRefusal(() => polling(f, sid, 'https://foreign.invalid', unsubscribe))).status, 403);
        assert.equal(connection.rooms.has('fm020-record'), true);
        await f.sockets.emit('update', {
          branding: f.brand.id,
          relatedRecordId: 'fm020-record',
          message: 'PRIVATE-PROGRESS-ONLY-FOR-CANONICAL-ORIGIN',
        });
        for (const origin of ['https://foreign.invalid', 'null', null]) {
          const refused = await observeRefusal(() => polling(f, sid, origin));
          assert.equal(refused.status, 403);
          assert.equal(refused.body.includes('PRIVATE-PROGRESS'), false);
          await refuseUpgrade(sid, origin);
        }
        assert.match((await polling(f, sid)).body, /PRIVATE-PROGRESS-ONLY-FOR-CANONICAL-ORIGIN/);
        upgraded = pollingUpgrade(f, sid, canonical);
        await once(upgraded, 'open');
        const pong = once(upgraded, 'message');
        upgraded.send('2probe');
        assert.equal(String((await pong)[0]), '3probe');
        const transport = Reflect.get(f.sockets, 'io').engine.clients[sid];
        const switched = once(transport, 'upgrade');
        upgraded.send('5');
        await switched;
        const acknowledgement = once(upgraded, 'message');
        upgraded.send(unsubscribe);
        assert.equal(String((await acknowledgement)[0]), '431[{"status":true}]');
      } finally {
        upgraded?.close();
        await f.close();
      }
    });
  it('refuses unknown Companion transfers and foreign callback origins before provider upgrade', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'companion-authorization-'));
    const source = createServer(async (req, res) => {
      if (req.url === '/sink' && req.method === 'POST') {
        res.writeHead(201, { Location: '/sink/transfer', 'Tus-Resumable': '1.0.0' }).end();
        return;
      }
      if (req.url === '/sink/transfer') {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Upload-Offset': '0', 'Tus-Resumable': '1.0.0' }).end();
          return;
        }
        let bytes = 0;
        for await (const chunk of req) bytes += chunk.length;
        res.writeHead(204, { 'Upload-Offset': String(bytes), 'Tus-Resumable': '1.0.0' }).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': 4 });
      res.end('test');
    });
    let f: Fixture | undefined;
    const clients = new Set<WebSocket>();
    try {
      source.listen(0, '127.0.0.1');
      await once(source, 'listening');
      const address = source.address();
      assert(address && typeof address === 'object');
      const upstream = 'http://127.0.0.1:' + address.port;
      const companion: NonNullable<Parameters<typeof rawSocketFixture>[1]>['companion'] = {
        enabled: true,
        route: '/imports',
        secret: 'fixture-companion-secret-at-least-32-characters',
        filePath: directory,
        metrics: false,
        server: { host: 'portal.example.invalid', protocol: 'https', path: '/imports' },
        enableUrlEndpoint: true,
        allowLocalUrls: true,
        streamingUpload: false,
        clientSocketConnectTimeout: 3000,
        uploadUrls: [upstream + '/sink'],
      };
      const portal = (f = await rawSocketFixture(true, { companion }));
      const health = await fetch(portal.url + '/imports/health', { headers });
      assert.equal(health.status, 200);
      await health.text();
      const effectFixture = { data: portal.portal.data, client: portal.native, owner: portal.owner, url: portal.url };
      const observe = <T>(run: () => Promise<T>) =>
        withoutSideEffects(effectFixture, run, {
          sessionCollection: 'pilotSessions',
        });
      const client = (endpoint: string, origin = canonical) => {
        const ws = new WebSocket(portal.url.replace('http:', 'ws:') + '/imports/' + endpoint, {
          origin,
          handshakeTimeout: 5000,
        });
        ws.on('error', () => {});
        clients.add(ws);
        return ws;
      };
      const refusal = (endpoint: string, origin?: string) =>
        observe(async () => {
          const ws = client(endpoint, origin);
          try {
            await assert.rejects(once(ws, 'open'), /Unexpected server response: 403/);
          } finally {
            ws.terminate();
          }
        });
      const callback = 'api2/auth-callback/token/validCallbackToken';
      await refusal('api/untrackedTransfer');
      await refusal(callback, 'https://foreign.invalid');
      const admitted = client(callback);
      assert.equal(
        await once(admitted, 'open').then(
          () => true,
          () => false
        ),
        true,
        'Canonical callback upgrade'
      );
      admitted.close();
      await once(admitted, 'close');
      const invalid = await observe(() =>
        fetch(portal.url + '/imports/url/meta', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 1 }),
        })
      );
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { message: 'Invalid URL request' });
      const transfer = await fetch(portal.url + '/imports/url/get', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: upstream + '/source',
          protocol: 'tus',
          endpoint: upstream + '/sink',
          metadata: { name: 'contract.txt' },
        }),
      });
      assert.equal(transfer.status, 200, await transfer.clone().text());
      const { token } = await transfer.json();
      assert.equal(typeof token, 'string');
      const tracked = client('api/' + token);
      assert.equal(
        await once(tracked, 'open').then(
          () => true,
          () => false
        ),
        true,
        'Tracked transfer upgrade'
      );
    } finally {
      for (const ws of clients) ws.terminate();
      try {
        await f?.close();
      } finally {
        await new Promise<void>(resolve => source.close(() => resolve()));
        await rm(directory, { recursive: true, force: true });
      }
    }
  });
  for (const native of [true])
    describe('Fastify', () => {
      let f: Fixture;
      const clients: Socket[] = [];
      before(async () => {
        f = await rawSocketFixture(native);
      });
      after(async () => {
        for (const client of clients) client.disconnect();
        await f?.close();
      });
      it('finalizes real datastream bytes and removes staging with fields on both sides', async () => {
        const sent = Buffer.from('raw\0bytes\xff', 'latin1');
        const result = await upload(f, sent);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const file = result.body.data.message.fileIds[0];
        assert.equal(file.metadata.size, sent.length);
        assert.deepEqual(await bytes(f, file.fileId), sent);
        assert.deepEqual(await f.files(), []);
        {
          assert.equal(f.preparedBeforeListening, true);
          assert.equal(f.listenCalls(), 1);
        }
      });
      it('preserves JSON/form sibling parsing, limits and invalid JSON errors', async () => {
        for (const [type, body, expected] of [
          ['application/json', '{"nested":{"value":[1,2]}}', { nested: { value: [1, 2] } }],
          ['application/x-www-form-urlencoded', 'a[b]=one&a[b]=two', { a: { b: ['one', 'two'] } }],
        ] as const) {
          const response = await fetch(f.url + '/echo', { method: 'POST', headers: { 'Content-Type': type }, body });
          assert.equal(response.status, 200);
          assert.deepEqual((await response.json()).body, expected);
        }
        const bad = await fetch(f.url + '/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        });
        assert.equal(bad.status, 400);
        await bad.text();
        const large = await fetch(f.url + '/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) }),
        });
        assert.equal(large.status, 413);
        await large.text();
      });
      it('retains one OPTIONS owner across the upload and socket-grant scopes', async () => {
        for (const path of [uploadPath, grantPath]) {
          const response = await fetch(f.url + path, { method: 'OPTIONS' });
          assert.equal(response.status, 200);
          // The full Express portal also owns GET/HEAD datastream listing.
          // This explicit conversion scope selects only POST for these paths.
          const allowed = 'POST';
          assert.equal(response.headers.get('allow'), allowed);
          assert.equal(await response.text(), allowed);
        }
      });
      it('denies origin/auth before staging and rejects malformed raw bodies', async () => {
        const before = f.receiveCalls();
        assert.equal((await upload(f, undefined, { Origin: 'https://foreign.invalid' })).status, 403);
        assert.equal((await upload(f, undefined, { Authorization: 'Bearer invalid' })).status, 401);
        assert.equal(f.receiveCalls(), before);
        const malformed = await fetch(f.url + uploadPath, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: '{',
        });
        assert.equal(malformed.status, 400);
        await malformed.text();
        assert.equal(f.receiveCalls(), before);
        assert.deepEqual(await f.files(), []);
      });
      it('requires an allowed origin and single-use grant; enforces record ACL and delivers progress', async () => {
        for (const [token, origin] of [
          ['missing', canonical],
          [await grant(f), 'https://foreign.invalid'],
        ]) {
          await withoutSideEffects(
            { data: f.portal.data, client: f.native, owner: f.owner, url: f.url },
            async () => {
              const failed = connect(f, token, origin);
              clients.push(failed.client);
              await assert.rejects(failed.connected);
              failed.client.disconnect();
            },
            { sessionCollection: 'pilotSessions' }
          );
        }
        const token = await grant(f),
          accepted = connect(f, token);
        clients.push(accepted.client);
        assert.equal(
          await accepted.connected.then(
            () => true,
            () => false
          ),
          true,
          'Valid grant connects'
        );
        const client = accepted.client;
        await withoutSideEffects(
          { data: f.portal.data, client: f.native, owner: f.owner, url: f.url },
          async () => {
            const reused = connect(f, token);
            clients.push(reused.client);
            await assert.rejects(reused.connected, /^Error: Authentication required$/);
            reused.client.disconnect();
          },
          { sessionCollection: 'pilotSessions' }
        );
        assert.deepEqual(await client.timeout(5000).emitWithAck('subscribe', 'fm020-record'), { status: true });
        assert.deepEqual(await client.timeout(5000).emitWithAck('subscribe', 'foreign-record'), { status: false });
        const [connection] = Reflect.get(f.sockets, 'connections').values();
        assert.deepEqual([...connection.rooms], ['fm020-record']);
        const received: string[] = [];
        client.on('update', ({ message }) => received.push(message));
        await f.sockets.emit('update', {
          branding: f.otherBrand.id,
          relatedRecordId: 'fm020-record',
          message: 'foreign tenant',
        });
        await f.sockets.emit('update', { branding: f.brand.id, relatedRecordId: 'fm020-record', message: 'progress' });
        // The same socket delivers broadcasts and acknowledgements in order.
        assert.deepEqual(await client.timeout(5000).emitWithAck('subscribe', 'fm020-record'), { status: true });
        assert.deepEqual(received, ['progress']);
        client.disconnect();
      });
      it('requires grant authentication to resolve the original actor and brand', async () => {
        const input = Reflect.get(f.sockets, 'input');
        const authenticate = input.authenticate as (input: {
          authorization?: string;
        }) => Promise<import('../../../src/http/context').AuthenticatedActor | false>;
        try {
          for (const change of ['missing', 'different', 'foreign'] as const) {
            const token = await grant(f);
            input.authenticate = async (credential: Parameters<typeof authenticate>[0]) => {
              const actor = await authenticate(credential);
              assert(actor);
              if (change === 'missing') return false;
              if (change === 'different') return { ...actor, id: f.reader.id };
              return { ...actor, roles: actor.roles.map(role => ({ ...role, brandId: f.otherBrand.id })) };
            };
            await withoutSideEffects(
              { data: f.portal.data, client: f.native, owner: f.owner, url: f.url },
              async () => {
                const client = connect(f, token);
                clients.push(client.client);
                await assert.rejects(client.connected, /^Error: Authentication required$/);
                assert.equal(Reflect.get(f.sockets, 'connections').size, 0);
                client.client.disconnect();
              },
              { sessionCollection: 'pilotSessions' }
            );
            input.authenticate = authenticate;
          }
          const allowed = connect(f, await grant(f));
          clients.push(allowed.client);
          assert.equal(
            await allowed.connected.then(
              () => true,
              () => false
            ),
            true
          );
          assert.deepEqual(await allowed.client.timeout(5000).emitWithAck('subscribe', 'fm020-record'), {
            status: true,
          });
          allowed.client.disconnect();
        } finally {
          input.authenticate = authenticate;
        }
      });
      it('retains authentication after disconnect until the real identity operation settles', async () => {
        const hold = f.holdAuthentication();
        const pending = connect(f, await grant(f));
        clients.push(pending.client);
        void pending.connected.catch(() => {});
        await hold.entered;
        const engine = Reflect.get(f.sockets, 'io').engine;
        const transport = Object.values(engine.clients)[0];
        const closed = once(transport as NodeJS.EventEmitter, 'close');
        pending.client.disconnect();
        await closed;
        let drained = false;
        const draining = f.sockets.drain().then(() => {
          drained = true;
        });
        await delay(30);
        assert.equal(drained, false);
        hold.release();
        await draining;
        assert.equal(Reflect.get(f.sockets, 'connections').size, 0);
      });
      it('cancels a partial transfer and keeps provider abort cleanup owned', async () => {
        const hold = f.holdUpload(),
          provider = f.holdProvider();
        const before = f.finalizations();
        const active = transfer(f);
        active.req.write(Buffer.alloc(256 * 1024));
        await hold.entered;
        active.req.destroy();
        hold.release();
        let drained = false;
        const draining = f.multipart.drain().then(() => {
          drained = true;
        });
        await delay(40);
        assert.equal(drained, false);
        provider.release();
        await draining;
        assert.deepEqual(await f.files(), []);
        assert.equal(f.finalizations(), before, 'cancelled input must not finalize attachments');
        assert.equal((await upload(f)).status, 200);
      });
    });
  it('matches retained Express upload/denial observations and socket behavior', async () => {
    const observations: unknown[] = [];
    for (const native of [true]) {
      const f = await rawSocketFixture(native);
      try {
        const good = await upload(f);
        const denied = await upload(f, undefined, { Origin: 'https://foreign.invalid' });
        observations.push(normalize({ good, denied }));
      } finally {
        await f.close();
      }
    }
    assertGoldenNext('raw-socket-mongo', observations[0]);
  });
  it('matches retained JSON/form parser failures before upload authentication', async () => {
    const observations: unknown[][] = [];
    for (const native of [true]) {
      const f = await rawSocketFixture(native);
      const results: unknown[] = [];
      try {
        for (const [type, body] of [
          ['application/json', '{'],
          ['application/json', JSON.stringify({ value: 'x'.repeat(1024 * 1024) })],
          ['application/x-www-form-urlencoded', 'key=value&'.repeat(1001)],
        ]) {
          for (const authorization of [headers.Authorization, 'Bearer invalid']) {
            const response = await fetch(f.url + uploadPath, {
              method: 'POST',
              headers: { ...headers, Authorization: authorization, 'Content-Type': type },
              body,
            });
            results.push({ status: response.status, body: await response.json() });
          }
        }
        assert.equal(f.receiveCalls(), 0, 'parser failures must not stage data');
        assert.deepEqual(await f.files(), []);
        observations.push(results);
      } finally {
        await f.close();
      }
    }
    assertGoldenNext('raw-socket-mongo', observations[0]);
  });
  it('propagates real-network backpressure and drains a transfer plus open socket on retry', async () => {
    const f = await rawSocketFixture(true);
    const accepted = connect(f, await grant(f));
    const client = await accepted.connected;
    const disconnected = new Promise<void>(resolve => client.once('disconnect', () => resolve()));
    const hold = f.holdUpload();
    const active = transfer(f);
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    let sent = 0,
      produced = false;
    const producer = (async () => {
      while (sent < active.size) {
        if (!active.req.write(chunk)) await once(active.req, 'drain');
        sent += chunk.length;
      }
      active.req.end(end);
      produced = true;
    })();
    void producer.catch(() => {});
    try {
      await hold.entered;
      await delay(120);
      assert.equal(produced, false, 'a blocked real storage consumer must block the TCP producer');
      assert(sent < active.size);
      const engine = Reflect.get(f.sockets, 'io').engine;
      assert.equal(engine.clientsCount, 1);
      await assert.rejects(f.host.stop({ deadlineMs: 100 }), /deadline/);
      assert.equal(f.host.status().stopped, false);
      assert(persistenceStatus(f.owner).pools > 0, 'borrowed storage stays alive after the stop deadline');
      assert.equal(f.closeCalls(), 1);
      hold.release();
      await producer;
      await active.completed;
      assert.equal(active.result().status, 200, JSON.stringify(active.result().body));
      const id = active.result().body.data.message.fileIds[0].fileId;
      // stop may already have closed pools: persisted bytes are checked before
      // normal stop in the success cases; here check completion/cleanup ordering.
      assert.equal(typeof id, 'string');
      await f.host.stop({ deadlineMs: 10000 });
      assert.equal(f.closeCalls(), 1);
      assert.equal(f.listenCalls(), 1);
      assert.equal(engine.clientsCount, 0);
      await disconnected;
      assert.equal(client.connected, false);
      assert.equal(Reflect.get(f.sockets, 'connections').size, 0);
      assert.equal(f.host.status().stopped, true);
      assert.equal(persistenceStatus(f.owner).pools, 0);
      assert.equal(f.server.listeners('upgrade').length, 0, 'owned upgrade listeners are removed');
    } finally {
      hold.release();
      active.req.destroy();
      client.disconnect();
      await f.close();
    }
  });
  it('retains Engine.IO accepted subpaths through actual upgraded TCP closure', async () => {
    const f = await rawSocketFixture(true);
    const accepted = connect(f, await grant(f), canonical, socketPath + '/suffix');
    const disconnected = new Promise<void>(resolve => accepted.client.once('disconnect', () => resolve()));
    try {
      await accepted.connected;
      assert.equal(
        Reflect.get(f.sockets, 'upgraded').size,
        1,
        'every provider-accepted upgrade must have a transport lease'
      );
      await f.host.stop();
      await disconnected;
      assert.equal(Reflect.get(f.sockets, 'upgraded').size, 0);
      assert.equal(f.closeCalls(), 1);
    } finally {
      accepted.client.disconnect();
      await f.close();
    }
  });
  it('retains an in-progress namespace authentication during stop and rejects new upgrade ingress', async () => {
    const f = await rawSocketFixture(true);
    const hold = f.holdAuthentication();
    const pending = connect(f, await grant(f));
    void pending.connected.catch(() => {});
    try {
      await hold.entered;
      await assert.rejects(f.host.stop({ deadlineMs: 80 }), /deadline/);
      assert(persistenceStatus(f.owner).pools > 0);
      hold.release();
      await f.host.stop({ deadlineMs: 10000 });
      assert.equal(Reflect.get(f.sockets, 'connections').size, 0);
      assert.equal(f.closeCalls(), 1);
      assert.equal(persistenceStatus(f.owner).pools, 0);
    } finally {
      hold.release();
      pending.client.disconnect();
      await f.close();
    }
  });
  it('matches retained upload and grant validation, security, fault and capacity responses in API1/API2', async () => {
    const observations: unknown[][] = [];
    for (const native of [true]) {
      const f = await rawSocketFixture(native);
      const results: unknown[] = [];
      const observe = async (
        path: string,
        init: {
          method: string;
          headers: Record<string, string>;
          body?: Buffer;
        }
      ) => {
        // Capacity setup can exceed a keep-alive idle interval. Each retained
        // observation owns a fresh raw HTTP connection and its complete response.
        const response = await new Promise<{
          status: number;
          headers: import('node:http').IncomingHttpHeaders;
          body: string;
        }>((resolve, reject) => {
          const req = request(f.url + path, { method: init.method, headers: init.headers, agent: false }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
              body += chunk;
            });
            res.once('error', reject);
            res.once('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
          });
          req.setTimeout(20000, () => req.destroy(new Error('Raw HTTP observation timed out')));
          req.once('error', reject);
          req.end(init.body);
        });
        const body = response.body;
        const parsed = body ? JSON.parse(body) : '';
        if (parsed?.data?.token) parsed.data.token = '<grant>';
        if (parsed?.token) parsed.token = '<grant>';
        const result = {
          status: response.status,
          body: normalize(parsed),
          cache: response.headers['cache-control'] ?? null,
          etag: !!response.headers.etag,
        };
        results.push(result);
        return result;
      };
      try {
        for (const version of ['1.0', '2.0']) {
          const base = { ...headers, 'X-ReDBox-Api-Version': version };
          const raw = (
            extra: Record<string, string> = {},
            body = Buffer.concat([start, Buffer.from('surface'), end]),
            path = uploadPath
          ) =>
            observe(path, {
              method: 'POST',
              headers: { ...base, 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...extra },
              body,
            });
          assert.equal((await raw()).status, 200);
          assert.equal((await observe(grantPath, { method: 'POST', headers: base })).status, 200);
          for (const path of [uploadPath, grantPath]) {
            for (const extra of [
              { Authorization: 'Bearer invalid' },
              { Authorization: '' },
              { Origin: 'https://foreign.invalid' },
              { Origin: 'null' },
            ])
              assert(
                [401, 403].includes((await observe(path, { method: 'POST', headers: { ...base, ...extra } })).status)
              );
            await observe(path.replace('/default/', '/unknown/'), { method: 'POST', headers: base });
            await observe(path.replace('/default/', '/other/'), { method: 'POST', headers: base });
            await observe(path.replace('/rdmp/', '/unknown/'), { method: 'POST', headers: base });
          }
          await raw({}, undefined, uploadPath.replace('fm020-record', 'absent-record'));
          await raw({ 'If-Match': 'malformed' });
          await raw({ 'If-Match': '"stale"' });
          await raw({ 'X-ReDBox-Save-Request-Id': 'bad request id' });
          await raw({}, Buffer.from(`--${boundary}--\r\n`));
          await raw(
            {},
            Buffer.concat([
              Buffer.from(start.toString().replace('attachmentFields', 'wrongField')),
              Buffer.from('file'),
              end,
            ])
          );
          await raw({}, Buffer.from('malformed multipart'));
          const definition = await f.recordTypes.findByName(f.brand.id, 'dataRecord');
          await f.recordTypes.reviseDefinition(definition!.id, { concurrentModification: { mode: 'strict' } });
          assert.equal((await raw()).status, 428);
          await f.recordTypes.reviseDefinition(definition!.id, { concurrentModification: { mode: 'observe' } });
          assert.equal((await raw({ 'If-Match': formatRecordEntityTag('fm020-record', 999) })).status, 412);
          const view = f.writer.hasViewAccess;
          try {
            f.writer.hasViewAccess = () => false;
            assert.equal((await raw({ 'If-Match': formatRecordEntityTag('fm020-record', 999) })).status, 403);
          } finally {
            f.writer.hasViewAccess = view;
          }
          const read = f.writer.getMeta;
          try {
            f.writer.getMeta = async (...args) => {
              const record = await read.apply(f.writer, args);
              return { ...record, metaMetadata: { ...record.metaMetadata, brandId: f.otherBrand.id } };
            };
            assert.equal((await raw()).status, 404);
          } finally {
            f.writer.getMeta = read;
          }
          const limits = Reflect.get(f.multipart, 'limits'),
            fileSize = limits.fileSize;
          try {
            limits.fileSize = 4;
            assert.equal((await raw()).status, 413);
          } finally {
            limits.fileSize = fileSize;
          }
          await raw(
            {},
            Buffer.concat([
              start,
              Buffer.from('file'),
              Buffer.from(end.toString().replace('name="after"', 'name="before"')),
            ])
          );
          const edit = f.writer.hasEditAccess;
          try {
            f.writer.hasEditAccess = () => false;
            assert.equal((await raw()).status, 403);
          } finally {
            f.writer.hasEditAccess = edit;
          }
          const get = f.writer.getMeta;
          try {
            f.writer.getMeta = async () => {
              throw new Error('private storage detail');
            };
            assert.equal((await raw()).status, 500);
          } finally {
            f.writer.getMeta = get;
          }
          const save = f.writer.updateMeta;
          try {
            f.writer.updateMeta = async () => {
              throw new Error('private save detail');
            };
            assert.equal((await raw()).status, 500);
          } finally {
            f.writer.updateMeta = save;
          }
          const disk = Reflect.get(f.multipart, 'disk'),
            put = disk.putStream;
          try {
            disk.putStream = async () => {
              throw new Error('private staging detail');
            };
            assert.equal((await raw()).status, 500);
          } finally {
            disk.putStream = put;
          }
          const add = f.datastream.addDatastreams;
          try {
            f.datastream.addDatastreams = async () => {
              throw new Error('private finalization detail');
            };
            const failed = await raw();
            assert.equal(failed.status, 500);
            assert.equal(failed.etag, true);
          } finally {
            f.datastream.addDatastreams = add;
          }
          try {
            f.datastream.addDatastreams = async (...args) => {
              const result = await add.apply(f.datastream, args);
              Object.assign(result, { circular: result });
              return result;
            };
            const failed = await raw();
            assert.equal(failed.status, 500);
            assert.equal(failed.etag, true);
            assert.match(
              JSON.stringify(failed.body),
              /Datastream upload failed. Review record and attachments before retrying/
            );
          } finally {
            f.datastream.addDatastreams = add;
          }
          assert.deepEqual(await f.files(), []);
          const grants = Reflect.get(f.sockets, 'grants');
          grants.clear();
          const actor = await f.identity.bearer('pilot-api-token');
          assert(actor);
          for (let i = 0; i < 10000; i++) f.sockets.issue({ authorization: headers.Authorization }, f.brand, actor);
          const full = await observe(grantPath, { method: 'POST', headers: base });
          assert.equal(full.status, 500);
          assert.match(JSON.stringify(full.body), /Progress operation failed. Review current state before retrying/);
          grants.clear();
          const persisted = await f.storage.getMeta('fm020-record');
          results.push(normalize({ ...persisted, id: '<generated-document-id>' }));
        }
        observations.push(results);
      } finally {
        await f.close();
      }
    }
    assertGoldenNext('raw-socket-mongo', observations[0]);
  });
  it('matches retained session grants, reconnect, CSRF and fresh session/identity revocation', async () => {
    const observations: unknown[][] = [];
    for (const native of [true]) {
      const f = await rawSocketFixture(native);
      const results: unknown[] = [];
      const clients: Socket[] = [];
      let cookie = '',
        csrf = '';
      const cookies = (response: Response) => {
        const jar = new Map(
          cookie
            .split('; ')
            .filter(Boolean)
            .map(item => item.split('=', 2) as [string, string])
        );
        for (const item of response.headers.getSetCookie()) {
          const pair = item.split(';', 1)[0];
          const at = pair.indexOf('=');
          jar.set(pair.slice(0, at), pair.slice(at + 1));
        }
        cookie = [...jar].map(([key, value]) => key + '=' + value).join('; ');
      };
      const token = async () => {
        const response = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
        assert.equal(response.status, 200);
        cookies(response);
        csrf = (await response.json())._csrf;
      };
      const login = async () => {
        await token();
        const response = await fetch(f.url + '/user/login_local', {
          method: 'POST',
          headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'X-Source': 'jsclient', 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
          redirect: 'manual',
        });
        assert.equal(response.status, 200, await response.clone().text());
        cookies(response);
        await response.text();
        await token();
      };
      const sessionGrant = async (extra: Record<string, string> = {}) => {
        const response = await fetch(f.url + grantPath, {
          method: 'POST',
          headers: { Cookie: cookie, Origin: canonical, 'X-CSRF-Token': csrf, 'X-ReDBox-Api-Version': '2.0', ...extra },
        });
        const body = await response.json();
        results.push({ status: response.status, body: body.data?.token ? { token: '<grant>' } : normalize(body) });
        return body.data?.token as string;
      };
      const rejected = async (grant: string) => {
        const failed = connect(f, grant);
        clients.push(failed.client);
        await assert.rejects(failed.connected);
        failed.client.disconnect();
        results.push('socket denied');
      };
      try {
        await login();
        for (const token of ['invalid', csrf]) {
          const response = await fetch(f.url + uploadPath, {
            method: 'POST',
            headers: {
              Cookie: cookie,
              Origin: canonical,
              'X-CSRF-Token': token,
              'X-ReDBox-Api-Version': '2.0',
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: Buffer.concat([start, Buffer.from('session upload'), end]),
          });
          const body = await response.json();
          assert.equal(response.status, token === 'invalid' ? 403 : 200, JSON.stringify(body));
          results.push({ status: response.status, body: normalize(body) });
        }
        await sessionGrant({ 'X-CSRF-Token': 'invalid' });
        await sessionGrant({ Origin: 'https://foreign.invalid' });
        await sessionGrant({ Authorization: 'Bearer invalid' });
        const first = await sessionGrant();
        assert(first);
        const accepted = connect(f, first);
        clients.push(accepted.client);
        const client = await accepted.connected;
        results.push(await client.timeout(5000).emitWithAck('subscribe', 'fm020-record'));
        client.disconnect();
        await rejected(first);
        const reconnect = connect(f, await sessionGrant());
        clients.push(reconnect.client);
        const again = await reconnect.connected;
        results.push(await again.timeout(5000).emitWithAck('subscribe', 'fm020-record'));
        again.disconnect();
        const expiryGrant = await sessionGrant();
        await f.native
          .db()
          .collection('pilotSessions')
          .updateMany({}, { $set: { expires: new Date(0) } });
        await rejected(expiryGrant);
        await login();
        const established = connect(f, await sessionGrant());
        clients.push(established.client);
        const live = await established.connected;
        assert.deepEqual(await live.timeout(5000).emitWithAck('subscribe', 'fm020-record'), { status: true });
        const disabledGrant = await sessionGrant();
        await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
        await rejected(disabledGrant);
        results.push(await live.timeout(5000).emitWithAck('subscribe', 'fm020-record'));
        let leaked = false;
        live.once('update', () => {
          leaked = true;
        });
        await f.sockets.emit('update', { branding: f.brand.id, relatedRecordId: 'fm020-record', message: 'private' });
        await delay(30);
        assert.equal(leaked, false);
        live.disconnect();
        await f.identities.update('user', { id: f.user.id }, { loginDisabled: false });
        const roleGrant = await sessionGrant();
        await f.identities.removeMemberships('user', f.user.id, [f.role.id]);
        await rejected(roleGrant);
        await f.identities.addMemberships('user', f.user.id, [f.role.id]);
        const expiredGrant = await sessionGrant();
        Reflect.get(f.sockets, 'grants').get(expiredGrant).expires = 0;
        await rejected(expiredGrant);
        const deletedGrant = await sessionGrant();
        await f.native.db().collection('pilotSessions').deleteMany({});
        await rejected(deletedGrant);
        await login();
        const rotatedGrant = await sessionGrant();
        await login();
        await rejected(rotatedGrant);
        const logoutGrant = await sessionGrant();
        const logout = await fetch(f.url + '/default/rdmp/user/logout', {
          method: 'POST',
          headers: { Cookie: cookie, 'X-CSRF-Token': csrf },
          redirect: 'manual',
        });
        await logout.text();
        assert([200, 302].includes(logout.status));
        await rejected(logoutGrant);
        observations.push(results);
      } finally {
        for (const client of clients) client.disconnect();
        await f.close();
      }
    }
    assertGoldenNext('raw-socket-mongo', observations[0]);
  });
});
// Stage ordering belongs to the shared production action, not an incremental
// Busboy callback or a second native validation pass.
describe('FM-020 complete multipart validation stages', function () {
  this.timeout(60000);
  const stagesBoundary = 'fm020-validation-stages';
  const field = (name: string, value: string) =>
    `--${stagesBoundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const file = (value = 'staged bytes', name = 'attachmentFields') =>
    `--${stagesBoundary}\r\nContent-Disposition: form-data; name="${name}"; filename="stages.txt"\r\nContent-Type: text/plain\r\n\r\n${value}\r\n`;
  const multipart = (parts: readonly string[]) => parts.join('') + `--${stagesBoundary}--\r\n`;
  const permutations = [
    ['permit', 'suffix', 'file'],
    ['suffix', 'permit', 'file'],
    ['file', 'permit', 'suffix'],
    ['file', 'suffix', 'permit'],
    ['permit', 'file', 'suffix'],
    ['suffix', 'file', 'permit'],
  ];
  const { z } = require('zod') as typeof import('zod');
  const source = require('../../../src/api-routes/groups/records')
    .addDataStreamsRoute as import('../../../src/api-routes/types').ApiRouteDefinition;
  async function send(f: Fixture, body: string, query = '', extra: Record<string, string> = {}) {
    const response = await fetch(f.url + uploadPath + query, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${stagesBoundary}`, ...extra },
      body,
    });
    const json = await response.json();
    return {
      status: response.status,
      errors: json.errors,
      cache: response.headers.get('cache-control'),
      etag: !!response.headers.get('etag'),
    };
  }
  it('never calls a replacement body extractor with an absent body and invokes it once after staging', async () => {
    let calls = 0;
    const f = await rawSocketFixture(true, {
      uploadRequest: {
        ...source.request,
        body: {
          required: true,
          content: { 'multipart/form-data': { schema: z.object({ permit: z.literal('yes') }) } },
        },
        extractor: request => {
          calls++;
          return {
            permit: (
              request.body as {
                permit: string;
              }
            ).permit.toLowerCase(),
          };
        },
      },
    });
    try {
      const response = await send(f, multipart([field('permit', 'YES'), file()]));
      assert.equal(response.status, 200, JSON.stringify(response));
      assert.equal(calls, 1);
      assert.equal(f.receiveCalls(), 1);
      assert.equal(f.finalizations(), 1);
      assert.deepEqual(await f.files(), []);
    } finally {
      await f.close();
    }
  });
  it('normalizes complete fields independently of all field/file order permutations', async () => {
    let calls = 0;
    const f = await rawSocketFixture(true, {
      uploadRequest: {
        ...source.request,
        body: { content: { 'multipart/form-data': { schema: z.object({ permit: z.literal('yes!') }) } } },
        extractor: request => {
          calls++;
          const body = request.body as
            | {
                permit?: string;
                suffix?: string;
              }
            | undefined;
          return { permit: (body?.permit?.toLowerCase() ?? '') + (body?.suffix ?? '') };
        },
      },
    });
    try {
      for (const order of permutations) {
        calls = 0;
        const parts = { permit: field('permit', 'YES'), suffix: field('suffix', '!'), file: file() };
        const response = await send(f, multipart(order.map(name => parts[name as keyof typeof parts])));
        assert.equal(response.status, 200, JSON.stringify({ order, response }));
        assert.equal(calls, 1, 'one complete-field extraction per request');
        assert.deepEqual(await f.files(), []);
      }
      assert.equal(f.finalizations(), permutations.length);
    } finally {
      await f.close();
    }
  });
  it('matches retained/current Express timing and staging outcomes for the current upload declaration', async () => {
    const observations: unknown[][] = [];
    for (const mode of ['native'] as const) {
      const f = await rawSocketFixture(true);
      const events: string[] = [];
      const disk = f.disks.stagingDisk(),
        put = disk.putStream,
        remove = disk.delete;
      const save = f.writer.updateMeta,
        finalize = f.datastream.addDatastreams;
      disk.putStream = async function (...args) {
        events.push('stage');
        await put.apply(this, args);
        events.push('staged');
      };
      disk.delete = async function (...args) {
        await remove.apply(this, args);
        events.push('cleanup');
      };
      f.writer.updateMeta = async function (...args) {
        events.push('persist');
        return save.apply(this, args);
      };
      f.datastream.addDatastreams = async function (...args) {
        events.push('finalize');
        return finalize.apply(this, args);
      };
      const results: unknown[] = [];
      try {
        for (const [name, body, extra, status, expected] of [
          ['auth', multipart([file()]), { Authorization: 'Bearer invalid' }, 401, []],
          ['origin', multipart([file()]), { Origin: 'https://foreign.invalid' }, 403, []],
          ['missing-file', multipart([field('permit', 'anything')]), {}, 400, []],
          ['unexpected-file', multipart([file('staged bytes', 'other')]), {}, 400, ['stage', 'staged', 'cleanup']],
          [
            'fields-before',
            multipart([field('permit', 'ignored'), file()]),
            {},
            200,
            ['stage', 'staged', 'persist', 'finalize', 'cleanup'],
          ],
          [
            'fields-after',
            multipart([file(), field('permit', 'ignored')]),
            {},
            200,
            ['stage', 'staged', 'persist', 'finalize', 'cleanup'],
          ],
        ] as [string, string, Record<string, string>, number, string[]][]) {
          events.length = 0;
          const before = (await f.storage.getMeta('fm020-record')).revision;
          const response =
            status === 200
              ? await send(f, body, '', extra)
              : await withoutSideEffects(
                  { data: f.portal.data, client: f.native, owner: f.owner, url: f.url },
                  () => send(f, body, '', extra),
                  {
                    sessionCollection: 'pilotSessions',
                    expectedCalls:
                      name === 'unexpected-file' ? { 'staging:putStream': 1, 'staging:delete': 1 } : undefined,
                  }
                );
          assert.equal(response.status, status, JSON.stringify({ mode, name, response }));
          assert.deepEqual(events, expected, mode + ': ' + name);
          assert.deepEqual(await f.files(), []);
          if (status !== 200) assert.equal((await f.storage.getMeta('fm020-record')).revision, before);
          results.push({ name, response, events: [...events] });
        }
        observations.push(results);
      } finally {
        disk.putStream = put;
        disk.delete = remove;
        f.writer.updateMeta = save;
        f.datastream.addDatastreams = finalize;
        await f.close();
      }
    }
    assertGoldenNext('raw-socket-mongo', observations[0]);
  });
  it('rejects repeated and reserved multipart field names before a record write', async () => {
    const f = await rawSocketFixture(true);
    try {
      const before = await f.storage.getMeta('fm020-record');
      for (const name of ['permit', '__proto__', 'constructor']) {
        const denied = await withoutSideEffects(
          { data: f.portal.data, client: f.native, owner: f.owner, url: f.url },
          () => send(f, multipart([field('permit', 'first'), field(name, 'second'), file()])),
          { sessionCollection: 'pilotSessions' }
        );
        assert.equal(denied.status, 400);
        assert.deepEqual(denied.errors, [{ detail: 'Invalid or repeated multipart field' }]);
        assert.equal(denied.etag, false);
        assert.deepEqual(await f.files(), []);
        assert.deepEqual(await f.storage.getMeta('fm020-record'), before);
      }
      const allowed = await send(f, multipart([field('permit', 'first'), file()]));
      assert.equal(allowed.status, 200);
      assert.equal(f.finalizations(), 1);
    } finally {
      await f.close();
    }
  });
  it('refuses an undeclared multipart file alongside a valid attachment without dispatch', async () => {
    const f = await rawSocketFixture(true);
    let writes = 0;
    const save = f.writer.updateMeta;
    f.writer.updateMeta = async function (...args) {
      writes++;
      return save.apply(this, args);
    };
    try {
      const before = await f.storage.getMeta('fm020-record');
      const denied = await withoutSideEffects(
        { data: f.portal.data, client: f.native, owner: f.owner, url: f.url },
        () => send(f, multipart([file(), file('must not persist', 'other')])),
        {
          sessionCollection: 'pilotSessions',
          // Parsing may stage both parts. The preexisting trace and snapshot
          // still require cleanup and no record write or finalization.
          ignorePorts: ['staging:putStream', 'staging:delete'],
        }
      );
      assert.deepEqual(denied, {
        status: 400,
        errors: [{ detail: 'Unexpected file field' }],
        cache: 'no-cache, private',
        etag: false,
      });
      assert.equal(writes, 0);
      assert.equal(f.finalizations(), 0);
      assert.deepEqual(await f.storage.getMeta('fm020-record'), before);
      assert.deepEqual(await f.files(), []);

      const allowed = await send(f, multipart([file()]));
      assert.equal(allowed.status, 200);
      assert.equal(writes, 1);
      assert.equal(f.finalizations(), 1);
      assert.deepEqual(await f.files(), []);
    } finally {
      f.writer.updateMeta = save;
      await f.close();
    }
  });
  it('matches current Express for one validation pass per stage, complete extraction, rejection cleanup and finalisation', async () => {
    const observations: unknown[][] = [];
    for (const native of [true]) {
      const events: string[] = [];
      let f: Fixture;
      const count = <T extends import('zod').ZodType>(name: string, schema: T): T => {
        const parse = schema.safeParse.bind(schema);
        schema.safeParse = ((...args: Parameters<typeof parse>) => {
          events.push(name);
          return parse(...args);
        }) as typeof schema.safeParse;
        return schema;
      };
      const contract: import('../../../src/api-routes/types').ApiRequestDefinition = {
        params: count('params', z.object({ oid: z.literal('fm020-record') }).passthrough()),
        query: count('query', z.object({ approval: z.literal('yes') })),
        headers: count('headers', z.object({ 'x-approval': z.literal('yes') }).passthrough()),
        body: {
          required: true,
          content: { 'multipart/form-data': { schema: count('body', z.object({ permit: z.literal('yes!') })) } },
        },
        files: { attachmentFields: { required: true, multiple: false, maxBytes: 16 } },
        extractor: request => {
          events.push('extract');
          const files = request.files as Record<
            string,
            {
              fd: string;
              size: number;
            }[]
          >;
          assert.ok(files, 'complete file metadata is available to the body extractor');
          for (const entries of Object.values(files))
            for (const entry of entries) {
              assert.ok(existsSync(join(f.directory, 'staging', entry.fd)), 'all files are staged before extraction');
              assert.ok(entry.size > 0);
            }
          const body = request.body as {
            permit?: string;
            suffix?: string;
          };
          if (body.permit === 'THROW') throw new Error('private extractor failure');
          if (body.permit === 'NONE') return undefined;
          return { permit: (body.permit?.toLowerCase() ?? '') + (body.suffix ?? '') };
        },
      };
      f = await rawSocketFixture(native, { retainExpress: false, uploadRequest: contract });
      // Observe the real post-parse validator without substituting its result.
      // Production resolution snapshots file constraints, so getters on the
      // source declaration cannot observe validation of the resolved contract.
      const validation =
        require('../../../src/api-routes/validation') as typeof import('../../../src/api-routes/validation');
      const validate = validation.validateApiRequest;
      validation.validateApiRequest = (request, declaration, options) => {
        if (declaration?.files && options?.files) events.push('files');
        return validate(request, declaration, options);
      };
      const disk = f.disks.stagingDisk(),
        put = disk.putStream,
        remove = disk.delete;
      const save = f.writer.updateMeta,
        finalize = f.datastream.addDatastreams;
      disk.putStream = async function (...args) {
        events.push('stage');
        await put.apply(this, args);
        events.push('staged');
      };
      disk.delete = async function (...args) {
        await remove.apply(this, args);
        events.push('cleanup');
      };
      f.writer.updateMeta = async function (...args) {
        events.push('persist');
        return save.apply(this, args);
      };
      f.datastream.addDatastreams = async function (...args) {
        events.push('finalize');
        return finalize.apply(this, args);
      };
      const results: unknown[] = [];
      try {
        const valid = { permit: field('permit', 'YES'), suffix: field('suffix', '!'), file: file() };
        const cases = [
          ...permutations.map(order => ({
            name: order.join('-'),
            body: multipart(order.map(name => valid[name as keyof typeof valid])),
            status: 200,
            extract: 1,
            staged: 1,
          })),
          {
            name: 'invalid-query',
            body: multipart([valid.permit, valid.file, valid.suffix]),
            query: '?approval=no',
            status: 400,
            extract: 0,
            staged: 0,
          },
          {
            name: 'invalid-header',
            body: multipart([valid.permit, valid.file, valid.suffix]),
            extra: { 'X-Approval': 'no' },
            status: 400,
            extract: 0,
            staged: 0,
          },
          {
            name: 'invalid-fields-before',
            body: multipart([field('permit', 'NO'), valid.suffix, valid.file]),
            status: 400,
            extract: 1,
            staged: 1,
          },
          {
            name: 'invalid-fields-after',
            body: multipart([valid.file, valid.suffix, field('permit', 'NO')]),
            status: 400,
            extract: 1,
            staged: 1,
          },
          { name: 'missing-suffix', body: multipart([valid.file, valid.permit]), status: 400, extract: 1, staged: 1 },
          {
            name: 'oversize-file',
            body: multipart([valid.permit, file('x'.repeat(17)), valid.suffix]),
            status: 400,
            extract: 1,
            staged: 1,
          },
          {
            name: 'required-body',
            body: multipart([field('permit', 'NONE'), valid.file]),
            status: 400,
            extract: 1,
            staged: 1,
          },
          {
            name: 'extractor-fault',
            body: multipart([field('permit', 'THROW'), valid.file]),
            status: 500,
            extract: 1,
            staged: 1,
          },
        ];
        for (const scenario of cases) {
          events.length = 0;
          const before = (await f.storage.getMeta('fm020-record')).revision;
          const response = await send(f, scenario.body, 'query' in scenario ? scenario.query : '?approval=yes', {
            'X-Approval': 'yes',
            ...('extra' in scenario ? scenario.extra : {}),
          });
          assert.equal(
            response.status,
            scenario.status,
            JSON.stringify({ native, scenario: scenario.name, response, events })
          );
          for (const name of ['params', 'query', 'headers'])
            assert.equal(events.filter(event => event === name).length, 1, name + ' exactly once');
          assert.equal(events.filter(event => event === 'extract').length, scenario.extract);
          assert.equal(
            events.filter(event => event === 'body').length,
            scenario.extract && scenario.name !== 'extractor-fault' ? 1 : 0
          );
          assert.equal(
            events.filter(event => event === 'files').length,
            scenario.extract && scenario.name !== 'extractor-fault' ? 1 : 0
          );
          assert.equal(events.filter(event => event === 'stage').length, scenario.staged);
          if (scenario.staged) assert.ok(events.indexOf('staged') < events.indexOf('extract'));
          assert.equal(events.includes('persist'), scenario.status === 200);
          assert.equal(events.includes('finalize'), scenario.status === 200);
          assert.equal(events.filter(event => event === 'cleanup').length, scenario.staged);
          assert.deepEqual(await f.files(), []);
          if (scenario.status !== 200) assert.equal((await f.storage.getMeta('fm020-record')).revision, before);
          assert.equal(JSON.stringify(response).includes('private extractor failure'), false);
          results.push({ name: scenario.name, response, events: [...events] });
        }
        observations.push(results);
      } finally {
        validation.validateApiRequest = validate;
        disk.putStream = put;
        disk.delete = remove;
        f.writer.updateMeta = save;
        f.datastream.addDatastreams = finalize;
        await f.close();
      }
    }
    assertGoldenNext('raw-socket-mongo', observations[0]);
  });
});

goldenControls('raw-socket-mongo');
