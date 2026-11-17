import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';

/** Runs in the existing Docker Mocha suite. All fixtures and credentials are restored. */
describe('Harvest run global statistics API', function () {
  const prefix = `harvest-statistics-${randomUUID()}`;
  const token = randomUUID();
  const nonAdminToken = randomUUID();
  const path = '/default/rdmp/api/harvest-runs/summary';
  let brand: any;
  let adminId: string | number;
  let originalToken: string | null | undefined;
  let nonAdminId: string | number;

  before(async function () {
    brand = BrandingService.getBrand('default');
    const admin = await User.findOne({ username: 'admin' });
    if (!admin) throw new Error('Integration admin fixture is missing');
    adminId = admin.id;
    originalToken = admin.token;
    await firstValueFrom(UsersService.setUserKey(adminId, token));
    const nonAdmin = await User.create({
      username: prefix,
      name: 'Harvest statistics test',
      type: 'local',
      email: `${prefix}@example.invalid`,
      token: nonAdminToken,
    }).fetch();
    nonAdminId = nonAdmin.id;
  });

  after(async function () {
    await HarvestRun.destroy({ sourceName: prefix });
    if (nonAdminId) await User.destroy({ id: nonAdminId });
    if (adminId) await User.update({ id: adminId }, { token: originalToken });
  });

  it('requires authentication and Admin access', async function () {
    const anonymous = await supertest(sails.hooks.http.app).get(path).set('Content-Type', 'application/json');
    expect([401, 403]).to.include(anonymous.status);
    const nonAdmin = await supertest(sails.hooks.http.app)
      .get(path)
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${nonAdminToken}`);
    expect([401, 403]).to.include(nonAdmin.status);
  });

  it('counts in Mongo across pages and filters while isolating the brand', async function () {
    const get = (suffix = '') =>
      supertest(sails.hooks.http.app)
        .get(path + suffix)
        .set('Authorization', `Bearer ${token}`)
        .set('X-ReDBox-Api-Version', '2.0');
    const before = (await get().expect(200)).body.data;
    const now = Date.now();
    const iso = (days: number) => new Date(now - days * 86400000).toISOString();
    await HarvestRun.createEach([
      {
        brandId: String(brand.id),
        sourceRunId: prefix + '-1',
        sourceName: prefix,
        recordType: 'rdmp',
        status: 'failed',
        startedAt: iso(1),
      },
      {
        brandId: String(brand.id),
        sourceRunId: prefix + '-2',
        sourceName: prefix,
        recordType: 'rdmp',
        status: 'running',
        startedAt: iso(1),
      },
      {
        brandId: String(brand.id),
        sourceRunId: prefix + '-3',
        sourceName: prefix,
        recordType: 'rdmp',
        status: 'completed_with_errors',
        startedAt: iso(1),
        completedAt: iso(0),
      },
      {
        brandId: String(brand.id),
        sourceRunId: prefix + '-4',
        sourceName: prefix,
        recordType: 'rdmp',
        status: 'failed',
        startedAt: iso(8),
      },
      {
        brandId: prefix + '-other-brand',
        sourceRunId: prefix + '-5',
        sourceName: prefix,
        recordType: 'rdmp',
        status: 'failed',
        startedAt: iso(1),
      },
    ]);
    const response = await get('?status=completed&sourceName=missing&brandId=other&page=99&pageSize=1').expect(200);
    expect(response.body.data.runsLast7Days).to.equal(before.runsLast7Days + 3);
    expect(response.body.data.failedLast7Days).to.equal(before.failedLast7Days + 1);
    expect(response.body.data.runningNow).to.equal(before.runningNow + 1);
    expect(response.body.data.lastSuccessfulRun).to.deep.equal(before.lastSuccessfulRun);
    expect(response.headers['cache-control']).to.contain('no-cache');
  });
});
