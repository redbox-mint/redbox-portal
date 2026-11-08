import supertest from 'supertest';
import { csrfToken, loginSession } from '../helpers/admin-session';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'node:crypto';


/** Actual session/API saves and BSON restoration, including installations with no override. */
describe('Authorized domain/email save normalization API', function () {
  this.timeout(60_000);
  let admin: supertest.Agent;
  let csrf: string;
  let collection: any;
  let original: any[];
  let query: any;
  let adminId: string | number;
  let originalToken: string | null | undefined;
  const token = randomUUID();
  const draft = {
    enabled: true,
    domainsAaf: [' Uni.EDU.au. ', 'uni.edu.au'], emailsAaf: [' J.Smith@UNI.edu.au ', 'j.smith@uni.edu.au'],
    domainsOidc: [' Uni.EDU.au. ', 'UNI.edu.au'], emailsOidc: [' Guest@Other.org ', 'guest@other.org'],
  };
  const normalized = {
    enabled: true, domainsAaf: ['uni.edu.au'], emailsAaf: ['j.smith@uni.edu.au'],
    domainsOidc: ['uni.edu.au'], emailsOidc: ['guest@other.org'],
  };
  before(async () => {
    const brand = BrandingService.getBrand('default');
    collection = (AppConfig.getDatastore().manager as any).collection('appconfig');
    // Use the BSON ID supplied by this datastore driver, which may differ from the root MongoDB dependency.
    const nativeBrand = await BrandingConfig.getDatastore().manager.collection(BrandingConfig.tableName).findOne({ name: brand.name });
    query = { branding: nativeBrand._id, configKey: 'authorizedDomainsEmails' };
    original = await collection.find(query).toArray();
    const user = await User.findOne({ username: 'admin' });
    adminId = user.id; originalToken = user.token;
    await firstValueFrom(UsersService.setUserKey(adminId, token));
    admin = await loginSession();
    csrf = await csrfToken(admin);
  });
  after(async () => {
    if (original) {
      await collection.deleteMany(query);
      if (original.length) await collection.insertMany(original);
      await AppConfigService.bootstrap();
    }
    if (adminId) await User.update({ id: adminId }, { token: originalToken });
  });
  for (const path of ['/appconfig/form/', '/api/appconfig/', '/api/admin/config/']) {
    it(`normalizes on save through ${path} and agrees with tester and sign-in`, async () => {
      const request = admin.post(`/default/rdmp${path}authorizedDomainsEmails`);
      if (path.startsWith('/api/')) request.set('Authorization', `Bearer ${token}`);
      else request.set('X-CSRF-Token', csrf);
      await request.send(draft).expect(200);
      const rows = await collection.find(query).toArray();
      expect(rows).to.have.length(1);
      expect(rows[0].configData).to.deep.equal(normalized);
      for (const provider of ['aaf', 'oidc']) {
        const result = await admin.post('/default/rdmp/admin/appconfig/authorizedDomainsEmails/test')
          .set('X-CSRF-Token', csrf).send({ email: 'Person@UNI.edu.au', provider }).expect(200);
        expect(result.body).to.deep.equal({ allowed: true, reason: 'allowed-domain', matchedRule: 'uni.edu.au' });
        expect(UsersService.checkAuthorizedEmail('Person@UNI.edu.au', 'default', provider)).to.equal(true);
        expect(UsersService.checkAuthorizedEmail('person@staff.uni.edu.au', 'default', provider)).to.equal(false);
      }
    });
  }
});
