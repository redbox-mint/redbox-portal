import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Controllers } from '../../../src/controllers/webservice/NamedQueryController';
import { namedQueryEditorRoutes } from '../../../src/api-routes/groups/named-query';
import { policies } from '../../../src/config/policies.config';
import { routes } from '../../../src/config/routes.config';
import { namedQueryMutationCsrf } from '../../../src/policies/namedQueryMutationCsrf';
import { checkAuth } from '../../../src/policies/checkAuth';
import { NamedQueryAssistanceError } from '../../../src/utilities/NamedQueryPreview';
import { FieldDescriptionError } from '../../../src/services/FieldDescriptionsService';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from '../../services/testHelper';

const actions = [
  'schemaTargets',
  'describeFields',
  'validateDraft',
  'describeDraft',
  'describeSaved',
  'previewDraft',
] as const;
const brand = { id: 'a', name: 'brand-a' };

describe('Named query assistance HTTP boundary', () => {
  class TestController extends Controllers.NamedQuery {
    public override sendResp(...args: Parameters<Controllers.NamedQuery['sendResp']>) {
      return super.sendResp(...args);
    }
  }
  let controller: TestController;
  let service: Record<(typeof actions)[number], sinon.SinonStub>;
  let previous: Record<'branding' | 'editor' | 'rules' | 'translation', unknown>;
  const request = () => ({
    method: 'POST',
    path: '/brand-a/rdmp/api/named-query/editor/preview',
    session: { branding: 'brand-a' },
    body: { definition: { collectionName: 'record' } },
    user: { username: 'author', roles: [{ id: 'query-author', name: 'CustomAuthor' }] },
    query: { collectionName: 'record', recordType: 'rdmp' },
    param: (key: string) => (({ portal: 'rdmp', name: 'query-a' }) as Record<string, string>)[key],
    headers: {},
    isAuthenticated: () => true,
  });
  beforeEach(() => {
    previous = {
      branding: Reflect.get(globalThis, 'BrandingService'),
      editor: Reflect.get(globalThis, 'NamedQueryEditorService'),
      rules: Reflect.get(globalThis, 'PathRulesService'),
      translation: Reflect.get(globalThis, 'TranslationService'),
    };
    setupServiceTestGlobals(createMockSails());
    controller = new TestController();
    service = Object.fromEntries(
      actions.map(action => [action, sinon.stub().resolves({ valid: true, diagnostics: [] })])
    ) as Record<(typeof actions)[number], sinon.SinonStub>;
    Object.assign(globalThis, {
      BrandingService: { getBrand: sinon.stub().returns(brand) },
      NamedQueryEditorService: service,
      TranslationService: { t: (value: string) => value },
    });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    Object.assign(globalThis, {
      BrandingService: previous.branding,
      NamedQueryEditorService: previous.editor,
      PathRulesService: previous.rules,
      TranslationService: previous.translation,
    });
  });
  for (const action of actions)
    it(`${action} uses session brand, portal and the feature caller`, async () => {
      const req = request();
      const send = sinon.stub(controller, 'sendResp');
      await controller[action](req as unknown as Sails.Req, {} as Sails.Res);
      assert.equal(service[action].firstCall.args[0], brand);
      if (action === 'schemaTargets') assert.equal(service[action].firstCall.args[1].user, req.user);
      else {
        assert.equal(service[action].firstCall.args[1], 'rdmp');
        assert.equal(service[action].firstCall.args[2].user, req.user);
      }
      assert.equal(send.firstCall.args[2]?.headers?.['Cache-Control'], 'no-store');
      assert.equal(send.firstCall.args[2]?.status, 200);
    });
  it('returns structured blocking diagnostics without raw server exceptions', async () => {
    service.validateDraft.resolves({ valid: false, diagnostics: [{ code: 'INVALID_COLLECTION', severity: 'error' }] });
    const send = sinon.stub(controller, 'sendResp');
    await controller.validateDraft(request() as unknown as Sails.Req, {} as Sails.Res);
    assert.equal(send.firstCall.args[2]?.status, 200);
    assert.equal(
      (send.firstCall.args[2]?.data as { diagnostics: Array<{ code: string }> }).diagnostics[0].code,
      'INVALID_COLLECTION'
    );
    service.previewDraft.rejects(new Error('PRIVATE SOURCE CONTENT'));
    await controller.previewDraft(request() as unknown as Sails.Req, {} as Sails.Res);
    assert.equal(send.secondCall.args[2]?.status, 500);
    assert(!JSON.stringify(send.secondCall.args[2]).includes('PRIVATE'));
  });
  it('serializes blocking diagnostics and safe errors through the real response helper', async () => {
    service.validateDraft.resolves({ valid: false, diagnostics: [{ code: 'INVALID_DEFINITION', severity: 'error' }] });
    const res = {
      status: sinon.stub().returnsThis(),
      set: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis(),
    };
    const req = { ...request(), headers: { 'x-redbox-api-version': '2.0' } };
    await controller.validateDraft(req as unknown as Sails.Req, res as unknown as Sails.Res);
    assert.equal(res.status.firstCall.args[0], 200);
    assert.equal(res.json.firstCall.args[0].data.diagnostics[0].code, 'INVALID_DEFINITION');
    service.previewDraft.rejects(new NamedQueryAssistanceError('PREVIEW_TIMEOUT', 408));
    await controller.previewDraft(req as unknown as Sails.Req, res as unknown as Sails.Res);
    assert.equal(res.status.lastCall.args[0], 408);
    assert.equal(res.json.lastCall.args[0].errors[0].code, 'PREVIEW_TIMEOUT');
  });
  it('maps guidance denial, missing saved query, size and timeout failures', async () => {
    const send = sinon.stub(controller, 'sendResp');
    for (const [error, status] of [
      [new FieldDescriptionError('FORBIDDEN'), 403],
      [new NamedQueryAssistanceError('QUERY_NOT_FOUND', 404), 404],
      [new NamedQueryAssistanceError('INPUT_LIMIT', 413), 413],
      [new NamedQueryAssistanceError('PREVIEW_TIMEOUT', 408), 408],
    ] as const) {
      service.previewDraft.rejects(error);
      await controller.previewDraft(request() as unknown as Sails.Req, {} as Sails.Res);
      assert.equal(send.lastCall.args[2]?.status, status);
    }
  });
  it('inherits feature authentication and path authorization without the email policy', () => {
    const chains = policies['webservice/NamedQueryController'];
    assert(chains && typeof chains === 'object' && !Array.isArray(chains));
    for (const action of actions) {
      const chain = chains[action];
      assert(Array.isArray(chain));
      assert(chain.includes('isWebServiceAuthenticated'));
      assert(chain.includes('checkAuth'));
      assert(!chain.includes('emailTemplateAdmin'));
    }
  });
  it('allows a brand-authorized custom administration role and denies an unauthorized caller', () => {
    const next = sinon.stub();
    const res = { status: sinon.stub().returnsThis(), send: sinon.stub() };
    const canRead = sinon.stub().returns(true);
    Object.assign(globalThis, {
      PathRulesService: { getRulesFromPath: sinon.stub().returns([{ role: 'custom' }]), canRead },
    });
    checkAuth(request() as unknown as Sails.Req, res as unknown as Sails.Res, next);
    assert.equal(next.callCount, 1);
    canRead.returns(false);
    next.resetHistory();
    checkAuth(request() as unknown as Sails.Req, res as unknown as Sails.Res, next);
    assert.equal(next.callCount, 0);
    assert.equal(res.status.firstCall.args[0], 403);
    assert.equal(service.previewDraft.callCount, 0);
  });
  it('enables Sails CSRF on all draft POSTs and retains bearer mutation routes', () => {
    for (const route of namedQueryEditorRoutes.filter(route => route.method === 'post')) {
      assert.equal(route.csrf, true);
      assert.equal((routes[`${route.method} ${route.path}`] as { csrf?: boolean }).csrf, true);
    }
    const chains = policies['webservice/NamedQueryController'];
    assert(chains && typeof chains === 'object' && !Array.isArray(chains));
    for (const action of ['createQuery', 'updateQuery', 'deleteQuery']) {
      const chain = chains[action];
      assert(Array.isArray(chain));
      assert(chain.indexOf('namedQueryMutationCsrf') < chain.indexOf('isWebServiceAuthenticated'));
    }
  });
  it('rejects session mutations without CSRF but preserves sessionless bearer clients', () => {
    const next = sinon.stub();
    const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    namedQueryMutationCsrf(request() as unknown as Sails.Req, res as unknown as Sails.Res, next);
    assert.equal(res.status.firstCall.args[0], 403);
    assert.equal(next.callCount, 0);
    const bearer = { ...request(), isAuthenticated: () => false };
    namedQueryMutationCsrf(bearer as unknown as Sails.Req, res as unknown as Sails.Res, next);
    assert.equal(next.callCount, 1);
  });
  it('accepts a valid CSRF token for session mutations', () => {
    const next = sinon.stub();
    const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    const req = { ...request(), method: 'GET', csrfToken: undefined as (() => string) | undefined };
    namedQueryMutationCsrf(req as unknown as Sails.Req, res as unknown as Sails.Res, next);
    assert(req.csrfToken);
    const token = req.csrfToken();
    req.method = 'POST';
    Object.assign(req.headers, { 'x-csrf-token': token });
    next.resetHistory();
    namedQueryMutationCsrf(req as unknown as Sails.Req, res as unknown as Sails.Res, next);
    assert.equal(next.callCount, 1);
    assert.equal(res.status.callCount, 0);
  });
});
