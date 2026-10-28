import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';
import crypto from 'node:crypto';

describe('User profile route and self-service actions', function () {
  this.timeout(60_000);
  let admin: supertest.Agent;
  let researcher: supertest.Agent;
  let researcherId: string;
  let username: string;
  let adminId: string;
  let adminUsername: string;

  async function post(agent: supertest.Agent, url: string, body: Record<string, unknown>, status = 200) {
    const csrf = await agent.get('/csrfToken').expect(200);
    return agent.post(url).set('X-Source', 'jsclient').set('X-CSRF-Token', csrf.body._csrf).send(body).expect(status);
  }

  before(async () => {
    const app = sails.hooks.http.app;
    admin = supertest.agent(app);
    researcher = supertest.agent(app);
    username = `profile${Date.now()}`;
    const user = await firstValueFrom(UsersService.addLocalUser(username, 'Profile Researcher', `${username}@example.org`, 'RBTest123!'));
    researcherId = String(user.id);
    const brand = BrandingService.getDefault();
    await firstValueFrom(UsersService.updateUserRoles(user.id, RolesService.getRoleIds(brand.roles, ['Researcher'])));
    adminUsername = `${username}admin`;
    const adminUser = await firstValueFrom(UsersService.addLocalUser(adminUsername, 'Profile Admin', `${adminUsername}@example.org`, 'RBTest123!'));
    adminId = String(adminUser.id);
    await firstValueFrom(UsersService.updateUserRoles(adminUser.id, RolesService.getRoleIds(brand.roles, ['Admin', 'Researcher'])));
    for (const [agent, name, password] of [[admin, adminUsername, 'RBTest123!'], [researcher, username, 'RBTest123!']] as const) {
      await agent.get('/default/rdmp/user/login').expect(200);
      await post(agent, '/user/login_local', { username: name, password, branding: 'default', portal: 'rdmp' });
    }
  });

  after(async () => {
    const ids = [researcherId, adminId].filter(Boolean);
    if (ids.length) await User.destroy({ id: ids });
    if (username && adminUsername) {
      await UserAudit.destroy({ or: [{ 'user.username': username }, { 'user.username': adminUsername }] })
        .meta({ enableExperimentalDeepTargets: true });
    }
  });

  it('renders real content and serves its script, with no missing bundles or loading placeholder', async () => {
    const page = await admin.get('/default/rdmp/user/profile').expect(200);
    expect(page.text).to.contain('User profile').and.to.contain('id="profile-details"');
    expect(page.text).to.not.contain('angular/userProfile');
    expect(page.text).to.not.contain('id="loading"');
    expect(page.headers['cache-control']).to.contain('no-store');
    const script = page.text.match(/src="([^"]+\/user-profile.js)"/);
    expect(script).to.not.equal(null);
    const asset = await admin.get(script![1]).expect(200);
    expect(asset.text).to.contain('X-CSRF-Token');
  });

  it('retains read-only researcher access and denies anonymous access and unauthorized mutations', async () => {
    const page = await researcher.get('/default/rdmp/user/profile').expect(200);
    expect(page.text).to.contain('Profile Researcher');
    expect(page.text).to.not.contain('id="profile-details"');
    expect(page.text).to.not.contain('id="profile-generate-key"');
    const anonymous = await supertest(sails.hooks.http.app).get('/default/rdmp/user/profile');
    expect([302, 403]).to.include(anonymous.status);
    for (const action of ['update', 'genKey', 'revokeKey']) {
      await post(researcher, `/default/rdmp/user/${action}`, {}, 403);
    }
  });

  it('rejects mutations without a CSRF token when CSRF is enabled', async function () {
    if (sails.config.security.csrf === false) this.skip();
    await admin.post('/default/rdmp/user/genKey').set('X-Source', 'jsclient').send({}).expect(403);
  });

  it('updates only the signed-in account, and generates and revokes its hashed token', async () => {
    const before = await firstValueFrom(UsersService.getUserWithId(adminId));
    const researcherBefore = await firstValueFrom(UsersService.getUserWithId(researcherId));
    const updated = await post(admin, '/default/rdmp/user/update', { id: researcherId, details: { name: 'Self Profile Test', email: before.email, password: 'ProfileNew123!' } });
    expect(updated.body.status).to.equal(true);
    const selfAfter = await firstValueFrom(UsersService.getUserWithId(before.id));
    expect(selfAfter.name).to.equal('Self Profile Test');
    const newSession = supertest.agent(sails.hooks.http.app);
    await newSession.get('/default/rdmp/user/login').expect(200);
    const login = await post(newSession, '/user/login_local', { username: adminUsername, password: 'ProfileNew123!', branding: 'default', portal: 'rdmp' });
    expect(login.body.user.username).to.equal(adminUsername);
    const after = await firstValueFrom(UsersService.getUserWithId(researcherId));
    expect(after.name).to.equal(researcherBefore.name);
    const generated = await post(admin, '/default/rdmp/user/genKey', { id: researcherId });
    expect(generated.body.status).to.equal(true);
    const stored = await firstValueFrom(UsersService.getUserWithId(before.id));
    expect(stored.token).to.equal(crypto.createHash('sha256').update(generated.body.message).digest('base64'));
    await post(admin, '/default/rdmp/user/revokeKey', { id: researcherId });
    const revoked = await firstValueFrom(UsersService.getUserWithId(before.id));
    expect(revoked.token).to.equal(null);
  });
});
