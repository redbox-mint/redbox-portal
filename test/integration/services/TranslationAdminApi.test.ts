import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';

/** Session routes and real persistence; isolated locale removed in teardown. */
describe('Translation admin API', function () {
  this.timeout(60_000);
  const locale = 'zz-admin-translations';
  const base = `/default/rdmp/admin/translation/${locale}/translation`;
  let admin: supertest.Agent;
  let ordinary: supertest.Agent;
  let csrf: string;
  let userId: string;
  let brand: any;
  const app = () => (sails as any).hooks.http.app;
  const token = async (agent: supertest.Agent) => {
    await agent.get('/default/rdmp/user/login').expect(200);
    if (sails.config.security.csrf === false) return '';
    return (await agent.get('/csrfToken').expect(200)).body._csrf;
  };
  const login = async (username: string, password: string) => {
    const agent = supertest.agent(app());
    await agent.post('/user/login_local').set('X-CSRF-Token', await token(agent))
      .set('X-Source', 'jsclient').send({ username, password, branding: 'default', portal: 'rdmp' }).expect(200);
    return agent;
  };
  before(async () => {
    brand = BrandingService.getBrand('default');
    const suffix = `translationfixture${Date.now()}`;
    const user = await firstValueFrom(UsersService.addLocalUser(suffix, 'Translation fixture', `${suffix}@example.test`, 'Testing123!'));
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(userId, RolesService.getRoleIds(BrandingService.getDefault().roles, ['Researcher'])));
    await I18nEntriesService.setBundle(brand, locale, 'translation', { label: 'Parent', 'label.help': 'Help' }, 'Fixture');
    admin = await login('admin', 'rbadmin');
    ordinary = await login(suffix, 'Testing123!');
    csrf = await token(admin);
  });
  after(async () => {
    if (brand) {
      await I18nTranslation.destroy({ branding: brand.id, locale });
      await I18nBundle.destroy({ branding: brand.id, locale });
      await TranslationService.reloadResources(String(brand.id));
    }
    if (userId) await User.destroy({ id: userId });
  });
  it('requires brand Admin and session CSRF', async function () {
    const anonymous = supertest.agent(app());
    for (const agent of [anonymous, ordinary]) {
      await agent.post(base + '/display-name').set('X-CSRF-Token', await token(agent)).send({ displayName: 'Forbidden' }).expect(403);
    }
    if (sails.config.security.csrf !== false) {
      await admin.post(base + '/display-name').send({ displayName: 'Forbidden' }).expect(403);
      await admin.post(base + '/display-name').set('X-CSRF-Token', 'invalid').send({ displayName: 'Forbidden' }).expect(403);
    }
  });
  it('updates only the display name and rejects tenant/data injection', async () => {
    const bundle = await I18nEntriesService.getBundle(brand, locale, 'translation');
    const entries = await I18nEntriesService.listEntries(brand, locale, 'translation');
    await admin.post(base + '/display-name').set('X-CSRF-Token', csrf).send({ displayName: 'Renamed' }).expect(200);
    const after = await I18nEntriesService.getBundle(brand, locale, 'translation');
    expect(after.data).to.deep.equal(bundle.data);
    expect(after.displayName).to.equal('Renamed');
    expect(await I18nEntriesService.listEntries(brand, locale, 'translation')).to.deep.equal(entries);
    await admin.post(base + '/display-name').set('X-CSRF-Token', csrf).send({ displayName: 'No', branding: 'other', data: {} }).expect(400);
    await admin.post(base + '/display-name').set('X-CSRF-Token', csrf).send({ displayName: '<script>' }).expect(400);
  });
  it('returns provenance, translated counts and a sanitized revert without crossing brands', async () => {
    const rows = (await admin.get(base + '/editor').expect(200)).body;
    expect(rows.find(row => row.key === 'label').provenance).to.equal('override');
    expect(rows.find(row => row.key === 'menu-admin').provenance).to.equal('missing');
    const counts = (await admin.get('/default/rdmp/admin/translation/languages').expect(200)).body;
    expect(counts.find(row => row.code === locale).translated).to.equal(2);
    const defaults = await I18nEntriesService.defaultValues(locale, 'translation');
    await admin.post(base + '/revert').set('X-CSRF-Token', csrf).send({ key: 'menu-admin' }).expect(200);
    expect((await I18nEntriesService.getBundle(brand, locale, 'translation')).data['menu-admin']).to.equal(defaults['menu-admin']);
    await admin.post(base + '/revert').set('X-CSRF-Token', csrf).send({ key: 'unknown' }).expect(404);
    await ordinary.get(base + '/editor').expect(403);
    await ordinary.get('/default/rdmp/admin/translation/languages').expect(403);
    await ordinary.post(base + '/revert').set('X-CSRF-Token', await token(ordinary)).send({ key: 'menu-admin' }).expect(403);
  });

  it('previews, exports and applies only allowed flat JSON changes', async () => {
    const json = JSON.stringify({ label: 'Changed parent', 'label.help': 'Help', 'menu-admin': 'Imported admin', 'translation-unknown-fixture': 'Unknown' });
    const before = await I18nEntriesService.getBundle(brand, locale, 'translation');
    const preview = (await admin.post(base + '/import/preview').set('X-CSRF-Token', csrf).send({ json }).expect(200)).body;
    expect(preview.counts.unknown).to.equal(1);
    expect(await I18nEntriesService.getBundle(brand, locale, 'translation')).to.deep.equal(before);
    const exported = await admin.get(base + '/export').expect(200).expect('Content-Disposition', /attachment; filename=/);
    expect(exported.body.label).to.equal('Parent');
    expect(exported.body['label.help']).to.equal('Help');
    expect(exported.body).not.to.have.property('_meta');
    const result = (await admin.post(base + '/import/apply').set('X-CSRF-Token', csrf).send({ json, previewToken: preview.previewToken }).expect(200)).body;
    expect(result.failed).to.equal(0);
    const values = (await admin.get(base + '/export').expect(200)).body;
    expect(values.label).to.equal('Changed parent');
    expect(values['label.help']).to.equal('Help');
    expect(values).not.to.have.property('translation-unknown-fixture');
    await admin.post(base + '/import/apply').set('X-CSRF-Token', csrf).send({ json, previewToken: preview.previewToken }).expect(409);
    const opted = (await admin.post(base + '/import/preview').set('X-CSRF-Token', csrf).send({ json, keepUnknown: true }).expect(200)).body;
    await admin.post(base + '/import/apply').set('X-CSRF-Token', csrf).send({ json, keepUnknown: true, previewToken: opted.previewToken }).expect(200);
    expect((await admin.get(base + '/export').expect(200)).body['translation-unknown-fixture']).to.equal('Unknown');
  });
  it('rejects invalid imports and protects preview/apply/export with brand Admin and CSRF', async function () {
    await admin.post(base + '/import/preview').set('X-CSRF-Token', csrf).set('Content-Type', 'application/json').send('{malformed').expect(400);
    await admin.post(base + '/import/preview').set('X-CSRF-Token', csrf).send({ json: JSON.stringify({ label: 'a'.repeat(1024 * 1024 + 100) }) }).expect(200);
    for (const json of ['{', '[]', '{"label":1}', '{"label":{}}', '{"__proto__":"bad"}']) {
      await admin.post(base + '/import/preview').set('X-CSRF-Token', csrf).send({ json }).expect(400);
    }
    await admin.post(base + '/import/preview').set('X-CSRF-Token', csrf).send({ json: JSON.stringify({ label: 'é'.repeat(1100000) }) }).expect(413);
    for (const action of ['preview', 'apply']) {
      await ordinary.post(base + '/import/' + action).set('X-CSRF-Token', await token(ordinary)).send({ json: '{}' }).expect(403);
      if (sails.config.security.csrf !== false) await admin.post(base + '/import/' + action).send({ json: '{}' }).expect(403);
    }
    await ordinary.get(base + '/export').expect(403);
  });

});
