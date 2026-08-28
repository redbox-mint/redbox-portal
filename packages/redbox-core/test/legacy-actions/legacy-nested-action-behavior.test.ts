import { expect } from 'chai';
import * as sinon from 'sinon';
import { Observable, firstValueFrom, of } from 'rxjs';
import { Services as EmailServices } from '../../src/services/EmailService';
import { Services as RDMPServices } from '../../src/services/RDMPService';
import { Services as TriggerServices } from '../../src/services/TriggerService';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from '../services/testHelper';

type TestRecord = { metadata: { title?: string } };
type NestedDefinition = { function: string; options?: Record<string, string | boolean> };
type ExpectedErrorName = 'Error' | 'SyntaxError' | 'TypeError';

async function expectRejection<T>(
  operation: Promise<T>,
  message: string,
  expectedName: ExpectedErrorName = 'Error'
): Promise<void> {
  const outcome = await operation.then(
    () => ({ status: 'resolved' as const }),
    error => ({ status: 'rejected' as const, error })
  );

  expect(outcome.status, `Expected rejection containing '${message}'.`).to.equal('rejected');
  if (outcome.status === 'rejected') {
    expect(outcome.error).to.be.instanceOf(Error);
    if (outcome.error instanceof Error) {
      expect(outcome.error.name).to.equal(expectedName);
      expect(outcome.error.message).to.include(message);
    }
  }
}

