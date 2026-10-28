import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sinon from 'sinon';
import * as nodemailer from 'nodemailer';
import { firstValueFrom, of } from 'rxjs';
import { handlebarsInstance } from '@researchdatabox/sails-ng-common';
import { emailContextSchema, integrationEmailContextSchema } from '../../src/utilities/EmailContextSchema';
import { emailTemplateContextKind, integrationEmailTemplateIds } from '../../src/utilities/EmailTemplateContextKind';
import { lintEmailTemplateSchema } from '../../src/utilities/EmailTemplateSchemaLint';
import { EmailChannel } from '../../src/services/IntegrationNotificationService';
import { generateSampleContext } from '../../../../angular/projects/researchdatabox/email-templates/src/app/context-sample';
import { validateContextJson } from '../../../../angular/projects/researchdatabox/email-templates/src/app/context-validation';
import { compileEmailTemplatePreview } from '../../src/utilities/EmailTemplatePreview';
import { diagnosticExpressionAt } from '../../../../angular/projects/researchdatabox/email-templates/src/app/diagnostic-expression';
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
      'AppConfigService',
    ])
      delete (global as any)[key];
    rmSync(dir, { recursive: true, force: true });
  });
  it('UR-U05 returns optional purpose descriptions separately from supplied subjects', async () => {
    mock.config.emailnotification.templates.notice.description = 'Sent when a record needs review.';
    const catalogue = await admin.catalogue('a');
    const entry = catalogue.find(item => item.templateId === 'notice')!;
    assert.equal(entry.description, 'Sent when a record needs review.');
    assert.equal(entry.subject, 'Default');
    assert.equal((await admin.getEditorState('a', 'notice')).description, entry.description);
    const fileOnly = catalogue.find(item => item.templateId === 'file-only')!;
    assert.equal(fileOnly.description, undefined);
    assert.equal(fileOnly.subject, 'Default');
    delete mock.config.emailnotification.templates.notice.description;
    assert.equal((await admin.getEditorState('a', 'notice')).description, undefined);
  });

  it('UR-U05 validates descriptions at startup without requiring them or treating them as templates', async () => {
    for (const description of [null, 42, {}, []]) {
      mock.config.emailnotification.templates.notice.description = description;
      await assert.rejects(live.bootstrap(), { code: 'INVALID_TEMPLATE' });
    }
    for (const description of [undefined, '', 'When <plain> text includes {{literal}}']) {
      mock.config.emailnotification.templates.notice.description = description;
      await live.bootstrap();
    }
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
      severity: 'error',
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
  it('shares private preview requests with a hook that loads another core module instance', async () => {
    const modulePath = require.resolve('../../src/services/EmailService');
    const templateModulePath = require.resolve('../../src/services/EmailTemplateService');
    const original = require.cache[modulePath];
    const originalTemplates = require.cache[templateModulePath];
    let HookBase: typeof EmailServices.Email;
    try {
      delete require.cache[modulePath];
      delete require.cache[templateModulePath];
      HookBase = require(modulePath).Services.Email;
      assert.notEqual(require(templateModulePath).EmailTemplateError, EmailTemplateError);
    } finally {
      require.cache[modulePath] = original;
      require.cache[templateModulePath] = originalTemplates;
    }
    assert.notEqual(HookBase, EmailServices.Email);
    class HookEmail extends HookBase {
      override async buildFromTemplateAsync(name: string, data: Record<string, unknown> = {}, response: Record<string, unknown> = {}) {
        const result = await super.buildFromTemplateAsync(name, { ...data, scuEmail: { title: 'Injected' } }, response);
        if (result.status === 200 && typeof result.body === 'string') result.body += '<p>Hook footer</p>';
        return result;
      }
    }
    const hooked = new HookEmail();
    (global as any).EmailService = hooked.exports();
    const template = { subject: '{{scuEmail.title}}', body: '<p>{{scuEmail.title}}</p>', format: 'html' as const };
    const preview = await admin.preview('a', 'notice', template, '{"scuEmail":{"title":"Edited"}}');
    assert.equal(preview.subject, 'Edited');
    assert.equal(preview.html, '<p>Edited</p><p>Hook footer</p>');
    assert.deepEqual(preview.diagnostics, []);
    await assert.rejects(admin.preview('a', 'notice', template,
      JSON.stringify({ scuEmail: { title: 'x'.repeat(999) } })), { code: 'LENGTH_LIMIT' });
    const missing = await admin.preview('a', 'notice', template, '{}');
    assert.equal(missing.diagnostics[0].code, 'RENDER_FAILED');
    assert.equal(missing.diagnostics[0].field, 'body');
    // The response registration is removed even though the hook uses another module.
    const sent = await firstValueFrom(hooked.buildFromTemplate('notice', { record: { metadata: { title: 'Send' } } }, { brandId: 'a' }));
    assert.equal(sent.subject, 'Default');
    assert.equal(sent.body, 'Default Send<p>Hook footer</p>');
    assert.equal(Object.hasOwn(hooked.exports(), 'renderEmailAdminPreview'), false);
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
    // The legacy alias is rebuilt on every preview, so it is not offered for editing.
    assert.equal(result.context.imports, undefined);
  });
  it('includes record URLs and title in context and respects their edited values in preview', async () => {
    mock.config.auth = { defaultPortal: 'rdmp' };
    mock.config.http = { rootContext: '/root/' };
    const oid = 'oid /?#ü';
    const { context } = await admin.previewContextFromRecord('a', oid, { roles: [] } as any, 'notice');
    const record = context.record as Record<string, unknown>;
    const viewUrl = 'https://portal.example/root/a/rdmp/record/view/oid%20%2F%3F%23%C3%BC';
    const editUrl = 'https://portal.example/root/a/rdmp/record/edit/oid%20%2F%3F%23%C3%BC';
    assert.equal(context.title, 'Record title');
    assert.equal(record.viewUrl, viewUrl);
    assert.equal(record.editUrl, editUrl);
    assert.equal(record.redboxOid, oid);
    assert.equal(Object.hasOwn(context, 'recordUrl'), false);
    const template = { subject: '{{title}}', body: '{{title}}|{{record.viewUrl}}|{{record.editUrl}}|{{imports.record.viewUrl}}|{{record.redboxOid}}|{{imports.record.redboxOid}}', format: 'text' as const };
    const generated = await admin.preview('a', 'notice', template, JSON.stringify(context));
    assert.deepEqual(generated.diagnostics, []);
    assert.equal(generated.subject, 'Record title');
    assert.equal(generated.text, `Record title|${viewUrl}|${editUrl}|${viewUrl}|${oid}|${oid}`);
    for (const values of [
      { title: 'Edited title', viewUrl: 'https://edited.example/view', editUrl: 'https://edited.example/edit' },
      { title: '', viewUrl: '', editUrl: '' },
    ]) {
      const editedContext = { ...context, title: values.title, record: { ...record, viewUrl: values.viewUrl, editUrl: values.editUrl } };
      const edited = await admin.preview('a', 'notice', template, JSON.stringify(editedContext));
      assert.deepEqual(edited.diagnostics, []);
      assert.equal(edited.subject, values.title);
      assert.equal(edited.text, `${values.title}|${values.viewUrl}|${values.editUrl}|${values.viewUrl}|${oid}|${oid}`);
    }
    delete context.title;
    delete record.viewUrl;
    delete record.editUrl;
    const regenerated = await admin.preview('a', 'notice', template, JSON.stringify(context));
    assert.deepEqual(regenerated.diagnostics, []);
    assert.equal(regenerated.text, generated.text);
  });
  it('omits unavailable record URLs in preview and strictly fails the old recordUrl root', async () => {
    mock.config.auth = { defaultPortal: 'rdmp' };
    const { context } = await admin.previewContextFromRecord('a', 'oid-a', { roles: [] } as any, 'notice');
    const template = { subject: '{{title}}', body: '{{recordUrl}}', format: 'text' as const };
    const failed = await admin.preview('a', 'notice', template, JSON.stringify(context));
    assert.deepEqual(failed.diagnostics.map(diagnostic => diagnostic.code), ['RENDER_FAILED']);
    const absent = { ...context, oid: '', record: { metadata: { title: 'Record title' } } };
    const omitted = await admin.preview('a', 'notice', {
      ...template, body: '{{#if record.viewUrl}}View{{/if}}{{#if record.editUrl}}Edit{{/if}}',
    }, JSON.stringify(absent));
    assert.deepEqual(omitted.diagnostics, []);
    assert.equal(omitted.text, '');
    delete mock.config.appUrl;
    const unavailable = await admin.previewContextFromRecord('a', 'oid-a', { roles: [] } as any, 'notice');
    assert.equal(Object.hasOwn(unavailable.context.record as object, 'viewUrl'), false);
    assert.equal(Object.hasOwn(unavailable.context.record as object, 'editUrl'), false);
  });
  function integrationSetup() {
    mock.config.auth = { defaultPortal: 'rdmp' };
    mock.config.http = { rootContext: '/root/' };
    for (const id of ['integrationFailure', 'integrationRecovery']) {
      writeFileSync(join(dir, id + '.hbs'), readFileSync(join(__dirname, '../../../../views/emailTemplates', id + '.hbs')));
      mock.config.emailnotification.templates[id] = { subject: '{{title}}', template: id, format: 'html' };
    }
  }
  it('classifies only core defaults and this brand-scoped configured email channel templates, even when disabled', async () => {
    integrationSetup();
    const config = sinon.stub().callsFake(async (brandId: string, key: string) => {
      assert.equal(key, 'integrationNotification');
      return brandId === 'a' ? {
        enabled: false,
        channels: [{ type: 'email', enabled: false, template: 'notice' }, { type: 'slack', template: 'file-only' }],
        perIntegration: { DATACITE: { channels: [{ type: 'email', template: 'file-only' }] } },
      } : { channels: [{ type: 'email', template: 'brand-b-only' }] };
    });
    (global as any).AppConfigService = { getAppConfigByBrandAndKey: config };
    assert.equal(await emailTemplateContextKind('a', 'notice'), 'integration');
    assert.equal(await emailTemplateContextKind('b', 'notice'), 'record');
    assert.equal(await emailTemplateContextKind('a', 'brand-b-only'), 'record');
    const catalogue = await admin.catalogue('a');
    assert.ok(catalogue.every(entry => entry.contextKind === 'integration'));
    assert.equal((await admin.getEditorState('a', 'notice')).contextKind, 'integration');
    assert.equal((await admin.getEditorState('b', 'notice')).contextKind, 'record');
    config.resolves({ channels: [{ type: 'webhook', template: 'notice' }], perIntegration: { DOI: {} } });
    assert.equal(await emailTemplateContextKind('a', 'notice'), 'record');
    config.rejects(new Error('PRIVATE CONFIG'));
    assert.deepEqual([...await integrationEmailTemplateIds('a')], ['integrationFailure', 'integrationRecovery']);
  });
  it('uses global integration defaults only when the app-config resolver is absent', async () => {
    mock.config.brandingConfigurationDefaults = { integrationNotification: { channels: [{ type: 'email', template: 'notice' }] } };
    assert.equal(await emailTemplateContextKind('a', 'notice'), 'integration');
    (global as any).AppConfigService = { getAppConfigByBrandAndKey: sinon.stub().resolves({}) };
    assert.equal(await emailTemplateContextKind('a', 'notice'), 'record');
  });
  for (const id of ['integrationFailure', 'integrationRecovery']) {
    it(`describes and samples ${id} without record selectors, internals or lint warnings`, async () => {
      integrationSetup();
      const response = await emailContextSchema({ id: 'a', name: 'a' } as any, 'rdmp', {} as any, undefined, undefined, id);
      assert.equal(response.contextKind, 'integration');
      assert.equal(response.precision, 'integration');
      assert.equal(response.recordType, '');
      assert.equal(response.stage, '');
      const properties = response.schema.properties!;
      assert.equal(properties.record, undefined);
      assert.equal(properties.imports, undefined);
      assert.deepEqual(properties.kind.enum, ['failure', 'recovery']);
      assert.deepEqual(properties.severity.enum, ['info', 'warning', 'error']);
      assert.equal(properties.httpStatusCode.type, 'number');
      assert.equal(properties.startedAt.format, 'date-time');
      assert.ok(response.schema.required!.includes('redboxOid'));
      assert.ok(!response.schema.required!.includes('recordUrl'));
      const payload = generateSampleContext(response.schema) as any;
      assert.deepEqual(validateContextJson(payload, response.schema), []);
      assert.equal(payload.kind, id === 'integrationRecovery' ? 'recovery' : 'failure');
      assert.equal(payload.recordUrl, 'https://portal.example/root/a/rdmp/record/view/sample-record-oid');
      assert.equal(payload.brandId, 'a');
      assert.ok(Number.isFinite(Date.parse(payload.timestamp)));
      const state = await admin.getEditorState('a', id);
      assert.ok(state.help.contextRoots.includes('summary'));
      assert.ok(!state.help.contextRoots.includes('record'));
      assert.deepEqual(lintEmailTemplateSchema(state.suppliedDefault, response.schema, true, response.precision), []);
      const preview = await admin.preview('a', id, state.suppliedDefault, JSON.stringify(payload));
      const sent = await firstValueFrom(email.buildFromTemplate(id, payload, { brandId: 'a', defaultSubject: payload.title }));
      assert.equal(preview.subject, sent.subject);
      assert.equal(preview.html, DomSanitizerService.sanitizeEmail(sent.body as string, true).sanitized);
      assert.deepEqual(preview.diagnostics, []);
    });
  }
  it('previews configured integration templates through the send builder with subject fallback and hook parity', async () => {
    integrationSetup();
    (global as any).AppConfigService = { getAppConfigByBrandAndKey: sinon.stub().resolves({ channels: [{ type: 'email', template: 'notice' }] }) };
    writeFileSync(join(dir, 'notice.hbs'), '{{summary}}|{{redboxOid}}|{{portal.brandUrl}}|{{#if record}}wrong{{/if}}{{#if imports}}wrong{{/if}}');
    const schema = integrationEmailContextSchema('notice', 'a', { brandUrl: 'https://portal.example/root/a/rdmp' });
    const payload = generateSampleContext(schema) as any;
    class HookEmail extends EmailServices.Email {
      override async buildFromTemplateAsync(name: string, data: any, response: any) {
        data.summary = 'hook injection';
        const result = await super.buildFromTemplateAsync(name, data, response);
        if (result.status === 200 && result.body) result.body += '|hook suffix';
        return result;
      }
    }
    email = new HookEmail();
    (global as any).EmailService = email;
    const content = (await admin.getEditorState('a', 'notice')).suppliedDefault;
    const build = sinon.spy(email, 'buildFromTemplate');
    const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
    assert.equal(await new EmailChannel().send(payload, { recipients: ['admin@example.org'], channelConfig: { template: 'notice' } }), true);
    const preview = await admin.preview('a', 'notice', content, JSON.stringify({ ...payload, record: { secret: 'PRIVATE' }, imports: { record: {} }, portal: { brandUrl: 'untrusted' } }), 'default');
    assert.equal(build.callCount, 2);
    assert.deepEqual(build.lastCall.args[2], { brandId: 'a', defaultSubject: payload.title });
    assert.equal(preview.subject, payload.title);
    // Submitted payload edits win over pre-render hook injection, as with record preview.
    assert.equal(preview.text, `${payload.summary}|${payload.redboxOid}|https://portal.example/root/a/rdmp||hook suffix`);
    assert.equal(send.firstCall.args[2], preview.subject);
    const edited = { ...content, subject: 'Edited {{title}}' };
    const draftPreview = await admin.preview('a', 'notice', edited, JSON.stringify(payload));
    assert.equal(draftPreview.subject, `Edited ${payload.title}`);
    await live.create('a', 'notice', edited);
    const real = await firstValueFrom(email.buildFromTemplate('notice', payload, { brandId: 'a', defaultSubject: payload.title }));
    assert.equal(draftPreview.subject, real.subject);
    // Identical source text is still an override when published, and can be explicitly previewed as default.
    await live.update('a', 'notice', content, (await admin.getEditorState('a', 'notice')).live!.token);
    const identicalOverride = await admin.preview('a', 'notice', content, JSON.stringify(payload), 'override');
    assert.equal(identicalOverride.subject, content.subject);
    const inferredOverride = await admin.preview('a', 'notice', content, JSON.stringify(payload));
    assert.equal(inferredOverride.subject, content.subject);
    const explicitDefault = await admin.preview('a', 'notice', content, JSON.stringify(payload), 'default');
    assert.equal(explicitDefault.subject, payload.title);
    const foreign = await emailContextSchema({ id: 'b', name: 'b' } as any, 'rdmp', {} as any, undefined, undefined, 'integrationFailure');
    assert.equal(generateSampleContext(foreign.schema).brandId, 'b');
    assert.equal((RecordsService.getMeta as sinon.SinonStub).callCount, 0);
  });
  it('lints integration typos and unguarded optional fields against the payload contract', () => {
    const schema = integrationEmailContextSchema('integrationFailure', 'a');
    const diagnostics = lintEmailTemplateSchema({ subject: '{{title}}', body: '{{summray}} {{recordUrl}}', format: 'text' }, schema, true, 'integration');
    assert.deepEqual(diagnostics.map(item => item.code), ['UNKNOWN_FIELD', 'OPTIONAL_UNGUARDED']);
    assert.equal(diagnostics[0].suggestion, 'summary');
    assert.deepEqual(lintEmailTemplateSchema({ subject: '{{title}}', body: '{{#if recordUrl}}{{recordUrl}}{{/if}} {{#if (isDefined durationMs)}}{{durationMs}}{{/if}}', format: 'text' }, schema, true, 'integration'), []);
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
  it('rebuilds the legacy imports alias from record and ignores submitted imports', async () => {
    const result = await admin.preview(
      'a',
      'notice',
      { subject: 'S', body: '{{imports.record.metadata.title}}|{{record.metadata.title}}', format: 'text' },
      JSON.stringify({
        record: { metadata: { title: 'From record' } },
        imports: { record: { metadata: { title: 'Ignored', extra: 'PRIVATE' } } },
      })
    );
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.text, 'From record|From record');
  });
  it('reports where in the template a render failure happened', async () => {
    const located = await admin.preview(
      'a',
      'notice',
      { subject: 'Valid literal subject', body: '<p>\n  {{record.metadata.missing}}</p>', format: 'html' },
      '{"record":{"metadata":{"title":"Present"}}}'
    );
    assert.deepEqual(
      located.diagnostics.map(diagnostic => [diagnostic.field, diagnostic.line, diagnostic.column]),
      [['body', 2, 5]]
    );
    assert.ok(!JSON.stringify(located).includes('metadata.missing'));
  });
  it('maps original strict-render coordinates back through Unicode normalization in either field', async () => {
    for (const source of [
      'ﬁ {{record.metadata.missing}}',
      'ﬁ ﬃ ﬄ\nﬃ ﬁ\nﬁ ﬄ {{record.metadata.missing}}',
      'e\u0301 {{record.metadata.missing}}',
    ]) {
      const lines = source.split('\n');
      const line = lines.length;
      const column = lines.at(-1)!.indexOf('record.metadata.missing') + 1;
      // Exercise the actual isolated compiler: its error points into NFKC input.
      assert.throws(() => compileEmailTemplatePreview(source)({ record: { metadata: {} } }), (error: any) => {
        assert.equal(error.lineNumber, line);
        assert.equal(error.column, lines.at(-1)!.normalize('NFKC').indexOf('record.metadata.missing'));
        return true;
      });
      for (const field of ['subject', 'body'] as const) {
        const result = await admin.preview('a', 'notice', {
          subject: 'Subject', body: 'Body', format: 'text', [field]: source,
        }, '{"record":{"metadata":{}}}');
        assert.deepEqual(result.diagnostics, [
          { code: 'RENDER_FAILED', severity: 'error', reason: 'RENDER_FAILED', field, line, column },
        ]);
        assert.equal(diagnosticExpressionAt(source, line, column), 'record.metadata.missing');
        assert.ok(!JSON.stringify(result).includes('record.metadata.missing'));
      }
    }
  });
  it('retains the user-reported 2:16 strict position without disclosing template or context text', async () => {
    for (const field of ['subject', 'body'] as const) {
      const result = await admin.preview('a', 'notice', {
        subject: 'Subject', body: 'Body', format: 'text',
        [field]: 'First line\n             {{record.metadata.PRIVATE_MISSING}}',
      }, '{"record":{"metadata":{"title":"PRIVATE_VALUE"}}}');
      assert.deepEqual(result.diagnostics, [
        { code: 'RENDER_FAILED', severity: 'error', reason: 'RENDER_FAILED', field, line: 2, column: 16 },
      ]);
      assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    }
  });
  it('falls back to 1:1 without re-rendering when the original failure has no coordinates', async () => {
    // Printing a null-prototype object has no safe lookup position.
    const result = await admin.preview('a', 'notice', {
      subject: 'Subject', body: 'First line\n  {{record.metadata}}', format: 'text',
    }, '{"record":{"metadata":{}}}');
    assert.deepEqual(result.diagnostics.map(d => [d.code, d.line, d.column]), [['RENDER_FAILED', 1, 1]]);
    assert.equal(result.text, undefined);
    assert.equal(result.html, undefined);
  });
  it('does no diagnostic logging or discarded work for the review log and 20-level each proofs', async () => {
    const h = handlebarsInstance();
    const log = sinon.spy(h, 'log');
    const logger = sinon.spy(h.logger, 'log');
    const each = sinon.spy(h.helpers, 'each');
    const stdout = sinon.stub(process.stdout, 'write').returns(true);
    try {
      for (const branch of [
        '{{log "DIAGNOSTIC_STDOUT_MARKER" record.metadata.title}}',
        '{{#each @root.record.metadata.pair}}'.repeat(20) + 'x' + '{{/each}}'.repeat(20),
      ]) {
        const result = await admin.preview('a', 'notice', {
          subject: 'Subject', format: 'text',
          body: '{{#if (get record.metadata "constructor" false)}}' + branch + '{{/if}}\n{{record.metadata}}',
        }, '{"record":{"metadata":{"pair":[0,1],"title":"NON_SECRET_CONTEXT_MARKER"}}}');
        assert.deepEqual(result.diagnostics.map(d => [d.code, d.line, d.column]), [['RENDER_FAILED', 1, 1]]);
        assert.equal(result.text, undefined);
        assert.equal(result.html, undefined);
        assert.ok(!JSON.stringify(result).includes('MARKER'));
      }
      sinon.assert.notCalled(log);
      sinon.assert.notCalled(logger);
      sinon.assert.notCalled(stdout);
      sinon.assert.notCalled(each); // No 2^20 diagnostic-only iterations/output.
      for (const method of ['log', 'warn', 'error', 'info', 'debug']) {
        assert.ok(!JSON.stringify(mock.log[method]?.args ?? []).includes('MARKER'));
      }
    } finally { stdout.restore(); }
  });
  it('runs helpers only once when recovering strict coordinates in the original render', async () => {
    const isEmpty = sinon.spy(handlebarsInstance().helpers, 'isEmpty');
    const result = await admin.preview('a', 'notice', {
      subject: 'Subject', body: '{{isEmpty record.metadata}}\n  {{record.metadata.missing}}', format: 'text',
    }, '{"record":{"metadata":{}}}');
    assert.deepEqual(result.diagnostics.map(d => [d.line, d.column]), [[2, 5]]);
    sinon.assert.calledOnce(isEmpty);
  });
  for (const path of ['constructor.constructor.name', '__proto__.constructor.name', '__defineGetter__.name']) {
    it(`isolates get and pluck prototype paths in preview: ${path}`, async () => {
      const result = await admin.preview('a', 'notice', {
        subject: `{{get record.metadata '${path}' 'BLOCKED'}}`,
        body: `{{get record.metadata.nested '${path}' 'BLOCKED'}}|` +
          `{{join (pluck record.metadata.items '${path}') ','}}|` +
          `{{join (pluck record.metadata.items 'nested.${path}') ','}}|` +
          `{{get record.metadata 'items[0].${path}' 'BLOCKED'}}`,
        format: 'text',
      }, '{"record":{"metadata":{"nested":{},"items":[{"nested":{}}]}}}');
      assert.deepEqual(result.diagnostics, []);
      assert.equal(result.subject, 'BLOCKED');
      assert.equal(result.text, 'BLOCKED|||BLOCKED');
    });
  }
  it('also isolates bundled lookup while retaining own-property helper paths', async () => {
    const result = await admin.preview('a', 'notice', {
      subject: 'Subject', format: 'text',
      body: "{{lookup record.metadata 'constructor'}}|{{lookup record.metadata '__proto__'}}|" +
        "{{lookup record.metadata '__defineGetter__'}}|{{lookup (lookup record.metadata 'constructor') 'name'}}|" +
        "{{get record.metadata 'items[0].title'}}|{{join (pluck record.metadata.items 'title') ','}}",
    }, '{"record":{"metadata":{"items":[{"title":"Own"}]}}}');
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.text, '||||Own|Own');
  });
  it('blocks all four review probes plus pluck through arrays, primitives and intermediate/helper results', async () => {
    const probes = [
      "{{get record.metadata.items 'constructor.constructor.name' 'BLOCKED'}}",
      '{{get (split "a,b" "," null) "constructor.constructor.name" "BLOCKED"}}',
      "{{get (isEmpty record.metadata) 'constructor.constructor.name' 'BLOCKED'}}",
      "{{get (get record.metadata 'missing') 'constructor.constructor.name' 'BLOCKED'}}",
      "{{join (pluck record.metadata.arrays 'constructor.constructor.name') ','}}",
      "{{join (pluck record.metadata.strings 'constructor.constructor.name') ','}}",
      "{{get record.metadata 'strings[0].constructor.constructor.name' 'BLOCKED'}}",
      '{{get (get (split "a,b" "," null) "0") "constructor.constructor.name" "BLOCKED"}}',
    ];
    const result = await admin.preview('a', 'notice', {
      subject: probes[0], body: probes.join('|'), format: 'text',
    }, '{"record":{"metadata":{"items":[{}],"arrays":[[]],"strings":["VALUE"]}}}');
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.subject, 'BLOCKED');
    assert.equal(result.text, 'BLOCKED|BLOCKED|BLOCKED|BLOCKED|||BLOCKED|BLOCKED');
  });
  it('accepts numeric get/pluck paths in preview, matching the send render', async () => {
    const result = await admin.preview('a', 'notice', {
      subject: 'Subject', format: 'text',
      body: "Hello {{get record.metadata.names 0 'UNKNOWN'}}|{{join (pluck record.metadata.rows 1) ','}}",
    }, '{"record":{"metadata":{"names":["Alice","Bob"],"rows":[["a","b"],["c","d"]]}}}');
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.text, 'Hello Alice|b,d');
  });
  it('preserves own paths, array/string indexes and explicit defaults without exposing runtime options', async () => {
    const result = await admin.preview('a', 'notice', { subject: 'Subject', format: 'text',
      body: '{{get record.metadata "missing"}}|{{get record.metadata "missing" false}}|' +
        '{{get record.metadata "missing" 0}}|{{get record.metadata "items[0].title"}}|' +
        '{{get record.metadata "a.b"}}|{{get (split "a,b" "," null) "1"}}|' +
        '{{get (get record.metadata "items[0].title") "length"}}',
    }, '{"record":{"metadata":{"items":[{"title":"Own"}],"a.b":"Literal"}}}');
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.text, '|false|0|Own|Literal|b|3');
  });
  it('runs the complete 43-helper review probe in the actual preview environment', async () => {
    const h = handlebarsInstance();
    const outputs = {
      formatDate: '(formatDate "2026-01-01" "yyyy")', formatDateLocale: '(formatDateLocale "2026-01-01")',
      parseDateString: '(parseDateString record.metadata)', get: '(get record.metadata "nested" "BLOCKED")',
      isEmpty: '(isEmpty record.metadata)', isUndefined: '(isUndefined record.metadata)', isNull: '(isNull record.metadata)',
      isDefined: '(isDefined record.metadata)', isArray: '(isArray record.metadata)', isObject: '(isObject record.metadata)',
      eq: '(eq 1 1)', ne: '(ne 1 2)', and: '(and 1 1)', or: '(or 0 1)', not: '(not false)',
      gt: '(gt 2 1)', gte: '(gte 1 1)', lt: '(lt 1 2)', lte: '(lte 1 1)', trim: '(trim " x ")',
      toLower: '(toLower "X")', toUpper: '(toUpper "x")', t: '(t "label")',
      join: '(join record.metadata.strings ",")', pluck: '(pluck record.metadata.items "nested")',
      substring: '(substring "hello" 0 2)', split: '(split "a,b" "," null)', urlEncode: '(urlEncode "x")',
      concat: '(concat "a" "b")', default: '(default null record.metadata)', markdownToHtml: '(markdownToHtml "x" "html")',
      plaintextToHtml: '(plaintextToHtml "x")', json: '(json record.metadata)', renderMetadataValue: '(renderMetadataValue record.metadata.nested)',
      attachmentDownloadUrl: '(attachmentDownloadUrl record.metadata.nested "oid" "default" "rdmp")',
      lookup: '(lookup record.metadata "nested")', if: '(if true)', unless: '(unless false)',
      each: '(each record.metadata.items)', with: '(with record.metadata)', log: '(log "HELPER_PROBE")',
      helperMissing: '(helperMissing)', blockHelperMissing: '(blockHelperMissing true)',
    };
    assert.equal(Object.keys(outputs).length, 43);
    assert.deepEqual(Object.keys(outputs).sort(), Object.keys(h.helpers).sort());
    sinon.stub(h, 'log'); // This probe explicitly invokes log during the real render.
    for (const [name, expression] of Object.entries(outputs)) {
      const result = await admin.preview('a', 'notice', {
        subject: 'Subject', body: `{{get ${expression} 'constructor.constructor.name' 'BLOCKED'}}`, format: 'text',
      }, '{"record":{"metadata":{"nested":{},"items":[{"nested":{}}],"strings":["VALUE"]}}}');
      assert.ok(!JSON.stringify(result).includes('Function'), name);
      if (!result.diagnostics.length) assert.equal(result.text, 'BLOCKED', name);
      else assert.equal(result.diagnostics[0].code, 'RENDER_FAILED', name);
    }
  });
  it('leaves real-send get/pluck traversal unchanged for the deferred helper allowlist', async () => {
    const h = handlebarsInstance();
    const { get, pluck } = h.helpers;
    const body = "{{get record.metadata.items 'constructor.constructor.name' 'BLOCKED'}}|" +
      "{{join (pluck record.metadata.strings 'constructor.constructor.name') ','}}";
    const data = { record: { metadata: { items: [], strings: ['VALUE'] } } };
    assert.equal(email.runTemplate(body, data), 'Function|Function');
    const preview = await admin.preview('a', 'notice', { subject: 'S', body, format: 'text' }, JSON.stringify(data));
    assert.equal(preview.text, 'BLOCKED|');
    assert.equal(email.runTemplate(body, data), 'Function|Function');
    assert.equal(h.helpers.get, get);
    assert.equal(h.helpers.pluck, pluck);
  });
  it('returns blocking complexity diagnostics through validate, preview and draft save', async () => {
    const input = { subject: 'Subject', body: '{{#if oid}}'.repeat(4000) + '{{oid}}' + '{{/if}}'.repeat(4000), format: 'text' as const };
    const expected = [{ code: 'TOO_COMPLEX', severity: 'error', field: 'body', reason: 'TOO_COMPLEX', line: 1, column: 1 }];
    assert.deepEqual(admin.validate(input), expected);
    assert.deepEqual((await admin.preview('a', 'notice', input, '{}')).diagnostics, expected);
    const saved = await admin.saveDraft('a', 'notice', input, null, actor);
    assert.deepEqual(saved.diagnostics, expected);
    await assert.rejects(admin.publish('a', 'notice', saved.draft.draftRevision, null, actor), { code: 'TOO_COMPLEX' });
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
