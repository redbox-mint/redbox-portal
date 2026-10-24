import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountQueryReadRoutes } from '../../../src/http/express/queryReads';

describe('Integration audit Express reads', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let integrationLog: sinon.SinonStub;
  beforeEach(async () => {
    integrationLog = sinon.stub().resolves({ rows: [{ redboxOid: 'oid-1', status: 'success' }], total: 11 });
    f = await httpRouteFixture((router, input) =>
      mountQueryReadRoutes(router, { ...input, audit: { integrationLog } } as any)
    );
  });
  afterEach(async () => {
    await f?.close();
  });
  it('returns paginated audit data through the authorized record audit domain', async () => {
    const result = await f.request(
      '/default/portal/api/integration-audit/oid-1?status=success&dateFrom=2025-01-01T00:00:00Z&dateTo=2025-01-02T00:00:00Z&page=2&pageSize=5'
    );
    assert.equal(result.status, 200);
    assert(integrationLog.calledOnce);
    const [brand, user, oid, params] = integrationLog.firstCall.args;
    assert.equal(brand.id, f.brand.id);
    assert.equal(user.username, f.actor.username);
    assert.equal(oid, 'oid-1');
    assert.equal(params.status, 'success');
    assert.equal(params.page, 2);
    assert.equal(params.pageSize, 5);
    assert.equal(params.dateFrom.toISOString(), '2025-01-01T00:00:00.000Z');
    assert.equal(params.dateTo.toISOString(), '2025-01-02T00:00:00.000Z');
    assert.equal(result.body.summary.page, 2);
    assert.equal(result.body.summary.numFound, 11);
    assert.deepEqual(result.body.records, [{ redboxOid: 'oid-1', status: 'success' }]);
  });
  for (const [label, query] of [
    ['status', 'status=not-valid'],
    ['date', 'dateFrom=not-a-date'],
    ['page', 'page=0'],
  ]) {
    it(`returns 400 for invalid ${label} without reading audit data`, async () => {
      assert.equal((await f.request('/default/portal/api/integration-audit/oid-1?' + query)).status, 400);
      assert(!integrationLog.called);
    });
  }
});
