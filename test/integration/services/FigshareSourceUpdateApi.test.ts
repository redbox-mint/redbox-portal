import supertest from 'supertest';

describe('Figshare source update API', function () {
  this.timeout(60_000);
  let admin: supertest.Agent; let csrf = ''; let source: any; let vocabulary: any;
  const app = () => (sails as any).hooks.http.app;
  const path = () => `/default/rdmp/api/figshare-vocabularies/sources/${source.id}`;
  before(async () => {
    const brand = BrandingService.getDefault();
    vocabulary = await Vocabulary.create({ branding: brand.id, name: 'Source API fixture', slug: `source-api-${Date.now()}`, source: 'external', type: 'tree' }).fetch();
    source = await FigshareVocabularySource.create({ branding: brand.id, vocabulary: vocabulary.id, scope: 'public', taxonomyId: `source-api-${Date.now()}`, displayName: 'API fixture', createdBy: 'integration-test', updatedBy: 'integration-test' }).fetch();
    admin = supertest.agent(app()); await admin.get('/default/rdmp/user/login').expect(200);
    csrf = sails.config.security.csrf === false ? '' : (await admin.get('/csrfToken').expect(200)).body._csrf;
    await admin.post('/user/login_local').set('X-CSRF-Token', csrf).set('X-Source','jsclient').send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' }).expect(200);
  });
  after(async () => {
    if (source) {
      await FigshareVocabularySource.destroy({ id: source.id });
      await CacheEntry.destroy({ name: `figshare-vocabulary-sync:${source.branding}:${source.scope}:${source.taxonomyId}` });
    }
    if (vocabulary) await Vocabulary.destroy({ id: vocabulary.id });
  });
  const update = (body: unknown) => admin.put(path()).set('X-ReDBox-Api-Version','2.0').set('X-CSRF-Token',csrf).send(body);
  it('protects updates with Admin session and CSRF, validates metadata and stores a real schedule', async () => {
    const draft = { expectedRevision: 0, displayName: 'Renamed API fixture', scope: 'public', archived: false, syncSchedule: 'daily' };
    await supertest(app()).put(path()).send(draft).expect(403);
    if (sails.config.security.csrf !== false) await admin.put(path()).send(draft).expect(403);
    await update({ ...draft, syncSchedule: 'every-second' }).expect(400);
    const saved = (await update(draft).expect(200)).body.data;
    expect(saved.settingsRevision).to.equal(1); expect(saved.syncSchedule).to.equal('daily'); expect(saved.nextSyncAt).to.be.a('string');
    await update(draft).expect(409);
    await update({ ...draft, expectedRevision: 1, scope: 'account' }).expect(422);
    await update({ ...draft, expectedRevision: 1, syncSchedule: 'manual' }).expect(200);
    expect((await FigshareVocabularySource.findOne({ id: source.id })).nextSyncAt).to.equal(null);
  });
});
