import assert from 'node:assert/strict';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import { httpIdentityFixture } from '../helpers/httpIdentityFixture';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountIdentityLinkRoutes } from '../../src/http/express/identityLinks';

describe('Identity route target precedence', () => {
  const selected = '111111111111111111111111';
  const other = '222222222222222222222222';
  let f: Awaited<ReturnType<typeof httpIdentityFixture>>;
  beforeEach(async () => {
    f = await httpIdentityFixture();
    f.users.getUserWithId.callsFake((id: string) =>
      of({ id, username: id, roles: [{ name: 'Researcher', branding: 'brand-1' }] })
    );
    f.users.updateUserDetails.callsFake((id: string, name: string) => of([{ id, name, username: id }]));
    f.users.updateUserRoles.callsFake((id: string) => of({ id }));
    f.users.setUserKey.callsFake((id: string) => of({ id, username: id }));
  });
  afterEach(async () => {
    await f.close();
    sinon.restore();
  });

  for (const query of [`?id=${other}`, `?userid=${other}`, `?id=${other}&userid=${other}`, '']) {
    it(`REST update selects its declared body.id ${query}`, async () => {
      const response = await f.request('/default/portal/api/users' + query, {
        method: 'POST',
        body: { id: selected, userid: other, name: 'Updated', email: '', password: '' },
      });
      assert.equal(response.status, 201);
      assert.equal(f.users.updateUserDetails.firstCall.args[0], selected);
      assert.equal(response.body.id, selected);
    });
  }
  for (const body of [{ userid: other }, { id: undefined, userid: other }, {}]) {
    it(`REST update rejects an omitted body.id with fallback ${JSON.stringify(body)}`, async () => {
      const response = await f.request('/default/portal/api/users?id=' + other, {
        method: 'POST',
        body: { ...body, name: 'Updated', email: '', password: '' },
      });
      assert.equal(response.status, 400);
      assert.equal(f.users.getUserWithId.callCount + f.users.updateUserDetails.callCount, 0);
    });
  }
  for (const action of ['genKey', 'revokeKey', 'update', 'roles']) {
    const suffix = action === 'roles' ? '/admin/roles/user' : '/admin/users/' + action;
    const operation = action === 'update' ? 'updateUserDetails' : action === 'roles' ? 'updateUserRoles' : 'setUserKey';
    it(`browser ${action} keeps body.userid under simultaneous body/query conflicts`, async () => {
      const response = await f.request(`/default/portal${suffix}?id=${other}&userid=${other}`, {
        method: 'POST',
        body: { userid: selected, id: other, details: { name: 'Updated' }, roles: [] },
      });
      assert.equal(response.status, 200);
      assert.equal(f.users.getUserWithId.firstCall.args[0], selected);
      assert.equal(f.users[operation].firstCall.args[0], selected);
      assert(f.users[operation].getCalls().every((call: sinon.SinonSpyCall) => call.args[0] !== other));
    });
    it(`browser ${action} rejects omitted body.userid despite every unrelated ID source`, async () => {
      const response = await f.request(`/default/portal${suffix}?id=${other}&userid=${other}`, {
        method: 'POST',
        body: { id: other, details: { name: 'Updated' }, roles: [] },
      });
      assert.equal(response.status, 400);
      assert.equal(f.users.getUserWithId.callCount + f.users[operation].callCount, 0);
      assert.equal(f.users.addUserAuditEvent.callCount, 0);
    });
  }
  for (const prefix of ['api', 'admin']) {
    for (const action of ['disable', 'enable']) {
      it(`${prefix} ${action} selects path ID despite conflicting body and query`, async () => {
        const response = await f.request(`/default/portal/${prefix}/users/${selected}/${action}?id=${other}`, {
          method: 'POST',
          body: { id: other, userid: other },
        });
        assert.equal(response.status, 200);
        assert.equal(f.users[action + 'User'].firstCall.args[0], selected);
      });
    }
  }
  for (const action of ['genKey', 'revokeKey', 'update']) {
    it(`self ${action} selects authenticated actor despite conflicting IDs`, async () => {
      const response = await f.request(`/default/portal/user/${action}?id=${other}`, {
        method: 'POST',
        body: { id: other, userid: other, details: { name: 'Updated' } },
      });
      assert.equal(response.status, 200);
      const operation = action === 'update' ? 'updateUserDetails' : 'setUserKey';
      assert.equal(f.users[operation].firstCall.args[0], 'aaaaaaaaaaaaaaaaaaaaaaaa');
    });
  }

  for (const alias of ['find', 'get']) {
    for (const version of ['1.0', '2.0']) {
      it(`REST ${alias} returns a disabled account in API ${version}`, async () => {
        f.users.findUsersWithQuery.returns(
          of([{ id: selected, username: 'disabled-user', loginDisabled: true, roles: [] }])
        );
        const response = await f.request(
          `/default/portal/api/users/${alias}?searchBy=username&query=disabled-user&apiVersion=${version}`
        );
        assert.equal(response.status, 200);
        assert.equal((version === '2.0' ? response.body.data : response.body).id, selected);
      });
    }
  }

  it('filters account lookup before enrichment and checks membership of each matching candidate', async () => {
    f.users.findUsersWithQuery.returns(of([{ id: other }, { id: selected }]));
    f.users.getUserWithId.callsFake((id: string) =>
      of({
        id,
        username: 'shared',
        roles: [{ name: 'Researcher', branding: id === selected ? 'brand-1' : 'other-brand' }],
      })
    );
    const response = await f.request('/default/portal/api/users/get?searchBy=username&query=shared');
    assert.equal(response.status, 200);
    assert.equal(response.body.id, selected);
    assert.deepEqual(f.users.findUsersWithQuery.firstCall.args, [{ username: 'shared' }, null]);
    assert.equal(f.users.getUsersForBrand.callCount, 0);
    assert.deepEqual(f.users.getUserWithId.args, [[other], [selected]]);
  });

  it('returns 404 when the filtered account has no membership in the requested brand', async () => {
    f.users.findUsersWithQuery.returns(of([{ id: other }]));
    f.users.getUserWithId.returns(of({ id: other, roles: [{ name: 'Researcher', branding: 'other-brand' }] }));
    const response = await f.request('/default/portal/api/users/get?searchBy=id&query=' + other);
    assert.equal(response.status, 404);
    assert.equal(f.users.getUsersForBrand.callCount, 0);
  });
  it('REST list still excludes disabled accounts by default', async () => {
    f.users.getUsersForBrand.returns(of([{ id: selected, username: 'disabled-user', loginDisabled: true, roles: [] }]));
    const response = await f.request('/default/portal/api/users');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.records, []);
  });
  for (const suffix of [
    '/api/users',
    '/api/users/find?searchBy=username&query=hidden',
    '/api/users/get?searchBy=username&query=hidden',
  ]) {
    it(`keeps hiddenUsers as a browser setting for ${suffix}`, async () => {
      const user = { id: selected, username: 'hidden', name: 'Hidden', roles: [] };
      const fixture = await httpRouteFixture((router, input) =>
        mountIdentityLinkRoutes(router, {
          ...input,
          hiddenUsers: ['Hidden'],
          users: {
            getUsersForBrand: () => of([user]),
            findUsersWithQuery: () => of([user]),
            requireUserInBrand: async () => user,
            enrichUsersWithLinkMetadata: async (value: unknown[]) => value,
            enrichUsersWithEffectiveDisabledState: async (value: unknown[]) => value,
          } as never,
        })
      );
      try {
        const response = await fixture.request('/default/portal' + suffix);
        assert.equal(response.status, 200);
        if (suffix === '/api/users') assert.equal(response.body.records.length, 1);
        assert.equal((suffix === '/api/users' ? response.body.records[0] : response.body).id, selected);
        assert.deepEqual((await fixture.request('/default/portal/admin/users/get')).body, []);
      } finally {
        await fixture.close();
      }
    });
  }
});
