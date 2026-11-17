import assert from 'node:assert/strict';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { csrf } from '../../helpers/csrf';
import { fixtureRemove } from '../../helpers/persistenceFixtures';
const { portalFixture: fixture } = require('../../helpers/portalFixture.cjs');

// Sampling/middleware Chronicle assertions remain in the explicit legacy oracle.
// The default suite verifies the supported native transport and safe fault body.
describe('default production Fastify integration host', () => {
  let userId: string;
  const username = 'native-host-' + randomUUID();
  before(async () => {
    const user = (await firstValueFrom(
      fixture.services.UsersService.addLocalUser(username, 'Native HTTP test', 'native@example.invalid', 'RBTest123!')
    )) as { id: string };
    userId = user.id;
    const brand = fixture.services.BrandingService.getDefault();
    await firstValueFrom(
      fixture.services.UsersService.updateUserRoles(
        userId,
        fixture.services.RolesService.getRoleIds(brand.roles, ['Admin', 'Librarians'])
      )
    );
  });
  async function authenticated() {
    const admin = supertest.agent(fixture.server);
    const token = await csrf(admin);
    const login = await admin
      .post('/user/login_local')
      .set('X-CSRF-Token', token)
      .set('X-Source', 'jsclient')
      .send({ username, password: 'RBTest123!', branding: 'default', portal: 'rdmp' })
      .expect(200);
    assert.equal(login.body.user.username, username);
    return admin;
  }
  after(async () => {
    if (userId) await fixtureRemove('User', { id: userId });
  });
  it('serves independent liveness and readiness probes after activation', async () => {
    await supertest(fixture.server).get('/healthz').expect(200);
    await supertest(fixture.server).get('/readyz').expect(200);
  });

  it('authenticates through native sessions and preserves safe parser failures', async () => {
    const admin = await authenticated();
    await admin.get('/default/rdmp/user/info').set('X-Source', 'jsclient').expect(200);
    const response = await admin
      .post('/default/rdmp/user/update')
      .set('Content-Type', 'application/json')
      .send('{"password":"PRIVATE MALFORMED PASSWORD",')
      .expect(400);
    assert(!response.text.includes('PRIVATE'));
  });

  it('returns a safe native provider failure without leaking credentials', async () => {
    const admin = await authenticated();
    const service = fixture.services.I18nEntriesService;
    const original = service.getBundle;
    service.getBundle = async () => {
      throw new Error('Upstream Authorization: Bearer private-runtime-token');
    };
    try {
      const response = await admin
        .get('/default/rdmp/app/i18n/bundles/en/translation')
        .set('X-Source', 'jsclient')
        .expect(500);
      assert(!response.text.includes('Upstream'));
      assert(!response.text.includes('private-runtime-token'));
    } finally {
      service.getBundle = original;
    }
  });
});
