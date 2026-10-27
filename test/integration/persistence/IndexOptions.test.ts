import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ensurePersistenceIndex, inspectPersistenceIndex, mongoDatabase } from '@researchdatabox/redbox-core';
import { storageIndexes } from '@researchdatabox/sails-hook-redbox-storage-mongo/dist/persistence/preflight';

describe('Configured native indexes in the loaded portal', () => {
  it('creates TTL and hidden options through maintenance and reports existing-index drift', async () => {
    const collection = 'index_options_' + randomUUID().replaceAll('-', '');
    const configured = storageIndexes({
      config: {
        storage: {
          mongodb: {
            indices: [
              {
                key: { expires: 1 },
                name: 'institution-expiry',
                expireAfterSeconds: 60,
                hidden: true,
                sparse: true,
              },
            ],
          },
        },
      },
    } as unknown as Sails.Application).find(index => index.name === 'institution-expiry')!;
    const descriptor = { ...configured, collection };
    const database = await mongoDatabase(sails, 'redboxStorage');
    try {
      assert.equal((await ensurePersistenceIndex(sails, descriptor)).index, 'ready');
      const actual = (await database.collection(collection).listIndexes().toArray()).find(
        index => index.name === descriptor.name
      )!;
      assert.equal(actual.expireAfterSeconds, 60);
      assert.equal(actual.hidden, true);
      const changed = { ...descriptor, expireAfterSeconds: 120 };
      assert.equal((await inspectPersistenceIndex(sails, changed)).index, 'conflicting');
      await assert.rejects(ensurePersistenceIndex(sails, changed), /Required persistence index/);
    } finally {
      await database.collection(collection).drop();
    }
  });
});
