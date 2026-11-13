import { randomUUID } from 'node:crypto';
import supertest from 'supertest';

describe('Vocabulary last successful sync API', function () {
  this.timeout(60_000);
  let admin: supertest.Agent;
  let vocabulary: any;
  const name = `last-sync-api-${randomUUID()}`;
  const app = () => (sails as any).hooks.http.app;
  before(async () => {
    admin = supertest.agent(app());
    await admin.get('/default/rdmp/user/login').expect(200);
    const csrf = sails.config.security.csrf === false ? '' : (await admin.get('/csrfToken').expect(200)).body._csrf;
    await admin.post('/user/login_local').set('X-CSRF-Token', csrf).set('X-Source', 'jsclient')
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' }).expect(200);
    const brand = BrandingService.getDefault();
    vocabulary = await Vocabulary.create({ branding: brand.id, name, slug: name, type: 'flat', source: 'rva', sourceId: name, lastSyncedAt: '2026-01-02T03:04:05.000Z' }).fetch();
  });
  after(async () => { if (vocabulary) await Vocabulary.destroy({ id: vocabulary.id }); });
  it('returns the stored last successful RVA timestamp in the vocabulary list', async () => {
    const result = (await admin.get('/default/rdmp/api/vocabulary').set('X-ReDBox-Api-Version', '2.0').query({ q: name }).expect(200)).body.data;
    expect(result.records.find((row: any) => String(row.id) === String(vocabulary.id)).lastSyncedAt).to.equal('2026-01-02T03:04:05.000Z');
  });
});
