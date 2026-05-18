let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { MongoClient, ObjectId } from 'mongodb';
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
      matched = matched.filter((file) => file.filename === filenameFilter);
    } else if (filenameFilter && typeof filenameFilter === 'object' && typeof filenameFilter.$regex === 'string') {
      const regex = new RegExp(filenameFilter.$regex);
      matched = matched.filter((file) => regex.test(file.filename));
    }
    return {
      toArray: async () => matched.map(({ buffer, ...file }) => ({ ...file })),
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
    const matches = this.files.filter((file) => file.filename === filename);
    const file = matches[options?.revision === 0 ? 0 : matches.length - 1];
    if (!file) {
      const stream = new Readable({ read() { return; } });
      process.nextTick(() => stream.emit('error', Object.assign(new Error(`missing ${filename}`), { code: 'ENOENT' })));
      return stream;
    }
    return Readable.from([file.buffer]);
  }

  public async delete(id: unknown): Promise<void> {
    const index = this.files.findIndex((file) => file._id.equals(id as ObjectId));
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

    expect(files.filter((file) => file.filename === 'attachments/oid-1/file-a')).to.have.length(1);
    expect(await driver.get('attachments/oid-1/file-a')).to.equal('two');

    await driver.copy('attachments/oid-1/file-a', 'attachments/oid-1/file-b');
    await driver.move('attachments/oid-1/file-b', 'attachments/oid-1/file-c');

    const listed = await driver.listAll('attachments/oid-1/', { recursive: true });
    const keys = Array.from(listed.objects).map((entry) => entry.key);
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

    expect(await driver.getSignedUploadUrl(key)).to.equal('gridfs://mongodb/fs/attachments%2Foid%201%2Ffile%20name%3F.txt');

    try {
      await driver.setVisibility(key, 'public');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).to.equal('GridFSDriver: visibility changes are not supported');
    }
  });

  it('uses a MongoDB driver Db from the configured datastore URL instead of the Sails datastore manager', async function () {
    const dbFromMongoClient = { source: 'mongodb-7-client' };
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
    const driver = new GridFSDriver({ datastore: 'mongodb', bucketName: 'fs' }, () => new FakeGridFSBucket(files) as any);

    try {
      await driver.exists('attachments/oid-1/file-1');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).to.equal("GridFSDriver: datastore 'mongodb' does not have a MongoDB URL configured");
    }
  });
});
