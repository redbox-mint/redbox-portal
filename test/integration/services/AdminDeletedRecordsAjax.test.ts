import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';

/** Real session policies and CSRF; run with the mounted Mocha integration suite. */
describe('Admin deleted-record bulk AJAX routes', function () {
  this.timeout(60_000);
  const path = '/default/rdmp/admin/deletedRecords/bulk';
  let admin: supertest.Agent;
  let researcher: supertest.Agent;
  let token: string;
  let researcherToken: string;
  let userId: string;

  before(async () => {
    const app = (sails as any).hooks.http.app;
    admin = supertest.agent(app);
    await admin.get('/default/rdmp/user/login').expect(200);
    token = sails.config.security.csrf === false ? '' : (await admin.get('/csrfToken')).body._csrf;
    await admin
      .post('/user/login_local')
      .set('X-CSRF-Token', token)
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
      .expect(200);
    token = sails.config.security.csrf === false ? '' : (await admin.get('/csrfToken')).body._csrf;
    const brand = BrandingService.getDefault();
    const username = `bulkdeleted${Date.now()}`;
    const user = await firstValueFrom(
      UsersService.addLocalUser(username, 'Bulk deleted test', `${username}@example.edu.au`, 'RBTest123!')
    );
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(userId, RolesService.getRoleIds(brand.roles, ['Researcher'])));
    researcher = supertest.agent(app);
    await researcher.get('/default/rdmp/user/login').expect(200);
    researcherToken = sails.config.security.csrf === false ? '' : (await researcher.get('/csrfToken')).body._csrf;
    await researcher
      .post('/user/login_local')
      .set('X-CSRF-Token', researcherToken)
      .send({ username, password: 'RBTest123!', branding: 'default', portal: 'rdmp' })
      .expect(200);
    researcherToken = sails.config.security.csrf === false ? '' : (await researcher.get('/csrfToken')).body._csrf;
  });
  after(async () => {
    if (userId) await User.destroy({ id: userId });
  });

  it('rejects a session mutation without a CSRF token', async function () {
    // The standard Mocha compose explicitly disables CSRF; exercise this check when enabled.
    if (sails.config.security.csrf === false) this.skip();
    await admin.post(path).send({ action: 'restore', items: [] }).expect(403);
  });
  it('rejects a non-admin even with a valid CSRF token', async () => {
    await researcher.post(path).set('X-CSRF-Token', researcherToken).send({ action: 'restore', items: [] }).expect(403);
  });
  it('validates the cap and action before dispatch', async () => {
    await admin
      .post(path)
      .set('X-CSRF-Token', token)
      .send({
        action: 'restore',
        items: Array.from({ length: 101 }, (_, index) => ({ oid: `absent-${index}`, entityTag: 'invalid' })),
      })
      .expect(400);
    await admin.post(path).set('X-CSRF-Token', token).send({ action: 'unsupported', items: [] }).expect(400);
  });
  it('returns an independent unavailable result for each absent record', async () => {
    const response = await admin
      .post(path)
      .set('X-CSRF-Token', token)
      .send({
        action: 'destroy',
        items: ['absent-deleted-a', 'absent-deleted-b'].map(oid => ({ oid, entityTag: 'invalid' })),
      })
      .expect(200);
    expect(response.body.results).to.deep.equal(
      ['absent-deleted-a', 'absent-deleted-b'].map(oid => ({ oid, status: 'failed', reason: 'not-found-or-forbidden' }))
    );
  });
  it('rejects invalid deletion periods on the paged list', async () => {
    await admin.get('/default/rdmp/listDeletedRecords?deletedWithin=999').expect(400);
    const response = await admin.get('/default/rdmp/listDeletedRecords?deletedWithin=7&start=0&rows=10').expect(200);
    expect(response.body.items).to.be.an('array');
  });
});
