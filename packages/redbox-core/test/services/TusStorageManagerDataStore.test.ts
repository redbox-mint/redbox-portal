import { Readable } from 'node:stream';
import * as sinon from 'sinon';
import { Upload, ERRORS } from '@tus/server';
import { TusStorageManagerDataStore } from '../../src/storage/TusStorageManagerDataStore';

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

  public async getMetaData(key: string): Promise<{ contentType?: string; contentLength: number; etag: string; lastModified: Date; }> {
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

  public async listAll(prefix = ''): Promise<{ paginationToken?: string; objects: Iterable<unknown>; }> {
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
    const logger = {
      verbose: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
    };
    const store = new TusStorageManagerDataStore({
      disk: disk as any,
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
    const firstPartWriteStarted = new Promise<void>((resolve) => {
      markFirstPartWriteStarted = resolve;
    });
    const allowFirstPartWriteToContinue = new Promise<void>((resolve) => {
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
      return Readable.from((async function* () {
        try {
          for await (const chunk of source) {
            yield chunk;
          }
        } finally {
          openStreams -= 1;
        }
      })());
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
