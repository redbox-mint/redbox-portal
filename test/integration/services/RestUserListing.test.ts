import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { expect } from 'chai';

describe('REST user listing includeDisabled contract', function () {
  this.timeout(60_000);

  const path = '/default/rdmp/api/users';
  const marker = `rest-list-${randomUUID()}`;
  const userIds: string[] = [];
  let admin: ReturnType<typeof supertest.agent>;
  let researcher: ReturnType<typeof supertest.agent>;
  let activeId: string;
  let disabledId: string;

  before(async function () {
    // Exercise the application's real HTTP route, authentication, contract
    // validation, controller, service enrichment, and datastore (no stubs).
    const app = (sails as unknown as { hooks: { http: { app: import('express').Express } } }).hooks.http.app;
    admin = supertest.agent(app);
    researcher = supertest.agent(app);
    const brand = BrandingService.getDefault();
    const roleIds = RolesService.getRoleIds(brand.roles, ['Researcher']);

    for (const suffix of ['active', 'disabled']) {
      const user = await firstValueFrom(
        UsersService.addLocalUser(`${marker}-${suffix}`, marker, `${marker}-${suffix}@example.edu.au`, 'RBTest123!')
      );
      const id = String(user.id);
      userIds.push(id);
      await firstValueFrom(UsersService.updateUserRoles(id, roleIds));
      if (suffix === 'active') activeId = id;
      else disabledId = id;
    }
    await User.update({ id: disabledId }).set({ loginDisabled: true });

    for (const [agent, username, password] of [
      [admin, 'admin', 'rbadmin'],
      [researcher, `${marker}-active`, 'RBTest123!'],
    ] as const) {
      const response = await agent
        .post('/user/login_local')
        .set('X-Source', 'jsclient')
        .send({ username, password, branding: 'default', portal: 'rdmp' })
        .expect(200);
      expect(response.body.user.username).to.equal(username);
    }
  });

  after(async function () {
    if (userIds.length) await User.destroy({ id: userIds });
  });

  for (const includeDisabled of [undefined, 'false', 'true']) {
    it(`returns matching users and count with includeDisabled=${includeDisabled ?? 'omitted'}`, async function () {
      const response = await admin
        .get(path)
        .query({
          searchBy: 'name',
          query: marker,
          ...(includeDisabled === undefined ? {} : { includeDisabled }),
        })
        .expect(200);

      const ids = includeDisabled === 'true' ? [activeId, disabledId] : [activeId];
      expect(response.body.records.map((user: { id: string }) => user.id)).to.have.members(ids);
      expect(response.body.summary.numFound).to.equal(ids.length);
      for (const user of response.body.records) {
        expect(user).not.to.have.property('password');
        expect(user).not.to.have.property('token');
        expect(user.effectiveLoginDisabled).to.equal(user.id === disabledId);
      }
    });
  }

  it('counts all matching users before pagination when disabled users are included', async function () {
    const response = await admin
      .get(path)
      .query({ searchBy: 'name', query: marker, includeDisabled: 'true', pageSize: 1, page: 2 })
      .expect(200);

    expect(response.body.records).to.have.length(1);
    expect([activeId, disabledId]).to.include(response.body.records[0].id);
    expect(response.body.summary.numFound).to.equal(2);
    expect(response.body.summary.page).to.equal(2);
  });

  it('preserves the search filter when disabled users are included', async function () {
    const response = await admin
      .get(path)
      .query({ searchBy: 'username', query: `${marker}-disabled`, includeDisabled: 'true' })
      .expect(200);

    expect(response.body.records.map((user: { id: string }) => user.id)).to.deep.equal([disabledId]);
    expect(response.body.summary.numFound).to.equal(1);
  });

  for (const includeDisabled of ['yes', '1', '']) {
    it(`rejects invalid includeDisabled=${JSON.stringify(includeDisabled)}`, async function () {
      const response = await admin.get(path).query({ searchBy: 'name', query: marker, includeDisabled }).expect(400);

      expect(JSON.stringify(response.body)).to.include('query.includeDisabled');
      expect(response.body).not.to.have.property('records');
    });
  }

  it('does not grant researchers access when disabled users are requested', async function () {
    await researcher.get(path).query({ includeDisabled: 'true' }).expect(403);
  });

  it('still rejects an unknown brand', async function () {
    await admin.get(`/${marker}/rdmp/api/users`).query({ includeDisabled: 'true' }).expect(404);
  });
});
