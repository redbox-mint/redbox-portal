import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import * as sinon from 'sinon';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Upload, ERRORS } from '@tus/server';

const testRequire = createRequire(__filename);
const { TusStorageManagerDataStore } = testRequire(
  '../../src/storage/TusStorageManagerDataStore'
) as typeof import('../../src/storage/TusStorageManagerDataStore');
let expect: Chai.ExpectStatic;

// Exercise the installed Flydrive Disk/S3Driver with simulated S3 command
// responses, including atomic object replacement and paginated LIST results.
// This does not exercise AWS transport, credentials, or a live S3 service.
async function s3Fixture(id: string) {
  const [{ Disk }, { S3Driver }] = await Promise.all([import('flydrive'), import('flydrive/drivers/s3')]);
  const objects = new Map<string, Buffer>();
  const fault: { compose?: boolean; info?: 'before' | 'after' } = {};
  const client = new S3Client({ region: 'us-east-1' });
  const send = sinon.stub(client, 'send').callsFake(async command => {
    if (command instanceof PutObjectCommand) {
      const { Key: key, Body: body, ContentLength: length } = command.input;
      if (!key) throw new Error('missing S3 key');
      if (key.endsWith('/info.json') && fault.info === 'before') throw new Error('metadata unavailable');
      const chunks: Buffer[] = [];
      if (body instanceof Readable) {
        for await (const chunk of body) {
          if (key === id && fault.compose) throw new Error('S3 compose interrupted');
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      } else if (typeof body === 'string' || body instanceof Uint8Array) {
        chunks.push(Buffer.from(body));
      } else {
        throw new Error('unexpected S3 body');
      }
      const data = Buffer.concat(chunks);
      if (length !== undefined) expect(data.length).to.equal(length);
      objects.set(key, data);
      if (key.endsWith('/info.json') && fault.info === 'after') throw new Error('lost S3 PUT response');
      return { $metadata: { httpStatusCode: 200 } };
    }
    if (command instanceof GetObjectCommand || command instanceof HeadObjectCommand) {
      const data = objects.get(command.input.Key!);
      if (!data) throw Object.assign(new Error('NoSuchKey'), { $metadata: { httpStatusCode: 404 } });
      return {
        $metadata: { httpStatusCode: 200 },
        ContentLength: data.length,
        Body: Object.assign(Readable.from([data]), { transformToString: async () => data.toString() }),
      };
    }
    if (command instanceof ListObjectsV2Command) {
      const { Prefix: prefix = '', ContinuationToken: token = '' } = command.input;
      const remaining = [...objects.keys()].filter(key => key.startsWith(prefix) && key > token).sort();
      const keys = remaining.slice(0, 2);
      return {
        $metadata: { httpStatusCode: 200 },
        Contents: keys.map(Key => ({ Key, Size: objects.get(Key)!.length, LastModified: new Date() })),
        NextContinuationToken: remaining.length > keys.length ? keys.at(-1) : undefined,
      };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key!);
      return { $metadata: { httpStatusCode: 204 } };
    }
    if (command instanceof DeleteObjectsCommand) {
      for (const object of command.input.Delete?.Objects ?? []) objects.delete(object.Key!);
      return { $metadata: { httpStatusCode: 200 } };
    }
    throw new Error(`Unexpected S3 command ${command.constructor.name}`);
  });
  const disk = new Disk(new S3Driver({ client, bucket: 'tus-tests', visibility: 'private' }));
  return { disk, objects, fault, send, client };
}

describe('TusStorageManagerDataStore with Flydrive S3 contract', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });
  afterEach(function () {
    sinon.restore();
  });

  it('recovers from failed composition across restart and different PATCH boundaries with paginated stale parts', async function () {
    const id = 's3-compose-retry';
    const { disk, objects, fault, send, client } = await s3Fixture(id);
    try {
      const store = new TusStorageManagerDataStore({ disk });
      await store.create(new Upload({ id, size: 6, offset: 0 }));
      await store.write(Readable.from(['ab']), id, 0);
      // An interrupted prior request left more stale parts than one LIST page.
      for (const offset of [2, 3, 4, 5]) {
        objects.set(`tus/${id}/parts/${String(offset).padStart(20, '0')}`, Buffer.from('!'));
      }
      fault.compose = true;
      let failure: unknown;
      try {
        await store.write(Readable.from(['cdef']), id, 2);
      } catch (error) {
        failure = error;
      }
      expect(failure).to.equal(ERRORS.FILE_WRITE_ERROR);
      expect((await store.getUpload(id)).offset).to.equal(2);
      expect(objects.has(id)).to.equal(false);
      fault.compose = false;
      const restarted = new TusStorageManagerDataStore({ disk });
      await restarted.write(Readable.from(['X']), id, 2);
      await restarted.write(Readable.from(['Y']), id, 3);
      send.resetHistory();
      await restarted.write(Readable.from(['ZW']), id, 4);
      expect(objects.get(id)!.toString()).to.equal('abXYZW');
      // Composition reuses the PATCH snapshot instead of listing parts again.
      const lists = send.getCalls().filter(call => call.args[0] instanceof ListObjectsV2Command);
      expect(lists).to.have.length(4); // 2 PATCH pages, 2 cleanup pages
      expect([...objects.keys()].filter(key => key.includes('/parts/'))).to.have.length(0);
    } finally {
      client.destroy();
    }
  });

  for (const info of ['before', 'after'] as const) {
    it(`preserves resumability when S3 rejects metadata ${info} replacement`, async function () {
      const id = `s3-info-${info}`;
      const { disk, objects, fault, client } = await s3Fixture(id);
      try {
        const store = new TusStorageManagerDataStore({ disk });
        await store.create(new Upload({ id, size: 6, offset: 0 }));
        await store.write(Readable.from(['ab']), id, 0);
        fault.info = info;
        let failure: unknown;
        try {
          await store.write(Readable.from(['cd']), id, 2);
        } catch (error) {
          failure = error;
        }
        expect(failure).to.equal(ERRORS.FILE_WRITE_ERROR);
        fault.info = undefined;
        const restarted = new TusStorageManagerDataStore({ disk });
        const { offset } = await restarted.getUpload(id);
        expect(offset).to.equal(info === 'before' ? 2 : 4);
        await restarted.write(Readable.from(['abcdef'.slice(offset)]), id, offset);
        expect(objects.get(id)!.toString()).to.equal('abcdef');
      } finally {
        client.destroy();
      }
    });
  }
});