describe('A01 nested legacy action failure behavior', function () {
  let mockSails: ReturnType<typeof createMockSails>;
  let emailService: EmailServices.Email;
  let rdmpService: RDMPServices.RDMPS;
  let triggerService: TriggerServices.Trigger;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        services: { email: { disabled: false } },
        emailnotification: {
          defaults: {
            subject: 'Default subject',
            from: 'default@example.test',
            format: 'text',
            cc: '',
            bcc: '',
            otherSendOptions: {},
          },
          settings: {
            enabled: true,
            templateDir: '/app/templates/',
            serverOptions: {},
          },
          templates: {},
        },
        queue: { serviceName: 'agendaqueueservice' },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
      services: {
        agendaqueueservice: { now: sinon.stub().resolves({}) },
      },
    });
    setupServiceTestGlobals(mockSails);
    emailService = new EmailServices.Email();
    rdmpService = new RDMPServices.RDMPS();
    triggerService = new TriggerServices.Trigger();
    sinon.stub(emailService, 'buildFromTemplateAsync').resolves({ status: 200, body: 'Email body' });
    sinon.stub(emailService, 'sendMessage').returns(of({ success: true, msg: 'sent' }));
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  function emailOptions(onNotifySuccess: NestedDefinition[]) {
    return {
      forceRun: true,
      template: 'test-template',
      to: 'recipient@example.test',
      subject: 'Subject',
      onNotifySuccess,
    };
  }

  it('fails the rejection assertion when an operation resolves', async function () {
    const outcome = await expectRejection(Promise.resolve('resolved'), 'nested failure').then(
      () => ({ status: 'resolved' as const }),
      error => ({ status: 'rejected' as const, error })
    );

    expect(outcome.status).to.equal('rejected');
    if (outcome.status === 'rejected') {
      expect(outcome.error).to.be.instanceOf(Error);
      if (outcome.error instanceof Error) {
        expect(outcome.error.message).to.include("Expected rejection containing 'nested failure'.");
      }
    }
  });

  describe('EmailService onNotifySuccess', function () {
    it('rejects the parent Promise for invalid expressions and non-callable evaluated values', async function () {
      const record: TestRecord = { metadata: { title: 'Invalid nested email action' } };

      await expectRejection(
        emailService.sendRecordNotification(
          'oid-email-invalid',
          record,
          emailOptions([{ function: '(() =>' }]),
          {},
          {}
        ),
        'Unexpected',
        'SyntaxError'
      );
      await expectRejection(
        emailService.sendRecordNotification(
          'oid-email-non-callable',
          record,
          emailOptions([{ function: '({ value: 1 })' }]),
          {},
          {}
        ),
        'is not a function',
        'TypeError'
      );
    });

    it('rejects the parent Promise when a nested callback throws synchronously', async function () {
      const record: TestRecord = { metadata: { title: 'Throwing nested email action' } };

      await expectRejection(
        emailService.sendRecordNotification(
          'oid-email-throw',
          record,
          emailOptions([{ function: '() => { throw new Error("email nested synchronous throw"); }' }]),
          {},
          {}
        ),
        'email nested synchronous throw'
      );
    });

    it('resolves the parent while logging detached Promise and Observable rejections', async function () {
      const record: TestRecord = { metadata: { title: 'Rejected nested email actions' } };
      const result = await emailService.sendRecordNotification(
        'oid-email-async-rejections',
        record,
        emailOptions([
          { function: '() => Promise.reject(new Error("email nested promise rejection"))' },
          {
            function: '() => require("rxjs").throwError(() => new Error("email nested observable rejection"))',
          },
        ]),
        {},
        {}
      );
      await new Promise<void>(resolve => setImmediate(resolve));

      expect(result).to.equal(record);
      const verboseMessages: string[] = [];
      for (const call of mockSails.log.verbose.getCalls()) {
        verboseMessages.push(String(call.args[0]));
      }
      expect(verboseMessages.filter(message => message.includes('hook failed.')).length).to.equal(2);
      expect(verboseMessages.some(message => message.includes('email nested promise rejection'))).to.equal(false);
      expect(verboseMessages.some(message => message.includes('email nested observable rejection'))).to.equal(false);
    });
  });

  describe('TriggerService runHooksSync', function () {
    it('throws synchronously for an invalid expression and logs/skips a non-callable value', async function () {
      const record: TestRecord = { metadata: { title: 'Nested trigger action' } };

      expect(() =>
        triggerService.runHooksSync('oid-trigger-invalid', record, { hooks: [{ function: '(() =>' }] }, {})
      ).to.throw(SyntaxError, 'Unexpected');
      const result = await firstValueFrom(
        triggerService.runHooksSync('oid-trigger-non-callable', record, { hooks: [{ function: '({ value: 1 })' }] }, {})
      );

      expect(result).to.equal(record);
      expect(mockSails.log.error.calledWithMatch('runHooksSync, this is not a valid function')).to.equal(true);
    });

    it('terminates the returned Observable for synchronous, Promise, and Observable callback failures', async function () {
      const record: TestRecord = { metadata: { title: 'Rejected nested trigger actions' } };
      const failingDefinitions = [
        {
          definition: { function: '() => { throw new Error("trigger nested synchronous throw"); }' },
          message: 'trigger nested synchronous throw',
        },
        {
          definition: { function: '() => Promise.reject(new Error("trigger nested promise rejection"))' },
          message: 'trigger nested promise rejection',
        },
        {
          definition: {
            function: '() => require("rxjs").throwError(() => new Error("trigger nested observable rejection"))',
          },
          message: 'trigger nested observable rejection',
        },
      ];

      for (const failure of failingDefinitions) {
        await expectRejection(
          firstValueFrom(
            triggerService.runHooksSync('oid-trigger-failure', record, { hooks: [failure.definition] }, {})
          ),
          failure.message
        );
      }
    });
  });

  describe('RDMPService queued trigger consumer', function () {
    function queuedJob(functionExpression: string) {
      return {
        attrs: {
          data: {
            oid: 'oid-queued',
            record: { metadata: { title: 'Queued nested action' } },
            triggerConfiguration: { function: functionExpression, options: {} },
            user: {},
          },
        },
      };
    }

    it('throws synchronously for invalid expressions and synchronous callback throws', function () {
      expect(() => rdmpService.queuedTriggerSubscriptionHandler(queuedJob('(() =>'))).to.throw(
        SyntaxError,
        'Unexpected'
      );
      expect(() =>
        rdmpService.queuedTriggerSubscriptionHandler(
          queuedJob('() => { throw new Error("queued nested synchronous throw"); }')
        )
      ).to.throw('queued nested synchronous throw');
    });

    it('logs a non-callable value and returns the record Observable', async function () {
      const result = rdmpService.queuedTriggerSubscriptionHandler(queuedJob('({ value: 1 })'));

      expect(result).to.be.instanceOf(Observable);
      if (!(result instanceof Observable)) {
        throw new Error('The queued non-callable path did not return an Observable.');
      }
      expect(await firstValueFrom(result)).to.deep.equal({ metadata: { title: 'Queued nested action' } });
      expect(
        mockSails.log.error.calledWithMatch('Configured queued trigger did not resolve to a valid function.')
      ).to.equal(true);
      expect(JSON.stringify(mockSails.log.error.args)).not.to.contain('({ value: 1 })');
    });

    it('rejects the consumer Promise for returned Promise and Observable failures', async function () {
      const failingExpressions = [
        {
          expression: '() => Promise.reject(new Error("queued nested promise rejection"))',
          message: 'queued nested promise rejection',
        },
        {
          expression: '() => require("rxjs").throwError(() => new Error("queued nested observable rejection"))',
          message: 'queued nested observable rejection',
        },
      ];

      for (const failure of failingExpressions) {
        const result = rdmpService.queuedTriggerSubscriptionHandler(queuedJob(failure.expression));
        expect(result).to.be.instanceOf(Promise);
        if (!(result instanceof Promise)) {
          throw new Error('The queued failing callback path did not return a Promise.');
        }
        await expectRejection(result, failure.message);
      }
    });
  });
});
