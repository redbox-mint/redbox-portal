import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { Db } from 'mongodb';
import { Services } from '../../src/services/MongoStorageService';

const mongoUrl = process.env.MONGO_TEST_URL;
const describeMongo = mongoUrl ? describe : describe.skip;

describeMongo('Mongo datastreams with the Sails Mongo adapter', function () {
  this.timeout(20_000);

  it('writes and reads a multi-chunk datastream through the datastore manager', async function () {
    assert.ok(mongoUrl);
    const adapter: {
      datastores: Record<string, { manager: Db }>;
      registerDatastore(
        config: { identity: string; url: string },
        models: object,
        callback: (error?: Error) => void
      ): void;
      teardown(identity: string, callback: (error?: Error) => void): void;
    } = require('sails-mongo');
    const identity = `datastream_test_${randomUUID().replaceAll('-', '')}`;
    const url = new URL(mongoUrl);
    url.pathname = `/${identity}`;
    await new Promise<void>((resolve, reject) => {
      adapter.registerDatastore({ identity, url: url.href }, {}, error => (error ? reject(error) : resolve()));
    });

    const datastore = adapter.datastores[identity];
    const bytes = randomBytes(300 * 1024);
    const globals = {
      Record: { tableName: 'record', getDatastore: () => datastore },
      DeletedRecord: { tableName: 'deletedrecord' },
      RecordAudit: { tableName: 'recordaudit' },
      RecordSchemaArtifact: { tableName: 'recordschemaartifact' },
      RecordSchemaReference: { tableName: 'recordschemareference' },
      StorageManagerService: { stagingDisk: () => ({ getStream: async () => Readable.from([bytes]) }) },
    };
    const previous = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
    try {
      Object.assign(globalThis, globals);
      await datastore.manager.createCollection(globals.Record.tableName);
      const storage = new Services.MongoStorageService();
      await storage.init();

      const oid = 'test-record';
      const file = { fileId: 'plan.pdf', metadata: { contentType: 'application/pdf' } };
      await storage.addDatastream(oid, file);

      const [stored] = await storage.listDatastreams(oid, file.fileId);
      assert.equal(stored?.filename, `${oid}/${file.fileId}`);
      assert.deepEqual(stored.metadata, { contentType: 'application/pdf', redboxOid: oid });
      assert.equal(await datastore.manager.collection('fs.chunks').countDocuments({ files_id: stored._id }), 2);
      const { readstream } = await storage.getDatastream(oid, file.fileId);
      assert.ok(readstream);
      assert.deepEqual(await buffer(readstream), bytes);
    } finally {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
      try {
        await datastore.manager.dropDatabase();
      } finally {
        await new Promise<void>((resolve, reject) => {
          adapter.teardown(identity, error => (error ? reject(error) : resolve()));
        });
      }
    }
  });
});
