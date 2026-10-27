const { portalFixture: fixture } = require('../../helpers/portalFixture.cjs');
import type { PersistenceOwner } from '@researchdatabox/redbox-core';
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
    } as unknown as PersistenceOwner).find(index => index.name === 'institution-expiry')!;
    const descriptor = { ...configured, collection };
    const database = await mongoDatabase(fixture.owner, 'redboxStorage');
    try {
      assert.equal((await ensurePersistenceIndex(fixture.owner, descriptor)).index, 'ready');
      const actual = (await database.collection(collection).listIndexes().toArray()).find(
        index => index.name === descriptor.name
      )!;
      assert.equal(actual.expireAfterSeconds, 60);
      assert.equal(actual.hidden, true);
      const changed = { ...descriptor, expireAfterSeconds: 120 };
      assert.equal((await inspectPersistenceIndex(fixture.owner, changed)).index, 'conflicting');
      await assert.rejects(ensurePersistenceIndex(fixture.owner, changed), /Required persistence index/);
    } finally {
      await database.collection(collection).drop();
    }
  });
});
