import { goldenControls } from './goldenContracts';
import { assertWireContract } from './wireContracts';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sinon from 'sinon';
import { io, type Socket } from 'socket.io-client';
import WebSocket from 'ws';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { withoutSideEffects } from './noSideEffects';

import { progressOperationRoutes, progressSocketGrantRoute } from '../../../src/http/progressRoutes';

const declarations = [...progressOperationRoutes, progressSocketGrantRoute].map(route => ({ ...route, responses: {} }));
const credentials = { Authorization: 'Bearer pilot-api-token', Origin: referenceOrigin };
const socketEvent = (socket: Socket, event: string) =>
  new Promise<[Record<string, unknown>]>(resolve => socket.once(event, value => resolve([value])));
function wire(
  base: string,
  target: string,
  method = 'GET',
  headers: Record<string, string> = credentials,
  body?: unknown
) {
  return new Promise<{
    status: number;
    headers: Record<string, unknown>;
    bytes: Buffer;
  }>((resolve, reject) => {
    const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = request(
      new URL(base).origin,
      {
        path: target,
        method,
        headers: {
          ...headers,
          ...(bytes ? { 'Content-Type': 'application/json', 'Content-Length': String(bytes.length) } : {}),
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, bytes: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Progress wire timeout')));
    req.end(bytes);
  });
}
function normalized(result: Awaited<ReturnType<typeof wire>>) {
  const { date, connection, 'keep-alive': keepAlive, 'x-request-id': requestId, ...headers } = result.headers;
  const text = result.bytes
    .toString()
    .replace(/[a-f0-9]{64}/g, '<token>')
    .replace(/[a-f0-9]{24}/g, '<id>')
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3}Z)?/g, '<time>');
  if (headers['content-length']) headers['content-length'] = String(Buffer.byteLength(text));
  return { status: result.status, headers, body: text };
}
async function connect(base: string, root: string, token: string, origin = referenceOrigin) {
  const client = io(new URL(base).origin, {
    path: root + '/portal-socket.io',
    transports: ['websocket'],
    reconnection: false,
    timeout: 3000,
    auth: { token },
    extraHeaders: { Origin: origin },
  });
  const connected = new Promise<Socket>((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
  return { client, connected };
}
for (const profile of [
  { name: 'portal', root: '/portal' },
  { name: 'root', root: '' },
  { name: 'reduced', root: '/portal', policy: { '*': ['noCache', 'brandingAndPortal'] } },
]) {
  for (const native of [true])
    describe(`FM-035 ${profile.name} ${'Fastify'} progress`, function () {
      this.timeout(120000);
      let f: Awaited<ReturnType<typeof referenceProductionFixture>>;
      const clients = new Set<Socket>();
      const target = (suffix = '') => profile.root + '/default/rdmp/asynch' + suffix;
      const grant = async () => {
        const response = await wire(f.url, target('/socket-token'), 'POST');
        assert.equal(response.status, 200, response.bytes.toString());
        return JSON.parse(response.bytes.toString()).token as string;
      };
      before(async () => {
        f = await referenceProductionFixture(native, profile.policy, undefined, {
          declarations,
          rootContext: profile.root,
          hooksModule: require.resolve('./requestReplacementHook'),
        });
      });
      after(async () => {
        for (const client of clients) client.disconnect();
        await f?.close();
      });
      for (const route of declarations)
        for (const version of ['1.0', '2.0'])
          for (const variant of [
            'admin',
            'anonymous',
            'reader',
            'foreign',
            'invalid',
            'origin',
            'cross-brand',
            'absolute-host',
            'bodyless',
            'empty',
          ])
            it(`${route.method} ${route.path} v${version} ${variant}`, async () => {
              let path =
                profile.root +
                route.path
                  .replace(':branding', variant === 'cross-brand' ? 'other' : 'default')
                  .replace(':portal', 'rdmp')
                  .replace(':roomId', 'reference-record');
              const headers = { ...credentials } as Record<string, string>;
              if (variant === 'anonymous') delete headers.Authorization;
              if (['reader', 'foreign', 'invalid'].includes(variant))
                headers.Authorization = 'Bearer ' + variant + '-token';
              if (variant === 'origin') headers.Origin = 'https://hostile.invalid';
              if (variant === 'absolute-host') {
                path = 'http://hostile.invalid' + path;
                headers.Host = 'hostile.invalid';
                headers['X-Forwarded-Host'] = 'hostile.invalid';
              }
              path += '?apiVersion=' + version;
              if (route.method === 'get' && route.action === 'progress')
                path += '&fq=' + encodeURIComponent(JSON.stringify({ relatedRecordId: 'reference-record' }));
              const body =
                variant === 'bodyless' || route.method === 'get'
                  ? undefined
                  : variant === 'empty'
                    ? {}
                    : {
                        name: 'FM035',
                        relatedRecordId: 'reference-record',
                        id: '000000000000000000000099',
                        message: 'progress',
                      };
              const expected =
                route.method !== 'get' &&
                (variant === 'origin' || (profile.policy && ['anonymous', 'invalid'].includes(variant)))
                  ? 403
                  : profile.policy || ['anonymous', 'invalid'].includes(variant)
                    ? 401
                    : ['reader', 'foreign', 'cross-brand'].includes(variant)
                      ? 403
                      : route.path.endsWith('socket-token')
                        ? 200
                        : ['subscribe', 'unsubscribe'].includes(route.action)
                          ? 410
                          : route.action === 'progress'
                            ? 200
                            : route.action === 'start'
                              ? ['bodyless', 'empty'].includes(variant)
                                ? 403
                                : 200
                              : ['bodyless', 'empty'].includes(variant)
                                ? 400
                                : 403;
              const send = () => wire(f.url, path, route.method.toUpperCase(), headers, body);
              const response =
                route.method !== 'get' && [400, 401, 403].includes(expected)
                  ? await withoutSideEffects(f, send, { collections: ['asynchprogress'] })
                  : await send();
              assert.equal(response.status, expected, response.bytes.toString());
              const key = profile.name + route.method + route.path + version + variant;
              assertWireContract('progress', key, normalized(response));
              assert.equal(response.headers['x-powered-by'], undefined);
              if (response.bytes.length && response.headers['content-length'])
                assert.equal(Number(response.headers['content-length']), response.bytes.length);
            });
      it('preserves conditional progress reads and admission for GET and HEAD', async () => {
        for (const method of ['GET', 'HEAD'])
          for (const variant of ['fresh', 'no-cache', 'invalid', 'anonymous'] as const) {
            const headers: Record<string, string> = { ...credentials, 'If-None-Match': '*' };
            if (variant === 'no-cache') headers['Cache-Control'] = 'no-cache';
            if (variant === 'anonymous') delete headers.Authorization;
            const response = await wire(f.url, target(variant === 'invalid' ? '?fq=invalid' : ''), method, headers);
            const expected = profile.policy
              ? 401
              : { fresh: 304, 'no-cache': 200, invalid: 400, anonymous: 401 }[variant];
            assert.equal(response.status, expected, method + ' ' + variant);
            if (response.status === 304) {
              assert.equal(response.bytes.length, 0);
              for (const header of ['content-type', 'content-length', 'transfer-encoding'])
                assert.equal(response.headers[header], undefined);
            }
            if (method === 'HEAD') assert.equal(response.bytes.length, 0);
            const key = profile.name + 'conditional-progress-' + method + '-' + variant;
            assertWireContract('progress', key, normalized(response));
            assert.equal(response.headers['x-powered-by'], undefined);
            if (response.bytes.length && response.headers['content-length'])
              assert.equal(Number(response.headers['content-length']), response.bytes.length);
          }
      });
      const files = readdirSync(path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist'));
      it('preserves raw Engine.IO upgrade ownership with hostile Host and absolute targets', async () => {
        for (const absolute of [false, true]) {
          const client = new WebSocket(
            new URL(f.url).origin.replace('http:', 'ws:') +
              profile.root +
              '/portal-socket.io/?EIO=4&transport=websocket',
            {
              headers: { Origin: referenceOrigin, Host: 'hostile.invalid', 'X-Forwarded-Host': 'hostile.invalid' },
              ...(absolute
                ? {
                    finishRequest(req: import('node:http').ClientRequest) {
                      req.path = 'http://hostile.invalid' + req.path;
                      req.end();
                    },
                  }
                : {}),
            }
          );
          client.on('error', () => {});
          try {
            if (absolute) await assert.rejects(once(client, 'open'));
            else await once(client, 'open');
          } finally {
            client.terminate();
          }
        }
      });
      for (const file of files)
        for (const method of ['GET', 'HEAD'])
          for (const encoding of ['identity', 'gzip', 'br', 'deflate'])
            it(`client bytes and headers ${file} ${method} ${encoding}`, async () => {
              const response = await wire(f.url, profile.root + '/portal-socket.io/' + file, method, {
                Host: 'hostile.invalid',
                'Accept-Encoding': encoding,
              });
              assert.equal(response.status, 200);
              const { date, connection, 'keep-alive': keepAlive, ...headers } = response.headers;
              const value = {
                headers,
                length: response.bytes.length,
                sha256: createHash('sha256').update(response.bytes).digest('hex'),
              };
              const key = profile.name + file + method + encoding;
              assertWireContract('progress-client', key, { ...value, body: response.bytes.toString('base64') });
              assert(headers.etag);
              if (method === 'HEAD') assert.equal(value.length, 0);
              else {
                const coding = headers['content-encoding'];
                const bytes =
                  coding === 'gzip'
                    ? gunzipSync(response.bytes)
                    : coding === 'br'
                      ? brotliDecompressSync(response.bytes)
                      : coding === 'deflate'
                        ? inflateSync(response.bytes)
                        : response.bytes;
                assert.deepEqual(
                  bytes,
                  readFileSync(path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist', file))
                );
              }
              const fresh = await wire(f.url, profile.root + '/portal-socket.io/' + file, method, {
                'If-None-Match': String(headers.etag),
              });
              assert.equal(fresh.status, 304);
              assert.equal(fresh.bytes.length, 0);
            });
      if (profile.name !== 'reduced') {
        for (const version of ['1.0', '2.0'])
          it(`reads body/query/params replaced by beforeAction v${version}`, async () => {
            const body = { name: 'live-hook', relatedRecordId: 'reference-record', message: 'after hook' };
            const created = await wire(
              f.url,
              target() + '?apiVersion=' + version,
              'POST',
              {
                ...credentials,
                'x-fm027-replacement': JSON.stringify({ body }),
              },
              {}
            );
            assert.equal(created.status, 200, created.bytes.toString());
            const value = JSON.parse(created.bytes.toString());
            const row = version === '2.0' ? value.data : value;
            assert.equal(row.message, 'after hook');
            const listed = await wire(f.url, target() + '?fq=invalid', 'GET', {
              ...credentials,
              'x-fm027-replacement': JSON.stringify({
                query: { apiVersion: version, fq: JSON.stringify({ id: row.id }) },
              }),
            });
            assert.equal(listed.status, 200, listed.bytes.toString());
            const list = JSON.parse(listed.bytes.toString());
            assert.equal((version === '2.0' ? list.data : list)[0].id, row.id);
            const retired = await wire(f.url, target('/subscribe/reference-record') + '?apiVersion=' + version, 'GET', {
              ...credentials,
              'x-fm027-replacement': JSON.stringify({ params: { branding: 'default', portal: 'rdmp' } }),
            });
            assert.equal(retired.status, 410, retired.bytes.toString());
          });
        it('denies invalid, expired, reused and changed-user grants; reconnect requires a fresh grant', async () => {
          const attempt = async (token: string, allowed: boolean) => {
            const pair = await connect(f.url, profile.root, token);
            clients.add(pair.client);
            try {
              if (allowed) await pair.connected;
              else await assert.rejects(pair.connected);
            } finally {
              pair.client.disconnect();
            }
          };
          for (const token of ['missing', '__proto__', 'constructor', '']) await attempt(token, false);
          const used = await grant();
          await attempt(used, true);
          await attempt(used, false);
          const expired = await grant(),
            now = Date.now();
          const clock = sinon.stub(Date, 'now').returns(now + 31000);
          try {
            await attempt(expired, false);
          } finally {
            clock.restore();
          }
          await attempt(await grant(), true);
          const changed = await grant();
          // Mutate through the initialized identity repository, retaining credential resolution.
          const identities = require('../../../src/persistence/identity/runtime').getIdentityRepositories(f.owner);
          const admin = await identities.one('user', { username: 'pilot-admin' });
          const reader = await identities.one('user', { username: 'reader' });
          await identities.update('user', { id: admin.id }, { token: 'revoked' });
          await identities.update(
            'user',
            { id: reader.id },
            { token: createHash('sha256').update('pilot-api-token').digest('base64') }
          );
          try {
            await attempt(changed, false);
          } finally {
            await identities.update(
              'user',
              { id: reader.id },
              { token: createHash('sha256').update('reader-token').digest('base64') }
            );
            await identities.update(
              'user',
              { id: admin.id },
              { token: createHash('sha256').update('pilot-api-token').digest('base64') }
            );
          }
        });
        it('delivers real start/update/stop events, authorizes rooms and reconnects with a new grant', async () => {
          const pair = await connect(f.url, profile.root, await grant());
          clients.add(pair.client);
          const client = await pair.connected;
          assert.deepEqual(await client.timeout(3000).emitWithAck('subscribe', 'reference-record'), { status: true });
          assert.deepEqual(await client.timeout(3000).emitWithAck('subscribe', 'foreign-record'), { status: false });
          const started = socketEvent(client, 'start');
          const creation = await wire(f.url, target(), 'POST', credentials, {
            name: 'delivery',
            relatedRecordId: 'reference-record',
          });
          assert.equal(creation.status, 200, creation.bytes.toString());
          const [event] = await started;
          const id = JSON.parse(creation.bytes.toString()).id;
          assert.equal(event.id, id);
          const updated = socketEvent(client, 'update');
          assert.equal((await wire(f.url, target(), 'PUT', credentials, { id, currentIdx: 1 })).status, 200);
          assert.equal((await updated)[0].currentIdx, 1);
          client.disconnect();
          const reconnect = await connect(f.url, profile.root, await grant());
          clients.add(reconnect.client);
          const next = await reconnect.connected;
          assert.deepEqual(await next.timeout(3000).emitWithAck('subscribe', 'reference-record'), { status: true });
          const stopped = socketEvent(next, 'stop');
          assert.equal((await wire(f.url, target(), 'DELETE', credentials, { id })).status, 200);
          assert.equal((await stopped)[0].id, id);
        });
      }
    });
}

goldenControls('progress');

goldenControls('progress-client');
