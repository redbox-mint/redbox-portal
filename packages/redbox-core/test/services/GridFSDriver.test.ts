let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { MongoClient, ObjectId } from 'mongodb';
import { PassThrough, Readable, Writable } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { GridFSDriver } from '../../src/storage/GridFSDriver';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

type StoredFile = {
  _id: ObjectId;
  filename: string;
  length: number;
  chunkSize: number;
  uploadDate: Date;
  metadata?: Record<string, unknown>;
  buffer: Buffer;
};

type PendingUpload = {
  _id: ObjectId;
  filename: string;
  startedAt: Date;
  metadata: Record<string, unknown>;
};

type StoredChunk = { files_id: ObjectId; data: Buffer };

class FakeGridFSBucket {
  public readonly files: StoredFile[];
  public readonly chunks: StoredChunk[];

  public constructor(files: StoredFile[], chunks: StoredChunk[] = []) {
    this.files = files;
    this.chunks = chunks;
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
      toArray: async () => matched.map(({ buffer, ...file }) => ({ ...file })),
    };
  }

  public openUploadStreamWithId(
    uploadId: ObjectId,
    filename: string,
    options?: { metadata?: Record<string, unknown>; chunkSizeBytes?: number }
  ) {
    const chunks: Buffer[] = [];
    const files = this.files;
    const storedChunks = this.chunks;

    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        storedChunks.push({ files_id: uploadId, data: Buffer.from(chunk) });
        callback();
      },
      final(callback) {
        const buffer = Buffer.concat(chunks);
        files.push({
          _id: uploadId,
          filename,
          length: buffer.length,
          chunkSize: options?.chunkSizeBytes ?? 255 * 1024,
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
  let pending: PendingUpload[];
  let chunks: StoredChunk[];
  let failChunkDeletion: boolean;
  let insertChunk: (chunk: StoredChunk) => Promise<void>;
  let insertFile: (file: Omit<StoredFile, 'buffer'>) => Promise<void>;

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    files = [];
    pending = [];
    chunks = [];
    failChunkDeletion = false;
    insertChunk = async chunk => {
      chunks.push(chunk);
    };
    insertFile = async file => {
      files.push({
        ...file,
        buffer: Buffer.concat(chunks.filter(chunk => chunk.files_id.equals(file._id)).map(chunk => chunk.data)),
      });
    };
    mockSails = createMockSails();
    mockSails.getDatastore = sinon.stub().returns({ manager: {} });
    setupServiceTestGlobals(mockSails);
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  function createDriver() {
    return new GridFSDriver(
      { datastore: 'mongodb', bucketName: 'fs', visibility: 'private' },
      () => new FakeGridFSBucket(files, chunks),
      async () => createDatabase()
    );
  }

  function createDatabase() {
    // A real Db-shaped instance avoids weakening the production driver's injected Db contract.
    return Object.assign(new MongoClient('mongodb://unused.test:27017').db('unit'), {
      collection(name: string) {
        return {
          insertOne: async (document: PendingUpload | Omit<StoredFile, 'buffer'> | StoredChunk) => {
            if ('files_id' in document) await insertChunk(document);
            else if ('startedAt' in document) pending.push(document);
            else await insertFile(document);
          },
          // An existing file lets the real GridFS stream skip index creation.
          findOne: async () => ({ _id: new ObjectId() }),
          find(filter: { filename?: string | { $regex?: string } }) {
            return {
              toArray: async () =>
                (name.endsWith('.uploads') ? pending : files).filter(upload => {
                  if (typeof filter.filename === 'string') return upload.filename === filter.filename;
                  return !filter.filename?.$regex || new RegExp(filter.filename.$regex).test(upload.filename);
                }),
            };
          },
          async deleteOne(filter: { _id: ObjectId }) {
            const entries = name.endsWith('.uploads') ? pending : files;
            const index = entries.findIndex(entry => entry._id.equals(filter._id));
            if (index >= 0) entries.splice(index, 1);
          },
          async deleteMany(filter: { files_id: ObjectId }) {
            if (failChunkDeletion) throw new Error('Chunk deletion unavailable');
            for (let index = chunks.length - 1; index >= 0; index--) {
              if (chunks[index].files_id.equals(filter.files_id)) chunks.splice(index, 1);
            }
          },
        };
      },
    });
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
    expect(pending).to.have.length(0);
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

  it("preserves another driver's active upload when overwriting the same key", async function () {
    const key = 'attachments/concurrent.csv';
    const firstDriver = new GridFSDriver({ bucketName: 'fs' }, undefined, async () => createDatabase());
    const secondDriver = new GridFSDriver({ bucketName: 'fs' }, undefined, async () => createDatabase());
    let releaseSource!: () => void;
    let notifyChunk!: () => void;
    const blocked = new Promise<void>(resolve => {
      releaseSource = resolve;
    });
    const chunkWritten = new Promise<void>(resolve => {
      notifyChunk = resolve;
    });
    insertChunk = async chunk => {
      chunks.push(chunk);
      notifyChunk();
    };
    const firstUpload = firstDriver.putStream(
      key,
      Readable.from(
        (async function* () {
          yield Buffer.alloc(255 * 1024, 'a');
          await blocked;
          yield Buffer.from('tail');
        })()
      )
    );
    let activeMappingPreserved: boolean;
    let activeChunkPreserved: boolean;
    try {
      await chunkWritten;
      expect(await secondDriver.exists(key)).to.equal(false);
      expect(Array.from((await secondDriver.listAll('attachments/')).objects)).to.have.length(0);
      const uploadId = pending[0]._id;
      await secondDriver.put(key, 'replacement');
      activeMappingPreserved = pending.some(upload => upload._id.equals(uploadId));
      activeChunkPreserved = chunks.some(chunk => chunk.files_id.equals(uploadId));
    } finally {
      releaseSource();
      await firstUpload;
    }
    expect(activeMappingPreserved, 'overwrite must retain the active upload mapping').to.equal(true);
    expect(activeChunkPreserved, 'overwrite must retain chunks already written by the active upload').to.equal(true);
    expect(pending).to.have.length(0);
    const firstFile = files.find(file => file.length === 255 * 1024 + 4);
    expect(firstFile?.buffer).to.deep.equal(Buffer.concat([Buffer.alloc(255 * 1024, 'a'), Buffer.from('tail')]));
  });

  it('keeps the previous file readable while a replacement is pending and after it fails', async function () {
    const driver = createDriver();
    const key = 'attachments/replacement.csv';
    await driver.put(key, 'original', { contentType: 'text/plain' });
    const originalId = files[0]._id;
    let releaseSource!: () => void;
    let notifyStarted!: () => void;
    const released = new Promise<void>(resolve => {
      releaseSource = resolve;
    });
    const started = new Promise<void>(resolve => {
      notifyStarted = resolve;
    });
    const replacement = driver
      .putStream(
        key,
        Readable.from(
          (async function* () {
            yield 'partial replacement';
            notifyStarted();
            await released;
            throw new Error('Replacement source failed');
          })()
        )
      )
      .then(
        () => null,
        error => error
      );
    try {
      await started;
      expect(await driver.get(key)).to.equal('original');
      expect(await driver.exists(key)).to.equal(true);
    } finally {
      releaseSource();
    }
    expect(await replacement).to.have.property('message', 'Replacement source failed');
    expect(await driver.get(key)).to.equal('original');
    expect(await driver.getMetaData(key)).to.have.property('contentType', 'text/plain');
    expect(files).to.have.length(1);
    expect(files[0]._id.equals(originalId)).to.equal(true);
    expect(chunks.every(chunk => chunk.files_id.equals(originalId))).to.equal(true);
    expect(pending).to.have.length(0);
  });

  it('keeps a successful replacement when deleting the previous version fails', async function () {
    const driver = createDriver();
    const key = 'attachments/replacement.csv';
    await driver.put(key, 'original');
    failChunkDeletion = true;
    try {
      await driver.put(key, 'replacement');
      expect.fail('Retiring the previous file should report its deletion failure.');
    } catch (error) {
      expect(error).to.have.property('message', 'Chunk deletion unavailable');
    }
    expect(await driver.get(key)).to.equal('replacement');
    expect(files).to.have.length(2);
    expect(pending).to.have.length(0);
    failChunkDeletion = false;
    await driver.delete(key);
    expect(files).to.have.length(0);
    expect(chunks).to.have.length(0);
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

  it('persists the key mapping before consuming the first upload chunk', async function () {
    const driver = createDriver();
    const key = 'exports/first-chunk.csv';
    const source = new Readable({
      read() {
        expect(pending).to.have.length(1);
        expect(pending[0].filename).to.equal(key);
        this.push('csv');
        this.push(null);
      },
    });
    await driver.putStream(key, source);
    expect(pending).to.have.length(0);
    expect(await driver.get(key)).to.equal('csv');
  });

  it('discovers and deletes a crashed chunk-only upload through a reconstructed driver', async function () {
    const uploadId = new ObjectId();
    const key = 'exports/crashed/attempt.csv';
    const startedAt = new Date(Date.now() - 600000);
    pending.push({ _id: uploadId, filename: key, startedAt, metadata: { visibility: 'private' } });
    chunks.push({ files_id: uploadId, data: Buffer.from('partial CSV') });
    const driver = createDriver();

    expect(await driver.exists(key)).to.equal(false);
    expect(Array.from((await driver.listAll('exports/')).objects)).to.have.length(0);
    const listed = await driver.listIncompleteUploads('exports/');
    expect(listed.map(object => object.key)).to.deep.equal([key]);
    expect(listed[0].lastModified).to.equal(startedAt);
    for (const operation of [driver.getStream(key), driver.getMetaData(key)]) {
      try {
        await operation;
        expect.fail('An unfinished upload must not be readable.');
      } catch (error) {
        expect(error).to.have.property('code', 'ENOENT');
      }
    }

    failChunkDeletion = true;
    try {
      await driver.delete(key);
      expect.fail('Deletion should fail for retry.');
    } catch (error) {
      expect(error).to.have.property('message', 'Chunk deletion unavailable');
    }
    expect(pending).to.have.length(1);
    expect(chunks).to.have.length(1);
    failChunkDeletion = false;
    await driver.delete(key);
    await driver.delete(key);
    expect(pending).to.have.length(0);
    expect(chunks).to.have.length(0);
    expect(await driver.exists(key)).to.equal(false);
    expect(Array.from((await driver.listAll('exports/')).objects)).to.have.length(0);
  });

  it('retains a failed upload mapping when cleanup fails and supports deletion by prefix', async function () {
    const driver = createDriver();
    const key = 'exports/failed/attempt.csv';
    failChunkDeletion = true;
    const source = Readable.from(
      (async function* () {
        yield 'partial CSV';
        throw new Error('Source failed');
      })()
    );
    try {
      await driver.putStream(key, source);
      expect.fail('Upload should fail.');
    } catch (error) {
      expect(error).to.have.property('message', 'Source failed');
    }
    expect(pending).to.have.length(1);
    expect(await driver.exists(key)).to.equal(false);
    failChunkDeletion = false;
    await driver.deleteAll('exports/failed/');
    expect(pending).to.have.length(0);
    expect(chunks).to.have.length(0);
  });

  it('drains a real GridFS chunk insert before rejecting a source failure and allowing immediate deletion', async function () {
    const driver = new GridFSDriver({ bucketName: 'fs' }, undefined, async () => createDatabase());
    const key = 'exports/source-error/attempt.csv';
    let releaseInsert!: () => void;
    let notifyStarted!: () => void;
    const blocked = new Promise<void>(resolve => {
      releaseInsert = resolve;
    });
    const started = new Promise<void>(resolve => {
      notifyStarted = resolve;
    });
    insertChunk = async chunk => {
      notifyStarted();
      await blocked;
      chunks.push(chunk);
    };
    const source = new PassThrough();
    let settled = false;
    const result = driver.putStream(key, source).then(
      () => {
        settled = true;
        return null;
      },
      error => {
        settled = true;
        return error;
      }
    );
    source.write(Buffer.alloc(300 * 1024));
    try {
      await started;
      source.destroy(new Error('Source failed during insert'));
      await nextTurn();
      expect(settled).to.equal(false);
      expect(pending).to.have.length(1);
    } finally {
      releaseInsert();
    }
    expect(await result).to.have.property('message', 'Source failed during insert');
    // ExportService calls disk.delete immediately after putStream fails.
    await driver.delete(key);
    await nextTurn();
    expect(files).to.have.length(0);
    expect(chunks).to.have.length(0);
    expect(pending).to.have.length(0);
    expect(await driver.exists(key)).to.equal(false);
  });

  it('bounds real GridFS writes so one rejected insert cannot leave delayed sibling inserts', async function () {
    const driver = new GridFSDriver({ bucketName: 'fs' }, undefined, async () => createDatabase());
    const key = 'exports/insert-error/attempt.csv';
    let insertCalls = 0;
    let releaseInsert!: () => void;
    const blocked = new Promise<void>(resolve => {
      releaseInsert = resolve;
    });
    insertChunk = async chunk => {
      insertCalls += 1;
      if (insertCalls === 1) {
        await nextTurn();
        throw new Error('Chunk insert failed');
      }
      await blocked;
      chunks.push(chunk);
    };
    const error = await driver.putStream(key, Readable.from([Buffer.alloc(800 * 1024)])).then(
      () => null,
      error => error
    );
    await driver.delete(key);
    releaseInsert();
    await nextTurn();
    expect(error).to.have.property('message', 'Chunk insert failed');
    expect(insertCalls).to.equal(1);
    expect(files).to.have.length(0);
    expect(chunks).to.have.length(0);
    expect(pending).to.have.length(0);
  });

  it('waits for the real GridFS final file insert before cleaning a failed upload', async function () {
    const driver = new GridFSDriver({ bucketName: 'fs' }, undefined, async () => createDatabase());
    const key = 'exports/final-error/attempt.csv';
    let releaseInsert!: () => void;
    let notifyStarted!: () => void;
    const blocked = new Promise<void>(resolve => {
      releaseInsert = resolve;
    });
    const started = new Promise<void>(resolve => {
      notifyStarted = resolve;
    });
    insertFile = async () => {
      notifyStarted();
      await blocked;
      throw new Error('File insert failed');
    };
    let settled = false;
    const result = driver.putStream(key, Readable.from(['small CSV'])).then(
      () => {
        settled = true;
        return null;
      },
      error => {
        settled = true;
        return error;
      }
    );
    try {
      await started;
      await nextTurn();
      expect(settled).to.equal(false);
      expect(pending).to.have.length(1);
      expect(chunks).to.have.length(1);
    } finally {
      releaseInsert();
    }
    expect(await result).to.have.property('message', 'File insert failed');
    await driver.delete(key);
    expect(files).to.have.length(0);
    expect(chunks).to.have.length(0);
    expect(pending).to.have.length(0);
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

  it('uses a MongoDB driver Db from the configured datastore URL instead of the Sails datastore manager', async function () {
    const dbFromMongoClient = Object.assign(createDatabase(), { source: 'mongodb-7-client' });
    const dbFromSailsManager = { source: 'sails-mongo-manager' };
    const client = { db: sinon.stub().returns(dbFromMongoClient) };
    const connect = sinon.stub(MongoClient, 'connect').resolves(client as any);
    const bucketFactory = sinon.stub().returns(new FakeGridFSBucket(files) as any);

    mockSails.config.datastores = {
      mongodb: {
        url: 'mongodb://localhost:27017/redbox-gridfs-test',
      },
    };
    mockSails.getDatastore = sinon.stub().returns({ manager: dbFromSailsManager });
    setupServiceTestGlobals(mockSails);

    const driver = new GridFSDriver({ datastore: 'mongodb', bucketName: 'fs' }, bucketFactory as any);
    await driver.exists('attachments/oid-1/file-1');

    expect(connect.calledOnceWith('mongodb://localhost:27017/redbox-gridfs-test')).to.equal(true);
    expect(client.db.calledOnceWith()).to.equal(true);
    expect(mockSails.getDatastore.called).to.equal(false);
    expect(bucketFactory.firstCall.args[0]).to.equal(dbFromMongoClient);
    expect(bucketFactory.firstCall.args[0]).to.not.equal(dbFromSailsManager);
  });

  it('throws when GridFS is configured without a MongoDB URL', async function () {
    const driver = new GridFSDriver(
      { datastore: 'mongodb', bucketName: 'fs' },
      () => new FakeGridFSBucket(files) as any
    );

    try {
      await driver.exists('attachments/oid-1/file-1');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).to.equal("GridFSDriver: datastore 'mongodb' does not have a MongoDB URL configured");
    }
  });
});
