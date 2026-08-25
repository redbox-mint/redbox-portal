import assert from 'node:assert/strict';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { of } from 'rxjs';

import { Controllers } from '../../../src/controllers/webservice/RecordController';
import { RecordSaveResponse } from '../../../src/RecordSaveResponse';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';

type PermissionCase = {
  name: string;
  method:
    | 'addUserEdit'
    | 'addUserView'
    | 'removeUserEdit'
    | 'removeUserView'
    | 'addRoleEdit'
    | 'addRoleView'
    | 'removeRoleEdit'
    | 'removeRoleView';
  body: Record<string, unknown>;
  initialAuthorization: Record<string, string[]>;
  expectedFields: Array<[string, string[]]>;
};

function makeThrowingRequest(apiRequest: Sails.Req['apiRequest'], extra: Partial<Sails.Req> = {}): Sails.Req {
  const request = {
    session: { branding: 'default' },
    user: { username: 'tester' },
    apiRequest,
    ...extra,
  } as Record<string, unknown>;

  Object.defineProperty(request, 'body', {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error('raw req.body should not be used');
    },
  });

  return request as Sails.Req;
}

function successResult(oid = 'record-1') {
  const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000000');
  result.oid = oid;
  result.success = true;
  result.outcome = 'saved';
  return result;
}

function notSavedResult() {
  const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000099');
  result.success = false;
  result.outcome = 'not-saved';
  result.message = '@record-save-failed';
  return result;
}

function cloneAuthorization(authorization: Record<string, string[]>): Record<string, string[]> {
  return Object.keys(authorization).reduce(
    (acc, key) => {
      acc[key] = [...authorization[key]];
      return acc;
    },
    {} as Record<string, string[]>
  );
}

async function flushPromises(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
}

