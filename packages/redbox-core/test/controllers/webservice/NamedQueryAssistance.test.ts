import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import UrlPattern from 'url-pattern';
import { Controllers } from '../../../src/controllers/webservice/NamedQueryController';
import { namedQueryEditorRoutes } from '../../../src/api-routes/groups/named-query';
import { policies } from '../../../src/config/policies.config';
import { routes } from '../../../src/config/routes.config';
import { namedQueryMutationCsrf } from '../../../src/policies/namedQueryMutationCsrf';
import { checkAuth } from '../../../src/policies/checkAuth';
import { NamedQueryAssistanceError, NAMED_QUERY_PREVIEW_LIMITS } from '../../../src/utilities/NamedQueryPreview';
import { FieldDescriptionError } from '../../../src/services/FieldDescriptionsService';
import { Services as PathServices } from '../../../src/services/PathRulesService';
import { Services as EditorServices } from '../../../src/services/NamedQueryEditorService';
import { Services as QueryServices, NamedQueryConfig } from '../../../src/services/NamedQueryService';
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
  it('infers rdmp guidance for a saved description requested without query options', async () => {
    const queryBefore = Reflect.get(globalThis, 'NamedQueryService');
    const executor = new QueryServices.NamedQueryService();
    const editor = new EditorServices.NamedQueryEditor();
    sinon.stub(executor, 'getNamedQueryConfig').resolves(
      new NamedQueryConfig({
        name: 'typed',
        collectionName: 'record',
        mongoQuery: { 'metaMetadata.type': 'rdmp' },
        queryParams: {},
        resultObjectMapping: { total: 'record.metadata.count' },
      })
    );
    const fields = sinon.stub().resolves({
      recordType: 'rdmp',
      stage: 'draft',
      precision: 'record-schema',
      completeness: 'complete',
      fields: [{ path: 'count', type: 'number', required: false, isArray: false }],
    });
    Object.assign(sails.services, { fielddescriptionsservice: { describeFields: fields } });
    Object.assign(globalThis, { NamedQueryService: executor, NamedQueryEditorService: editor });
    try {
      const send = sinon.stub(controller, 'sendResp');
      await controller.describeSaved({ ...request(), query: {} } as unknown as Sails.Req, {} as Sails.Res);
      const response = send.firstCall.args[2];
      assert.equal(response?.status, 200);
      const description = response?.data as { result: { fields: Array<{ path: string; type: string }> } };
      assert.equal(description.result.fields.find(field => field.path === 'metadata.total')?.type, 'number');
      assert.equal(fields.firstCall.args[3], 'rdmp');
    } finally {
      Reflect.set(globalThis, 'NamedQueryService', queryBefore);
    }
  });
  it('retains explicitly selected guidance for saved descriptions', async () => {
    sinon.stub(controller, 'sendResp');
    await controller.describeSaved(request() as unknown as Sails.Req, {} as Sails.Res);
    assert.deepEqual(service.describeSaved.firstCall.args[4], { recordType: 'rdmp', stage: undefined });
  });
  it('bounds assistance responses before serializing repeated large values', async () => {
    const metadata = { payload: 'x'.repeat(600000) };
    service.describeDraft.resolves(Object.fromEntries(Array.from({ length: 1024 }, (_, i) => [`copy${i}`, metadata])));
    const send = sinon.stub(controller, 'sendResp');
    await controller.describeDraft(request() as unknown as Sails.Req, {} as Sails.Res);
    assert.equal(send.firstCall.args[2]?.status, 413);
    assert.equal(send.firstCall.args[2]?.displayErrors?.[0].code, 'RESPONSE_LIMIT');
  });
  it('returns HTTP 200 with byte truncation for template amplification through the real executor', async () => {
    const queryBefore = Reflect.get(globalThis, 'NamedQueryService');
    const executor = new QueryServices.NamedQueryService();
    const editor = new EditorServices.NamedQueryEditor();
    const cursor = {
      sort() {
        return this;
      },
      skip() {
        return this;
      },
      limit() {
        return this;
      },
      async toArray() {
        return [{ redboxOid: 'big', metadata: { payload: 'x'.repeat(600000), items: Array(1000).fill(0) } }];
      },
    };
    Reflect.set(sails, 'models', {
      record: {
        native: (callback: (error: null, collection: unknown) => void) =>
          callback(null, { countDocuments: async () => 1, find: () => cursor }),
      },
    });
    Object.assign(globalThis, { NamedQueryService: executor, NamedQueryEditorService: editor });
    try {
      const send = sinon.stub(controller, 'sendResp');
      for (const expression of [
        '{{#each record.metadata.items}}{{@root.record.metadata.payload}}{{/each}}',
        '{{#each record.metadata.items}}{{#each @root.record.metadata.items}}{{@root.record.metadata.payload}}{{/each}}{{/each}}',
        '{{#with record.metadata}}{{#each items}}{{@root.record.metadata.payload}}{{/each}}{{/with}}',
      ]) {
        const req = {
          ...request(),
          body: {
            definition: {
              collectionName: 'record',
              mongoQuery: {},
              queryParams: {},
              resultObjectMapping: { expanded: expression },
            },
          },
        };
        await controller.previewDraft(req as unknown as Sails.Req, {} as Sails.Res);
        const response = send.lastCall.args[2];
        assert.equal(response?.status, 200);
        const data = response?.data as { records: unknown[]; truncated: boolean; truncationReasons: string[] };
        assert.deepEqual(data.records, []);
        assert.equal(data.truncated, true);
        assert.deepEqual(data.truncationReasons, ['bytes']);
        assert(Buffer.byteLength(JSON.stringify({ data })) <= NAMED_QUERY_PREVIEW_LIMITS.responseBytes);
      }
    } finally {
      Reflect.set(globalThis, 'NamedQueryService', queryBefore);
    }
  });
  it('authorizes saved reads through either feature route with brand-specific rules', () => {
    class TestPathRules extends PathServices.PathRules {
      setRules(value: typeof this.rulePatterns) {
        this.rulePatterns = value;
      }
    }
    const rules = new TestPathRules();
    rules.setRules([
      {
        pattern: new UrlPattern('/:branding/:portal/api/report-config(/*)'),
        rule: { role: { id: 'report-author' }, branding: brand, can_update: true },
      },
      {
        pattern: new UrlPattern('/:branding/:portal/api/named-query(/*)'),
        rule: { role: { id: 'query-author' }, branding: brand, can_update: true },
      },
      {
        pattern: new UrlPattern('/:branding/:portal/api/report-config(/*)'),
        rule: { role: { id: 'other-brand-author' }, branding: { id: 'b', name: 'brand-b' }, can_update: true },
      },
    ]);
    Object.assign(globalThis, { PathRulesService: rules });
    const reportPath = '/brand-a/rdmp/api/report-config/named-query/typed/description';
    const queryPath = '/brand-a/rdmp/api/named-query/typed/description';
    assert(
      namedQueryEditorRoutes.some(
        route =>
          route.path === '/:branding/:portal/api/report-config/named-query/:name/description' &&
          route.action === 'describeSaved' &&
          route.method === 'get'
      )
    );
    for (const [role, path, allowed] of [
      ['report-author', reportPath, true],
      ['query-author', queryPath, true],
      ['other-brand-author', reportPath, false],
      ['report-author', queryPath, false],
      ...['validate', 'describe', 'preview', 'fields'].map(
        action => ['report-author', `/brand-a/rdmp/api/named-query/editor/${action}`, false] as const
      ),
    ] as const) {
      const req = { ...request(), path, user: { username: 'author', roles: [{ id: role }] } };
      const next = sinon.stub();
      const res = { status: sinon.stub().returnsThis(), send: sinon.stub() };
      checkAuth(req as unknown as Sails.Req, res as unknown as Sails.Res, next);
      assert.equal(next.calledOnce, allowed, `${role}: ${path}`);
      if (!allowed) assert.equal(res.status.firstCall.args[0], 403);
    }
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
