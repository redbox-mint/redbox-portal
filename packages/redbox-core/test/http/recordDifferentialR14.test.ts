import assert from 'node:assert/strict';
import { httpRecordReadsFixture } from '../helpers/httpRecordReadsFixture';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';

const base = '/default/portal';
describe('Pre-retirement browser record response and side-effect contracts (R14)', () => {
  for (const version of ['1.0', '2.0'])
    it(`retains the browser metadata relationship envelope (${version})`, async () => {
      const f = await httpRecordReadsFixture();
      const record = {
        redboxOid: 'oid-1',
        revision: 3,
        metaMetadata: { brandId: 'brand-1' },
        metadata: { title: 'Current' },
        authorization: { view: ['alice'], edit: ['alice'] },
      };
      const graph = { rootOid: 'oid-1', relatedObjects: { dataset: [record] }, edges: [], omittedByAccess: {} };
      f.storage.getMeta.resolves(record);
      f.storage.getRelatedRecords.resolves(graph);
      try {
        const response = await f.request(base + '/record/metadata/oid-1?include=relationships&apiVersion=' + version);
        assert.equal(response.status, 200);
        assert.deepEqual(
          response.body,
          version === '1.0'
            ? { ...record.metadata, relationships: graph }
            : {
                data: record.metadata,
                meta: { oid: 'oid-1', revision: 3, entityTag: formatRecordEntityTag('oid-1', 3), relationships: graph },
              }
        );
        assert.equal(response.headers.get('etag'), formatRecordEntityTag('oid-1', 3));
      } finally {
        await f.close();
      }
    });

});
