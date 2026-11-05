import { expect } from 'chai';
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/TranslationController';
import { adminTranslationApiRoutes } from '../../src/api-routes/groups/admin-translation';
import { auth } from '../../src/config/auth.config';

describe('Translation admin endpoints', () => {
  let controller: Controllers.Translation;
  let req: any;
  let res: any;
  let service: any;
  beforeEach(() => {
    service = { updateDisplayName: sinon.stub().resolves({ locale: 'en', namespace: 'translation', displayName: 'English' }) };
    Object.assign(global, {
      BrandingService: { getBrand: sinon.stub().returns({ id: 'brand-1' }) },
      RolesService: { getAdminFromBrand: sinon.stub().returns({ id: 'admin-brand-1' }) },
      UsersService: { hasRole: sinon.stub().returns(true) },
      I18nEntriesService: service,
    });
    controller = new Controllers.Translation();
    req = { user: {}, params: { branding: 'default', locale: 'en', namespace: 'translation' }, body: { displayName: ' English ' } };
    res = Object.fromEntries(['json', 'badRequest', 'notFound', 'forbidden', 'serverError'].map(k => [k, sinon.stub()]));
  });
  afterEach(() => { for (const key of ['BrandingService', 'RolesService', 'UsersService', 'I18nEntriesService']) delete (global as any)[key]; sinon.restore(); });
  it('renames metadata for the route brand without accepting bundle data', async () => {
    await controller.updateDisplayName(req, res);
    expect(service.updateDisplayName.firstCall.args).to.deep.equal([{ id: 'brand-1' }, 'en', 'translation', 'English']);
    expect(res.json.calledOnce).to.equal(true);
    req.body.data = { label: 'unexpected' };
    await controller.updateDisplayName(req, res);
    expect(res.badRequest.calledOnce).to.equal(true);
    expect(service.updateDisplayName.calledOnce).to.equal(true);
  });
  for (const name of ['', 'x'.repeat(101), '<script>', 'hello\nworld', 1, null]) {
    it(`rejects invalid display name ${JSON.stringify(name)}`, async () => {
      req.body.displayName = name;
      await controller.updateDisplayName(req, res);
      expect(res.badRequest.calledOnce).to.equal(true);
      expect(service.updateDisplayName.called).to.equal(false);
    });
  }
  it('rejects unsafe locale paths', async () => {
    req.params.locale = '../en';
    await controller.updateDisplayName(req, res);
    expect(res.badRequest.calledOnce).to.equal(true);
  });
  it('returns 404 for a missing brand-scoped bundle', async () => {
    service.updateDisplayName.resolves(null);
    await controller.updateDisplayName(req, res);
    expect(res.notFound.calledOnce).to.equal(true);
  });
  it('denies anonymous users and users without this brand Admin role', async () => {
    (global as any).UsersService.hasRole.returns(false);
    await controller.updateDisplayName(req, res);
    req.user = undefined;
    await controller.updateDisplayName(req, res);
    expect(res.forbidden.callCount).to.equal(2);
    expect(service.updateDisplayName.called).to.equal(false);
  });
  it('registers contract routes with CSRF and brand Admin protection', () => {
    for (const route of adminTranslationApiRoutes) {
      expect(route.csrf).to.equal(true);
      expect(route.extensions['x-redbox-roles']).to.deep.equal(['Admin']);
    }
    expect(auth.rules.some(r => r.path === '/:branding/:portal/admin/translation(/*)' && r.role === 'Admin')).to.equal(true);
  });
});
