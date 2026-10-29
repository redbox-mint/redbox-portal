import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { expect } from 'chai';
import type { UserModel } from '@researchdatabox/redbox-core';
import type { PathRuleAttributes } from '@researchdatabox/redbox-core/dist/waterline-models/PathRule';

describe('REST user listing brand and includeDisabled contract', function () {
  this.timeout(60_000);

  const path = '/default/rdmp/api/users';
  const marker = `rest-list-${randomUUID()}`;
  const userIds: string[] = [];
  let admin: ReturnType<typeof supertest.agent>;
  let researcher: ReturnType<typeof supertest.agent>;
  let activeId: string;
  let disabledId: string;
  let otherBrandId: string;
  let foreignDisabledId: string;
  let otherAdmin: ReturnType<typeof supertest.agent>;
  let linkedId: string;
  let disabledLinkedId: string;
  const otherPath = `/${marker}/rdmp/api/users`;
  const roleIdsToDelete: string[] = [];
  const foreignIds: string[] = [];

  before(async function () {
    // Exercise the application's real HTTP route, authentication, contract
    // validation, controller, service enrichment, and datastore (no stubs).
    const app = (sails as unknown as { hooks: { http: { app: import('express').Express } } }).hooks.http.app;
    admin = supertest.agent(app);
    researcher = supertest.agent(app);
    const brand = BrandingService.getDefault();
    const roleIds = RolesService.getRoleIds(brand.roles, ['Researcher']);
    const otherBrand = await BrandingConfig.create({ name: marker }).fetch();
    otherBrandId = String(otherBrand.id);
    const otherRoles = new Map<string, string>();
    for (const role of brand.roles) {
      const created = await Role.create({ name: role.name, branding: otherBrandId }).fetch();
      roleIdsToDelete.push(String(created.id));
      otherRoles.set(role.name, String(created.id));
    }
    // Copy real authorization rules, with brand-specific role ids.
    for (const rule of (await PathRule.find({ branding: brand.id }).populate('role')) as Array<
      PathRuleAttributes & { can_update?: boolean }
    >) {
      const name = (rule.role as { name: string }).name;
      await PathRule.create({
        path: rule.path,
        role: otherRoles.get(name),
        branding: otherBrandId,
        can_read: rule.can_read,
        can_update: rule.can_update,
      });
    }
    await firstValueFrom(BrandingService.loadAvailableBrands(null));
    await firstValueFrom(PathRulesService.loadRules());
    otherAdmin = supertest.agent(app);

    for (const suffix of ['active', 'disabled']) {
      const user = await firstValueFrom<UserModel>(
        UsersService.addLocalUser(`${marker}-${suffix}`, marker, `${marker}-${suffix}@example.edu.au`, 'RBTest123!')
      );
      const id = String(user.id);
      userIds.push(id);
      await firstValueFrom(
        UsersService.updateUserRoles(
          id,
          suffix === 'disabled' ? RolesService.getRoleIds(brand.roles, ['Researcher', 'Librarians']) : roleIds
        )
      );
      if (suffix === 'active') activeId = id;
      else disabledId = id;
    }
    await User.update({ id: disabledId }).set({ loginDisabled: true });

    const fixtures = new Map<string, string>();
    for (const suffix of [
      'foreign-active',
      'foreign-disabled',
      'other-admin',
      'linked',
      'disabled-linked',
      'inactive-link',
      'foreign-link',
      'unassigned',
    ]) {
      const user = await firstValueFrom<UserModel>(
        UsersService.addLocalUser(`${marker}-${suffix}`, marker, `${marker}-${suffix}@example.edu.au`, 'RBTest123!')
      );
      const id = String(user.id);
      userIds.push(id);
      fixtures.set(suffix, id);
      if (['foreign-active', 'foreign-disabled', 'other-admin'].includes(suffix)) {
        foreignIds.push(id);
        await firstValueFrom(
          UsersService.updateUserRoles(id, [otherRoles.get(suffix === 'other-admin' ? 'Admin' : 'Researcher')!])
        );
      }
    }
    await User.update({ id: fixtures.get('foreign-disabled') }).set({ loginDisabled: true });
    foreignDisabledId = fixtures.get('foreign-disabled')!;
    linkedId = fixtures.get('linked')!;
    disabledLinkedId = fixtures.get('disabled-linked')!;
    for (const [suffix, primaryId, linkBrand] of [
      ['linked', activeId, brand.id],
      ['disabled-linked', disabledId, brand.id],
      ['inactive-link', activeId, brand.id],
      ['foreign-link', fixtures.get('foreign-active')!, otherBrandId],
    ] as const) {
      await User.update({ id: fixtures.get(suffix) }).set({
        accountLinkState: 'linked-alias',
        linkedPrimaryUserId: primaryId,
      });
      await UserLink.create({
        primaryUserId: primaryId,
        primaryUsername: `${marker}-primary`,
        secondaryUserId: fixtures.get(suffix)!,
        secondaryUsername: `${marker}-${suffix}`,
        brandId: String(linkBrand),
        status: 'active',
        createdBy: 'admin',
      }).fetch();
      if (suffix === 'inactive-link') {
        // Historical inactive links must not grant membership. Current writes
        // only permit active links, so seed the historical row via the adapter.
        const db = sails.getDatastore('mongodb').manager as unknown as import('mongodb').Db;
        await db
          .collection('userlink')
          .updateOne({ secondaryUserId: fixtures.get(suffix) }, { $set: { status: 'inactive' } });
      }
    }
    foreignIds.push(fixtures.get('foreign-link')!);

    for (const [agent, username, password] of [
      [admin, 'admin', 'rbadmin'],
      [researcher, `${marker}-active`, 'RBTest123!'],
      [otherAdmin, `${marker}-other-admin`, 'RBTest123!'],
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
    if (userIds.length) {
      await UserLink.destroy({ secondaryUserId: userIds });
      await User.destroy({ id: userIds });
    }
    if (otherBrandId) {
      await PathRule.destroy({ branding: otherBrandId });
      await Role.destroy({ id: roleIdsToDelete });
      await BrandingConfig.destroy({ id: otherBrandId });
      await firstValueFrom(BrandingService.loadAvailableBrands(null));
      await firstValueFrom(PathRulesService.loadRules());
    }
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

      const ids =
        includeDisabled === 'true' ? [activeId, disabledId, linkedId, disabledLinkedId] : [activeId, linkedId];
      expect(response.body.records.map((user: { id: string }) => user.id)).to.have.members(ids);
      expect(response.body.summary.numFound).to.equal(ids.length);
      for (const user of response.body.records) {
        expect(user).not.to.have.property('password');
        expect(user).not.to.have.property('token');
        expect(user.effectiveLoginDisabled).to.equal([disabledId, disabledLinkedId].includes(user.id));
      }
    });
  }

  for (const includeDisabled of [undefined, 'false', 'true']) {
    it(`counts and paginates only eligible users with includeDisabled=${includeDisabled ?? 'omitted'}`, async function () {
      const expected =
        includeDisabled === 'true' ? [activeId, disabledId, linkedId, disabledLinkedId] : [activeId, linkedId];
      const ids: string[] = [];
      for (let page = 1; page <= expected.length + 1; page++) {
        const response = await admin
          .get(path)
          .query({
            searchBy: 'name',
            query: marker,
            pageSize: 1,
            page,
            ...(includeDisabled === undefined ? {} : { includeDisabled }),
          })
          .expect(200);
        expect(response.body.summary.numFound).to.equal(expected.length);
        expect(response.body.summary.page).to.equal(page);
        expect(response.body.records).to.have.length(page <= expected.length ? 1 : 0);
        ids.push(...response.body.records.map((user: { id: string }) => user.id));
      }
      expect(ids).to.have.members(expected);
    });
  }

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

  for (const includeDisabled of [undefined, 'false', 'true']) {
    it(`scopes the second valid brand with includeDisabled=${includeDisabled ?? 'omitted'}`, async function () {
      const response = await otherAdmin
        .get(otherPath)
        .query({ searchBy: 'name', query: marker, ...(includeDisabled === undefined ? {} : { includeDisabled }) })
        .expect(200);
      const expected = includeDisabled === 'true' ? foreignIds : foreignIds.filter(id => id !== foreignDisabledId);
      expect(response.body.records.map((user: { id: string }) => user.id)).to.have.members(expected);
      expect(response.body.summary.numFound).to.equal(expected.length);
    });
  }

  it('also isolates listings without a search filter', async function () {
    const response = await admin.get(path).query({ includeDisabled: 'true', pageSize: 100 }).expect(200);
    const ids = response.body.records.map((user: { id: string }) => user.id);
    expect(ids).to.include.members([activeId, disabledId, linkedId, disabledLinkedId]);
    for (const id of foreignIds) expect(ids).not.to.include(id);
  });

  it('does not let a brand admin list another valid brand', async function () {
    await admin.get(otherPath).query({ includeDisabled: 'true' }).expect(403);
    await otherAdmin.get(path).query({ includeDisabled: 'true' }).expect(403);
  });

  it('does not return or count foreign users by exact search', async function () {
    for (const includeDisabled of ['false', 'true']) {
      const response = await admin
        .get(path)
        .query({ searchBy: 'username', query: `${marker}-foreign-disabled`, includeDisabled })
        .expect(200);
      expect(response.body.records).to.deep.equal([]);
      expect(response.body.summary.numFound).to.equal(0);
    }
  });

  it('reports primary disablement for an eligible linked alias', async function () {
    const response = await admin
      .get(path)
      .query({ searchBy: 'username', query: `${marker}-disabled-linked`, includeDisabled: 'true' })
      .expect(200);
    expect(response.body.records).to.have.length(1);
    expect(response.body.records[0]).to.include({ effectiveLoginDisabled: true, disabledByPrimaryUserId: disabledId });
  });

  it('still rejects an unknown brand', async function () {
    await admin.get(`/${marker}-missing/rdmp/api/users`).query({ includeDisabled: 'true' }).expect(404);
  });
});
