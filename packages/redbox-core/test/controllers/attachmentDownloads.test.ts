import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Agent, createServer, get, type IncomingMessage, type ServerResponse } from 'node:http';
import { PassThrough, Readable } from 'node:stream';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountDatastreamReadRoutes } from '../../src/http/express/datastreamReads';
import { hasViewAccess } from '../../src/records/access';

describe('Attachment download stream cleanup', function () {
  const attachment = { fileId: 'file-1', name: 'notes.txt', mimeType: 'text/plain' };
  const record = {
    metaMetadata: { brandId: 'brand-1', attachmentFields: ['files'] },
    authorization: { view: ['alice'] },
    metadata: { files: [attachment] },
  };
  const fixtures: Array<Awaited<ReturnType<typeof httpRouteFixture>>> = [];
  afterEach(async function () {
    for (const f of fixtures.splice(0)) await f.close();
    sinon.restore();
  });
  for (const route of ['attachment', 'datastream', 'webservice'] as const) {
    describe(route, function () {
      async function setup() {
        const getDatastream = sinon.stub();
        const requested = Promise.withResolvers<ServerResponse>();
        const completed = Promise.withResolvers<ServerResponse>();
        const f = await httpRouteFixture((router, input) => {
          router.use((_req, res, next) => {
            requested.resolve(res);
            res.once('close', () => completed.resolve(res));
            next();
          });
          mountDatastreamReadRoutes(router, {
            ...input,
            records: {
              getMeta: sinon.stub().resolves(record),
              getAttachments: sinon.stub().resolves([attachment]),
              hasViewAccess,
            },
            datastream: { getDatastream },
          });
        });
        fixtures.push(f);
        const path =
          route === 'attachment'
            ? '/default/portal/record/oid-1/attach/file-1'
            : route === 'datastream'
              ? '/default/portal/record/oid-1/datastream?datastreamId=file-1'
              : '/default/portal/api/records/datastreams/oid-1/file-1';
        const read = () =>
          new Promise<IncomingMessage>((resolve, reject) => {
            get(f.url + path, { signal: AbortSignal.timeout(5000) }, resolve).on('error', reject);
          });
        return { ...f, getDatastream, read, path, requested: requested.promise, completed: completed.promise };
      }
      it('finishes a successful download with its original contents', async function () {
        const f = await setup();
        f.getDatastream.resolves({ readstream: Readable.from(['complete file']) });
        const response = await f.read();
        const chunks: Buffer[] = [];
        for await (const chunk of response) chunks.push(Buffer.from(chunk));
        assert.equal(response.statusCode, 200);
        assert.equal(Buffer.concat(chunks).toString(), 'complete file');
        assert.equal((await f.completed).writableFinished, true);
        sinon.assert.calledOnceWithExactly(f.getDatastream, 'oid-1', 'file-1', { username: 'alice' });
      });
      it('destroys the source when the client disconnects during a download', async function () {
        const f = await setup();
        const source = new PassThrough();
        f.getDatastream.resolves({ readstream: source });
        source.write('partial file');
        const closed = new Promise<void>(resolve => source.once('close', resolve));
        const response = await f.read();
        response.once('data', () => response.destroy());
        response.resume();
        await closed;
        assert.equal(source.destroyed, true);
        const serverResponse = await f.completed;
        assert.equal(serverResponse.writableFinished, false);
        assert.equal(serverResponse.statusCode, 200);
      });
      it('destroys a stream returned after the client has already disconnected', async function () {
        const f = await setup();
        const source = new PassThrough();
        const result = Promise.withResolvers<{ readstream: PassThrough }>();
        const entered = Promise.withResolvers<void>();
        f.getDatastream.callsFake(() => {
          entered.resolve();
          return result.promise;
        });
        const client = get(f.url + f.path);
        client.on('error', () => {});
        await entered.promise;
        client.destroy();
        const serverResponse = await f.completed;
        const closed = new Promise<void>(resolve => source.once('close', resolve));
        result.resolve({ readstream: source });
        await closed;
        assert.equal(source.destroyed, true);
        assert.equal(serverResponse.writableFinished, false);
      });
      it('closes the response on a source error without sending a second response', async function () {
        const f = await setup();
        const source = new PassThrough();
        f.getDatastream.resolves({ readstream: source });
        source.write('partial file');
        const response = await f.read();
        const responseClosed = new Promise<void>(resolve => response.once('close', resolve));
        response.on('error', () => {});
        response.once('data', () => source.destroy(new Error('storage read failed')));
        response.resume();
        await responseClosed;
        assert.equal(source.destroyed, true);
        assert.equal(response.complete, false);
        assert.equal((await f.completed).writableFinished, false);
        assert.equal(response.statusCode, 200);
      });
      it('releases the storage HTTP connection for the next request after cancellation', async function () {
        const agent = new Agent({ keepAlive: true, maxSockets: 1 });
        let storageRequests = 0;
        const storage = createServer((_req, res) => {
          storageRequests++;
          if (storageRequests > 1) {
            res.end('next file');
            return;
          }
          res.write(Buffer.alloc(64 * 1024));
          const timer = setInterval(() => res.write(Buffer.alloc(64 * 1024)), 10);
          res.once('close', () => clearInterval(timer));
        });
        storage.listen(0, '127.0.0.1');
        await once(storage, 'listening');
        const address = storage.address();
        assert.ok(address && typeof address !== 'string');
        const read = () =>
          new Promise<IncomingMessage>((resolve, reject) => {
            get({ host: '127.0.0.1', port: address.port, agent, signal: AbortSignal.timeout(2000) }, resolve).on(
              'error',
              reject
            );
          });
        try {
          const f = await setup();
          const firstSource = Promise.withResolvers<IncomingMessage>();
          f.getDatastream.callsFake(async () => {
            const readstream = await read();
            firstSource.resolve(readstream);
            return { readstream };
          });
          const response = await f.read();
          const source = await firstSource.promise;
          const sourceClosed = new Promise<void>(resolve => source.once('close', resolve));
          response.once('data', () => response.destroy());
          response.resume();
          await f.completed;
          await sourceClosed;
          const next = await read();
          next.resume();
          await once(next, 'end');
          assert.equal(Object.values(agent.requests).flat().length, 0);
          assert.equal(source.destroyed, true);
        } finally {
          agent.destroy();
          storage.closeAllConnections();
          await new Promise<void>(resolve => storage.close(() => resolve()));
        }
      });
    });
  }
});
