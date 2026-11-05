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
});
