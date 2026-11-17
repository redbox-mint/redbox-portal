import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';

declare const DashboardConfiguration: any;

/** Session routes exercise the same persisted settings used by the researcher dashboard. */
describe('Dashboard page size API', function () {
  this.timeout(60_000);
  const path = '/default/rdmp/admin/dashboard-config/workflows/rdmp/draft';
  let admin: supertest.Agent;
  let ordinary: supertest.Agent;
  let csrf: string;
  let original: any;
  let otherDocument: any;
  let userId: string;
  const app = () => (sails as any).hooks.http.app;
  const token = async (agent: supertest.Agent) => {
    if (sails.config.security.csrf === false) return '';
    await agent.get('/default/rdmp/user/login').expect(200);
    return (await agent.get('/csrfToken').expect(200)).body._csrf;
  };
  const login = async (username: string, password: string) => {
    const agent = supertest.agent(app());
    await agent.post('/user/login_local').set('X-CSRF-Token', await token(agent))
      .set('X-Source', 'jsclient').send({ username, password, branding: 'default', portal: 'rdmp' }).expect(200);
    return agent;
  };
  before(async () => {
    const brand = BrandingService.getDefault();
    original = await DashboardConfiguration.findOne({ branding: String(brand.id) });
    expect(original, 'dashboard configuration must be initialised').to.exist;
    otherDocument = await DashboardConfiguration.create({
      branding: '000000000000000000000009', revision: 1,
      configData: { schemaVersion: 1, workflows: {}, views: {}, contexts: {} }
    });
    const username = `dashboardpagesize${Date.now()}`;
    const user = await firstValueFrom(UsersService.addLocalUser(username, 'Dashboard fixture', `${username}@example.test`, 'Testing123!'));
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(userId, RolesService.getRoleIds(brand.roles, ['Researcher'])));
    admin = await login('admin', 'rbadmin');
    ordinary = await login(username, 'Testing123!');
    csrf = await token(admin);
  });
  after(async () => {
    if (original) {
      await DashboardConfiguration.updateOne({ id: original.id }).set({
        configData: original.configData,
        revision: original.revision,
        updatedAt: original.updatedAt
      });
    }
    if (otherDocument) await DashboardConfiguration.destroy({ id: otherDocument.id });
    if (userId) {
      await UserAudit.destroy({ 'user.id': userId }).meta({ enableExperimentalDeepTargets: true });
      await User.destroy({ id: userId });
    }
  });
  it('requires brand Admin and session CSRF', async function () {
    const anonymous = supertest.agent(app());
    await anonymous.put(path).set('X-CSRF-Token', await token(anonymous)).send({}).expect(403);
    await ordinary.put(path).set('X-CSRF-Token', await token(ordinary)).send({}).expect(403);
    if (sails.config.security.csrf !== false) {
      await admin.put(path).send({}).expect(403);
      await admin.put(path).set('X-CSRF-Token', 'invalid').send({}).expect(403);
    }
  });
  it('validates page sizes, saves one brand/target, and returns it in runtime settings', async () => {
    const read = (await admin.get(path).set('X-ReDBox-Api-Version', '2.0').expect(200)).body.data;
    const beforeOther = await DashboardConfiguration.findOne({ id: otherDocument.id });
    const beforeBrand = await DashboardConfiguration.findOne({ id: original.id });
    for (const rowsPerPage of [0, 11, 101, '25', null]) {
      await admin.put(path).set('X-ReDBox-Api-Version', '2.0').set('X-CSRF-Token', csrf)
        .send({ expectedRevision: read.revision, settings: { ...read.settings, rowsPerPage } }).expect(400);
    }
    expect(await DashboardConfiguration.findOne({ id: original.id })).to.deep.equal(beforeBrand);
    const next = { ...read.settings, rowsPerPage: 25 };
    const validation = (await admin.post('/default/rdmp/admin/dashboard-config/validate').set('X-ReDBox-Api-Version', '2.0').set('X-CSRF-Token', csrf)
      .send({ target: { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, expectedRevision: read.revision, settings: next }).expect(200)).body.data;
    const saved = (await admin.put(path).set('X-ReDBox-Api-Version', '2.0').set('X-CSRF-Token', csrf).send({
      expectedRevision: read.revision, settings: next,
      validationFingerprint: validation.validationFingerprint,
      acknowledgedWarningIds: validation.warnings.map((w: any) => w.id)
    }).expect(200)).body.data;
    expect(saved.settings.rowsPerPage).to.equal(25);
    expect(saved.revision).to.equal(read.revision + 1);
    const runtime = (await admin.get('/default/rdmp/dashboard/settings/workflow/rdmp').expect(200)).body;
    // Legacy AJAX responses are unwrapped for v1 session clients.
    expect((runtime.data ?? runtime).targets.draft.settings.rowsPerPage).to.equal(25);
    const after = await DashboardConfiguration.findOne({ id: original.id });
    const expected = JSON.parse(JSON.stringify(beforeBrand.configData));
    expected.workflows.rdmp.draft.rowsPerPage = 25;
    expect(after.configData).to.deep.equal(expected);
    expect(await DashboardConfiguration.findOne({ id: otherDocument.id })).to.deep.equal(beforeOther);
    await admin.put(path).set('X-ReDBox-Api-Version', '2.0').set('X-CSRF-Token', csrf).send({ expectedRevision: read.revision, settings: next }).expect(409);
    const page = await admin.get('/default/rdmp/listRecords').query({ recordType: 'rdmp', state: 'draft', rows: 25, start: 25 }).expect(200);
    expect(Number(page.body.noItems)).to.equal(25);
    expect(page.body.currentPage).to.equal(2);
  });
});
