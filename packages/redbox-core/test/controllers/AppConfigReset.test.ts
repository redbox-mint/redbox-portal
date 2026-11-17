import { expect } from 'chai';
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/AppConfigController';
import { resetAppConfigRoute } from '../../src/api-routes/groups/appconfig';
import { buildCoreApiRouteConfig, validateApiRouteRequest } from '../../src/api-routes';
import { policies } from '../../src/config/policies.config';
import { auth } from '../../src/config/auth.config';
import { checkAuth } from '../../src/policies/checkAuth';
import { Services as PathRules } from '../../src/services/PathRulesService';
import { createMockSails } from '../services/testHelper';

const path = '/default/rdmp/admin/appconfig/menu/reset';
describe('AppConfig reset endpoint', () => {
  let previous: any;
  let reset: sinon.SinonStub;
  let controller: Controllers.AppConfig;
  let response: any;
  beforeEach(() => {
    previous = (global as any).sails;
    (global as any).sails = createMockSails();
    reset = sinon.stub().resolves({ reset: true });
    sails.services.appconfigservice = { resetConfig: reset } as any;
    sails.services.brandingservice = {
      getBrandNameFromReq: (req: any) => req.params.branding,
      getBrand: (name: string) => ({ id: name + '-id', name }),
    } as any;
    controller = new Controllers.AppConfig();
    response = {
      json: sinon.stub(),
      badRequest: sinon.stub(),
      status: sinon.stub().returnsThis(),
      serverError: sinon.stub(),
    };
  });
  afterEach(() => {
    sinon.restore();
    (global as any).sails = previous;
  });
  it('registers POST with brand Admin authorization, session CSRF, no-cache and request validation', () => {
    expect((buildCoreApiRouteConfig() as any)['post ' + resetAppConfigRoute.path]).to.include({
      controller: 'AppConfigController',
      action: 'resetAppConfig',
      csrf: true,
    });
    expect((policies.AppConfigController as any).resetAppConfig).to.include.members([
      'noCache',
      'brandingAndPortal',
      'checkBrandingValid',
      'isWebServiceAuthenticated',
      'checkAuth',
      'validateApiContractRequest',
    ]);
    expect(auth.rules).to.deep.include({ path: resetAppConfigRoute.path, role: 'Admin', can_update: true });
  });
  for (const [name, authenticated, roleId, expected] of [
    ['anonymous', false, '', false],
    ['Researcher', true, 'researcher', false],
    ['another brand Admin', true, 'admin-other', false],
    ['route brand Admin', true, 'admin-default', true],
  ] as const) {
    it(`${expected ? 'allows' : 'denies'} ${name}`, () => {
      const names = ['BrandingService', 'RolesService', 'PathRulesService'];
      const originals = names.map(key => (global as any)[key]);
      try {
        const brand = { id: 'brand-default', name: 'default' };
        (global as any).BrandingService = { getBrand: () => brand };
        (global as any).RolesService = { getDefUnathenticatedRole: () => ({ id: 'guest' }) };
        const rules = new PathRules.PathRules();
        const rule = auth.rules.find(rule => rule.path === resetAppConfigRoute.path)!;
        sinon
          .stub(rules, 'getRulesFromPath')
          .returns([{ ...rule, role: { id: 'admin-default' }, branding: brand }] as any);
        (global as any).PathRulesService = rules;
        const next = sinon.stub();
        const res: any = { status: sinon.stub().returnsThis(), send: sinon.stub(), json: sinon.stub() };
        checkAuth(
          {
            path,
            headers: { 'content-type': 'application/json' },
            session: { branding: 'default' },
            isAuthenticated: () => authenticated,
            user: { roles: [{ id: roleId }] },
          } as any,
          res,
          next
        );
        expect(next.calledOnce).to.equal(expected);
        if (!expected) expect(res.status.calledWith(403)).to.equal(true);
      } finally {
        names.forEach((key, i) => {
          (global as any)[key] = originals[i];
        });
      }
    });
  }
  it('uses only the route brand even if the session contains another brand', async () => {
    const params: any = { branding: 'route', appConfigId: 'menu' };
    await controller.resetAppConfig(
      { body: {}, params, param: (name: string) => params[name], session: { branding: 'other' } } as any,
      response
    );
    expect(reset.calledOnceWithExactly({ id: 'route-id', name: 'route' }, 'menu')).to.equal(true);
    expect(response.json.calledWith({ reset: true })).to.equal(true);
  });
  it('rejects unknown and unsafe keys without touching data', async () => {
    for (const appConfigId of ['unknown-config', '__proto__', 'menu.items', 'constructor', undefined]) {
      await controller.resetAppConfig({ body: {}, param: () => appConfigId } as any, response);
    }
    expect(response.badRequest.callCount).to.equal(5);
    expect(reset.called).to.equal(false);
  });
  it('rejects tenant overrides and malformed input before service calls', async () => {
    for (const body of [{ branding: 'other' }, { configKey: 'homePanels' }, []]) {
      await controller.resetAppConfig({ body, param: () => 'menu' } as any, response);
    }
    expect(response.badRequest.callCount).to.equal(3);
    expect(reset.called).to.equal(false);
    expect(
      validateApiRouteRequest(
        { params: { appConfigId: 'menu.items' }, body: {}, query: {}, headers: {} } as any,
        resetAppConfigRoute
      ).valid
    ).to.equal(false);
  });
});
