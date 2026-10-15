import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import * as sinon from 'sinon';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { QueueService } from '../../src/QueueService';
import { Services } from '../../src/services/RDMPService';
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';
import { runWithRequestChronicle } from '../../src/utilities/RequestChronicleContext';
import { createSinonStubLogger } from '../logger.test';

class TestRDMP extends Services.RDMPS {
  public useQueue(queue: QueueService): void {
    this.queueService = queue;
  }
}

describe('RDMP logging privacy', () => {
  let logger: ReturnType<typeof createSinonStubLogger>;
  let service: TestRDMP;
  const globals = new Map<string, unknown>();
  const description = 'PRIVATE-RDMP-DESCRIPTION';
  const tokenHash = 'PRIVATE-STORED-TOKEN-HASH';
  const email = 'private-contributor@example.test';

  beforeEach(() => {
    for (const name of ['sails', 'User', 'UsersService', 'TranslationService'])
      globals.set(name, Reflect.get(globalThis, name));
    logger = createSinonStubLogger(sinon);
    Reflect.set(globalThis, 'sails', {
      log: logger,
      config: { record: { processRecordCountersLogLevel: 'verbose', maxUploadSize: 100 } },
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({ exec: (callback: (error: null, users: unknown[]) => void) => callback(null, []) }),
    });
    Reflect.set(globalThis, 'UsersService', { getEffectiveUser: (user: unknown) => of(user) });
    Reflect.set(globalThis, 'TranslationService', { t: () => '' });
    service = new TestRDMP();
  });

  afterEach(() => {
    sinon.restore();
    for (const [name, value] of globals) Reflect.set(globalThis, name, value);
    globals.clear();
  });

  function record() {
    return {
      metaMetadata: { createdBy: 'creator', brandId: 'default' },
      metadata: { description, contributors: [{ email, name: description, token: tokenHash }] },
    };
  }

  function assertPrivateDataExcluded(helper?: RequestChronicleHelper): void {
    const calls = [logger.error, logger.warn, logger.info, logger.debug, logger.verbose, logger.log, logger.trace];
    const output = inspect([helper?.data, calls.flatMap(log => log.getCalls().map(call => call.args))], {
      depth: null,
    });
    for (const marker of [description, tokenHash, email]) {
      assert.ok(!output.includes(marker), 'RDMP logs must exclude record, user, and contributor content');
    }
  }

  for (const context of ['http', 'background'] as const) {
    function run<T>(work: () => T): { result: T; helper?: RequestChronicleHelper } {
      const helper =
        context === 'http' ? RequestChronicleHelper.fromReq(logger, { options: {} } as Sails.Req) : undefined;
      helper?.start();
      return { result: runWithRequestChronicle(helper, work), helper };
    }

    it(`excludes full records, template content, and stored token hashes during ${context} template execution`, async () => {
      const input = record();
      const { result, helper } = run(() =>
        firstValueFrom(
          service.runTemplates(
            'rdmp-oid',
            input,
            {
              templates: [{ field: 'metadata.copied', template: '<%= record.metadata.description %>' }],
            },
            { username: 'admin', token: tokenHash }
          )
        )
      );
      assert.equal(await result, input);
      assert.equal(Reflect.get(input.metadata, 'copied'), description);
      assertPrivateDataExcluded(helper);
      if (helper) {
        assert.equal(helper.data.rdmpTemplateOid, 'rdmp-oid');
        assert.equal(helper.data.rdmpTemplateCount, 1);
        assert.equal(helper.data.rdmpTemplateOutcome, 'success');
      } else {
        sinon.assert.calledWithMatch(logger.debug, { info: { rdmpTemplateCount: 1 } });
      }
    });

    it(`excludes template source and exception excerpts from ${context} template failures`, async () => {
      const { result, helper } = run(() =>
        firstValueFrom(
          service.runTemplates(
            'rdmp-oid',
            record(),
            {
              templates: [
                {
                  field: 'metadata.copy',
                  privateTemplate: description,
                  template: () => {
                    throw new Error(tokenHash);
                  },
                },
              ],
            },
            { token: tokenHash }
          )
        )
      );
      await assert.rejects(result, error => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'Failed to run one of the string templates.');
        helper?.addError(error);
        return true;
      });
      assertPrivateDataExcluded(helper);
      if (helper) {
        assert.equal(helper.data.rdmpTemplateOutcome, 'failed');
        assert.equal(helper.data.errors?.length, 1);
      } else sinon.assert.calledOnce(logger.error);
    });

    for (const method of ['assignPermissions', 'complexAssignPermissions'] as const) {
      it(`excludes record and contributor content during ${context} ${method}`, async () => {
        const input = record();
        const options = {
          editContributorProperties: ['metadata.contributors'],
          viewContributorProperties: ['metadata.contributors'],
          userProperties: ['metadata.contributors'],
          editPermissionRule: 'true',
          viewPermissionRule: 'true',
          recordCreatorPermissions: 'view&edit',
          privateOption: description,
        };
        const { result, helper } = run(() =>
          firstValueFrom(
            method === 'assignPermissions'
              ? service.assignPermissions('rdmp-oid', input, options, { username: 'admin', token: tokenHash })
              : service.complexAssignPermissions('rdmp-oid', input, options)
          )
        );
        assert.equal(await result, input);
        const authorization = Reflect.get(input, 'authorization');
        assert.deepEqual(authorization.editPending, [email]);
        assert.deepEqual(authorization.viewPending, [email]);
        assertPrivateDataExcluded(helper);
        if (helper) {
          assert.equal(helper.data.rdmpPermissionOid, 'rdmp-oid');
          assert.equal(helper.data.rdmpEditorCount, 1);
          assert.equal(helper.data.rdmpViewerCount, 1);
        }
      });
    }

    it(`excludes job payloads during ${context} trigger queueing and consumption`, async () => {
      const input = record();
      const now = sinon.stub().resolves();
      service.useQueue({ now, every: () => {}, schedule: async () => undefined });
      const user = { username: 'admin', token: tokenHash };
      const triggerConfiguration = { function: '(_oid, record) => Promise.resolve(record)', options: { description } };
      const { result, helper } = run(async () => {
        await firstValueFrom(
          service.queueTriggerCall('rdmp-oid', input, { jobName: 'test-job', triggerConfiguration }, user)
        );
        const data = { oid: 'rdmp-oid', record: input, user, triggerConfiguration };
        sinon.assert.calledOnceWithExactly(now, 'test-job', data);
        return service.queuedTriggerSubscriptionHandler({ attrs: { data } });
      });
      assert.equal(await result, input);
      assertPrivateDataExcluded(helper);
    });

    it(`excludes an invalid resolved hook value from ${context} queue warnings`, async () => {
      const input = record();
      const data = {
        oid: 'rdmp-oid',
        record: input,
        user: { token: tokenHash },
        triggerConfiguration: {
          function: `({ private: '${description}' })`,
        },
      };
      const { result, helper } = run(() => service.queuedTriggerSubscriptionHandler({ attrs: { data } }));
      assert.ok(isObservable(result));
      assert.equal(await firstValueFrom(result), input);
      assertPrivateDataExcluded(helper);
    });

    it(`excludes counter templates and generated values from ${context} diagnostics`, async () => {
      const input = record();
      const { result, helper } = run(() =>
        service.processRecordCounters(
          'rdmp-oid',
          input,
          {
            counters: [
              {
                field_name: 'number',
                strategy: 'field',
                template: description,
                add_value_to_array: 'metadata.numbers',
              },
            ],
          },
          {}
        )
      );
      assert.equal(await result, input);
      assert.equal(Reflect.get(input.metadata, 'number'), description);
      assertPrivateDataExcluded(helper);
    });

    it(`excludes attachment content from ${context} size checks`, () => {
      const input = {
        ...record(),
        metadata: { dataLocations: [{ type: 'attachment', size: 5, filename: description }] },
      };
      const { result, helper } = run(() => service.checkTotalSizeOfFilesInRecord('rdmp-oid', input, {}, {}));
      assert.equal(result, input);
      assertPrivateDataExcluded(helper);
    });

    for (const method of ['addWorkspaceToRecord', 'removeWorkspaceFromRecord'] as const) {
      it(`excludes workspace data from ${context} ${method} warnings`, async () => {
        const input = record();
        const { result, helper } = run(() => service[method]('workspace-oid', input, {}, { token: tokenHash }, {}));
        assert.equal(await result, input);
        assertPrivateDataExcluded(helper);
      });
    }
  }
});
