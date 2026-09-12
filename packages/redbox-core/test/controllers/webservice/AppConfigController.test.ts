import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/AppConfigController';

let expect: Chai.ExpectStatic;
before(async () => { expect = (await import('chai')).expect; });

class TestAppConfigController extends Controllers.AppConfig {
  public override apiRespond = sinon.stub();
  public override sendResp = sinon.stub();
}

describe('Webservice AppConfigController override lifecycle', () => {
  const service = {
    getAppConfigByBrandAndKey: sinon.stub(), hasConfigOverride: sinon.stub(), resetConfigOverride: sinon.stub(),
  };
  const original = { sails: globalThis.sails, BrandingService: globalThis.BrandingService, AppConfigService: globalThis.AppConfigService };
  const brand = { id: 'brand-1', name: 'default' };
  const request = { session: { branding: 'default' }, apiRequest: { params: { appConfigId: 'systemMessage' }, query: {}, body: undefined, files: {} } } as Sails.Req;
  let controller: TestAppConfigController;
  let setHeader: sinon.SinonStub;
  let response: Sails.Res;

  beforeEach(() => {
    Object.values(service).forEach(stub => stub.reset());
    Object.assign(globalThis, { sails: { log: { error: sinon.stub() } }, BrandingService: { getBrand: () => brand }, AppConfigService: service });
    controller = new TestAppConfigController();
    setHeader = sinon.stub();
    response = { setHeader } as unknown as Sails.Res;
  });
  afterEach(() => { Object.assign(globalThis, original); });

  for (const overridden of [false, true]) {
    it(`reports the ${overridden ? 'persisted override' : 'default'} source without changing the response body`, async () => {
      service.getAppConfigByBrandAndKey.resolves({ enabled: false });
      service.hasConfigOverride.resolves(overridden);
      await controller.getAppConfig(request, response);
      expect(setHeader.calledWithExactly('X-ReDBox-Config-Source', overridden ? 'override' : 'default')).to.equal(true);
      expect(controller.apiRespond.calledWithExactly(request, response, { enabled: false }, 200)).to.equal(true);
    });
  }

  it('resets only the validated key in the authenticated brand', async () => {
    service.resetConfigOverride.resolves({ enabled: false });
    await controller.resetAppConfig(request, response);
    expect(service.resetConfigOverride.calledWithExactly(brand, 'systemMessage')).to.equal(true);
    expect(setHeader.calledWithExactly('X-ReDBox-Config-Source', 'default')).to.equal(true);
    expect(controller.apiRespond.calledWithExactly(request, response, { enabled: false }, 200)).to.equal(true);
  });

  it('does not acknowledge a failed reset', async () => {
    service.resetConfigOverride.rejects(new Error('Storage unavailable'));
    await controller.resetAppConfig(request, response);
    expect(controller.apiRespond.called).to.equal(false);
    expect(controller.sendResp.firstCall.args[2].status).to.equal(500);
  });
});
