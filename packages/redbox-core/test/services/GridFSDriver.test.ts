let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { ObjectId } from 'mongodb';
import * as runtime from '../../src/persistence/runtime';
import { Readable, Writable } from 'node:stream';
import { GridFSDriver } from '../../src/storage/GridFSDriver';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

type StoredFile = {
  _id: ObjectId;
  filename: string;
  length: number;
  uploadDate: Date;
  metadata?: Record<string, unknown>;
  buffer: Buffer;
};

class FakeGridFSBucket {
  public readonly files: StoredFile[];

  public constructor(files: StoredFile[]) {
    this.files = files;
  }

  public find(filter?: Record<string, unknown>) {
    const filenameFilter = filter?.filename as string | { $regex?: string } | undefined;
    let matched = this.files.slice();
    if (typeof filenameFilter === 'string') {
      matched = matched.filter(file => file.filename === filenameFilter);
    } else if (filenameFilter && typeof filenameFilter === 'object' && typeof filenameFilter.$regex === 'string') {
      const regex = new RegExp(filenameFilter.$regex);
      matched = matched.filter(file => regex.test(file.filename));
    }
    return {
      toArray: async () => matched.map(({ buffer, ...file }) => ({ chunkSize: 255 * 1024, ...file })),
    };
  }

  public openUploadStream(filename: string, options?: { metadata?: Record<string, unknown> }) {
    const chunks: Buffer[] = [];
    const files = this.files;
    const uploadId = new ObjectId();

    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
      final(callback) {
        const buffer = Buffer.concat(chunks);
        files.push({
          _id: uploadId,
          filename,
          length: buffer.length,
          uploadDate: new Date(),
          metadata: options?.metadata,
          buffer,
        });
        callback();
      },
    }) as Writable & { id: ObjectId };

    writable.id = uploadId;
    return writable;
  }

  public openDownloadStreamByName(filename: string, options?: { revision?: number }) {
    const matches = this.files.filter(file => file.filename === filename);
    const file = matches[options?.revision === 0 ? 0 : matches.length - 1];
    if (!file) {
      const stream = new Readable({
        read() {
          return;
        },
      });
      process.nextTick(() => stream.emit('error', Object.assign(new Error(`missing ${filename}`), { code: 'ENOENT' })));
      return stream;
    }
    return Readable.from([file.buffer]);
  }

  public async delete(id: unknown): Promise<void> {
    const index = this.files.findIndex(file => file._id.equals(id as ObjectId));
    if (index >= 0) {
      this.files.splice(index, 1);
    }
  }
}

