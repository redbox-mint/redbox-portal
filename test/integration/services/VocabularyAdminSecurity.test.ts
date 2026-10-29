import supertest from 'supertest';
import sinon from 'sinon';
import { firstValueFrom } from 'rxjs';
import type { VocabularyEntryAttributes } from '../../../packages/redbox-core/src/waterline-models';

declare const expect: Chai.ExpectStatic;

/** Real HTTP, session authentication, policies and Mongo-backed tenant associations. */
describe('Vocabulary administration ID security', function () {
  this.timeout(60_000);
  const suffix = `vocabsecurity${Date.now()}`;
  const otherName = `${suffix}brand`;
  const vocabIds: string[] = [];
  const ruleIds: string[] = [];
  let brandId: string;
  let roleId: string;
  let userId: string;
  let researcherId: string;
  let admin: supertest.Agent;
  let otherAdmin: supertest.Agent;
  let researcher: supertest.Agent;
  let ownId: string;
  let foreignId: string;
  let ownEntry: string;
  let foreignEntry: string;
  let syncStub: sinon.SinonStub;
  const app = () => (sails as Sails.Application & {
    hooks: { http: { app: Parameters<typeof supertest>[0] } }
  }).hooks.http.app;
  const login = async (username: string, password: string, branding = 'default') => {
    const agent = supertest.agent(app());
    const response = await agent.post('/user/login_local').set('X-Source', 'jsclient')
      .send({ username, password, branding, portal: 'rdmp' }).expect(200);
    expect(response.body.user.username).to.equal(username);
    return agent;
  };
  const request = (agent: supertest.Agent, transport: string, method: string, id: string,
    action = '', branding = 'default', body = {}) => {
    const path = `/${branding}/rdmp/${transport}/vocabulary/${id}${action}`;
    const call = method === 'get' ? agent.get(path) : method === 'put' ? agent.put(path)
      : method === 'delete' ? agent.delete(path) : agent.post(path);
    return call.set('X-Source', 'jsclient').set('Content-Type', 'application/json').send(body);
  };
  const snapshot = async () => ({
    vocabularies: await Vocabulary.find({ id: [ownId, foreignId] }).sort('id ASC'),
    entries: await VocabularyEntry.find({ vocabulary: [ownId, foreignId] }).sort('id ASC'),
  });
  before(async function () {
    const brand = await BrandingConfig.create({ name: otherName }).fetch();
    brandId = String(brand.id);
    const role = await Role.create({ name: 'Admin', branding: brandId }).fetch();
    roleId = String(role.id);
    const rule = await PathRule.create({ path: '/:branding/:portal/admin/vocabulary(/*)',
      role: roleId, branding: brandId, can_update: true }).fetch();
    ruleIds.push(String(rule.id));
    await firstValueFrom(BrandingService.loadAvailableBrands(null));
    await firstValueFrom(PathRulesService.bootstrap(null, []));
    const user = await firstValueFrom(UsersService.addLocalUser(`${suffix}admin`, 'Other admin',
      `${suffix}@example.edu.au`, 'RBTest123!'));
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(user.id, [roleId]));
    const ordinary = await firstValueFrom(UsersService.addLocalUser(`${suffix}researcher`, 'Researcher',
      `${suffix}researcher@example.edu.au`, 'RBTest123!'));
    researcherId = String(ordinary.id);
    await firstValueFrom(UsersService.updateUserRoles(ordinary.id,
      RolesService.getRoleIds(BrandingService.getDefault().roles, ['Researcher'])));
    admin = await login('admin', 'rbadmin');
    otherAdmin = await login(`${suffix}admin`, 'RBTest123!', otherName);
    researcher = await login(`${suffix}researcher`, 'RBTest123!');
  });
  beforeEach(async function () {
    for (const branding of ['default', brandId]) {
      const vocab = await VocabularyService.create({ name: `${suffix}${vocabIds.length}`, branding,
        type: 'tree', source: 'rva', sourceId: 'security-fixture',
        entries: [{ id: 'root', label: 'Original', value: 'original', order: 0, children: [
          { id: 'child', label: 'Original child', value: 'original-child', order: 0 },
        ] }] });
      vocabIds.push(String(vocab.id));
    }
    [ownId, foreignId] = vocabIds.slice(-2);
    ownEntry = String((await VocabularyEntry.find({ vocabulary: ownId }) as VocabularyEntryAttributes[])[0].id);
    foreignEntry = String((await VocabularyEntry.find({ vocabulary: foreignId }) as VocabularyEntryAttributes[])[0].id);
    // Spy at the external sync boundary; actual routing, authorization and storage stay real.
    syncStub = sinon.stub(sails.services.rvaimportservice, 'syncRvaVocabulary').resolves({ created: 0, updated: 0, skipped: 0 });
  });
  afterEach(function () { syncStub?.restore(); });
  after(async function () {
    if (vocabIds.length) {
      await VocabularyEntry.destroy({ vocabulary: vocabIds });
      await Vocabulary.destroy({ id: vocabIds });
    }
    if (userId) await User.destroy({ id: userId });
    if (researcherId) await User.destroy({ id: researcherId });
    if (ruleIds.length) await PathRule.destroy({ id: ruleIds });
    if (roleId) await Role.destroy({ id: roleId });
    if (brandId) await BrandingConfig.destroy({ id: brandId });
    await firstValueFrom(BrandingService.loadAvailableBrands(null));
    await firstValueFrom(PathRulesService.bootstrap(null, []));
  });

  for (const transport of ['api', 'admin']) {
    for (const [method, action] of [['get', ''], ['put', ''], ['delete', ''], ['post', '/sync'],
      ...(transport === 'api' ? [['put', '/reorder']] : [])]) {
      it(`${transport} ${method} ${action || 'detail'} denies foreign IDs before changes or sync`, async function () {
        const before = await snapshot();
        await request(admin, transport, method, foreignId, action, 'default', {
          name: 'Attacker update', branding: brandId, entryOrders: [{ id: foreignEntry, order: 7 }],
        }).query({ branding: otherName }).expect(404);
        expect(await snapshot()).to.deep.equal(before);
        expect(syncStub.called).to.equal(false);
      });
    }
    it(`${transport} preserves own-brand access and prevents body branding reassignment`, async function () {
      await request(admin, transport, 'get', ownId).expect(200);
      await request(admin, transport, 'put', ownId, '', 'default', { name: 'Own update', branding: brandId, id: foreignId })
        .query({ branding: otherName, id: foreignId }).expect(200);
      expect(String((await Vocabulary.findOne({ id: ownId }))?.branding)).to.equal(String(BrandingService.getDefault().id));
      await request(admin, transport, 'post', ownId, '/sync').expect(200);
      expect(syncStub.calledOnceWithExactly(ownId, undefined)).to.equal(true);
      await request(otherAdmin, transport, 'get', foreignId, '', otherName).expect(200);
      await request(otherAdmin, transport, 'put', foreignId, '', otherName, { description: 'Other own update' }).expect(200);
      await request(admin, transport, 'delete', ownId).expect(204);
      expect(await VocabularyEntry.count({ vocabulary: ownId })).to.equal(0);
      expect(await VocabularyEntry.count({ vocabulary: foreignId })).to.equal(2);
    });
    it(`${transport} denies anonymous, Researcher and an admin of another brand`, async function () {
      for (const agent of [supertest.agent(app()), researcher, otherAdmin]) {
        for (const [method, action] of [['get', ''], ['put', ''], ['delete', ''], ['post', '/sync']]) {
          await request(agent, transport, method, ownId, action, 'default', {}).expect(403);
        }
      }
      await request(admin, transport, 'get', foreignId, '', otherName).expect(403);
      expect(syncStub.called).to.equal(false);
    });
    it(`${transport} rejects unknown and missing path brands despite overrides`, async function () {
      const before = await snapshot();
      for (const branding of ['unknownsecuritybrand', '']) {
        const response = await request(admin, transport, 'post', foreignId, '/sync', branding,
          { branding: otherName }).query({ branding: otherName });
        expect(response.status).to.be.oneOf([403, 404]);
      }
      expect(syncStub.called).to.equal(false);
      expect(await snapshot()).to.deep.equal(before);
    });
    it(`${transport} treats replacement IDs as local aliases without mutating foreign entries`, async function () {
      const foreignBefore = await VocabularyEntry.find({ vocabulary: foreignId });
      await request(admin, transport, 'put', ownId, '', 'default', {
        entries: [{ id: foreignEntry, label: 'Parent', value: 'parent', children: [
          { id: 'child', label: 'Child', value: 'child' },
        ] }],
      }).expect(200);
      const ownEntries = await VocabularyEntry.find({ vocabulary: ownId }) as VocabularyEntryAttributes[];
      expect(ownEntries).to.have.length(2);
      expect(String(ownEntries.find(entry => entry.value === 'child')?.parent))
        .to.equal(String(ownEntries.find(entry => entry.value === 'parent')?.id));
      expect(await VocabularyEntry.find({ vocabulary: foreignId })).to.deep.equal(foreignBefore);
    });
    it(`${transport} fixes create/import to the authorized path brand`, async function () {
      await (transport === 'api'
        ? admin.post('/default/rdmp/api/vocabulary') : admin.post('/default/rdmp/admin/vocabulary'))
        .set('X-Source', 'jsclient').query({ branding: otherName })
        .send({ name: `${suffix}create${transport}`, branding: brandId }).expect(201);
      // Inspect storage rather than depending on response-envelope versions.
      const created = await Vocabulary.findOne({ name: `${suffix}create${transport}` });
      expect(created).to.exist;
      if (created) {
        vocabIds.push(String(created.id));
        expect(String(created.branding)).to.equal(String(BrandingService.getDefault().id));
      }
      const importStub = sinon.stub(sails.services.rvaimportservice, 'importRvaVocabulary').resolves({ id: ownId });
      try {
        await admin.post(`/default/rdmp/${transport}/vocabulary/import`).set('X-Source', 'jsclient')
          .query({ branding: otherName }).send({ rvaId: 'fixture', branding: brandId }).expect(200);
        expect(importStub.calledOnceWithExactly('fixture', undefined, String(BrandingService.getDefault().id))).to.equal(true);
        await researcher.post(`/default/rdmp/${transport}/vocabulary/import`).set('X-Source', 'jsclient')
          .send({ rvaId: 'fixture' }).expect(403);
        expect(importStub.calledOnce).to.equal(true);
      } finally {
        importStub.restore();
      }
    });
    it(`${transport} rejects foreign parents before replacing entries or changing vocabulary metadata`, async function () {
      const before = await snapshot();
      const response = await request(admin, transport, 'put', ownId, '', 'default', {
        name: 'Should not change', entries: [{ id: ownEntry, label: 'New', value: 'new', parent: foreignEntry }],
      });
      expect(response.status).to.be.oneOf([400, 500]);
      expect(await snapshot()).to.deep.equal(before);
    });
  }
  it('reorders own entries and rejects a mixed foreign entry batch atomically', async function () {
    const before = await snapshot();
    await request(admin, 'api', 'put', ownId, '/reorder', 'default', {
      entryOrders: [{ id: ownEntry, order: 5 }, { id: foreignEntry, order: 6 }],
    }).expect(400);
    expect(await snapshot()).to.deep.equal(before);
    await request(admin, 'api', 'put', ownId, '/reorder', 'default', {
      entryOrders: [{ id: ownEntry, order: 5 }],
    }).expect(200);
    expect((await VocabularyEntry.findOne({ id: ownEntry }))?.order).to.equal(5);
  });
  it('keeps trusted unscoped service consumers and scoped public lookups working', async function () {
    expect((await VocabularyService.getById(foreignId))?.id).to.equal(foreignId);
    expect(await VocabularyService.getByIdOrSlug('default', foreignId)).to.be.oneOf([null, undefined]);
    expect((await VocabularyService.getByIdOrSlug(otherName, foreignId))?.id).to.equal(foreignId);
  });
});
