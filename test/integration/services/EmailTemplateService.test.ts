import assert from 'node:assert/strict';
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
    if (brands) await EmailTemplate.destroy({ brandId: { in: brands.map(brand => brand.id) } });
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
    assert.equal(replacement.revision, original.revision);
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

  it('rejects invalid tenant IDs, unknown templates and strict render failures', async function () {
    await assert.rejects(EmailTemplateService.get('000000000000000000000000', templateId), { code: 'UNKNOWN_BRAND' });
    await assert.rejects(EmailTemplateService.create(brands[0].id, 'unknown-stage1-email', content('Initial')), {
      code: 'UNKNOWN_TEMPLATE',
    });
    await EmailTemplateService.create(brands[0].id, templateId, { ...content('Initial'), subject: '{{missing}}' });
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
      const supplied = await firstValueFrom(EmailService.buildFromTemplate(restrictedId, data, context)) as any;
      assert.equal(supplied.status, 200);
      assert.equal(supplied.body, `${JSON.stringify({ appUrl: sails.config.appUrl, [probe]: { label: 'Public label' } })}|${sails.config.appUrl}`);
      assert.equal(supplied.subject, sails.config.appUrl);
      for (const field of ['to', 'cc', 'bcc', 'from']) {
        assert.throws(() => EmailService.evaluateProperties({ [field]: attack }, {}, data, context));
      }
      const renderRestricted = () => firstValueFrom(EmailService.buildFromTemplate(restrictedId, data, context)) as Promise<any>;
      const created = await EmailTemplateService.create(brands[0].id, restrictedId,
        { subject: 'Safe subject', body: attack, format: 'text' });
      assert.equal((await renderRestricted()).status, 500);
      await EmailTemplateService.update(brands[0].id, restrictedId,
        { subject: attack, body: 'Safe body', format: 'text' }, version(created));
      assert.equal((await renderRestricted()).status, 500);
      const callerSubject = await firstValueFrom(EmailService.buildFromTemplate(restrictedId, data,
        { ...context, subject: attack })) as any;
      assert.equal(callerSubject.status, 500);
    } finally {
      sails.config.emailnotification.settings = settings;
      delete sails.config.emailnotification.templates[restrictedId];
      if (previousProbe === undefined) delete config[probe];
      else config[probe] = previousProbe;
    }
  });
});
