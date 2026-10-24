import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountHarvestMutationRoutes, harvestMutationRoutes } from '../../src/http/express/harvestMutations';
import { isRecordSaveContext } from '../../src/RecordSaveResponse';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});
describe('Owned harvest HTTP delegation', function () {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  const harvest = {
    submitChunk: sinon.stub(),
    submitCompatibilityRecords: sinon.stub(),
    submitLegacyRecords: sinon.stub(),
  };
  const types = { get: sinon.stub() };
  beforeEach(async () => {
    types.get.returns(of({ name: 'dataset' }));
    for (const stub of Object.values(harvest)) (stub.reset(), stub.resolves({ success: true }));
    f = await httpRouteFixture((router, input) =>
      mountHarvestMutationRoutes(router, { ...input, harvest, recordTypes: types })
    );
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  async function request(body: unknown, legacy = false, query = '') {
    const route = harvestMutationRoutes.find(r => r.action === (legacy ? 'legacyHarvest' : 'harvest'))!;
    return f.request(
      route.path.replace(':branding', 'default').replace(':portal', 'other').replace(':recordType', 'dataset') + query,
      { method: route.method.toUpperCase(), body }
    );
  }
  it('delegates validated compatibility records with a trusted create context', async function () {
    const body = {
      records: [{ harvestId: 'harvest-1', recordRequest: { metadata: { title: 'Validated harvest metadata' } } }],
    };
    expect((await request(body)).status).to.equal(200);
    expect(harvest.submitCompatibilityRecords.calledOnce).to.equal(true);
    expect(harvest.submitCompatibilityRecords.firstCall.args[2]).to.deep.equal(body);
    const context = harvest.submitCompatibilityRecords.firstCall.args[5];
    expect(isRecordSaveContext(context)).to.equal(true);
    expect(context).to.include({ operation: 'create', portal: 'other' });
  });
  it('delegates tracked chunks with a trusted create context', async function () {
    const body = {
      sourceRunId: 'source-run-1',
      sourceName: 'source-a',
      chunk: { index: 1 },
      records: [
        { harvestId: 'harvest-1', operation: 'upsert', recordRequest: { metadata: { title: 'Tracked metadata' } } },
      ],
    };
    expect((await request(body)).status).to.equal(200);
    expect(harvest.submitChunk.calledOnce).to.equal(true);
    expect(harvest.submitChunk.firstCall.args[2]).to.deep.equal(body);
    const context = harvest.submitChunk.firstCall.args[4];
    expect(isRecordSaveContext(context)).to.equal(true);
    expect(context).to.include({ operation: 'create', portal: 'other' });
  });
  it('rejects updateMode on tracked chunks without delegation', async function () {
    const response = await request(
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [{ harvestId: 'harvest-1' }],
      },
      false,
      '?updateMode=merge'
    );
    expect(response.status).to.equal(400);
    expect(harvest.submitChunk.called).to.equal(false);
  });
  it('delegates validated legacy records with a trusted create context', async function () {
    const body = {
      records: [{ harvest_id: 'legacy-harvest-1', metadata: { data: { title: 'Validated legacy metadata' } } }],
    };
    expect((await request(body, true)).status).to.equal(200);
    expect(harvest.submitLegacyRecords.calledOnce).to.equal(true);
    expect(harvest.submitLegacyRecords.firstCall.args[2]).to.deep.equal(body);
    const context = harvest.submitLegacyRecords.firstCall.args[5];
    expect(isRecordSaveContext(context)).to.equal(true);
    expect(context).to.include({ operation: 'create', portal: 'other' });
  });
});
