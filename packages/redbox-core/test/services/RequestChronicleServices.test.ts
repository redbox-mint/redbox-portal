import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import * as sinon from 'sinon';
import { defer, firstValueFrom, from, map, of } from 'rxjs';
import { Services } from '../../src/CoreService';
import { Services as EmailServices } from '../../src/services/EmailService';
import { Services as UserServices } from '../../src/services/UsersService';
import { Services as TriggerServices } from '../../src/services/TriggerService';
import { Services as RecordsServices } from '../../src/services/RecordsService';
import { Services as SolrServices } from '../../src/services/SolrSearchService';
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';
import { currentRequestChronicle, runWithRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { createSinonStubLogger } from '../logger.test';

class TestService extends Services.Core.Service {
  public record(info: Record<string, unknown>, errors: unknown[] = []): void {
    this.updateChronicle(info, errors);
  }
}

describe('Request chronicles in services', () => {
  let logger: ReturnType<typeof createSinonStubLogger>;
  let service: TestService;
  let originalSails: unknown;

  beforeEach(async () => {
    originalSails = Reflect.get(globalThis, 'sails');
    logger = createSinonStubLogger(sinon);
    Reflect.set(globalThis, 'sails', {
      log: logger,
      config: { log: { requestChronicle: { successSampleRate: 1 } } },
    });
    service = new TestService();
    await delay(0);
    logger.verbose.resetHistory();
  });

  afterEach(() => {
    sinon.restore();
    Reflect.set(globalThis, 'sails', originalSails);
  });

  function helper(id: string): RequestChronicleHelper {
    const item = RequestChronicleHelper.fromReq(logger, { options: {} } as Sails.Req, {
      generateRequestId: () => id,
    });
    item.start();
    return item;
  }

  it('isolates interleaved promises, timers, nested calls, and RxJS subscriptions on one service instance', async () => {
    const first = helper('first');
    const second = helper('second');
    const work = (item: RequestChronicleHelper, name: string, wait: number) =>
      runWithRequestChronicle(item, async () => {
        service.record({ serviceOwner: name });
        await delay(wait);
        await firstValueFrom(
          defer(() =>
            from(delay(1)).pipe(
              map(() => {
                service.record({ serviceAsyncOwner: name });
                assert.equal(currentRequestChronicle(), item);
              })
            )
          )
        );
        runWithRequestChronicle(undefined, () => {
          assert.equal(currentRequestChronicle(), undefined);
        });
        assert.equal(currentRequestChronicle(), item);
      });
    await Promise.all([work(first, 'first', 5), work(second, 'second', 1)]);
    assert.equal(first.data.serviceOwner, 'first');
    assert.equal(first.data.serviceAsyncOwner, 'first');
    assert.equal(second.data.serviceOwner, 'second');
    assert.equal(second.data.serviceAsyncOwner, 'second');
    assert.equal(currentRequestChronicle(), undefined);
    sinon.assert.notCalled(logger.debug);
    sinon.assert.notCalled(logger.error);
  });

  it('records a rethrown error once across service and controller boundaries and retains failed HTTP 200 responses', () => {
    const item = helper('failed');
    const error = new Error('provider failed');
    runWithRequestChronicle(item, () => service.record({ serviceOutcome: 'failed' }, [error]));
    item.addError(error);
    item.finish({ statusCode: 200, writableFinished: true, headersSent: true });
    item.log();
    assert.equal(item.data.errors?.length, 1);
    assert.equal(item.data.result?.outcome, 'failure');
    sinon.assert.calledOnce(logger.error);
  });

  it('logs late failures with the original request ID while another request is running', async () => {
    const first = helper('first');
    const second = helper('second');
    const late = runWithRequestChronicle(first, async () => {
      await delay(1);
      service.record({ serviceOutcome: 'failed' }, [new Error('late failure')]);
    });
    first.finish();
    await runWithRequestChronicle(second, () => late);
    assert.equal(second.data.errors, undefined);
    sinon.assert.calledOnce(logger.error);
    sinon.assert.calledWithMatch(logger.error, { requestId: 'first' });
    sinon.assert.calledWithMatch(logger.debug, { requestId: 'first' });
  });

  it('preserves sanitized namespace logging without HTTP context', () => {
    service.record({ serviceOid: 'oid', password: 'private', text: 'x'.repeat(10_000) }, [
      new Error('Bearer private-key'),
    ]);
    sinon.assert.calledOnce(logger.debug);
    sinon.assert.calledOnce(logger.error);
    const output = JSON.stringify([logger.debug.firstCall.args, logger.error.firstCall.args]);
    assert.ok(!output.includes('private'));
    assert.ok(output.length < 6000);
    assert.equal(currentRequestChronicle(), undefined);
  });

  it('does not throw when a fallback logger or a capture getter fails', () => {
    logger.debug.throws(new Error('transport failed'));
    logger.error.throws(new Error('transport failed'));
    assert.doesNotThrow(() => service.record({ serviceOutcome: 'failed' }, [new Error('failure')]));
    const item = helper('hostile');
    runWithRequestChronicle(item, () =>
      assert.doesNotThrow(() =>
        service.record({
          get serviceValue() {
            throw new Error('getter failed');
          },
        })
      )
    );
  });

  it('retains errors when logging the details fails', () => {
    logger.debug.throws(new Error('details transport failed'));
    service.record({ serviceOutcome: 'failed' }, [new Error('operation failed')]);
    sinon.assert.calledOnce(logger.error);
  });

  it('shares context with a separately loaded module copy', () => {
    const modulePath = require.resolve('../../src/utilities/RequestChronicleContext');
    const originalModule = require.cache[modulePath];
    delete require.cache[modulePath];
    try {
      const copy: typeof import('../../src/utilities/RequestChronicleContext') = require(modulePath);
      const item = helper('module-copy');
      runWithRequestChronicle(item, () => assert.equal(copy.currentRequestChronicle(), item));
    } finally {
      require.cache[modulePath] = originalModule;
    }
  });

  it('captures email rendering failures without logging template data or changing the result', async () => {
    const email = new EmailServices.Email();
    // Force the filesystem boundary to fail without sending mail or touching real templates.
    Reflect.set(globalThis, 'sails', {
      log: logger,
      config: {
        emailnotification: { settings: { templateDir: '/missing-service-test/' } },
      },
    });
    const item = helper('email');
    const response = await runWithRequestChronicle(item, () =>
      email.buildFromTemplateAsync('missing', {
        subject: 'PRIVATE SUBJECT',
        body: 'PRIVATE BODY',
        record: { title: 'PRIVATE TITLE' },
      })
    );
    assert.equal(response.status, 500);
    assert.equal(response.body, 'Templating error.');
    assert.ok(response.ex instanceof Error);
    assert.equal(item.data.emailTemplate, 'missing');
    assert.equal(item.data.emailTemplateOutcome, 'failed');
    assert.equal(item.data.errors?.length, 1);
    assert.ok(!JSON.stringify(item.data).includes('PRIVATE'));
    sinon.assert.notCalled(logger.error);
  });

  it('captures denied email authorization without retaining the email address', () => {
    Reflect.set(globalThis, 'sails', {
      log: logger,
      config: {
        brandingAware: () => ({ authorizedDomainsEmails: { enabled: true, domainsOidc: ['allowed.edu'] } }),
      },
    });
    const users = new UserServices.Users();
    const item = helper('users');
    const allowed = runWithRequestChronicle(item, () =>
      users.checkAuthorizedEmail('private@other.edu', 'default', 'oidc')
    );
    assert.equal(allowed, false);
    assert.equal(item.data.usersEmailAccessOutcome, 'denied');
    assert.equal(item.data.errors?.length, 1);
    assert.equal(item.data.errors?.[0].stack, undefined);
    assert.ok(!JSON.stringify(item.data).includes('private@other.edu'));
  });

  it('retains email notification failures even when a caller catches the thrown error', async () => {
    Reflect.set(globalThis, 'sails', {
      log: logger,
      config: { emailnotification: { defaults: {}, templates: {} } },
    });
    const email = new EmailServices.Email();
    const item = helper('notification');
    await runWithRequestChronicle(item, () =>
      assert.rejects(email.sendRecordNotification('oid', {}, { forceRun: true }, {}, {}), /Invalid email address/)
    );
    assert.equal(item.data.emailNotificationOutcome, 'invalid-recipient');
    assert.equal(item.data.errors?.length, 1);
    item.finish({ statusCode: 200, headersSent: true, writableFinished: true });
    assert.equal(item.data.result?.classification, 'error');
  });

  it('keeps invalid trigger behavior while capturing safe configuration failures', async () => {
    const trigger = new TriggerServices.Trigger();
    const item = helper('trigger');
    const record = { metadata: { title: 'PRIVATE TITLE' } };
    const result = await runWithRequestChronicle(item, () =>
      firstValueFrom(
        trigger.runHooksSync(
          'oid',
          record,
          {
            hooks: [{ options: { secret: 'PRIVATE OPTION' } }],
          },
          {}
        )
      )
    );
    assert.equal(result, record);
    assert.equal(item.data.triggerHookCount, 1);
    assert.equal(item.data.triggerHookOutcome, 'missing-function');
    assert.equal(item.data.errors?.length, 1);
    assert.ok(!JSON.stringify(item.data).includes('PRIVATE'));
  });

  it('preserves datastream results without capturing their contents', async () => {
    const originalStorageManager = Reflect.get(globalThis, 'StorageManagerService');
    Reflect.set(globalThis, 'StorageManagerService', { stagingDisk: () => ({}) });
    try {
      const records = new RecordsServices.Records();
      const result = { title: 'PRIVATE TITLE', body: 'PRIVATE BODY' };
      Reflect.set(records, 'datastreamService', { updateDatastream: () => of([Promise.resolve(result)]) });
      const item = helper('datastream');
      const response = await runWithRequestChronicle(item, () =>
        firstValueFrom(records.handleUpdateDataStream('oid', {}, {}))
      );
      assert.equal(response, result);
      assert.equal(item.data.recordsDatastreamOid, 'oid');
      assert.equal(item.data.recordsDatastreamCount, 1);
      assert.equal(item.data.recordsDatastreamOutcome, 'updated');
      assert.ok(!JSON.stringify(item.data).includes('PRIVATE'));
    } finally {
      Reflect.set(globalThis, 'StorageManagerService', originalStorageManager);
    }
  });

  it('preserves Solr query and response contents without capturing them', async () => {
    Reflect.set(globalThis, 'sails', {
      log: logger,
      config: {
        solr: {
          cores: { default: { options: { core: 'redbox', host: 'localhost', port: 8983 } } },
        },
      },
    });
    const response = { title: 'PRIVATE TITLE' };
    const request = sinon.stub(require('axios'), 'get').resolves({ data: response });
    const solr = new SolrServices.SolrSearchService();
    const item = helper('solr');
    const result = await runWithRequestChronicle(item, () => solr.searchAdvanced('default', 'dataset', 'q=PRIVATE'));
    assert.equal(result, response);
    assert.equal(request.firstCall.args[1].params.get('q'), 'PRIVATE');
    assert.equal(item.data.solrCore, 'default');
    assert.equal(item.data.solrSearchMode, 'advanced');
    assert.ok(!JSON.stringify(item.data).includes('PRIVATE'));
  });

  it('records a detached user hook failure after the response without awaiting the hook', async () => {
    const originalHook = Reflect.get(globalThis, 'chronicleUserHook');
    let rejectWork: (error: Error) => void = () => {};
    const work = new Promise<void>((_resolve, reject) => {
      rejectWork = reject;
    });
    Reflect.set(globalThis, 'chronicleUserHook', () => work);
    try {
      const users = new UserServices.Users();
      const item = helper('detached-user-hook');
      const result = runWithRequestChronicle(item, () =>
        users.triggerPostSaveTriggers(
          {},
          {
            hooks: { onUpdate: { post: [{ function: 'chronicleUserHook', options: { secret: 'PRIVATE' } }] } },
          }
        )
      );
      assert.equal(result, undefined);
      item.finish();
      rejectWork(new Error('detached hook failed'));
      await delay(0);
      sinon.assert.calledWithMatch(logger.error, { requestId: 'detached-user-hook' });
      assert.ok(!JSON.stringify(item.data).includes('PRIVATE'));
    } finally {
      Reflect.set(globalThis, 'chronicleUserHook', originalHook);
    }
  });
});
