import { expect } from 'chai';
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/AppConfigController';
import { testIntegrationConnectionRoute, integrationConnectionBody } from '../../src/api-routes/groups/appconfig';
import { buildCoreApiRouteConfig } from '../../src/api-routes';
import { policies } from '../../src/config/policies.config';
import { auth } from '../../src/config/auth.config';
import { checkAuth } from '../../src/policies/checkAuth';
import { Services as PathRules } from '../../src/services/PathRulesService';
import { createMockSails } from '../services/testHelper';
const path = '/default/rdmp/admin/appconfig/figsharePublishing/test-connection';
describe('Admin integration connection endpoint', () => {
  let previous: any;
  let test: sinon.SinonStub;
  let controller: Controllers.AppConfig;
  let response: any;
  const result = { ok: true, status: 'ok', latencyMs: 100, message: 'Connection OK' };
  beforeEach(() => {
    previous = (global as any).sails;
    (global as any).sails = createMockSails();
    test = sinon.stub().resolves({ result });
    sails.services.appconfigservice = { testConnection: test } as any;
    sails.services.brandingservice = { getBrandNameFromReq: (req: any) => req.params.branding } as any;
    controller = new Controllers.AppConfig();
    response = { json: sinon.stub(), badRequest: sinon.stub(), set: sinon.stub(), status: sinon.stub().returnsThis() };
  });
  afterEach(() => { sinon.restore(); (global as any).sails = previous; });
  it('registers POST with brand Admin authorization, session CSRF, no-cache and request validation', () => {
    expect((buildCoreApiRouteConfig() as any)['post ' + testIntegrationConnectionRoute.path]).to.include({
      controller: 'AppConfigController',
      action: 'testConnection',
      csrf: true,
    });
    expect((policies.AppConfigController as any).testConnection).to.include.members([
      'noCache',
      'brandingAndPortal',
      'checkBrandingValid',
      'isWebServiceAuthenticated',
      'checkAuth',
      'validateApiContractRequest',
    ]);
    expect(auth.rules).to.deep.include({ path: testIntegrationConnectionRoute.path, role: 'Admin', can_update: true });
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
        const rule = auth.rules.find(rule => rule.path === testIntegrationConnectionRoute.path)!;
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

  const request = (key = 'figsharePublishing', body: any = { draft: { connection: { token: '' } } }) => ({
    body, params: { branding: 'route' }, param: () => key, session: { branding: 'other' }, user: { id: 'admin-id' },
  } as any);
  it('uses the route brand and authenticated actor, never a session/body override', async () => {
    await controller.testConnection(request(), response);
    expect(test.calledOnceWithExactly('route', 'admin-id', 'figsharePublishing', { connection: { token: '' } })).to.equal(true);
    expect(response.json.calledWith(result)).to.equal(true);
  });
  it('returns a safe 429 with Retry-After for throttled tests', async () => {
    test.resolves({ result: { ...result, ok: false }, retryAfter: 5 });
    await controller.testConnection(request(), response);
    expect(response.status.calledWith(429)).to.equal(true);
    expect(response.set.calledWith('Retry-After', '5')).to.equal(true);
  });
  it('never logs or returns raw service errors', async () => {
    const logger = sails.log.error as sinon.SinonStub;
    test.rejects(new Error('secret upstream body'));
    await controller.testConnection(request(), response);
    expect(JSON.stringify(response.json.firstCall.args)).not.to.contain('secret upstream body');
    expect(logger.called).to.equal(false);
  });
  it('rejects unknown integration keys and tenant injection before service calls', async () => {
    await controller.testConnection(request('unknown'), response);
    await controller.testConnection(request('figsharePublishing', { branding: 'other' }), response);
    expect(response.badRequest.callCount).to.equal(2);
    expect(test.called).to.equal(false);
    expect(integrationConnectionBody.safeParse({ draft: {}, userId: 'someone' }).success).to.equal(false);
  });
});
