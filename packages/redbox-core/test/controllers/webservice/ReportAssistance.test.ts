import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import UrlPattern from 'url-pattern';
import { Controllers } from '../../../src/controllers/webservice/ReportController';
import { Controllers as AdminControllers } from '../../../src/controllers/ReportController';
import { policies } from '../../../src/config/policies.config';
import { routes } from '../../../src/config/routes.config';
import { reportsApiRoutes } from '../../../src/api-routes/groups/reports';
import { namedQueryEditorRoutes } from '../../../src/api-routes/groups/named-query';
import { checkAuth } from '../../../src/policies/checkAuth';
import { namedQueryMutationCsrf } from '../../../src/policies/namedQueryMutationCsrf';
import { Services as PathServices } from '../../../src/services/PathRulesService';
import { NamedQueryAssistanceError, NAMED_QUERY_PREVIEW_LIMITS } from '../../../src/utilities/NamedQueryPreview';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from '../../services/testHelper';

const brand = { id: 'a', name: 'brand-a' };
const actions = ['describeQuery', 'validateConfig', 'previewConfig'] as const;
describe('Report assistance HTTP boundary', () => {
  class Controller extends Controllers.Report {
    public override sendResp(...args: Parameters<Controllers.Report['sendResp']>) {
      return super.sendResp(...args);
    }
  }
  class AdminController extends AdminControllers.Report {
    public override sendResp(...args: Parameters<AdminControllers.Report['sendResp']>) {
      return super.sendResp(...args);
    }
  }
  let controller: Controller;
  let service: Record<(typeof actions)[number], sinon.SinonStub>;
  let previous: Map<string, unknown>;
  const request = () => ({
    method: 'POST',
    path: '/brand-a/rdmp/api/report-config/preview',
    session: { branding: 'brand-a' },
    headers: {},
    body: { name: 'draft', title: 'Draft', reportSource: 'database', branding: 'attacker' },
    user: { username: 'report-author', roles: [{ id: 'reports', name: 'ReportAuthor' }] },
    apiRequest: {
      params: { name: 'selected' },
      query: { property: 'metadata.projectTitle', multivalue: 'true' },
      body: { name: 'validated-draft' },
    },
    param: (key: string) => ({ portal: 'rdmp' })[key],
    isAuthenticated: () => true,
  });
  beforeEach(() => {
    previous = new Map(
      ['ReportsService', 'BrandingService', 'TranslationService', 'PathRulesService'].map(name => [
        name,
        Reflect.get(globalThis, name),
      ])
    );
    setupServiceTestGlobals(createMockSails());
    controller = new Controller();
    service = Object.fromEntries(
      actions.map(action => [action, sinon.stub().resolves({ valid: true, diagnostics: [] })])
    ) as Record<(typeof actions)[number], sinon.SinonStub>;
    Object.assign(globalThis, {
      ReportsService: service,
      BrandingService: { getBrand: sinon.stub().returns(brand) },
      TranslationService: { t: (value: string) => value },
    });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    for (const [name, value] of previous) Reflect.set(globalThis, name, value);
  });
  for (const action of actions)
    it(`${action} uses the session brand and report caller, disables caching and uses validated input`, async () => {
      const req = request();
      const send = sinon.stub(controller, 'sendResp');
      await controller[action](req as unknown as Sails.Req, {} as Sails.Res);
      assert.equal(service[action].firstCall.args[0], brand);
      if (action === 'previewConfig') {
        assert.equal(service[action].firstCall.args[1], req.apiRequest.body);
        assert.equal(service[action].firstCall.args[3].caller.user, req.user);
        assert.equal(service[action].firstCall.args[3].portal, 'rdmp');
      } else {
        assert.equal(service[action].firstCall.args[1], 'rdmp');
        assert.equal(service[action].firstCall.args[2].user, req.user);
        if (action === 'validateConfig') assert.equal(service[action].firstCall.args[3], req.apiRequest.body);
        else
          assert.deepEqual(service[action].firstCall.args.slice(3), [
            'selected',
            'metadata.projectTitle',
            true,
            undefined,
          ]);
      }
      assert.equal(send.firstCall.args[2]?.headers?.['Cache-Control'], 'no-store');
    });
  for (const endpoint of ['api', 'admin']) it(`${endpoint} preview filters do not leak report body properties`, async () => {
    const req = { ...request(), query: { title: 'coral', created_fromDate: '2026-01-01' },
      param: (key: string) => ({ portal: 'rdmp', title: 'Report title', name: 'report-name' })[key] };
    const target = endpoint === 'api' ? controller : new AdminController();
    sinon.stub(target, 'sendResp');
    await target.previewConfig(req as unknown as Sails.Req, {} as Sails.Res);
    const parameters = service.previewConfig.firstCall.args[2] as Sails.ReqParamProvider;
    assert.equal(parameters.param('title'), 'coral');
    assert.equal(parameters.param('name'), undefined);
    assert.equal(parameters.param('created_fromDate'), '2026-01-01');
    req.query.title = '';
    assert.equal(parameters.param('title'), '');
  });
  it('keeps completed validation diagnostics available in v1 and v2', async () => {
    service.validateConfig.resolves({ valid: false, diagnostics: [{ code: 'INVALID_REPORT', severity: 'error' }] });
    const res = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    for (const version of ['1.0', '2.0']) {
      const req = { ...request(), headers: { 'x-redbox-api-version': version } };
      await controller.validateConfig(req as unknown as Sails.Req, res as unknown as Sails.Res);
      const body = res.json.lastCall.args[0];
      assert.equal((version === '2.0' ? body.data : body).diagnostics[0].code, 'INVALID_REPORT');
      assert.equal(res.status.lastCall.args[0], 200);
    }
  });
  it('bounds HTTP responses before serialization and hides unexpected exception content', async () => {
    const send = sinon.stub(controller, 'sendResp');
    service.previewConfig.resolves({ repeated: Array(1000).fill('x'.repeat(10000)) });
    await controller.previewConfig(request() as unknown as Sails.Req, {} as Sails.Res);
    assert.equal(send.lastCall.args[2]?.status, 413);
    service.previewConfig.rejects(new Error('PRIVATE RECORD OR TEMPLATE'));
    await controller.previewConfig(request() as unknown as Sails.Req, {} as Sails.Res);
    assert.equal(send.lastCall.args[2]?.status, 500);
    assert(!JSON.stringify(send.lastCall.args[2]).includes('PRIVATE'));
  });
  for (const [code, status] of [
    ['FORBIDDEN', 403],
    ['QUERY_NOT_FOUND', 404],
    ['INPUT_LIMIT', 413],
    ['PREVIEW_TIMEOUT', 408],
  ] as const)
    it(`returns safe ${code} failures`, async () => {
      const send = sinon.stub(controller, 'sendResp');
      service.describeQuery.rejects(new NamedQueryAssistanceError(code, status));
      await controller.describeQuery(request() as unknown as Sails.Req, {} as Sails.Res);
      assert.equal(send.firstCall.args[2]?.status, status);
      assert.equal(send.firstCall.args[2]?.displayErrors?.[0].code, code);
    });
  it('retains the existing saved-description URL with the report-owned context extension', () => {
    const route = namedQueryEditorRoutes.find(
      route => route.path === '/:branding/:portal/api/report-config/named-query/:name/description'
    );
    assert.equal(route?.controller, 'webservice/ReportController');
    assert.equal(route?.action, 'describeQuery');
  });
  it('uses report path rules for custom roles and denies unauthorized and other-brand roles', () => {
    class Rules extends PathServices.PathRules {
      setRules(value: typeof this.rulePatterns) {
        this.rulePatterns = value;
      }
    }
    const rules = new Rules();
    rules.setRules([
      {
        pattern: new UrlPattern('/:branding/:portal/api/report-config(/*)'),
        rule: { role: { id: 'reports' }, branding: brand, can_update: true },
      },
      {
        pattern: new UrlPattern('/:branding/:portal/api/report-config(/*)'),
        rule: { role: { id: 'other-brand' }, branding: { id: 'b', name: 'brand-b' }, can_update: true },
      },
    ]);
    Object.assign(globalThis, { PathRulesService: rules });
    for (const role of ['reports', 'other-brand', 'unauthorized'])
      for (const suffix of ['validate', 'preview', 'named-query/selected/description']) {
        const req = {
          ...request(),
          path: `/brand-a/rdmp/api/report-config/${suffix}`,
          user: { username: 'author', roles: [{ id: role }] },
        };
        const next = sinon.stub();
        const res = { status: sinon.stub().returnsThis(), send: sinon.stub() };
        checkAuth(req as unknown as Sails.Req, res as unknown as Sails.Res, next);
        assert.equal(next.calledOnce, role === 'reports');
        if (role !== 'reports') assert.equal(res.status.firstCall.args[0], 403);
      }
    const chain = policies['webservice/ReportController'];
    assert(chain && typeof chain === 'object' && !Array.isArray(chain));
    for (const action of actions) {
      assert(
        Array.isArray(chain[action]) &&
          chain[action].includes('checkAuth') &&
          chain[action].includes('isWebServiceAuthenticated')
      );
      assert(!chain[action].includes('emailTemplateAdmin'));
    }
  });
  it('requires CSRF on draft POSTs and browser saves, retaining bearer save compatibility', () => {
    for (const action of ['validateConfig', 'previewConfig']) {
      const route = reportsApiRoutes.find(route => route.action === action);
      assert(route && route.csrf === true);
      assert.equal((routes[`${route.method} ${route.path}`] as { csrf?: boolean }).csrf, true);
    }
    const chain = policies['webservice/ReportController'];
    assert(chain && typeof chain === 'object' && !Array.isArray(chain));
    for (const action of ['createConfig', 'updateConfig', 'deleteConfig'])
      assert(Array.isArray(chain[action]) && chain[action].includes('namedQueryMutationCsrf'));
    const next = sinon.stub();
    const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    const req = request();
    namedQueryMutationCsrf(req as unknown as Sails.Req, res as unknown as Sails.Res, next);
    assert.equal(res.status.firstCall.args[0], 403);
    assert(!next.called);
    namedQueryMutationCsrf(
      { ...req, isAuthenticated: () => false } as unknown as Sails.Req,
      res as unknown as Sails.Res,
      next
    );
    assert(next.calledOnce);
    assert.equal(NAMED_QUERY_PREVIEW_LIMITS.rows, 100);
  });
});
