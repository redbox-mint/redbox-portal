import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from 'node:util';
import * as sinon from 'sinon';
import { defer, firstValueFrom, from, map, of } from 'rxjs';
import { Services } from '../../src/CoreService';
import { Controllers } from '../../src/CoreController';
import { RBValidationError } from '../../src/model/RBValidationError';
import { Services as EmailServices } from '../../src/services/EmailService';
import { Services as UserServices } from '../../src/services/UsersService';
import { Services as TriggerServices } from '../../src/services/TriggerService';
import { Services as RecordsServices } from '../../src/services/RecordsService';
import { Services as SolrServices } from '../../src/services/SolrSearchService';
import { RequestChronicleHelper, RequestChronicleOptions } from '../../src/utilities/RequestChronicle';
import { currentRequestChronicle, runWithRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { createSinonStubLogger } from '../logger.test';

class TestService extends Services.Core.Service {
  public record(
    info: Record<string, unknown>,
    errors: unknown[] = [],
    level: 'debug' | 'info' | 'warn' = 'debug'
  ): void {
    this.updateChronicle(info, errors, level);
  }
}

class TestUsers extends UserServices.Users {
  public verify(...args: Parameters<TestUsers['openIdConnectAuthVerifyCallback']>): void {
    this.openIdConnectAuthVerifyCallback(...args);
  }

  public initAaf(): void {
    this.aafAuthInit();
  }
}

class TestController extends Controllers.Core.Controller {
  public record(req: Sails.Req, error: unknown): void {
    this.updateChronicle(req, { userLoginSuccess: !error }, error ? [error] : []);
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

  function helper(id: string, options: RequestChronicleOptions = {}): RequestChronicleHelper {
    const item = RequestChronicleHelper.fromReq(logger, { options: {} } as Sails.Req, {
      generateRequestId: () => id,
      ...options,
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

  for (const testCase of [
    { statusCode: 200, completed: true, classification: 'warning', severity: 'warn', outcome: 'success' },
    { statusCode: 404, completed: true, classification: 'client-error', severity: 'warn', outcome: 'failure' },
    { statusCode: 500, completed: true, classification: 'error', severity: 'error', outcome: 'failure' },
    { statusCode: 200, completed: false, classification: 'aborted', severity: 'warn', outcome: 'aborted' },
  ] as const) {
    it(`retains a service warning with sampling disabled for a ${testCase.statusCode} ${testCase.outcome} response`, () => {
      const item = helper('warning', { settings: { successSampleRate: 0 } });
      item.updateReq({ method: 'GET', path: '/excluded.css' } as Sails.Req);
      runWithRequestChronicle(item, () => service.record({ solrJobExecution: 'inline' }, [], 'warn'));
      item.finish({ statusCode: testCase.statusCode, headersSent: true, writableFinished: testCase.completed });
      item.log();
      assert.equal(item.data.result?.classification, testCase.classification);
      assert.equal(item.data.result?.severity, testCase.severity);
      assert.equal(item.data.result?.outcome, testCase.outcome);
      assert.equal(item.data.solrJobExecution, 'inline');
      sinon.assert.calledOnce(logger[testCase.severity]);
      sinon.assert.notCalled(logger.debug);
    });
  }

  it('logs late service warnings at warn with the request ID', () => {
    const item = helper('late-warning', { settings: { successSampleRate: 0 } });
    item.finish();
    item.log();
    runWithRequestChronicle(item, () => service.record({ solrJobExecution: 'inline' }, [], 'warn'));
    sinon.assert.calledOnceWithMatch(logger.warn, { requestId: 'late-warning', info: { solrJobExecution: 'inline' } });
    sinon.assert.notCalled(logger.debug);
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
    sinon.assert.calledWithMatch(logger.error, { requestId: 'first', info: { serviceOutcome: 'failed' } });
    sinon.assert.notCalled(logger.debug);
  });

  it('preserves sanitized summaries through the namespace logger without HTTP context', () => {
    service.record({ serviceOid: 'oid', password: 'private' });
    sinon.assert.calledOnceWithMatch(logger.debug, { info: { serviceOid: 'oid', password: 'REDACTED' } });
    sinon.assert.notCalled(logger.error);
  });

  it('preserves sanitized namespace logging without HTTP context', () => {
    service.record({ serviceOid: 'oid', password: 'private', text: 'x'.repeat(10_000) }, [
      new Error('Bearer private-key'),
    ]);
    sinon.assert.notCalled(logger.debug);
    sinon.assert.calledOnce(logger.error);
    sinon.assert.calledWithMatch(logger.error, { info: { serviceOid: 'oid' } });
    const output = JSON.stringify(logger.error.firstCall.args);
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

  for (const late of [false, true]) {
    it(`retains ${late ? 'late' : 'background'} errors when sanitizing details fails`, () => {
      const item = late ? helper('hostile-late') : undefined;
      item?.finish();
      runWithRequestChronicle(item, () =>
        service.record(
          {
            get serviceValue() {
              throw new Error('getter failed');
            },
          },
          [new Error('operation failed')]
        )
      );
      sinon.assert.calledOnceWithMatch(logger.error, { error: { message: 'operation failed' } });
    });
  }

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
    assert.equal(item.data.errors, undefined);
    item.finish({ statusCode: 200, headersSent: true, writableFinished: true });
    assert.equal(item.data.result?.classification, 'warning');
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

  it('keeps a null synchronous hook list as a no-op and records a zero count', async () => {
    const trigger = new TriggerServices.Trigger();
    const item = helper('null-hooks');
    const record = { metadata: { title: 'PRIVATE TITLE' } };
    const result = await runWithRequestChronicle(item, () =>
      firstValueFrom(trigger.runHooksSync('oid', record, { hooks: null }, {}))
    );
    assert.equal(result, record);
    assert.equal(item.data.triggerHookCount, 0);
    assert.equal(item.data.errors, undefined);
  });

  it('keeps a null related-record template list unchanged and records a zero count', async () => {
    const names = ['RecordsService', 'BrandingService'];
    const originals = names.map(name => Reflect.get(globalThis, name));
    const record = { metaMetadata: { brandId: 'brand-1' }, metadata: { title: 'PRIVATE TITLE' } };
    const update = sinon.stub().resolves({ wasPersisted: () => true });
    Reflect.set(globalThis, 'RecordsService', { getMeta: async () => record, updateMetaInternal: update });
    Reflect.set(globalThis, 'BrandingService', { getBrandById: () => ({ id: 'brand-1' }) });
    try {
      const trigger = new TriggerServices.Trigger();
      const item = helper('null-templates');
      const related = { metadata: { relatedOid: 'related-oid' } };
      const result = await runWithRequestChronicle(item, () =>
        trigger.runTemplatesOnRelatedRecord(
          'oid',
          related,
          { forceRun: true, pathToRelatedOid: 'metadata.relatedOid', templates: null },
          {}
        )
      );
      assert.equal(result, related);
      assert.deepEqual(record.metadata, { title: 'PRIVATE TITLE' });
      sinon.assert.calledOnceWithMatch(update, {
        oid: 'related-oid',
        record,
        metadata: {},
        metadataMode: 'pre-applied',
      });
      assert.equal(item.data.triggerTemplateCount, 0);
      assert.equal(item.data.errors, undefined);
    } finally {
      names.forEach((name, index) => Reflect.set(globalThis, name, originals[index]));
    }
  });

  for (const context of ['http', 'background'] as const) {
    it(`excludes related-template configuration and exception excerpts during ${context} failures`, async () => {
      const original = Reflect.get(globalThis, 'RecordsService');
      const marker = 'PRIVATE RELATED TEMPLATE CONTENT';
      const update = sinon.stub();
      Reflect.set(globalThis, 'RecordsService', {
        getMeta: async () => ({ metaMetadata: { brandId: 'brand' }, metadata: {} }),
        updateMetaInternal: update,
      });
      try {
        const trigger = new TriggerServices.Trigger();
        const item = context === 'http' ? helper('related-template-failure') : undefined;
        await assert.rejects(
          runWithRequestChronicle(item, () =>
            trigger.runTemplatesOnRelatedRecord(
              'source-oid',
              { metadata: { relatedOid: 'target-oid' } },
              {
                forceRun: true,
                pathToRelatedOid: 'metadata.relatedOid',
                parseObject: true,
                templates: [{ field: 'metadata.copy', privateConfig: marker, template: () => marker }],
              },
              {}
            )
          ),
          error => {
            assert.ok(error instanceof RBValidationError);
            item?.addError(error);
            assert.ok(
              !inspect(error, { depth: null }).includes(marker),
              'Propagated template failures must exclude private config and parser excerpts'
            );
            return true;
          }
        );
        sinon.assert.notCalled(update);
        const output = inspect([item?.data, logger.error.getCalls().map(call => call.args)], { depth: null });
        assert.ok(!output.includes(marker));
        if (item) assert.equal(item.data.errors?.length, 1);
        else sinon.assert.calledOnceWithMatch(logger.error, { info: { triggerRelatedRecordOid: 'target-oid' } });
      } finally {
        Reflect.set(globalThis, 'RecordsService', original);
      }
    });
  }

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
      sinon.assert.calledWithMatch(logger.error, {
        requestId: 'detached-user-hook',
        info: { usersOperation: 'triggerPostSaveTriggers', usersOutcome: 'failed' },
      });
      sinon.assert.notCalled(logger.debug);
      assert.ok(!JSON.stringify(item.data).includes('PRIVATE'));
    } finally {
      Reflect.set(globalThis, 'chronicleUserHook', originalHook);
    }
  });

  describe('Passport callback capture', () => {
    const globalNames = ['BrandingService', 'RolesService', 'User', 'ConfigService'];
    let originals: unknown[];
    let users: TestUsers;
    const oidcConfig = { claimMappings: { username: 'sub' } };

    beforeEach(() => {
      originals = globalNames.map(name => Reflect.get(globalThis, name));
      Reflect.set(globalThis, 'BrandingService', {
        getDefault: () => ({ name: 'default' }),
        getBrand: () => ({ name: 'default', roles: [] }),
        getBrandNameFromReq: () => 'default',
      });
      Reflect.set(globalThis, 'RolesService', {
        getDefAuthenticatedRole: () => ({ name: 'Researcher' }),
        getNestedRoles: () => [],
      });
      users = new TestUsers();
    });

    afterEach(() => {
      globalNames.forEach((name, index) => Reflect.set(globalThis, name, originals[index]));
    });

    it('preserves a missing-username outcome and the original rejection callback arguments', () => {
      const item = helper('oidc-missing-username');
      const done = sinon.spy();
      runWithRequestChronicle(item, () => users.verify(oidcConfig, {}, {}, {}, {}, done));
      assert.equal(item.data.usersAuthOutcome, 'missing-username');
      assert.equal(item.data.errors?.length, 1);
      sinon.assert.calledOnceWithExactly(done, null, null, { message: 'Rejected as username does not have a value' });
    });

    for (const withPreSaveHook of [false, true]) {
      it(`records a user-not-found string once ${withPreSaveHook ? 'with' : 'without'} a pre-save hook`, async () => {
        Reflect.set(globalThis, 'User', {
          findOne: (_criteria: unknown, callback: (error: unknown, user: unknown) => void) =>
            callback(null, { id: 'user-1', username: 'test' }),
          update: () => ({
            set: () => ({ exec: (callback: (error: unknown, user: unknown) => void) => callback(null, []) }),
          }),
        });
        const config = withPreSaveHook
          ? {
              ...oidcConfig,
              hooks: { onUpdate: { pre: [{ function: '(user) => Promise.resolve(user)', options: {} }] } },
            }
          : oidcConfig;
        const item = helper('oidc-user-not-found');
        const req = { options: { requestChronicleHelper: item } } as Sails.Req;
        const controller = new TestController();
        const args = await runWithRequestChronicle(
          item,
          () =>
            new Promise<unknown[]>(resolve => {
              users.verify(
                config,
                {},
                req as unknown as Record<string, unknown>,
                {},
                { sub: 'test' },
                (...callbackArgs) => {
                  controller.record(req, callbackArgs[0]);
                  resolve(callbackArgs);
                }
              );
            })
        );
        assert.deepEqual(args, ['No user found', false, undefined]);
        assert.equal(item.data.usersAuthOutcome, 'failure');
        assert.deepEqual(item.data.errors, [{ message: 'No user found' }]);
      });
    }

    type VerifyCallback = (
      req: Sails.Req,
      claims: Record<string, unknown>,
      done: (error: unknown, user?: unknown, info?: unknown) => void
    ) => void;

    async function aafVerifier(config: Record<string, unknown>): Promise<VerifyCallback> {
      let ready: () => Promise<void> = async () => {};
      let verify: VerifyCallback | undefined;
      Reflect.set(globalThis, 'ConfigService', {
        getBrand: () => ({
          active: ['aaf'],
          aaf: { ...config, opts: { secretOrKey: 'test-only-key' }, attributesField: 'attributes' },
        }),
      });
      Reflect.set(globalThis, 'sails', {
        log: logger,
        config: {
          log: { requestChronicle: { successSampleRate: 0 } },
          brandingAware: () => ({ authorizedDomainsEmails: { enabled: true, domainsAaf: ['allowed.edu'] } }),
          passport: {
            use: (_name: string, strategy: { _verify: VerifyCallback }) => {
              verify = strategy._verify;
            },
          },
        },
        on: (_event: string, handler: () => Promise<void>) => {
          ready = handler;
        },
      });
      users.initAaf();
      await ready();
      assert.ok(verify, 'AAF strategy registered a verify callback');
      return verify;
    }

    for (const withPreSaveHook of [false, true]) {
      it(`records an AAF user-not-found string once through the controller ${withPreSaveHook ? 'with' : 'without'} a pre-save hook`, async () => {
        Reflect.set(globalThis, 'User', {
          findOne: (_criteria: unknown, callback: (error: unknown, user: unknown) => void) =>
            callback(null, { id: 'user-1', username: 'test' }),
          update: () => ({
            set: () => ({ exec: (callback: (error: unknown, user: unknown) => void) => callback(null, []) }),
          }),
        });
        const config = withPreSaveHook
          ? { hooks: { onUpdate: { pre: [{ function: '(user) => Promise.resolve(user)', options: {} }] } } }
          : {};
        const verify = await aafVerifier(config);
        const item = helper('aaf-user-not-found');
        const req = { options: { requestChronicleHelper: item } } as Sails.Req;
        const controller = new TestController();
        const args = await runWithRequestChronicle(
          item,
          () =>
            new Promise<unknown[]>(resolve => {
              verify(req, { sub: 'test', attributes: {} }, (...callbackArgs) => {
                controller.record(req, callbackArgs[0]);
                resolve(callbackArgs);
              });
            })
        );
        assert.deepEqual(args, ['No user found', false, { message: 'No user found' }]);
        assert.deepEqual(item.data.errors, [{ message: 'No user found' }]);
      });
    }

    for (const provider of ['oidc', 'aaf'] as const) {
      for (const rejection of [
        { email: '', outcome: 'missing-email' },
        { email: 'invalid', outcome: 'invalid-address' },
        { email: 'private@other.edu', outcome: 'denied' },
      ]) {
        it(`records one ${provider} ${rejection.outcome} rejection through the controller`, async () => {
          Reflect.set(globalThis, 'User', {
            findOne: (_criteria: unknown, callback: (error: unknown, user: unknown) => void) => callback(null, null),
          });
          Reflect.set(globalThis, 'sails', {
            log: logger,
            config: {
              brandingAware: () => ({ authorizedDomainsEmails: { enabled: true, domainsOidc: ['allowed.edu'] } }),
            },
          });
          const verify = provider === 'aaf' ? await aafVerifier({}) : undefined;
          const item = helper(`${provider}-${rejection.outcome}`);
          const req = { options: { requestChronicleHelper: item } } as Sails.Req;
          const controller = new TestController();
          const args = await runWithRequestChronicle(
            item,
            () =>
              new Promise<unknown[]>(resolve => {
                const done = (...callbackArgs: unknown[]) => {
                  controller.record(req, callbackArgs[0]);
                  resolve(callbackArgs);
                };
                if (verify) {
                  verify(req, { sub: 'test', attributes: { mail: rejection.email } }, done);
                } else {
                  users.verify(
                    { claimMappings: { username: 'sub', email: 'email' } },
                    {},
                    req as unknown as Record<string, unknown>,
                    {},
                    { sub: 'test', email: rejection.email },
                    done
                  );
                }
              })
          );
          assert.deepEqual(args.slice(0, 2), ['authorized-email-denied', false]);
          assert.equal(item.data.usersEmailAccessOutcome, rejection.outcome);
          assert.deepEqual(item.data.errors, [{ message: 'authorized-email-denied' }]);
          assert.ok(!JSON.stringify(item.data).includes('private@other.edu'));
        });
      }
    }
  });
});
