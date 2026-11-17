import supertest from 'supertest';
import { csrfToken, loginSession } from '../helpers/admin-session';
import { firstValueFrom } from 'rxjs';

// Run in the integration environment; no external identity provider is needed.
describe('Admin users and roles deferred endpoints', function () {
  this.timeout(60_000);
  let agent: supertest.Agent;
  let csrf: string;
  let userId: string;
  let roleId: string;
  let brand: any;
  before(async () => {
    brand = BrandingService.getDefault();
    const suffix = Date.now();
    const role = await Role.create({ name: `Deferred test ${suffix}`, branding: brand.id }).fetch();
    roleId = String(role.id);
    const user = await firstValueFrom(
      UsersService.addLocalUser(
        `deferred${suffix}`,
        'Deferred endpoint test',
        `deferred${suffix}@example.test`,
        'Testing123!'
      )
    );
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(userId, [roleId]));
    agent = await loginSession();
    csrf = await csrfToken(agent);
  });
  after(async () => {
    if (userId) await User.destroy({ id: userId });
    if (roleId) await Role.destroy({ id: roleId });
  });

  it('exposes defaults and enabled sign-in methods, and filters at the list endpoint', async () => {
    const options = await agent.get('/default/rdmp/admin/users/options').set('X-Source', 'jsclient').expect(200);
    expect(options.body.signInMethods).to.be.an('array');
    const roleList = await agent.get('/default/rdmp/admin/roles/get').set('X-Source', 'jsclient').expect(200);
    expect(roleList.body.some((role: any) => role.isDefault)).to.equal(true);
    expect(roleList.body.find((role: any) => role.name === 'Admin').descriptionKey).to.equal(
      'admin-roles-description-admin'
    );
    if (options.body.signInMethods.includes('local')) {
      const list = await agent
        .get('/default/rdmp/admin/users/get?signIn=local')
        .set('X-Source', 'jsclient')
        .expect(200);
      expect(list.body.every((user: any) => user.type === 'local')).to.equal(true);
      expect(list.body.find((user: any) => user.username === 'admin').lastLogin).to.be.a('string');
    }
    await agent.get('/default/rdmp/admin/users/get?signIn=unknown').set('X-Source', 'jsclient').expect(400);
  });

  it('persists descriptions, validates limits and requires CSRF', async () => {
    const url = `/default/rdmp/admin/roles/${roleId}/description`;
    await agent.post(url).set('X-Source', 'jsclient').send({ description: 'Missing CSRF' }).expect(403);
    await agent
      .post(url)
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', csrf)
      .send({ description: 'a'.repeat(501) })
      .expect(400);
    await agent
      .post(url)
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', csrf)
      .send({ description: 'A custom role description' })
      .expect(200);
    const persisted = await Role.findOne({ id: roleId });
    expect(persisted.description).to.equal('A custom role description');
  });

  it('atomically replaces the sole role and blocks removal of the resulting default', async () => {
    const response = await agent
      .post(`/default/rdmp/admin/roles/${roleId}/users/${userId}/remove`)
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(200);
    const defaultRole = RolesService.getDefUnathenticatedRole(brand);
    expect(response.body.roles.map((role: any) => role.id)).to.deep.equal([defaultRole.id]);
    const persisted = await firstValueFrom(UsersService.getUserWithId(userId));
    expect(persisted.roles.map(role => role.id)).to.deep.equal([defaultRole.id]);
    await agent
      .post(`/default/rdmp/admin/roles/${defaultRole.id}/users/${userId}/remove`)
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(400);
  });

  it('denies unauthenticated mutations', async () => {
    await supertest((sails as any).hooks.http.app)
      .post(`/default/rdmp/admin/roles/${roleId}/description`)
      .set('X-Source', 'jsclient')
      .send({ description: 'Unauthorized' })
      .expect(403);
  });
});
