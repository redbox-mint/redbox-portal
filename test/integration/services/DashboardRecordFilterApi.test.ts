import { randomUUID } from 'node:crypto';
import supertest from 'supertest';

/** Exercise the public transport and real Mongo filtering without touching remote vocabularies. */
describe('Dashboard record filter API', function () {
  this.timeout(60_000);
  let admin: supertest.Agent;
  const prefix = `lookup-api-${randomUUID()}`;
  const app = () => (sails as any).hooks.http.app;
  before(async () => {
    admin = supertest.agent(app());
    await admin.get('/default/rdmp/user/login').expect(200);
    const csrf = sails.config.security.csrf === false ? '' : (await admin.get('/csrfToken').expect(200)).body._csrf;
    await admin.post('/user/login_local').set('X-CSRF-Token', csrf).set('X-Source', 'jsclient')
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' }).expect(200);
    const brand = BrandingService.getDefault();
    for (const [suffix, brandId, allowed] of [['visible', String(brand.id), true], ['hidden', String(brand.id), false], ['other-brand', 'other-brand', true]] as const) {
      await sails.models.record.create({
        redboxOid: `${prefix}-${suffix}`,
        metaMetadata: { type: 'party', brandId, packageType: 'party' },
        metadata: { fullName: `${prefix} Name`, email: `${prefix}@example.test` },
        workflow: { stage: 'draft' },
        authorization: { view: allowed ? ['admin'] : ['other-user'], edit: [], viewRoles: [], editRoles: [] },
      });
    }
  });
  after(async () => {
    await sails.models.record.destroy({ redboxOid: { startsWith: prefix } });
  });
  const records = (query: object) => admin.get('/default/rdmp/listRecords').set('X-ReDBox-Api-Version', '2.0')
    .query({ recordType: 'party', state: 'draft', start: '0', rows: '20', filterFields: 'metadata.fullName,metadata.email', ...query });
  it('keeps AND by default, opts into literal OR, and retains brand and authorization constraints', async () => {
    expect((await records({ filter: `${prefix} Name` }).expect(200)).body.data.totalItems).to.equal(0);
    for (const filter of [`${prefix} Name`, `${prefix}@example.test`]) {
      const result = (await records({ filter, filterMode: 'any' }).expect(200)).body.data;
      expect(result.totalItems).to.equal(1);
      expect(result.items[0].oid).to.equal(`${prefix}-visible`);
    }
    expect((await records({ filter: `${prefix}.*`, filterMode: 'any' }).expect(200)).body.data.totalItems).to.equal(0);
    await records({ filter: prefix, filterMode: 'unsupported' }).expect(400);
    await records({ filter: prefix, filterMode: 'any', filterFields: '$where' }).expect(400);
  });
});
