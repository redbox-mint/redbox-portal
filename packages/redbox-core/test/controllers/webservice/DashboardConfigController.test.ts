import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/DashboardConfigController';
import { Controllers as AdminControllers } from '../../../src/controllers/DashboardConfigController';
import { Services } from '../../../src/services/DashboardConfigService';

let expect: Chai.ExpectStatic;

describe('Webservice DashboardConfigController', () => {
  let controller: Controllers.DashboardConfig;
  let originalSails: any;
  let originalBrandingService: any;
  let originalDashboardConfigService: any;

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  function request(params: Record<string, string> = {}, body?: unknown): Sails.Req {
    const all: Record<string, string> = { branding: 'default', portal: 'rdmp', ...params };
    return { param: (name: string) => all[name], body, session: { branding: 'default' } } as unknown as Sails.Req;
  }

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalDashboardConfigService = (global as any).DashboardConfigService;
    (global as any).sails = { log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), trace: sinon.stub() } };
    (global as any).BrandingService = {
      getBrand: sinon.stub().callsFake((name: string) => (name === 'default' ? { id: 'brand-1', name: 'default' } : undefined)),
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).DashboardConfigService = {
      getTargetCatalogue: sinon.stub().resolves({ targets: [{ key: 'k' }], removed: [], fingerprint: 'fp' }),
      getTargetSettings: sinon.stub().resolves({ revision: 3 }),
      saveTargetSettings: sinon.stub().resolves({ revision: 4 }),
      validateTargetSettings: sinon.stub().resolves({ errors: [], warnings: [] }),
      previewCopy: sinon.stub().resolves({ changes: [] }),
      applyCopy: sinon.stub().resolves({ updated: 2 }),
      preflightLegacyMigration: sinon.stub().resolves([{ brand: { id: 'brand-1', name: 'default' } }])
    };
    controller = new Controllers.DashboardConfig();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).DashboardConfigService = originalDashboardConfigService;
  });

  it('lists targets for the route brand without profiles', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    await controller.listTargets(request(), {} as Sails.Res);
    expect((global as any).DashboardConfigService.getTargetCatalogue.firstCall.args[0]).to.deep.equal({ id: 'brand-1', name: 'default' });
    expect(sendResp.firstCall.args[2].data).to.deep.equal({ targets: [{ key: 'k' }], catalogueFingerprint: 'fp' });
  });

  it('does not fall back to the default brand for an unknown brand', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    await controller.listTargets(request({ branding: 'other' }), {} as Sails.Res);
    expect(sendResp.firstCall.args[2].status).to.equal(404);
    expect((global as any).DashboardConfigService.getTargetCatalogue.called).to.equal(false);
  });

  it('delegates workflow and view reads and saves with typed targets', async () => {
    sinon.stub(controller as any, 'sendResp');
    await controller.getWorkflowTarget(request({ recordType: 'rdmp', stage: 'draft' }), {} as Sails.Res);
    await controller.saveViewTarget(request({ view: 'consolidated', step: 'main' }, { expectedRevision: 3, settings: {} }), {} as Sails.Res);
    const svc = (global as any).DashboardConfigService;
    expect(svc.getTargetSettings.firstCall.args[1]).to.deep.equal({ kind: 'workflow', recordType: 'rdmp', stage: 'draft' });
    expect(svc.saveTargetSettings.firstCall.args[1]).to.deep.equal({ kind: 'view', view: 'consolidated', step: 'main' });
    expect(svc.saveTargetSettings.firstCall.args[2]).to.deep.equal({ expectedRevision: 3, settings: {} });
  });

  it('rejects a non-object body', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    await controller.applyCopy(request({}, 'nope'), {} as Sails.Res);
    expect(sendResp.firstCall.args[2].status).to.equal(400);
    expect((global as any).DashboardConfigService.applyCopy.called).to.equal(false);
  });

  it('translates typed errors to status codes with structured details', async () => {
    (global as any).DashboardConfigService.saveTargetSettings = sinon.stub().rejects(new Services.DashboardConfigError('warnings-require-review', 'Review warnings', { warnings: [{ id: 'w1' }], validationFingerprint: 'v' }));
    const sendResp = sinon.stub(controller as any, 'sendResp');
    await controller.saveWorkflowTarget(request({ recordType: 'rdmp', stage: 'draft' }, { expectedRevision: 1, settings: {} }), {} as Sails.Res);
    const response = sendResp.firstCall.args[2];
    expect(response.status).to.equal(409);
    expect(response.displayErrors[0].code).to.equal('warnings-require-review');
    expect(response.meta).to.deep.equal({ warnings: [{ id: 'w1' }], validationFingerprint: 'v' });
  });

  it('passes the route brand to migration preflight', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    await controller.migrationPreflight(request(), {} as Sails.Res);
    const svc = (global as any).DashboardConfigService;
    expect(svc.preflightLegacyMigration.firstCall.args[0]).to.deep.equal({ id: 'brand-1', name: 'default' });
    expect(sendResp.firstCall.args[2].data.reports).to.deep.equal([{ brand: { id: 'brand-1', name: 'default' } }]);
  });

  it('returns 410 for retired profile, default and override operations', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    await controller.retiredOperation(request(), {} as Sails.Res);
    const response = sendResp.firstCall.args[2];
    expect(response.status).to.equal(410);
    expect(response.displayErrors[0].code).to.equal('legacy-operation-retired');
    expect(response.displayErrors[0].detail).to.contain('/api/dashboard-config/targets');
  });

  it('exposes the same operations on the CSRF-protected admin controller', () => {
    const admin = new AdminControllers.DashboardConfig();
    const exported = (admin as any)._exportedMethods as string[];
    expect(exported).to.include.members(['editor', 'listTargets', 'saveWorkflowTarget', 'saveViewTarget', 'validateSettings', 'previewCopy', 'applyCopy']);
    expect(exported).to.not.include('retiredOperation');
  });
});
