import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sinon from 'sinon';
import * as nodemailer from 'nodemailer';
import { firstValueFrom } from 'rxjs';
import { EmailMongoFake } from '../helpers/EmailMongoFake';
import { Services as AdminServices, filterEmailPreviewContext } from '../../src/services/EmailTemplateAdminService';
import { Services as TemplateServices, EmailTemplateError } from '../../src/services/EmailTemplateService';
import { Services as EmailServices } from '../../src/services/EmailService';
import { Services as SanitizerServices } from '../../src/services/DomSanitizerService';
import { dompurify } from '../../src/config/dompurify.config';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

const actor = { id: 'editor', name: 'Template Editor' };
const content = (label = 'Draft') => ({
  subject: label,
  body: `${label} {{record.metadata.title}}`,
  format: 'text' as const,
});

describe('Email template administration', () => {
  let dir: string;
  let previousSails: unknown;
  let mock: any;
  let mongo: EmailMongoFake;
  let admin: AdminServices.EmailTemplateAdmin;
  let live: TemplateServices.EmailTemplates;
  let email: EmailServices.Email;
  let transport: sinon.SinonStub;
  beforeEach(async () => {
    previousSails = (global as any).sails;
    dir = mkdtempSync(join(tmpdir(), 'email-admin-'));
    writeFileSync(join(dir, 'notice.hbs'), 'Default {{record.metadata.title}}');
    writeFileSync(join(dir, 'file-only.hbs'), 'File only');
    mock = createMockSails({
      config: {
        appUrl: 'https://portal.example',
        dompurify,
        search: { serviceName: 'search' },
        emailnotification: {
          settings: { enabled: true, templateDir: dir, additionalContextRoots: ['scuEmail'] },
          defaults: { subject: 'Default', format: 'text' },
          templates: { notice: { subject: 'Default', template: 'notice' } },
        },
      },
    });
    setupServiceTestGlobals(mock);
    mongo = new EmailMongoFake();
    (global as any).EmailTemplate = {
      tableName: 'emailtemplate',
      getDatastore: mongo.datastore,
      findOne: async (criteria: any) => [...mongo.live.values()].find(row => mongo.matches(row, criteria)),
      find: async (criteria: any) => [...mongo.live.values()].filter(row => mongo.matches(row, criteria)),
    };
    (global as any).EmailTemplateDraft = { tableName: 'emailtemplatedraft' };
    (global as any).EmailTemplateHistory = { tableName: 'emailtemplatehistory' };
    (global as any).BrandingConfig = {
      findOne: async ({ id }: any) => (['a', 'b'].includes(id) ? { id, name: id } : null),
    };
    (global as any).BrandingService = { getBrandById: (id: string) => ({ id, name: id }) };
    (global as any).RecordsService = {
      getMeta: sinon
        .stub()
        .resolves({
          oid: 'oid-a',
          metadata: { title: 'Record title' },
          authorization: { view: ['reader'] },
          metaMetadata: { brandId: 'a', type: 'rdmp', secret: 'PRIVATE' },
          revision: 'PRIVATE',
          storage: 'PRIVATE',
        }),
      hasViewAccess: sinon.stub().returns(true),
    };
    admin = new AdminServices.EmailTemplateAdmin();
    live = new TemplateServices.EmailTemplates();
    email = new EmailServices.Email();
    (global as any).EmailTemplateService = live;
    (global as any).EmailService = email;
    (global as any).DomSanitizerService = new SanitizerServices.DomSanitizer();
    transport = sinon.stub(nodemailer, 'createTransport').throws(new Error('Preview attempted to send'));
    await live.bootstrap();
  });
  afterEach(() => {
    assert.equal(transport.callCount, 0, 'Admin operations must never create a mail transport');
    sinon.restore();
    cleanupServiceTestGlobals();
    if (previousSails !== undefined) (global as any).sails = previousSails;
    for (const key of [
      'EmailTemplate',
      'EmailTemplateDraft',
      'EmailTemplateHistory',
      'BrandingConfig',
      'BrandingService',
      'RecordsService',
      'EmailService',
      'EmailTemplateService',
      'DomSanitizerService',
    ])
      delete (global as any)[key];
    rmSync(dir, { recursive: true, force: true });
  });
  const save = () => admin.saveDraft('a', 'notice', content(), null, actor);

  it('enumerates config keys and file-only defaults without seeding or modifying data', async () => {
    const entries = await admin.catalogue('a');
    assert.deepEqual(
      entries.map(row => row.templateId),
      ['file-only', 'notice']
    );
    assert.ok(entries.every(row => row.source === 'default' && !row.hasDraft && !row.invalid));
    assert.equal(mongo.live.size, 0);
    assert.equal(mongo.stores.get('emailtemplatehistory')!.size, 0);
  });
  it('returns editor defaults, live tokens, revisions, and help from validator roots/helpers', async () => {
    const draft = await save();
    const state = await admin.getEditorState('a', 'notice');
    assert.equal(state.draft!.draftRevision, draft.draft.draftRevision);
    assert.equal(state.draft!.baseVersion, null);
    assert.ok(state.help.contextRoots.includes('scuEmail'));
    assert.ok(state.help.helpers.includes('if'));
    assert.equal(state.historyMaxVersions, 50);
    assert.equal(state.live, null);
  });
  it('saves syntax and policy diagnostics for work in progress but refuses publication', async () => {
    const result = await admin.saveDraft(
      'a',
      'notice',
      { ...content(), subject: '{{#if}}', body: 'PRIVATE\n{{unknownRoot}}' },
      null,
      actor
    );
    assert.equal(result.diagnostics.length, 2);
    assert.deepEqual(result.diagnostics[1], {
      code: 'INVALID_TEMPLATE',
      field: 'body',
      reason: 'UNKNOWN_CONTEXT_ROOT',
      line: 2,
      column: 3,
    });
    await assert.rejects(admin.publish('a', 'notice', result.draft.draftRevision, null, actor), {
      code: 'INVALID_TEMPLATE',
    });
    assert.equal(mongo.live.size, 0);
    assert.equal((await admin.listHistory('a', 'notice')).length, 0);
  });
  it('publishes, resets while retaining a draft, and recreates at monotonically increasing versions', async () => {
    const first = await save();
    const published = await admin.publish('a', 'notice', first.draft.draftRevision, null, actor);
    assert.equal(published.state.live!.token.revision, 1);
    assert.equal(published.state.draft, null);
    const next = await save();
    const reset = await admin.resetToDefault('a', 'notice', published.state.live!.token, actor);
    assert.equal(reset.state.live, null);
    assert.equal(reset.state.draft!.draftRevision, next.draft.draftRevision);
    const recreated = await admin.publish('a', 'notice', next.draft.draftRevision, null, actor);
    assert.equal(recreated.state.live!.token.revision, 3);
    assert.notEqual(recreated.state.live!.token.id, published.state.live!.token.id);
    const history = await admin.listHistory('a', 'notice');
    assert.deepEqual(
      history.map(row => row.event),
      ['publish', 'reset', 'publish']
    );
    assert.equal(history[1].body, null);
    assert.equal(history[0].actorDisplayName, actor.name);
  });
  it('keeps stage-1 direct writes monotonic across reset/recreate and stores default hashes', async () => {
    const one = await live.create('a', 'notice', content());
    await live.reset('a', 'notice', { id: one.id, revision: one.revision });
    const three = await live.create('a', 'notice', content());
    assert.equal(three.revision, 3);
    assert.equal(three.defaultHash!.length, 64);
  });
  it('prunes oldest history after successful transitions, including resets, without pruning live', async () => {
    mock.config.emailnotification.settings.historyMaxVersions = 2;
    let token: any = null;
    for (let i = 0; i < 4; i++) {
      const draft = await save();
      token = (await admin.publish('a', 'notice', draft.draft.draftRevision, token, actor)).state.live!.token;
    }
    assert.deepEqual(
      (await admin.listHistory('a', 'notice')).map(row => row.version),
      [4, 3]
    );
    await admin.resetToDefault('a', 'notice', token, actor);
    assert.deepEqual(
      (await admin.listHistory('a', 'notice')).map(row => row.version),
      [5, 4]
    );
  });
  it('fences a create delayed before reservation across reset and history pruning', async () => {
    mock.config.emailnotification.settings.historyMaxVersions = 1;
    const delayed = new TemplateServices.EmailTemplates();
    const heads = mongo.collection('emailtemplatelifecyclehead');
    const reserve = heads.findOneAndUpdate;
    let paused = false;
    sinon.stub(delayed as any, 'heads').returns({ ...heads, findOneAndUpdate: async (criteria: any, update: any, opts: any) => {
      if (!paused) {
        paused = true;
        const winner = await live.create('a', 'notice', content('Winner'));
        await live.reset('a', 'notice', { id: winner.id, revision: winner.revision });
        assert.deepEqual((await admin.listHistory('a', 'notice')).map(row => row.version), [2]);
      }
      return reserve(criteria, update, opts);
    } });
    await assert.rejects(delayed.create('a', 'notice', content('Stale')), { code: 'REVISION_CONFLICT' });
    assert.equal(await live.get('a', 'notice'), null);
    assert.deepEqual(await live.reportInconsistencies('a'), []);
    assert.equal((await live.create('a', 'notice', content('Fresh'))).revision, 3);
  });
  it('rejects a late history insertion after recovery and another reset advanced the head', async () => {
    mock.config.emailnotification.settings.historyMaxVersions = 1;
    const delayed = new TemplateServices.EmailTemplates();
    const history = mongo.collection('emailtemplatehistory');
    sinon.stub(delayed as any, 'historyCollection').returns({ ...history, insertOne: async (row: any) => {
      await live.reconcileTransition('a', 'notice', { action: 'rollback', expectedVersion: 1, writersQuiesced: true, actor });
      const next = await live.create('a', 'notice', content('Winner'));
      await live.reset('a', 'notice', { id: next.id, revision: next.revision });
      return history.insertOne(row);
    } });
    await assert.rejects(delayed.create('a', 'notice', content('Stale')), { code: 'REVISION_CONFLICT' });
    assert.equal(await live.get('a', 'notice'), null);
    assert.equal((await admin.getHistoryVersion('a', 'notice', 1)).applied, false);
    assert.equal((await live.create('a', 'notice', content('Next'))).revision, 4);
  });
  it('blocks other workers while a history insert is delayed, even with no live row', async () => {
    const insert = mongo.collection('emailtemplatehistory').insertOne;
    sinon.stub(mongo.collection('emailtemplatehistory'), 'insertOne').callsFake(async (row: any) => {
      await assert.rejects(live.create('a', 'notice', content('Other')), { code: 'REVISION_CONFLICT' });
      assert.equal((await live.reportInconsistencies('a'))[0].version, 1);
      return insert(row);
    });
    assert.equal((await live.create('a', 'notice', content())).revision, 1);
  });
  it('bounds delayed pruning below its own commit and protects live v2 during the v3 reservation', async () => {
    mock.config.emailnotification.settings.historyMaxVersions = 1;
    const oldPruner = new TemplateServices.EmailTemplates();
    let heldVersion = 0;
    sinon.stub(oldPruner as any, 'pruneHistory').callsFake(async (_b: string, _t: string, v: number) => { heldVersion = v; });
    const one = await oldPruner.create('a', 'notice', content('One'));
    const two = await live.update('a', 'notice', content('Two'), { id: one.id, revision: one.revision });
    sinon.stub(mongo.collection('emailtemplate'), 'findOneAndUpdate').rejects(new Error('failed write'));
    await assert.rejects(live.update('a', 'notice', content('Three'), { id: two.id, revision: two.revision }), { code: 'PERSISTENCE' });
    await (live as any).pruneHistory('a', 'notice', heldVersion);
    assert.equal((await live.get('a', 'notice'))!.revision, 2);
    assert.ok(await mongo.collection('emailtemplatehistory').findOne({ brandId: 'a', templateId: 'notice', version: 2 }));
    assert.ok(await mongo.collection('emailtemplatehistory').findOne({ brandId: 'a', templateId: 'notice', version: 3 }));
  });
  it('lazily initializes legacy live rows without history and arbitrates concurrent first use', async () => {
    const row = await live.create('a', 'notice', content('Legacy'));
    mongo.stores.get('emailtemplatehistory')!.clear();
    mongo.stores.get('emailtemplatelifecyclehead')!.clear();
    row.revision = 12;
    mongo.live.set(JSON.stringify(['a', 'notice']), row);
    const results = await Promise.allSettled([live.update('a', 'notice', content('A'), { id: row.id, revision: 12 }),
      live.update('a', 'notice', content('B'), { id: row.id, revision: 12 })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await live.get('a', 'notice'))!.revision, 13);
  });
  it('reconciles failed create/update/reset, preserving monotonic versions and audit evidence', async () => {
    const options = (expectedVersion: number, action: 'complete' | 'rollback') => ({ expectedVersion, action, writersQuiesced: true, actor });
    const inserts = sinon.stub(mongo.collection('emailtemplate'), 'insertOne').rejects(new Error('failed create'));
    await assert.rejects(live.create('a', 'notice', content('Create')), { code: 'PERSISTENCE' });
    inserts.restore();
    const inspected = await live.reconcileTransition('a', 'notice');
    assert.equal(inspected.pendingVersion, 1);
    assert.ok(!JSON.stringify(inspected).includes('subject'));
    await assert.rejects(live.reconcileTransition('a', 'notice', { action: 'complete', expectedVersion: 1, actor }), { code: 'INVALID_TEMPLATE' });
    await assert.rejects(live.reconcileTransition('a', 'notice', options(0, 'complete')), { code: 'REVISION_CONFLICT' });
    assert.equal((await live.reconcileTransition('a', 'notice', options(1, 'complete'))).outcome, 'completed');
    const one = (await live.get('a', 'notice'))!;
    const updates = sinon.stub(mongo.collection('emailtemplate'), 'findOneAndUpdate').rejects(new Error('failed update'));
    await assert.rejects(live.update('a', 'notice', content('Update'), { id: one.id, revision: 1 }), { code: 'PERSISTENCE' });
    updates.restore();
    assert.equal((await live.reconcileTransition('a', 'notice', options(2, 'rollback'))).outcome, 'rolled-back');
    assert.equal((await live.get('a', 'notice'))!.revision, 1);
    assert.equal((await admin.getHistoryVersion('a', 'notice', 2)).applied, false);
    await assert.rejects(admin.restoreToDraft('a', 'notice', 2, null, actor), { code: 'INCOMPLETE_TRANSITION' });
    const three = await live.update('a', 'notice', content('Three'), { id: one.id, revision: 1 });
    assert.equal(three.revision, 3);
    assert.equal((await admin.getHistoryVersion('a', 'notice', 2)).applied, false);
    const removes = sinon.stub(mongo.collection('emailtemplate'), 'deleteOne').rejects(new Error('failed reset'));
    await assert.rejects(live.reset('a', 'notice', { id: three.id, revision: 3 }), { code: 'PERSISTENCE' });
    removes.restore();
    assert.equal((await live.reconcileTransition('a', 'notice', options(4, 'complete'))).outcome, 'completed');
    assert.equal(await live.get('a', 'notice'), null);
    assert.equal((await live.create('a', 'notice', content('Five'))).revision, 5);
    assert.equal(mongo.stores.get('emailtemplatereconciliation')!.size, 3);
    assert.deepEqual(await live.reportInconsistencies('a'), []);
  });
  it('inspects without writes and reconciles a headless failed create after a legacy reset', async () => {
    const initial = await live.reconcileTransition('a', 'notice');
    assert.equal(initial.outcome, 'consistent');
    assert.equal(mongo.stores.get('emailtemplatelifecyclehead')!.size, 0);
    const one = await live.create('a', 'notice', content());
    await live.reset('a', 'notice', { id: one.id, revision: 1 });
    const write = sinon.stub(mongo.collection('emailtemplate'), 'insertOne').rejects(new Error('failed create'));
    await assert.rejects(live.create('a', 'notice', content()), { code: 'PERSISTENCE' });
    write.restore();
    mongo.stores.get('emailtemplatelifecyclehead')!.clear();
    const inspection = await live.reconcileTransition('a', 'notice');
    assert.equal(inspection.committedVersion, 2);
    assert.equal(inspection.pendingVersion, 3);
    assert.equal(mongo.stores.get('emailtemplatelifecyclehead')!.size, 0);
    await live.reconcileTransition('a', 'notice', { action: 'rollback', expectedVersion: 3, writersQuiesced: true, actor });
    assert.equal((await admin.getHistoryVersion('a', 'notice', 2)).live, true);
    assert.equal((await live.create('a', 'notice', content())).revision, 4);
  });
  it('refuses recovery when live matches neither the committed nor intended token', async () => {
    const one = await live.create('a', 'notice', content());
    const write = sinon.stub(mongo.collection('emailtemplate'), 'findOneAndUpdate').rejects(new Error('failed update'));
    await assert.rejects(live.update('a', 'notice', content(), { id: one.id, revision: 1 }), { code: 'PERSISTENCE' });
    write.restore();
    mongo.live.get(JSON.stringify(['a', 'notice'])).revision = 99;
    await assert.rejects(live.reconcileTransition('a', 'notice', { action: 'rollback', expectedVersion: 99, writersQuiesced: true, actor }), { code: 'REVISION_CONFLICT' });
    assert.equal(mongo.stores.get('emailtemplatereconciliation')!.size, 0);
    assert.equal(mongo.live.get(JSON.stringify(['a', 'notice'])).revision, 99);
  });
  it('rolls back a reservation with no history and keeps its version consumed', async () => {
    const write = sinon.stub(mongo.collection('emailtemplatehistory'), 'insertOne').rejects(new Error('failed history'));
    await assert.rejects(live.create('a', 'notice', content()), { code: 'PERSISTENCE' });
    write.restore();
    assert.equal((await admin.getEditorState('a', 'notice')).latestVersion, 1);
    assert.equal((await live.reportInconsistencies('a'))[0].version, 1);
    const options = { expectedVersion: 1, writersQuiesced: true, actor };
    await assert.rejects(live.reconcileTransition('a', 'notice', { ...options, action: 'complete' }), { code: 'INCOMPLETE_TRANSITION' });
    await live.reconcileTransition('a', 'notice', { ...options, action: 'rollback' });
    assert.equal((await live.create('a', 'notice', content())).revision, 2);
  });
  it('recognizes uncertain applied writes, completes head finalization, and retains newer autosaves', async () => {
    const saved = await save();
    const insert = mongo.collection('emailtemplate').insertOne;
    const write = sinon.stub(mongo.collection('emailtemplate'), 'insertOne').callsFake(async (row: any) => {
      await insert(row);
      throw new Error('ambiguous acknowledgement');
    });
    await assert.rejects(admin.publish('a', 'notice', saved.draft.draftRevision, null, actor), { code: 'PERSISTENCE' });
    write.restore();
    const newer = await admin.saveDraft('a', 'notice', content('Newer'), saved.draft.draftRevision, actor);
    const recovered = await live.reconcileTransition('a', 'notice', { action: 'rollback', expectedVersion: 1, writersQuiesced: true, actor });
    assert.equal(recovered.outcome, 'completed');
    assert.equal(recovered.draftRetained, true);
    assert.equal((await admin.getEditorState('a', 'notice')).draft!.draftRevision, newer.draft.draftRevision);
    assert.equal((await live.get('a', 'notice'))!.revision, 1);
    assert.deepEqual(await live.reportInconsistencies('a'), []);
  });
  it('arbitrates opposing console recovery decisions with a unique durable audit', async () => {
    const write = sinon.stub(mongo.collection('emailtemplate'), 'insertOne').rejects(new Error('failed create'));
    await assert.rejects(live.create('a', 'notice', content()), { code: 'PERSISTENCE' });
    write.restore();
    const options = { expectedVersion: 1, writersQuiesced: true, actor };
    const outcomes = await Promise.allSettled([
      live.reconcileTransition('a', 'notice', { ...options, action: 'complete' }),
      live.reconcileTransition('a', 'notice', { ...options, action: 'rollback' }),
    ]);
    assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal((outcomes.find(value => value.status === 'rejected') as PromiseRejectedResult).reason.code, 'REVISION_CONFLICT');
    assert.equal(mongo.stores.get('emailtemplatereconciliation')!.size, 1);
    assert.equal((await live.reconcileTransition('a', 'notice')).outcome, 'consistent');
  });
  it('keeps recovery resumable if audit is durable but head finalization fails', async () => {
    const write = sinon.stub(mongo.collection('emailtemplate'), 'insertOne').rejects(new Error('failed create'));
    await assert.rejects(live.create('a', 'notice', content()), { code: 'PERSISTENCE' });
    write.restore();
    const finish = sinon.stub(live as any, 'finishReservation').rejects(new Error('interrupted recovery'));
    const options = { expectedVersion: 1, writersQuiesced: true, actor };
    await assert.rejects(live.reconcileTransition('a', 'notice', { ...options, action: 'rollback' }));
    finish.restore();
    assert.equal((await live.reconcileTransition('a', 'notice', { ...options, action: 'complete' })).outcome, 'rolled-back');
    assert.equal(await live.get('a', 'notice'), null);
    assert.equal((await live.create('a', 'notice', content())).revision, 2);
  });
  it('detects a changed supplied default and invalid live overrides after policy changes', async () => {
    const draft = await admin.saveDraft('a', 'notice', { ...content(), body: '{{scuEmail.title}}' }, null, actor);
    await admin.publish('a', 'notice', draft.draft.draftRevision, null, actor);
    writeFileSync(join(dir, 'notice.hbs'), 'New default');
    mock.config.emailnotification.settings.additionalContextRoots = [];
    const state = await admin.getEditorState('a', 'notice');
    assert.equal(state.defaultUpdated, true);
    assert.equal(state.invalid, true);
    assert.equal((await admin.catalogue('a')).find(row => row.templateId === 'notice')!.invalid, true);
  });
  it('restores only published history into a draft and records restore-published on later publish', async () => {
    const draft = await save();
    const first = await admin.publish('a', 'notice', draft.draft.draftRevision, null, actor);
    await admin.resetToDefault('a', 'notice', first.state.live!.token, actor);
    await assert.rejects(admin.restoreToDraft('a', 'notice', 2, null, actor), { code: 'INVALID_TEMPLATE' });
    await assert.rejects(admin.getHistoryVersion('a', 'notice', 100), { code: 'UNKNOWN_VERSION' });
    const restored = await admin.restoreToDraft('a', 'notice', 1, null, actor);
    assert.equal((await admin.getEditorState('a', 'notice')).live, null);
    const published = await admin.publish('a', 'notice', restored.draft.draftRevision, null, actor);
    assert.equal(published.state.live!.token.revision, 3);
    assert.equal((await admin.getHistoryVersion('a', 'notice', 3)).event, 'restore-published');
    assert.equal((await admin.getHistoryVersion('a', 'notice', 3)).restoredFromVersion, 1);
  });
  it('runs preview through SCU-style injection and post-render hooks while preserving edited context', async () => {
    class HookEmail extends EmailServices.Email {
      calls = 0;
      override async buildFromTemplateAsync(name: string, data: Record<string, unknown> = {}, response: Record<string, unknown> = {}) {
        this.calls++;
        const result = await super.buildFromTemplateAsync(name, { ...data, scuEmail: { title: 'Injected' } }, response);
        if (result.status === 200 && typeof result.body === 'string') {
          result.body += '<footer>Hook footer</footer><script>PRIVATE</script>';
          if (typeof result.subject === 'string') result.subject += '\r\nFooter';
        }
        return result;
      }
    }
    const hooked = new HookEmail();
    (global as any).EmailService = hooked;
    const template = { subject: '{{scuEmail.title}}', body: '<p>{{scuEmail.title}}</p>', format: 'html' as const };
    const preview = await admin.preview('a', 'notice', template, '{"scuEmail":{"title":"Edited"},"config":{"secret":"PRIVATE"}}');
    assert.equal(hooked.calls, 1);
    assert.equal(Object.hasOwn(hooked.exports(), 'renderEmailAdminPreview'), false);
    assert.equal(preview.subject, 'EditedFooter');
    assert.equal(preview.html, '<p>Edited</p>Hook footer');
    assert.ok(preview.sanitiserRemovals.some(removal => removal.element === 'script'));
    const missing = await admin.preview('a', 'notice', template, '{}');
    assert.equal(missing.diagnostics[0].code, 'RENDER_FAILED');
    // Caller-controlled keys cannot select the internal preview override on the send seam.
    await live.create('a', 'notice', { subject: 'Live', body: 'Live', format: 'text' });
    const sent = await firstValueFrom(hooked.buildFromTemplate('notice', { content: template, preview: template }, { brandId: 'a', content: template } as any));
    assert.ok(String(sent.body).startsWith('Live'));
  });
  it('starts from the current default and clears the restore marker', async () => {
    const row = await save();
    writeFileSync(join(dir, 'notice.hbs'), 'Changed default');
    const reset = await admin.startDraftFromDefault('a', 'notice', row.draft.draftRevision, actor);
    assert.equal(reset.draft.body, 'Changed default');
    assert.equal(reset.draft.restoredFromVersion, null);
  });
  it('rejects stale draft writes/discards and never reuses a discarded revision', async () => {
    const first = await save();
    await admin.discardDraft('a', 'notice', first.draft.draftRevision);
    const second = await save();
    assert.ok(second.draft.draftRevision > first.draft.draftRevision);
    await assert.rejects(admin.saveDraft('a', 'notice', content(), first.draft.draftRevision, actor), (error: any) => {
      assert.equal(error.current.draft.updatedByName, actor.name);
      assert.equal(error.current.draft.draftRevision, second.draft.draftRevision);
      assert.ok(!JSON.stringify(error.current).includes('Record title'));
      return error.code === 'REVISION_CONFLICT';
    });
    await assert.rejects(admin.discardDraft('a', 'notice', first.draft.draftRevision), { code: 'REVISION_CONFLICT' });
  });
  it('keeps the original null baseVersion if another writer publishes while a draft exists', async () => {
    const draft = await save();
    await live.create('a', 'notice', content('Other'));
    const saved = await admin.saveDraft('a', 'notice', content(), draft.draft.draftRevision, actor);
    assert.equal(saved.draft.baseVersion, null);
  });
  it('reports a history-first failure while the next render still reads the previous live override', async () => {
    const first = await live.create('a', 'notice', content('Old'));
    const draft = await save();
    const write = sinon.stub(mongo.collection('emailtemplate'), 'findOneAndUpdate').rejects(new Error('PRIVATE BODY'));
    await assert.rejects(
      admin.publish('a', 'notice', draft.draft.draftRevision, { id: first.id, revision: first.revision }, actor),
      { code: 'PERSISTENCE' }
    );
    write.restore();
    const rendered = await firstValueFrom(
      email.buildFromTemplate('notice', { record: { metadata: { title: 'Title' } } }, { brandId: 'a' })
    );
    assert.equal(rendered.body, 'Old Title');
    assert.deepEqual(await live.reportInconsistencies('a'), [
      { templateId: 'notice', code: 'INCOMPLETE_LIVE_TRANSITION', version: 2 },
    ]);
    await assert.rejects(
      admin.publish('a', 'notice', draft.draft.draftRevision, { id: first.id, revision: first.revision }, actor),
      { code: 'REVISION_CONFLICT' }
    );
    await assert.rejects(admin.restoreToDraft('a', 'notice', 2, draft.draft.draftRevision, actor), {
      code: 'INCOMPLETE_TRANSITION',
    });
  });
  it('reports a published draft if cleanup fails and does not falsely fail publication', async () => {
    const draft = await save();
    sinon.stub(mongo.collection('emailtemplatedraft'), 'deleteOne').rejects(new Error('cleanup failed'));
    const result = await admin.publish('a', 'notice', draft.draft.draftRevision, null, actor);
    assert.equal(result.draftRetained, true);
    assert.equal(result.state.live!.token.revision, 1);
    assert.equal(result.state.consistency[0].code, 'PUBLISHED_DRAFT_RETAINED');
  });
  it('retains a newer autosave that races publication', async () => {
    const draft = await save();
    const insert = mongo.collection('emailtemplatehistory').insertOne;
    sinon.stub(mongo.collection('emailtemplatehistory'), 'insertOne').callsFake(async (row: any) => {
      const result = await insert(row);
      await admin.saveDraft('a', 'notice', content('Newer'), draft.draft.draftRevision, actor);
      return result;
    });
    const published = await admin.publish('a', 'notice', draft.draft.draftRevision, null, actor);
    assert.equal(published.state.live!.subject, 'Draft');
    assert.equal(published.state.draft!.subject, 'Newer');
    assert.equal(published.draftRetained, true);
  });
  it('keeps drafts/history/live rows isolated by the trusted brand argument', async () => {
    const a = await save();
    assert.equal((await admin.getEditorState('b', 'notice')).draft, null);
    assert.equal((await admin.listHistory('b', 'notice')).length, 0);
    await assert.rejects(admin.publish('b', 'notice', a.draft.draftRevision, null, actor), {
      code: 'REVISION_CONFLICT',
    });
    await assert.rejects(admin.catalogue('missing'), { code: 'UNKNOWN_BRAND' });
  });
  it('requires exact record brand plus view access, using one indistinguishable unavailable error', async () => {
    const records = (global as any).RecordsService;
    const user: any = { username: 'reader', roles: [{ id: 'reader-a' }] };
    const failures: string[] = [];
    for (const mode of ['missing', 'foreign', 'denied']) {
      records.getMeta.resetBehavior();
      records.hasViewAccess.returns(mode !== 'denied');
      if (mode === 'missing') records.getMeta.rejects(new Error('no such oid'));
      else
        records.getMeta.resolves({
          metadata: { title: 'Private' },
          metaMetadata: { brandId: mode === 'foreign' ? 'b' : 'a' },
        });
      try {
        await admin.previewContextFromRecord('a', 'oid', user, 'notice');
        assert.fail('must deny');
      } catch (error) {
        failures.push(JSON.stringify({ code: (error as any).code, message: (error as any).message }));
      }
    }
    assert.equal(new Set(failures).size, 1);
    assert.ok(failures[0].includes('FORBIDDEN'));
    assert.equal(records.hasViewAccess.lastCall.args[1], user);
  });
  it('runs the async hook chain before returning curated record display context', async () => {
    class HookEmail extends EmailServices.Email {
      override async buildFromTemplateAsync(name: string, data: any, result: any) {
        return super.buildFromTemplateAsync(name, { ...data, scuEmail: { title: data.record.metadata.title } }, result);
      }
    }
    (global as any).EmailService = new HookEmail();
    const result = await admin.previewContextFromRecord('a', 'oid-a', { roles: [] } as any, 'notice');
    assert.equal((result.context.scuEmail as any).title, 'Record title');
    assert.equal((result.context.record as any).authorization, undefined);
    assert.equal((result.context.record as any).revision, undefined);
    assert.equal((result.context.record as any).metaMetadata.secret, undefined);
    assert.equal((result.context.imports as any).record.storage, undefined);
  });
  it('drops unknown roots and prototype keys recursively without invoking accessors or walking prototypes', () => {
    const filtered = filterEmailPreviewContext(
      JSON.parse(
        '{"sails":{"secret":true},"record":{"metadata":{"title":"Safe","__proto__":{"secret":true},"constructor":{"secret":true}}},"scuEmail":{"name":"Display"}}'
      )
    );
    assert.equal(filtered.sails, undefined);
    assert.equal(Object.getPrototypeOf(filtered), null);
    assert.equal((filtered.record as any).metadata.constructor, undefined);
    assert.equal((filtered.record as any).metadata.secret, undefined);
    const getter = sinon.spy();
    assert.throws(() => filterEmailPreviewContext(Object.defineProperty({}, 'record', { get: getter })), {
      code: 'INVALID_CONTEXT',
    });
    assert.equal(getter.callCount, 0);
    const inherited = Object.create({ record: { metadata: { title: 'Inherited' } } });
    assert.equal(filterEmailPreviewContext(inherited).record, undefined);
  });
  it('previews edited JSON with strict rendering and only the hook values present in JSON', async () => {
    const input = {
      subject: '{{scuEmail.title}}\r\nInjected',
      body: '{{record.metadata.title}}',
      format: 'text' as const,
    };
    const rendered = await admin.preview(
      'a',
      'notice',
      input,
      JSON.stringify({
        record: { metadata: { title: 'Edited' } },
        scuEmail: { title: 'Hook' },
        sails: { secret: true },
      })
    );
    assert.equal(rendered.subject, 'HookInjected');
    assert.equal(rendered.text, 'Edited');
    assert.deepEqual(rendered.diagnostics, []);
    const error = await admin.preview('a', 'notice', input, '{"record":{"metadata":{}}}');
    assert.equal(error.diagnostics[0].code, 'RENDER_FAILED');
    assert.ok(!JSON.stringify(error).includes('scuEmail.title'));
  });
  it('reports a render failure against the field that failed', async () => {
    const context = '{"record":{"metadata":{"title":"Present"}}}';
    const subjectOnly = await admin.preview(
      'a',
      'notice',
      { subject: '{{record.metadata.missing}}', body: 'Valid literal body', format: 'text' },
      context
    );
    assert.deepEqual(
      subjectOnly.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.field]),
      [['RENDER_FAILED', 'subject']]
    );
    const bodyOnly = await admin.preview(
      'a',
      'notice',
      { subject: 'Valid literal subject', body: '{{record.metadata.missing}}', format: 'text' },
      context
    );
    assert.deepEqual(
      bodyOnly.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.field]),
      [['RENDER_FAILED', 'body']]
    );
    assert.ok(!JSON.stringify([subjectOnly, bodyOnly]).includes('metadata.missing'));
  });
  it('applies the real record projection to edited JSON and removes alternate raw imports', async () => {
    const context = JSON.stringify({
      record: { metadata: { title: 'Allowed' }, authorization: { secret: 'PRIVATE' } },
      imports: { record: { authorization: { secret: 'PRIVATE' } } },
    });
    const result = await admin.preview(
      'a',
      'notice',
      { subject: 'Subject', body: '{{json record}} {{json imports}}', format: 'text' },
      context
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(!result.text!.includes('PRIVATE'));
    assert.ok(result.text!.includes('Allowed'));
  });

  it('uses the real send sanitiser profile and returns element/attribute names without values', async () => {
    const source = '<p onclick="PRIVATE()">Hello</p><script>PRIVATE()</script><img src="javascript:PRIVATE()">';
    const input = { subject: 'Safe', body: source, format: 'html' as const };
    const result = await admin.preview('a', 'notice', input, '{}');
    const sendResult = (global as any).DomSanitizerService.sanitizeEmail(source);
    assert.equal(result.html, sendResult.sanitized);
    assert.ok(result.sanitiserRemovals.some(row => row.attribute === 'onclick'));
    assert.ok(result.sanitiserRemovals.some(row => row.element === 'script'));
    assert.ok(!JSON.stringify(result.sanitiserRemovals).includes('PRIVATE'));
  });
  it('handles invalid JSON and source/output/context byte limits with typed errors', async () => {
    await assert.rejects(admin.preview('a', 'notice', content(), '{PRIVATE'), { code: 'INVALID_CONTEXT' });
    await assert.rejects(admin.preview('a', 'notice', content(), '[]'), { code: 'INVALID_CONTEXT' });
    mock.config.emailnotification.settings.maxPreviewContextBytes = 5;
    await assert.rejects(admin.preview('a', 'notice', content(), '{"record":{}}'), { code: 'LENGTH_LIMIT' });
    mock.config.emailnotification.settings.maxBodyBytes = 3;
    assert.throws(() => admin.validate(content()), { code: 'LENGTH_LIMIT' });
    await assert.rejects(admin.saveDraft('a', 'notice', content(), null, actor), { code: 'LENGTH_LIMIT' });
  });
  it('rechecks search candidates against actual record brand/access and discloses no unauthorized metadata', async () => {
    mock.services.search = {
      searchFuzzy: sinon
        .stub()
        .resolves({
          records: [{ storage_id: 'allowed' }, { storage_id: 'foreign' }, { storage_id: 'denied' }],
          totalItems: 999,
        }),
    };
    const records = (global as any).RecordsService;
    records.getMeta.callsFake(async (oid: string) => ({
      metadata: { title: oid === 'allowed' ? 'Allowed' : 'PRIVATE' },
      metaMetadata: { brandId: oid === 'foreign' ? 'b' : 'a' },
      oid,
    }));
    records.hasViewAccess.callsFake((_brand: any, _user: any, _roles: any, record: any) => record.oid !== 'denied');
    const result = await admin.searchPreviewRecords('a', { roles: [] } as any, 'title:foo OR *:*');
    assert.deepEqual(result.records, [{ oid: 'allowed', title: 'Allowed' }]);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    assert.equal(mock.services.search.searchFuzzy.firstCall.args[6].id, 'a');
    assert.ok(mock.services.search.searchFuzzy.firstCall.args[3].includes('\\:'));
  });
  it('validates history retention and context size settings at startup', async () => {
    for (const key of ['historyMaxVersions', 'maxPreviewContextBytes']) {
      mock.config.emailnotification.settings[key] = 0;
      await assert.rejects(live.bootstrap(), { code: 'INVALID_TEMPLATE' });
      delete mock.config.emailnotification.settings[key];
    }
  });
});
