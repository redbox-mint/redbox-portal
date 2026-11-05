import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';

/** Real routes, session authorization and CSRF. All AppConfig rows/cache are restored. */
describe('AppConfig reset API', function () {
  this.timeout(60_000);
  const path = '/default/rdmp/admin/appconfig/menu/reset';
  const otherBrand = '000000000000000000000008';
  let admin: supertest.Agent;
  let ordinary: supertest.Agent;
  let csrf: string;
  let userId: string;
  let brand: any;
  let rows: any[];
  let otherRowId: string;
  const app = () => (sails as any).hooks.http.app;
  const token = async (agent: supertest.Agent) => {
    if (sails.config.security.csrf === false) return '';
    // Establish brand context, also after login regenerates the session.
    await agent.get('/default/rdmp/user/login').expect(200);
    return (await agent.get('/csrfToken').expect(200)).body._csrf;
  };
  const login = async (username: string, password: string) => {
    const agent = supertest.agent(app());
    await agent
      .post('/user/login_local')
      .set('X-CSRF-Token', await token(agent))
      .set('X-Source', 'jsclient')
      .send({ username, password, branding: 'default', portal: 'rdmp' })
      .expect(200);
    return agent;
  };
  before(async () => {
    brand = BrandingService.getBrand('default');
    rows = await AppConfig.find({ branding: brand.id, configKey: 'menu' });
    const suffix = `resetfixture${Date.now()}`;
    const user = await firstValueFrom(
      UsersService.addLocalUser(suffix, 'Reset fixture', `${suffix}@example.test`, 'Testing123!')
    );
    userId = String(user.id);
    await firstValueFrom(
      UsersService.updateUserRoles(userId, RolesService.getRoleIds(BrandingService.getDefault().roles, ['Researcher']))
    );
    const otherRow = await AppConfig.create({
      branding: otherBrand,
      configKey: 'menu',
      configData: { showSearch: false, items: [] },
    });
    otherRowId = String(otherRow.id);
    admin = await login('admin', 'rbadmin');
    ordinary = await login(suffix, 'Testing123!');
    csrf = await token(admin);
  });
  after(async () => {
    if (rows) {
      await AppConfig.destroy({ branding: brand.id, configKey: 'menu' });
      for (const row of rows) await AppConfig.create(row);
      await AppConfigService.bootstrap();
    }
    if (otherRowId) await AppConfig.destroy({ id: otherRowId });
    if (userId) await User.destroy({ id: userId });
  });
  it('rejects anonymous and ordinary users', async () => {
    const anonymous = supertest.agent(app());
    await anonymous
      .post(path)
      .set('X-CSRF-Token', await token(anonymous))
      .send({})
      .expect(403);
    await ordinary
      .post(path)
      .set('X-CSRF-Token', await token(ordinary))
      .send({})
      .expect(403);
  });
  it('requires session CSRF even for Admin', async function () {
    if (sails.config.security.csrf === false) this.skip();
    await admin.post(path).send({}).expect(403);
    await admin.post(path).set('X-CSRF-Token', 'invalid').send({}).expect(403);
  });
  it('removes the route brand override, refreshes the live config and reports no override on repeat', async () => {
    await AppConfigService.createOrUpdateConfig(brand, 'menu', { showSearch: false, items: [] });
    const otherBefore = await AppConfig.findOne({ id: otherRowId });
    const result = await admin.post(path).set('X-CSRF-Token', csrf).send({}).expect(200);
    expect(result.body).to.deep.equal({ reset: true });
    expect(await AppConfig.find({ branding: brand.id, configKey: 'menu' })).to.have.length(0);
    expect(await AppConfig.findOne({ id: otherRowId })).to.deep.equal(otherBefore);
    const expected = await AppConfigService.loadAppConfigurationModel(String(brand.id));
    expect(sails.config.brandingAware('default').menu).to.deep.equal(expected.menu);
    const form = await admin.get('/default/rdmp/appconfig/form/menu').expect(200);
    expect(form.body.hasOverride).to.equal(false);
    expect(form.body.model).to.deep.equal(expected.menu);
    const repeat = await admin.post(path).set('X-CSRF-Token', csrf).send({}).expect(200);
    expect(repeat.body).to.deep.equal({ reset: false });
  });
  it('rejects unknown keys and tenant injection without changing rows', async () => {
    await admin.post(path.replace('/menu/', '/unregistered/')).set('X-CSRF-Token', csrf).send({}).expect(400);
    await admin.post(path).set('X-CSRF-Token', csrf).send({ branding: otherBrand }).expect(400);
    expect(await AppConfig.findOne({ id: otherRowId })).to.exist;
  });
});
