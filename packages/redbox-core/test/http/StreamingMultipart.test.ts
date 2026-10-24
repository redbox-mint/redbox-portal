import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm, unlink, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { StreamingMultipart, MultipartError } from '../../src/http/express/multipart';

describe('owned streaming multipart with real HTTP and disk', function () {
  this.timeout(10000);
  let directory: string, uploads: StreamingMultipart, url: string;
  let server: ReturnType<typeof createServer>;
  let failWrite = false,
    failCleanup = false;
  let pauseStaging: Promise<void> | undefined;
  let stagingEntered: (() => void) | undefined;
  let settleWrite: Promise<void> | undefined;
  let writeSettling: (() => void) | undefined;
  let receivedBytes = 0;
  let limits: { files: number; fileSize: number; fields: number; fieldSize: number };
  let finalize: (result: {
    fields: Record<string, string>;
    files: { key: string; size: number; filename: string }[];
  }) => Promise<unknown>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sr-streaming-'));
    limits = { files: 2, fileSize: 128 * 1024, fields: 2, fieldSize: 64 };
    receivedBytes = 0;
    uploads = new StreamingMultipart(
      {
        putStream: async (key, stream) => {
          stagingEntered?.();
          await pauseStaging;
          try {
            await pipeline(stream, createWriteStream(join(directory, key)));
          } finally {
            writeSettling?.();
            await settleWrite;
          }
          if (failWrite) throw new Error('Unknown persisted outcome');
        },
        delete: async key => {
          if (failCleanup) throw new Error('Delete unavailable');
          await unlink(join(directory, key));
        },
        exists: async key => {
          try {
            await access(join(directory, key));
            return true;
          } catch {
            return false;
          }
        },
      },
      limits
    );
    finalize = async result => ({
      ...result,
      bytes: await Promise.all(result.files.map(f => readFile(join(directory, f.key), 'utf8'))),
    });
    server = createServer((req, res) => {
      req.on('data', chunk => {
        receivedBytes += chunk.length;
      });
      void uploads.receive(req, finalize).then(
        result => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        },
        error => {
          res.statusCode = error instanceof MultipartError ? error.status : 500;
          res.end(JSON.stringify({ message: error.message }));
        }
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address === 'object');
    url = 'http://127.0.0.1:' + address.port;
  });
  afterEach(async () => {
    failWrite = false;
    failCleanup = false;
    pauseStaging = undefined;
    stagingEntered = undefined;
    settleWrite = undefined;
    writeSettling = undefined;
    await uploads.close();
    await new Promise<void>((resolve, reject) => server.close(e => (e ? reject(e) : resolve())));
    await rm(directory, { recursive: true, force: true });
  });
  function form(bytes = 'contents') {
    const data = new FormData();
    data.append('first', 'before');
    data.append('file', new Blob([bytes]), 'test.txt');
    data.append('last', 'after');
    return data;
  }
  it('streams files and fields in either order and cleans staging after finalization', async () => {
    const result = await fetch(url, { method: 'POST', body: form() });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.deepEqual(body.fields, { first: 'before', last: 'after' });
    assert.deepEqual(body.bytes, ['contents']);
    assert.equal(body.files[0].size, 8);
    assert.deepEqual(await readdir(directory), []);
  });
  it('rejects missing boundaries, field, file count and byte limits', async () => {
    assert.equal(
      (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'bad' })).status,
      400
    );
    const bigField = new FormData();
    bigField.append('large', 'x'.repeat(100));
    assert.equal((await fetch(url, { method: 'POST', body: bigField })).status, 413);
    assert.equal((await fetch(url, { method: 'POST', body: form('x'.repeat(128 * 1024 + 1)) })).status, 413);
    const many = new FormData();
    for (let n = 0; n < 3; n++) many.append('file', new Blob(['x']), 'f' + n);
    assert.equal((await fetch(url, { method: 'POST', body: many })).status, 413);
    assert.deepEqual(await readdir(directory), []);
  });
  it('backpressures the HTTP input while the staging disk is stalled', async () => {
    limits.fileSize = 4 * 1024 * 1024;
    const bytes = 'x'.repeat(2 * 1024 * 1024);
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    pauseStaging = release.promise;
    stagingEntered = entered.resolve;
    const pending = fetch(url, { method: 'POST', body: form(bytes) });
    try {
      await entered.promise;
      await new Promise(resolve => setTimeout(resolve, 30));
      assert(receivedBytes < bytes.length, 'Parser must stop consuming input rather than buffer the full upload');
    } finally {
      release.resolve();
    }
    const response = await pending;
    assert.equal(response.status, 200);
    assert.equal((await response.json()).files[0].size, bytes.length);
    assert.deepEqual(await readdir(directory), []);
  });
  it('rejects repeated fields and cleans partial or unknown storage outcomes', async () => {
    const duplicate = new FormData();
    duplicate.append('same', 'a');
    duplicate.append('same', 'b');
    assert.equal((await fetch(url, { method: 'POST', body: duplicate })).status, 400);
    failWrite = true;
    assert.equal((await fetch(url, { method: 'POST', body: form() })).status, 500);
    assert.deepEqual(await readdir(directory), []);
    failWrite = false;
    finalize = async () => {
      throw new Error('Finalization failed');
    };
    assert.equal((await fetch(url, { method: 'POST', body: form() })).status, 500);
    assert.deepEqual(await readdir(directory), []);
  });
  it('retains failed cleanup for an observable close failure and successful retry', async () => {
    failCleanup = true;
    assert.equal((await fetch(url, { method: 'POST', body: form() })).status, 500);
    assert.equal((await readdir(directory)).length, 1);
    await assert.rejects(uploads.close(), /Delete unavailable/);
    failCleanup = false;
    await uploads.close();
    assert.deepEqual(await readdir(directory), []);
  });
  it('waits for admitted finalization while refusing new uploads during shutdown', async () => {
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    finalize = async () => {
      entered.resolve();
      await release.promise;
      return { done: true };
    };
    const pending = fetch(url, { method: 'POST', body: form() });
    await entered.promise;
    let drained = false;
    const drain = uploads.close().then(() => {
      drained = true;
    });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(drained, false);
    assert.equal((await fetch(url, { method: 'POST', body: form() })).status, 503);
    release.resolve();
    assert.equal((await pending).status, 200);
    await drain;
    assert.deepEqual(await readdir(directory), []);
  });
  it('cleans cancelled streams before draining and never finalizes them', async () => {
    let finalized = false;
    finalize = async () => {
      finalized = true;
    };
    const boundary = 'owned-abort';
    const req = httpRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    });
    req.on('error', () => {});
    req.write(
      '--' +
        boundary +
        '\r\nContent-Disposition: form-data; name="file"; filename="f"\r\nContent-Type: application/octet-stream\r\n\r\n' +
        'x'.repeat(32000)
    );
    await new Promise(resolve => setTimeout(resolve, 30));
    req.destroy();
    await new Promise(resolve => setTimeout(resolve, 30));
    await uploads.drain();
    assert.equal(finalized, false);
    assert.deepEqual(await readdir(directory), []);
  });
  for (const failure of ['abort', 'limit'] as const) {
    it(`joins the actual disk write after ${failure} before cleanup and drain`, async () => {
      const entered = Promise.withResolvers<void>(),
        release = Promise.withResolvers<void>();
      settleWrite = release.promise;
      writeSettling = entered.resolve;
      let finalized = false;
      finalize = async () => {
        finalized = true;
      };
      const boundary = 'owned-delayed-write';
      const req = httpRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
      });
      req.on('error', () => {});
      const started = Promise.withResolvers<void>();
      stagingEntered = started.resolve;
      req.write(
        '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="f"\r\n\r\n' + 'x'.repeat(32000)
      );
      await started.promise;
      if (failure === 'abort') req.destroy();
      else req.end('x'.repeat(limits.fileSize) + '\r\n--' + boundary + '--\r\n');
      try {
        await entered.promise;
        let drained = false;
        const drain = uploads.close().then(() => {
          drained = true;
        });
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(drained, false, 'Drain must retain the provider write after parser/pipeline failure');
        assert.equal(finalized, false);
        release.resolve();
        await drain;
        assert.deepEqual(await readdir(directory), []);
      } finally {
        release.resolve();
        req.destroy();
      }
    });
  }
});
