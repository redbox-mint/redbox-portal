import assert from 'node:assert/strict';
import { EmailMongoFake } from '../helpers/EmailMongoFake';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { firstValueFrom, of } from 'rxjs';
import * as sinon from 'sinon';
import { ObjectId } from 'mongodb';
import {
  Services as TemplateServices,
  EmailTemplateConflictError,
  EmailTemplateError,
} from '../../src/services/EmailTemplateService';
import { Services as EmailServices, curateEmailRecordData } from '../../src/services/EmailService';
import { Services as NotificationServices, EmailChannel } from '../../src/services/IntegrationNotificationService';
import { Controllers as EmailControllers } from '../../src/controllers/EmailController';
import { EmailTemplateWLDef } from '../../src/waterline-models/EmailTemplate';
import { coreBootstrap } from '../../src/bootstrap';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

// This fake models the DB's conditional write and unique constraint. The real
// adapter and index are exercised in test/integration/services/EmailTemplateService.test.ts.
describe('Email template overrides', () => {
  let directory: string;
  let service: TemplateServices.EmailTemplates;
  let email: EmailServices.Email;
  let rows: Map<string, any>;
  let model: any;
  let mockSails: any;
  const content = (label: string) => ({
    subject: `${label} {{name}}`,
    body: `<p>${label} {{name}}</p>`,
    format: 'html' as const,
  });
  const key = (brandId: string, templateId: string) => JSON.stringify([brandId, templateId]);
  const matches = (row: any, criteria: any) =>
    row &&
    Object.entries(criteria).every(([name, value]) =>
      name === '_id' ? row.id === String(value) : row[name] === value
    );
  const version = (row: any) => ({ id: row.id, revision: row.revision });
  const render = (brandId?: string, data: Record<string, unknown> = { name: 'Reader' }, context = {}) =>
    firstValueFrom(email.buildFromTemplate('notice', data, { brandId, ...context }));

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'brand-email-'));
    writeFileSync(join(directory, 'hook-body.hbs'), 'Default {{name}} {{sailsConfig.appUrl}}');
    writeFileSync(join(directory, 'integrationFailure.hbs'), 'Failure {{redboxOid}}');
    mockSails = createMockSails({
      config: {
        appUrl: 'https://portal.example',
        emailnotification: {
          settings: { enabled: true, templateDir: directory },
          defaults: { subject: 'Global subject', format: 'text', from: 'sender@example.com' },
          templates: {
            notice: { subject: 'Hook {{name}}', template: 'hook-body', format: 'text' },
            missing: { subject: 'Missing', template: 'absent' },
            integrationFailure: { subject: '{{title}}', template: 'integrationFailure' },
          },
        },
      },
    });
    setupServiceTestGlobals(mockSails);
    rows = new Map();
    model = {
      findOne: sinon.spy(async (criteria: any) => [...rows.values()].find(row => matches(row, criteria))),
      find: async (criteria: any) => [...rows.values()].filter(row => matches(row, criteria)),
      create: (values: any) => ({
        fetch: async () => {
          const identity = key(values.brandId, values.templateId);
          if (rows.has(identity)) throw Object.assign(new Error('duplicate'), { code: 'E_UNIQUE' });
          const row = { ...values, id: new ObjectId().toHexString() };
          rows.set(identity, row);
          return row;
        },
      }),
      getDatastore: new EmailMongoFake(rows).datastore,
    };
    model.tableName = 'emailtemplate';
    (global as any).EmailTemplate = model;
    (global as any).EmailTemplateDraft = { tableName: 'emailtemplatedraft' };
    (global as any).EmailTemplateHistory = { tableName: 'emailtemplatehistory' };
    (global as any).BrandingConfig = { findOne: async ({ id }: any) => (['a', 'b'].includes(id) ? { id } : undefined) };
    service = new TemplateServices.EmailTemplates();
    email = new EmailServices.Email();
    (global as any).EmailTemplateService = service;
    (global as any).EmailService = email;
  });

  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    for (const name of [
      'EmailTemplate',
      'EmailTemplateDraft',
      'EmailTemplateHistory',
      'EmailTemplateService',
      'EmailService',
      'BrandingConfig',
      'BrandingService',
      'AppConfigService',
      'CacheService',
    ]) {
      delete (global as any)[name];
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it('registers the persisted identity constraint and creates it in safe-mode bootstrap', async () => {
    assert.equal(EmailTemplateWLDef.attributes.uid.unique, true);
    assert.deepEqual(EmailTemplateWLDef.indexes, [{ attributes: { brandId: 1, templateId: 1 }, unique: true }]);
    const createIndex = sinon.stub().resolves();
    model.tableName = 'emailtemplate';
    model.getDatastore = () => ({ driver: { mongodb: { ObjectId } }, manager: { collection: () => ({ createIndex }) } });
    await service.bootstrap();
    assert.deepEqual(createIndex.firstCall.args, [{ brandId: 1, templateId: 1 }, { unique: true }]);
  });

  it('lifts on non-Mongo datastores: reads and defaults work, atomic writes fail explicitly', async () => {
    const created = await service.create('a', 'notice', content('Stored'));
    model.getDatastore = () => ({ manager: undefined });
    await service.bootstrap();
    assert.equal((await render('a')).subject, 'Stored Reader');
    assert.equal((await render('b', { name: 'Reader' })).subject, 'Hook Reader');
    await assert.rejects(service.update('a', 'notice', content('X'), version(created)), { code: 'PERSISTENCE' });
    await assert.rejects(service.reset('a', 'notice', version(created)), { code: 'PERSISTENCE' });
  });

  it('fails bootstrap when a sails-mongo datastore lacks native handles', async () => {
    const createIndex = sinon.stub().resolves();
    model.getDatastore = () => ({ config: { adapter: 'sails-mongo' }, manager: { collection: () => ({ createIndex }) } });
    await assert.rejects(service.bootstrap(), { code: 'PERSISTENCE' });
    assert.equal(createIndex.callCount, 0);
  });

  it('keeps legacy two-argument body-only rendering independent of subject data', async () => {
    mockSails.config.emailnotification.templates.notice.subject = 'Subject {{subjectOnly}}';
    await service.create('a', 'notice', content('Override'));
    model.findOne.resetHistory();
    const result = await firstValueFrom(
      email.buildFromTemplate('notice', { name: 'Reader' })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body, 'Default Reader https://portal.example');
    assert.equal(result.subject, undefined);
    assert.equal(model.findOne.callCount, 0);
  });

  it('renders two brands without leakage and queries DB on every send', async () => {
    await service.create('a', 'notice', content('A'));
    await service.create('b', 'notice', content('B'));
    model.findOne.resetHistory();
    for (const brand of ['a', 'b', 'a']) {
      const result = await render(brand);
      assert.equal(result.body, `<p>${brand.toUpperCase()} Reader</p>`);
      assert.equal(result.subject, `${brand.toUpperCase()} Reader`);
      assert.equal(result.format, 'html');
    }
    assert.equal(model.findOne.callCount, 3);
    assert.equal((await service.list('a')).length, 1);
  });

  it('leaves defaults unseeded and uses the config file mapping, subject, format and sailsConfig', async () => {
    const properties = email.evaluateProperties(
      { template: 'notice', to: 'recipient@example.com' },
      {},
      { name: 'Reader' },
      { brandId: 'a' }
    );
    const result = await firstValueFrom(properties.templateRendered!);
    assert.equal(result.body, 'Default Reader https://portal.example');
    assert.equal(result.subject, 'Hook Reader');
    assert.equal(result.format, 'text');
    assert.equal(rows.size, 0);
    assert.equal((await service.getDefault('a', 'notice')).body, 'Default {{name}} {{sailsConfig.appUrl}}');
  });

  it('uses only defaults for legacy calls even when data contains another brand', async () => {
    await service.create('a', 'notice', content('A'));
    model.findOne.resetHistory();
    const result = await render(undefined, { name: 'Reader', brandId: 'a' });
    assert.equal(result.body, 'Default Reader https://portal.example');
    assert.equal(model.findOne.callCount, 0);
  });

  it('observes create, update and reset from another service instance without restart', async () => {
    const secondWorker = new EmailServices.Email();
    const data = { name: 'Reader' };
    const read = () => firstValueFrom(secondWorker.buildFromTemplate('notice', data, { brandId: 'a' }));
    assert.equal((await read()).source, 'default');
    const created = await service.create('a', 'notice', content('One'), 'editor');
    assert.equal((await read()).subject, 'One Reader');
    const updated = await service.update('a', 'notice', content('Two'), version(created), 'editor2');
    assert.equal(updated.revision, 2);
    assert.equal(updated.updatedBy, 'editor2');
    assert.equal((await read()).subject, 'Two Reader');
    await service.reset('a', 'notice', version(updated));
    assert.equal((await read()).subject, 'Hook Reader');
    await service.create('a', 'notice', content('Recreated'));
    assert.equal((await read()).subject, 'Recreated Reader');
  });

  it('rejects duplicate creates and concurrent updates with a distinct conflict error', async () => {
    const creates = await Promise.allSettled([
      service.upsert('a', 'notice', content('A'), null),
      service.upsert('a', 'notice', content('B'), null),
    ]);
    assert.equal(creates.filter(result => result.status === 'fulfilled').length, 1);
    const rejectedCreate = creates.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.ok(rejectedCreate.reason instanceof EmailTemplateConflictError);
    const first = (creates.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
    const edits = await Promise.allSettled([
      service.update('a', 'notice', content('C'), version(first)),
      service.update('a', 'notice', content('D'), version(first)),
    ]);
    assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1);
    const rejectedEdit = edits.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejectedEdit.reason.code, 'REVISION_CONFLICT');
    assert.equal((await service.get('a', 'notice'))?.revision, 2);
    await assert.rejects(service.reset('a', 'notice', version(first)), EmailTemplateConflictError);
    await assert.rejects(service.update('a', 'notice', content('X'), undefined as any), { code: 'INVALID_TEMPLATE' });
    await assert.rejects(service.update('a', 'notice', content('X'), { id: 'not-an-id', revision: 2 }), {
      code: 'INVALID_TEMPLATE',
    });
  });

  it('rejects stale tokens from an earlier override lifetime after reset and recreate', async () => {
    const original = await service.create('a', 'notice', content('Original'));
    await service.reset('a', 'notice', version(original));
    const replacement = await service.create('a', 'notice', content('Replacement'));
    assert.equal(replacement.revision, original.revision + 2);
    await assert.rejects(service.update('a', 'notice', content('Stale'), version(original)), EmailTemplateConflictError);
    await assert.rejects(service.reset('a', 'notice', version(original)), EmailTemplateConflictError);
    assert.equal((await service.get('a', 'notice'))?.subject, 'Replacement {{name}}');
    const resolved = await service.resolve('notice', 'a');
    assert.deepEqual({ id: resolved.id, revision: resolved.revision }, version(replacement));
  });

  it('does not substitute defaults on DB read/write failure', async () => {
    model.findOne = async () => {
      throw new Error('database offline');
    };
    const result = await render('a');
    assert.equal(result.status, 500);
    assert.equal((result.ex as EmailTemplateError).code, 'PERSISTENCE');
    model.create = () => ({
      fetch: async () => {
        throw new Error('database offline');
      },
    });
    await assert.rejects(service.create('a', 'notice', content('X')), (error: any) => {
      assert.equal(error.code, 'PERSISTENCE');
      // Raw storage errors can carry stored documents; never attach or log them.
      assert.equal(error.cause, undefined);
      assert.ok(!String(error.message).includes('database offline'));
      return true;
    });
    for (const call of mockSails.log.error.getCalls()) {
      assert.ok(!JSON.stringify(call.args).includes('database offline'));
    }
  });

  it('reports template syntax and render failures as typed errors without template text', async () => {
    const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
    await assert.rejects(
      email.sendTemplate('reader@example.com', 'MAILMARK {{#if}}', 'notice', { name: 'Reader', sailsConfig: mockSails.config }),
      (error: any) => {
        assert.equal(error.code, 'INVALID_TEMPLATE');
        assert.equal(error.cause, undefined);
        assert.match(error.message, /subject/);
        assert.ok(!error.message.includes('MAILMARK'));
        return true;
      }
    );
    await service.create('a', 'notice', { ...content('A'), subject: 'MAILMARK {{record.metadata.missingValue}}' });
    const result = await render('a');
    const failure = result.ex as EmailTemplateError;
    assert.equal(failure.code, 'RENDER_FAILED');
    assert.equal(failure.cause, undefined);
    assert.ok(!failure.message.includes('MAILMARK'));
    assert.equal(send.callCount, 0);
  });

  it('rejects unknown/empty/null brands without consulting another brand', async () => {
    await service.create('a', 'notice', content('A'));
    model.findOne.resetHistory();
    for (const brand of ['missing', '', null]) {
      const result = await render(brand as any);
      assert.equal(result.status, 500);
      assert.equal((result.ex as EmailTemplateError).code, 'UNKNOWN_BRAND');
    }
    assert.equal(model.findOne.callCount, 0);
    await assert.rejects(service.list('missing'), { code: 'UNKNOWN_BRAND' });
  });

  it('rejects unknown IDs and missing defaults and does not create copied defaults', async () => {
    await assert.rejects(service.create('a', 'unknown', content('A')), { code: 'UNKNOWN_TEMPLATE' });
    await assert.rejects(service.create('a', 'missing', content('A')), { code: 'MISSING_DEFAULT' });
    const result = await firstValueFrom(email.buildFromTemplate('missing', {}, { brandId: 'a' }));
    assert.equal((result.ex as EmailTemplateError).code, 'MISSING_DEFAULT');
    assert.equal(rows.size, 0);
  });

  it('validates all content fields and eagerly rejects Handlebars syntax errors', async () => {
    for (const invalid of [
      { subject: '' },
      { body: ' ' },
      { format: 'markdown' },
      { subject: '{{#if}}' },
      { body: '{{#if name}}' },
    ]) {
      await assert.rejects(service.create('a', 'notice', { ...content('A'), ...invalid } as any), {
        code: 'INVALID_TEMPLATE',
      });
    }
    const row = await service.create('a', 'notice', content('A'));
    rows.set(key('a', 'notice'), { ...row, format: 'invalid' });
    assert.equal(((await render('a')).ex as EmailTemplateError).code, 'INVALID_TEMPLATE');
    rows.set(key('a', 'notice'), { ...row, revision: 0 });
    assert.equal(((await render('a')).ex as EmailTemplateError).code, 'INVALID_TEMPLATE');
  });

  it('fails sends on strict body or subject rendering errors', async () => {
    const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
    const created = await service.create('a', 'notice', content('A'));
    let result = await render('a', {});
    assert.equal((result.ex as EmailTemplateError).code, 'RENDER_FAILED');
    await service.update('a', 'notice', { ...content('A'), body: 'Present', subject: '{{record.metadata.missing}}' }, version(created));
    result = await render('a');
    assert.equal((result.ex as EmailTemplateError).code, 'RENDER_FAILED');
    await assert.rejects(email.sendTemplate('recipient@example.com', undefined, 'notice', {}, { brandId: 'a' }), {
      code: 'RENDER_FAILED',
    });
    assert.equal(send.callCount, 0);
  });

  it('gives explicit caller subject/format priority, and does not render an unused default subject', async () => {
    await service.create('a', 'notice', content('A'));
    mockSails.config.emailnotification.templates.notice.subject = '{{missingDefaultData}}';
    const properties = email.evaluateProperties(
      { template: 'notice', to: 'recipient@example.com', subject: 'Caller {{name}}', msgFormat: 'text' },
      {},
      { name: 'Reader' },
      { brandId: 'a' }
    );
    const result = await firstValueFrom(properties.templateRendered!);
    assert.equal(result.subject, 'Caller Reader');
    assert.equal(result.format, 'text');
    assert.equal(result.body, '<p>A Reader</p>');
    const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
    await email.sendTemplate(
      'recipient@example.com',
      'Explicit {{name}}',
      'notice',
      { name: 'Reader' },
      { brandId: 'a', format: 'text' }
    );
    assert.equal(send.firstCall.args[2], 'Explicit Reader');
    assert.equal(send.firstCall.args[4], 'text');
    const selected = email.evaluateProperties(
      { template: 'notice', to: 'recipient@example.com' },
      {},
      { name: 'Reader' },
      { brandId: 'a' }
    );
    assert.equal((await firstValueFrom(selected.templateRendered!)).subject, 'A Reader');
  });

  it('preserves the SCU three-argument override and display data for both sources', async () => {
    mockSails.config.emailnotification.settings.additionalContextRoots = ['scuEmail'];
    class HookEmail extends EmailServices.Email {
      override async buildFromTemplateAsync(
        name: string,
        data: Record<string, unknown> = {},
        response: Record<string, unknown> = {}
      ): Promise<Record<string, unknown>> {
        assert.deepEqual(data.sailsConfig, { appUrl: 'https://portal.example' });
        return super.buildFromTemplateAsync(name, {
          ...data, sailsConfig: mockSails.config, scuEmail: { display: 'Hook display' },
        }, response);
      }
    }
    email = new HookEmail();
    writeFileSync(join(directory, 'hook-body.hbs'), '{{scuEmail.display}} {{name}} {{sailsConfig.appUrl}}');
    assert.equal((await render('a')).body, 'Hook display Reader https://portal.example');
    await service.create('a', 'notice', {
      subject: '{{scuEmail.display}}',
      body: '{{scuEmail.display}} override',
      format: 'html',
    });
    const result = await render('a');
    assert.equal(result.subject, 'Hook display');
    assert.equal(result.body, 'Hook display override');
    // The hook re-injected the live config above; the core seam must still replace it.
    mockSails.config.session = { secret: 'HOOK-REINJECTED-SECRET' };
    writeFileSync(join(directory, 'hook-body.hbs'), '{{sailsConfig.session.secret}}');
    email = new HookEmail(); // fresh per-instance file-template cache
    const leaked = await render('b');
    assert.equal(leaked.status, 500);
    assert.ok(!String(leaked.body).includes('HOOK-REINJECTED-SECRET'));
  });

  it('rejects invalid ASTs on create/update and reports all invalid stored rows for just the requested brand', async () => {
    await assert.rejects(service.create('a', 'notice', { ...content('A'), body: '{{unknown}}' }), { code: 'INVALID_TEMPLATE' });
    const a = await service.create('a', 'notice', content('A'));
    const b = await service.create('b', 'notice', content('B'));
    await assert.rejects(service.update('a', 'notice', { ...content('A'), subject: '{{unknown oid}}' }, version(a)), { code: 'INVALID_TEMPLATE' });
    rows.set(key('a', 'notice'), { ...a, body: 'line one\n{{unknown}}' });
    rows.set(key('b', 'notice'), { ...b, body: '{{> partial}}' });
    const report = await service.reportInvalidOverrides('a');
    assert.equal(report.length, 1);
    assert.deepEqual(report[0], { brandId: 'a', templateId: 'notice', ...version(a), code: 'INVALID_TEMPLATE',
      message: 'Email body: UNKNOWN_CONTEXT_ROOT at line 2, column 3.',
      diagnostic: { field: 'body', reason: 'UNKNOWN_CONTEXT_ROOT', line: 2, column: 3 } });
    assert.equal((await render('a')).status, 500);
    await assert.rejects(service.reportInvalidOverrides('unknown'), { code: 'UNKNOWN_BRAND' });
    rows.set(key('a', 'notice'), a);
    assert.deepEqual(await service.reportInvalidOverrides('a'), []);
    mockSails.config.emailnotification.settings.additionalContextRoots = ['hookDisplay'];
    rows.set(key('a', 'notice'), { ...a, body: '{{hookDisplay}}' });
    assert.deepEqual(await service.reportInvalidOverrides('a'), []);
    mockSails.config.emailnotification.settings.additionalContextRoots = [];
    assert.equal((await service.reportInvalidOverrides('a')).length, 1);
    assert.equal(((await render('a')).ex as EmailTemplateError).code, 'INVALID_TEMPLATE');
  });

  it('saves uncertain-context roots and defers missing data to strict rendering', async () => {
    const data = { name: 'Reader', oid: 'OID', record: { metadata: { title: 'Title', enabled: true, groups: [[{ name: 'Reader' }]] } } };
    const body = '{{#record.metadata.enabled}}{{this.unknown}}{{/record.metadata.enabled}}';
    let saved = await service.create('a', 'notice', { ...content('A'), body });
    assert.equal((await service.get('a', 'notice'))!.body, body);
    assert.deepEqual(await service.reportInvalidOverrides('a'), []);
    const failed = await render('a', data);
    assert.equal(failed.status, 500);
    assert.equal((failed.ex as EmailTemplateError).code, 'RENDER_FAILED');
    for (const [body, output] of [
      ['{{#record.metadata.groups}}{{#this}}{{../../oid}}{{/this}}{{/record.metadata.groups}}', 'OID'],
      ['{{#each this}}{{#if (eq @key "record")}}{{metadata.title}}{{/if}}{{/each}}', 'Title'],
      ['{{#each @root as |value key|}}{{#if (eq key "record")}}{{value.metadata.title}}{{/if}}{{/each}}', 'Title'],
    ]) {
      saved = await service.update('a', 'notice', { ...content('A'), body }, version(saved));
      assert.deepEqual(await service.reportInvalidOverrides('a'), []);
      const result = await render('a', data);
      assert.equal(result.status, 200);
      assert.equal(result.body, output);
    }
  });

  it('keeps bracketed source and quoted helper text out of audit reports, chronicles and logs', async () => {
    const created = await service.create('a', 'notice', content('A'));
    const emailChronicle = sinon.spy(email as any, 'updateChronicle');
    const templateChronicle = sinon.spy(service as any, 'updateChronicle');
    for (const field of ['subject', 'body']) {
      for (const source of ['{{[PRIVATE BODY: contact Alice about case 123]}}', '{{"PRIVATE SUBJECT" record}}',
        '{{get ("PRIVATE BODY" record) "title"}}', 'PRIVATE BODY {{#if oid}}']) {
        rows.set(key('a', 'notice'), { ...created, [field]: source });
        const report = await service.reportInvalidOverrides('a');
        assert.equal(report.length, 1);
        assert.equal(report[0].code, 'INVALID_TEMPLATE');
        assert.equal(report[0].diagnostic!.field, field);
        assert.deepEqual(Object.keys(report[0].diagnostic!).sort(),
          ['column', 'field', ...(report[0].diagnostic!.helper ? ['helper'] : []), 'line', 'reason']);
        if (report[0].diagnostic!.helper) assert.ok(['each', 'if', 'unless', 'with'].includes(report[0].diagnostic!.helper));
        const result = await render('a');
        assert.equal(result.status, 500);
        assert.ok(result.ex instanceof EmailTemplateError);
        assert.ok(emailChronicle.calledWithMatch({ emailTemplateOutcome: 'failed' }, [result.ex]));
        assert.ok(!inspect([report, result.ex, emailChronicle.args, templateChronicle.args,
          mockSails.log.error.args, mockSails.log.warn.args], { depth: null }).includes('PRIVATE'));
      }
    }
  });

  it('curates record bodies and subjects on every path and both sources while addresses retain full records', async () => {
    const privateValue = 'PRIVATE-AUTH-AND-INTERNALS';
    const record = {
      redboxOid: 'oid', metadata: { title: 'Title', people: [{ name: 'Person' }] },
      dateCreated: '2026-01-01', lastSaveDate: '2026-01-02',
      workflow: { stage: 'review', stageLabel: 'Review', private: privateValue },
      metaMetadata: { type: 'rdmp', brandId: 'a', createdBy: 'Reader', createdOn: '2026-01-01',
        lastSaveDate: '2026-01-02', searchCore: privateValue, form: privateValue, attachmentFields: [privateValue] },
      authorization: { view: ['recipient@example.com'], edit: [privateValue], stored: { viewRoles: [privateValue] } },
      revision: privateValue, incarnationId: privateValue, harvestId: privateValue,
    };
    const data = { record, oid: 'oid', imports: { record, oid: 'oid', private: privateValue } };
    const body = '{{{json record}}}|{{{json imports}}}';
    const subject = '{{{json record}}}';
    const expectedRecord = { oid: 'oid', metadata: record.metadata, lastSaveDate: record.lastSaveDate,
      dateCreated: record.dateCreated, workflow: { stage: 'review', stageLabel: 'Review' },
      metaMetadata: _.pick(record.metaMetadata, ['type', 'brandId', 'createdBy', 'createdOn', 'lastSaveDate']), redboxOid: 'oid' };
    const expectedSubject = JSON.stringify(expectedRecord);
    const expectedBody = expectedSubject + '|' + JSON.stringify({ record: expectedRecord, oid: 'oid' });
    writeFileSync(join(directory, 'hook-body.hbs'), body);
    mockSails.config.emailnotification.templates.notice.subject = subject;
    const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
    sinon.stub(email as any, 'metTriggerCondition').returns('true');
    const original = _.cloneDeep(data);
    const check = (result: any) => {
      assert.equal(result.status, 200, String(result.ex));
      assert.equal(result.body, expectedBody);
      if (result.subject !== undefined) assert.equal(result.subject, expectedSubject);
      assert.ok(!result.body.includes(privateValue));
    };
    for (const override of [false, true]) {
      if (override) await service.create('a', 'notice', { body, subject, format: 'text' });
      check(await render('a', data));
      if (!override) {
        check(await firstValueFrom(email.buildFromTemplate('notice', data)));
        check(await email.buildFromTemplateAsync('notice', data));
        assert.equal(email.runTemplate(body, data), expectedBody);
      }
      await email.sendTemplate('recipient@example.com', undefined, 'notice', data, { brandId: 'a' });
      assert.equal(send.lastCall.args[1], expectedBody);
      assert.equal(send.lastCall.args[2], expectedSubject);
      const address = '{{get record "authorization.view[0]"}}';
      const options = { template: 'notice', to: address, cc: address, bcc: address,
        from: '{{get imports.record "authorization.view[0]"}}' };
      await email.sendRecordNotification('oid', record, options, {}, {});
      assert.deepEqual(send.lastCall.args.slice(0, 7), ['recipient@example.com', expectedBody, expectedSubject,
        'recipient@example.com', 'text', 'recipient@example.com', 'recipient@example.com']);
      const properties = email.evaluateProperties({ ...options, subject }, {}, data);
      check(await firstValueFrom(properties.templateRendered!));
      const controller = new EmailControllers.Email();
      (controller as any).emailService = email;
      (global as any).BrandingService = { getBrand: () => ({ id: 'a' }) };
      const respond = sinon.stub(controller as any, 'sendResp');
      await new Promise<void>(resolve => {
        respond.callsFake(() => resolve());
        controller.sendNotification({ options: { locals: { branding: 'a' } },
          apiRequest: { body: { ...options, data, subject } } } as any, {} as Sails.Res);
      });
      assert.equal(respond.lastCall.args[2].status, 200);
      assert.equal(send.lastCall.args[1], expectedBody);
      assert.equal(send.lastCall.args[2], expectedSubject);
      const channel = new EmailChannel();
      assert.equal(await channel.send({ ...data, kind: 'failure', brandId: 'a', title: expectedSubject } as any,
        { recipients: ['recipient@example.com'], channelConfig: { template: 'notice' } }), true);
      assert.equal(send.lastCall.args[1], expectedBody);
      assert.equal(send.lastCall.args[2], expectedSubject);
    }
    assert.deepEqual(data, original);
  });

  it('takes record tenant context from metaMetadata, preserving recipients and post-send actions', async () => {
    for (const brandId of ['a', 'b']) {
      await service.create(brandId, 'notice', {
        subject: `${brandId} {{record.metadata.name}}`,
        body: `${brandId} body`,
        format: 'text',
      });
    }
    const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
    sinon.stub(email as any, 'metTriggerCondition').returns('true');
    const onSuccess = sinon.stub().resolves({});
    mockSails.services.recordNotificationSuccess = onSuccess;
    for (const brandId of ['a', 'b']) {
      const record = { metaMetadata: { brandId }, metadata: { name: 'Record' } };
      await email.sendRecordNotification(
        'oid',
        record,
        {
          template: 'notice',
          to: 'reader@example.com',
          brandId: 'untrusted-option',
          onNotifySuccess: [{ function: 'sails.services.recordNotificationSuccess' }],
        },
        {},
        {}
      );
    }
    assert.equal(send.callCount, 2);
    assert.deepEqual(
      send.getCalls().map(call => call.args[2]),
      ['a Record', 'b Record']
    );
    assert.deepEqual(
      send.getCalls().map(call => call.args[0]),
      ['reader@example.com', 'reader@example.com']
    );
    assert.equal(onSuccess.callCount, 2);
  });

  it('uses the resolved HTTP brand and ignores brand IDs in request/template data', async () => {
    await service.create('a', 'notice', content('A'));
    await service.create('b', 'notice', content('B'));
    const getBrand = sinon.stub().withArgs('resolved-route-brand').returns({ id: 'a' });
    (global as any).BrandingService = { getBrand };
    mockSails.services.emailservice = email;
    const controller = new EmailControllers.Email();
    controller.init();
    const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
    // Success and failure both respond through sendResp; distinguish by status.
    const respond = sinon.stub(controller as any, 'sendResp');
    const request = {
      options: { locals: { branding: 'resolved-route-brand' } },
      params: { branding: 'resolved-route-brand' },
      body: { branding: 'b', brandId: 'b' },
      apiRequest: {
        body: { to: 'reader@example.com', template: 'notice', brandId: 'b', data: { name: 'Reader', brandId: 'b' } },
      },
    } as any;
    await new Promise<void>(resolve => {
      respond.callsFake(() => resolve());
      controller.sendNotification(request, {} as Sails.Res);
    });
    assert.equal(send.callCount, 1);
    assert.equal(send.firstCall.args[2], 'A Reader');
    assert.equal(send.firstCall.args[4], 'html');
    assert.equal(respond.callCount, 1);
    assert.equal(respond.firstCall.args[2].status, 200);
    getBrand.resetBehavior();
    await controller.sendNotification(request, {} as Sails.Res);
    assert.equal(send.callCount, 1);
    assert.equal(respond.lastCall.args[2].status, 500);
  });

  it('uses persisted brands in background integration dispatch without cross-brand leakage', async () => {
    await service.create('a', 'integrationFailure', {
      subject: 'A {{title}}',
      body: 'A {{redboxOid}}',
      format: 'html',
    });
    await service.create('b', 'integrationFailure', {
      subject: 'B {{title}}',
      body: 'B {{redboxOid}}',
      format: 'text',
    });
    (global as any).BrandingService = {
      getBrandById: (id: string) => (['a', 'b'].includes(id) ? { id } : undefined),
      getDefault: () => ({ id: 'a' }),
    };
    (global as any).AppConfigService = {
      getAppConfigByBrandAndKey: sinon.stub().resolves({
        enabled: true,
        recipients: ['admin@example.com'],
        channels: [{ type: 'email', enabled: true }],
        throttle: { enabled: false },
      }),
    };
    (global as any).CacheService = { get: () => of(null), set: sinon.stub() };
    const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
    const notifications = new NotificationServices.IntegrationNotificationService();
    for (const brandId of ['a', 'b']) {
      await notifications.dispatch({
        attrs: {
          data: { brandId, redboxOid: 'oid', integrationName: 'figshare', integrationAction: 'sync', status: 'failed' },
        },
      });
    }
    assert.equal(send.callCount, 2);
    assert.deepEqual(
      send.getCalls().map(call => [call.args[1], call.args[4]]),
      [
        ['A oid', 'html'],
        ['B oid', 'text'],
      ]
    );
    await notifications.dispatch({
      attrs: { data: { brandId: 'missing', redboxOid: 'oid', integrationName: 'figshare', status: 'failed' } },
    });
    assert.equal(send.callCount, 2);
    const legacy = { kind: 'failure', title: 'Legacy title', redboxOid: 'oid' } as any;
    assert.equal(await new EmailChannel().send(legacy, { recipients: ['admin@example.com'], channelConfig: {} }), true);
    assert.equal(send.lastCall.args[1], 'Failure oid');
    assert.equal(send.lastCall.args[2], 'Legacy title');
  });

  describe('restricted email render context', () => {
    const secret = 'EMAIL-CONFIG-SECRET';
    const attacks = ['{{sailsConfig.datastores.mongodb.url}}', '{{sailsConfig.session.secret}}',
      '{{sailsConfig.emailnotification.settings.serverOptions.auth.pass}}', '{{sailsConfig.auth.apiSecret}}'];
    const display = '{{sailsConfig.appUrl}}|{{portal.appUrl}}|{{portal.brandName}}|{{portal.brandUrl}}|{{portal.portalName}}';
    const expected = 'https://portal.example|https://portal.example|brand-a|https://portal.example/root/brand-a/research|research';
    const spoofed = () => ({ name: 'Reader', sailsConfig: mockSails.config, portal: { brandName: 'untrusted' }, brandId: 'b' });

    beforeEach(() => {
      mockSails.config.datastores = { mongodb: { url: secret } };
      mockSails.config.session = { secret };
      mockSails.config.auth = { defaultPortal: 'research', apiSecret: secret };
      mockSails.config.http = { rootContext: 'root' };
      mockSails.config.emailnotification.settings.serverOptions = { auth: { pass: secret } };
      (global as any).BrandingService = { getBrandById: (id: string) => ({ id, name: `brand-${id}` }) };
    });

    it('constructs portal values from trusted context and replaces caller aliases without mutating data', async () => {
      writeFileSync(join(directory, 'hook-body.hbs'), display);
      const data = spoofed();
      const result = await render('a', data);
      assert.equal(result.body, expected);
      assert.equal(data.sailsConfig, mockSails.config);
      assert.equal(data.portal.brandName, 'untrusted');
      assert.equal((await render(undefined, data)).body,
        'https://portal.example|https://portal.example|||research');
      delete mockSails.config.auth;
      delete mockSails.config.appUrl;
      assert.equal((await render()).body, '||||');
    });

    it('derives record URLs and title for supplied and stored templates, including root contexts and encoded OIDs', async () => {
      const body = '{{title}}|{{record.viewUrl}}|{{record.editUrl}}|{{imports.record.viewUrl}}|{{record.redboxOid}}|{{imports.record.redboxOid}}';
      const oid = 'explicit /?#ü';
      const record = { redboxOid: 'fallback', metadata: { title: 'Record title' }, metaMetadata: { brandId: 'a' } };
      const data = { record, oid, imports: { record, oid } };
      const original = _.cloneDeep(data);
      writeFileSync(join(directory, 'hook-body.hbs'), body);
      mockSails.config.emailnotification.templates.notice.subject = body;
      const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      sinon.stub(email as any, 'metTriggerCondition').returns('true');
      for (const override of [false, true]) {
        if (override) await service.create('a', 'notice', { subject: body, body, format: 'text' });
        for (const rootContext of ['', '/root/']) {
          mockSails.config.http.rootContext = rootContext;
          const base = `https://portal.example/${rootContext ? 'root/' : ''}brand-a/research/record`;
          const viewUrl = `${base}/view/explicit%20%2F%3F%23%C3%BC`;
          const editUrl = `${base}/edit/explicit%20%2F%3F%23%C3%BC`;
          const expected = `Record title|${viewUrl}|${editUrl}|${viewUrl}|${oid}|${oid}`;
          const rendered = await render('a', data);
          assert.equal(rendered.status, 200);
          assert.equal(rendered.body, expected);
          assert.equal(rendered.subject, expected);
          await email.sendRecordNotification(oid, record, { template: 'notice', to: 'reader@example.com' }, {}, {});
          assert.deepEqual(send.lastCall.args.slice(1, 3), [expected, expected]);
        }
      }
      assert.deepEqual(data, original);
    });

    it('uses the curated fallback OID and omits record URLs when their source is unavailable', async () => {
      const record = { redboxOid: 'fallback/id', metadata: { title: 'Record title' } };
      const context = await email.buildPreviewContext('notice', { record, imports: { record } }, 'a') as any;
      assert.equal(context.title, 'Record title');
      assert.equal(context.record.viewUrl, 'https://portal.example/root/brand-a/research/record/view/fallback%2Fid');
      assert.equal(context.record.editUrl, 'https://portal.example/root/brand-a/research/record/edit/fallback%2Fid');
      assert.equal(context.imports.record, context.record);
      assert.equal(Object.hasOwn(context, 'recordUrl'), false);
      for (const oid of [undefined, '', null, 42]) {
        const withoutOid = await email.buildPreviewContext('notice', { record: { oid, metadata: record.metadata } }, 'a') as any;
        assert.equal(Object.hasOwn(withoutOid.record, 'viewUrl'), false);
        assert.equal(Object.hasOwn(withoutOid.record, 'editUrl'), false);
      }
      const withoutRecord = await email.buildPreviewContext('notice', { oid: 'oid' }, 'a');
      assert.equal(Object.hasOwn(withoutRecord, 'title'), false);
      assert.equal(Object.hasOwn(withoutRecord, 'recordUrl'), false);
      for (const title of [undefined, null, 42, ['Title'], { value: 'Title' }]) {
        const context = await email.buildPreviewContext('notice', { record: { metadata: { title } } }, 'a');
        assert.equal(Object.hasOwn(context, 'title'), false);
      }
      writeFileSync(join(directory, 'hook-body.hbs'), '{{{json this}}}');
      const legacy = await email.buildFromTemplateAsync('notice', { record });
      assert.equal(legacy.status, 200);
      const legacyContext = JSON.parse(String(legacy.body));
      assert.equal(legacyContext.title, 'Record title');
      assert.equal(Object.hasOwn(legacyContext, 'recordUrl'), false);
      assert.equal(Object.hasOwn(legacyContext.record, 'viewUrl'), false);
      assert.equal(Object.hasOwn(legacyContext.record, 'editUrl'), false);
      delete mockSails.config.appUrl;
      const withoutBrandUrl = await email.buildPreviewContext('notice', { record }, 'a') as any;
      assert.equal(Object.hasOwn(withoutBrandUrl, 'recordUrl'), false);
      assert.equal(Object.hasOwn(withoutBrandUrl.record, 'viewUrl'), false);
      assert.equal(Object.hasOwn(withoutBrandUrl.record, 'editUrl'), false);
    });

    it('only derives URLs from non-empty string brand URLs and curated OIDs', () => {
      for (const brandUrl of [undefined, '', null, 42]) {
        const context = curateEmailRecordData({ portal: { brandUrl }, record: { oid: 'oid' } }) as any;
        assert.equal(Object.hasOwn(context.record, 'viewUrl'), false);
        assert.equal(Object.hasOwn(context.record, 'editUrl'), false);
      }
    });

    it('preserves caller-supplied titles, including empty, null and undefined values', async () => {
      writeFileSync(join(directory, 'hook-body.hbs'), '{{title}}');
      mockSails.config.emailnotification.templates.notice.subject = '{{title}}';
      const record = { oid: 'oid', metadata: { title: 'Record title' } };
      for (const values of [
        { title: 'Caller title' },
        { title: '' },
        { title: null },
        { title: undefined },
      ]) {
        const result = await render('a', { record, ...values });
        assert.equal(result.status, 200);
        assert.equal(result.body, values.title ?? '');
        assert.equal(result.subject, values.title ?? '');
      }
    });

    it('keeps string record URL edits and derives each non-string URL independently', async () => {
      const base = 'https://portal.example/root/brand-a/research/record';
      for (const [viewUrl, editUrl, expectedView, expectedEdit] of [
        ['https://edited.example/view', 'https://edited.example/edit', 'https://edited.example/view', 'https://edited.example/edit'],
        ['', '', '', ''],
        ['https://edited.example/view', null, 'https://edited.example/view', `${base}/edit/oid`],
        [42, 'https://edited.example/edit', `${base}/view/oid`, 'https://edited.example/edit'],
        [undefined, false, `${base}/view/oid`, `${base}/edit/oid`],
      ]) {
        const record = { oid: 'oid', viewUrl, editUrl };
        const original = _.cloneDeep(record);
        const context = await email.buildPreviewContext('notice', { record }, 'a') as any;
        assert.equal(context.record.viewUrl, expectedView);
        assert.equal(context.record.editUrl, expectedEdit);
        assert.deepEqual(record, original);
      }
      const edited = curateEmailRecordData({ record: { viewUrl: '', editUrl: 'https://edited.example/edit' } }) as any;
      assert.equal(edited.record.viewUrl, '');
      assert.equal(edited.record.editUrl, 'https://edited.example/edit');
      const invalid = curateEmailRecordData({ record: { viewUrl: null, editUrl: 42 } }) as any;
      assert.equal(Object.hasOwn(invalid.record, 'viewUrl'), false);
      assert.equal(Object.hasOwn(invalid.record, 'editUrl'), false);
    });

    it('strictly fails record notifications using the missing recordUrl root', async () => {
      const body = '{{recordUrl}}';
      const data = { record: { oid: 'oid', metadata: { title: 'Record title' }, metaMetadata: { brandId: 'a' } } };
      const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      sinon.stub(email as any, 'metTriggerCondition').returns('true');
      writeFileSync(join(directory, 'hook-body.hbs'), body);
      for (const override of [false, true]) {
        if (override) await service.create('a', 'notice', { subject: 'Subject', body, format: 'text' });
        const result = await render('a', data);
        assert.equal(result.status, 500);
        assert.equal((result.ex as EmailTemplateError).code, 'RENDER_FAILED');
        await assert.rejects(email.sendRecordNotification('oid', data.record,
          { template: 'notice', to: 'reader@example.com' }, {}, {}), { code: 'RENDER_FAILED' });
      }
      assert.equal(send.callCount, 0);
    });

    it('keeps integration title and recordUrl payload values unchanged without a record', async () => {
      const payload = { kind: 'failure', brandId: 'a', title: 'Integration title',
        recordUrl: 'https://integration.example/record/custom', redboxOid: 'oid' } as any;
      const original = _.cloneDeep(payload);
      writeFileSync(join(directory, 'integrationFailure.hbs'), '{{title}}|{{recordUrl}}');
      const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      assert.equal(await new EmailChannel().send(payload, { recipients: ['admin@example.com'], channelConfig: {} }), true);
      assert.deepEqual(send.lastCall.args.slice(1, 3), [
        'Integration title|https://integration.example/record/custom', 'Integration title',
      ]);
      assert.deepEqual(payload, original);
    });

    for (const attack of attacks) {
      it(`blocks file bodies, subjects, addresses and direct string rendering: ${attack}`, async () => {
        assert.throws(() => email.runTemplate(attack, spoofed()));
        for (const field of ['subject', 'to', 'cc', 'bcc', 'from']) {
          assert.throws(() => email.evaluateProperties({ [field]: attack }, {}, spoofed()), field);
        }
        writeFileSync(join(directory, 'hook-body.hbs'), attack);
        assert.equal((await email.buildFromTemplateAsync('notice', spoofed())).status, 500);
        assert.equal((await render(undefined, spoofed())).status, 500);
      });
    }

    it('blocks DB body and subject secrets, including sendTemplate caller subjects', async () => {
      const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      const created = await service.create('a', 'notice', { ...content('Safe'), body: attacks[0] });
      assert.equal((await render('a', spoofed())).status, 500);
      const unsafeSubject = await service.update('a', 'notice', { ...content('Safe'), subject: attacks[0] }, version(created));
      assert.equal((await render('a', spoofed())).status, 500);
      // Safe persisted content, so only the caller-supplied subject can fail the send.
      await service.update('a', 'notice', content('Safe'), version(unsafeSubject));
      await email.sendTemplate('reader@example.com', 'Caller {{name}}', 'notice', spoofed(), { brandId: 'a' });
      assert.equal(send.callCount, 1);
      await assert.rejects(email.sendTemplate('reader@example.com', attacks[0], 'notice', spoofed(), { brandId: 'a' }),
        { code: 'RENDER_FAILED' });
      assert.equal(send.callCount, 1);
    });

    it('validates the exposed-config allowlist eagerly with the offending path named', () => {
      mockSails.config.emailnotification.settings.exposedConfigPaths = ['appUrl', 'publicEmail'];
      mockSails.config.publicEmail = { since: new Date() };
      assert.throws(() => email.validateExposedConfig(), /exposedConfigPaths entry 'publicEmail'.*plain/);
      // buildFromTemplate reports the failure through its Observable, not synchronously.
      const built = email.buildFromTemplate('notice', { name: 'Reader' }, {});
      return assert.rejects(firstValueFrom(built), /publicEmail/);
    });

    it('names malformed allowlist entries and tolerates apps without email settings', () => {
      mockSails.config.emailnotification.settings.exposedConfigPaths = ['appUrl', 'bad..entry'];
      assert.throws(() => email.validateExposedConfig(), /entry 1 \("bad\.\.entry"\)/);
      const settings = mockSails.config.emailnotification;
      delete mockSails.config.emailnotification;
      try {
        email.validateExposedConfig();
        assert.equal(email.runTemplate('{{sailsConfig.appUrl}}', {}), 'https://portal.example');
      } finally {
        mockSails.config.emailnotification = settings;
      }
    });

    it('renders into a fresh response for each subscription', async () => {
      writeFileSync(join(directory, 'hook-body.hbs'), 'Body {{name}}');
      const built = email.buildFromTemplate('notice', { name: 'Reader' }, {});
      const first = await firstValueFrom(built);
      const second = await firstValueFrom(built);
      assert.notEqual(first, second);
      assert.equal(first.body, 'Body Reader');
      assert.equal(second.body, 'Body Reader');
    });

    it('runs allowlist validation in coreBootstrap before other services start', async () => {
      const brandingBootstrap = sinon.stub();
      mockSails.services = {
        emailtemplateservice: { bootstrap: sinon.stub().resolves() },
        emailservice: { validateExposedConfig: sinon.stub().throws(new Error('bad allowlist')) },
        brandingservice: { bootstrap: brandingBootstrap },
      };
      await assert.rejects(coreBootstrap(), /bad allowlist/);
      assert.equal(mockSails.services.emailservice.validateExposedConfig.callCount, 1);
      assert.equal(brandingBootstrap.callCount, 0);
    });

    it('keeps appUrl as a string without a missing-path warning when unconfigured', () => {
      delete mockSails.config.appUrl;
      mockSails.config.emailnotification.settings.exposedConfigPaths = ['appUrl'];
      mockSails.log.warn.resetHistory();
      email.validateExposedConfig();
      assert.equal(email.runTemplate('[{{sailsConfig.appUrl}}]', {}), '[]');
      assert.equal(mockSails.log.warn.callCount, 0);
    });

    it('keeps json available while exposing only the constructed alias in every rendered field', async () => {
      const json = '{{json sailsConfig}}';
      writeFileSync(join(directory, 'hook-body.hbs'), json);
      const props = email.evaluateProperties({ template: 'notice', subject: json, to: json, cc: json, bcc: json, from: json },
        {}, spoofed(), { brandId: 'a' });
      const result = await firstValueFrom(props.templateRendered!);
      for (const rendered of [result.body, result.subject, props.toRendered, props.ccRendered, props.bccRendered, props.fromRendered]) {
        assert.equal(typeof rendered, 'string');
        assert.ok((rendered as string).includes('https://portal.example'));
        assert.ok(!(rendered as string).includes(secret));
        assert.ok(!(rendered as string).includes('datastores'));
      }
      await service.create('a', 'notice', { ...content('Safe'), subject: json, body: json });
      const stored = await render('a', spoofed());
      assert.equal(stored.body, result.body);
      assert.equal(stored.subject, result.subject);
    });

    it('copies allowlisted plain values at their dotted paths and isolates sends from live config', async () => {
      mockSails.config.publicEmail = { label: 'Public', links: [{ href: '/help' }], enabled: true, count: 3, optional: null };
      mockSails.config.emailnotification.settings.exposedConfigPaths = ['publicEmail'];
      let captured: any;
      const props = email.evaluateProperties({ to: '{{sailsConfig.publicEmail.label}}' }, {
        to: { templateFunc: (value: string, data: any) => { captured = data; return email.runTemplate(value, data); } },
      });
      assert.equal(props.toRendered, 'Public');
      assert.deepEqual(captured.sailsConfig, { appUrl: 'https://portal.example', publicEmail: mockSails.config.publicEmail });
      assert.notEqual(captured.sailsConfig.publicEmail, mockSails.config.publicEmail);
      captured.sailsConfig.publicEmail.links[0].href = '/changed';
      captured.sailsConfig.publicEmail.label = 'Changed';
      assert.equal(mockSails.config.publicEmail.links[0].href, '/help');
      assert.equal(mockSails.config.publicEmail.label, 'Public');
      mockSails.config.emailnotification.settings.exposedConfigPaths = ['publicEmail.links'];
      assert.equal(email.runTemplate('{{sailsConfig.publicEmail.links.[0].href}}', {}), '/help');
      assert.throws(() => email.runTemplate('{{sailsConfig.publicEmail.label}}', {}));
      assert.equal(email.runTemplate('{{sailsConfig.appUrl}}', {}), 'https://portal.example');
    });

    it('omits missing paths and warns only once per service instance and path', () => {
      const warnings = sinon.spy(email as any, 'updateChronicle');
      mockSails.config.emailnotification.settings.exposedConfigPaths = ['missing.value', 'missing.other'];
      assert.equal(email.runTemplate('{{{json sailsConfig}}}', {}), '{"appUrl":"https://portal.example"}');
      email.runTemplate('{{sailsConfig.appUrl}}', {});
      assert.equal(warnings.callCount, 2);
      assert.throws(() => email.runTemplate('{{sailsConfig.missing.value}}', {}));
      assert.equal(warnings.callCount, 2);
    });

    it('rejects malformed allowlists and prototype segments before reading config', () => {
      for (const paths of [null, 'appUrl', [null], [1], [''], [' '], ['appUrl.'], ['a..b'],
        ['__proto__.polluted'], ['a.constructor.name'], ['a.prototype.b']]) {
        mockSails.config.emailnotification.settings.exposedConfigPaths = paths;
        assert.throws(() => email.runTemplate('{{sailsConfig.appUrl}}', {}), /exposedConfigPaths/);
      }
      assert.equal(({} as any).polluted, undefined);
    });

    it('rejects live functions, instances, accessors, cycles and nested prototype keys', () => {
      mockSails.config.emailnotification.settings.exposedConfigPaths = ['publicEmail'];
      const cycle: any = {}; cycle.self = cycle;
      for (const value of [() => secret, new Date(), cycle, { nested: () => secret },
        JSON.parse('{"__proto__":{"polluted":true}}'), { get label() { throw new Error('accessor executed'); } }]) {
        mockSails.config.publicEmail = value;
        assert.throws(() => email.runTemplate('{{json sailsConfig}}', {}), /plain|prototype|accessors/);
      }
    });

    it('preserves record config subjects, addresses and display data', async () => {
      writeFileSync(join(directory, 'hook-body.hbs'), '{{record.metadata.name}} {{oid}} {{imports.oid}} ' + display);
      const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      sinon.stub(email as any, 'metTriggerCondition').returns('true');
      const record = { metaMetadata: { brandId: 'a' }, metadata: { name: 'Reader', email: 'reader@example.com' } };
      await email.sendRecordNotification('oid', record, {
        template: 'notice', subject: '{{record.metadata.name}} {{portal.brandName}}',
        to: '{{record.metadata.email}}', cc: '{{imports.record.metadata.email}}',
        bcc: '{{record.metadata.email}}', from: '{{portal.brandName}}@example.com',
      }, {}, {});
      assert.deepEqual(send.firstCall.args.slice(0, 7), ['reader@example.com', `Reader oid oid ${expected}`,
        'Reader brand-a', 'brand-a@example.com', 'text', 'reader@example.com', 'reader@example.com']);
    });

    it('restricts HTTP caller subject and address templates while retaining Handlebars rendering', async () => {
      const controller = new EmailControllers.Email();
      (controller as any).emailService = email;
      (global as any).BrandingService.getBrand = () => ({ id: 'a' });
      const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      const respond = sinon.stub(controller as any, 'apiRespond');
      const failure = sinon.stub(controller as any, 'sendResp');
      const request = { options: { locals: { branding: 'route-brand' } }, apiRequest: { body: {
        to: 'reader@example.com', template: 'notice', data: spoofed(), subject: 'Reader {{portal.brandName}}',
      } } } as any;
      const invoke = () => new Promise<void>(resolve => {
        respond.callsFake(() => resolve()); failure.callsFake(() => resolve());
        controller.sendNotification(request, {} as Sails.Res);
      });
      await invoke();
      assert.equal(send.firstCall.args[2], 'Reader brand-a');
      for (const field of ['subject', 'to', 'cc', 'bcc', 'from']) {
        request.apiRequest.body[field] = attacks[0];
        await invoke();
        assert.equal(failure.lastCall.args[2].status, 500);
        if (field === 'to') request.apiRequest.body.to = 'reader@example.com';
        else delete request.apiRequest.body[field];
      }
      assert.equal(send.callCount, 1);
    });

    it('restricts integration body and subject data and retains payload and portal values', async () => {
      const channel = new EmailChannel();
      const payload = { kind: 'failure', brandId: 'a', title: 'Failure', redboxOid: 'oid' } as any;
      const ctx = { recipients: ['admin@example.com'], channelConfig: {} };
      const send = sinon.stub(email, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      writeFileSync(join(directory, 'integrationFailure.hbs'), '{{redboxOid}} ' + display + ' {{json sailsConfig}}');
      assert.equal(await channel.send(payload, ctx), true);
      assert.ok(send.firstCall.args[1].startsWith(`oid ${expected}`));
      assert.ok(!send.firstCall.args[1].includes(secret));
      const created = await service.create('a', 'integrationFailure', { ...content('Safe'), body: attacks[0] });
      assert.equal(await channel.send(payload, ctx), false);
      await service.update('a', 'integrationFailure', { ...content('Safe'), body: 'Safe', subject: attacks[0] }, version(created));
      assert.equal(await channel.send(payload, ctx), false);
      assert.equal(send.callCount, 1);
    });

    it('renders every bundled email template with existing display data', async () => {
      const { readdirSync } = await import('node:fs');
      mockSails.config.emailnotification.settings.templateDir = join(__dirname, '../../../../views/emailTemplates');
      const person = { text_full_name: 'Reader' };
      const data = { name: 'Reader', oid: 'oid', data: 'Test', title: 'Integration', summary: 'Summary', redboxOid: 'oid',
        integrationName: 'example', integrationAction: 'sync', status: 'failed', traceId: 'trace', spanId: 'span',
        startedAt: 'now', timestamp: 'now', record: { metadata: { title: 'Title', dataowner_name: 'Owner',
          contributor_ci: person, contributor_data_manager: person, contributor_supervisor: person, creators: [person] } } };
      for (const file of readdirSync(mockSails.config.emailnotification.settings.templateDir).filter(file => file.endsWith('.hbs'))) {
        const result = await email.buildFromTemplateAsync(file.slice(0, -4), data);
        assert.equal(result.status, 200, `${file}: ${result.ex}`);
      }
    });
  });
});
