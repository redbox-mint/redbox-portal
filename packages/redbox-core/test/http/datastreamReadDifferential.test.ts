import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Readable } from 'node:stream';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountDatastreamReadRoutes } from '../../src/http/express/datastreamReads';

describe('Datastream read compatibility', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let records: { getMeta: sinon.SinonStub; hasViewAccess: sinon.SinonStub; getAttachments: sinon.SinonStub };
  let datastream: { getDatastream: sinon.SinonStub };
  beforeEach(async () => {
    records = {
      getMeta: sinon.stub().resolves({ metaMetadata: { brandId: 'brand-1' } }),
      hasViewAccess: sinon.stub().returns(true),
      getAttachments: sinon.stub().resolves([]),
    };
    datastream = { getDatastream: sinon.stub().resolves({ body: Buffer.from('bytes') }) };
    f = await httpRouteFixture((router, input) => mountDatastreamReadRoutes(router, { ...input, records, datastream }));
  });
  afterEach(async () => {
    await f.close();
    sinon.restore();
  });
  it('downloads an authorized generic datastream without attachment metadata', async () => {
    const response = await f.request('/default/portal/record/record-1/datastream?datastreamId=export.csv');
    assert.equal(response.status, 200);
    assert.equal(response.text, 'bytes');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="export.csv"');
    assert.equal(datastream.getDatastream.firstCall.args[1], 'export.csv');
  });
  it('uses the datastream ID as the generic download filename', async () => {
    records.getAttachments.resolves([{ fileId: 'file-1', name: 'metadata-name.txt' }]);
    const response = await f.request('/default/portal/record/record-1/datastream?datastreamId=file-1');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="file-1"');
  });
  for (const fileName of ['?fileName=', '?fileName=renamed.csv']) {
    it(`retains API download length and filename ${fileName}`, async () => {
      records.getAttachments.resolves([{ fileId: 'file-1', name: 'metadata-name.txt', size: '5' }]);
      datastream.getDatastream.callsFake(async () => ({ readstream: Readable.from(['bytes']) }));
      const response = await f.request('/default/portal/api/records/datastreams/record-1/file-1' + fileName);
      assert.equal(response.status, 200);
      assert.equal(response.text, 'bytes');
      assert.equal(response.headers.get('content-length'), '5');
      assert.equal(
        response.headers.get('content-disposition'),
        `attachment; filename="${fileName === '?fileName=' ? 'metadata-name.txt' : 'renamed.csv'}"`
      );
    });
  }
  it('keeps the API attachment metadata gate', async () => {
    assert.equal((await f.request('/default/portal/api/records/datastreams/record-1/file-1')).status, 404);
    assert.equal(datastream.getDatastream.callCount, 0);
  });
  for (const denied of ['brand', 'acl']) {
    it(`denies generic datastream access for ${denied}`, async () => {
      if (denied === 'brand') records.getMeta.resolves({ metaMetadata: { brandId: 'other' } });
      else records.hasViewAccess.returns(false);
      assert.equal(
        (await f.request('/default/portal/record/record-1/datastream?datastreamId=export.csv')).status,
        denied === 'brand' ? 404 : 403
      );
      assert.equal(datastream.getDatastream.callCount, 0);
    });
  }
});
