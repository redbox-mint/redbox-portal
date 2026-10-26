import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountQueryReadRoutes } from '../../../src/http/express/queryReads';
import { mountIntegrationOperationRoutes } from '../../../src/http/express/integrationOperations';

describe('Search Express operations', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let records: Record<string, sinon.SinonStub>, search: Record<string, sinon.SinonStub>;
  beforeEach(async () => {
    records = { getMeta: sinon.stub(), getRecords: sinon.stub() };
    search = {
      index: sinon.stub().resolves(true),
      removeBrand: sinon.stub().resolves(),
      searchFuzzy: sinon.stub().resolves({}),
    };
    f = await httpRouteFixture((router, input) => {
      mountQueryReadRoutes(router, { ...input, search, returnFields: ['id', 'title'] } as any);
      mountIntegrationOperationRoutes(router, { ...input, search, records, audit: sinon.stub().resolves() } as any);
    });
  });
  afterEach(async () => {
    await f?.close();
  });
  it('fetches authorized record metadata before indexing', async () => {
    const record = { id: '123', metaMetadata: { brandId: f.brand.id }, metadata: { title: 'Test' } };
    records.getMeta.resolves(record);
    const result = await f.request('/default/portal/api/search/index?oid=123', { method: 'POST' });
    assert.equal(result.status, 200);
    assert(records.getMeta.calledOnceWithExactly('123'));
    assert(search.index.calledOnceWithExactly('123', record));
    assert.equal(result.body.oid, '123');
  });
  it('removes only the active brand index', async () => {
    const result = await f.request('/default/portal/api/search/removeAll', { method: 'POST' });
    assert.equal(result.status, 200);
    assert(search.removeBrand.calledOnceWithExactly(f.brand.id));
  });
  it('passes bracket-style exact and facet maps to the search domain', async () => {
    const result = await f.request(
      '/default/portal/api/search?searchStr=galaxy&exactNames[title]=Nebula&exactNames[creator]=Andromeda&facetNames[subject]=Astronomy'
    );
    assert.equal(result.status, 200);
    assert(search.searchFuzzy.calledOnce);
    const args = search.searchFuzzy.firstCall.args;
    assert.equal(args[3], 'galaxy');
    assert.deepEqual(args[4], [
      { name: 'title', value: 'Nebula' },
      { name: 'creator', value: 'Andromeda' },
    ]);
    assert.deepEqual(args[5], [{ name: 'subject', value: 'Astronomy' }]);
    assert.equal(args[6].id, f.brand.id);
    assert.deepEqual(args[9], ['id', 'title']);
  });
});
