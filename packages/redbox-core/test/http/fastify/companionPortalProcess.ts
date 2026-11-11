import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rawSocketFixture, canonical } from './rawSocketFixture';
import { retainedCompanionExpress } from './retainedCompanionExpress';
import { persistenceStatus } from '../../../src/persistence/runtime';
import WebSocket from 'ws';
import { NativeMongoSessionStore } from '../../../src/http/fastify/session';

export async function run() {
  const native = process.argv[2] === 'fastify';
  const mode = process.argv[3] ?? 'enabled';
  let f: Awaited<ReturnType<typeof rawSocketFixture>>;
  let companion: any;
  let source: ReturnType<typeof createServer>;
  let reference: Awaited<ReturnType<typeof retainedCompanionExpress>>;
  let directory: string;
  let releaseMeta: (() => void) | undefined;
  let metaStarted = Promise.withResolvers<void>();
  const sinkReleases = new Set<() => void>();
  let sinkStarted = Promise.withResolvers<void>();
  let holdSink = false,
    rejectSink = false,
    metaHits = 0;
  const files = new Map<string, Buffer>();
  let nextFile = 0;
  let sessionGate: ReturnType<typeof Promise.withResolvers<void>> | undefined;
  let sessionStarted = Promise.withResolvers<void>();
  const originalTouch = NativeMongoSessionStore.prototype.touch;
  let heldDeadline = false;
  const commands: Record<string, (args: any) => unknown> = {
    async init() {
      directory = await mkdtemp(path.join(tmpdir(), 'fm021-provider-'));
      source = createServer(async (req, res) => {
        try {
          if (req.url?.startsWith('/source/')) {
            metaHits++;
            if (req.url === '/source/held') {
              metaStarted.resolve();
              await new Promise<void>(resolve => {
                releaseMeta = resolve;
              });
            }
            const data = Buffer.from('remote-companion-bytes');
            res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': data.length });
            res.end(data);
            return;
          }
          assert.equal(req.headers.authorization, 'Bearer destination-grant');
          if (rejectSink) {
            res.writeHead(401);
            res.end('private-provider-response');
            return;
          }
          const id = req.url!.split('/').pop()!;
          res.setHeader('Tus-Resumable', '1.0.0');
          if (req.method === 'POST') {
            const id = String(++nextFile);
            files.set(id, Buffer.alloc(0));
            res.writeHead(201, { Location: '/sink/' + id });
            res.end();
          } else if (req.method === 'HEAD') {
            res.writeHead(200, { 'Upload-Offset': files.get(id)!.length });
            res.end();
          } else if (req.method === 'PATCH') {
            sinkStarted.resolve();
            if (holdSink)
              await new Promise<void>(resolve => {
                sinkReleases.add(resolve);
              });
            const chunks = [files.get(id)!];
            for await (const chunk of req) chunks.push(Buffer.from(chunk));
            const bytes = Buffer.concat(chunks);
            files.set(id, bytes);
            res.writeHead(204, { 'Upload-Offset': bytes.length });
            res.end();
          } else {
            res.writeHead(405);
            res.end();
          }
        } catch {
          res.writeHead(500);
          res.end();
        }
      });
      source.listen(0, '127.0.0.1');
      await once(source, 'listening');
      const address = source.address();
      assert(address && typeof address !== 'string');
      const upstream = 'http://127.0.0.1:' + address.port;
      const module = require('../../../src/http/express/companion');
      const uploadsModule = require('../../../src/http/integrations/companion/uploads');
      const original = {
        CompanionUploads: uploadsModule.CompanionUploads,
        mountCompanionRoutes: module.mountCompanionRoutes,
      };
      if (!native) {
        reference = await retainedCompanionExpress();
        uploadsModule.CompanionUploads = reference.CompanionUploads;
        module.mountCompanionRoutes = (router: unknown, input: any) => {
          companion = input.uploads;
          reference.mountCompanionRoutes(router, input);
        };
      }
      try {
        f = await rawSocketFixture(native, {
          retainExpress: false,
          companion: {
            enabled: mode !== 'disabled',
            route: '/imports',
            secret: 'fm021-synthetic-companion-secret-at-least-32-characters',
            filePath: directory,
            metrics: false,
            server: { host: 'portal.example.invalid', protocol: 'https', path: '/imports' },
            providerOptions: {
              drive: { key: 'synthetic-drive-client', secret: 'synthetic-drive-secret' },
              onedrive: { key: 'synthetic-drive-client', secret: 'synthetic-drive-secret' },
            },
            enableUrlEndpoint: true,
            allowLocalUrls: true,
            streamingUpload: false,
            clientSocketConnectTimeout: 3000,
            uploadUrls: [upstream + '/sink'],
          },
          ...(mode === 'denied' ? { policyConfiguration: { '*': true, CompanionController: { handle: false } } } : {}),
          beforeActivate: async host => {
            const base = 'http://127.0.0.1:' + host.address()!.port;
            const upgrade = new WebSocket(base.replace('http:', 'ws:') + '/portal/imports/api/unknown', {
              origin: canonical,
            });
            upgrade.on('error', () => {});
            await new Promise<void>((resolve, reject) => {
              upgrade.once('unexpected-response', (_req, res) => {
                res.resume();
                upgrade.terminate();
                try {
                  assert.equal(res.statusCode, 503);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
              upgrade.once('open', () => {
                upgrade.terminate();
                reject(new Error('Upgrade bypassed readiness'));
              });
            });
            for (const target of ['/portal/imports', '/portal/imports/health', '/portal/imports/url/meta']) {
              const result = await fetch(base + target);
              assert.equal(result.status, 503);
              await result.text();
            }
          },
        });
      } finally {
        uploadsModule.CompanionUploads = original.CompanionUploads;
        module.mountCompanionRoutes = original.mountCompanionRoutes;
      }
      if (native) {
        assert('installation' in f.portal);
        companion = f.portal.installation.raw!.companion;
      }
      return {
        url: f.url,
        upstream,
        reference: reference && { revision: reference.revision, sha256: reference.sha256 },
        prepared: f.preparedBeforeListening,
        listenCalls: f.listenCalls(),
        bridgeIsServer: companion?.bridge instanceof require('node:http').Server,
        processGuard: Object.hasOwn(globalThis, Symbol.for('@researchdatabox/redbox-core/companion-process-owner/v1')),
        routes: 'registeredRoutes' in f.host ? f.host.registeredRoutes() : [],
      };
    },
    state() {
      return {
        requests: companion?.requests.size ?? 0,
        transfers: companion?.transfers.size ?? 0,
        sockets: companion?.sockets.size ?? 0,
        metaHits,
        files: [...files.values()].map(b => b.toString()),
        pools: persistenceStatus(f.owner).pools,
        closeCalls: f.closeCalls(),
        stopped: f.host.status().stopped,
        listening: f.host.status().listening,
      };
    },
    async actor(change) {
      await f.identities.update(
        'user',
        { id: f.user.id },
        change === 'reader' ? { roles: [f.reader.id] } : { roles: [f.role.id] }
      );
    },
    async seedGrant() {
      const collection = f.native.db().collection('pilotSessions');
      for (const row of await collection.find({}).toArray()) {
        const session = JSON.parse(row.session);
        if (session.passport?.user !== f.user.id) continue;
        session.grant = {
          provider: 'googledrive',
          state: 'synthetic-state',
          dynamic: { state: 'synthetic-dynamic-state' },
        };
        await collection.updateOne({ _id: row._id }, { $set: { session: JSON.stringify(session) } });
      }
    },
    async savedGrant() {
      const sessions = await f.native.db().collection('pilotSessions').find({}).toArray();
      return sessions.map(row => JSON.parse(row.session).grant).filter(Boolean);
    },
    holdMeta() {
      metaStarted = Promise.withResolvers<void>();
    },
    waitMeta() {
      return metaStarted.promise;
    },
    releaseMeta() {
      releaseMeta?.();
      releaseMeta = undefined;
    },
    holdSink() {
      holdSink = true;
      sinkStarted = Promise.withResolvers<void>();
    },
    waitSink() {
      return sinkStarted.promise;
    },
    releaseSink() {
      holdSink = false;
      for (const release of sinkReleases) release();
      sinkReleases.clear();
    },
    rejectSink(value) {
      rejectSink = value;
    },
    holdSession() {
      assert(native);
      sessionGate = Promise.withResolvers<void>();
      sessionStarted = Promise.withResolvers<void>();
      NativeMongoSessionStore.prototype.touch = function (...args: Parameters<NativeMongoSessionStore['touch']>) {
        sessionStarted.resolve();
        void sessionGate!.promise.then(() => originalTouch.apply(this, args));
      };
    },
    failSession() {
      NativeMongoSessionStore.prototype.touch = function (_id, _session, callback) {
        callback(new Error('private-session-provider-credential'));
      };
    },
    waitSession() {
      return sessionStarted.promise;
    },
    releaseSession() {
      NativeMongoSessionStore.prototype.touch = originalTouch;
      sessionGate?.resolve();
    },
    async stop(deadlineMs) {
      try {
        await f.host.stop({ deadlineMs });
        return { error: null };
      } catch (error) {
        heldDeadline = true;
        return { error: String(error) };
      }
    },
    async restart() {
      await assert.rejects(companion.initialize(f.server), /stopped|fresh process/);
      return true;
    },
    async close() {
      releaseMeta?.();
      for (const release of sinkReleases) release();
      sinkReleases.clear();
      sessionGate?.resolve();
      NativeMongoSessionStore.prototype.touch = originalTouch;
      await f?.close();
      await new Promise<void>(resolve => source.close(() => resolve()));
      await reference?.close();
      await rm(directory, { recursive: true, force: true });
      return {
        pools: f ? persistenceStatus(f.owner).pools : 0,
        stopped: f ? f.host.status().stopped : true,
        closeCalls: f?.closeCalls(),
        heldDeadline,
        upgrades: f?.server.listenerCount('upgrade') ?? 0,
      };
    },
  };
  process.on('message', async ({ id, command, args }: any) => {
    try {
      const result = await commands[command](args);
      process.send!({ id, result });
      if (command === 'close') process.disconnect();
    } catch (error) {
      process.send!({ id, error: String(error), stack: (error as Error).stack });
    }
  });
  process.on('disconnect', () => process.exit(0));
}
