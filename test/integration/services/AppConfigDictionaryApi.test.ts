import supertest from 'supertest';

/** Existing authenticated save routes must validate maps without dropping extension values. */
describe('AppConfig dictionary save API', function () {
  this.timeout(60_000);
  const keys = ['systemMessage', 'authorizedDomainsEmails', 'menu', 'homePanels', 'adminSidebar', 'figsharePublishing', 'oniPublishing', 'doiPublishing', 'integrationNotification', 'raidPublishing', 'webAnalytics'];
  let agent: supertest.Agent;
  let csrf: string;
  let original: any[];
  let collection: any;
  let query: any;
  before(async () => {
    const brand = BrandingService.getBrand('default');
    collection = (AppConfig.getDatastore().manager as any).collection('appconfig');
    // Use the native BSON documents so timestamps, IDs, types and field order can be restored exactly.
    query = { configKey: { $in: keys } };
    original = await collection.find(query).toArray();
    agent = supertest.agent((sails as any).hooks.http.app);
    await agent.get('/default/rdmp/user/login').expect(200);
    csrf = (await agent.get('/csrfToken')).body._csrf;
    await agent.post('/user/login_local').set('X-CSRF-Token', csrf)
      .send({ username: 'admin', password: 'rbadmin', branding: brand.name, portal: 'rdmp' }).expect(200);
    await agent.get('/default/rdmp/user/login').expect(200);
    csrf = (await agent.get('/csrfToken')).body._csrf;
  });
  after(async () => {
    if (original) {
      await collection.deleteMany(query);
      if (original.length) await collection.insertMany(original);
      await AppConfigService.bootstrap();
    }
  });
  for (const key of keys) {
    it(`${key}: round-trips values with extension data through the real session save route`, async () => {
      const page = await agent.get(`/default/rdmp/admin/appconfig/edit/${key}`).expect(200);
      expect(page.text).to.contain('app-config');
      const form = (await agent.get(`/default/rdmp/appconfig/form/${key}`).expect(200)).body;
      const model = { ...form.model, futureExtension: { 'literal.key[0]': [null, false, 0, { preserve: true }] } };
      await agent.post(`/default/rdmp/appconfig/form/${key}`).set('X-CSRF-Token', csrf).send(model).expect(200);
      const loaded = (await agent.get(`/default/rdmp/appconfig/form/${key}`).expect(200)).body.model;
      expect(loaded).to.deep.equal(model);
    });
  }
  it('rejects wrong dictionary value types before persistence', async () => {
    const before = await collection.find(query).toArray();
    await agent.post('/default/rdmp/appconfig/form/oniPublishing').set('X-CSRF-Token', csrf)
      .send({ sites: { public: { storage: { diskName: 42 } } } }).expect(400);
    expect(await collection.find(query).toArray()).to.deep.equal(before);
  });
});
