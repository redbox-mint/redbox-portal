import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountMetadataReadRoutes } from '../../src/http/express/metadata';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});
describe('Owned browser record metadata', function () {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let recordTypes: { get: sinon.SinonStub },
    workflowSteps: { getAllForRecordType: sinon.SinonStub },
    dashboardTypes: { getDashboardTableConfig: sinon.SinonStub; getDashboardView: sinon.SinonStub };
  const base = '/default/portal';
  beforeEach(async () => {
    recordTypes = { get: sinon.stub().returns(of({ id: 'rt-1', name: 'dataset' })) };
    workflowSteps = { getAllForRecordType: sinon.stub().returns(of([{ name: 'draft' }, { name: 'review' }])) };
    dashboardTypes = { getDashboardTableConfig: sinon.stub().resolves(null), getDashboardView: sinon.stub() };
    f = await httpRouteFixture((router, input) =>
      mountMetadataReadRoutes(router, { ...input, recordTypes, workflowSteps, dashboardTypes } as any)
    );
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  it('rejects missing normalized record type before discovery', async function () {
    const response = await f.request(base + '/record/wfSteps/%20%20');
    expect(response.status).to.equal(400);
    expect(recordTypes.get.called).to.equal(false);
    expect(workflowSteps.getAllForRecordType.called).to.equal(false);
  });
  it('rejects invalid record types before workflow discovery', async function () {
    recordTypes.get.returns(of(null));
    const response = await f.request(base + '/record/wfSteps/dataset');
    expect(response.status).to.equal(400);
    expect(response.body.message).to.equal('Record Type provided is not valid');
    expect(recordTypes.get.calledOnceWithMatch({ id: 'brand-1' }, 'dataset')).to.equal(true);
    expect(workflowSteps.getAllForRecordType.called).to.equal(false);
  });
  it('returns workflow steps for a valid trimmed record type', async function () {
    const response = await f.request(base + '/record/wfSteps/%20dataset%20');
    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal([{ name: 'draft' }, { name: 'review' }]);
    expect(recordTypes.get.calledOnceWithMatch({ id: 'brand-1' }, 'dataset')).to.equal(true);
    expect(
      workflowSteps.getAllForRecordType.calledOnceWithExactly(
        await import('rxjs').then(({ firstValueFrom }) => firstValueFrom(recordTypes.get.firstCall.returnValue))
      )
    ).to.equal(true);
  });
  it('resolves dashboard columns and filters without mutating cached workflow steps', async function () {
    const steps = [{ name: 'draft', config: { workflow: { stage: 'draft' }, form: 'dataset-draft' } }],
      snapshot = structuredClone(steps),
      table = {
        rowConfig: [{ title: 'Owned title', variable: 'metadata.title' }],
        formatRules: { filterBy: { filterMode: 'equal' } },
      };
    workflowSteps.getAllForRecordType.returns(of(steps));
    dashboardTypes.getDashboardTableConfig.resolves(table);
    const response = await f.request(base + '/record/wfSteps/dataset');
    expect(response.status).to.equal(200);
    expect(dashboardTypes.getDashboardTableConfig.calledOnceWithMatch({ id: 'brand-1' }, 'dataset', 'draft')).to.equal(
      true
    );
    expect(response.body[0].config).to.deep.equal({ ...snapshot[0].config, dashboard: { table } });
    expect(steps).to.deep.equal(snapshot);
  });
  it('returns safe dashboard view metadata without its table implementation', async function () {
    const view = {
      name: 'consolidated',
      titleLabelKey: 'consolidated',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      showAdminSideBar: true,
      steps: [
        {
          name: 'consolidated',
          sourceRecordType: 'rdmp',
          fetchMode: 'allForRecordType',
          dashboardTable: { rowConfig: [] },
        },
      ],
    };
    dashboardTypes.getDashboardView.returns(view);
    const response = await f.request(base + '/dashboard/view/consolidated');
    expect(response.status).to.equal(200);
    expect(dashboardTypes.getDashboardView.calledOnceWithExactly('consolidated')).to.equal(true);
    expect(response.body).to.include({
      name: 'consolidated',
      titleLabelKey: 'consolidated',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      showAdminSideBar: true,
    });
    expect(response.body.steps).to.deep.equal([
      { name: 'consolidated', sourceRecordType: 'rdmp', fetchMode: 'allForRecordType' },
    ]);
  });
  it('returns404 for malformed dashboard view definitions', async function () {
    dashboardTypes.getDashboardView.returns({
      titleLabelKey: 'malformed',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      steps: [],
    });
    const response = await f.request(base + '/dashboard/view/malformed');
    expect(response.status).to.equal(404);
    expect(response.body.message).to.equal('Dashboard view provided is not valid');
  });
});
