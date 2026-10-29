import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import * as nodemailer from 'nodemailer';
import supertest from 'supertest';
import { Services as TemplateServices } from '@researchdatabox/redbox-core/dist/services/EmailTemplateService';
import { Services as AdminServices } from '@researchdatabox/redbox-core/dist/services/EmailTemplateAdminService';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';

// Real Waterline + Mongo coverage: run through the standard lifted Mocha suite.
describe('EmailTemplateService persistence', function () {
  this.timeout(30000);
  let brands: any[];
  let directory: string;
  let previousSettings: any;
  let previousTemplates: any;
  const templateId = 'stage1PersistenceNotice';
  const content = (label: string) => ({ subject: `${label} {{name}}`, body: `${label} body {{name}}`, format: 'html' });
  const version = (row: any) => ({ id: row.id, revision: row.revision });
  const render = (brandId?: string) =>
    firstValueFrom(EmailService.buildFromTemplate(templateId, { name: 'Reader' }, { brandId })) as Promise<any>;

  before(async function () {
    directory = mkdtempSync(join(tmpdir(), 'persisted-email-'));
    writeFileSync(join(directory, 'supplied.hbs'), 'Supplied body {{name}}');
    previousSettings = sails.config.emailnotification.settings;
    previousTemplates = sails.config.emailnotification.templates;
    sails.config.emailnotification.settings = { ...previousSettings, templateDir: directory };
    sails.config.emailnotification.templates = {
      ...previousTemplates,
      [templateId]: { subject: 'Supplied {{name}}', template: 'supplied', format: 'text' },
    };
    brands = await Promise.all(
      ['a', 'b'].map(suffix => BrandingConfig.create({ name: `email-persistence-${Date.now()}-${suffix}` }).fetch())
    );
  });

  afterEach(async function () {
    sinon.restore();
    if (brands) {
      const criteria = { brandId: { in: brands.map(brand => brand.id) } };
      await EmailTemplate.destroy(criteria);
      await EmailTemplateDraft.destroy(criteria);
      await EmailTemplateHistory.destroy(criteria);
      for (const name of ['emailtemplatelifecyclehead', 'emailtemplatereconciliation'])
        await EmailTemplate.getDatastore().manager.collection(name).deleteMany({ brandId: { $in: brands.map(brand => brand.id) } });
      await EmailTemplate.getDatastore()
        .manager.collection('emailtemplatedraftrevision')
        .deleteMany({
          _id: { $in: brands.map(brand => JSON.stringify([brand.id, templateId])) },
        });
    }
  });

  after(async function () {
    sails.config.emailnotification.settings = previousSettings;
    sails.config.emailnotification.templates = previousTemplates;
    if (brands) await BrandingConfig.destroy({ id: { in: brands.map(brand => brand.id) } });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('creates an actual unique compound index, including under migrate:safe bootstrap', async function () {
    await EmailTemplateService.bootstrap();
    const db = EmailTemplate.getDatastore().manager as any;
    const indexes = await db.collection(EmailTemplate.tableName).indexes();
    assert.ok(indexes.some((index: any) => index.unique && index.key.brandId === 1 && index.key.templateId === 1));
    const created = await EmailTemplateService.create(brands[0].id, templateId, content('A'), 'editor');
    assert.equal(created.revision, 1);
    assert.equal(created.updatedBy, 'editor');
    assert.ok(created.createdAt);
    assert.ok(created.updatedAt);
    await assert.rejects(EmailTemplateService.create(brands[0].id, templateId, content('Duplicate')), {
      code: 'REVISION_CONFLICT',
    });
    // Bypass the service to verify DB uniqueness rather than a service-only check.
    await assert.rejects(
      EmailTemplate.create({
        ...content('Raw duplicate'),
        uid: 'different-uid',
        brandId: brands[0].id,
        templateId,
        revision: 1,
      }).fetch()
    );
  });

  it('keeps two tenant overrides distinct and observes edits/reset on the next send', async function () {
    assert.equal((await render(brands[0].id)).body, 'Supplied body Reader');
    assert.equal(await EmailTemplate.count({ brandId: { in: brands.map(brand => brand.id) } }), 0);
    const supplied = await EmailTemplateService.getDefault(brands[0].id, templateId);
    assert.equal(supplied.format, 'text');
    const createdA = await EmailTemplateService.create(brands[0].id, templateId, content('A'));
    await EmailTemplateService.create(brands[1].id, templateId, content('B'));
    for (const index of [0, 1, 0]) {
      assert.equal((await render(brands[index].id)).subject, `${index === 0 ? 'A' : 'B'} Reader`);
    }
    assert.equal((await render()).subject, 'Supplied Reader');
    assert.equal((await EmailTemplateService.list(brands[0].id)).length, 1);
    const updated = await EmailTemplateService.update(brands[0].id, templateId, content('Edited'), version(createdA));
    assert.equal(updated.revision, 2);
    assert.equal((await render(brands[0].id)).body, 'Edited body Reader');
    await EmailTemplateService.reset(brands[0].id, templateId, version(updated));
    assert.equal(await EmailTemplateService.get(brands[0].id, templateId), null);
    assert.equal((await render(brands[0].id)).subject, 'Supplied Reader');
    assert.equal((await render(brands[1].id)).subject, 'B Reader');
  });

  it('atomically accepts just one of two concurrent edits and rejects stale reset', async function () {
    const initial = await EmailTemplateService.create(brands[0].id, templateId, content('Initial'));
    const edits = await Promise.allSettled([
      EmailTemplateService.update(brands[0].id, templateId, content('First'), version(initial)),
      EmailTemplateService.update(brands[0].id, templateId, content('Second'), version(initial)),
    ]);
    assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = edits.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.code, 'REVISION_CONFLICT');
    assert.equal((await EmailTemplateService.get(brands[0].id, templateId)).revision, 2);
    await assert.rejects(EmailTemplateService.reset(brands[0].id, templateId, version(initial)), {
      code: 'REVISION_CONFLICT',
    });
  });

  it('rejects stale tokens from a previous override lifetime after reset and recreate', async function () {
    const original = await EmailTemplateService.create(brands[0].id, templateId, content('Original'));
    await EmailTemplateService.reset(brands[0].id, templateId, version(original));
    const replacement = await EmailTemplateService.create(brands[0].id, templateId, content('Replacement'));
    assert.equal(replacement.revision, original.revision + 2);
    assert.notEqual(replacement.id, original.id);
    await assert.rejects(EmailTemplateService.update(brands[0].id, templateId, content('Stale'), version(original)), {
      code: 'REVISION_CONFLICT',
    });
    await assert.rejects(EmailTemplateService.reset(brands[0].id, templateId, version(original)), {
      code: 'REVISION_CONFLICT',
    });
    assert.equal((await render(brands[0].id)).subject, 'Replacement Reader');
  });

  it('allows only one winner when reset races an edit of the same revision', async function () {
    const initial = await EmailTemplateService.create(brands[0].id, templateId, content('Initial'));
    const writes = await Promise.allSettled([
      EmailTemplateService.update(brands[0].id, templateId, content('Edited'), version(initial)),
      EmailTemplateService.reset(brands[0].id, templateId, version(initial)),
    ]);
    assert.equal(writes.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = writes.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.code, 'REVISION_CONFLICT');
  });

  it('makes concurrent create/upsert a conflict instead of duplicating or overwriting', async function () {
    const creates = await Promise.allSettled([
      EmailTemplateService.upsert(brands[0].id, templateId, content('First'), null),
      EmailTemplateService.upsert(brands[0].id, templateId, content('Second'), null),
    ]);
    assert.equal(creates.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = creates.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.code, 'REVISION_CONFLICT');
    assert.equal(await EmailTemplate.count({ brandId: brands[0].id, templateId }), 1);
  });

  it('surfaces corrupt stored content rather than rendering the supplied default', async function () {
    await EmailTemplateService.create(brands[0].id, templateId, content('Initial'));
    const db = EmailTemplate.getDatastore().manager as any;
    await db
      .collection(EmailTemplate.tableName)
      .updateOne({ brandId: brands[0].id, templateId }, { $set: { body: '{{#if broken}}' } });
    const result = await render(brands[0].id);
    assert.equal(result.status, 500);
    assert.equal(result.ex.code, 'INVALID_TEMPLATE');
  });

  it('validates persisted expressions at save/render and reports invalid overrides per brand after configuration changes', async function () {
    await assert.rejects(
      EmailTemplateService.create(brands[0].id, templateId, { ...content('Invalid'), body: '{{unknownRoot}}' }),
      { code: 'INVALID_TEMPLATE' }
    );
    const a = await EmailTemplateService.create(brands[0].id, templateId, content('A'));
    await EmailTemplateService.create(brands[1].id, templateId, content('B'));
    await assert.rejects(
      EmailTemplateService.update(
        brands[0].id,
        templateId,
        { ...content('Invalid'), subject: '{{unknownHelper oid}}' },
        version(a)
      ),
      { code: 'INVALID_TEMPLATE' }
    );
    const settings = sails.config.emailnotification.settings;
    try {
      sails.config.emailnotification.settings = { ...settings, additionalContextRoots: ['hookDisplay'] };
      const updated = await EmailTemplateService.update(
        brands[0].id,
        templateId,
        { ...content('A'), body: 'First line\n{{hookDisplay.name}}' },
        version(a)
      );
      assert.deepEqual(await EmailTemplateService.reportInvalidOverrides(brands[0].id), []);
      sails.config.emailnotification.settings = { ...settings, additionalContextRoots: [] };
      const report = await EmailTemplateService.reportInvalidOverrides(brands[0].id);
      assert.equal(report.length, 1);
      assert.equal(report[0].id, updated.id);
      assert.equal(report[0].revision, updated.revision);
      assert.equal(report[0].code, 'INVALID_TEMPLATE');
      assert.deepEqual(report[0].diagnostic, { field: 'body', reason: 'UNKNOWN_CONTEXT_ROOT', line: 2, column: 3 });
      assert.ok(!Object.hasOwn(report[0], 'body'));
      assert.deepEqual(await EmailTemplateService.reportInvalidOverrides(brands[1].id), []);
      const failed = await render(brands[0].id);
      assert.equal(failed.status, 500);
      assert.equal(failed.ex.code, 'INVALID_TEMPLATE');
      assert.equal((await render(brands[1].id)).status, 200);
      // Simulate a legacy/raw writer bypassing the service's current validation.
      const db = EmailTemplate.getDatastore().manager as any;
      await db
        .collection(EmailTemplate.tableName)
        .updateOne({ brandId: brands[0].id, templateId }, { $set: { body: '{{> forbiddenPartial}}' } });
      const partial = (await EmailTemplateService.reportInvalidOverrides(brands[0].id))[0];
      assert.equal(partial.diagnostic.reason, 'UNSUPPORTED_CONSTRUCT');
      assert.ok(!partial.message.includes('forbiddenPartial'));
    } finally {
      sails.config.emailnotification.settings = settings;
    }
  });

  it('rejects invalid tenant IDs, unknown templates and strict render failures', async function () {
    await assert.rejects(EmailTemplateService.get('000000000000000000000000', templateId), { code: 'UNKNOWN_BRAND' });
    await assert.rejects(EmailTemplateService.create(brands[0].id, 'unknown-stage1-email', content('Initial')), {
      code: 'UNKNOWN_TEMPLATE',
    });
    await EmailTemplateService.create(brands[0].id, templateId, {
      ...content('Initial'),
      subject: '{{record.metadata.missing}}',
    });
    const result = await render(brands[0].id);
    assert.equal(result.status, 500);
    assert.equal(result.ex.code, 'RENDER_FAILED');
  });

  it('restricts config exposure through the lifted renderer and persisted body/subject overrides', async function () {
    const settings = sails.config.emailnotification.settings;
    const probe = 'emailRenderContextProbe';
    const config = sails.config as any;
    const previousProbe = config[probe];
    const restrictedId = 'stage2RestrictedContext';
    const attack = '{{sailsConfig.emailRenderContextProbe.secret}}';
    try {
      config[probe] = { secret: 'INTEGRATION-EMAIL-CONFIG-SECRET', label: 'Public label' };
      sails.config.emailnotification.settings = { ...settings, exposedConfigPaths: [`${probe}.label`] };
      writeFileSync(join(directory, `${restrictedId}.hbs`), '{{{json sailsConfig}}}|{{portal.appUrl}}');
      sails.config.emailnotification.templates[restrictedId] = { subject: '{{portal.appUrl}}', template: restrictedId };
      const data = { sailsConfig: sails.config };
      const context = { brandId: brands[0].id };
      const supplied = (await firstValueFrom(EmailService.buildFromTemplate(restrictedId, data, context))) as any;
      assert.equal(supplied.status, 200);
      assert.equal(
        supplied.body,
        `${JSON.stringify({ appUrl: sails.config.appUrl, [probe]: { label: 'Public label' } })}|${sails.config.appUrl}`
      );
      assert.equal(supplied.subject, sails.config.appUrl);
      for (const field of ['to', 'cc', 'bcc', 'from']) {
        assert.throws(() => EmailService.evaluateProperties({ [field]: attack }, {}, data, context));
      }
      const renderRestricted = () =>
        firstValueFrom(EmailService.buildFromTemplate(restrictedId, data, context)) as Promise<any>;
      const created = await EmailTemplateService.create(brands[0].id, restrictedId, {
        subject: 'Safe subject',
        body: attack,
        format: 'text',
      });
      assert.equal((await renderRestricted()).status, 500);
      await EmailTemplateService.update(
        brands[0].id,
        restrictedId,
        { subject: attack, body: 'Safe body', format: 'text' },
        version(created)
      );
      assert.equal((await renderRestricted()).status, 500);
      const callerSubject = (await firstValueFrom(
        EmailService.buildFromTemplate(restrictedId, data, { ...context, subject: attack })
      )) as any;
      assert.equal(callerSubject.status, 500);
    } finally {
      sails.config.emailnotification.settings = settings;
      delete sails.config.emailnotification.templates[restrictedId];
      if (previousProbe === undefined) delete config[probe];
      else config[probe] = previousProbe;
    }
  });
  describe('stage 3 draft/publication lifecycle on native Mongo', function () {
    const actor = { id: 'admin-test', name: 'Admin Test' };
    const draft = (brandId: string) =>
      EmailTemplateAdminService.saveDraft(brandId, templateId, content('Draft') as any, null, actor);
    const onlyOneWinner = (results: PromiseSettledResult<any>[]) => {
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(
        (results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code,
        'REVISION_CONFLICT'
      );
    };

    it('creates real unique draft/history indexes and exactly one of two concurrent publishes wins', async function () {
      const db = EmailTemplate.getDatastore().manager;
      for (const model of [EmailTemplateDraft, EmailTemplateHistory]) {
        const indexes = await db.collection(model.tableName).indexes();
        assert.ok(indexes.some((index: any) => index.unique && index.key.brandId === 1 && index.key.templateId === 1));
      }
      const saved = await draft(brands[0].id);
      onlyOneWinner(
        await Promise.allSettled([
          EmailTemplateAdminService.publish(brands[0].id, templateId, saved.draft.draftRevision, null, actor),
          EmailTemplateAdminService.publish(brands[0].id, templateId, saved.draft.draftRevision, null, actor),
        ])
      );
      assert.equal((await EmailTemplateAdminService.listHistory(brands[0].id, templateId)).length, 1);
      assert.equal((await render(brands[0].id)).subject, 'Draft Reader');
    });

    it('creates the permanent head index and fences delayed first-use reservation after pruning/reset', async function () {
      const db = EmailTemplate.getDatastore().manager;
      const indexes = await db.collection('emailtemplatelifecyclehead').indexes();
      assert.ok(indexes.some((index: any) => index.unique && index.key.brandId === 1 && index.key.templateId === 1));
      const settings = sails.config.emailnotification.settings;
      sails.config.emailnotification.settings = { ...settings, historyMaxVersions: 1 };
      try {
        const delayed = new TemplateServices.EmailTemplates();
        const heads = (delayed as any).heads();
        const reserve = heads.findOneAndUpdate.bind(heads);
        let paused = false;
        sinon.stub(delayed as any, 'heads').returns({
          findOne: heads.findOne.bind(heads), insertOne: heads.insertOne.bind(heads),
          findOneAndUpdate: async (...args: any[]) => {
            if (!paused) {
              paused = true;
              const winner = await EmailTemplateService.create(brands[0].id, templateId, content('Winner'));
              await EmailTemplateService.reset(brands[0].id, templateId, version(winner));
              assert.deepEqual((await EmailTemplateAdminService.listHistory(brands[0].id, templateId)).map(row => row.version), [2]);
            }
            return reserve(...args);
          },
        });
        await assert.rejects(delayed.create(brands[0].id, templateId, content('Delayed') as any), { code: 'REVISION_CONFLICT' });
        assert.equal(await EmailTemplateService.get(brands[0].id, templateId), null);
        assert.equal((await EmailTemplateService.create(brands[0].id, templateId, content('Next'))).revision, 3);
      } finally { sails.config.emailnotification.settings = settings; }
    });

    it('protects live v2 history from the delayed v1 pruner while v3 is incomplete', async function () {
      const settings = sails.config.emailnotification.settings;
      sails.config.emailnotification.settings = { ...settings, historyMaxVersions: 1 };
      try {
        const service = new TemplateServices.EmailTemplates();
        let held = 0;
        sinon.stub(service as any, 'pruneHistory').callsFake(async (_b: string, _t: string, v: number) => { held = v; });
        const one = await service.create(brands[0].id, templateId, content('One') as any);
        const two = await EmailTemplateService.update(brands[0].id, templateId, content('Two'), version(one));
        const failing = new TemplateServices.EmailTemplates();
        sinon.stub(failing as any, 'applyHistory').rejects(new Error('failed live write'));
        await assert.rejects(failing.update(brands[0].id, templateId, content('Three') as any, version(two)));
        await (new TemplateServices.EmailTemplates() as any).pruneHistory(brands[0].id, templateId, held);
        const history = await EmailTemplateAdminService.listHistory(brands[0].id, templateId);
        assert.ok(history.some(row => row.version === 2 && row.live));
        assert.ok(history.some(row => row.version === 3 && !row.applied));
        assert.equal((await render(brands[0].id)).subject, 'Two Reader');
      } finally { sails.config.emailnotification.settings = settings; }
    });

    it('reconciles Mongo create/update/reset failures and permanently consumes rolled-back versions', async function () {
      const service = new TemplateServices.EmailTemplates();
      const originalApply = (service as any).applyHistory.bind(service);
      const write = sinon.stub(service as any, 'applyHistory').rejects(new Error('failed create'));
      const brandId = brands[0].id;
      const recover = (expectedVersion: number, action: 'complete' | 'rollback') =>
        EmailTemplateService.reconcileTransition(brandId, templateId, { expectedVersion, action, writersQuiesced: true, actor });
      await assert.rejects(service.create(brandId, templateId, content('Create') as any));
      assert.equal((await EmailTemplateService.reconcileTransition(brandId, templateId)).pendingVersion, 1);
      assert.equal((await recover(1, 'complete')).outcome, 'completed');
      const one = await EmailTemplateService.get(brandId, templateId);
      await assert.rejects(service.update(brandId, templateId, content('Unapplied') as any, version(one)));
      assert.equal((await recover(2, 'rollback')).outcome, 'rolled-back');
      assert.equal((await EmailTemplateAdminService.getHistoryVersion(brandId, templateId, 2)).applied, false);
      const three = await EmailTemplateService.update(brandId, templateId, content('Three'), version(one));
      assert.equal(three.revision, 3);
      await assert.rejects(service.reset(brandId, templateId, version(three)));
      assert.equal((await recover(4, 'complete')).outcome, 'completed');
      assert.equal(await EmailTemplateService.get(brandId, templateId), null);
      assert.equal((await EmailTemplateService.create(brandId, templateId, content('Five'))).revision, 5);
      // A real write followed by an ambiguous acknowledgement is completed, even if rollback is requested.
      write.callsFake(async (...args: any[]) => { await originalApply(...args); throw new Error('lost acknowledgement'); });
      const five = await EmailTemplateService.get(brandId, templateId);
      await assert.rejects(service.reset(brandId, templateId, version(five)));
      assert.equal((await recover(6, 'rollback')).outcome, 'completed');
      assert.deepEqual(await EmailTemplateService.reportInconsistencies(brandId), []);
      const evidence = await EmailTemplate.getDatastore().manager.collection('emailtemplatereconciliation').find({ brandId, templateId }).toArray();
      assert.equal(evidence.length, 4);
      assert.ok(evidence.every(row => !Object.hasOwn(row, 'subject') && !Object.hasOwn(row, 'body')));
    });

    it('recovers a real head reservation whose history insert failed without reusing its version', async function () {
      const service = new TemplateServices.EmailTemplates();
      const brandId = brands[0].id;
      const history = (service as any).historyCollection();
      sinon.stub(service as any, 'historyCollection').returns({
        insertOne: async () => { throw new Error('history insert failed'); },
        findOne: history.findOne.bind(history),
      });
      await assert.rejects(service.create(brandId, templateId, content('Missing history') as any), { code: 'PERSISTENCE' });
      const inspection = await EmailTemplateService.reconcileTransition(brandId, templateId);
      assert.equal(inspection.historyPresent, false);
      assert.equal((await EmailTemplateAdminService.getEditorState(brandId, templateId)).latestVersion, 1);
      const options = { expectedVersion: 1, writersQuiesced: true, actor };
      await assert.rejects(EmailTemplateService.reconcileTransition(brandId, templateId, { ...options, action: 'complete' }), { code: 'INCOMPLETE_TRANSITION' });
      await EmailTemplateService.reconcileTransition(brandId, templateId, { ...options, action: 'rollback' });
      assert.equal((await EmailTemplateService.create(brandId, templateId, content('Next'))).revision, 2);
    });

    it('finalizes an ambiguously acknowledged Mongo publication and cleans only its published draft', async function () {
      const service = new AdminServices.EmailTemplateAdmin();
      const brandId = brands[0].id;
      const saved = await draft(brandId);
      const apply = (service as any).applyHistory.bind(service);
      sinon.stub(service as any, 'applyHistory').callsFake(async (...args: any[]) => {
        await apply(...args);
        throw new Error('ambiguous live acknowledgement');
      });
      await assert.rejects(service.publish(brandId, templateId, saved.draft.draftRevision, null, actor));
      const result = await EmailTemplateService.reconcileTransition(brandId, templateId, {
        action: 'rollback', expectedVersion: 1, writersQuiesced: true, actor,
      });
      assert.equal(result.outcome, 'completed');
      assert.equal(result.draftRetained, false);
      assert.equal((await EmailTemplateAdminService.getEditorState(brandId, templateId)).draft, null);
      assert.deepEqual(await EmailTemplateService.reportInconsistencies(brandId), []);
    });

    it('derives a headless failed-create baseline from the last applied reset', async function () {
      const service = new TemplateServices.EmailTemplates();
      const brandId = brands[0].id;
      const one = await EmailTemplateService.create(brandId, templateId, content('One'));
      await EmailTemplateService.reset(brandId, templateId, version(one));
      sinon.stub(service as any, 'applyHistory').rejects(new Error('failed create'));
      await assert.rejects(service.create(brandId, templateId, content('Three') as any));
      await EmailTemplate.getDatastore().manager.collection('emailtemplatelifecyclehead').deleteMany({ brandId, templateId });
      const inspection = await EmailTemplateService.reconcileTransition(brandId, templateId);
      assert.equal(inspection.committedVersion, 2);
      await EmailTemplateService.reconcileTransition(brandId, templateId, {
        action: 'rollback', expectedVersion: 3, writersQuiesced: true, actor,
      });
      assert.equal((await EmailTemplateAdminService.getHistoryVersion(brandId, templateId, 2)).live, true);
      assert.equal((await EmailTemplateService.create(brandId, templateId, content('Four'))).revision, 4);
    });

    it('bootstraps legacy live rows without history safely under concurrent first use', async function () {
      const brandId = brands[0].id;
      const legacy = await EmailTemplate.create({ uid: JSON.stringify([brandId, templateId]), brandId, templateId,
        ...content('Legacy'), revision: 12 }).fetch();
      onlyOneWinner(await Promise.allSettled([
        EmailTemplateService.update(brandId, templateId, content('First'), version(legacy)),
        EmailTemplateService.update(brandId, templateId, content('Second'), version(legacy)),
      ]));
      assert.equal((await EmailTemplateService.get(brandId, templateId)).revision, 13);
    });

    it('admits exactly one live transition when publish races reset', async function () {
      const first = await EmailTemplateService.create(brands[0].id, templateId, content('Live'));
      const saved = await draft(brands[0].id);
      onlyOneWinner(
        await Promise.allSettled([
          EmailTemplateAdminService.publish(brands[0].id, templateId, saved.draft.draftRevision, version(first), actor),
          EmailTemplateAdminService.resetToDefault(brands[0].id, templateId, version(first), actor),
        ])
      );
      assert.equal((await EmailTemplateAdminService.listHistory(brands[0].id, templateId)).length, 2);
      assert.deepEqual(await EmailTemplateService.reportInconsistencies(brands[0].id), []);
    });

    it('retains a newer draft saved after history reservation but before publication cleanup', async function () {
      const service = new AdminServices.EmailTemplateAdmin();
      const saved = await draft(brands[0].id);
      const history = (service as any).historyCollection();
      const insert = history.insertOne.bind(history);
      sinon.stub(service as any, 'historyCollection').returns({
        findOne: history.findOne.bind(history),
        find: history.find.bind(history),
        deleteMany: history.deleteMany.bind(history),
        insertOne: async (row: any) => {
          const result = await insert(row);
          await EmailTemplateAdminService.saveDraft(
            brands[0].id,
            templateId,
            content('Autosaved') as any,
            saved.draft.draftRevision,
            actor
          );
          return result;
        },
      });
      const result = await service.publish(brands[0].id, templateId, saved.draft.draftRevision, null, actor);
      assert.equal(result.draftRetained, true);
      assert.equal(result.state.draft.subject, 'Autosaved {{name}}');
      assert.equal((await render(brands[0].id)).subject, 'Draft Reader');
    });

    it('rejects a stale live token with the current live revision and actor', async function () {
      const first = await EmailTemplateService.create(brands[0].id, templateId, content('First'));
      const saved = await draft(brands[0].id);
      const current = await EmailTemplateAdminService.publish(
        brands[0].id,
        templateId,
        saved.draft.draftRevision,
        version(first),
        actor
      );
      await assert.rejects(
        EmailTemplateAdminService.resetToDefault(brands[0].id, templateId, version(first), actor),
        (error: any) => {
          assert.deepEqual(error.current.live.token, current.state.live.token);
          assert.equal(error.current.live.updatedByName, actor.name);
          return error.code === 'REVISION_CONFLICT';
        }
      );
    });

    it('reports the history-first failure without changing the next send or permitting another live transition', async function () {
      const first = await EmailTemplateService.create(brands[0].id, templateId, content('Previous'));
      const saved = await draft(brands[0].id);
      const service = new AdminServices.EmailTemplateAdmin();
      sinon.stub(service as any, 'collection').returns({
        findOneAndUpdate: async () => {
          throw new Error('Simulated after-history failure');
        },
      });
      await assert.rejects(
        service.publish(brands[0].id, templateId, saved.draft.draftRevision, version(first), actor),
        { code: 'PERSISTENCE' }
      );
      assert.equal((await render(brands[0].id)).body, 'Previous body Reader');
      assert.deepEqual(await EmailTemplateService.reportInconsistencies(brands[0].id), [
        { templateId, code: 'INCOMPLETE_LIVE_TRANSITION', version: 2 },
      ]);
      await assert.rejects(
        EmailTemplateAdminService.publish(brands[0].id, templateId, saved.draft.draftRevision, version(first), actor),
        { code: 'REVISION_CONFLICT' }
      );
    });

    it('isolates live/draft/history and record preview by brand with no record existence oracle', async function () {
      const saved = await draft(brands[0].id);
      const result = await EmailTemplateAdminService.publish(
        brands[0].id,
        templateId,
        saved.draft.draftRevision,
        null,
        actor
      );
      assert.equal((await EmailTemplateAdminService.getEditorState(brands[1].id, templateId)).live, null);
      assert.deepEqual(await EmailTemplateAdminService.listHistory(brands[1].id, templateId), []);
      await assert.rejects(
        EmailTemplateAdminService.resetToDefault(brands[1].id, templateId, result.state.live.token, actor),
        { code: 'REVISION_CONFLICT' }
      );
      const get = sinon.stub(RecordsService, 'getMeta');
      get.onFirstCall().resolves({ metadata: { title: 'Private' }, metaMetadata: { brandId: brands[1].id } } as any);
      get.onSecondCall().rejects(new Error('Missing record'));
      const failures = [];
      for (const oid of ['foreign', 'missing']) {
        try {
          await EmailTemplateAdminService.previewContextFromRecord(brands[0].id, oid, { roles: [] } as any, templateId);
        } catch (error) {
          failures.push({ code: error.code, message: error.message });
        }
      }
      assert.equal(failures.length, 2);
      assert.deepEqual(failures[0], failures[1]);
    });

    it('never creates a mail transport from draft/validate/preview/publish/reset/history/restore', async function () {
      const transport = sinon.spy(nodemailer, 'createTransport');
      const saved = await draft(brands[0].id);
      await EmailTemplateAdminService.preview(brands[0].id, templateId, content('Preview') as any, '{"name":"Reader"}');
      EmailTemplateAdminService.validate(content('Valid') as any);
      const published = await EmailTemplateAdminService.publish(
        brands[0].id,
        templateId,
        saved.draft.draftRevision,
        null,
        actor
      );
      await EmailTemplateAdminService.resetToDefault(brands[0].id, templateId, published.state.live.token, actor);
      await EmailTemplateAdminService.listHistory(brands[0].id, templateId);
      await EmailTemplateAdminService.restoreToDraft(brands[0].id, templateId, 1, null, actor);
      assert.equal(transport.callCount, 0);
    });
  });

  describe('stage 3 HTTP/session security', function () {
    let adminAgent: any;
    let researcherAgent: any;
    let anonymousAgent: any;
    let csrf: string;
    let researcherCsrf: string;
    let researcherId: string;
    const prefix = '/default/rdmp/app/email-templates';
    const recordIds = ['allowed', 'foreign', 'denied'].map(kind => `email-preview-${kind}-${Date.now()}`);
    const routeCases = [
      ['get', '/catalogue'],
      ['get', `/templates/${templateId}`],
      ['put', `/templates/${templateId}/draft`],
      ['delete', `/templates/${templateId}/draft`],
      ['post', `/templates/${templateId}/draft/from-default`],
      ['post', `/templates/${templateId}/validate`],
      ['post', `/templates/${templateId}/preview`],
      ['get', '/preview-records?q=x'],
      ['get', '/preview-records/missing/context'],
      ['post', `/templates/${templateId}/publish`],
      ['post', `/templates/${templateId}/reset`],
      ['get', `/templates/${templateId}/history`],
      ['get', `/templates/${templateId}/history/1`],
      ['post', `/templates/${templateId}/history/1/restore`],
    ];
    // The page follows the portal's normal sign-in chain (checkAuth before emailTemplateAdmin).
    const pagePath = '/default/rdmp/admin/email-templates';
    const request = (agent: any, method: string, path: string, token?: string) => {
      const target = path.startsWith('/default/') ? path : `${prefix}${path}`;
      const result = agent[method](target).set('X-Source', 'jsclient').set('Accept', 'application/json');
      if (token) result.set('X-CSRF-Token', token);
      return result;
    };
    before(async function () {
      const app = (sails as any).hooks.http.app;
      adminAgent = supertest.agent(app);
      researcherAgent = supertest.agent(app);
      anonymousAgent = supertest.agent(app);
      const login = async (agent: any, username: string, password: string) => {
        const token = await agent.get('/csrfToken?branding=default&portal=rdmp').set('Accept', 'application/json');
        const csrfToken = token.body._csrf;
        await agent
          .post('/user/login_local')
          .set('X-Source', 'jsclient')
          .set('X-CSRF-Token', csrfToken ?? '')
          .send({ username, password, branding: 'default', portal: 'rdmp' })
          .expect(200);
        // Passport regenerates the session at login; obtain a token for the authenticated session.
        return (await agent.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
      };
      csrf = await login(adminAgent, 'admin', 'rbadmin');
      const brand = BrandingService.getDefault();
      const username = `email-preview-reader-${Date.now()}`;
      const user = await firstValueFrom(
        UsersService.addLocalUser(username, 'Preview Reader', `${username}@example.edu`, 'RBTest123!')
      );
      researcherId = String(user.id);
      await firstValueFrom(UsersService.updateUserRoles(user.id, RolesService.getRoleIds(brand.roles, ['Researcher'])));
      researcherCsrf = await login(researcherAgent, username, 'RBTest123!');
      await Promise.all(
        recordIds.map((redboxOid, index) =>
          Record.create({
            redboxOid,
            metadata: { title: index === 0 ? 'Accessible preview title' : 'PRIVATE RECORD TITLE' },
            metaMetadata: { brandId: index === 1 ? brands[1].id : brand.id, type: 'rdmp', secret: 'PRIVATE INTERNALS' },
            authorization: { view: index === 2 ? [] : ['admin'], edit: [], viewRoles: [], editRoles: [] },
          })
        )
      );
    });
    after(async function () {
      await Record.destroy({ redboxOid: { in: recordIds } });
      if (researcherId) await User.destroy({ id: researcherId });
      const brand = BrandingService.getDefault();
      for (const model of [EmailTemplate, EmailTemplateDraft, EmailTemplateHistory])
        await model.destroy({ brandId: brand.id, templateId });
    });

    it('serves the authorized admin page shell and expected Angular bundle names', async function () {
      const response = await adminAgent.get('/default/rdmp/admin/email-templates').set('Accept', 'text/html').expect(200);
      assert.ok(response.text.includes('<email-templates-root'));
      assert.ok(response.text.includes('/angular/email-templates/browser/main'));
      assert.ok(response.text.includes('data-base-url="/default/rdmp/app/email-templates"'));
    });

    it('returns 403 for anonymous and researcher users on every page/API route', async function () {
      for (const [agent, token] of [
        [anonymousAgent, undefined],
        [researcherAgent, researcherCsrf],
      ]) {
        // When CSRF is enabled, anonymous requests use a valid token so authorization is the rejection being tested.
        const anonymousToken = agent === anonymousAgent ? (await agent.get('/csrfToken?branding=default&portal=rdmp')).body._csrf : token;
        for (const [method, path] of routeCases) {
          const response = await request(agent, method, path, anonymousToken).send({});
          assert.equal(response.status, 403, `${method} ${path}: ${response.status}`);
          assert.equal(response.body.error.code, 'FORBIDDEN');
        }
        const page = await request(agent, 'get', pagePath, anonymousToken).send({});
        assert.equal(page.status, 403, `page: ${page.status}`);
        assert.ok(!page.text.includes('<email-templates-root'));
      }
      const signedOut = await anonymousAgent.get(pagePath).set('Accept', 'text/html').expect(302);
      assert.match(signedOut.headers.location, /\/default\/rdmp\/user\/login$/);
    });

    it('denies a foreign route brand on every endpoint and ignores body/query brand and actor identifiers', async function () {
      for (const [method, path] of routeCases) {
        const target = path.startsWith('/default/')
          ? path.replace('/default/', `/${brands[1].name}/`)
          : `/${brands[1].name}/rdmp/app/email-templates${path}`;
        const response = await adminAgent[method](target)
          .set('X-CSRF-Token', csrf ?? '')
          .set('X-Source', 'jsclient')
          .send({});
        assert.equal(response.status, 403, `${method} ${target}`);
      }
      // A foreign brand on the page route is rejected by the standard branding policies before the admin check.
      const foreignPage = await adminAgent.get(pagePath.replace('/default/', `/${brands[1].name}/`)).set('Accept', 'text/html');
      assert.ok([403, 404].includes(foreignPage.status), `page: ${foreignPage.status}`);
      assert.ok(!foreignPage.text.includes('<email-templates-root'));
      const result = await request(adminAgent, 'put', `/templates/${templateId}/draft?brandId=${brands[1].id}`, csrf)
        .send({
          content: content('Route scoped'),
          expectedDraftRevision: null,
          brandId: brands[1].id,
          branding: brands[1].name,
          actor: { id: 'forged', name: 'Forged Actor' },
        })
        .expect(200);
      assert.equal(result.body.draft.updatedByName, 'Local Admin');
      const defaultBrandId = BrandingService.getDefault().id;
      assert.ok(await EmailTemplateDraft.findOne({ brandId: defaultBrandId, templateId }));
      assert.equal(await EmailTemplateDraft.findOne({ brandId: brands[1].id, templateId }), undefined);
      await request(adminAgent, 'delete', `/templates/${templateId}/draft`, csrf)
        .send({ expectedDraftRevision: result.body.draft.draftRevision })
        .expect(200);
    });

    it('returns one record-unavailable response for wrong-brand, denied, and missing records, and curates permitted context', async function () {
      const responses = [];
      for (const oid of [recordIds[1], recordIds[2], 'email-preview-does-not-exist']) {
        const response = await request(
          adminAgent,
          'get',
          `/preview-records/${oid}/context?templateId=${templateId}`,
          csrf
        ).expect(403);
        responses.push(response.body);
      }
      assert.deepEqual(responses[0], responses[1]);
      assert.deepEqual(responses[0], responses[2]);
      const response = await request(
        adminAgent,
        'get',
        `/preview-records/${recordIds[0]}/context?templateId=${templateId}`,
        csrf
      ).expect(200);
      assert.equal(response.body.context.record.metadata.title, 'Accessible preview title');
      assert.equal(response.body.context.record.authorization, undefined);
      assert.ok(!JSON.stringify(response.body).includes('PRIVATE INTERNALS'));
      const search = await request(adminAgent, 'get', `/preview-records?q=${recordIds[0]}`, csrf).expect(200);
      assert.ok(search.body.records.some((record: any) => record.oid === recordIds[0]));
      assert.ok(!JSON.stringify(search.body).includes('PRIVATE RECORD TITLE'));
    });

    it('supports drafts, preview, publish, conflict, history, reset, and restore without any transport call', async function () {
      const transport = sinon.spy(nodemailer, 'createTransport');
      const saved = await request(adminAgent, 'post', `/templates/${templateId}/draft/from-default`, csrf)
        .send({ expectedDraftRevision: null })
        .expect(200);
      const preview = await request(adminAgent, 'post', `/templates/${templateId}/preview`, csrf)
        .send({
          content: {
            subject: '{{name}}',
            body: '<script>PRIVATE()</script><p onclick="PRIVATE()">Safe</p>',
            format: 'html',
          },
          context: '{"name":"Reader","sails":{"secret":"PRIVATE"}}',
        })
        .expect(200);
      assert.equal(preview.body.subject, 'Reader');
      assert.equal(preview.body.html, '<p>Safe</p>');
      assert.ok(!JSON.stringify(preview.body.sanitiserRemovals).includes('PRIVATE'));
      const invalid = await request(adminAgent, 'post', `/templates/${templateId}/validate`, csrf)
        .send({ content: { ...content('Invalid'), body: 'PRIVATE\n{{unknownRoot}}' } })
        .expect(400);
      assert.equal(invalid.body.diagnostics[0].reason, 'UNKNOWN_CONTEXT_ROOT');
      assert.ok(!JSON.stringify(invalid.body).includes('PRIVATE'));
      const published = await request(adminAgent, 'post', `/templates/${templateId}/publish`, csrf)
        .send({ expectedDraftRevision: saved.body.draft.draftRevision, expectedLiveToken: null })
        .expect(200);
      const history = await request(adminAgent, 'get', `/templates/${templateId}/history`, csrf).expect(200);
      const currentVersion = published.body.state.live.token.revision;
      assert.equal(history.body.versions[0].version, currentVersion);
      const stale = await request(adminAgent, 'post', `/templates/${templateId}/publish`, csrf)
        .send({ expectedDraftRevision: saved.body.draft.draftRevision, expectedLiveToken: null })
        .expect(409);
      assert.equal(stale.body.current.live.token.revision, currentVersion);
      assert.ok(stale.body.current.live.updatedByName);
      await request(adminAgent, 'post', `/templates/${templateId}/reset`, csrf)
        .send({ expectedLiveToken: published.body.state.live.token })
        .expect(200);
      const restored = await request(
        adminAgent,
        'post',
        `/templates/${templateId}/history/${currentVersion}/restore`,
        csrf
      )
        .send({ expectedDraftRevision: null })
        .expect(200);
      await request(adminAgent, 'delete', `/templates/${templateId}/draft`, csrf)
        .send({ expectedDraftRevision: restored.body.draft.draftRevision })
        .expect(200);
      assert.equal(transport.callCount, 0);
    });

    it('rejects mutating requests without CSRF when the test deployment enables it', async function () {
      if (!sails.config.security.csrf) this.skip();
      const response = await request(adminAgent, 'post', `/templates/${templateId}/validate`)
        .send({ content: content('Valid') })
        .expect(403);
      assert.ok(!JSON.stringify(response.body).includes('Valid body'));
    });
  });
});