describe('Webservice RecordController body source', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalBrandingService: any;
  let originalRecordTypesService: any;
  let originalWorkflowStepsService: any;
  let originalHarvestRunService: any;
  let recordsService: {
    getMeta: sinon.SinonStub;
    getDeletedRecord: sinon.SinonStub;
    getDeletedRecordMeta: sinon.SinonStub;
    updateMeta: sinon.SinonStub;
    updateMetaInternal: sinon.SinonStub;
    create: sinon.SinonStub;
    getDeletedRecords: sinon.SinonStub;
    delete: sinon.SinonStub;
    restoreRecord: sinon.SinonStub;
    destroyDeletedRecord: sinon.SinonStub;
    hasEditAccess: sinon.SinonStub;
    hasViewAccess: sinon.SinonStub;
    getAttachments: sinon.SinonStub;
    setWorkflowStepRelatedMetadata: sinon.SinonStub;
  };

  before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalRecordTypesService = (global as any).RecordTypesService;
    originalWorkflowStepsService = (global as any).WorkflowStepsService;
    originalHarvestRunService = (global as any).HarvestRunService;

    (global as any).sails = {
      config: {
        appUrl: 'https://portal.example',
        record: {
          attachments: {
            file: {
              directory: '/tmp',
            },
          },
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        error: sinon.stub(),
        warn: sinon.stub(),
        info: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any)._ = require('lodash');
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandAndPortalPath: sinon.stub().returns('/default/default'),
    };
    (global as any).RecordTypesService = {
      get: sinon.stub().returns(of({ id: 'record-type-1', name: 'dataset' })),
    };
    (global as any).WorkflowStepsService = {
      get: sinon.stub(),
    };
    (global as any).HarvestRunService = {
      submitCompatibilityRecords: sinon.stub().resolves([{ harvestId: 'harvest-1', oid: 'record-1', status: true }]),
      submitLegacyRecords: sinon.stub().resolves([{ harvestId: 'legacy-harvest-1', oid: 'record-2', status: true }]),
      submitChunk: sinon.stub().resolves({
        run: { id: 'run-1', sourceRunId: 'source-run-1', status: 'running' },
        chunk: { id: 'chunk-1', contentHash: 'hash-1', status: 'processed', recordCount: 1, duplicate: false },
      }),
    };

    controller = new Controllers.Record();
    recordsService = {
      getMeta: sinon.stub(),
      getDeletedRecord: sinon.stub(),
      getDeletedRecordMeta: sinon.stub(),
      updateMeta: sinon.stub(),
      updateMetaInternal: sinon.stub(),
      create: sinon.stub(),
      getDeletedRecords: sinon.stub(),
      delete: sinon.stub(),
      restoreRecord: sinon.stub(),
      destroyDeletedRecord: sinon.stub(),
      hasEditAccess: sinon.stub().returns(true),
      hasViewAccess: sinon.stub().returns(true),
      getAttachments: sinon.stub().resolves([]),
      setWorkflowStepRelatedMetadata: sinon.stub(),
    };
    controller.RecordsService = recordsService as never;
    controller.DatastreamService = {
      addDatastreams: sinon.stub(),
    } as never;
  });

  it('restores and permanently destroys deleted records in the active brand', async () => {
    const mutationResponse = successResult();
    recordsService.getDeletedRecordMeta.resolves({ redboxOid: 'record-1', metaMetadata: { brandId: 'brand-1' } });
    recordsService.restoreRecord.resolves(mutationResponse);
    recordsService.destroyDeletedRecord.resolves(mutationResponse);
    const req = makeThrowingRequest(
      {
        params: { oid: 'record-1' },
        query: {},
        body: {},
        files: {},
      },
      {
        user: { username: 'tester', roles: [{ branding: 'brand-1' }] },
      }
    );
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.restoreRecord(req, {} as Sails.Res);
    await controller.destroyDeletedRecord(req, {} as Sails.Res);

    expect(recordsService.getDeletedRecordMeta.callCount).to.equal(2);
    expect(recordsService.getDeletedRecordMeta.firstCall.args[0]).to.equal('record-1');
    expect(recordsService.getDeletedRecordMeta.firstCall.args[1]).to.include({ id: 'brand-1' });
    expect(recordsService.restoreRecord.calledWith('record-1')).to.be.true;
    expect(recordsService.destroyDeletedRecord.calledWith('record-1')).to.be.true;
    expect(sendRespStub.callCount).to.equal(2);
  });

  it('does not mutate deleted records outside the active brand', async () => {
    recordsService.getDeletedRecords.resolves({
      isSuccessful: () => true,
      items: [],
    });
    const req = makeThrowingRequest(
      {
        params: { oid: 'other-record' },
        query: {},
        body: {},
        files: {},
      },
      {
        user: { username: 'tester', roles: [] },
      }
    );
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.restoreRecord(req, {} as Sails.Res);

    expect(recordsService.restoreRecord.called).to.be.false;
    expect(sendRespStub.firstCall.args[2].status).to.equal(404);
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).RecordTypesService = originalRecordTypesService;
    (global as any).WorkflowStepsService = originalWorkflowStepsService;
    (global as any).HarvestRunService = originalHarvestRunService;
  });

  describe('permission handlers', () => {
    const userPermissionCases: PermissionCase[] = [
      {
        name: 'addUserEdit',
        method: 'addUserEdit',
        body: { users: ['new-editor'], pendingUsers: ['queued-editor'] },
        initialAuthorization: {
          edit: ['existing-editor'],
          editPending: ['existing-editor-pending'],
          view: ['existing-view'],
          viewPending: ['existing-view-pending'],
        },
        expectedFields: [
          ['edit', ['existing-editor', 'new-editor']],
          ['editPending', ['existing-editor-pending', 'queued-editor']],
        ],
      },
      {
        name: 'addUserView',
        method: 'addUserView',
        body: { users: ['new-viewer'], pendingUsers: ['queued-viewer'] },
        initialAuthorization: {
          edit: ['existing-editor'],
          editPending: ['existing-editor-pending'],
          view: ['existing-view'],
          viewPending: ['existing-view-pending'],
        },
        expectedFields: [
          ['view', ['existing-view', 'new-viewer']],
          ['viewPending', ['existing-view-pending', 'queued-viewer']],
        ],
      },
      {
        name: 'removeUserEdit',
        method: 'removeUserEdit',
        body: { users: ['existing-editor'], pendingUsers: ['existing-editor-pending'] },
        initialAuthorization: {
          edit: ['existing-editor'],
          editPending: ['existing-editor-pending'],
          view: ['existing-view'],
          viewPending: ['existing-view-pending'],
        },
        expectedFields: [
          ['edit', []],
          ['editPending', []],
        ],
      },
      {
        name: 'removeUserView',
        method: 'removeUserView',
        body: { users: ['existing-view'], pendingUsers: ['existing-view-pending'] },
        initialAuthorization: {
          edit: ['existing-editor'],
          editPending: ['existing-editor-pending'],
          view: ['existing-view'],
          viewPending: ['existing-view-pending'],
        },
        expectedFields: [
          ['view', []],
          ['viewPending', []],
        ],
      },
    ];

    for (const testCase of userPermissionCases) {
      it(`uses req.apiRequest body in ${testCase.name}`, async () => {
        const permissionRecord = {
          redboxOid: 'record-1',
          revision: 3,
          metadata: {},
          metaMetadata: { brandId: 'brand-1' },
          authorization: cloneAuthorization(testCase.initialAuthorization),
        };
        recordsService.getMeta.resolves(permissionRecord);
        recordsService.updateMeta.resolves(successResult());
        const req = makeThrowingRequest({
          params: { oid: 'record-1' },
          query: {},
          body: testCase.body,
          files: {},
        });
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await (controller as any)[testCase.method](req, {} as Sails.Res);

        expect(recordsService.updateMeta.calledOnce).to.be.true;
        expect(recordsService.getMeta.callCount).to.equal(2);

        const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
        for (const [field, expectedValues] of testCase.expectedFields) {
          expect(updatedRecord.authorization[field]).to.deep.equal(expectedValues);
        }
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal(permissionRecord.authorization);
      });
    }

    const rolePermissionCases: PermissionCase[] = [
      {
        name: 'addRoleEdit',
        method: 'addRoleEdit',
        body: { roles: ['new-edit-role'] },
        initialAuthorization: {
          editRoles: ['existing-edit-role'],
          viewRoles: ['existing-view-role'],
        },
        expectedFields: [['editRoles', ['existing-edit-role', 'new-edit-role']]],
      },
      {
        name: 'addRoleView',
        method: 'addRoleView',
        body: { roles: ['new-view-role'] },
        initialAuthorization: {
          editRoles: ['existing-edit-role'],
          viewRoles: ['existing-view-role'],
        },
        expectedFields: [['viewRoles', ['existing-view-role', 'new-view-role']]],
      },
      {
        name: 'removeRoleEdit',
        method: 'removeRoleEdit',
        body: { roles: ['existing-edit-role'] },
        initialAuthorization: {
          editRoles: ['existing-edit-role'],
          viewRoles: ['existing-view-role'],
        },
        expectedFields: [['editRoles', []]],
      },
      {
        name: 'removeRoleView',
        method: 'removeRoleView',
        body: { roles: ['existing-view-role'] },
        initialAuthorization: {
          editRoles: ['existing-edit-role'],
          viewRoles: ['existing-view-role'],
        },
        expectedFields: [['viewRoles', []]],
      },
    ];

    for (const testCase of rolePermissionCases) {
      it(`uses req.apiRequest body in ${testCase.name}`, async () => {
        const permissionRecord = {
          redboxOid: 'record-1',
          revision: 3,
          metadata: {},
          metaMetadata: { brandId: 'brand-1' },
          authorization: cloneAuthorization(testCase.initialAuthorization),
        };
        recordsService.getMeta.resolves(permissionRecord);
        recordsService.updateMeta.resolves(successResult());
        const req = makeThrowingRequest({
          params: { oid: 'record-1' },
          query: {},
          body: testCase.body,
          files: {},
        });
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await (controller as any)[testCase.method](req, {} as Sails.Res);

        expect(recordsService.updateMeta.calledOnce).to.be.true;
        expect(recordsService.getMeta.callCount).to.equal(2);

        const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
        for (const [field, expectedValues] of testCase.expectedFields) {
          expect(updatedRecord.authorization[field]).to.deep.equal(expectedValues);
        }
        expect(sendRespStub.calledOnce).to.be.true;
        expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal(permissionRecord.authorization);
      });
    }

    it('does not disclose permissions after a successful mutation removes current view access', async function () {
      const result = successResult();
      result.setConcurrencyMetadata({ revision: 4, entityTag: formatRecordEntityTag('record-1', 4) });
      recordsService.getMeta.resolves({
        redboxOid: 'record-1',
        revision: 4,
        metadata: {},
        metaMetadata: { brandId: 'brand-1' },
        authorization: { view: ['another-user'], edit: ['another-user'] },
      });
      recordsService.hasViewAccess.returns(false);
      const req = makeThrowingRequest(
        { params: { oid: 'record-1' }, query: {}, body: {}, files: {} },
        { user: { username: 'tester', roles: [] } }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await (controller as any).sendPermissionMutationResult(
        req,
        {} as Sails.Res,
        { id: 'brand-1', name: 'default' },
        'record-1',
        result
      );

      expect(sendRespStub.firstCall.args[2]).to.deep.include({
        data: null,
        v1: null,
        headers: { ETag: formatRecordEntityTag('record-1', 4) },
      });
    });

    it('preserves the literal v1 error body for all permission mutation failures', async function () {
      const cases = [...userPermissionCases, ...rolePermissionCases];
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      for (const testCase of cases) {
        recordsService.getMeta.resetHistory();
        recordsService.updateMeta.resetHistory();
        sendRespStub.resetHistory();
        recordsService.getMeta.resolves({
          redboxOid: 'record-1',
          revision: 3,
          metadata: {},
          metaMetadata: { brandId: 'brand-1' },
          authorization: cloneAuthorization(testCase.initialAuthorization),
        });
        recordsService.updateMeta.resolves(notSavedResult());
        const req = makeThrowingRequest(
          {
            params: { oid: 'record-1' },
            query: {},
            body: testCase.body,
            files: {},
          },
          {
            headers: { 'x-redbox-api-version': '1.0' },
          }
        );

        await (controller as any)[testCase.method](req, {} as Sails.Res);

        const envelope = sendRespStub.firstCall.args[2];
        expect(envelope.status, testCase.name).to.equal(500);
        expect(envelope.displayErrors, testCase.name).to.equal(undefined);
        expect(envelope.meta, testCase.name).to.equal(undefined);
        expect(envelope.v1, testCase.name).to.deep.equal({
          message: 'Failed to update record with oid record-1.',
        });
      }
    });
  });

  describe('metadata handlers', () => {
    it('characterizes merge=false as complete metadata replacement', async () => {
      const body = {
        title: 'Replacement',
        nested: { incoming: true },
        values: [{ id: 'incoming' }],
      };
      const record = {
        metadata: {
          title: 'Stored',
          retained: 'not retained',
          nested: { stored: true },
          values: [{ id: 'stored' }],
        },
        metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
      };
      recordsService.getMeta.resolves(record);
      recordsService.updateMeta.resolves(successResult());
      const req = makeThrowingRequest({
        params: { oid: 'record-1' },
        query: { merge: false },
        body,
        files: {},
      });
      sinon.stub(controller as any, 'sendResp');

      await controller.updateMeta(req, {} as Sails.Res);

      const submission = recordsService.updateMeta.firstCall.args[7];
      expect(submission).to.deep.include({ mode: 'replace' });
      expect(submission.metadata).to.equal(body);
      expect(submission.metadata).not.to.have.property('retained');
      expect(record.metadata).to.deep.equal({
        title: 'Stored',
        retained: 'not retained',
        nested: { stored: true },
        values: [{ id: 'stored' }],
      });
    });

    it('characterizes merge=true as recursive object merge with array concatenation', async () => {
      const body = {
        title: 'Merged',
        merge: 'ordinary metadata field',
        nested: {
          overwritten: 'incoming',
          incomingOnly: true,
          values: [{ id: 'nested-incoming' }],
        },
        values: [{ id: 'incoming' }],
      };
      const record = {
        metadata: {
          title: 'Stored',
          retained: 'keep',
          nested: {
            overwritten: 'stored',
            retained: true,
            values: [{ id: 'nested-stored' }],
          },
          values: [{ id: 'stored' }],
        },
        metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
      };
      recordsService.getMeta.resolves(record);
      recordsService.updateMeta.resolves(successResult());
      const req = makeThrowingRequest({
        params: { oid: 'record-1' },
        query: { merge: true },
        body,
        files: {},
      });
      sinon.stub(controller as any, 'sendResp');

      await controller.updateMeta(req, {} as Sails.Res);

      const submission = recordsService.updateMeta.firstCall.args[7];
      expect(submission).to.deep.include({ mode: 'merge' });
      expect(submission.metadata).to.equal(body);
      expect(submission.metadata).to.deep.equal(body);
      expect(record.metadata.values).to.deep.equal([{ id: 'stored' }]);
      expect(body.values).to.deep.equal([{ id: 'incoming' }]);
    });

    it('passes req.apiRequest metadata separately so attachment diffs use the persisted baseline', async () => {
      const body = {
        title: 'Validated title',
        tags: ['incoming'],
        nested: { value: 2 },
        enabledValidationGroups: ['client-selected-group'],
      };
      const record = {
        redboxOid: 'record-1',
        revision: 5,
        metadata: {
          title: 'Existing title',
          tags: ['existing'],
          nested: { value: 1 },
        },
        metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
      };
      recordsService.getMeta.resolves(record);
      recordsService.updateMeta.resolves(successResult());
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1' },
          query: { merge: true, datastreams: true, operation: ' submit ' },
          body,
          files: {},
        },
        {
          headers: { 'if-match': formatRecordEntityTag('record-1', 5) },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.updateMeta(req, {} as Sails.Res);

      expect(recordsService.updateMeta.calledOnce).to.be.true;
      const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
      const submission = recordsService.updateMeta.firstCall.args[7] as any;
      const updatedMetadata = submission.metadata;
      expect(updatedRecord.metadata.tags).to.deep.equal(['existing']);
      expect(updatedMetadata).to.equal(body);
      expect(updatedMetadata.tags).to.deep.equal(['incoming']);
      expect(updatedMetadata.nested.value).to.equal(2);
      expect(submission.mode).to.equal('merge');
      const context = recordsService.updateMeta.firstCall.args[8] as any;
      expect(context.operation).to.equal('update');
      expect(context.validationOperation).to.equal('submit');
      expect(context.concurrency).to.deep.equal({ entityTagSupplied: true, expectedRevision: 5 });
      expect(context).not.to.have.property('enabledValidationGroups');
      expect(sendRespStub.calledOnce).to.be.true;
    });

    it('rejects malformed, weak, list, and wildcard API tags in v1 and v2 before merge work', async () => {
      const sendRespStub = sinon.stub(controller as any, 'sendResp');
      const entityTag = formatRecordEntityTag('record-1', 5);
      const invalidTags = [`W/${entityTag}`, '*', `${entityTag}, ${entityTag}`, entityTag.slice(1, -1)];

      for (const apiVersion of ['1.0', '2.0']) {
        for (const ifMatch of invalidTags) {
          sendRespStub.resetHistory();
          const req = makeThrowingRequest(
            {
              params: { oid: 'record-1' },
              query: { merge: true },
              body: { title: 'Rejected' },
              files: {},
            },
            {
              headers: { 'x-redbox-api-version': apiVersion, 'if-match': ifMatch },
            }
          );
          await controller.updateMeta(req, {} as Sails.Res);
          const envelope = sendRespStub.firstCall.args[2];
          expect(envelope.status).to.equal(400);
          if (apiVersion === '1.0') {
            expect(envelope).to.deep.equal({
              status: 400,
              v1: { message: 'Invalid record concurrency request.' },
            });
          } else {
            expect(envelope).to.deep.equal({
              status: 400,
              displayErrors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
            });
          }
        }
      }

      expect(recordsService.getMeta.notCalled).to.equal(true);
      expect(recordsService.updateMeta.notCalled).to.equal(true);
    });

    for (const mode of ['last-write-wins', 'observe'] as const) {
      it(`keeps tokenless ${mode} API updates compatible while returning the final tag`, async () => {
        const record = {
          redboxOid: 'record-1',
          revision: 5,
          metadata: { title: 'Current' },
          metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
        };
        const result = successResult('record-1');
        result.setConcurrencyMetadata({
          mode,
          revision: 6,
          currentRevision: 6,
          entityTag: formatRecordEntityTag('record-1', 6),
        });
        recordsService.getMeta.resolves(record);
        recordsService.updateMeta.resolves(result);
        const req = makeThrowingRequest(
          {
            params: { oid: 'record-1' },
            query: {},
            body: { title: 'Updated' },
            files: {},
          },
          {
            headers: { 'x-redbox-api-version': '2.0' },
          }
        );
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.updateMeta(req, {} as Sails.Res);

        expect(recordsService.updateMeta.firstCall.args[8].concurrency).to.deep.equal({
          entityTagSupplied: false,
        });
        expect(sendRespStub.firstCall.args[2].headers).to.deep.equal({
          ETag: formatRecordEntityTag('record-1', 6),
        });
        expect(sendRespStub.firstCall.args[2].meta.concurrency.mode).to.equal(mode);
      });
    }

    for (const apiVersion of ['1.0', '2.0']) {
      it(`preserves strict 428 status with the ${apiVersion} API contract`, async () => {
        const record = {
          redboxOid: 'record-1',
          revision: 5,
          metadata: { title: 'Current' },
          metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
          authorization: { view: ['tester'], edit: ['tester'] },
        };
        const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000021');
        result.outcome = 'not-saved';
        result.problems = [
          {
            kind: 'conflict',
            phase: 'pre-save',
            issues: [{ code: 'record-precondition-required', message: '@record-precondition-required' }],
          },
        ];
        result.setConcurrencyMetadata({
          mode: 'strict',
          revision: 5,
          currentRevision: 5,
          entityTag: formatRecordEntityTag('record-1', 5),
        });
        recordsService.getMeta.resolves(record);
        recordsService.updateMeta.resolves(result);
        const req = makeThrowingRequest(
          {
            params: { oid: 'record-1' },
            query: {},
            body: { title: 'Rejected' },
            files: {},
          },
          {
            headers: { 'x-redbox-api-version': apiVersion },
          }
        );
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.updateMeta(req, {} as Sails.Res);

        const envelope = sendRespStub.firstCall.args[2];
        expect(envelope.status).to.equal(428);
        expect(envelope.headers).to.deep.equal({ ETag: formatRecordEntityTag('record-1', 5) });
        if (apiVersion === '1.0') {
          expect(envelope.v1).to.deep.equal({ message: 'Update Metadata failed' });
          expect(envelope.meta).to.equal(undefined);
        } else {
          expect(envelope.meta.outcome).to.equal('not-saved');
          expect(envelope.displayErrors).to.deep.equal([
            { code: 'record-precondition-required', title: '@record-precondition-required' },
          ]);
        }
      });
    }

    it('returns a typed 412 with the latest safe v2 projection for a stale API tag', async () => {
      const record = {
        redboxOid: 'record-1',
        revision: 6,
        metadata: { title: 'Latest' },
        metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
        authorization: { view: ['tester'], edit: ['tester'] },
      };
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000024');
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: 'conflict',
          phase: 'pre-save',
          issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
        },
      ];
      result.setConcurrencyMetadata({ revision: 6, entityTag: formatRecordEntityTag('record-1', 6) });
      recordsService.getMeta.resolves(record);
      recordsService.hasViewAccess.returns(true);
      recordsService.updateMeta.resolves(result);
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1' },
          query: {},
          body: { title: 'Rejected' },
          files: {},
        },
        {
          headers: {
            'x-redbox-api-version': '2.0',
            'if-match': formatRecordEntityTag('record-1', 5),
          },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.updateMeta(req, {} as Sails.Res);

      const envelope = sendRespStub.firstCall.args[2];
      expect(envelope.status).to.equal(412);
      expect(envelope.meta.metadata).to.deep.equal({ title: 'Latest' });
      expect(envelope.headers).to.deep.equal({ ETag: formatRecordEntityTag('record-1', 6) });
    });

    it('replaces a stale conflict with a non-disclosing 403 after view access is lost', async () => {
      const record = {
        redboxOid: 'record-1',
        revision: 6,
        metadata: { privateValue: 'must-not-return' },
        metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
        authorization: {},
      };
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000022');
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: 'conflict',
          phase: 'persistence',
          issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
        },
      ];
      result.setProjectedMetadata({ submitted: 'must-not-return' });
      result.setConcurrencyMetadata({ revision: 6, entityTag: formatRecordEntityTag('record-1', 6) });
      recordsService.getMeta.resolves(record);
      recordsService.hasViewAccess.returns(false);
      recordsService.updateMeta.resolves(result);
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1' },
          query: {},
          body: { title: 'Rejected' },
          files: {},
        },
        {
          headers: {
            'x-redbox-api-version': '2.0',
            'if-match': formatRecordEntityTag('record-1', 5),
          },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.updateMeta(req, {} as Sails.Res);

      expect(sendRespStub.firstCall.args[2]).to.deep.equal({
        status: 403,
        displayErrors: [{ code: 'not-authorised' }],
      });
      expect(result.metadata).to.equal(null);
      expect(result.concurrency).to.equal(undefined);
    });

    it('returns a private API lifecycle conflict when tombstone view permission was revoked', async () => {
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000025');
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: 'conflict',
          phase: 'persistence',
          issues: [{ code: 'record-lifecycle-operation-conflict', message: '@record-lifecycle-operation-conflict' }],
        },
      ];
      result.setProjectedMetadata({ staleDeletedValue: 'must-not-return' });
      result.setConcurrencyMetadata({ revision: 7, entityTag: formatRecordEntityTag('record-1', 7) });
      recordsService.getMeta.resolves(null);
      recordsService.getDeletedRecordMeta.resolves({
        redboxOid: 'record-1',
        revision: 13,
        metaMetadata: { brandId: 'brand-1' },
        metadata: { deletedSecret: 'must-not-return' },
      });
      recordsService.hasViewAccess.returns(false);
      const sendResp = sinon.stub(controller as any, 'sendResp');

      await (controller as any).sendLifecycleResult(
        { user: { username: 'tester' }, headers: { 'x-redbox-api-version': '2.0' } },
        {},
        { id: 'brand-1' },
        'record-1',
        result,
        'Lifecycle conflict'
      );

      expect(sendResp.firstCall.args[2]).to.deep.equal({
        status: 403,
        displayErrors: [{ code: 'not-authorised' }],
      });
      expect(result.metadata).to.equal(null);
      expect(result.concurrency).to.equal(undefined);
    });

    it('returns only the latest authorized projection when edit access is lost but view remains', async () => {
      const record = {
        redboxOid: 'record-1',
        revision: 6,
        metadata: { title: 'Latest authorized value' },
        metaMetadata: { attachmentFields: [], brandId: 'brand-1' },
        authorization: { view: ['tester'], edit: [] },
      };
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000023');
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: 'authorization',
          phase: 'persistence',
          issues: [{ code: 'record-edit-unauthorized', message: '@not-authorised' }],
        },
      ];
      result.setProjectedMetadata({ submitted: 'must-not-return' });
      recordsService.getMeta.resolves(record);
      recordsService.hasViewAccess.returns(true);
      recordsService.updateMeta.resolves(result);
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1' },
          query: {},
          body: { title: 'Rejected' },
          files: {},
        },
        {
          headers: {
            'x-redbox-api-version': '2.0',
            'if-match': formatRecordEntityTag('record-1', 5),
          },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.updateMeta(req, {} as Sails.Res);

      const envelope = sendRespStub.firstCall.args[2];
      expect(envelope.status).to.equal(403);
      expect(envelope.meta.metadata).to.deep.equal({ title: 'Latest authorized value' });
      expect(envelope.meta.concurrency).to.deep.include({
        revision: 6,
        entityTag: formatRecordEntityTag('record-1', 6),
      });
      expect(JSON.stringify(envelope)).not.to.include('must-not-return');
    });

    for (const apiVersion of ['1.0', '2.0']) {
      it(`returns the ${apiVersion} failure status and envelope for a confirmed non-save`, async () => {
        const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000001');
        result.outcome = 'not-saved';
        result.success = false;
        result.message = '@dmpt-form-save-error';
        result.problems = [
          {
            kind: 'validation',
            phase: 'pre-save',
            issues: [{ message: '@dmpt-form-save-error', code: 'validation-failed' }],
          },
        ];
        recordsService.getMeta.resolves({ metadata: {}, metaMetadata: { attachmentFields: [], brandId: 'brand-1' } });
        recordsService.updateMeta.resolves(result);
        const req = makeThrowingRequest(
          {
            params: { oid: 'record-1' },
            query: { merge: false, datastreams: false },
            body: { title: 'Rejected' },
            files: {},
          },
          {
            headers: { 'x-redbox-api-version': apiVersion },
          }
        );
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.updateMeta(req, {} as Sails.Res);

        const envelope = sendRespStub.firstCall.args[2];
        expect(envelope.status).to.equal(apiVersion === '2.0' ? 400 : 500);
        if (apiVersion === '1.0') {
          expect(envelope.displayErrors).to.equal(undefined);
          expect(envelope.meta).to.equal(undefined);
          expect(envelope.v1).to.deep.equal({ message: 'Update Metadata failed' });
        } else {
          expect(envelope.meta.outcome).to.equal('not-saved');
          expect(envelope.v1).to.equal(undefined);
          expect(envelope.displayErrors).to.deep.equal([{ code: 'validation-failed', title: '@dmpt-form-save-error' }]);
        }
      });
    }

    it('uses req.apiRequest body in updateObjectMeta', async () => {
      const body = {
        kind: 'object-meta',
        source: 'validated',
      };
      const record = {
        metaMetadata: { kind: 'original', brandId: 'brand-1' },
      };
      recordsService.getMeta.resolves(record);
      recordsService.updateMeta.resolves(successResult());
      const req = makeThrowingRequest({
        params: { oid: 'record-1' },
        query: {},
        body,
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.updateObjectMeta(req, {} as Sails.Res);

      expect(recordsService.updateMeta.calledOnce).to.be.true;
      const updatedRecord = recordsService.updateMeta.firstCall.args[2] as any;
      expect(updatedRecord.metaMetadata).to.deep.equal(body);
      expect(sendRespStub.calledOnce).to.be.true;
    });

    it('preserves the literal v1 error body for an object-metadata failure', async () => {
      recordsService.getMeta.resolves({
        redboxOid: 'record-1',
        metadata: {},
        metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      });
      recordsService.updateMeta.resolves(notSavedResult());
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1' },
          query: {},
          body: { type: 'dataset' },
          files: {},
        },
        {
          headers: { 'x-redbox-api-version': '1.0' },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.updateObjectMeta(req, {} as Sails.Res);

      const envelope = sendRespStub.firstCall.args[2];
      expect(envelope.status).to.equal(500);
      expect(envelope.displayErrors).to.equal(undefined);
      expect(envelope.meta).to.equal(undefined);
      expect(envelope.v1).to.deep.equal({ message: 'Update Object Metadata failed' });
    });

    it('uses req.apiRequest body in create', async () => {
      const body = {
        validationBypass: { mode: 'bypass' },
        schemaOperation: 'forged-operation',
        ifMatch: `"sha256:${'b'.repeat(64)}"`,
        schemaOutcome: { digest: 'b'.repeat(64) },
        authorization: {
          edit: ['creator'],
          view: ['reader'],
          editPending: [],
          viewPending: [],
        },
        metadata: {
          title: 'Validated record',
          enabledValidationGroups: ['client-selected-group'],
        },
      };
      recordsService.create.resolves(successResult('created-record'));
      const req = makeThrowingRequest({
        params: { recordType: 'dataset' },
        query: { operation: 'publish' },
        body,
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.create(req, {} as Sails.Res);
      await flushPromises();

      expect(recordsService.create.calledOnce).to.be.true;
      const createRequest = recordsService.create.firstCall.args[1] as any;
      expect(createRequest.metadata).to.deep.equal(body.metadata);
      expect(createRequest.authorization).to.deep.equal(body.authorization);
      expect(createRequest).not.to.have.property('validationBypass');
      expect(createRequest).not.to.have.property('schemaOutcome');
      const context = recordsService.create.firstCall.args[7] as any;
      expect(context.operation).to.equal('create');
      expect(context.validationOperation).to.equal('publish');
      expect(context.schemaOperation).to.equal('publish');
      expect(context.ifMatch).to.equal(undefined);
      expect(context).not.to.have.property('schemaOutcome');
      expect(context.validationBypass).to.equal(undefined);
      expect(context).not.to.have.property('enabledValidationGroups');
      expect(sendRespStub.calledOnce).to.be.true;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(201);
      expect(sendRespStub.firstCall.args[2]?.headers?.Location).to.equal(
        'https://portal.example/default/default/api/records/metadata/created-record'
      );
    });

    it('preserves targeted-create intent when the requested workflow step has not resolved yet', async () => {
      recordsService.create.resolves(notSavedResult());
      const req = makeThrowingRequest({
        params: { recordType: 'dataset' },
        query: {},
        body: {
          workflowStage: 'missing-step',
          metadata: { title: 'Target must resolve at the service boundary' },
        },
        files: {},
      });
      sinon.stub(controller as any, 'sendResp');

      await controller.create(req, {} as Sails.Res);
      await flushPromises();

      expect(recordsService.create.calledOnce).to.equal(true);
      expect(recordsService.create.firstCall.args[6]).to.equal('missing-step');
      expect(recordsService.create.firstCall.args[7]).to.include({
        routeFamily: 'api',
        operation: 'transition',
        targetStep: 'missing-step',
      });
    });

    it('keeps omitted operations optional on create and update', async () => {
      recordsService.create.resolves(successResult('created-record'));
      const createReq = makeThrowingRequest({
        params: { recordType: 'dataset' },
        query: {},
        body: { metadata: { title: 'Created' } },
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.create(createReq, {} as Sails.Res);
      await flushPromises();

      expect((recordsService.create.firstCall.args[7] as any).validationOperation).to.equal(undefined);
      recordsService.getMeta.resolves({ metadata: {}, metaMetadata: { attachmentFields: [], brandId: 'brand-1' } });
      recordsService.updateMeta.resolves(successResult());
      const updateReq = makeThrowingRequest({
        params: { oid: 'record-1' },
        query: {},
        body: { title: 'Updated' },
        files: {},
      });
      await controller.updateMeta(updateReq, {} as Sails.Res);

      expect((recordsService.updateMeta.firstCall.args[8] as any).validationOperation).to.equal(undefined);
      expect(sendRespStub.callCount).to.equal(2);
    });

    it('maps transition operation independently and preserves v2 authorization status', async () => {
      const record = {
        redboxOid: 'record-1',
        metadata: { title: 'Record' },
        metaMetadata: { type: 'dataset', brandId: 'brand-1', form: 'dataset-draft' },
        workflow: { stage: 'draft' },
      };
      recordsService.getMeta.resolves(record);
      (global as any).WorkflowStepsService.get.returns(
        of({ name: 'published', config: { form: 'dataset-published' } })
      );
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000002');
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: 'authorization',
          phase: 'pre-save',
          issues: [
            {
              code: 'record-validation-operation-unauthorized',
              message: '@record-save-record-validation-operation-unauthorized',
            },
          ],
        },
      ];
      recordsService.updateMeta.resolves(result);
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1', targetStep: 'published' },
          query: { operation: 'publish' },
          body: {},
          files: {},
        },
        {
          headers: { 'x-redbox-api-version': '2.0' },
          user: { username: 'tester', roles: [{ name: 'Publisher' }] },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.transitionWorkflow(req, {} as Sails.Res);

      const context = recordsService.updateMeta.firstCall.args[8] as any;
      expect(context).to.include({
        operation: 'transition',
        targetStep: 'published',
        validationOperation: 'publish',
      });
      expect(recordsService.updateMeta.firstCall.args[6]).to.deep.include({ name: 'published' });
      expect(sendRespStub.firstCall.args[2].status).to.equal(403);
      expect(sendRespStub.firstCall.args[2].meta.problems[0].kind).to.equal('authorization');
    });

    it('does not transition a record owned by another brand', async () => {
      recordsService.getMeta.resolves({
        redboxOid: 'record-1',
        metadata: { title: 'Foreign record' },
        metaMetadata: { type: 'dataset', brandId: 'brand-2', form: 'dataset-draft' },
        workflow: { stage: 'draft' },
      });
      const req = makeThrowingRequest({
        params: { oid: 'record-1', targetStep: 'published' },
        query: { operation: 'publish' },
        body: {},
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.transitionWorkflow(req, {} as Sails.Res);

      expect(sendRespStub.firstCall.args[2].status).to.equal(404);
      expect(recordsService.hasEditAccess.notCalled).to.equal(true);
      expect((global as any).WorkflowStepsService.get.notCalled).to.equal(true);
      expect(recordsService.updateMeta.notCalled).to.equal(true);
    });

    it('preserves the literal v1 transition failure as an HTTP 200 result body', async () => {
      const record = {
        redboxOid: 'record-1',
        metadata: { title: 'Record' },
        metaMetadata: { type: 'dataset', brandId: 'brand-1', form: 'dataset-draft' },
        workflow: { stage: 'draft' },
      };
      recordsService.getMeta.resolves(record);
      (global as any).WorkflowStepsService.get.returns(
        of({
          name: 'published',
          config: { form: 'dataset-published' },
        })
      );
      const result = notSavedResult();
      result.problems = [
        {
          kind: 'authorization',
          phase: 'pre-save',
          issues: [{ message: '@not-authorised' }],
        },
      ];
      recordsService.updateMeta.resolves(result);
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1', targetStep: 'published' },
          query: { operation: 'publish' },
          body: {},
          files: {},
        },
        {
          headers: { 'x-redbox-api-version': '1.0' },
          user: { username: 'tester', roles: [{ name: 'Publisher' }] },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.transitionWorkflow(req, {} as Sails.Res);

      expect(sendRespStub.calledOnce).to.equal(true);
      expect(sendRespStub.firstCall.args[2]).to.deep.equal({
        data: result,
        v1: {
          success: false,
          oid: '',
          message: '@record-save-failed',
          data: undefined,
          metadata: null,
          details: undefined,
          totalItems: 0,
          items: [],
        },
      });
    });

    it('keeps a typed v1 transition conflict status with the legacy result body', async () => {
      const record = {
        redboxOid: 'record-1',
        revision: 6,
        metadata: { title: 'Latest' },
        authorization: { view: ['tester'], edit: ['tester'] },
        metaMetadata: { type: 'dataset', brandId: 'brand-1', form: 'dataset-draft' },
        workflow: { stage: 'draft' },
      };
      recordsService.getMeta.resolves(record);
      (global as any).WorkflowStepsService.get.returns(
        of({ name: 'published', config: { form: 'dataset-published' } })
      );
      const result = notSavedResult();
      result.problems = [
        {
          kind: 'conflict',
          phase: 'persistence',
          issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
        },
      ];
      result.setConcurrencyMetadata({ revision: 6, entityTag: formatRecordEntityTag('record-1', 6) });
      recordsService.updateMeta.resolves(result);
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1', targetStep: 'published' },
          query: {},
          body: {},
          files: {},
        },
        {
          headers: {
            'x-redbox-api-version': '1.0',
            'if-match': formatRecordEntityTag('record-1', 5),
          },
          user: { username: 'tester', roles: [{ name: 'Publisher' }] },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.transitionWorkflow(req, {} as Sails.Res);

      expect(sendRespStub.firstCall.args[2].status).to.equal(412);
      expect(sendRespStub.firstCall.args[2].headers).to.deep.equal({
        ETag: formatRecordEntityTag('record-1', 6),
      });
      expect(sendRespStub.firstCall.args[2].v1).to.deep.include({
        success: false,
        message: '@record-save-failed',
        metadata: { title: 'Latest' },
      });
      expect(sendRespStub.firstCall.args[2]).not.to.have.property('meta');
    });

    it('keeps an omitted transition operation optional', async () => {
      recordsService.getMeta.resolves({
        redboxOid: 'record-1',
        metadata: { title: 'Record' },
        metaMetadata: { type: 'dataset', brandId: 'brand-1', form: 'dataset-draft' },
        workflow: { stage: 'draft' },
      });
      (global as any).WorkflowStepsService.get.returns(
        of({
          name: 'review',
          config: { form: 'dataset-review' },
        })
      );
      recordsService.updateMeta.resolves(successResult('record-1'));
      const req = makeThrowingRequest({
        params: { oid: 'record-1', targetStep: 'review' },
        query: {},
        body: {},
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.transitionWorkflow(req, {} as Sails.Res);

      const context = recordsService.updateMeta.firstCall.args[8] as any;
      expect(context).to.include({ operation: 'transition', targetStep: 'review' });
      expect(context.validationOperation).to.equal(undefined);
      expect(sendRespStub.calledOnce).to.equal(true);
    });

    it('keeps operation contract failures sanitized and v1-compatible', async () => {
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000003');
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: 'validation',
          phase: 'pre-save',
          issues: [
            {
              code: 'record-validation-operation-invalid',
              message: '@record-save-record-validation-operation-invalid',
            },
          ],
        },
      ];
      recordsService.getMeta.resolves({ metadata: {}, metaMetadata: { attachmentFields: [], brandId: 'brand-1' } });
      recordsService.updateMeta.resolves(result);
      const req = makeThrowingRequest(
        {
          params: { oid: 'record-1' },
          query: { operation: 'UnknownCaseSensitiveName' },
          body: { title: 'Rejected' },
          files: {},
        },
        {
          headers: { 'x-redbox-api-version': '1.0' },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.updateMeta(req, {} as Sails.Res);

      const envelope = sendRespStub.firstCall.args[2];
      expect(envelope.status).to.equal(500);
      expect(envelope.displayErrors).to.equal(undefined);
      expect(envelope.meta).to.equal(undefined);
      expect(envelope.v1).to.deep.equal({ message: 'Update Metadata failed' });
      expect(JSON.stringify(envelope)).not.to.include('UnknownCaseSensitiveName');
    });
  });

  describe('deleted record handlers', () => {
    it('returns an authorized tombstone representation with its lifecycle tag and safe metadata', async () => {
      recordsService.getDeletedRecordMeta.resolves({
        redboxOid: 'record-1',
        revision: 9,
        metadata: { title: 'Deleted record' },
        metaMetadata: { brandId: 'brand-1', type: 'dataset' },
        lifecycleState: 'recovery-required',
        lifecycle: {
          kind: 'delete',
          attempts: 2,
          startedAt: '2026-08-24T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:01.000Z',
          errorCode: 'active-removal-unknown',
        },
      });
      const req = makeThrowingRequest({ params: { oid: 'record-1' }, query: {}, body: {}, files: {} });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.getDeletedRecord(req, {} as Sails.Res);

      const envelope = sendRespStub.firstCall.args[2];
      expect(envelope.headers).to.deep.equal({ ETag: formatRecordEntityTag('record-1', 9) });
      expect(envelope.meta).to.deep.include({
        oid: 'record-1',
        revision: 9,
        lifecycleState: 'recovery-required',
      });
      expect(envelope.meta.lifecycle).not.to.have.property('requestId');
      expect(recordsService.hasViewAccess.calledOnce).to.equal(true);
    });

    it('passes exact lifecycle revision and fresh resolution linkage to restore', async () => {
      recordsService.getDeletedRecordMeta.resolves({
        redboxOid: 'record-1',
        revision: 9,
        metadata: {},
        metaMetadata: { brandId: 'brand-1', type: 'dataset' },
      });
      const result = successResult();
      result.setConcurrencyMetadata({ revision: 11, entityTag: formatRecordEntityTag('record-1', 11) });
      recordsService.restoreRecord.resolves(result);
      const requestId = '11111111-1111-4111-8111-111111111111';
      const conflictRequestId = '22222222-2222-4222-8222-222222222222';
      const req = makeThrowingRequest(
        { params: { oid: 'record-1' }, query: {}, body: {}, files: {} },
        {
          headers: {
            'if-match': formatRecordEntityTag('record-1', 9),
            'x-redbox-save-request-id': requestId,
            'x-redbox-concurrency-resolution': 'client-manually-resolved',
            'x-redbox-resolution-of-request-id': conflictRequestId,
          },
          user: { username: 'tester', roles: [] },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.restoreRecord(req, {} as Sails.Res);

      const context = recordsService.restoreRecord.firstCall.args[3];
      expect(context).to.include({ requestId, operation: 'restore', routeFamily: 'api' });
      expect(context.concurrency).to.deep.include({
        expectedRevision: 9,
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: conflictRequestId,
      });
      expect(sendRespStub.firstCall.args[2].headers).to.deep.equal({ ETag: formatRecordEntityTag('record-1', 11) });
    });

    for (const mode of ['last-write-wins', 'observe'] as const) {
      it(`keeps tokenless ${mode} lifecycle requests compatible and returns the committed tag`, async () => {
        recordsService.getDeletedRecordMeta.resolves({
          redboxOid: 'record-1',
          revision: 9,
          metadata: {},
          metaMetadata: { brandId: 'brand-1', type: 'dataset' },
        });
        const result = successResult();
        result.setConcurrencyMetadata({
          mode,
          revision: 11,
          currentRevision: 11,
          entityTag: formatRecordEntityTag('record-1', 11),
        });
        recordsService.restoreRecord.resolves(result);
        const req = makeThrowingRequest(
          { params: { oid: 'record-1' }, query: {}, body: {}, files: {} },
          { headers: { 'x-redbox-api-version': '2.0' } }
        );
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller.restoreRecord(req, {} as Sails.Res);

        expect(recordsService.restoreRecord.firstCall.args[3].concurrency).to.deep.equal({
          entityTagSupplied: false,
        });
        expect(sendRespStub.firstCall.args[2].status).to.equal(undefined);
        expect(sendRespStub.firstCall.args[2].headers).to.deep.equal({
          ETag: formatRecordEntityTag('record-1', 11),
        });
        expect(sendRespStub.firstCall.args[2].meta.concurrency.mode).to.equal(mode);
      });
    }

    it('preserves strict lifecycle 428 status and the current tombstone tag', async () => {
      const tombstone = {
        redboxOid: 'record-1',
        revision: 9,
        metadata: {},
        metaMetadata: { brandId: 'brand-1', type: 'dataset' },
      };
      recordsService.getMeta.resolves(null);
      recordsService.getDeletedRecordMeta.resolves(tombstone);
      const result = notSavedResult();
      result.problems = [
        {
          kind: 'conflict',
          phase: 'pre-save',
          issues: [{ code: 'record-precondition-required', message: '@record-precondition-required' }],
        },
      ];
      result.setConcurrencyMetadata({
        mode: 'strict',
        revision: 9,
        currentRevision: 9,
        entityTag: formatRecordEntityTag('record-1', 9),
      });
      recordsService.restoreRecord.resolves(result);
      const req = makeThrowingRequest(
        { params: { oid: 'record-1' }, query: {}, body: {}, files: {} },
        { headers: { 'x-redbox-api-version': '2.0' } }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.restoreRecord(req, {} as Sails.Res);

      expect(recordsService.restoreRecord.calledOnce).to.equal(true);
      expect(sendRespStub.firstCall.args[2].status).to.equal(428);
      expect(sendRespStub.firstCall.args[2].headers).to.deep.equal({
        ETag: formatRecordEntityTag('record-1', 9),
      });
      expect(sendRespStub.firstCall.args[2].displayErrors).to.deep.equal([
        { code: 'record-precondition-required', title: '@record-precondition-required' },
      ]);
    });

    it('rejects malformed lifecycle tags before tombstone lookup or mutation', async () => {
      const req = makeThrowingRequest(
        { params: { oid: 'record-1' }, query: {}, body: {}, files: {} },
        { headers: { 'if-match': '*', 'x-redbox-api-version': '2.0' } }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.restoreRecord(req, {} as Sails.Res);

      expect(sendRespStub.firstCall.args[2]).to.deep.equal({
        status: 400,
        displayErrors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
      });
      expect(recordsService.getDeletedRecordMeta.notCalled).to.equal(true);
      expect(recordsService.restoreRecord.notCalled).to.equal(true);
    });

    it('maps the permanent query to the purge lifecycle operation', async () => {
      recordsService.getMeta.resolves({
        redboxOid: 'record-1',
        revision: 7,
        metadata: {},
        metaMetadata: { brandId: 'brand-1', type: 'dataset' },
      });
      recordsService.delete.resolves(successResult());
      const req = makeThrowingRequest(
        { params: { oid: 'record-1' }, query: { permanent: 'true' }, body: {}, files: {} },
        { headers: { 'if-match': formatRecordEntityTag('record-1', 7) } }
      );
      sinon.stub(controller as any, 'sendResp');

      await controller.deleteRecord(req, {} as Sails.Res);

      expect(recordsService.delete.firstCall.args[1]).to.equal(true);
      expect(recordsService.delete.firstCall.args[5]).to.deep.include({ operation: 'purge', routeFamily: 'api' });
    });

    it('does not restore an active record when no deleted record exists', async () => {
      recordsService.getMeta.resolves({
        metaMetadata: { brandId: 'brand-1', type: 'dataset' },
      });
      recordsService.getDeletedRecordMeta.resolves(null);
      const req = makeThrowingRequest({
        params: { oid: 'record-1' },
        query: {},
        body: {},
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.restoreRecord(req, {} as Sails.Res);

      expect(recordsService.getDeletedRecordMeta.calledOnce).to.be.true;
      expect(recordsService.getDeletedRecordMeta.calledWithMatch('record-1', { id: 'brand-1' })).to.be.true;
      expect(recordsService.getMeta.called).to.be.false;
      expect(recordsService.restoreRecord.called).to.be.false;
      expect(sendRespStub.calledOnce).to.be.true;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
    });

    it('does not permanently delete an active record when no deleted record exists', async () => {
      recordsService.getMeta.resolves({
        metaMetadata: { brandId: 'brand-1', type: 'dataset' },
      });
      recordsService.getDeletedRecordMeta.resolves(null);
      const req = makeThrowingRequest({
        params: { oid: 'record-1' },
        query: {},
        body: {},
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.destroyDeletedRecord(req, {} as Sails.Res);

      expect(recordsService.getDeletedRecordMeta.calledOnce).to.be.true;
      expect(recordsService.getDeletedRecordMeta.calledWithMatch('record-1', { id: 'brand-1' })).to.be.true;
      expect(recordsService.getMeta.called).to.be.false;
      expect(recordsService.destroyDeletedRecord.called).to.be.false;
      expect(sendRespStub.calledOnce).to.be.true;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
    });
    for (const method of ['restoreRecord', 'destroyDeletedRecord'] as const) {
      it(`rejects ${method} when the deleted record belongs to another brand`, async () => {
        recordsService.getDeletedRecordMeta.resolves({
          redboxOid: 'record-1',
          metaMetadata: { brandId: 'brand-2' },
        });
        const req = makeThrowingRequest({
          params: { oid: 'record-1' },
          query: {},
          body: {},
          files: {},
        });
        const sendRespStub = sinon.stub(controller as any, 'sendResp');

        await controller[method](req, {} as Sails.Res);

        expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
        expect(recordsService[method].called).to.be.false;
      });
    }

    it('propagates deleted-record storage failures', async () => {
      recordsService.getDeletedRecordMeta.rejects(new Error('storage unavailable'));
      const req = makeThrowingRequest({
        params: { oid: 'record-1' },
        query: {},
        body: {},
        files: {},
      });

      let caught: unknown;
      try {
        await controller.restoreRecord(req, {} as Sails.Res);
      } catch (error) {
        caught = error;
      }

      expect(caught).to.be.an('error').with.property('message', 'storage unavailable');
      expect(recordsService.restoreRecord.called).to.be.false;
    });
  });

  describe('datastream read authorization boundary', () => {
    const readRequest = (list: boolean): Sails.Req =>
      makeThrowingRequest({
        params: list ? { oid: 'record-1' } : { oid: 'record-1', datastreamId: 'file-1' },
        query: {},
        body: {},
        files: {},
      });

    for (const testCase of [
      { name: 'download', invoke: (req: Sails.Req) => controller.getDataStream(req, {} as Sails.Res) },
      { name: 'list', invoke: (req: Sails.Req) => controller.listDatastreams(req, {} as Sails.Res) },
    ]) {
      it(`returns non-disclosing 404/403 responses before ${testCase.name} attachment access`, async () => {
        const sendResp = sinon.stub(controller as any, 'sendResp');
        recordsService.getMeta.resolves({
          redboxOid: 'record-1',
          metaMetadata: { brandId: 'different-brand' },
          metadata: { privateValue: 'must-not-return' },
          authorization: {},
        });

        await testCase.invoke(readRequest(testCase.name === 'list'));
        expect(sendResp.firstCall.args[2], testCase.name).to.deep.equal({ status: 404 });
        expect(recordsService.getAttachments.notCalled, testCase.name).to.equal(true);
        expect(JSON.stringify(sendResp.firstCall.args[2]), testCase.name).not.to.include('must-not-return');

        recordsService.getMeta.resolves({
          redboxOid: 'record-1',
          metaMetadata: { brandId: 'brand-1' },
          metadata: { privateValue: 'must-not-return' },
          authorization: {},
        });
        recordsService.hasViewAccess.returns(false);
        sendResp.resetHistory();

        await testCase.invoke(readRequest(testCase.name === 'list'));
        expect(sendResp.firstCall.args[2], testCase.name).to.deep.equal({ status: 403 });
        expect(recordsService.getAttachments.notCalled, testCase.name).to.equal(true);
        expect(JSON.stringify(sendResp.firstCall.args[2]), testCase.name).not.to.include('must-not-return');
      });
    }

    it('lists attachments only after current active-brand view authorization', async () => {
      recordsService.getMeta.resolves({
        redboxOid: 'record-1',
        metaMetadata: { brandId: 'brand-1' },
        metadata: {},
        authorization: { view: ['tester'] },
      });
      recordsService.hasViewAccess.returns(true);
      recordsService.getAttachments.resolves([{ fileId: 'file-1', name: 'safe.txt' }]);
      const sendResp = sinon.stub(controller as any, 'sendResp');

      await controller.listDatastreams(readRequest(true), {} as Sails.Res);

      expect(recordsService.getAttachments.calledOnceWith('record-1', undefined, { username: 'tester' })).to.equal(
        true
      );
      expect(sendResp.firstCall.args[2].data.records).to.deep.equal([{ fileId: 'file-1', name: 'safe.txt' }]);
    });
  });

  describe('datastream upload mutation boundary', () => {
    const activeRecord = () => ({
      redboxOid: 'record-1',
      revision: 5,
      metadata: { title: 'Existing title' },
      metaMetadata: { attachmentFields: [], brandId: 'brand-1', type: 'dataset' },
      authorization: { edit: ['tester'], view: ['tester'] },
    });

    function uploadRequest(headers: Record<string, unknown>, fileSpy = sinon.stub()): Sails.Req {
      fileSpy.returns({
        upload: (_options: unknown, done: (error: unknown, uploaded: Array<Record<string, unknown>>) => void) =>
          void done(undefined, [
            {
              fd: '/tmp/staged-file-1',
              filename: 'attachment.txt',
              type: 'text/plain',
              size: 12,
            },
          ]),
      });
      return makeThrowingRequest({ params: { oid: 'record-1' }, query: {}, body: {}, files: {} }, {
        headers,
        file: fileSpy,
      } as unknown as Partial<Sails.Req>);
    }

    it('rejects malformed preconditions and missing edit authority before accepting upload bytes', async () => {
      const malformedFile = sinon.stub();
      const malformedSend = sinon.stub(controller as any, 'sendResp');
      await controller.addDataStreams(
        uploadRequest({ 'if-match': '*', 'x-redbox-api-version': '2.0' }, malformedFile),
        {} as Sails.Res
      );
      expect(malformedFile.notCalled).to.equal(true);
      expect(recordsService.getMeta.notCalled).to.equal(true);
      expect(malformedSend.firstCall.args[2]).to.deep.equal({
        status: 400,
        displayErrors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
      });

      malformedSend.restore();
      recordsService.getMeta.resolves(activeRecord());
      recordsService.hasEditAccess.returns(false);
      const unauthorizedFile = sinon.stub();
      const unauthorizedSend = sinon.stub(controller as any, 'sendResp');
      await controller.addDataStreams(
        uploadRequest({ 'if-match': formatRecordEntityTag('record-1', 5) }, unauthorizedFile),
        {} as Sails.Res
      );
      expect(unauthorizedFile.notCalled).to.equal(true);
      expect(recordsService.updateMeta.notCalled).to.equal(true);
      expect(unauthorizedSend.firstCall.args[2]).to.deep.include({ status: 403 });
    });

    it('routes a standalone upload through RecordsService CAS before finalizing bytes', async () => {
      recordsService.getMeta.resolves(activeRecord());
      const save = successResult();
      save.setConcurrencyMetadata({
        revision: 6,
        entityTag: formatRecordEntityTag('record-1', 6),
      });
      recordsService.updateMeta.resolves(save);
      const addDatastreams = sinon.stub().resolves({
        success: true,
        message: 'uploaded',
        isSuccessful: () => true,
      });
      const removeStagedDatastream = sinon.stub().resolves();
      controller.DatastreamService = { addDatastreams, removeStagedDatastream } as never;
      const sendResp = sinon.stub(controller as any, 'sendResp');

      await controller.addDataStreams(
        uploadRequest({ 'if-match': formatRecordEntityTag('record-1', 5) }),
        {} as Sails.Res
      );
      await flushPromises();

      expect(recordsService.updateMeta.calledOnce).to.equal(true);
      expect(recordsService.getMeta.callCount).to.equal(2);
      const args = recordsService.updateMeta.firstCall.args;
      expect(args[0]).to.deep.include({ id: 'brand-1' });
      expect(args[1]).to.equal('record-1');
      expect(args[2]).to.equal(await recordsService.getMeta.secondCall.returnValue);
      expect(args[4]).to.equal(false);
      expect(args[5]).to.equal(false);
      expect(args[7]).to.deep.equal({ title: 'Existing title' });
      expect(args[8].concurrency).to.deep.equal({ entityTagSupplied: true, expectedRevision: 5 });
      expect(addDatastreams.calledAfter(recordsService.updateMeta)).to.equal(true);
      expect(removeStagedDatastream.calledOnceWithExactly('staged-file-1')).to.equal(true);
      expect(removeStagedDatastream.calledAfter(addDatastreams)).to.equal(true);
      expect(sendResp.firstCall.args[2].meta).to.deep.include({ outcome: 'saved' });
      expect(sendResp.firstCall.args[2].headers).to.deep.equal({
        ETag: formatRecordEntityTag('record-1', 6),
      });
    });

    it('uses metadata reloaded after a tokenless upload and skips the onUpdate hook chain', async () => {
      const beforeUpload = activeRecord();
      const afterConcurrentSave = {
        ...activeRecord(),
        revision: 6,
        metadata: { title: 'Concurrent title', concurrentValue: 'must survive' },
      };
      recordsService.getMeta.onFirstCall().resolves(beforeUpload);
      recordsService.getMeta.onSecondCall().resolves(afterConcurrentSave);
      const save = successResult();
      save.setConcurrencyMetadata({
        revision: 7,
        entityTag: formatRecordEntityTag('record-1', 7),
      });
      recordsService.updateMeta.resolves(save);
      const addDatastreams = sinon.stub().resolves({
        success: true,
        message: 'uploaded',
        isSuccessful: () => true,
      });
      controller.DatastreamService = { addDatastreams } as never;
      sinon.stub(controller as any, 'sendResp');

      await controller.addDataStreams(uploadRequest({}), {} as Sails.Res);
      await flushPromises();

      const args = recordsService.updateMeta.firstCall.args;
      expect(recordsService.getMeta.callCount).to.equal(2);
      expect(args[2]).to.equal(afterConcurrentSave);
      expect(args[4]).to.equal(false);
      expect(args[5]).to.equal(false);
      expect(args[7]).to.equal(afterConcurrentSave.metadata);
      expect(args[8].concurrency).to.deep.equal({ entityTagSupplied: false });
      expect(addDatastreams.calledAfter(recordsService.updateMeta)).to.equal(true);
    });

    it('keeps a supplied stale tag after the post-upload reload and removes staging', async () => {
      const afterConcurrentSave = {
        ...activeRecord(),
        revision: 6,
        metadata: { title: 'Concurrent title', concurrentValue: 'must survive' },
      };
      recordsService.getMeta.onFirstCall().resolves(activeRecord());
      recordsService.getMeta.onSecondCall().resolves(afterConcurrentSave);
      recordsService.getMeta.onThirdCall().resolves(afterConcurrentSave);
      const failure = notSavedResult();
      failure.problems = [
        {
          kind: 'conflict',
          phase: 'pre-save',
          issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
        },
      ];
      failure.setConcurrencyMetadata({
        revision: 6,
        currentRevision: 6,
        entityTag: formatRecordEntityTag('record-1', 6),
      });
      recordsService.updateMeta.resolves(failure);
      const removeStagedDatastream = sinon.stub().resolves();
      const addDatastreams = sinon.stub();
      controller.DatastreamService = { addDatastreams, removeStagedDatastream } as never;
      const sendResp = sinon.stub(controller as any, 'sendResp');

      await controller.addDataStreams(
        uploadRequest({ 'if-match': formatRecordEntityTag('record-1', 5) }),
        {} as Sails.Res
      );
      await flushPromises();

      const args = recordsService.updateMeta.firstCall.args;
      expect(args[2]).to.equal(afterConcurrentSave);
      expect(args[8].concurrency).to.deep.equal({ entityTagSupplied: true, expectedRevision: 5 });
      expect(addDatastreams.notCalled).to.equal(true);
      expect(removeStagedDatastream.calledWith('staged-file-1')).to.equal(true);
      expect(sendResp.firstCall.args[2].status).to.equal(412);
    });

    it('rechecks edit authority after upload without disclosing the current record', async () => {
      const currentRecord = {
        ...activeRecord(),
        revision: 6,
        metadata: { privateValue: 'must-not-return' },
      };
      recordsService.getMeta.onFirstCall().resolves(activeRecord());
      recordsService.getMeta.onSecondCall().resolves(currentRecord);
      recordsService.hasEditAccess.onFirstCall().returns(true);
      recordsService.hasEditAccess.onSecondCall().returns(false);
      const removeStagedDatastream = sinon.stub().resolves();
      const addDatastreams = sinon.stub();
      controller.DatastreamService = { addDatastreams, removeStagedDatastream } as never;
      const sendResp = sinon.stub(controller as any, 'sendResp');

      await controller.addDataStreams(uploadRequest({}), {} as Sails.Res);
      await flushPromises();

      expect(recordsService.updateMeta.notCalled).to.equal(true);
      expect(addDatastreams.notCalled).to.equal(true);
      expect(removeStagedDatastream.calledWith('staged-file-1')).to.equal(true);
      expect(sendResp.firstCall.args[2]).to.deep.equal({
        status: 403,
        displayErrors: [{ code: 'not-authorised' }],
        v1: { message: 'Not authorised.' },
      });
      expect(JSON.stringify(sendResp.firstCall.args[2])).not.to.include('must-not-return');
    });

    it('does not finalize a strict missing or stale upload claim and removes certified abandoned staging', async () => {
      recordsService.getMeta.resolves(activeRecord());
      const removeStagedDatastream = sinon.stub().resolves();
      const addDatastreams = sinon.stub();
      controller.DatastreamService = { addDatastreams, removeStagedDatastream } as never;
      const sendResp = sinon.stub(controller as any, 'sendResp');

      for (const testCase of [
        { headers: {}, code: 'record-precondition-required', status: 428 },
        {
          headers: { 'if-match': formatRecordEntityTag('record-1', 4) },
          code: 'record-revision-stale',
          status: 412,
        },
      ]) {
        const failure = notSavedResult();
        failure.problems = [
          {
            kind: 'conflict',
            phase: 'pre-save',
            issues: [{ code: testCase.code, message: `@${testCase.code}` }],
          },
        ];
        recordsService.updateMeta.resolves(failure);

        await controller.addDataStreams(uploadRequest(testCase.headers), {} as Sails.Res);
        await flushPromises();

        expect(addDatastreams.notCalled).to.equal(true);
        expect(removeStagedDatastream.calledWith('staged-file-1')).to.equal(true);
        expect(sendResp.lastCall.args[2].status).to.equal(testCase.status);
      }
    });
  });

  describe('harvest handlers', () => {
    it('uses req.apiRequest body in harvest', async () => {
      const body = {
        records: [
          {
            harvestId: 'harvest-1',
            recordRequest: {
              metadata: {
                title: 'Validated harvest metadata',
              },
            },
          },
        ],
      };
      const req = makeThrowingRequest({
        params: { recordType: 'dataset' },
        query: {},
        body,
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.harvest(req, {} as Sails.Res);

      expect((global as any).HarvestRunService.submitCompatibilityRecords.calledOnce).to.be.true;
      expect((global as any).HarvestRunService.submitCompatibilityRecords.firstCall.args[2]).to.deep.equal(body);
      expect(sendRespStub.calledOnce).to.be.true;
    });

    it('keeps API create precondition-free', async () => {
      const req = makeThrowingRequest(
        {
          params: { recordType: 'dataset' },
          query: {},
          body: { metadata: { title: 'Created' } },
          files: {},
        },
        {
          headers: {
            'x-redbox-api-version': '2.0',
            'if-match': formatRecordEntityTag('record-1', 0),
          },
        }
      );
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      controller.create(req, {} as Sails.Res);

      expect(recordsService.create.notCalled).to.equal(true);
      expect((global as any).RecordTypesService.get.notCalled).to.equal(true);
      expect(sendRespStub.firstCall.args[2]).to.deep.equal({
        status: 400,
        displayErrors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
      });
    });

    it('delegates tracked harvest bodies to HarvestRunService.submitChunk', async () => {
      const body = {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [
          {
            harvestId: 'harvest-1',
            operation: 'upsert',
            recordRequest: {
              metadata: {
                title: 'Tracked metadata',
              },
            },
          },
        ],
      };
      const req = makeThrowingRequest({
        params: { recordType: 'dataset' },
        query: {},
        body,
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.harvest(req, {} as Sails.Res);

      expect((global as any).HarvestRunService.submitChunk.calledOnce).to.be.true;
      expect((global as any).HarvestRunService.submitChunk.firstCall.args[2]).to.deep.equal(body);
      expect(sendRespStub.calledOnce).to.be.true;
    });

    it('rejects tracked harvest requests that also specify updateMode', async () => {
      const req = makeThrowingRequest({
        params: { recordType: 'dataset' },
        query: { updateMode: 'merge' },
        body: {
          sourceRunId: 'source-run-1',
          sourceName: 'source-a',
          chunk: { index: 1 },
          records: [{ harvestId: 'harvest-1' }],
        },
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.harvest(req, {} as Sails.Res);

      expect((global as any).HarvestRunService.submitChunk.called).to.be.false;
      expect(sendRespStub.firstCall.args[2]?.status).to.equal(400);
    });

    it('uses req.apiRequest body in legacyHarvest', async () => {
      const body = {
        records: [
          {
            harvest_id: 'legacy-harvest-1',
            metadata: {
              data: {
                title: 'Validated legacy metadata',
              },
            },
          },
        ],
      };
      const req = makeThrowingRequest({
        params: { recordType: 'dataset' },
        query: {},
        body,
        files: {},
      });
      const sendRespStub = sinon.stub(controller as any, 'sendResp');

      await controller.legacyHarvest(req, {} as Sails.Res);

      expect((global as any).HarvestRunService.submitLegacyRecords.calledOnce).to.be.true;
      expect((global as any).HarvestRunService.submitLegacyRecords.firstCall.args[2]).to.deep.equal(body);
      expect(sendRespStub.calledOnce).to.be.true;
    });

    it('uses the authoritative harvest snapshot revision and surfaces a non-persisted conflict per record', async () => {
      const record = {
        redboxOid: 'record-1',
        revision: 7,
        metadata: { title: 'Before harvest' },
        metaMetadata: { brandId: 'brand-1', type: 'dataset' },
      };
      recordsService.getMeta.resolves(record);
      const stale = notSavedResult();
      stale.problems = [
        {
          kind: 'conflict',
          phase: 'persistence',
          issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
        },
      ];
      recordsService.updateMetaInternal.resolves(stale);

      const result = await (controller as any).updateHarvestRecord(
        { id: 'brand-1' },
        { id: 'record-type-1', name: 'dataset' },
        'override',
        { title: 'Harvested title' },
        'record-1',
        'harvest-1',
        { username: 'harvester' }
      );

      expect(recordsService.updateMeta.notCalled).to.equal(true);
      expect(recordsService.updateMetaInternal.calledOnce).to.equal(true);
      const saveOptions = recordsService.updateMetaInternal.firstCall.args[0];
      expect(saveOptions).to.deep.include({
        actor: { kind: 'service', id: 'RecordController.updateHarvestRecord' },
        authorization: { kind: 'service' },
        mutationClass: 'full-record',
        oid: 'record-1',
      });
      expect(saveOptions.record).to.deep.include({
        redboxOid: 'record-1',
        revision: 7,
        metadata: { title: 'Harvested title' },
      });
      expect(result).to.deep.include({
        harvestId: 'harvest-1',
        oid: 'record-1',
        status: false,
        message: 'Record update was not persisted: not-saved',
        details: 'record-revision-stale',
      });
    });
  });
});

describe('Webservice RecordController getMeta', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalBrandingService: any;
  let originalUnderscore: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalUnderscore = (global as any)._;

    (global as any).sails = {
      config: {},
      services: {
        recordsservice: {
          getMeta: sinon.stub(),
          getRelatedRecords: sinon.stub(),
          hasViewAccess: sinon.stub().returns(true),
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any)._ = require('lodash');

    controller = new Controllers.Record();
    controller.init();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any)._ = originalUnderscore;
  });

  it('returns metadata only when relationships are not requested', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    const req = {
      param,
      apiRequest: {
        params: { oid: 'oid-1' },
        query: {},
        body: {},
        files: {},
      },
      query: {},
      session: { branding: 'default' },
      user: { roles: [] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const record = {
      redboxOid: 'oid-1',
      revision: 2,
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Test' },
    };
    (global as any).sails.services.recordsservice.getMeta.resolves(record);

    await controller.getMeta(req, res);

    assert.equal((global as any).sails.services.recordsservice.getMeta.calledWith('oid-1'), true);
    assert.equal((global as any).sails.services.recordsservice.getRelatedRecords.called, false);
    assert.equal(sendResp.calledOnce, true);
    assert.deepEqual(sendResp.firstCall.args[2], {
      data: record.metadata,
      meta: { oid: 'oid-1', revision: 2, entityTag: formatRecordEntityTag('oid-1', 2) },
      headers: { ETag: formatRecordEntityTag('oid-1', 2) },
    });
  });

  it('returns record permissions when view access is allowed', async () => {
    const req = {
      apiRequest: { params: { oid: 'oid-1' }, query: {}, body: {}, files: {} },
      session: { branding: 'default' },
      user: { username: 'tester' },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const record = {
      redboxOid: 'oid-1',
      revision: 2,
      metaMetadata: { brandId: 'brand-1' },
      metadata: {},
      authorization: { view: ['tester'] },
    };
    (global as any).sails.services.recordsservice.getMeta.resolves(record);
    (global as any).sails.services.recordsservice.hasViewAccess.returns(true);

    await controller.getPermissions(req, {} as Sails.Res);

    assert.deepEqual(sendResp.firstCall.args[2], {
      data: record.authorization,
      meta: { oid: 'oid-1', revision: 2, entityTag: formatRecordEntityTag('oid-1', 2) },
      headers: { ETag: formatRecordEntityTag('oid-1', 2) },
    });
  });

  it('rejects record permission access when view access is denied', async () => {
    const req = {
      apiRequest: { params: { oid: 'oid-1' }, query: {}, body: {}, files: {} },
      session: { branding: 'default' },
      user: { username: 'tester' },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).sails.services.recordsservice.getMeta.resolves({
      redboxOid: 'oid-1',
      revision: 2,
      metaMetadata: { brandId: 'brand-1' },
      metadata: {},
      authorization: {},
    });
    (global as any).sails.services.recordsservice.hasViewAccess.returns(false);

    await controller.getPermissions(req, {} as Sails.Res);

    assert.equal(sendResp.firstCall.args[2].status, 403);
  });

  it('returns not found when record permission metadata is missing', async () => {
    const req = {
      apiRequest: { params: { oid: 'oid-1' }, query: {}, body: {}, files: {} },
      session: { branding: 'default' },
      user: { username: 'tester' },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).sails.services.recordsservice.getMeta.resolves(null);

    await controller.getPermissions(req, {} as Sails.Res);

    assert.equal(sendResp.firstCall.args[2].status, 404);
  });

  it('returns filtered relationships when requested', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    const req = {
      param,
      apiRequest: {
        params: { oid: 'oid-1' },
        query: {
          include: 'relationships',
          relationshipDepth: '2',
          relationshipIds: 'rel-1, rel-2',
          recordTypes: 'dataset,publication',
          fields: 'summary',
        },
        body: {},
        files: {},
      },
      query: {
        include: 'relationships',
        relationshipDepth: '2',
        relationshipIds: 'rel-1, rel-2',
        recordTypes: 'dataset,publication',
        fields: 'summary',
      },
      session: { branding: 'default' },
      user: { roles: [{ name: 'Researcher' }] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const record = {
      redboxOid: 'oid-1',
      revision: 2,
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Test' },
    };
    const relationships = {
      rootOid: 'oid-1',
      relatedObjects: {
        dataset: [
          { redboxOid: 'oid-1', title: 'Root' },
          { redboxOid: 'oid-2', title: 'Visible' },
          { redboxOid: 'oid-3', title: 'Hidden' },
        ],
      },
      edges: [
        { relationId: 'rel-1', targetOid: 'oid-2' },
        { relationId: 'rel-2', targetOid: 'oid-3' },
      ],
      omittedByAccess: {},
    };

    (global as any).sails.services.recordsservice.getMeta.resolves(record);
    (global as any).sails.services.recordsservice.getRelatedRecords.resolves(relationships);
    (global as any).sails.services.recordsservice.hasViewAccess
      .withArgs(
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        sinon.match({ redboxOid: 'oid-2', title: 'Visible' })
      )
      .returns(true);
    (global as any).sails.services.recordsservice.hasViewAccess
      .withArgs(sinon.match.any, sinon.match.any, sinon.match.any, sinon.match({ redboxOid: 'oid-3', title: 'Hidden' }))
      .returns(false);

    await controller.getMeta(req, res);

    assert.equal((global as any).sails.services.recordsservice.getRelatedRecords.calledOnce, true);
    assert.deepEqual((global as any).sails.services.recordsservice.getRelatedRecords.firstCall.args[2], {
      depth: 2,
      includeRelationIds: ['rel-1', 'rel-2'],
      includeRecordTypes: ['dataset', 'publication'],
      fields: 'summary',
    });
    assert.equal(sendResp.calledOnce, true);
    assert.deepEqual(sendResp.firstCall.args[2], {
      data: {
        metadata: record.metadata,
        relationships: {
          rootOid: 'oid-1',
          relatedObjects: {
            dataset: [
              { redboxOid: 'oid-1', title: 'Root' },
              { redboxOid: 'oid-2', title: 'Visible' },
            ],
          },
          edges: [{ relationId: 'rel-1', targetOid: 'oid-2' }],
          omittedByAccess: {
            'rel-2': 1,
          },
        },
      },
      meta: { oid: 'oid-1', revision: 2, entityTag: formatRecordEntityTag('oid-1', 2) },
      headers: { ETag: formatRecordEntityTag('oid-1', 2) },
    });
  });
});
