const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { mongoDatabase, mongoSessionDatabase } from '@researchdatabox/redbox-core';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Resolve the same dependency versions as the installed core package.
const corePath = require.resolve('@researchdatabox/redbox-core');
const coreRequire = createRequire(corePath);

describe('Shared MongoDB clients', function () {
  this.timeout(30_000);

  it('reports the real server, standalone topology and explicitly selected cache backend', async function () {
    const db = await mongoDatabase(fixture.owner, 'mongodb');
    const build = await db.command({ buildInfo: 1 });
    const hello = await db.command({ hello: 1 });
    assert.ok(Number(build.version.split('.')[0]) >= 8);
    assert.equal(hello.setName, undefined);
    assert.equal(coreRequire(corePath).getCacheEntryRepository(fixture.owner).constructor.name, 'PrismaCacheEntryRepository');
  });

  it('persists, reopens, touches and destroys connect-mongo sessions', async function () {
    const { MongoStore } = coreRequire('connect-mongo');
    const options = {
      clientPromise: Promise.resolve((await mongoSessionDatabase(fixture.owner, fixture.config.redboxSession)).client),
      collectionName: 'p4_session_smoke',
      autoRemove: 'disabled',
    };
    const first = MongoStore.create(options);
    const second = MongoStore.create(options);
    const id = `p4-${Date.now()}`;
    try {
      const data = { cookie: { expires: new Date(Date.now() + 60_000), maxAge: 60_000 }, userId: 'p4-fixture' };
      await new Promise<void>((resolve, reject) =>
        first.set(id, data, (error: Error) => (error ? reject(error) : resolve()))
      );
      const found = await new Promise<any>((resolve, reject) =>
        second.get(id, (error: Error, value: unknown) => (error ? reject(error) : resolve(value)))
      );
      assert.equal(found.userId, 'p4-fixture');
      await new Promise<void>((resolve, reject) =>
        second.touch(id, found, (error: Error) => (error ? reject(error) : resolve()))
      );
      await new Promise<void>((resolve, reject) =>
        second.destroy(id, (error: Error) => (error ? reject(error) : resolve()))
      );
      const missing = await new Promise<unknown>((resolve, reject) =>
        first.get(id, (error: Error, value: unknown) => (error ? reject(error) : resolve(value)))
      );
      assert.ok(missing === null || missing === undefined);
    } finally {
      // Both stores borrow the application pool; autoRemove is disabled.
    }
  });

  it('round trips binary data, metadata, replacement and deletion through the core GridFS driver', async function () {
    const { GridFSDriver } = coreRequire('./storage/GridFSDriver.js');
    const driver = new GridFSDriver({
      url: fixture.config.datastores.redboxStorage.url,
      bucketName: 'p4_gridfs_smoke',
    }, undefined, undefined, fixture.owner);
    const key = `p4/${Date.now()}.bin`;
    const bytes = Buffer.from([0, 1, 127, 128, 255]);
    try {
      await driver.put(key, bytes, { contentType: 'application/octet-stream' });
      assert.deepEqual(Buffer.from(await driver.getBytes(key)), bytes);
      assert.equal((await driver.getMetaData(key)).contentLength, bytes.length);
      await driver.put(key, 'replacement');
      assert.equal(await driver.get(key), 'replacement');
      await driver.delete(key);
      assert.equal(await driver.exists(key), false);
    } finally {
      await GridFSDriver.dispose(fixture.owner);
    }
  });
});
