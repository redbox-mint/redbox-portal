import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';
import type { VocabularyAttributes } from '../../../packages/redbox-core/src/waterline-models';

describe('Vocabulary administration brand listing', function () {
  this.timeout(60_000);

  const suffix = `vocablisting${Date.now()}`;
  const otherBrandName = `${suffix}brand`;
  const vocabularyIds: string[] = [];
  const userIds: string[] = [];
  let otherBrandId: string;
  let otherRoleId: string;
  let pathRuleId: string;
  let admin: supertest.Agent;
  let otherAdmin: supertest.Agent;
  let researcher: supertest.Agent;
  let expected: VocabularyAttributes[];

  const app = () =>
    (sails as Sails.Application & { hooks: { http: { app: Parameters<typeof supertest>[0] } } }).hooks.http.app;
  const login = async (username: string, password: string, branding = 'default') => {
    const agent = supertest.agent(app());
    const response = await agent
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .send({ username, password, branding, portal: 'rdmp' })
      .expect(200);
    expect(response.body.user.username).to.equal(username);
    return agent;
  };
  const list = (agent: supertest.Agent, branding = 'default', query = {}) =>
    agent
      .get(`/${branding}/rdmp/admin/vocabulary`)
      .set('X-Source', 'jsclient')
      .query({ q: suffix, sort: 'name ASC', ...query });

  before(async function () {
    const brand = await BrandingConfig.create({ name: otherBrandName }).fetch();
    otherBrandId = String(brand.id);
    const role = await Role.create({ name: 'Admin', branding: otherBrandId }).fetch();
    otherRoleId = String(role.id);
    const rule = await PathRule.create({
      path: '/:branding/:portal/admin/vocabulary(/*)',
      role: otherRoleId,
      branding: otherBrandId,
      can_update: true,
    }).fetch();
    pathRuleId = String(rule.id);
    await firstValueFrom(BrandingService.loadAvailableBrands(null));
    await firstValueFrom(PathRulesService.bootstrap(null, []));

    const foreignUser = await firstValueFrom(
      UsersService.addLocalUser(
        `${suffix}admin`,
        'Vocabulary Other Admin',
        `${suffix}admin@example.edu.au`,
        'RBTest123!'
      )
    );
    userIds.push(String(foreignUser.id));
    await firstValueFrom(UsersService.updateUserRoles(foreignUser.id, [otherRoleId]));
    const ordinaryUser = await firstValueFrom(
      UsersService.addLocalUser(
        `${suffix}researcher`,
        'Vocabulary Researcher',
        `${suffix}researcher@example.edu.au`,
        'RBTest123!'
      )
    );
    userIds.push(String(ordinaryUser.id));
    await firstValueFrom(
      UsersService.updateUserRoles(
        ordinaryUser.id,
        RolesService.getRoleIds(BrandingService.getDefault().roles, ['Researcher'])
      )
    );

    // Interleave brands in sort order, and include different types/sources in both.
    expected = [];
    for (const [index, branding, type, source] of [
      [0, otherBrandName, 'flat', 'local'],
      [1, 'default', 'flat', 'local'],
      [2, otherBrandId, 'tree', 'local'],
      [3, 'default', 'flat', 'local'],
      [4, 'default', 'tree', 'local'],
      [5, 'default', 'flat', 'external'],
    ] as const) {
      const vocabulary = await Vocabulary.create({ name: `${suffix} ${index}`, branding, type, source }).fetch();
      vocabularyIds.push(String(vocabulary.id));
      if (branding === 'default' && type === 'flat' && source === 'local') expected.push(vocabulary);
    }
    admin = await login('admin', 'rbadmin');
    otherAdmin = await login(`${suffix}admin`, 'RBTest123!', otherBrandName);
    researcher = await login(`${suffix}researcher`, 'RBTest123!');
  });

  after(async function () {
    if (vocabularyIds.length) await Vocabulary.destroy({ id: vocabularyIds });
    if (userIds.length) await User.destroy({ id: userIds });
    if (pathRuleId) await PathRule.destroy({ id: pathRuleId });
    if (otherRoleId) await Role.destroy({ id: otherRoleId });
    if (otherBrandId) await BrandingConfig.destroy({ id: otherBrandId });
    await firstValueFrom(BrandingService.loadAvailableBrands(null));
    await firstValueFrom(PathRulesService.bootstrap(null, []));
  });

  it('counts and paginates only the requested brand while combining search, type and source', async function () {
    for (const offset of [0, 1, 2]) {
      const response = await list(admin, 'default', { type: 'flat', source: 'local', limit: 1, offset }).expect(200);
      expect(response.body.summary).to.include({ numFound: 2, start: offset, page: offset + 1 });
      expect(response.body.records.map((record: VocabularyAttributes) => record.id)).to.deep.equal(
        expected.slice(offset, offset + 1).map((record) => record.id)
      );
      expect(
        response.body.records.every(
          (record: VocabularyAttributes) => String(record.branding) === String(BrandingService.getDefault().id)
        )
      ).to.equal(true);
    }
  });

  it('ignores a query brand override and supports another brand with its own Admin', async function () {
    const response = await list(admin, 'default', { branding: otherBrandName }).expect(200);
    expect(response.body.summary.numFound).to.equal(4);
    expect(
      response.body.records.every(
        (record: VocabularyAttributes) => String(record.branding) === String(BrandingService.getDefault().id)
      )
    ).to.equal(true);
    const otherResponse = await list(otherAdmin, otherBrandName).expect(200);
    expect(otherResponse.body.summary.numFound).to.equal(2);
    expect(
      otherResponse.body.records.every((record: VocabularyAttributes) => String(record.branding) === otherBrandId)
    ).to.equal(true);
  });

  it('denies anonymous, Researcher and an Admin from another brand', async function () {
    await list(supertest.agent(app())).set('Content-Type', 'application/json').expect(403);
    await list(researcher).expect(403);
    await list(otherAdmin).expect(403);
    await list(admin, otherBrandName).expect(403);
  });

  it('normalizes brand names, IDs and objects against persisted associations', async function () {
    for (const branding of [
      'default',
      String(BrandingService.getDefault().id),
      BrandingService.getDefault(),
      { name: 'default' },
      undefined,
    ]) {
      const result = await VocabularyService.list({
        branding,
        q: suffix,
        type: 'flat',
        source: 'local',
        limit: 1,
        offset: 1,
      });
      expect(result.meta).to.deep.equal({ total: 2, limit: 1, offset: 1 });
      expect(result.data.map((record) => record.id)).to.deep.equal([expected[1].id]);
    }
    for (const branding of ['', ' ', {}, '000000000000000000000000']) {
      const result = await VocabularyService.list({ branding, q: suffix });
      expect(result.meta.total).to.equal(0);
      expect(result.data).to.deep.equal([]);
    }
  });
});
