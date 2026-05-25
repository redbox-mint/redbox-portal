import * as sinon from 'sinon';

import { Controllers } from '../../../src/controllers/webservice/HarvestRunController';

let expect: Chai.ExpectStatic;

describe('Webservice HarvestRunController', () => {
  let controller: Controllers.HarvestRun;
  let originalSails: any;
  let originalBrandingService: any;
  let originalHarvestRunService: any;
  let originalLodash: any;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalHarvestRunService = (global as any).HarvestRunService;
    originalLodash = (global as any)._;

    (global as any).sails = {
      log: {
        error: sinon.stub(),
        verbose: sinon.stub(),
      },
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).HarvestRunService = {
      listRuns: sinon.stub().resolves({ rows: [{ id: 'run-1', sourceRunId: 'run-a', status: 'running' }], total: 1 }),
      getRun: sinon.stub().resolves({
        run: { id: 'run-1', sourceRunId: 'run-a', status: 'running' },
        chunks: [],
        events: [],
        aggregateCounts: {
          totalProcessed: 0,
          created: 0,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          failed: 0,
          chunksProcessed: 0,
          duplicateChunks: 0,
        },
      }),
      listRunEvents: sinon.stub().resolves({ rows: [{ id: 'event-1', harvestId: 'harvest-1' }], total: 1 }),
    };
    (global as any)._ = require('lodash');

    controller = new Controllers.HarvestRun();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).HarvestRunService = originalHarvestRunService;
    (global as any)._ = originalLodash;
  });

  it('returns paginated runs', async () => {
    const req = {
      session: { branding: 'default' },
      apiRequest: {
        params: {},
        query: { page: '2', pageSize: '5' },
        body: {},
        files: {},
      },
    } as unknown as Sails.Req;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.listRuns(req, {} as Sails.Res);

    expect((global as any).HarvestRunService.listRuns.calledOnce).to.equal(true);
    expect((global as any).HarvestRunService.listRuns.firstCall.args[1]).to.include({ page: 2, pageSize: 5 });
    expect(sendRespStub.calledOnce).to.equal(true);
    expect(sendRespStub.firstCall.args[2]?.data?.summary?.numFound).to.equal(1);
  });

  it('returns 404 when a run is not found', async () => {
    (global as any).HarvestRunService.getRun.resolves(null);
    const req = {
      session: { branding: 'default' },
      apiRequest: {
        params: { id: 'run-1' },
        query: {},
        body: {},
        files: {},
      },
    } as unknown as Sails.Req;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getRun(req, {} as Sails.Res);

    expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
  });

  it('returns paginated run events', async () => {
    const req = {
      session: { branding: 'default' },
      apiRequest: {
        params: { id: 'run-1' },
        query: { page: '1', pageSize: '10' },
        body: {},
        files: {},
      },
    } as unknown as Sails.Req;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.listRunEvents(req, {} as Sails.Res);

    expect((global as any).HarvestRunService.listRunEvents.calledOnce).to.equal(true);
    expect((global as any).HarvestRunService.listRunEvents.firstCall.args[1]).to.equal('run-1');
    expect(sendRespStub.firstCall.args[2]?.data?.records).to.deep.equal([{ id: 'event-1', harvestId: 'harvest-1' }]);
  });
});
