const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { mongoDatabase } from '@researchdatabox/redbox-core';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getStorageRepositories } from '@researchdatabox/redbox-core';

describe('Selected S repository in the stock application', () => {
  it('uses one selected owner for records, authorization, schemas and attachment metadata', async () => {
    const repository = getStorageRepositories(fixture.owner).attachments;
    const oid = 'stock-s-' + randomUUID();
    const manager = await mongoDatabase(fixture.owner, 'mongodb');
    try {
      await repository.upsert({ oid, fileId: 'bytes', storageKey: oid + '/bytes', contentLength: 0 });
      const found = await repository.findOneByStorageKey(oid + '/bytes');
      assert.equal(found?.contentLength, 0);
      await repository.recordAccess({ oid, storageKey: oid + '/bytes', action: 'download' });
      assert.equal((await repository.findOneByStorageKey(oid + '/bytes'))?.accessCount, 1);
    } finally {
      await manager.collection('attachmentmetadata').deleteMany({ oid });
      await manager.collection('attachmentaccessaudit').deleteMany({ oid });
    }
  });
});
