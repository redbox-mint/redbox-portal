import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import * as sinon from 'sinon';
import { Server, Upload, ERRORS, StreamLimiter } from '@tus/server';

const testRequire = createRequire(__filename);
const { TusStorageManagerDataStore } = testRequire(
  '../../src/storage/TusStorageManagerDataStore'
) as typeof import('../../src/storage/TusStorageManagerDataStore');
const { createSinonStubLogger } = testRequire('../logger.test') as typeof import('../logger.test');

let expect: Chai.ExpectStatic;

type MemoryObject = {
  data: Buffer;
  lastModified: Date;
};

class MemoryDisk {
  private readonly objects = new Map<string, MemoryObject>();

  public async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  public async get(key: string): Promise<string> {
    return this.getBytesBuffer(key).toString('utf8');
  }

  public async getStream(key: string): Promise<Readable> {
    return Readable.from([this.getBytesBuffer(key)]);
  }

  public async getBytes(key: string): Promise<Uint8Array> {
    return new Uint8Array(this.getBytesBuffer(key));
  }

  public async getMetaData(
    key: string
  ): Promise<{ contentType?: string; contentLength: number; etag: string; lastModified: Date }> {
    const object = this.requireObject(key);
    return {
      contentLength: object.data.length,
      etag: `etag-${key}`,
      lastModified: object.lastModified,
    };
  }

  public async put(key: string, contents: string | Uint8Array): Promise<void> {
    this.objects.set(key, {
      data: typeof contents === 'string' ? Buffer.from(contents) : Buffer.from(contents),
      lastModified: new Date(),
    });
  }

  public async putStream(key: string, contents: Readable): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of contents) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    await this.put(key, Buffer.concat(chunks));
  }

  public async copy(source: string, destination: string): Promise<void> {
    await this.put(destination, this.getBytesBuffer(source));
  }

  public async copyFromFs(_source: string | URL, _destination: string): Promise<void> {
    throw new Error('not implemented');
  }

  public async move(source: string, destination: string): Promise<void> {
    await this.copy(source, destination);
    await this.delete(source);
  }

  public async moveFromFs(_source: string | URL, _destination: string): Promise<void> {
    throw new Error('not implemented');
  }

  public async delete(key: string): Promise<void> {
    if (!this.objects.delete(key)) {
      const error = new Error(`missing ${key}`) as Error & { code: string };
      error.code = 'ENOENT';
      throw error;
    }
  }

  public async deleteAll(prefix = ''): Promise<void> {
    for (const key of Array.from(this.objects.keys())) {
      if (!prefix || key.startsWith(prefix)) {
        this.objects.delete(key);
      }
    }
  }

  public async listAll(prefix = ''): Promise<{ paginationToken?: string; objects: Iterable<unknown> }> {
    const objects = Array.from(this.objects.entries())
      .filter(([key]) => key.startsWith(prefix))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, name: key.split('/').pop(), lastModified: value.lastModified }));
    return { objects };
  }

  public has(key: string): boolean {
    return this.objects.has(key);
  }

  public bytes(key: string): Buffer {
    return this.getBytesBuffer(key);
  }

  private requireObject(key: string): MemoryObject {
    const object = this.objects.get(key);
    if (!object) {
      const error = new Error(`missing ${key}`) as Error & { code: string };
      error.code = 'ENOENT';
      throw error;
    }
    return object;
  }

  private getBytesBuffer(key: string): Buffer {
    return Buffer.from(this.requireObject(key).data);
  }
}

