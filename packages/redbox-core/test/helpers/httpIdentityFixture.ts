import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRouteFixture } from './httpRouteFixture';
import { mountIdentityLinkRoutes, identityLinkRoutes } from '../../src/http/express/identityLinks';
import {
  mountIdentityAdministrationRoutes,
  identityAdministrationRoutes,
} from '../../src/http/express/identityAdministration';
import { Services as Users, requireUserInBrand } from '../../src/identity/Users';
import { createSinonStubLogger } from '../logger.test';

/** Owned account HTTP with real tenant checks and enrichment over local repository ports. */
export async function httpIdentityFixture() {
  const repository = { list: sinon.stub().resolves([]), one: sinon.stub().resolves(null) };
  const domain = new Users.Users({
    repository: repository as any,
    accounts: {} as any,
    defaultBrand: sinon.stub(),
    log: createSinonStubLogger(sinon),
  });
  const users: Record<string, any> = Object.fromEntries(
    [
      'getUsersForBrand',
      'getUserWithId',
      'getUserAudit',
      'searchLinkCandidates',
      'getLinkedAccounts',
      'linkAccounts',
      'disableUser',
      'enableUser',
      'getUserWithUsername',
      'mergeBrandRoleIds',
      'addLocalUser',
      'updateUserDetails',
      'updateUserRoles',
      'setUserKey',
      'addUserAuditEvent',
    ].map(name => [name, sinon.stub()])
  );
  users.getUserWithId.returns(
    of({
      id: '111111111111111111111111',
      username: 'target-user',
      password: 'secret',
      token: 'tok',
      roles: [{ name: 'Researcher', branding: 'brand-1' }],
    })
  );
  users.getUserAudit.resolves({
    records: [{ id: 'audit-1', action: 'login', details: 'User logged in' }],
    summary: { returnedCount: 1, truncated: false },
  });
  users.searchLinkCandidates.returns(of([{ id: 'candidate-1', username: 'candidate-user' }]));
  users.getLinkedAccounts.returns(
    of({ primary: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', username: 'primary-user' }, linkedAccounts: [] })
  );
  users.linkAccounts.returns(
    of({
      primary: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', username: 'primary-user' },
      linkedAccounts: [],
      impact: { rolesMerged: 1, recordsRewritten: 2 },
    })
  );
  users.disableUser.resolves();
  users.enableUser.resolves();
  users.addUserAuditEvent.resolves();
  users.getUserWithUsername.returns(of(null));
  users.requireUserInBrand = (id: string, brandId: string) =>
    requireUserInBrand(id, brandId, { getUserWithId: id => users.getUserWithId(id), repository: repository as any });
  users.enrichUsersWithLinkMetadata = domain.enrichUsersWithLinkMetadata.bind(domain);
  users.enrichUsersWithEffectiveDisabledState = domain.enrichUsersWithEffectiveDisabledState.bind(domain);
  const roles = { getRolesWithBrand: sinon.stub().returns(of([])), createRoleWithBrand: sinon.stub() };
  const f = await httpRouteFixture((router, input) => {
    mountIdentityLinkRoutes(router, { ...input, users: users as any });
    mountIdentityAdministrationRoutes(router, { ...input, users: users as any, roles });
  });
  f.authenticate.resolves({
    ...f.actor,
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    username: 'admin-user',
    roles: [{ id: 'role-admin', brandId: f.brand.id, name: 'Admin' }],
  });
  return { ...f, users, roles, repository };
}
export const accountHttpRoutes = [...identityLinkRoutes, ...identityAdministrationRoutes];
