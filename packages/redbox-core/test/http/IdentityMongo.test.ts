import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mongoFixture } from './mongoFixture';

describe('standalone pilot identity on real MongoDB', function () {
  this.timeout(30_000);
  let fixture: Awaited<ReturnType<typeof mongoFixture>>;
  beforeEach(async () => {
    fixture = await mongoFixture();
  });
  afterEach(async () => {
    await fixture?.close();
  });

  it('authenticates repository credentials and hydrated brand roles, refusing invalid credentials', async () => {
    const { identity, user, role, brand } = fixture;
    const actor = await identity.bearer('pilot-api-token');
    assert(actor);
    assert.equal(actor.id, user.id);
    assert.deepEqual(actor.roles, [{ id: role.id, brandId: brand.id }]);
    assert.deepEqual(await identity.local('pilot-admin', 'pilot-password'), actor);
    assert.deepEqual(await identity.session(String(user.id)), actor);
    assert.equal(await identity.bearer('invalid'), false);
    assert.equal(await identity.local('pilot-admin', 'wrong'), false);
    assert.equal('token' in actor, false);
    assert.equal('password' in actor, false);
  });

  it('rereads linked/disabled users and current memberships, refusing orphan aliases', async () => {
    const { identity, identities, user, reader } = fixture;
    const alias = await identities.create('user', {
      username: 'alias',
      name: 'Alias',
      type: 'local',
      email: 'alias@example.invalid',
      token: createHash('sha256').update('alias-token').digest('base64'),
      linkedPrimaryUserId: user.id,
      accountLinkState: 'linked-alias',
    });
    assert.deepEqual(await identity.bearer('alias-token'), await identity.session(String(user.id)));
    await identities.replaceMemberships('user', String(user.id), [reader.id]);
    const changed = await identity.session(String(alias.id));
    assert(changed);
    assert.equal(changed.roles[0].id, reader.id);
    await identities.update('user', { id: user.id }, { loginDisabled: true });
    assert.equal(await identity.session(String(alias.id)), false);
    assert.equal(await identity.bearer('pilot-api-token'), false);
    await identities.remove('user', { id: user.id });
    assert.equal(await identity.bearer('alias-token'), false);
  });
});
