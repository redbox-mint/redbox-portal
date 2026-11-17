import supertest from 'supertest';
import { csrfToken, loginSession } from '../helpers/admin-session';

describe('Figshare source update API', function () {
  this.timeout(60_000);
  let admin: supertest.Agent; let csrf = ''; let source: any; let vocabulary: any;
  const app = () => (sails as any).hooks.http.app;
  const path = () => `/default/rdmp/api/figshare-vocabularies/sources/${source.id}`;
  before(async () => {
    const brand = BrandingService.getDefault();
    vocabulary = await Vocabulary.create({ branding: brand.id, name: 'Source API fixture', slug: `source-api-${Date.now()}`, source: 'external', type: 'tree' }).fetch();
    source = await FigshareVocabularySource.create({ branding: brand.id, vocabulary: vocabulary.id, scope: 'public', taxonomyId: `source-api-${Date.now()}`, displayName: 'API fixture', createdBy: 'integration-test', updatedBy: 'integration-test' }).fetch();
    admin = await loginSession();
    csrf = await csrfToken(admin);
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
    const claim = `figshare-vocabulary-sync:${source.branding}:${source.scope}:${source.taxonomyId}`;
    await CacheEntry.create({ name: claim, ts_added: Date.now(), data: { owner: 'integration-test' } });
    try {
      await update({ ...draft, expectedRevision: 1 }).expect(409);
    } finally { await CacheEntry.destroy({ name: claim }); }
    await update({ ...draft, expectedRevision: 1, syncSchedule: 'manual' }).expect(200);
    expect((await FigshareVocabularySource.findOne({ id: source.id })).nextSyncAt).to.equal(null);
  });
});
