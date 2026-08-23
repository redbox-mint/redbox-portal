let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import {
  createRecordSaveContext,
  isInternalRecordValidationBypass,
  isCanonicalSaveRequestId,
  isRecordValidationBypassReason,
  normalizeRecordValidationRequestFacts,
  readSaveRequestId,
  recordValidationRuntimeFacts,
  RECORD_VALIDATION_BYPASS_REASONS,
  recordSaveFailureStatus,
  recordSaveProblem,
  RecordSaveResponse,
  resolveStorageMutationState,
} from '../../src/RecordSaveResponse';
import { StorageServiceResponse } from '../../src/StorageServiceResponse';

const requestId = '11111111-1111-4111-8111-111111111111';

function response(): RecordSaveResponse {
  return new RecordSaveResponse(createRecordSaveContext({ requestId, routeFamily: 'browser', operation: 'update' }));
}

describe('RecordSaveResponse', function () {
  describe('outcome state machine', function () {
    it('starts as a confirmed non-save', function () {
      const result = response();
      expect(result.outcome).to.equal('not-saved');
      expect(result.success).to.be.false;
      expect(result.wasPersisted()).to.be.false;
      expect(result.requestId).to.equal(requestId);
      expect(result.completion.attachments.status).to.equal('not-required');
    });

    it('marks a confirmed primary mutation as a complete save', function () {
      const saveTracker = response();
      saveTracker.confirmPrimaryPersistence('oid-1');
      const result = saveTracker;
      expect(result.outcome).to.equal('saved');
      expect(result.success).to.be.true;
      expect(result.oid).to.equal('oid-1');
    });

    it('downgrades a complete save to a warning when a later phase fails', function () {
      const saveTracker = response();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.recordPostPersistenceProblem(recordSaveProblem('processing', 'post-save', 'hook failed', 'post-save-failed'));
      const result = saveTracker;
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.success).to.be.true;
      expect(result.wasPersisted()).to.be.true;
      expect(result.oid).to.equal('oid-1');
    });

    it('never downgrades a persisted save back to not-saved or unknown', function () {
      const saveTracker = response();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.recordPrimaryNotApplied(recordSaveProblem('processing', 'persistence', 'nope'));
      saveTracker.recordPrimaryUnknown(recordSaveProblem('system', 'persistence', 'maybe'));
      const result = saveTracker;
      expect(result.outcome).to.equal('saved');
      expect(result.oid).to.equal('oid-1');
    });

    it('does not confirm persistence after the primary mutation was ambiguous', function () {
      const saveTracker = response();
      saveTracker.recordPrimaryUnknown(recordSaveProblem('system', 'persistence', 'timeout'));
      saveTracker.confirmPrimaryPersistence('oid-1');
      const result = saveTracker;
      expect(result.outcome).to.equal('unknown');
      expect(result.wasPersisted()).to.be.false;
      expect(result.oid).to.equal('');
    });

    it('preserves only legacy workspace fields returned by a post-save hook', function () {
      const saveTracker = response();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.mergeLegacyHookFields({
        workspaceOid: 'workspace-1',
        workspaceData: { title: 'Workspace' },
        oid: 'tampered',
        outcome: 'not-saved',
      });

      const result = saveTracker;
      expect(result.workspaceOid).to.equal('workspace-1');
      expect(result.workspaceData).to.deep.equal({ title: 'Workspace' });
      expect(result.oid).to.equal('oid-1');
      expect(result.outcome).to.equal('saved');
    });

    it('copies source metadata and ignores invalid legacy hook values', function () {
      const saveTracker = response();
      const source = new StorageServiceResponse();
      source.message = 'saved';
      source.data = { source: true };
      source.metadata = { projected: true };
      source.totalItems = 2;
      source.items = [{ id: 'item-1' }];

      saveTracker.confirmPrimaryPersistence('oid-source', source);
      saveTracker.setProjectedMetadata({ projected: 'later' });
      saveTracker.mergeLegacyHookFields(null);
      saveTracker.mergeLegacyHookFields({ workspaceOid: '   ' });

      const result = saveTracker;
      expect(result.oid).to.equal('oid-source');
      expect(result.message).to.equal('saved');
      expect(result.data).to.deep.equal({ source: true });
      expect(result.metadata).to.deep.equal({ projected: 'later' });
      expect(result.totalItems).to.equal(2);
      expect(result.items).to.deep.equal([{ id: 'item-1' }]);
    });

    it('generates a request ID when a response is created without one', function () {
      const result = new RecordSaveResponse();
      expect(isCanonicalSaveRequestId(result.requestId)).to.equal(true);
    });

    it('serializes only bounded safe validator metadata', function () {
      const saveTracker = response();
      saveTracker.recordPrimaryNotApplied({
        kind: 'validation',
        phase: 'pre-save',
        issues: [{
          message: '@validator-error-required',
          code: 'record-validation-failed',
          class: 'required',
          params: { required: true, unsafe: { token: 'secret' } } as never,
          targetField: { dataModel: ['title'] },
          lineagePaths: { dataModel: ['title'], angularComponentsJsonPointer: '/title' },
          exception: new Error('raw database failure'),
        } as never],
      });

      const serialized = JSON.parse(JSON.stringify(saveTracker));
      expect(serialized.problems[0].issues[0]).to.deep.equal({
        message: '@validator-error-required',
        code: 'record-validation-failed',
        class: 'required',
        params: { required: true },
        targetField: { dataModel: ['title'] },
        lineagePaths: { dataModel: ['title'], angularComponentsJsonPointer: '/title' },
      });
      expect(JSON.stringify(serialized)).not.to.contain('raw database failure');
      expect(JSON.stringify(serialized)).not.to.contain('secret');
    });
  });

  describe('attachment completion', function () {
    it('downgrades a persisted save when any item is not completed', function () {
      const saveTracker = response();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.setAttachmentItems([
        { field: 'attachments', attachmentId: 'a', operation: 'finalize', status: 'completed' },
        { field: 'attachments', attachmentId: 'b', operation: 'finalize', status: 'incomplete' },
      ]);
      const result = saveTracker;
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.completion.attachments.status).to.equal('incomplete');
      expect(result.completion.attachments.items).to.have.length(2);
    });

    it('keeps a complete save complete when every item is confirmed', function () {
      const saveTracker = response();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.setAttachmentItems([
        { field: 'attachments', attachmentId: 'a', operation: 'add', status: 'completed' },
      ]);
      expect(saveTracker.outcome).to.equal('saved');
    });
  });

  describe('resolveStorageMutationState', function () {
    it('trusts an explicit application state', function () {
      const response = new StorageServiceResponse();
      response.success = false;
      response.applicationState = 'not-applied';
      expect(resolveStorageMutationState(response)).to.equal('not-applied');
    });

    it('treats a legacy success without state as applied and logs a deprecation', function () {
      const response = new StorageServiceResponse();
      response.success = true;
      const messages: string[] = [];
      expect(resolveStorageMutationState(response, message => messages.push(message))).to.equal('applied');
      expect(messages).to.have.length(1);
    });

    it('never infers not-applied from a legacy failure or a missing response', function () {
      const response = new StorageServiceResponse();
      response.success = false;
      expect(resolveStorageMutationState(response)).to.equal('unknown');
      expect(resolveStorageMutationState(null)).to.equal('unknown');
      expect(resolveStorageMutationState(undefined)).to.equal('unknown');
    });
  });

  describe('request correlation', function () {
    it('accepts a canonical UUID and replaces anything else', function () {
      expect(isCanonicalSaveRequestId(requestId)).to.be.true;
      expect(isCanonicalSaveRequestId('not-a-uuid')).to.be.false;
      expect(createRecordSaveContext({ requestId }).requestId).to.equal(requestId);
      expect(createRecordSaveContext({ requestId: 'nope' }).requestId).to.not.equal('nope');
      expect(isCanonicalSaveRequestId(createRecordSaveContext().requestId)).to.be.true;
    });

    it('keeps CRUD and validation operations separate in an internal save context', function () {
      const context = createRecordSaveContext({
        requestId,
        routeFamily: 'internal',
        operation: 'transition',
        targetStep: 'published',
        validationOperation: 'publish',
        validationBypass: {
          mode: 'bypass',
          reason: 'historical-record-repair',
          actor: { kind: 'service', id: 'RepairService' },
        },
      });

      expect(context.operation).to.equal('transition');
      expect(context.targetStep).to.equal('published');
      expect(context.validationOperation).to.equal('publish');
      expect(context.validationBypass).to.deep.equal({
        mode: 'bypass',
        reason: 'historical-record-repair',
        actor: { kind: 'service', id: 'RepairService' },
      });
    });

    it('exposes one runtime source of truth for the typed bypass reasons', function () {
      expect(RECORD_VALIDATION_BYPASS_REASONS).to.deep.equal([
        'historical-record-repair',
        'trusted-data-migration',
        'configuration-recovery',
      ]);
      expect(isRecordValidationBypassReason('trusted-data-migration')).to.equal(true);
      expect(isRecordValidationBypassReason('arbitrary-reason')).to.equal(false);
      expect(
        isInternalRecordValidationBypass({
          mode: 'bypass',
          reason: 'configuration-recovery',
          actor: { kind: 'service', id: 'RecoveryService' },
        })
      ).to.equal(true);
      expect(isInternalRecordValidationBypass(null)).to.equal(false);
      expect(isInternalRecordValidationBypass({ mode: 'bypass', actor: null })).to.equal(false);
      expect(
        isInternalRecordValidationBypass({
          mode: 'bypass',
          reason: 'configuration-recovery',
          actor: { kind: 'service', id: 'invalid service id' },
        })
      ).to.equal(false);
    });

    it('reads only a single canonical lower-cased header value', function () {
      expect(readSaveRequestId({ 'x-redbox-save-request-id': requestId })).to.equal(requestId);
      expect(readSaveRequestId({ 'x-redbox-save-request-id': [requestId, requestId] })).to.be.undefined;
      expect(readSaveRequestId({ 'x-redbox-save-request-id': `${requestId},${requestId}` })).to.be.undefined;
      expect(readSaveRequestId({ 'x-redbox-save-request-id': 'x'.repeat(5000) })).to.be.undefined;
      expect(readSaveRequestId(undefined)).to.be.undefined;
    });

    it('normalizes the same bounded request and runtime facts for every transport', function () {
      expect(normalizeRecordValidationRequestFacts(
        { recordType: ' dataset ', targetStep: '../unsafe', merge: 'true', token: 'secret' },
        { targetStep: 'review', datastreams: false }
      )).to.deep.equal({ recordType: 'dataset', targetStep: 'review', merge: true, datastreams: false });

      expect(recordValidationRuntimeFacts({
        routeFamily: 'browser',
        operation: 'transition',
        validationRuntimeContext: { rawRequest: 'must-not-pass' },
      }, 'transition')).to.deep.equal({
        routeFamily: 'browser',
        writeKind: 'transition',
        saveOperation: 'transition',
      });
      expect(recordValidationRuntimeFacts({
        routeFamily: 'internal',
        validationRuntimeContext: { service: 'repair' },
      }, 'update')).to.deep.equal({
        service: 'repair',
        routeFamily: 'internal',
        writeKind: 'update',
        saveOperation: 'update',
      });
    });
  });

  describe('recordSaveFailureStatus', function () {
    it('maps non-persisted problem kinds to transport statuses', function () {
      const validation = new RecordSaveResponse(createRecordSaveContext({ requestId }));
      validation.addProblem(recordSaveProblem('validation', 'pre-save', 'bad field'));
      expect(recordSaveFailureStatus(validation)).to.equal(400);

      const authorization = new RecordSaveResponse(createRecordSaveContext({ requestId }));
      authorization.addProblem(recordSaveProblem('authorization', 'pre-save', 'denied'));
      expect(recordSaveFailureStatus(authorization)).to.equal(403);

      const processing = new RecordSaveResponse(createRecordSaveContext({ requestId }));
      processing.addProblem(recordSaveProblem('processing', 'persistence', 'boom'));
      expect(recordSaveFailureStatus(processing)).to.equal(500);
    });

    it('uses deterministic severity instead of the first problem', function () {
      const authorizationAfterValidation = new RecordSaveResponse(createRecordSaveContext({ requestId }));
      authorizationAfterValidation.addProblem(recordSaveProblem('validation', 'pre-save', 'bad field'));
      authorizationAfterValidation.addProblem(recordSaveProblem('authorization', 'pre-save', 'denied'));
      expect(recordSaveFailureStatus(authorizationAfterValidation)).to.equal(403);

      const systemAfterAuthorization = new RecordSaveResponse(createRecordSaveContext({ requestId }));
      systemAfterAuthorization.addProblem(recordSaveProblem('authorization', 'pre-save', 'denied'));
      systemAfterAuthorization.addProblem(recordSaveProblem('system', 'pre-save', 'configuration failure'));
      expect(recordSaveFailureStatus(systemAfterAuthorization)).to.equal(500);
    });

    it('keeps an ambiguous primary mutation on a 5xx', function () {
      const unknownResult = new RecordSaveResponse(createRecordSaveContext({ requestId }));
      unknownResult.outcome = 'unknown';
      unknownResult.addProblem(recordSaveProblem('validation', 'persistence', 'looks like validation'));
      expect(recordSaveFailureStatus(unknownResult)).to.equal(500);
    });
  });
});
