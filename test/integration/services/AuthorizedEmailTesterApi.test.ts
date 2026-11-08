import supertest from 'supertest';
import { csrfToken, loginSession } from '../helpers/admin-session';
import { firstValueFrom } from 'rxjs';
import { evaluateAuthorizedEmail } from '../../../packages/redbox-core/src/utilities/AuthorizedEmailAccess';

/** Real session, routing, policies, CSRF and saved configuration; no identity-provider dependency. */
describe('Authorized email tester API', function () {
  this.timeout(60_000);
  const path = '/default/rdmp/admin/appconfig/authorizedDomainsEmails/test';
  let admin: supertest.Agent;
  let ordinary: supertest.Agent;
  let csrf: string;
  let ordinaryCsrf: string;
  let userId: string;
  const app = () => (sails as any).hooks.http.app;
  const token = csrfToken;
  const login = loginSession;
  before(async () => {
    const suffix = `emailtester${Date.now()}`;
    const user = await firstValueFrom(UsersService.addLocalUser(suffix, 'Address tester fixture', `${suffix}@example.test`, 'Testing123!'));
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(userId, RolesService.getRoleIds(BrandingService.getDefault().roles, ['Researcher'])));
    admin = await login('admin', 'rbadmin');
    ordinary = await login(suffix, 'Testing123!');
    const requestCsrf1 = await token(admin);
    csrf = requestCsrf1;
    const requestCsrf2 = await token(ordinary);
    ordinaryCsrf = requestCsrf2;
  });
  after(async () => { if (userId) await User.destroy({ id: userId }); });
  const check = (body: object) => admin.post(path).set('X-CSRF-Token', csrf).set('X-Source', 'jsclient').send(body);

  it('rejects anonymous and non-Admin sessions', async () => {
    const anonymous = supertest.agent(app());
    const anonymousToken = await token(anonymous);
    await anonymous.post(path).set('X-CSRF-Token', anonymousToken).send({ email: 'person@uni.edu.au', provider: 'aaf' }).expect(403);
    await ordinary.post(path).set('X-CSRF-Token', ordinaryCsrf).send({ email: 'person@uni.edu.au', provider: 'aaf' }).expect(403);
  });
  it('requires a CSRF token even for a logged-in Admin', async function () {
    await admin.post(path).send({ email: 'person@uni.edu.au', provider: 'aaf' }).expect(403);
    await admin.post(path).set('X-CSRF-Token', 'invalid').send({ email: 'person@uni.edu.au', provider: 'aaf' }).expect(403);
  });
  it('uses saved settings by default and replaces them with drafts without saving', async () => {
    const before = JSON.stringify(sails.config.brandingAware('default').authorizedDomainsEmails);
    const saved = await check({ email: 'person@uni.edu.au', provider: 'aaf' }).expect(200);
    expect(saved.body).to.deep.equal(evaluateAuthorizedEmail('person@uni.edu.au', sails.config.brandingAware('default').authorizedDomainsEmails ?? {}, 'aaf'));
    for (const [email, provider, draft, reason] of [
      ['Person@UNI.edu.au', 'aaf', { enabled: true, domainsAaf: ['uni.edu.au'] }, 'allowed-domain'],
      ['Guest@OTHER.org', 'oidc', { enabled: true, emailsOidc: ['guest@other.org'] }, 'allowed-exception'],
      ['person@staff.uni.edu.au', 'aaf', { enabled: true, domainsAaf: ['uni.edu.au'] }, 'denied'],
      ['person@other.org', 'aaf', { enabled: false }, 'disabled'],
      ['person@other.org', 'oidc', { enabled: true }, 'unrestricted'],
    ] as const) {
      const response = await check({ email, provider, draft }).expect(200);
      expect(response.body.reason).to.equal(reason);
      expect(response.body.allowed).to.equal(reason !== 'denied');
    }
    expect(JSON.stringify(sails.config.brandingAware('default').authorizedDomainsEmails)).to.equal(before);
    const savedAgain = await check({ email: 'person@uni.edu.au', provider: 'aaf' }).expect(200);
    expect(savedAgain.body).to.deep.equal(saved.body);
  });
  it('rejects invalid addresses, providers, drafts, tenant overrides and excessive lists', async () => {
    for (const input of [
      { email: 'invalid', provider: 'aaf' },
      { email: 'person@uni.edu.au', provider: 'local' },
      { email: 'person@uni.edu.au', provider: 'aaf', branding: 'other' },
      { email: 'person@uni.edu.au', provider: 'aaf', draft: { domainsAaf: Array(501).fill('uni.edu.au') } },
      { email: 'person@uni.edu.au', provider: 'aaf', draft: { domainsAaf: ['x'.repeat(255)] } },
    ]) await check(input).expect(400);
  });
});
