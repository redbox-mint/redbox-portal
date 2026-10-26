import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { createSinonStubLogger } from '../logger.test';
import { Services as Audits } from '../../src/queries/IntegrationAudits';
import { Services as Notifications, EmailChannel } from '../../src/integrations/IntegrationNotifications';
import { RecordAuditReader } from '../../src/queries/RecordAuditReader';
import { VocabInlineFormConfigVisitor } from '../../src/forms/VocabInlineFormConfigVisitor';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';

const secret = 'private-provider-credential-should-not-be-logged';
function safe(log: ReturnType<typeof createSinonStubLogger>) {
  const calls = ['error', 'warn', 'debug'].flatMap(name =>
    (log[name] as sinon.SinonStub).getCalls().map(call => call.args)
  );
  assert(calls.length, 'Exercise the operational logging boundary');
  assert(!inspect(calls, { depth: 10 }).includes(secret), 'Do not serialize provider errors or response bodies');
}
describe('owned domain failure logging', () => {
  for (const mode of ['persist', 'response', 'event', 'queue']) {
    it(`bounds integration audit ${mode} failures`, async () => {
      const log = createSinonStubLogger(sinon);
      const create = sinon.stub().resolves({ success: true });
      if (mode === 'persist') create.rejects(new Error(secret));
      if (mode === 'response') create.resolves({ success: false, message: secret, details: { credentials: secret } });
      const audit = new Audits.IntegrationAuditService({
        log,
        environment: 'integrationtest',
        storage: {
          createIntegrationAudit: create,
          getIntegrationAudit: sinon.stub(),
          countIntegrationAudit: sinon.stub(),
        },
        enqueue: async () => {
          if (mode === 'queue') throw new Error(secret);
        },
        emitSecurityEvent: async () => {
          if (mode === 'event') throw new Error(secret);
        },
      });
      await audit.storeIntegrationAudit({
        attrs: {
          data: {
            redboxOid: 'record',
            integrationName: 'figshare',
            integrationAction: 'syncRecordWithFigshare',
            status: 'failed',
            traceId: 'trace',
            spanId: 'span',
            startedAt: new Date().toISOString(),
          },
        },
      });
      safe(log);
    });
  }
  it('bounds notification configuration failures', async () => {
    const log = createSinonStubLogger(sinon);
    const notification = new Notifications.IntegrationNotificationService({
      log,
      email: { buildFromTemplate: sinon.stub(), sendMessage: sinon.stub() },
      configuration: async () => {
        throw new Error(secret);
      },
      state: { get: async () => null, set: async () => {} },
    });
    await notification.dispatch({ attrs: { data: { redboxOid: 'record', integrationName: 'doi', status: 'failed' } } });
    safe(log);
  });
  for (const phase of ['template', 'transport', 'response']) {
    it(`bounds notification email ${phase} failures`, async () => {
      const log = createSinonStubLogger(sinon);
      const email = {
        buildFromTemplate: sinon.stub().returns(of({ status: 200, body: 'body' })),
        sendMessage: sinon.stub().returns(of({ success: true })),
      };
      if (phase === 'template') email.buildFromTemplate.returns(throwError(() => new Error(secret)));
      if (phase === 'transport') email.sendMessage.returns(throwError(() => new Error(secret)));
      if (phase === 'response') email.sendMessage.returns(of({ success: false, msg: secret }));
      assert.equal(
        await new EmailChannel({ email, log }).send(
          { title: 'Failure', kind: 'failure' } as Parameters<EmailChannel['send']>[0],
          {
            recipients: ['operator@example.invalid'],
            channelConfig: {},
          }
        ),
        false
      );
      safe(log);
    });
  }
  it('retains unresolved permission principals without logging provider errors', async () => {
    const log = createSinonStubLogger(sinon);
    const reader = new RecordAuditReader({
      log,
      storage: {
        getMeta: sinon.stub().resolves({ authorization: { edit: ['alice'] } }),
        getRecordAudit: sinon.stub(),
        createRecordAudit: sinon.stub(),
      },
      createAudit: sinon.stub(),
      resolveUser: async () => {
        throw new Error(secret);
      },
    });
    const result = await reader.getResolvedPermissionsSummary('record');
    assert.deepEqual(result.edit, [{ username: 'alice', name: '', email: '' }]);
    safe(log);
  });
  it('preserves inline vocabulary rejection without serializing its provider failure', async () => {
    const log = createSinonStubLogger(sinon);
    const error = new Error(secret);
    const form = await new ConstructFormConfigVisitor(log).start({
      formMode: 'edit',
      data: {
        name: 'logging',
        componentDefinitions: [
          {
            name: 'field',
            component: {
              class: 'DropdownInputComponent',
              config: { inlineVocab: true, vocabRef: 'status', options: [] },
            },
          },
        ],
      },
    });
    const visitor = new VocabInlineFormConfigVisitor(log, {
      defaultBrand: () => 'default',
      getEntries: async () => {
        throw error;
      },
    });
    await assert.rejects(visitor.resolveVocabs(form), cause => cause === error);
    safe(log);
  });
});
