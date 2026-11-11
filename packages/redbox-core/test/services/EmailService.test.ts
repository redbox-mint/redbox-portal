import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import nodemailer = require('nodemailer');
import * as fs from 'graceful-fs';
import * as os from 'os';
import * as path from 'path';
import { of, firstValueFrom, Subject, throwError } from 'rxjs';
import { rejects } from 'node:assert/strict';
import { readEmailTemplateDefault } from '../../src/services/EmailTemplateService';

describe('EmailService', function() {
  let mockSails: any;
  let EmailService: any;
  let transportStub: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        emailnotification: {
          defaults: {
            subject: 'Default Subject',
            from: 'default@example.com',
            format: 'text',
            cc: '',
            bcc: '',
            otherSendOptions: {}
          },
          settings: {
            enabled: true,
            templateDir: '/app/templates/',
            serverOptions: { jsonTransport: true }
          },
          templates: {
            'test-template': {
              subject: 'Template Subject'
            }
          }
        }
      },
      log: createSinonStubLogger(sinon),
    });

    setupServiceTestGlobals(mockSails);

    // Stub the CommonJS export rather than a non-configurable namespace binding.
    transportStub = {
      sendMail: sinon.stub().resolves({ messageId: '123' })
    };
    sinon.stub(nodemailer, 'createTransport').returns(transportStub);

    // Mock fs - SKIPPED
    /*
    if ((fs.readFileSync as any).restore) (fs.readFileSync as any).restore();
    sinon.stub(fs, 'readFileSync').callThrough();
    */

    const { Services } = require('../../src/services/EmailService');
    EmailService = new Services.Email();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    // if ((nodemailer.createTransport as any).restore) (nodemailer.createTransport as any).restore();
    // if ((fs.readFileSync as any).restore) (fs.readFileSync as any).restore();
    // if ((ejs.render as any).restore) (ejs.render as any).restore();
    sinon.restore();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    // if ((nodemailer.createTransport as any).restore) (nodemailer.createTransport as any).restore();
    // if ((fs.readFileSync as any).restore) (fs.readFileSync as any).restore();
    sinon.restore();
  });

  describe('sendMessage', function() {
    it('should send email successfully without mutating caller options', async function() {
      const options = { replyTo: 'support@example.com', headers: { 'X-Test': 'value' } };
      const original = _.cloneDeep(options);
      const result = await firstValueFrom(EmailService.sendMessage(
        'to@example.com', 'Body', 'Subject', 'from@example.com', 'text', '', '', options
      ));

      expect(result).to.have.property('success', true);
      expect(options).to.deep.equal(original);
    });

    it('should not mutate defaults or leak message fields into subsequent sends', async function() {
      const defaults = mockSails.config.emailnotification.defaults.otherSendOptions;
      defaults.replyTo = 'default-reply@example.com';
      const original = _.cloneDeep(defaults);
      expect(await firstValueFrom(EmailService.sendMessage('first@example.com', 'First body', 'First subject')))
        .to.have.property('success', true);
      expect(defaults).to.deep.equal(original);
      expect(await firstValueFrom(EmailService.sendMessage(
        'override@example.com', 'Override body', 'Override subject', undefined, undefined, undefined, undefined,
        { replyTo: 'request-reply@example.com' }
      ))).to.have.property('success', true);
      expect(await firstValueFrom(EmailService.sendMessage('second@example.com', 'Second body', 'Second subject')))
        .to.have.property('success', true);
      expect(defaults).to.deep.equal(original);

      expect(transportStub.sendMail.callCount).to.equal(3);
      expect(transportStub.sendMail.firstCall.args[0]).to.deep.include({
        to: 'first@example.com', subject: 'First subject', replyTo: 'default-reply@example.com'
      });
      expect(transportStub.sendMail.secondCall.args[0]).to.deep.include({
        to: 'override@example.com', subject: 'Override subject', replyTo: 'request-reply@example.com'
      });
      expect(transportStub.sendMail.thirdCall.args[0]).to.deep.include({
        to: 'second@example.com', subject: 'Second subject', replyTo: 'default-reply@example.com'
      });
    });
  });

  describe('sendTemplate', function() {
    it('waits for template and delivery completion and forwards the message', async function() {
      const build = new Subject<Record<string, unknown>>();
      const send = new Subject<{ success: boolean, msg: string }>();
      const data = { name: 'World' };
      const buildStub = sinon.stub(EmailService, 'buildFromTemplate').returns(build);
      const sendStub = sinon.stub(EmailService, 'sendMessage').returns(send);
      const result = { success: true, msg: 'sent' };
      const delivery = EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', data);
      let settled = false;
      void delivery.then(() => { settled = true; });

      expect(buildStub.calledOnceWithExactly('greeting', data, { subject: 'Subject' })).to.be.true;
      build.next({ status: 200, body: 'Hello World', subject: 'Subject', format: 'text' });
      await Promise.resolve();
      expect(sendStub.called).to.be.false;
      build.complete();
      await Promise.resolve();
      expect(sendStub.calledOnceWithExactly('to@example.com', 'Hello World', 'Subject', undefined, 'text')).to.be.true;
      send.next(result);
      await Promise.resolve();
      expect(settled).to.be.false;
      send.complete();

      expect(await delivery).to.equal(result);
      expect(await delivery).to.equal(result);
      expect(sendStub.calledOnce).to.be.true;
    });

    it('delivers once even when a legacy caller ignores the return', async function() {
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 200, body: 'Body', subject: 'Subject', format: 'text' }));
      const send = sinon.stub(EmailService, 'sendMessage').returns(of({ success: true, msg: 'sent' }));

      EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {});
      await new Promise<void>(resolve => setImmediate(resolve));

      expect(send.calledOnceWithExactly('to@example.com', 'Body', 'Subject', undefined, 'text')).to.be.true;
    });

    it('rejects a build Observable error without delivering', async function() {
      const error = new Error('build failed');
      sinon.stub(EmailService, 'buildFromTemplate').returns(throwError(() => error));
      const send = sinon.spy(EmailService, 'sendMessage');

      await rejects(EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {}), e => e === error);
      expect(send.called).to.be.false;
    });

    it('preserves the template exception from a non-200 build', async function() {
      const error = new Error('render failed');
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 500, ex: error }));
      const send = sinon.spy(EmailService, 'sendMessage');

      await rejects(EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {}), e => e === error);
      expect(send.called).to.be.false;
    });

    it('rejects non-200 builds without an exception instead of silently skipping', async function() {
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 503, body: 'unavailable' }));
      const send = sinon.spy(EmailService, 'sendMessage');

      await rejects(EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {}), /greeting.*503/);
      expect(send.called).to.be.false;
    });

    it('rejects a delivery Observable error', async function() {
      const error = new Error('delivery failed');
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 200, body: 'Body', subject: 'Subject', format: 'text' }));
      sinon.stub(EmailService, 'sendMessage').returns(throwError(() => error));

      await rejects(EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {}), e => e === error);
    });

    it('rejects unsuccessful sendMessage results', async function() {
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 200, body: 'Body', subject: 'Subject', format: 'text' }));
      sinon.stub(EmailService, 'sendMessage').returns(of({ success: false, msg: 'SMTP unavailable' }));

      await rejects(EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {}), /SMTP unavailable/);
    });

    for (const stage of ['buildFromTemplate', 'sendMessage']) {
      it(`rejects synchronous ${stage} errors`, async function() {
        const error = new Error('synchronous failure');
        if (stage === 'sendMessage') {
          sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 200, body: 'Body', subject: 'Subject', format: 'text' }));
        }
        sinon.stub(EmailService, stage).throws(error);

        await rejects(EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {}), e => e === error);
      });
    }

    it('logs ignored failures without unhandled rejections', async function() {
      const error = new Error('ignored failure');
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 200, body: 'Body', subject: 'Subject', format: 'text' }));
      sinon.stub(EmailService, 'sendMessage').returns(throwError(() => error));
      const unhandled = sinon.spy();
      process.on('unhandledRejection', unhandled);
      try {
        EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {});
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(mockSails.log.error.calledWith('EmailService.sendTemplate failed', error)).to.be.true;
        expect(unhandled.called).to.be.false;
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });

    it('preserves the disabled-email success result', async function() {
      mockSails.config.emailnotification.settings.enabled = false;
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 200, body: 'Body', subject: 'Subject', format: 'text' }));

      expect(await EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {}))
        .to.deep.equal({ success: true, msg: 'Email services disabled.' });
    });

    it('rejects SMTP failures converted to unsuccessful results by sendMessage', async function() {
      transportStub.sendMail.rejects(new Error('SMTP failure'));
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 200, body: 'Body', subject: 'Subject', format: 'text' }));

      await rejects(EmailService.sendTemplate('to@example.com', 'Subject', 'greeting', {}), /Email unable to be submitted/);
    });
  });

  describe('buildFromTemplate', function() {
    // graceful-fs makes fs.readFileSync non-configurable, so we exercise the real
    // file read against a temporary template directory instead of stubbing fs.
    let tmpDir: string;

    beforeEach(function() {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emailtpl-'));
      mockSails.config.emailnotification.settings.templateDir = tmpDir + path.sep;
    });

    afterEach(function() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should read and render a Handlebars template', async function() {
      fs.writeFileSync(path.join(tmpDir, 'greeting.hbs'), '<p>Hello {{name}}</p>');

      const result = await EmailService.buildFromTemplateAsync('greeting', { name: 'World' });

      expect(result.status).to.equal(200);
      expect(result.body).to.equal('<p>Hello World</p>');
    });

    it('builds and delivers a real template through the JSON mail transport', async function() {
      fs.writeFileSync(path.join(tmpDir, 'delivery.hbs'), '<p>Hello {{name}}</p>');
      mockSails.config.emailnotification.settings.serverOptions = { jsonTransport: true };
      const send = sinon.spy(EmailService, 'sendMessage');

      const result = await EmailService.sendTemplate('to@example.com', 'Subject', 'delivery', { name: 'World' });

      expect(result.success).to.be.true;
      expect(send.calledOnceWithExactly('to@example.com', '<p>Hello World</p>', 'Subject', undefined, 'text')).to.be.true;
    });

    it('rejects a real missing template without attempting delivery', async function() {
      const send = sinon.spy(EmailService, 'sendMessage');

      await rejects(EmailService.sendTemplate('to@example.com', 'Subject', 'missing', {}), /Unknown email template 'missing'/);
      expect(send.called).to.be.false;
    });

    it('should render shared helpers (pluck + join)', async function() {
      fs.writeFileSync(path.join(tmpDir, 'creators.hbs'), '{{join (pluck creators "email") ","}}');

      const result = await EmailService.buildFromTemplateAsync('creators', {
        creators: [{ email: 'a@x' }, { email: 'b@x' }],
      });

      expect(result.status).to.equal(200);
      expect(result.body).to.equal('a@x,b@x');
    });

    it('should fail when required template data is missing', async function() {
      fs.writeFileSync(path.join(tmpDir, 'required.hbs'), '<p>Hello {{name}}</p>');

      const result = await EmailService.buildFromTemplateAsync('required', {});

      expect(result.status).to.equal(500);
      expect(result.body).to.equal('Templating error.');
    });

    it('should allow missing data in guarded optional blocks', async function() {
      fs.writeFileSync(path.join(tmpDir, 'optional.hbs'), '{{#if nickname}}<p>{{nickname}}</p>{{/if}}');

      const result = await EmailService.buildFromTemplateAsync('optional', {});

      expect(result.status).to.equal(200);
      expect(result.body).to.equal('');
    });

    it('should handle read error for a missing template', async function() {
      const result = await EmailService.buildFromTemplateAsync('does-not-exist', {});

      expect(result.status).to.equal(500);
      expect(result.body).to.equal('Templating error.');
    });
  });

  describe('runTemplate', function() {
    it('should run Handlebars template', function() {
      const template = 'Hello {{name}}';
      const variables = { name: 'World' };

      const result = EmailService.runTemplate(template, variables);

      expect(result).to.equal('Hello World');
    });

    it('should return string as is if no template tags', function() {
      const result = EmailService.runTemplate('Hello World', {});
      expect(result).to.equal('Hello World');
    });
  });

  describe('evaluateProperties', function() {
    it('should evaluate properties with defaults', function() {
      const options = { msgTo: 'test@example.com' };
      const config = {};
      const templateData = {};

      const result = EmailService.evaluateProperties(options, config, templateData);

      expect(result.to).to.equal('test@example.com');
      expect(result.toRendered).to.equal('test@example.com');
      expect(result.from).to.equal('default@example.com');
    });

    it('should render properties with templates', function() {
      const options = { msgTo: 'user_{{id}}@example.com' };
      const templateData = { id: '123' };

      const result = EmailService.evaluateProperties(options, {}, templateData);

      expect(result.toRendered).to.equal('user_123@example.com');
    });
  });

  describe('sendRecordNotification', function() {
    describe('related metadata opt-in', function() {
      let record: any;
      let enrich: sinon.SinonStub;
      let send: sinon.SinonStub;
      let brand: any;
      let user: any;
      let request: any;
      let tmpDir: string;

      beforeEach(function() {
        record = { redboxOid: 'plan', metaMetadata: { brandId: 'tenant' }, metadata: { activity: 'unsaved-reference' } };
        brand = { id: 'tenant' };
        user = { username: 'sender' };
        request = { relations: [{ relationId: 'activities', required: true }] };
        enrich = sinon.stub().callsFake(async candidate => ({ ..._.cloneDeep(candidate), relatedMetadata: {
          activities: { status: 'resolved', issues: [], records: [{ metadata: { title: 'Current', email: 'current@example.com' } }] },
        } }));
        (global as any).RecordsService = { enrichWithRelatedMetadata: enrich };
        (global as any).BrandingService = { getBrandById: sinon.stub().withArgs('tenant').returns(brand) };
        // Brand-scoped sends resolve through EmailTemplateService; use the supplied file defaults.
        (global as any).EmailTemplateService = { resolve: async (id: string) => readEmailTemplateDefault(id) };
        send = sinon.stub(EmailService, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-related-'));
        mockSails.config.emailnotification.settings.templateDir = tmpDir + path.sep;
        fs.writeFileSync(path.join(tmpDir, 'related.hbs'),
          '{{record.relatedMetadata.activities.records.0.metadata.title}}/{{imports.record.relatedMetadata.activities.records.0.metadata.title}}');
      });

      afterEach(function() {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        delete (global as any).RecordsService;
        delete (global as any).BrandingService;
        delete (global as any).EmailTemplateService;
      });

      function options(): any {
        return { relatedMetadata: request, template: 'related',
          triggerCondition: '<%= record.relatedMetadata.activities.records[0].metadata.title === "Current" %>',
          to: '{{record.relatedMetadata.activities.records.0.metadata.email}}',
          from: '{{imports.record.relatedMetadata.activities.records.0.metadata.email}}',
          cc: '{{record.relatedMetadata.activities.records.0.metadata.email}}',
          bcc: '{{imports.record.relatedMetadata.activities.records.0.metadata.email}}',
          subject: '{{record.relatedMetadata.activities.records.0.metadata.title}}' };
      }

      it('uses one fresh result for trigger, all recipients, subject and body per operation', async function() {
        record.relatedMetadata = { stale: true };
        const original = _.cloneDeep(record);
        for (let i = 0; i < 2; i++) {
          expect(await EmailService.sendRecordNotification('plan', record, options(), user, {})).to.equal(record);
          expect(send.getCall(i).args).to.deep.equal(['current@example.com', 'Current/Current', 'Current',
            'current@example.com', 'text', 'current@example.com', 'current@example.com', {}]);
        }
        expect(enrich.callCount).to.equal(2);
        expect(enrich.firstCall.args).to.deep.equal([record,
          { brand, user, audience: 'service', serviceId: 'EmailService' }, request]);
        expect(record).to.deep.equal(original);
      });

      it('keeps the original record for success mutations and record/response returns', async function() {
        const hook = sinon.spy((_oid, candidate) => { candidate.metadata.notified = true; return of(candidate); });
        mockSails.services.notificationtest = { success: hook };
        const opts = { ...options(), onNotifySuccess: [{ function: 'sails.services.notificationtest.success' }] };
        expect(await EmailService.sendRecordNotification('plan', record, opts, user, {})).to.equal(record);
        expect(hook.firstCall.args[1]).to.equal(record);
        expect(record.metadata.notified).to.be.true;
        expect(record).not.to.have.property('relatedMetadata');
        const response = { status: 200 };
        expect(await EmailService.sendRecordNotification('plan', record, opts, user, response)).to.equal(response);
        expect(opts.returnType).to.equal('response');
      });

      it('uses a hook display view for rendering while success hooks keep the stored record', async function() {
        const view = { ..._.cloneDeep(record), metadata: { title: 'Current source title' } };
        const prepare = sinon.stub(EmailService, 'prepareNotificationRecord').resolves(view);
        fs.writeFileSync(path.join(tmpDir, 'projected.hbs'), '{{record.metadata.title}}/{{imports.record.metadata.title}}');
        const hook = sinon.spy((_oid, candidate) => { candidate.metadata.notified = true; return of(candidate); });
        mockSails.services.notificationtest = { success: hook };
        await EmailService.sendRecordNotification('plan', record, { forceRun: true,
          template: 'projected', to: 'current@example.com', subject: '{{record.metadata.title}}',
          onNotifySuccess: [{ function: 'sails.services.notificationtest.success' }],
        }, user, {});
        expect(prepare.firstCall.args[0]).to.equal(record);
        expect(send.firstCall.args.slice(0, 3)).to.deep.equal(['current@example.com',
          'Current source title/Current source title', 'Current source title']);
        expect(hook.firstCall.args[1]).to.equal(record);
        expect(record.metadata).to.deep.equal({ activity: 'unsaved-reference', notified: true });
        expect(view.metadata).to.deep.equal({ title: 'Current source title' });
      });

      it('projects record-backed editor contexts with the trusted preview user', async function() {
        const view = { ..._.cloneDeep(record), metadata: { title: 'Current source title' } };
        const prepare = sinon.stub(EmailService, 'prepareNotificationRecord').resolves(view);
        fs.writeFileSync(path.join(tmpDir, 'projected.hbs'), '{{record.metadata.title}}');
        const context = await EmailService.buildPreviewContext('projected', { record, oid: 'plan' }, 'tenant', user);
        expect(prepare.calledOnceWithExactly(record, { template: 'projected' }, user)).to.be.true;
        expect(context.record.metadata.title).to.equal('Current source title');
        expect(record.metadata).to.deep.equal({ activity: 'unsaved-reference' });
        prepare.resetHistory();
        await EmailService.buildPreviewContext('projected', { record: view }, 'tenant');
        expect(prepare.called).to.be.false;
      });

      it('rejects required failures before trigger evaluation, rendering or sending', async function() {
        const error = new Error('Required related metadata unavailable');
        enrich.rejects(error);
        const trigger = sinon.spy(EmailService, 'metTriggerCondition');
        const render = sinon.spy(EmailService, 'evaluateProperties');
        await rejects(EmailService.sendRecordNotification('plan', record, options(), user, {}), value => value === error);
        expect(trigger.called).to.be.false;
        expect(render.called).to.be.false;
        expect(send.called).to.be.false;
        expect(record).not.to.have.property('relatedMetadata');
      });

      it('uses configured fallbacks for optional unavailable data', async function() {
        request.relations[0].required = false;
        enrich.resolves({ ..._.cloneDeep(record), relatedMetadata: {
          activities: { status: 'unavailable', records: [], issues: [{ code: 'unavailable' }] },
        } });
        fs.writeFileSync(path.join(tmpDir, 'optional.hbs'),
          '{{#if record.relatedMetadata.activities.records.length}}Available{{else}}No activity{{/if}}');
        await EmailService.sendRecordNotification('plan', record, { relatedMetadata: request, forceRun: true,
          template: 'optional', to: 'fallback@example.com', subject: '{{imports.record.relatedMetadata.activities.status}}' }, user, {});
        expect(send.firstCall.args.slice(0, 3)).to.deep.equal(['fallback@example.com', 'No activity', 'unavailable']);
      });

      it('returns early when disabled without resolution or trigger evaluation', async function() {
        mockSails.config.services = { email: { disabled: true } };
        const trigger = sinon.spy(EmailService, 'metTriggerCondition');
        const opts = options();
        expect(await EmailService.sendRecordNotification('plan', record, opts, user, {})).to.equal(record);
        const response = { status: 200 };
        expect(await EmailService.sendRecordNotification('plan', record, opts, user, response)).to.equal(response);
        expect(opts.returnType).to.equal('response');
        expect(enrich.called).to.be.false;
        expect(trigger.called).to.be.false;
        expect(send.called).to.be.false;
      });

      it('does no extra reads without opt-in and skips sending for a false enriched trigger', async function() {
        fs.writeFileSync(path.join(tmpDir, 'legacy.hbs'), 'Legacy');
        expect(await EmailService.sendRecordNotification('plan', record,
          { forceRun: true, template: 'legacy', to: 'legacy@example.com' }, user, {})).to.equal(record);
        expect(enrich.called).to.be.false;
        expect(send.calledOnce).to.be.true;
        send.resetHistory();
        expect(await EmailService.sendRecordNotification('plan', record,
          { ...options(), triggerCondition: 'false' }, user, {})).to.equal(record);
        expect(enrich.calledOnce).to.be.true;
        expect(send.called).to.be.false;
      });
    });

    it('should not mutate record notification send options', async function() {
      const record = { id: '1' };
      const options = { template: 'test-template', to: 'to@example.com',
        otherSendOptions: { replyTo: 'record-support@example.com' } };
      const original = _.cloneDeep(options);
      sinon.stub(EmailService, 'metTriggerCondition').returns('true');
      sinon.stub(EmailService, 'buildFromTemplate').returns(of({ status: 200, body: 'Email Body' }));

      expect(await EmailService.sendRecordNotification('oid-1', record, options, {}, {})).to.equal(record);
      expect(options).to.deep.equal(original);
    });

    it('waits for success hooks in order before resolving the notification', async function() {
      const record = { metadata: { title: 'Notification' } };
      let releaseFirst!: () => void;
      let markStarted!: () => void;
      const firstStarted = new Promise<void>(resolve => { markStarted = resolve; });
      const firstFinished = new Promise<void>(resolve => { releaseFirst = resolve; });
      const order: string[] = [];
      mockSails.services.notificationtest = {
        first: async () => { order.push('first-start'); markStarted(); await firstFinished; order.push('first-end'); return record; },
        second: () => { order.push('second'); return of(record); },
      };
      sinon.stub(EmailService, 'metTriggerCondition').returns('true');
      sinon.stub(EmailService, 'buildFromTemplateAsync').resolves({ status: 200, body: 'Body', subject: 'Subject', format: 'text' });
      sinon.stub(EmailService, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
      let completed = false;
      const sending = EmailService.sendRecordNotification('oid-1', record, {
        template: 'test-template', to: 'to@example.com', triggerCondition: 'true',
        onNotifySuccess: [
          { function: 'sails.services.notificationtest.first', options: {} },
          { function: 'sails.services.notificationtest.second', options: {} },
        ],
      }, {}, {}).then(() => { completed = true; });
      await firstStarted;
      expect(completed).to.equal(false);
      expect(order).to.deep.equal(['first-start']);
      releaseFirst();
      await sending;
      expect(order).to.deep.equal(['first-start', 'first-end', 'second']);
      expect(completed).to.equal(true);
    });

    it('should send notification if condition met', async function() {
      const record = { id: '1', metadata: { title: 'Test' } };
      const options = {
        template: 'test-template',
        to: 'to@example.com',
        triggerCondition: 'true'
      };

      sinon.stub(EmailService, 'metTriggerCondition').returns('true');
      sinon.stub(EmailService, 'buildFromTemplateAsync').resolves({ status: 200, body: 'Email Body' });
      sinon.stub(EmailService, 'sendMessage').returns(of({ success: true, msg: 'sent' }));

      const result = await EmailService.sendRecordNotification('oid-1', record, options, {}, {});

      expect(EmailService.sendMessage.called).to.be.true;
      expect(result).to.deep.equal(record);
    });

    it('should skip if condition not met', async function() {
      const record = { id: '1' };
      const options = { triggerCondition: 'false' };

      sinon.stub(EmailService, 'metTriggerCondition').returns('false');
      sinon.spy(EmailService, 'sendMessage');

      await EmailService.sendRecordNotification('oid-1', record, options, {}, {});

      expect(EmailService.sendMessage.called).to.be.false;
    });
  });
});
