import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstValueFrom, of } from 'rxjs';
import * as sinon from 'sinon';
import { ObjectId } from 'mongodb';
import {
  Services as TemplateServices,
  EmailTemplateConflictError,
  EmailTemplateError,
} from '../../src/services/EmailTemplateService';
import { Services as EmailServices } from '../../src/services/EmailService';
import { Services as NotificationServices, EmailChannel } from '../../src/services/IntegrationNotificationService';
import { Controllers as EmailControllers } from '../../src/controllers/EmailController';
import { EmailTemplateWLDef } from '../../src/waterline-models/EmailTemplate';
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
      getDatastore: () => ({
        driver: { mongodb: { ObjectId } },
        manager: {
          collection: () => ({
            findOneAndUpdate: async (criteria: any, update: any) => {
              const identity = key(criteria.brandId, criteria.templateId);
              const row = rows.get(identity);
              if (!matches(row, criteria)) return null;
              const { id, ...updated } = { ...row, ...update.$set };
              rows.set(identity, { ...updated, id });
              return { ...updated, _id: new ObjectId(id) };
            },
            deleteOne: async (criteria: any) => {
              const identity = key(criteria.brandId, criteria.templateId);
              if (!matches(rows.get(identity), criteria)) return { deletedCount: 0 };
              rows.delete(identity);
              return { deletedCount: 1 };
            },
          }),
        },
      }),
    };
    (global as any).EmailTemplate = model;
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
    assert.equal((await render('b', { name: 'Reader', sailsConfig: mockSails.config })).subject, 'Hook Reader');
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
    const result = await firstValueFrom(
      email.buildFromTemplate('notice', { name: 'Reader', sailsConfig: mockSails.config })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body, 'Default Reader https://portal.example');
    assert.equal(result.subject, undefined);
    assert.equal(model.findOne.callCount, 0);
  });

  it('renders two brands without leakage and queries DB on every send', async () => {
    await service.create('a', 'notice', content('A'));
    await service.create('b', 'notice', content('B'));
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
    const result = await render(undefined, { name: 'Reader', brandId: 'a', sailsConfig: mockSails.config });
    assert.equal(result.body, 'Default Reader https://portal.example');
    assert.equal(model.findOne.callCount, 0);
  });

  it('observes create, update and reset from another service instance without restart', async () => {
    const secondWorker = new EmailServices.Email();
    const data = { name: 'Reader', sailsConfig: mockSails.config };
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
    assert.equal(replacement.revision, original.revision);
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
    await service.create('a', 'notice', { ...content('A'), subject: 'MAILMARK {{missingValue}}' });
    const result = await render('a');
    const failure = result.ex as EmailTemplateError;
    assert.equal(failure.code, 'RENDER_FAILED');
    assert.equal(failure.cause, undefined);
    assert.ok(!failure.message.includes('MAILMARK'));
    assert.equal(send.callCount, 0);
  });

  it('rejects unknown/empty/null brands without consulting another brand', async () => {
    await service.create('a', 'notice', content('A'));
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
    await service.update('a', 'notice', { ...content('A'), body: 'Present', subject: '{{missing}}' }, version(created));
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
    class HookEmail extends EmailServices.Email {
      override async buildFromTemplateAsync(
        name: string,
        data: Record<string, unknown> = {},
        response: Record<string, unknown> = {}
      ): Promise<Record<string, unknown>> {
        return super.buildFromTemplateAsync(name, { ...data, scuEmail: { display: 'Hook display' } }, response);
      }
    }
    email = new HookEmail();
    writeFileSync(join(directory, 'hook-body.hbs'), '{{scuEmail.display}} {{name}}');
    assert.equal((await render('a')).body, 'Hook display Reader');
    await service.create('a', 'notice', {
      subject: '{{scuEmail.display}}',
      body: '{{scuEmail.display}} override',
      format: 'html',
    });
    const result = await render('a');
    assert.equal(result.subject, 'Hook display');
    assert.equal(result.body, 'Hook display override');
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
});
