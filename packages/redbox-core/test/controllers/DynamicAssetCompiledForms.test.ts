import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import * as lodash from 'lodash';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/DynamicAssetController';
import { Services as FormServices } from '../../src/services/FormsService';
import { Services as ConsistencyServices } from '../../src/services/FormRecordConsistencyService';
import { RelatedObjectDataInlineFormConfigVisitor } from '../../src/visitor/related-object-data-inline.visitor';
import { noCache } from '../../src/policies/noCache';
import { checkAuth } from '../../src/policies/checkAuth';
import { policies } from '../../src/config/policies.config';
import { createSinonStubLogger } from '../logger.test';

// Exercise the real cache/auth policies, controller action and template extraction.
// Unrelated branding/language middleware is represented by its resolved globals.
describe('compiled form template endpoint', () => {
  const names = ['sails', '_', 'BrandingService', 'RolesService', 'PathRulesService', 'RecordsService',
    'FormsService', 'FormRecordConsistencyService', 'TemplateService', 'RecordTypesService', 'TranslationService'];
  let originals: Record<string, unknown>;
  let forms: any;
  let consistency: any;
  let controller: any;
  let req: any;
  let res: any;
  let headers: Record<string, string>;
  let root: any;
  let configuration: any;
  let records: any;
  let canRead: sinon.SinonStub;
  let resolve: sinon.SinonSpy;
  const brand = { id: 'brand-1', name: 'default' };
  beforeEach(() => {
    originals = Object.fromEntries(names.map(name => [name, (global as any)[name]]));
    Object.assign(global, { _: lodash, sails: { log: createSinonStubLogger(sinon), services: {}, config: {
      reusableFormDefinitions: {}, dynamicasset: { dynamicScriptAsset: { type: 'application/javascript', view: 'compiled' } },
      auth: { defaultBrand: 'default', defaultPortal: 'rdmp' },
    } } });
    forms = new FormServices.Forms();
    consistency = new ConsistencyServices.FormRecordConsistency();
    configuration = { name: 'legacy', componentDefinitions: [{ name: 'title',
      model: { class: 'SimpleInputModel' }, component: { class: 'SimpleInputComponent' } }] };
    root = { redboxOid: 'P', metaMetadata: { type: 'related-plan', brandId: brand.id }, metadata: {
      title: 'Plan', primaryActivity: 'A', activities: [{ oid: 'A' }, { oid: 'B' }],
    } };
    records = { getMeta: sinon.stub().resolves(root), hasViewAccess: sinon.stub().resolves(true),
      hasEditAccess: sinon.stub().resolves(true), resolveRelatedMetadata: sinon.stub().rejects(new Error('Must not resolve sources')) };
    canRead = sinon.stub().returns(true);
    Object.assign(global, { BrandingService: { getBrand: () => brand }, TranslationService: { t: (key: string) => key },
      RolesService: { getDefUnathenticatedRole: () => ({ name: 'guest' }) },
      PathRulesService: { getRulesFromPath: () => [{}], canRead }, RecordsService: records,
      FormsService: forms, FormRecordConsistencyService: consistency,
      TemplateService: { buildClientMapping: (inputs: any[]) => inputs.map(input => ({ key: input.key, value: `compiled:${input.value}` })),
        buildKeyString: (key: any[]) => key.join('__') },
      RecordTypesService: { get: sinon.stub().returns(of({ relatedTo:
        require('../../../redbox-hook-dev/src/config/recordtype').recordtype['related-plan'].relatedTo })) },
    });
    sinon.stub(forms, 'getForm').callsFake(async () => ({ configuration }));
    resolve = sinon.spy(RelatedObjectDataInlineFormConfigVisitor.prototype, 'resolve');
    controller = new Controllers.DynamicAsset();
    controller.sendResp = sinon.stub().callsFake((_req: any, response: any, body: any) => response.status(body.status).json(body));
    req = { session: { branding: 'default' }, query: {}, path: '/default/rdmp/dynamicAsset/formCompiledItems/related-plan/P',
      headers: { 'content-type': 'application/json' }, isAuthenticated: () => true,
      user: { username: 'related-admin', roles: [{ name: 'Admin' }] },
      param: (name: string) => ({ recordType: 'related-plan', oid: 'P' })[name] };
    headers = {};
    res = { setHeader: (name: string, value: string) => { headers[name] = value; },
      set: (name: string, value: string) => { headers[name] = value; },
      status: sinon.stub().returnsThis(), json: sinon.stub(), view: sinon.stub(), notFound: sinon.stub() };
  });
  afterEach(() => { sinon.restore(); Object.assign(global, originals); });
  async function request() {
    const chain = (policies.DynamicAssetController as any)['*'] as string[];
    assert.ok(chain.includes('noCache'));
    assert.ok(chain.includes('checkAuth'));
    let proceed = false;
    noCache(req, res, () => { proceed = true; });
    assert.ok(proceed);
    proceed = false;
    checkAuth(req, res, () => { proceed = true; });
    if (proceed) await controller.getFormCompiledItems(req, res);
    assert.match(headers['Cache-Control'], /no-store/);
  }
  it('rejects an unauthenticated caller before reading the record or compiling', async () => {
    req.isAuthenticated = () => false;
    delete req.user;
    canRead.returns(false);
    await request();
    sinon.assert.calledWith(res.status, 403);
    sinon.assert.notCalled(records.getMeta);
    sinon.assert.notCalled(res.view);
  });
  it('rejects a caller denied access to the stored root before constructing templates', async () => {
    records.hasViewAccess.resolves(false);
    await request();
    sinon.assert.calledWith(res.status, 403);
    sinon.assert.calledWith(records.hasViewAccess, brand, req.user, req.user.roles, root);
    sinon.assert.notCalled(forms.getForm);
    sinon.assert.notCalled(res.view);
  });
  it('keeps legacy compiled output identical with the trusted endpoint context', async () => {
    const before = await consistency.extractRawTemplates(configuration, 'view', ['Admin'], root.metadata, {});
    await request();
    sinon.assert.calledOnce(res.view);
    assert.deepEqual(res.view.firstCall.args, ['compiled', { entries: before.map((entry: any) => ({
      key: entry.key.join('__'), value: `compiled:${entry.value}` })), layout: false }]);
    sinon.assert.notCalled(resolve);
    sinon.assert.notCalled(records.resolveRelatedMetadata);
  });
  it('emits opted-in view target keys without resolving related sources again', async () => {
    configuration = require('../../../redbox-hook-dev/src/form-config/related-plan-1.0-draft').default;
    await request();
    sinon.assert.calledOnce(res.view);
    const entries = res.view.firstCall.args[1].entries;
    const client = await forms.buildClientFormConfig(configuration, 'view', ['Admin'], root.metadata, {},
      undefined, undefined, { brand, user: req.user, record: root }, false, true);
    for (const name of ['activityTitle', 'activityDates', 'activitySummaries']) {
      const index = client.componentDefinitions.findIndex((field: any) => field.name === name);
      assert.ok(entries.some((entry: any) => entry.key === `componentDefinitions__${index}__expressions__0__config__template`), name);
    }
    sinon.assert.notCalled(resolve);
    sinon.assert.notCalled(records.resolveRelatedMetadata);
    sinon.assert.calledOnce(records.getMeta);
  });
});
