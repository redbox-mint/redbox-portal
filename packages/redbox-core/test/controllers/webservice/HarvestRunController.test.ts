import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountQueryReadRoutes } from '../../../src/http/express/queryReads';
const base = '/default/portal/api/harvest-runs';
describe('Harvest history Express contracts', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let harvest: Record<string, sinon.SinonStub>;
  beforeEach(async () => {
    harvest = {
      listRuns: sinon.stub().resolves({ rows: [{ id: 'run-1', sourceRunId: 'run-a', status: 'running' }], total: 1 }),
      getRun: sinon.stub().resolves(null),
      runExists: sinon.stub().resolves(true),
      listRunEvents: sinon.stub().resolves({ rows: [{ id: 'event-1', harvestId: 'harvest-1' }], total: 1 }),
    };
    f = await httpRouteFixture((router, input) => mountQueryReadRoutes(router, { ...input, harvest } as any));
  });
  afterEach(async () => {
    await f?.close();
  });
  it('returns paginated runs', async () => {
    const result = await f.request(base + '?page=2&pageSize=5');
    assert.equal(result.status, 200);
    assert(harvest.listRuns.calledOnce);
    assert.equal(harvest.listRuns.firstCall.args[0].id, f.brand.id);
    assert.equal(harvest.listRuns.firstCall.args[1].page, 2);
    assert.equal(harvest.listRuns.firstCall.args[1].pageSize, 5);
    assert.equal(result.body.summary.numFound, 1);
  });
  it('caps run page size to the domain limit', async () => {
    const result = await f.request(base + '?page=2&pageSize=500');
    assert.equal(result.status, 200);
    assert.equal(harvest.listRuns.firstCall.args[1].pageSize, 100);
    assert.equal(result.body.summary.start, 100);
  });
  it('returns 404 for a missing run', async () => assert.equal((await f.request(base + '/run-1')).status, 404));
  it('returns paginated run events after verifying the run', async () => {
    const result = await f.request(base + '/run-1/events?page=1&pageSize=10');
    assert.equal(result.status, 200);
    assert(harvest.runExists.calledOnce);
    assert(harvest.listRunEvents.calledOnce);
    assert.equal(harvest.listRunEvents.firstCall.args[1], 'run-1');
    assert.deepEqual(result.body.records, [{ id: 'event-1', harvestId: 'harvest-1' }]);
  });
  it('caps event page size to the domain limit', async () => {
    const result = await f.request(base + '/run-1/events?page=3&pageSize=500');
    assert.equal(result.status, 200);
    assert(harvest.runExists.calledOnce);
    assert.equal(harvest.listRunEvents.firstCall.args[2].page, 3);
    assert.equal(harvest.listRunEvents.firstCall.args[2].pageSize, 100);
    assert.equal(result.body.summary.start, 200);
  });
  it('returns 404 for events of a missing run without reading events', async () => {
    harvest.runExists.resolves(false);
    assert.equal((await f.request(base + '/run-1/events?page=1&pageSize=10')).status, 404);
    assert(!harvest.listRunEvents.called);
  });
});