describe('GridFSDriver', function () {
  let mockSails: any;
  let files: StoredFile[];

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    files = [];
    mockSails = createMockSails();
    setupServiceTestGlobals(mockSails);
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  function createDriver() {
    return new GridFSDriver(
      { datastore: 'mongodb', bucketName: 'fs', visibility: 'private' },
      () => new FakeGridFSBucket(files) as any,
      async () => ({}) as any
    );
  }

  it('writes and reads bytes, streams, and metadata', async function () {
    const driver = createDriver();
    await driver.put('attachments/oid-1/file-1', Buffer.from('hello world'), {
      contentType: 'text/plain',
      cacheControl: 'max-age=60',
      contentDisposition: 'inline',
      contentLength: 11,
    });

    expect(await driver.exists('attachments/oid-1/file-1')).to.equal(true);
    expect(await driver.get('attachments/oid-1/file-1')).to.equal('hello world');
    expect(Buffer.from(await driver.getBytes('attachments/oid-1/file-1')).toString('utf8')).to.equal('hello world');

    const metadata = await driver.getMetaData('attachments/oid-1/file-1');
    expect(metadata.contentType).to.equal('text/plain');
    expect(metadata.contentLength).to.equal(11);
    expect(metadata.etag).to.be.a('string').and.not.empty;

    expect(files[0].metadata).to.include({
      contentType: 'text/plain',
      cacheControl: 'max-age=60',
      contentDisposition: 'inline',
      contentLength: 11,
      visibility: 'private',
    });
  });

  it('overwrites same filename and supports copy, move, list, and delete operations', async function () {
    const driver = createDriver();
    await driver.put('attachments/oid-1/file-a', Buffer.from('one'), { contentType: 'text/plain' });
    await driver.put('attachments/oid-1/file-a', Buffer.from('two'), { contentType: 'text/plain' });

    expect(files.filter(file => file.filename === 'attachments/oid-1/file-a')).to.have.length(1);
    expect(await driver.get('attachments/oid-1/file-a')).to.equal('two');

    await driver.copy('attachments/oid-1/file-a', 'attachments/oid-1/file-b');
    await driver.move('attachments/oid-1/file-b', 'attachments/oid-1/file-c');

    const listed = await driver.listAll('attachments/oid-1/', { recursive: true });
    const keys = Array.from(listed.objects).map(entry => entry.key);
    expect(keys).to.deep.equal(['attachments/oid-1/file-a', 'attachments/oid-1/file-c']);

    await driver.delete('attachments/oid-1/file-a');
    expect(await driver.exists('attachments/oid-1/file-a')).to.equal(false);

    await driver.deleteAll('attachments/oid-1/');
    expect(Array.from((await driver.listAll('attachments/oid-1/', { recursive: true })).objects)).to.have.length(0);
  });

  it('returns ENOENT-style errors for missing objects', async function () {
    const driver = createDriver();

    try {
      await driver.getMetaData('missing/file');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.code).to.equal('ENOENT');
    }
  });

  it('encodes synthetic URLs and throws for unsupported visibility changes', async function () {
    const driver = createDriver();
    const key = 'attachments/oid 1/file name?.txt';

    await driver.put(key, Buffer.from('hello world'));

    expect(await driver.getSignedUploadUrl(key)).to.equal(
      'gridfs://mongodb/fs/attachments%2Foid%201%2Ffile%20name%3F.txt'
    );

    try {
      await driver.setVisibility(key, 'public');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).to.equal('GridFSDriver: visibility changes are not supported');
    }
  });

  it('borrows the configured datastore from the application runtime', async function () {
    const shared = { databaseName: 'redbox-gridfs-test' };
    const acquire = sinon.stub(runtime, 'mongoDatabase').resolves(shared as any);
    const bucketFactory = sinon.stub().returns(new FakeGridFSBucket(files) as any);
    const driver = new GridFSDriver({ datastore: 'mongodb', bucketName: 'fs' }, bucketFactory as any, undefined, mockSails);
    await driver.exists('attachments/oid-1/file-1');
    expect(acquire.calledOnceWithExactly(mockSails, 'mongodb')).to.equal(true);
    expect(bucketFactory.firstCall.args[0]).to.equal(shared);
  });

  for (const method of ['delete', 'deleteAll'] as const) {
    it(`drains sibling ${method} deletions after the first failure before releasing its resource`, async () => {
      const first = new ObjectId();
      files = [first, new ObjectId()].map(_id => ({
        _id,
        filename: 'attachments/file',
        length: 1,
        uploadDate: new Date(0),
        buffer: Buffer.from('x'),
      }));
      const failure = new Error('first deletion failed');
      let release!: () => void, started!: () => void;
      const held = new Promise<void>(resolve => {
        release = resolve;
      });
      const entered = new Promise<void>(resolve => {
        started = resolve;
      });
      const bucket = new FakeGridFSBucket(files);
      sinon.stub(bucket, 'delete').callsFake(async id => {
        if (first.equals(id as ObjectId)) throw failure;
        started();
        await held;
      });
      sinon.stub(runtime, 'mongoDatabase').resolves({} as any);
      mockSails.config.datastores = { mongodb: { url: 'mongodb://localhost:27017/gridfs-drain' } };
      const driver = new GridFSDriver({}, () => bucket, undefined, mockSails);
      const operation = driver[method](method === 'delete' ? 'attachments/file' : 'attachments/').then(
        () => undefined,
        error => error
      );
      await entered;
      expect(await operation).to.equal(failure);
      let disposed = false;
      const disposal = GridFSDriver.dispose(mockSails).then(() => {
        disposed = true;
      });
      try {
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(disposed).to.equal(false);
      } finally {
        release();
        await disposal;
      }
    });
  }

  for (const method of ['copy', 'move'] as const) {
    for (const stage of ['destination deletion', 'upload creation'] as const) {
      it(`disposes its internal source after ${method} fails during ${stage}`, async () => {
        const bucket = new FakeGridFSBucket(files);
        const driver = new GridFSDriver(
          {},
          () => bucket,
          async () => ({}) as any,
          mockSails
        );
        await driver.put('source', 'original');
        await driver.put('destination', 'previous');
        const download = sinon.spy(bucket, 'openDownloadStreamByName');
        const failure = new Error('destination preparation failed');
        if (stage === 'destination deletion') sinon.stub(bucket, 'delete').rejects(failure);
        else sinon.stub(bucket, 'openUploadStream').throws(failure);
        const error = await driver[method]('source', 'destination').then(
          () => undefined,
          error => error
        );
        const stream = download.firstCall.returnValue;
        let disposed = false;
        const disposal = GridFSDriver.dispose(mockSails).then(() => {
          disposed = true;
        });
        try {
          expect(error).to.equal(failure);
          expect(files.some(file => file.filename === 'source' && file.buffer.toString() === 'original')).to.equal(
            true
          );
          await new Promise<void>(resolve => setImmediate(resolve));
          expect(stream.destroyed).to.equal(true);
          expect(disposed).to.equal(true);
        } finally {
          // The failing-before control must also release its leaked stream.
          stream.destroy();
          await disposal;
        }
      });
    }
  }

  for (const outcome of ['complete', 'cancel', 'error'] as const) {
    it(`drains the download cursor after stream ${outcome}`, async () => {
      const bucket = new FakeGridFSBucket(files);
      const driver = new GridFSDriver(
        {},
        () => bucket,
        async () => ({}) as any,
        mockSails
      );
      await driver.put('source', 'original');
      const stream = Readable.from([Buffer.from('original')]);
      let release!: () => void;
      const held = new Promise<void>(resolve => {
        release = resolve;
      });
      const abort = sinon.stub().returns(held);
      Object.assign(stream, { abort });
      sinon.stub(bucket, 'openDownloadStreamByName').returns(stream);
      const download = await driver.getStream('source');
      const marker = new Error('download failed');
      const errors: Error[] = [];
      download.on('error', error => {
        errors.push(error);
      });
      if (outcome === 'complete') download.resume();
      else download.destroy(outcome === 'error' ? marker : undefined);
      let disposed = false;
      const disposal = GridFSDriver.dispose(mockSails).then(() => {
        disposed = true;
      });
      try {
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(abort.calledOnce).to.equal(true);
        expect(disposed).to.equal(false);
        expect(errors).to.deep.equal(outcome === 'error' ? [marker] : []);
      } finally {
        release();
        await disposal;
      }
      expect(disposed).to.equal(true);
    });
  }

  it('throws when GridFS is configured without a MongoDB URL', async function () {
    const driver = new GridFSDriver(
      { datastore: 'mongodb', bucketName: 'fs' },
      () => new FakeGridFSBucket(files) as any
    );

    try {
      await driver.exists('attachments/oid-1/file-1');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).to.match(/datastore|URL|initialized/i);
    }
  });
});
