import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';

/** Run by the existing Docker Mocha integration suite; fixtures are always removed. */
describe('Named query usage API', function () {
  const name = 'integrationNamedQueryUsage';
  const reportName = 'integrationNamedQueryUsageReport';
  const token = '2d72a4d6-e142-43ee-853a-145e9be5d6d7';
  let request: supertest.Agent;
  let brand: any;
  let adminId: string | number;
  let originalToken: string | null | undefined;

  before(async function () {
    request = supertest.agent(sails.hooks.http.app);
    brand = BrandingService.getBrand('default');
    const admin = await User.findOne({ username: 'admin' });
    if (!admin) throw new Error('Integration admin fixture is missing');
    adminId = admin.id;
    originalToken = admin.token;
    await firstValueFrom(UsersService.setUserKey(adminId, token));
    await NamedQueryService.create(brand, name, { collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} });
    await RBReport.create({ branding: brand.id, name: reportName, title: 'Usage integration report', reportSource: 'database', databaseQuery: { queryName: name }, columns: [], filter: [] });
  });

  after(async function () {
    if (brand) {
      await RBReport.destroy({ key: `${brand.id}_${reportName}` });
      await NamedQuery.destroy({ key: `${brand.id}_${name}` });
    }
    if (adminId) await User.update({ id: adminId }, { token: originalToken });
  });

  it('does not expose consumer configuration to anonymous callers', async function () {
    const response = await supertest(sails.hooks.http.app).get('/default/rdmp/api/named-query');
    expect([401, 403]).to.include(response.status);
  });

  it('returns linked consumers on list and detail, refuses in-use deletion even with force', async function () {
    const list = await request.get('/default/rdmp/api/named-query').set('Authorization', `Bearer ${token}`).set('X-ReDBox-Api-Version', '2.0').expect(200);
    const query = list.body.data.find((entry: any) => entry.name === name);
    expect(query.usedBy).to.deep.equal([{ type: 'report', name: 'Usage integration report', path: `/admin/report/${reportName}` }]);
    const detail = await request.get(`/default/rdmp/api/named-query/${name}`).set('Authorization', `Bearer ${token}`).set('X-ReDBox-Api-Version', '2.0').expect(200);
    expect(detail.body.data.usedBy).to.deep.equal(query.usedBy);
    const refused = await request.delete(`/default/rdmp/api/named-query/${name}?force=true`).set('Authorization', `Bearer ${token}`).set('X-ReDBox-Api-Version', '2.0').expect(409);
    expect(refused.body.meta.usedBy).to.deep.equal(query.usedBy);
    expect(await NamedQuery.findOne({ key: `${brand.id}_${name}` })).not.to.equal(undefined);
  });

  it('allows deletion after all references are removed', async function () {
    await RBReport.destroy({ key: `${brand.id}_${reportName}` });
    await request.delete(`/default/rdmp/api/named-query/${name}`).set('Authorization', `Bearer ${token}`).set('X-ReDBox-Api-Version', '2.0').expect(200);
    expect(await NamedQuery.findOne({ key: `${brand.id}_${name}` })).to.equal(undefined);
  });
});
