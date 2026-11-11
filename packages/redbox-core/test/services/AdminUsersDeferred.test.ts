import { expect } from 'chai';
import * as sinon from 'sinon';
import { of, firstValueFrom } from 'rxjs';
import { Services as UserServices } from '../../src/services/UsersService';
import { Services as RoleServices } from '../../src/services/RolesService';
import { Controllers } from '../../src/controllers/AdminController';
import { createMockSails, createQueryObject } from './testHelper';
import { roleDescriptionBody, adminUsersApiRoutes } from '../../src/api-routes/groups/admin-users';

// These tests use the same generated-junction shape as Waterline and verify the
// replacement write itself, so delete/insert regressions cannot pass unnoticed.
describe('Deferred admin users and roles', () => {
  const globals = [
    'sails',
    'User',
    'Role',
    'UsersService',
    'RolesService',
    'ConfigService',
    'BrandingService',
    'UserLink',
  ];
  let previous: Record<string, unknown>;
  let users: UserServices.Users;
  let roles: RoleServices.Roles;
  let user: any;
  let brand: any;
  let roleRows: any[];
  let junction: any;
  let config: any;
  beforeEach(() => {
    previous = Object.fromEntries(globals.map(key => [key, (global as any)[key]]));
    roleRows = ['Admin', 'Librarians', 'Researcher', 'Guest'].map(name => ({ id: name, name, branding: 'b' }));
    brand = { id: 'b', name: 'brand', roles: roleRows };
    config = { active: ['local', 'oidc'], defaultRole: 'Guest', aaf: { defaultRole: 'Researcher' } };
    user = { id: 'u', roles: [roleRows[2]], accountLinkState: 'active' };
    junction = {
      schema: {
        userFK: { references: 'user', columnName: 'userFK' },
        roleFK: { references: 'role', columnName: 'roleFK' },
      },
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({ id: 'membership' }) }),
      destroyOne: sinon.stub().resolves({ id: 'membership' }),
    };
    (global as any).sails = { ...createMockSails(), models: { memberships: junction } };
    (global as any).User = {
      schema: { roles: { referenceIdentity: 'memberships', on: 'userFK' } },
      find: sinon.stub().returns(createQueryObject([user, { id: 'other', roles: [{ branding: 'other' }] }])),
      update: sinon.stub().returns({ set: sinon.stub().resolves([]) }),
      replaceCollection: sinon.stub(),
    };
    (global as any).Role = {
      find: sinon.stub().returns(createQueryObject(roleRows)),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves(roleRows[2]) }),
    };
    (global as any).ConfigService = { getBrand: () => config };
    (global as any).BrandingService = { getBrand: () => brand };
    (global as any).UserLink = undefined;
    users = new UserServices.Users();
    roles = new RoleServices.Roles();
    (global as any).UsersService = users;
    (global as any).RolesService = roles;
    sinon.stub(users, 'getUserWithId').callsFake(() => of(user));
  });
  afterEach(() => {
    sinon.restore();
    for (const key of globals) (global as any)[key] = previous[key];
  });

  async function rejects(promise: Promise<unknown>, message: string) {
    try {
      await promise;
      expect.fail('Expected rejection');
    } catch (error) {
      expect((error as Error).message).to.include(message);
    }
  }

  it('writes only the actual successful user id and an ISO timestamp', async () => {
    await users.recordSuccessfulLogin({ id: 'u' });
    expect((global as any).User.update.firstCall.args).to.deep.equal([{ id: 'u' }]);
    const values = (global as any).User.update.firstCall.returnValue.set.firstCall.args[0];
    expect(Object.keys(values)).to.deep.equal(['lastLogin']);
    expect(new Date(values.lastLogin).toISOString()).to.equal(values.lastLogin);
  });

  it('records the authenticated linked identity rather than its effective primary account', async () => {
    sinon.stub(users, 'getEffectiveUser').returns(of({ id: 'primary' } as any));
    const candidate = await (users as any).resolveLinkedUserCandidate({ id: 'alias' });
    await users.recordSuccessfulLogin(candidate);
    expect((global as any).User.update.firstCall.args[0]).to.deep.equal({ id: 'alias' });
    expect(Object.keys(candidate)).to.deep.equal(['id']);
  });

  it('preserves foreign-brand roles when an admin edits brand roles', async () => {
    user.roles.push({ id: 'foreign', name: 'Foreign', branding: 'other' });
    const save = sinon.stub(users, 'updateUserRoles').returns(of(user));
    await users.updateUserRolesForBrand(brand, 'u', ['Guest']);
    expect(save.firstCall.args).to.deep.equal(['u', ['foreign', 'Guest']]);
    await rejects(users.updateUserRolesForBrand(brand, 'u', ['Foreign']), 'valid role');
  });

  it('applies sign-in at the database query and still excludes another brand', async () => {
    const result = await firstValueFrom(users.getUsersForBrand(brand, 'oidc'));
    expect((global as any).User.find.firstCall.args[0]).to.deep.equal({ type: 'oidc' });
    expect(result.map(item => item.id)).to.deep.equal(['u']);
  });

  it('exposes enabled methods and the top-level brand default without populated users', () => {
    expect(roles.getSignInMethods(brand)).to.deep.equal(['local', 'oidc']);
    roleRows[0].users = [{ password: 'secret', token: 'secret' }];
    const summary = roles.adminRoleSummary(brand, roleRows);
    expect(summary.find(role => role.isDefault)?.name).to.equal('Guest');
    expect(summary[0]).not.to.have.property('users');
    expect(summary[0].descriptionKey).to.equal('admin-roles-description-admin');
    config.defaultRole = 'Researcher';
    expect(roles.adminRoleSummary(brand, roleRows).find(role => role.isDefault)?.name).to.equal('Researcher');
  });

  it('preserves a custom description and supplies translation defaults for all built-ins', async () => {
    await roles.updateDescription(brand, 'Researcher', '  Custom plain text  ');
    const update = (global as any).Role.updateOne;
    expect(update.firstCall.args[0]).to.deep.equal({ id: 'Researcher', branding: 'b' });
    expect(update.firstCall.returnValue.set.firstCall.args[0]).to.deep.equal({ description: 'Custom plain text' });
    roleRows[2].description = 'Custom plain text';
    expect(roles.adminRoleSummary(brand, roleRows)[2].description).to.equal('Custom plain text');
    expect(roles.adminRoleSummary(brand, roleRows).every(item => item.descriptionKey)).to.equal(true);
    await roles.updateDescription(brand, 'Researcher', '');
    expect(update.lastCall.returnValue.set.lastCall.args[0]).to.deep.equal({ description: '' });
  });

  it('rejects excessive descriptions, non-text payloads and foreign roles', async () => {
    await rejects(roles.updateDescription(brand, 'Researcher', 'a'.repeat(501)), '500');
    await rejects(roles.updateDescription(brand, 'Researcher', {} as any), 'plain text');
    (global as any).Role.updateOne.returns({ set: sinon.stub().resolves(undefined) });
    await rejects(roles.updateDescription(brand, 'foreign', 'description'), 'not found');
    expect(roleDescriptionBody.safeParse({ description: '\u0000' }).success).to.equal(false);
  });

  it('replaces the only role with Guest in a single guarded membership update', async () => {
    const result = await users.removeRoleForBrand(brand, 'u', 'Researcher');
    expect(result.map(role => role.name)).to.deep.equal(['Guest']);
    expect(junction.updateOne.calledOnceWithExactly({ userFK: 'u', roleFK: 'Researcher' })).to.equal(true);
    expect(junction.updateOne.firstCall.returnValue.set.calledOnceWithExactly({ roleFK: 'Guest' })).to.equal(true);
    expect(junction.destroyOne.called).to.equal(false);
    expect((global as any).User.replaceCollection.called).to.equal(false);
  });

  it('removes one of several roles without changing the remaining memberships', async () => {
    user.roles.push(roleRows[1]);
    const result = await users.removeRoleForBrand(brand, 'u', 'Researcher');
    expect(result.map(role => role.name)).to.deep.equal(['Librarians']);
    expect(junction.destroyOne.calledOnce).to.equal(true);
    expect(junction.updateOne.called).to.equal(false);
  });

  it('blocks sole default-role removal, missing defaults, foreign membership and aliases', async () => {
    user.roles = [roleRows[3]];
    await rejects(users.removeRoleForBrand(brand, 'u', 'Guest'), 'Assign another role first');
    user.roles = [roleRows[2]];
    config.defaultRole = 'Missing';
    await rejects(users.removeRoleForBrand(brand, 'u', 'Researcher'), 'Assign another role first');
    await rejects(users.removeRoleForBrand(brand, 'u', 'foreign'), 'not found');
    user.accountLinkState = 'linked-alias';
    await rejects(users.removeRoleForBrand(brand, 'u', 'Researcher'), 'not found');
    expect(junction.updateOne.called).to.equal(false);
    expect(junction.destroyOne.called).to.equal(false);
  });

  it('protects the last active Admin for replacement and ordinary role updates', async () => {
    user.roles = [roleRows[0]];
    sinon
      .stub(users, 'enrichUsersWithEffectiveDisabledState')
      .resolves([user, { id: 'disabled', roles: [roleRows[0]], effectiveLoginDisabled: true }] as any);
    await rejects(users.removeRoleForBrand(brand, 'u', 'Admin'), 'last active Admin');
    await rejects(firstValueFrom(users.updateUserRoles('u', ['Guest'])), 'last active Admin');
    expect(junction.updateOne.called).to.equal(false);
  });

  it('allows Admin replacement when another active Admin remains', async () => {
    user.roles = [roleRows[0]];
    sinon
      .stub(users, 'enrichUsersWithEffectiveDisabledState')
      .resolves([user, { id: 'second', roles: [roleRows[0]] }] as any);
    expect((await users.removeRoleForBrand(brand, 'u', 'Admin'))[0].name).to.equal('Guest');
  });

  it('keeps empty role sets invalid and rejects stale replacement attempts', async () => {
    await rejects(firstValueFrom(users.updateUserRoles('u', [])), 'at least one role');
    junction.updateOne.returns({ set: sinon.stub().resolves(undefined) });
    await rejects(users.removeRoleForBrand(brand, 'u', 'Researcher'), 'Membership changed');
  });

  it('requires Admin and CSRF contracts for every new and changed session route', () => {
    for (const route of adminUsersApiRoutes) {
      expect(route.csrf).to.equal(true);
      expect(route.extensions?.['x-redbox-roles']).to.deep.equal(['Admin']);
    }
  });

  it('rejects invalid/disabled sign-in filters before querying users', async () => {
    const controller = new Controllers.Admin();
    const send = sinon.stub(controller as any, 'sendResp');
    const find = sinon.spy(users, 'getUsersForBrand');
    for (const signIn of ['aaf', { $ne: '' }]) {
      await controller.getUsers({ session: { branding: 'brand' }, query: { signIn } } as any, {} as any);
      expect(send.lastCall.args[2].status).to.equal(400);
    }
    expect(find.called).to.equal(false);
  });

  it('rejects role mutations from non-admin callers', async () => {
    const controller = new Controllers.Admin();
    const send = sinon.stub(controller as any, 'sendResp');
    const req = { session: { branding: 'brand' }, user: { roles: [] } } as any;
    await controller.updateRoleDescription(req, {} as any);
    await controller.removeRoleMember(req, {} as any);
    expect(send.calledTwice).to.equal(true);
    expect(send.lastCall.args[2].status).to.equal(403);
  });
});
