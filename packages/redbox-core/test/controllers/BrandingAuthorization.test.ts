import * as sinon from 'sinon';

import { Controllers as BrandingAppControllers } from '../../src/controllers/BrandingAppController';
import { Controllers as BrandingControllers } from '../../src/controllers/BrandingController';
import { Controllers as WebserviceBrandingControllers } from '../../src/controllers/webservice/BrandingController';

let expect: Chai.ExpectStatic;

describe('branding controller resource authorization', function () {
  let previousBrandingService: unknown;
  let previousBrandingLogoService: unknown;
  let previousSails: unknown;
  let previousBrandingConfig: unknown;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    previousBrandingConfig = Reflect.get(globalThis, 'BrandingConfig');
    Reflect.set(globalThis, 'BrandingConfig', { findOne: sinon.stub().resolves({ draftRevision: 7 }) });
    previousBrandingService = Reflect.get(globalThis, 'BrandingService');
    previousBrandingLogoService = Reflect.get(globalThis, 'BrandingLogoService');
    previousSails = (globalThis as unknown as { sails: any }).sails;
    (globalThis as unknown as { sails: any }).sails = {
      config: {},
      log: {
        debug: sinon.stub(),
        error: sinon.stub(),
        warn: sinon.stub(),
        verbose: sinon.stub(),
      },
    };
    Reflect.set(globalThis, 'BrandingService', {
      getBrandFromReq: sinon.stub().returns({ id: 'brand-authorized', name: 'authorized' }),
      getPortalFromReq: sinon.stub().returns('rdmp'),
      saveDraft: sinon.stub().resolves({ id: 'brand-authorized', name: 'authorized' }),
      preview: sinon.stub().resolves({ token: 'token', url: '/preview', hash: 'hash' }),
    });
    Reflect.set(globalThis, 'BrandingLogoService', {});
  });

  afterEach(function () {
    sinon.restore();
    Reflect.set(globalThis, 'BrandingConfig', previousBrandingConfig);
    (globalThis as unknown as { sails: any }).sails = previousSails;
    if (previousBrandingService === undefined) Reflect.deleteProperty(globalThis, 'BrandingService');
    else Reflect.set(globalThis, 'BrandingService', previousBrandingService);
    if (previousBrandingLogoService === undefined) Reflect.deleteProperty(globalThis, 'BrandingLogoService');
    else Reflect.set(globalThis, 'BrandingLogoService', previousBrandingLogoService);
  });

  it('ignores a spoofed webservice route brand when saving a draft', async function () {
    const controller = new WebserviceBrandingControllers.Branding();
    const sendResp = sinon.stub(controller, 'sendResp');
    const req = {
      apiRequest: {
        params: { branding: 'foreign', portal: 'rdmp' },
        query: {},
        body: { variables: { primary: '#123456' } },
        files: {},
      },
      user: { id: 'admin' },
    } as unknown as Sails.Req;

    await controller.draft(req, {} as Sails.Res);

    expect(Reflect.get(globalThis, 'BrandingService').saveDraft.firstCall.args[0]).to.include({
      branding: 'authorized',
    });
    expect(sendResp.calledOnce).to.equal(true);
  });

  it('ignores a spoofed Angular-app route brand when saving a draft', async function () {
    const controller = new BrandingAppControllers.BrandingApp();
    const sendResp = sinon.stub(controller, 'sendResp');
    const req = {
      params: { branding: 'foreign', portal: 'rdmp' },
      body: { variables: { primary: '#123456' } },
      user: { id: 'admin' },
    } as unknown as Sails.Req;
    const response = { ok: sinon.stub() } as unknown as Sails.Res;

    await controller.draft(req, response);

    expect(Reflect.get(globalThis, 'BrandingService').saveDraft.firstCall.args[0]).to.include({
      branding: 'authorized',
    });
    expect(sendResp.calledOnce).to.equal(true);
  });

  it('uses the authorized brand for the legacy preview mutation', async function () {
    const controller = new BrandingControllers.Branding();
    sinon.stub(controller, 'sendResp');
    const req = {
      params: { branding: 'foreign', portal: 'rdmp' },
      param(name: string) {
        return (this as unknown as { params: Record<string, unknown> }).params[name];
      },
    } as unknown as Sails.Req;
    const response = { json: sinon.stub() } as unknown as Sails.Res;

    await controller.createPreview(req, response);

    expect(Reflect.get(globalThis, 'BrandingService').preview.calledOnceWith('authorized', 'rdmp')).to.equal(true);
  });
});