describe('TusStorageManagerDataStore', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  afterEach(function () {
    sinon.restore();
  });

  function createStore(overrides: Record<string, unknown> = {}) {
    const disk = new MemoryDisk();
    const logger = createSinonStubLogger(sinon);
    const store = new TusStorageManagerDataStore({
      disk,
      logger,
      ...overrides,
    });
    return { store, disk, logger };
  }

  function createUpload(id = 'file-123', size?: number) {
    return new Upload({
      id,
      size,
      offset: 0,
      metadata: { filename: 'ZmlsZS50eHQ=' },
    });
  }

  it('rejects invalid limits instead of disabling upload bounds', function () {
    for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createStore({ maxSize: value })).to.throw('positive safe integers');
      expect(() => createStore({ maxChunkSize: value })).to.throw('positive safe integers');
    }
  });

  for (const size of [undefined, 100]) {
    it(`stops an oversized ${size === undefined ? 'deferred' : 'fixed'} PATCH before consuming the whole body`, async function () {
      const { store, disk } = createStore({ maxSize: 100, maxChunkSize: 8 });
      await store.create(createUpload('bounded', size));
      let produced = 0;
      const body = Readable.from((async function* () {
        for (let index = 0; index < 100; index += 1) {
          produced += 1;
          yield Buffer.alloc(1);
        }
      })(), { highWaterMark: 1 });

      let failure: unknown;
      try {
        await store.write(body, 'bounded', 0);
      } catch (error) {
        failure = error;
      }

      expect(failure).to.equal(ERRORS.ERR_MAX_SIZE_EXCEEDED);
      expect(produced).to.be.lessThan(100);
      expect((await store.getUpload('bounded')).offset).to.equal(0);
      expect(Array.from((await disk.listAll('.tus/bounded/parts/')).objects)).to.have.length(0);
      expect(await store.write(Readable.from([Buffer.from('ok')]), 'bounded', 0)).to.equal(2);
    });
  }

  it('enforces the cumulative limit on deferred uploads and rejects oversized declarations', async function () {
    const { store } = createStore({ maxSize: 5 });
    await store.create(createUpload('deferred-limit'));
    await store.write(Readable.from([Buffer.from('1234')]), 'deferred-limit', 0);

    for (const operation of [
      () => store.create(createUpload('too-large', 6)),
      () => store.declareUploadLength('deferred-limit', 6),
      () => store.write(Readable.from([Buffer.from('56')]), 'deferred-limit', 4),
    ]) {
      let failure: unknown;
      try {
        await operation();
      } catch (error) {
        failure = error;
      }
      expect(failure).to.equal(ERRORS.ERR_MAX_SIZE_EXCEEDED);
    }

    expect((await store.getUpload('deferred-limit')).offset).to.equal(4);
    await store.declareUploadLength('deferred-limit', 5);
    expect(await store.write(Readable.from([Buffer.from('5')]), 'deferred-limit', 4)).to.equal(5);
  });

  it('bounds part buffers and applies storage backpressure before reading the rest of a PATCH', async function () {
    const partSize = 8 * 1024 * 1024;
    const { store, disk } = createStore();
    await store.create(createUpload('streamed', partSize * 2));
    let produced = 0;
    const body = Readable.from((async function* () {
      for (let index = 0; index < 256; index += 1) {
        produced += 1;
        yield Buffer.alloc(64 * 1024, index);
      }
    })(), { highWaterMark: 1 });
    const originalPut = disk.put.bind(disk);
    const put = sinon.stub(disk, 'put').callsFake(async (key, contents) => {
      if (key.includes('/parts/')) {
        expect(contents.length).to.be.at.most(partSize);
        const before = produced;
        await new Promise<void>(resolve => setImmediate(resolve));
        // At most one source chunk may be prefetched while the disk is busy.
        expect(produced - before).to.be.at.most(1);
        if (key.endsWith('00000000000000000000')) {
          expect(produced).to.be.lessThan(256);
        }
      }
      await originalPut(key, contents);
    });

    expect(await store.write(body, 'streamed', 0)).to.equal(partSize * 2);
    expect(put.getCalls().filter(call => call.args[0].includes('/parts/'))).to.have.length(2);
    const bytes = disk.bytes('streamed');
    expect(bytes.length).to.equal(partSize * 2);
    for (let index = 0; index < 256; index += 1) {
      expect(bytes.subarray(index * 64 * 1024, (index + 1) * 64 * 1024)
        .equals(Buffer.alloc(64 * 1024, index))).to.equal(true);
    }
  });

  it('returns TUS 413 for oversized creation, PATCH and creation-with-upload while bounded uploads finish', async function () {
    const { store, disk } = createStore({ maxSize: 10, maxChunkSize: 4 });
    const server = new Server({ path: '/attach', datastore: store, maxSize: 10 });
    const request = (method: string, path: string, headers: Record<string, string>, body?: string) =>
      server.handleWeb(new Request(`http://localhost/attach${path}`, {
        method, headers: { 'Tus-Resumable': '1.0.0', ...headers }, body,
      }));

    expect((await request('POST', '', { 'Upload-Length': '11' })).status).to.equal(413);
    const creationHeaders: Record<string, string>[] = [{ 'Upload-Length': '10' }, { 'Upload-Defer-Length': '1' }];
    for (const headers of creationHeaders) {
      const created = await request('POST', '', headers);
      expect(created.status).to.equal(201);
      const location = new URL(created.headers.get('Location')!);
      const path = location.pathname.slice('/attach'.length);
      const id = path.slice(1);
      const patchHeaders = { 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' };
      expect((await request('PATCH', path, patchHeaders, '12345')).status).to.equal(413);
      expect((await store.getUpload(id)).offset).to.equal(0);
      expect((await request('PATCH', path, patchHeaders, '1234')).status).to.equal(204);
      const finishHeaders = { ...patchHeaders, 'Upload-Offset': '4',
        ...(headers['Upload-Defer-Length'] ? { 'Upload-Length': '8' } : {}) };
      expect((await request('PATCH', path, finishHeaders, '5678')).status).to.equal(204);
      if (headers['Upload-Defer-Length']) {
        expect(disk.bytes(id).toString()).to.equal('12345678');
      } else {
        expect((await request('PATCH', path, { ...patchHeaders, 'Upload-Offset': '8' }, '90')).status).to.equal(204);
        expect(disk.bytes(id).toString()).to.equal('1234567890');
      }
    }
    expect((await request('POST', '', { 'Upload-Defer-Length': '1',
      'Content-Type': 'application/offset+octet-stream' }, '12345')).status).to.equal(413);
  });

  it('preserves TUS 413 when the dependency detects fixed or deferred overflow without Content-Length', async function () {
    const { store } = createStore({ maxSize: 5 });
    const server = new Server({ path: '/attach', datastore: store, maxSize: 5 });
    for (const size of [undefined, 4]) {
      const uploadId = size === undefined ? 'deferred-overflow' : 'fixed-overflow';
      await store.create(createUpload(uploadId, size));
      const response = await server.handleWeb(new Request(`http://localhost/attach/${uploadId}`, {
        method: 'PATCH',
        headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0',
          'Content-Type': 'application/offset+octet-stream' },
        body: '123456',
      }));
      expect(response.status).to.equal(413);
      expect((await store.getUpload(uploadId)).offset).to.equal(0);
    }
  });

  it('preserves input stream errors, including the TUS limiter error', async function () {
    const limiterError = await new Promise<Error>(resolve => {
      const limiter = new StreamLimiter(1);
      limiter.once('error', resolve);
      limiter.end(Buffer.alloc(2));
    });
    for (const inputError of [limiterError, new Error('source interrupted')]) {
      const { store } = createStore();
      await store.create(createUpload('input-error'));
      const body = Readable.from((async function* () {
        yield Buffer.from('partial');
        throw inputError;
      })());
      let failure: unknown;
      try {
        await store.write(body, 'input-error', 0);
      } catch (error) {
        failure = error;
      }
      expect(failure).to.equal(inputError);
      expect((await store.getUpload('input-error')).offset).to.equal(0);
    }
  });

  it('counts multibyte strings in bytes and accepts fragmented bounded input', async function () {
    const { store, disk } = createStore({ maxSize: 6, maxChunkSize: 3 });
    await store.create(createUpload('utf8', 6));
    let failure: unknown;
    try {
      await store.write(Readable.from(['€€']), 'utf8', 0);
    } catch (error) {
      failure = error;
    }
    expect(failure).to.equal(ERRORS.ERR_MAX_SIZE_EXCEEDED);
    expect(await store.write(Readable.from(['€']), 'utf8', 0)).to.equal(3);
    expect(await store.write(Readable.from([new Uint8Array([1]), Buffer.from([2]), Buffer.from([3])]), 'utf8', 3)).to.equal(6);
    expect(disk.bytes('utf8')).to.deep.equal(Buffer.concat([Buffer.from('€'), Buffer.from([1, 2, 3])]));
  });

  it('rolls back streamed parts after a late limit violation and keeps committed bytes resumable', async function () {
    const partSize = 8 * 1024 * 1024;
    const { store, disk } = createStore({ maxSize: partSize * 2, maxChunkSize: partSize + 1 });
    await store.create(createUpload('rollback'));
    await store.write(Readable.from([Buffer.from('ok')]), 'rollback', 0);
    let failure: unknown;
    try {
      await store.write(Readable.from([Buffer.alloc(partSize), Buffer.from('XX')]), 'rollback', 2);
    } catch (error) {
      failure = error;
    }
    expect(failure).to.equal(ERRORS.ERR_MAX_SIZE_EXCEEDED);
    expect((await store.getUpload('rollback')).offset).to.equal(2);
    expect(Array.from((await disk.listAll('.tus/rollback/parts/')).objects)).to.have.length(1);
    await store.write(Readable.from([Buffer.from('!')]), 'rollback', 2);
    await store.declareUploadLength('rollback', 3);
    expect(disk.bytes('rollback').toString()).to.equal('ok!');
  });

  it('discards uncommitted compose parts when a retry uses different request boundaries', async function () {
    const partSize = 8 * 1024 * 1024;
    const { store, disk } = createStore();
    const size = partSize + 4;
    await store.create(createUpload('compose-retry', size));
    const originalPutStream = disk.putStream.bind(disk);
    const putStream = sinon.stub(disk, 'putStream');
    putStream.onFirstCall().rejects(new Error('compose failed'));
    putStream.onSecondCall().callsFake(originalPutStream);
    let failure: unknown;
    try {
      await store.write(Readable.from([Buffer.alloc(size, 1)]), 'compose-retry', 0);
    } catch (error) {
      failure = error;
    }
    expect(failure).to.equal(ERRORS.FILE_WRITE_ERROR);
    expect((await store.getUpload('compose-retry')).offset).to.equal(0);
    await store.write(Readable.from([Buffer.from('ok')]), 'compose-retry', 0);
    await store.write(Readable.from([Buffer.alloc(size - 2, 2)]), 'compose-retry', 2);
    expect(disk.bytes('compose-retry')).to.deep.equal(Buffer.concat([Buffer.from('ok'), Buffer.alloc(size - 2, 2)]));
  });

  it('keeps the durable offset incomplete during composition and needs no rollback when metadata is unavailable', async function () {
    const { store, disk } = createStore();
    const id = 'compose-metadata-outage';
    await store.create(createUpload(id, 4));
    await store.write(Readable.from(['ab']), id, 0);
    const infoPut = sinon.stub(disk, 'put').callThrough();
    infoPut.withArgs(`.tus/${id}/info.json`).rejects(new Error('metadata unavailable'));
    const server = new Server({ path: '/attach', datastore: store });
    const compose = sinon.stub(disk, 'putStream').callsFake(async () => {
      const head = await server.handleWeb(new Request(`http://localhost/attach/${id}`, {
        method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' },
      }));
      expect(head.status).to.equal(200);
      expect(head.headers.get('Upload-Offset')).to.equal('2');
      expect(disk.has(id)).to.equal(false);
      throw new Error('compose failed');
    });

    let failure: unknown;
    try {
      await store.write(Readable.from(['cd']), id, 2);
    } catch (error) {
      failure = error;
    }
    expect(failure).to.equal(ERRORS.FILE_WRITE_ERROR);
    expect(infoPut.getCalls().filter(call => call.args[0].endsWith('info.json'))).to.have.length(0);
    expect(JSON.parse(await disk.get(`.tus/${id}/info.json`)).offset).to.equal(2);
    compose.restore();
    infoPut.restore();
    // A new datastore simulates restart; retry with different bytes and boundaries.
    const restarted = new TusStorageManagerDataStore({ disk });
    await restarted.write(Readable.from(['X']), id, 2);
    await restarted.write(Readable.from(['Y']), id, 3);
    expect(disk.bytes(id).toString()).to.equal('abXY');
  });

  for (const complete of [false, true]) {
    for (const committed of [false, true]) {
      it(`retains recoverable bytes when ${complete ? 'final' : 'intermediate'} metadata PUT fails ${committed ? 'after' : 'before'} commit`, async function () {
        const { store, disk } = createStore();
        const id = 'metadata-failure';
        const size = complete ? 4 : 6;
        await store.create(createUpload(id, size));
        await store.write(Readable.from(['ab']), id, 0);
        const originalPut = disk.put.bind(disk);
        const put = sinon.stub(disk, 'put').callsFake(async (key, contents) => {
          if (!key.endsWith('info.json') || committed) {
            await originalPut(key, contents);
          }
          if (key.endsWith('info.json')) {
            throw new Error('lost metadata response');
          }
        });
        let failure: unknown;
        try {
          await store.write(Readable.from(['cd']), id, 2);
        } catch (error) {
          failure = error;
        }
        expect(failure).to.equal(ERRORS.FILE_WRITE_ERROR);
        expect(disk.has(`.tus/${id}/parts/00000000000000000002`)).to.equal(true);
        put.restore();
        const restarted = new TusStorageManagerDataStore({ disk });
        const upload = await restarted.getUpload(id);
        expect(upload.offset).to.equal(committed ? 4 : 2);
        if (upload.offset === size) {
          expect(disk.bytes(id).toString()).to.equal('abcd');
          expect(await restarted.write(Readable.from([]), id, size)).to.equal(size);
        } else {
          await restarted.write(Readable.from([(complete ? 'abcd' : 'abcdef').slice(upload.offset)]), id, upload.offset);
        }
        expect(disk.bytes(id).toString()).to.equal(complete ? 'abcd' : 'abcdef');
      });
    }
  }

  it('keeps completion committed when part cleanup fails after deleting some committed parts', async function () {
    const { store, disk } = createStore();
    const id = 'partial-cleanup';
    await store.create(createUpload(id, 4));
    await store.write(Readable.from(['ab']), id, 0);
    sinon.stub(disk, 'deleteAll').callsFake(async () => {
      await disk.delete(`.tus/${id}/parts/00000000000000000000`);
      throw new Error('cleanup interrupted');
    });
    expect(await store.write(Readable.from(['cd']), id, 2)).to.equal(4);
    expect((await store.getUpload(id)).offset).to.equal(4);
    expect(disk.bytes(id).toString()).to.equal('abcd');
    expect(await store.write(Readable.from([]), id, 4)).to.equal(4);
    await store.declareUploadLength(id, 4);
    expect(disk.bytes(id).toString()).to.equal('abcd');
  });

  it('does not publish a completing deferred length if composition fails', async function () {
    const { store, disk } = createStore();
    const id = 'declaration-failure';
    await store.create(createUpload(id));
    await store.write(Readable.from(['ab']), id, 0);
    const compose = sinon.stub(disk, 'putStream').rejects(new Error('compose failed'));
    let failure: unknown;
    try {
      await store.declareUploadLength(id, 2);
    } catch (error) {
      failure = error;
    }
    expect(failure).to.equal(ERRORS.FILE_WRITE_ERROR);
    expect((await store.getUpload(id)).size).to.equal(undefined);
    expect((await store.getUpload(id)).offset).to.equal(2);
    compose.restore();
    await store.declareUploadLength(id, 2);
    expect(disk.bytes(id).toString()).to.equal('ab');
  });

  it('serializes length declaration behind an in-flight write', async function () {
    const { store, disk } = createStore();
    const id = 'declaration-locked';
    await store.create(createUpload(id));
    let started!: () => void;
    let release!: () => void;
    const writing = new Promise<void>(resolve => { started = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const originalPut = disk.put.bind(disk);
    sinon.stub(disk, 'put').callsFake(async (key, contents) => {
      if (key.includes('/parts/')) {
        started();
        await released;
      }
      await originalPut(key, contents);
    });
    const write = store.write(Readable.from(['ab']), id, 0);
    await writing;
    const declaration = store.declareUploadLength(id, 2);
    release();
    await write;
    await declaration;
    expect((await store.getUpload(id)).offset).to.equal(2);
    expect(disk.bytes(id).toString()).to.equal('ab');
  });

  it('bounds stale-part deletion concurrency and preserves the committed prefix', async function () {
    const { store, disk } = createStore();
    const id = 'bounded-cleanup';
    await store.create(createUpload(id, 2));
    await store.write(Readable.from(['a']), id, 0);
    for (let offset = 1; offset <= 19; offset += 1) {
      await disk.put(`.tus/${id}/parts/${String(offset).padStart(20, '0')}`, '!');
    }
    const originalDelete = disk.delete.bind(disk);
    let active = 0;
    let peak = 0;
    sinon.stub(disk, 'delete').callsFake(async key => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>(resolve => setImmediate(resolve));
      await originalDelete(key);
      active -= 1;
    });
    await store.write(Readable.from(['b']), id, 1);
    expect(peak).to.equal(8);
    expect(active).to.equal(0);
    expect(disk.bytes(id).toString()).to.equal('ab');
  });

  it('waits for the entire stale deletion batch before a failed request releases its lock', async function () {
    const { store, disk } = createStore();
    const id = 'failed-cleanup-batch';
    await store.create(createUpload(id, 20));
    for (let offset = 0; offset < 8; offset += 1) {
      await disk.put(`.tus/${id}/parts/${String(offset).padStart(20, '0')}`, '!');
    }
    let active = 0;
    let completed = 0;
    const originalDelete = disk.delete.bind(disk);
    const deletion = sinon.stub(disk, 'delete').callsFake(async key => {
      active += 1;
      try {
        if (key.endsWith('00000000000000000000')) throw new Error('delete failed');
        await new Promise<void>(resolve => setImmediate(resolve));
        await originalDelete(key);
      } finally {
        active -= 1;
        completed += 1;
      }
    });
    let failure: unknown;
    try { await store.write(Readable.from(['ok']), id, 0); } catch (error) { failure = error; }
    expect(failure).to.be.instanceOf(Error);
    expect(active).to.equal(0);
    expect(completed).to.equal(8);
    expect((await store.getUpload(id)).offset).to.equal(0);
    deletion.restore();
    await store.write(Readable.from(['ok']), id, 0);
    await store.declareUploadLength(id, 2);
    expect(disk.bytes(id).toString()).to.equal('ok');
  });

  it('preserves the prior offset after a part source fails during final composition', async function () {
    const { store, disk } = createStore();
    const id = 'part-read-failure';
    await store.create(createUpload(id, 4));
    await store.write(Readable.from(['ab']), id, 0);
    const read = sinon.stub(disk, 'getStream').callsFake(async () => Readable.from((async function* () {
      yield Buffer.from('a');
      throw new Error('part read interrupted');
    })()));
    let failure: unknown;
    try { await store.write(Readable.from(['cd']), id, 2); } catch (error) { failure = error; }
    expect(failure).to.equal(ERRORS.FILE_WRITE_ERROR);
    expect((await store.getUpload(id)).offset).to.equal(2);
    expect(disk.has(id)).to.equal(false);
    read.restore();
    await store.write(Readable.from(['XY']), id, 2);
    expect(disk.bytes(id).toString()).to.equal('abXY');
  });

  it('completes an empty upload without allocating or storing a part', async function () {
    const { store, disk } = createStore();
    await store.create(createUpload('empty', 0));
    expect(disk.has('empty')).to.equal(true);
    expect(await store.write(Readable.from([]), 'empty', 0)).to.equal(0);
    expect(disk.bytes('empty').length).to.equal(0);
    expect(Array.from((await disk.listAll('.tus/empty/parts/')).objects)).to.have.length(0);
  });

  it('creates upload metadata and returns a storage-manager upload', async function () {
    const { store, disk } = createStore();
    const upload = createUpload('file-1', 4);

    const created = await store.create(upload);

    expect(created.storage).to.deep.equal({ type: 'storage-manager', path: 'file-1' });
    expect(disk.has('.tus/file-1/info.json')).to.equal(true);
  });

  it('writes parts without materializing incomplete uploads and updates the resumable offset', async function () {
    const { store, disk } = createStore();
    await store.create(createUpload('file-2', 10));

    const offset = await store.write(Readable.from([Buffer.from('hello')]), 'file-2', 0);
    const upload = await store.getUpload('file-2');

    expect(offset).to.equal(5);
    expect(upload.offset).to.equal(5);
    expect(upload.storage).to.deep.equal({ type: 'storage-manager', path: '.tus/file-2/parts/' });
    expect(disk.has('file-2')).to.equal(false);
    expect(disk.has('.tus/file-2/parts/00000000000000000000')).to.equal(true);
  });

  it('returns the current offset when resuming an upload', async function () {
    const { store } = createStore();
    await store.create(createUpload('file-3', 11));
    await store.write(Readable.from([Buffer.from('hello')]), 'file-3', 0);

    const upload = await store.getUpload('file-3');

    expect(upload.offset).to.equal(5);
  });

  it('supports deferred upload length declaration', async function () {
    const { store } = createStore();
    await store.create(createUpload('file-4'));

    await store.declareUploadLength('file-4', 3);
    const upload = await store.getUpload('file-4');

    expect(upload.size).to.equal(3);
  });

  it('materializes deferred-length uploads once the declared length matches the written bytes', async function () {
    const { store, disk } = createStore();
    await store.create(createUpload('file-4-complete'));

    await store.write(Readable.from([Buffer.from('hey')]), 'file-4-complete', 0);
    await store.declareUploadLength('file-4-complete', 3);

    expect(disk.bytes('file-4-complete').toString('utf8')).to.equal('hey');
    expect(disk.has('.tus/file-4-complete/parts/00000000000000000000')).to.equal(false);
  });

  it('serializes concurrent writes for the same upload id', async function () {
    const { store, disk } = createStore();
    const uploadId = 'file-4-locked';
    const uploadPartKey = `.tus/${uploadId}/parts/00000000000000000000`;
    await store.create(createUpload(uploadId, 10));

    const originalPut = disk.put.bind(disk);
    let markFirstPartWriteStarted: (() => void) | undefined;
    let releaseFirstPartWrite: (() => void) | undefined;
    const firstPartWriteStarted = new Promise<void>(resolve => {
      markFirstPartWriteStarted = resolve;
    });
    const allowFirstPartWriteToContinue = new Promise<void>(resolve => {
      releaseFirstPartWrite = resolve;
    });
    let firstPartWritePending = true;

    sinon.stub(disk, 'put').callsFake(async (key: string, contents: string | Uint8Array) => {
      if (key === uploadPartKey && firstPartWritePending) {
        firstPartWritePending = false;
        markFirstPartWriteStarted?.();
        await allowFirstPartWriteToContinue;
      }
      return originalPut(key, contents);
    });

    const firstWrite = store.write(Readable.from([Buffer.from('hello')]), uploadId, 0);
    await firstPartWriteStarted;
    const secondWrite = store.write(Readable.from([Buffer.from('world')]), uploadId, 0);

    releaseFirstPartWrite?.();

    expect(await firstWrite).to.equal(5);
    try {
      await secondWrite;
      expect.fail('Expected second write to fail');
    } catch (error) {
      expect(error).to.equal(ERRORS.INVALID_OFFSET);
    }

    const upload = await store.getUpload(uploadId);
    expect(upload.offset).to.equal(5);
    expect(disk.bytes(uploadPartKey).toString('utf8')).to.equal('hello');
  });

  it('composes a finished upload to the final staging key and cleans up parts', async function () {
    const { store, disk } = createStore();
    await store.create(createUpload('file-5', 11));

    await store.write(Readable.from([Buffer.from('hello ')]), 'file-5', 0);
    const offset = await store.write(Readable.from([Buffer.from('world')]), 'file-5', 6);

    expect(offset).to.equal(11);
    expect(disk.bytes('file-5').toString('utf8')).to.equal('hello world');
    expect(disk.has('.tus/file-5/parts/00000000000000000000')).to.equal(false);
    expect(disk.has('.tus/file-5/parts/00000000000000000006')).to.equal(false);
  });

  it('opens one part stream at a time while composing the final upload', async function () {
    const { store, disk } = createStore();
    await store.create(createUpload('file-5-streams', 11));
    await store.write(Readable.from([Buffer.from('hello ')]), 'file-5-streams', 0);

    const originalGetStream = disk.getStream.bind(disk);
    let openStreams = 0;
    sinon.stub(disk, 'getStream').callsFake(async (key: string) => {
      openStreams += 1;
      expect(openStreams).to.equal(1);

      const source = await originalGetStream(key);
      return Readable.from(
        (async function* () {
          try {
            for await (const chunk of source) {
              yield chunk;
            }
          } finally {
            openStreams -= 1;
          }
        })()
      );
    });

    await store.write(Readable.from([Buffer.from('world')]), 'file-5-streams', 6);

    expect(disk.bytes('file-5-streams').toString('utf8')).to.equal('hello world');
  });

  it('cleans up expired incomplete uploads', async function () {
    const { store, disk } = createStore({ expirationPeriodInMilliseconds: 10 });
    const upload = createUpload('file-6', 100);
    upload.creation_date = new Date(Date.now() - 1000).toISOString();
    await store.create(upload);

    const deleted = await store.deleteExpired();

    expect(deleted).to.equal(1);
    expect(disk.has('.tus/file-6/info.json')).to.equal(false);
  });

  it('treats uploads without a creation date as expired and logs a warning', async function () {
    const { store, disk, logger } = createStore({ expirationPeriodInMilliseconds: 10 });
    const upload = createUpload('file-6-missing-date', 100);
    delete (upload as { creation_date?: string }).creation_date;
    await store.create(upload);

    const deleted = await store.deleteExpired();

    expect(deleted).to.equal(1);
    expect(disk.has('.tus/file-6-missing-date/info.json')).to.equal(false);
    expect(logger.warn.calledOnce).to.equal(true);
    expect(String(logger.warn.firstCall.args[0])).to.contain('missing creation_date');
  });

  it('preserves staged parts when final compose fails', async function () {
    const { store, disk } = createStore();
    await store.create(createUpload('file-7', 5));
    const putStreamStub = sinon.stub(disk, 'putStream').rejects(new Error('compose failed'));

    try {
      await store.write(Readable.from([Buffer.from('hello')]), 'file-7', 0);
      expect.fail('Expected write to fail');
    } catch (error) {
      expect(error).to.equal(ERRORS.FILE_WRITE_ERROR);
    }

    expect(putStreamStub.calledOnce).to.equal(true);
    expect(disk.has('.tus/file-7/parts/00000000000000000000')).to.equal(true);
    expect(disk.has('file-7')).to.equal(false);
  });

  it('removes upload metadata, parts, and final object', async function () {
    const { store, disk } = createStore();
    await store.create(createUpload('file-8', 4));
    await store.write(Readable.from([Buffer.from('test')]), 'file-8', 0);

    await store.remove('file-8');

    expect(disk.has('.tus/file-8/info.json')).to.equal(false);
    expect(disk.has('file-8')).to.equal(false);
  });

  it('throws FILE_NOT_FOUND for a missing upload', async function () {
    const { store } = createStore();

    try {
      await store.getUpload('missing');
      expect.fail('Expected getUpload to fail');
    } catch (error) {
      expect(error).to.equal(ERRORS.FILE_NOT_FOUND);
    }
  });

  it('maps backend-specific not-found errors to FILE_NOT_FOUND', async function () {
    const notFoundErrors = [
      Object.assign(new Error('No such key'), { code: 'NoSuchKey' }),
      Object.assign(new Error('object not found'), { statusCode: 404 }),
      Object.assign(new Error('backend object does not exist'), { name: 'NotFoundError' }),
    ];

    for (const backendError of notFoundErrors) {
      const { store, disk } = createStore();
      sinon.stub(disk, 'get').rejects(backendError);

      try {
        await store.getUpload('missing');
        expect.fail('Expected getUpload to fail');
      } catch (error) {
        expect(error).to.equal(ERRORS.FILE_NOT_FOUND);
      }
    }
  });
});
