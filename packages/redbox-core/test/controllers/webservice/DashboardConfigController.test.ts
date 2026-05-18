import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../../src/controllers/webservice/DashboardConfigController';

let expect: Chai.ExpectStatic;

describe('Webservice DashboardConfigController', () => {
  let controller: Controllers.DashboardConfig;
  let originalSails: any;
  let originalBrandingService: any;
  let originalDashboardConfigService: any;
  let originalDashboardTypesService: any;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalDashboardConfigService = (global as any).DashboardConfigService;
    originalDashboardTypesService = (global as any).DashboardTypesService;

    (global as any).sails = {
      log: {
        error: sinon.stub(),
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        trace: sinon.stub()
      }
    };
    (global as any).BrandingService = {
      getBrandFromReq: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).DashboardConfigService = {
      getDashboardConfigInfo: sinon.stub().resolves({
        recordTypes: [{ name: 'rdmp', steps: ['draft'] }],
        views: [{ name: 'consolidated', steps: ['consolidated'] }],
        dashboardTypes: []
      }),
      getDashboardOverrides: sinon.stub().resolves({ recordTypes: {}, views: {} }),
      saveDashboardOverrides: sinon.stub().resolves({ recordTypes: {}, views: {} }),
      getMergedDashboardTableConfig: sinon.stub().resolves({
        dashboardType: 'standard',
        inheritedTypeConfig: { rowConfig: [] },
        workflowConfig: null,
        overrideConfig: null,
        mergedConfig: { rowConfig: [] },
        formatRules: {}
      }),
      getMergedDashboardViewTableConfig: sinon.stub().resolves({
        dashboardType: 'standard',
        inheritedTypeConfig: { rowConfig: [] },
        workflowConfig: null,
        overrideConfig: null,
        mergedConfig: { rowConfig: [] },
        formatRules: {}
      }),
      saveWorkflowStateDashboardConfig: sinon.stub().resolves({ recordTypes: {}, views: {} }),
      saveDashboardViewStepConfig: sinon.stub().resolves({ recordTypes: {}, views: {} }),
      getMergedDashboardTypeFormatRules: sinon.stub().resolves({ filterBy: {}, queryFilters: {} })
    };
    (global as any).DashboardTypesService = {
      getAllDashboardTypeDefinitions: sinon.stub().resolves([
        {
          name: 'standard',
          formatRules: { filterBy: {} },
          tableConfig: { rowConfig: [] },
          searchable: true,
          system: true
        }
      ]),
      createDashboardType: sinon.stub().returns(of({
        name: 'standard',
        formatRules: { filterBy: {} },
        tableConfig: { rowConfig: [] },
        searchable: true,
        system: true
      })),
      getDashboardTypeDefinition: sinon.stub().resolves({
        name: 'standard',
        formatRules: { filterBy: {} },
        tableConfig: { rowConfig: [] },
        searchable: true,
        system: true
      }),
      updateDashboardType: sinon.stub().returns(of({
        name: 'standard',
        formatRules: { filterBy: {} },
        tableConfig: { rowConfig: [] },
        searchable: true,
        system: true
      })),
      deleteDashboardType: sinon.stub().returns(of({ deleted: true })),
      get: sinon.stub().returns(of({
        name: 'standard',
        formatRules: { filterBy: {} },
        tableConfig: { rowConfig: [] },
        searchable: true,
        system: true
      }))
    };

    controller = new Controllers.DashboardConfig();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).DashboardConfigService = originalDashboardConfigService;
    (global as any).DashboardTypesService = originalDashboardTypesService;
  });

  it('returns dashboard config info', async () => {
    const req = { session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getConfigInfo(req, res);

    expect((global as any).DashboardConfigService.getDashboardConfigInfo.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data?.recordTypes).to.deep.equal([{ name: 'rdmp', steps: ['draft'] }]);
  });

  it('creates dashboard types', async () => {
    const req = {
      session: { branding: 'default' },
      body: { name: 'my-type', formatRules: { filterBy: {} }, tableConfig: { rowConfig: [] } }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.createDashboardType(req, res);

    expect((global as any).DashboardTypesService.createDashboardType.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(201);
  });

  it('maps duplicate dashboard type errors to conflict responses', async () => {
    (global as any).DashboardTypesService.createDashboardType = sinon.stub().throws(new Error("Dashboard type 'my-type' already exists for brand 'default'"));
    const req = {
      session: { branding: 'default' },
      body: { name: 'my-type', formatRules: { filterBy: {} }, tableConfig: { rowConfig: [] } }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.createDashboardType(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(409);
  });

  it('maps system dashboard type delete errors to forbidden responses', async () => {
    (global as any).DashboardTypesService.deleteDashboardType = sinon.stub().throws(new Error("System dashboard type 'standard' cannot be deleted"));
    const param = sinon.stub();
    param.withArgs('dashboardType').returns('standard');
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.deleteDashboardType(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(403);
  });

  it('returns a merged workflow config', async () => {
    const param = sinon.stub();
    param.withArgs('recordType').returns('rdmp');
    param.withArgs('workflowStage').returns('draft');
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getMergedConfig(req, res);

    expect((global as any).DashboardConfigService.getMergedDashboardTableConfig.calledWithMatch({ id: 'brand-1' }, 'rdmp', 'draft')).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data?.dashboardType).to.equal('standard');
  });

  it('saves workflow state dashboard config', async () => {
    const param = sinon.stub();
    param.withArgs('recordType').returns('rdmp');
    param.withArgs('workflowStage').returns('draft');
    const req = {
      session: { branding: 'default' },
      param,
      body: { dashboardType: 'standard', tableConfig: { rowConfig: [] } }
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.saveWorkflowStateDashboardConfig(req, res);

    expect((global as any).DashboardConfigService.saveWorkflowStateDashboardConfig.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
  });

  it('returns merged type format rules', async () => {
    const param = sinon.stub();
    param.withArgs('dashboardType').returns('standard');
    const req = { session: { branding: 'default' }, param } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getMergedTypeFormatRules(req, res);

    expect((global as any).DashboardConfigService.getMergedDashboardTypeFormatRules.calledOnce).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data?.filterBy).to.deep.equal({});
  });
});
