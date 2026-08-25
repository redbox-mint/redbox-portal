let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import {
  emptyRecordSaveCompletion,
  isRecordSaveOutcome,
  reduceAttachmentStatus,
} from '@researchdatabox/sails-ng-common';
import {
  createRecordSaveContext,
  createRecordSaveSchemaOutcomeMetadata,
  isInternalRecordValidationBypass,
  isRecordSaveContext,
  isCanonicalSaveRequestId,
  isRecordValidationBypassReason,
  normalizeRecordConcurrencyContext,
  normalizeRecordValidationRequestFacts,
  readSaveRequestId,
  recordValidationRuntimeFacts,
  RECORD_VALIDATION_BYPASS_REASONS,
  recordSaveFailureStatus,
  recordSaveProblem,
  type InternalRecordValidationBypass,
  type RecordValidationContextJSONValue,
  RecordSaveResponse,
  RecordSaveTracker,
  resolveStorageMutationState,
} from '../../src/RecordSaveResponse';
import { StorageMutationResponse, StorageServiceResponse } from '../../src/StorageServiceResponse';

const requestId = '11111111-1111-4111-8111-111111111111';

function tracker(): RecordSaveTracker {
  return new RecordSaveTracker(createRecordSaveContext({ requestId, routeFamily: 'browser', operation: 'update' }));
}

describe('RecordSaveResponse', function () {
  describe('outcome state machine', function () {
    it('starts as a confirmed non-save', function () {
      const result = tracker().toResponse();
      expect(result.outcome).to.equal('not-saved');
      expect(result.success).to.be.false;
      expect(result.wasPersisted()).to.be.false;
      expect(result.isComplete()).to.be.false;
      expect(result.requestId).to.equal(requestId);
      expect(result.completion.attachments.status).to.equal('not-required');
    });

    it('marks a confirmed primary mutation as a complete save', function () {
      const saveTracker = tracker();
      saveTracker.confirmPrimaryPersistence('oid-1');
      const result = saveTracker.toResponse();
      expect(result.outcome).to.equal('saved');
      expect(result.success).to.be.true;
      expect(result.isComplete()).to.be.true;
      expect(result.oid).to.equal('oid-1');
    });

    it('downgrades a complete save to a warning when a later phase fails', function () {
      const saveTracker = tracker();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.recordPostPersistenceProblem(
        recordSaveProblem('processing', 'post-save', 'hook failed', 'post-save-failed')
      );
      const result = saveTracker.toResponse();
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.success).to.be.true;
      expect(result.wasPersisted()).to.be.true;
      expect(result.isComplete()).to.be.false;
      expect(result.oid).to.equal('oid-1');
    });

    it('never downgrades a persisted save back to not-saved or unknown', function () {
      const saveTracker = tracker();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.recordPrimaryNotApplied(recordSaveProblem('processing', 'persistence', 'nope'));
      saveTracker.recordPrimaryUnknown(recordSaveProblem('system', 'persistence', 'maybe'));
      const result = saveTracker.toResponse();
      expect(result.outcome).to.equal('saved');
      expect(result.oid).to.equal('oid-1');
    });

    it('does not confirm persistence after the primary mutation was ambiguous', function () {
      const saveTracker = tracker();
      saveTracker.recordPrimaryUnknown(recordSaveProblem('system', 'persistence', 'timeout'));
      saveTracker.confirmPrimaryPersistence('oid-1');
      const result = saveTracker.toResponse();
      expect(result.outcome).to.equal('unknown');
      expect(result.wasPersisted()).to.be.false;
      expect(result.oid).to.equal('');
    });

    it('returns a detached copy that cannot mutate tracked state', function () {
      const saveTracker = tracker();
      saveTracker.confirmPrimaryPersistence('oid-1');
      const copy = saveTracker.toResponse();
      copy.problems.push(recordSaveProblem('system', 'response', 'later'));
      copy.oid = 'tampered';
      expect(saveTracker.result.problems).to.have.length(0);
      expect(saveTracker.result.oid).to.equal('oid-1');
    });

    it('retains only bounded concurrency metadata in detached results', function () {
      const saveTracker = tracker();
      saveTracker.setConcurrencyMetadata({
        mode: 'strict',
        revision: 8,
        expectedRevision: 7,
        currentRevision: 8,
        entityTag: `"rb-record-v1.8.${'a'.repeat(43)}"`,
        formFingerprint: 'sha256:form_1',
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: '22222222-2222-4222-8222-222222222222',
        rawRequest: { authorization: 'secret' },
      });

      const result = saveTracker.toResponse();
      expect(result.concurrency).to.deep.equal({
        mode: 'strict',
        revision: 8,
        expectedRevision: 7,
        currentRevision: 8,
        entityTag: `"rb-record-v1.8.${'a'.repeat(43)}"`,
        formFingerprint: 'sha256:form_1',
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: '22222222-2222-4222-8222-222222222222',
      });
      expect(JSON.stringify(result)).not.to.contain('authorization');

      saveTracker.setConcurrencyMetadata({ revision: -1, resolution: 'force' });
      expect(saveTracker.toResponse().concurrency).to.equal(undefined);
    });

    it('copies only factory-validated schema outcome metadata outside record metadata', function () {
      const saveTracker = tracker();
      const schemaOutcome = createRecordSaveSchemaOutcomeMetadata({
        digest: 'a'.repeat(64),
        immutableUrl: `/default/default/api/records/schemas/${'a'.repeat(64)}`,
        completeness: 'partial',
        enforcement: 'shadow',
        privateGrant: { oid: 'must-not-serialize' },
      });
      saveTracker.setSchemaOutcome(schemaOutcome);
      saveTracker.confirmPrimaryPersistence('oid-1');

      const result = saveTracker.toResponse();
      expect(result.schemaOutcome).to.deep.equal({
        digest: 'a'.repeat(64),
        immutableUrl: `/default/default/api/records/schemas/${'a'.repeat(64)}`,
        completeness: 'partial',
        enforcement: 'shadow',
      });
      expect(Object.isFrozen(result.schemaOutcome)).to.equal(true);
      expect(
        Reflect.set(result, 'schemaOutcome', {
          ...schemaOutcome,
          digest: 'b'.repeat(64),
        })
      ).to.equal(false);
      expect(result.schemaOutcome?.digest).to.equal('a'.repeat(64));
      expect(result.metadata).to.equal(null);
      expect(JSON.parse(JSON.stringify(result)).schemaOutcome).to.deep.equal(result.schemaOutcome);
      expect(JSON.stringify(result)).not.to.include('must-not-serialize');
    });

    it('rejects malformed or inconsistent schema outcome identities', function () {
      const digest = 'a'.repeat(64);
      const valid = {
        digest,
        immutableUrl: `/default/default/api/records/schemas/${digest}`,
        completeness: 'complete',
        enforcement: 'enforce',
      };
      const invalidOutcomes: unknown[] = [
        { ...valid, digest: 'A'.repeat(64) },
        { ...valid, immutableUrl: `https://example.test/default/default/api/records/schemas/${digest}` },
        { ...valid, immutableUrl: `/default/default/api/records/schemas/${'b'.repeat(64)}` },
        { ...valid, immutableUrl: `/%broken/default/api/records/schemas/${digest}` },
        { ...valid, completeness: 'unknown' },
        { ...valid, enforcement: 'disabled' },
      ];

      for (const invalidOutcome of invalidOutcomes) {
        expect(() => createRecordSaveSchemaOutcomeMetadata(invalidOutcome)).to.throw(TypeError);
      }
    });

    it('snapshots schema outcome completeness and enforcement before validating them', function () {
      const digest = 'a'.repeat(64);
      let completenessReads = 0;
      let enforcementReads = 0;
      const metadata = {
        digest,
        immutableUrl: `/default/default/api/records/schemas/${digest}`,
        get completeness() {
          completenessReads += 1;
          return completenessReads === 1 ? 'complete' : 'unvalidated-completeness';
        },
        get enforcement() {
          enforcementReads += 1;
          return enforcementReads === 1 ? 'enforce' : 'unvalidated-enforcement';
        },
      };

      const result = createRecordSaveSchemaOutcomeMetadata(metadata);

      expect(completenessReads).to.equal(1);
      expect(enforcementReads).to.equal(1);
      expect(result.completeness).to.equal('complete');
      expect(result.enforcement).to.equal('enforce');
    });

    it('preserves only legacy workspace fields returned by a post-save hook', function () {
      const saveTracker = tracker();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.mergeLegacyHookFields({
        workspaceOid: 'workspace-1',
        workspaceData: { title: 'Workspace' },
        oid: 'tampered',
        outcome: 'not-saved',
      });

      const result = saveTracker.toResponse();
      expect(result.workspaceOid).to.equal('workspace-1');
      expect(result.workspaceData).to.deep.equal({ title: 'Workspace' });
      expect(result.oid).to.equal('oid-1');
      expect(result.outcome).to.equal('saved');
    });

    it('copies source metadata and ignores invalid legacy hook values', function () {
      const saveTracker = tracker();
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

      const result = saveTracker.toResponse();
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
      const saveTracker = tracker();
      saveTracker.recordPrimaryNotApplied({
        kind: 'validation',
        phase: 'pre-save',
        issues: [
          {
            message: '@validator-error-required',
            code: 'record-validation-failed',
            class: 'required',
            params: { required: true, unsafe: { token: 'secret' } } as never,
            targetField: { dataModel: ['title'] },
            lineagePaths: { dataModel: ['title'], angularComponentsJsonPointer: '/title' },
            exception: new Error('raw database failure'),
          } as never,
        ],
      });

      const serialized = JSON.parse(JSON.stringify(saveTracker.toResponse()));
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

    it('preserves safe schema metadata and an RFC 6901 root pointer', function () {
      const saveTracker = tracker();
      saveTracker.recordPrimaryNotApplied({
        kind: 'validation',
        source: 'schema',
        phase: 'schema',
        issues: [
          {
            code: 'record-schema.type',
            message: '@record-schema.type',
            pointer: '',
          },
        ],
      });

      expect(saveTracker.toResponse().problems[0]).to.deep.equal({
        kind: 'validation',
        source: 'schema',
        phase: 'schema',
        issues: [
          {
            code: 'record-schema.type',
            message: '@record-schema.type',
            pointer: '',
          },
        ],
      });
    });
  });

  describe('attachment completion', function () {
    it('creates the empty shared completion shape and validates outcomes', function () {
      expect(emptyRecordSaveCompletion()).to.deep.equal({
        attachments: { status: 'not-required', items: [] },
      });
      expect(isRecordSaveOutcome('saved')).to.equal(true);
      expect(isRecordSaveOutcome('saved-with-warnings')).to.equal(true);
      expect(isRecordSaveOutcome('not-saved')).to.equal(true);
      expect(isRecordSaveOutcome('unknown')).to.equal(true);
      expect(isRecordSaveOutcome('unexpected')).to.equal(false);
      expect(isRecordSaveOutcome(null)).to.equal(false);
    });

    it('reduces item facts deterministically', function () {
      expect(reduceAttachmentStatus([])).to.equal('not-required');
      expect(
        reduceAttachmentStatus([{ field: 'f', attachmentId: 'a', operation: 'add', status: 'completed' }])
      ).to.equal('completed');
      expect(
        reduceAttachmentStatus([
          { field: 'f', attachmentId: 'a', operation: 'add', status: 'completed' },
          { field: 'f', attachmentId: 'b', operation: 'add', status: 'incomplete' },
        ])
      ).to.equal('incomplete');
      expect(
        reduceAttachmentStatus([
          { field: 'f', attachmentId: 'a', operation: 'add', status: 'incomplete' },
          { field: 'f', attachmentId: 'b', operation: 'add', status: 'unknown' },
        ])
      ).to.equal('unknown');
    });

    it('downgrades a persisted save when any item is not completed', function () {
      const saveTracker = tracker();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.setAttachmentItems([
        { field: 'attachments', attachmentId: 'a', operation: 'finalize', status: 'completed' },
        { field: 'attachments', attachmentId: 'b', operation: 'finalize', status: 'incomplete' },
      ]);
      const result = saveTracker.toResponse();
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.completion.attachments.status).to.equal('incomplete');
      expect(result.completion.attachments.items).to.have.length(2);
    });

    it('keeps a complete save complete when every item is confirmed', function () {
      const saveTracker = tracker();
      saveTracker.confirmPrimaryPersistence('oid-1');
      saveTracker.setAttachmentItems([
        { field: 'attachments', attachmentId: 'a', operation: 'add', status: 'completed' },
      ]);
      expect(saveTracker.toResponse().outcome).to.equal('saved');
    });
  });

  describe('resolveStorageMutationState', function () {
    it('trusts an explicit application state', function () {
      const response = new StorageMutationResponse();
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

    it('derives the normalized schema operation and accepts If-Match only through the trusted option', function () {
      const ifMatch = `"sha256:${'a'.repeat(64)}"`;
      const context = createRecordSaveContext({
        validationOperation: '  publish  ',
        portal: '  tenant-portal  ',
        recordSchemaIfMatch: ifMatch,
      });

      expect(context.validationOperation).to.equal('  publish  ');
      expect(context.schemaOperation).to.equal('publish');
      expect(context.portal).to.equal('tenant-portal');
      expect(context.ifMatch).to.equal(ifMatch);
      expect(Object.isFrozen(context)).to.equal(true);
      expect(isRecordSaveContext(context)).to.equal(true);
      const spreadClone = { ...context };
      const modifiedClone = {
        ...context,
        validationOperation: 'review',
        schemaOperation: 'forged-operation',
        ifMatch: `"sha256:${'b'.repeat(64)}"`,
      };
      expect(isRecordSaveContext(spreadClone)).to.equal(false);
      expect(isRecordSaveContext(modifiedClone)).to.equal(false);
      expect(isRecordSaveContext({ requestId, schemaOperation: 'publish', ifMatch })).to.equal(false);
      const refactoredContext = createRecordSaveContext(modifiedClone);
      expect(isRecordSaveContext(refactoredContext)).to.equal(true);
      expect(refactoredContext.schemaOperation).to.equal('review');
      expect(refactoredContext.ifMatch).to.equal(undefined);
      expect(createRecordSaveContext({ validationOperation: 'bad operation' }).schemaOperation).to.be.undefined;
    });

    it('snapshots schema operation and If-Match inputs before validating them', function () {
      const firstIfMatch = `"sha256:${'a'.repeat(64)}"`;
      const secondIfMatch = `"sha256:${'b'.repeat(64)}"`;
      let validationOperationReads = 0;
      let ifMatchReads = 0;
      const context = createRecordSaveContext({
        get validationOperation() {
          validationOperationReads += 1;
          return validationOperationReads === 1 ? '  publish  ' : 'forged-operation';
        },
        get recordSchemaIfMatch() {
          ifMatchReads += 1;
          return ifMatchReads === 1 ? firstIfMatch : secondIfMatch;
        },
      });

      expect(validationOperationReads).to.equal(1);
      expect(ifMatchReads).to.equal(1);
      expect(context.validationOperation).to.equal('  publish  ');
      expect(context.schemaOperation).to.equal('publish');
      expect(context.ifMatch).to.equal(firstIfMatch);
      expect(createRecordSaveContext({ portal: '../invalid-portal' }).portal).to.equal(undefined);
    });

    it('detaches and deeply freezes caller-owned validation context values', function () {
      const requestStep = { name: 'review' };
      const requestSteps: RecordValidationContextJSONValue[] = ['draft', requestStep];
      const validationRequestParameters: Record<string, RecordValidationContextJSONValue> = {
        workflow: { steps: requestSteps },
      };
      const runtimeAudit = { enabled: true, labels: ['initial'] };
      const validationRuntimeContext: Record<string, RecordValidationContextJSONValue> = {
        audit: runtimeAudit,
      };
      const validationBypass: {
        mode: 'bypass';
        reason: InternalRecordValidationBypass['reason'];
        actor: { kind: 'service'; id: string };
      } = {
        mode: 'bypass',
        reason: 'historical-record-repair',
        actor: { kind: 'service', id: 'RepairService' },
      };

      const context = createRecordSaveContext({
        validationRequestParameters,
        validationRuntimeContext,
        validationBypass,
      });

      requestStep.name = 'forged-review';
      requestSteps.push('published');
      runtimeAudit.enabled = false;
      runtimeAudit.labels.push('forged');
      validationBypass.reason = 'trusted-data-migration';
      validationBypass.actor.id = 'ForgedService';

      expect(context.validationRequestParameters).to.deep.equal({
        workflow: { steps: ['draft', { name: 'review' }] },
      });
      expect(context.validationRuntimeContext).to.deep.equal({
        audit: { enabled: true, labels: ['initial'] },
      });
      expect(context.validationBypass).to.deep.equal({
        mode: 'bypass',
        reason: 'historical-record-repair',
        actor: { kind: 'service', id: 'RepairService' },
      });
      expect(Object.isFrozen(context.validationRequestParameters)).to.equal(true);
      expect(Object.isFrozen(context.validationRequestParameters?.workflow)).to.equal(true);
      expect(Object.isFrozen(context.validationRuntimeContext)).to.equal(true);
      expect(Object.isFrozen(context.validationRuntimeContext?.audit)).to.equal(true);
      expect(Object.isFrozen(context.validationBypass)).to.equal(true);
      expect(Object.isFrozen(context.validationBypass?.actor)).to.equal(true);
      expect(Reflect.set(context.validationBypass?.actor ?? {}, 'id', 'LateMutation')).to.equal(false);
      expect(context.validationBypass?.actor.id).to.equal('RepairService');
      expect(isRecordSaveContext(context)).to.equal(true);
    });

    it('snapshots nested accessors and proxies exactly once before trusting the context', function () {
      let requestContainerReads = 0;
      let requestOperationReads = 0;
      const requestTarget: Record<string, RecordValidationContextJSONValue> = { operation: 'publish' };
      const requestProxy = new Proxy(requestTarget, {
        get(target, property, receiver) {
          if (property === 'operation') {
            requestOperationReads += 1;
            return requestOperationReads === 1 ? Reflect.get(target, property, receiver) : 'forged-operation';
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const validationRequestParameters: Readonly<Record<string, RecordValidationContextJSONValue>> = {
        get nested() {
          requestContainerReads += 1;
          return requestProxy;
        },
      };

      let runtimeValueReads = 0;
      const runtimeValues: RecordValidationContextJSONValue[] = [];
      Object.defineProperty(runtimeValues, 0, {
        configurable: true,
        enumerable: true,
        get() {
          runtimeValueReads += 1;
          return runtimeValueReads === 1 ? 'trusted-runtime' : 'forged-runtime';
        },
      });
      runtimeValues.length = 1;

      let bypassActorReads = 0;
      let bypassActorIdReads = 0;
      const actorTarget: InternalRecordValidationBypass['actor'] = {
        kind: 'service',
        id: 'AuditService',
      };
      const actorProxy = new Proxy(actorTarget, {
        get(target, property, receiver) {
          if (property === 'id') {
            bypassActorIdReads += 1;
            return bypassActorIdReads === 1 ? Reflect.get(target, property, receiver) : 'ForgedService';
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const validationBypass: InternalRecordValidationBypass = {
        mode: 'bypass',
        reason: 'configuration-recovery',
        get actor() {
          bypassActorReads += 1;
          return actorProxy;
        },
      };

      const context = createRecordSaveContext({
        validationRequestParameters,
        validationRuntimeContext: { values: runtimeValues },
        validationBypass,
      });

      requestTarget.operation = 'mutated-operation';
      expect(requestContainerReads).to.equal(1);
      expect(requestOperationReads).to.equal(1);
      expect(runtimeValueReads).to.equal(1);
      expect(bypassActorReads).to.equal(1);
      expect(bypassActorIdReads).to.equal(1);
      expect(context.validationRequestParameters).to.deep.equal({ nested: { operation: 'publish' } });
      expect(context.validationRuntimeContext).to.deep.equal({ values: ['trusted-runtime'] });
      expect(context.validationBypass).to.deep.equal({
        mode: 'bypass',
        reason: 'configuration-recovery',
        actor: { kind: 'service', id: 'AuditService' },
      });
      expect(isInternalRecordValidationBypass(context.validationBypass)).to.equal(true);
      expect(isRecordSaveContext(context)).to.equal(true);
    });

    it('rejects nested context values that cannot be represented as detached JSON', function () {
      const cyclic: Record<string, RecordValidationContextJSONValue> = {};
      cyclic.self = cyclic;

      expect(() => createRecordSaveContext({ validationRequestParameters: cyclic })).to.throw(
        TypeError,
        'validationRequestParameters must contain only acyclic JSON values.'
      );
      expect(() =>
        createRecordSaveContext({
          validationRuntimeContext: {
            createdAt: new Date() as unknown as RecordValidationContextJSONValue,
          },
        })
      ).to.throw(TypeError, 'validationRuntimeContext must contain only acyclic JSON values.');
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

    it('normalizes only own data properties without invoking raw-request accessors', function () {
      let accessorInvoked = false;
      const inherited = { expectedRevision: 99, rawRequest: { authorization: 'secret' } };
      const supplied = Object.create(inherited);
      Object.defineProperties(supplied, {
        expectedRevision: { value: 7, enumerable: true },
        entityTagSupplied: { value: true, enumerable: true },
        resolution: { value: 'client-manually-resolved', enumerable: true },
        resolutionOfRequestId: { value: '22222222-2222-4222-8222-222222222222', enumerable: true },
        formFingerprint: {
          enumerable: true,
          get: () => {
            accessorInvoked = true;
            return `sha256:${'0'.repeat(64)}`;
          },
        },
      });

      expect(normalizeRecordConcurrencyContext(supplied)).to.deep.equal({
        expectedRevision: 7,
        entityTagSupplied: true,
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: '22222222-2222-4222-8222-222222222222',
      });
      expect(accessorInvoked).to.equal(false);
      expect(JSON.stringify(normalizeRecordConcurrencyContext(supplied))).not.to.contain('authorization');
    });

    it('normalizes the same bounded request and runtime facts for every transport', function () {
      expect(
        normalizeRecordValidationRequestFacts(
          { recordType: ' dataset ', targetStep: '../unsafe', merge: 'true', token: 'secret' },
          { targetStep: 'review', datastreams: false }
        )
      ).to.deep.equal({ recordType: 'dataset', targetStep: 'review', merge: true, datastreams: false });

      expect(
        recordValidationRuntimeFacts(
          {
            routeFamily: 'browser',
            operation: 'transition',
            validationRuntimeContext: { rawRequest: 'must-not-pass' },
          },
          'transition'
        )
      ).to.deep.equal({
        routeFamily: 'browser',
        writeKind: 'transition',
        saveOperation: 'transition',
      });
      expect(
        recordValidationRuntimeFacts(
          {
            routeFamily: 'internal',
            validationRuntimeContext: { service: 'repair' },
          },
          'update'
        )
      ).to.deep.equal({
        service: 'repair',
        routeFamily: 'internal',
        writeKind: 'update',
        saveOperation: 'update',
      });
    });
  });

  describe('recordSaveFailureStatus', function () {
    it('maps non-persisted problem kinds to transport statuses', function () {
      const validation = new RecordSaveResponse(requestId);
      validation.addProblem(recordSaveProblem('validation', 'pre-save', 'bad field'));
      expect(recordSaveFailureStatus(validation)).to.equal(400);

      const authorization = new RecordSaveResponse(requestId);
      authorization.addProblem(recordSaveProblem('authorization', 'pre-save', 'denied'));
      expect(recordSaveFailureStatus(authorization)).to.equal(403);

      const processing = new RecordSaveResponse(requestId);
      processing.addProblem(recordSaveProblem('processing', 'persistence', 'boom'));
      expect(recordSaveFailureStatus(processing)).to.equal(500);
    });

    it('uses deterministic severity instead of the first problem', function () {
      const authorizationAfterValidation = new RecordSaveResponse(requestId);
      authorizationAfterValidation.addProblem(recordSaveProblem('validation', 'pre-save', 'bad field'));
      authorizationAfterValidation.addProblem(recordSaveProblem('authorization', 'pre-save', 'denied'));
      expect(recordSaveFailureStatus(authorizationAfterValidation)).to.equal(403);

      const systemAfterAuthorization = new RecordSaveResponse(requestId);
      systemAfterAuthorization.addProblem(recordSaveProblem('authorization', 'pre-save', 'denied'));
      systemAfterAuthorization.addProblem(recordSaveProblem('system', 'pre-save', 'configuration failure'));
      expect(recordSaveFailureStatus(systemAfterAuthorization)).to.equal(500);
    });

    it('keeps an ambiguous primary mutation on a 5xx', function () {
      const unknownResult = new RecordSaveResponse(requestId);
      unknownResult.outcome = 'unknown';
      unknownResult.addProblem(recordSaveProblem('validation', 'persistence', 'looks like validation'));
      expect(recordSaveFailureStatus(unknownResult)).to.equal(500);
    });

    it('gives each certified concurrency failure its own precondition status', function () {
      const expected: Array<[string, number]> = [
        ['record-precondition-required', 428],
        ['record-revision-stale', 412],
        ['record-deleted', 412],
        ['form-definition-changed', 409],
        ['record-lifecycle-operation-conflict', 409],
      ];
      for (const [code, status] of expected) {
        const conflict = new RecordSaveResponse(requestId);
        conflict.addProblem(recordSaveProblem('conflict', 'pre-save', 'Your changes were not saved.', code));
        expect(recordSaveFailureStatus(conflict), code).to.equal(status);
      }
    });

    it('never reports a certified conflict as an ambiguous 500', function () {
      // A conflict is decided before or at the compare-and-set boundary, so it
      // is a definitive non-write; a 5xx would make the browser treat it as
      // `unknown` and refuse to rebase or retry it.
      const uncoded = new RecordSaveResponse(requestId);
      uncoded.addProblem(recordSaveProblem('conflict', 'persistence', 'Your changes were not saved.'));
      expect(recordSaveFailureStatus(uncoded)).to.equal(409);

      const casLoss = new RecordSaveResponse(requestId);
      casLoss.addProblem(recordSaveProblem('conflict', 'persistence', 'stale', 'record-revision-stale'));
      expect(recordSaveFailureStatus(casLoss)).to.equal(412);
    });

    it('orders conflict severity deterministically against other problem kinds', function () {
      // Precedence follows the pipeline: authorization is resolved before the
      // precondition, and a real system failure still outranks both.
      const conflictAfterValidation = new RecordSaveResponse(requestId);
      conflictAfterValidation.addProblem(recordSaveProblem('validation', 'pre-save', 'bad field'));
      conflictAfterValidation.addProblem(recordSaveProblem('conflict', 'pre-save', 'stale', 'record-revision-stale'));
      expect(recordSaveFailureStatus(conflictAfterValidation)).to.equal(412);

      const authorizationAfterConflict = new RecordSaveResponse(requestId);
      authorizationAfterConflict.addProblem(
        recordSaveProblem('conflict', 'pre-save', 'stale', 'record-revision-stale')
      );
      authorizationAfterConflict.addProblem(recordSaveProblem('authorization', 'pre-save', 'denied'));
      expect(recordSaveFailureStatus(authorizationAfterConflict)).to.equal(403);

      const systemAfterConflict = new RecordSaveResponse(requestId);
      systemAfterConflict.addProblem(recordSaveProblem('conflict', 'pre-save', 'stale', 'record-revision-stale'));
      systemAfterConflict.addProblem(
        recordSaveProblem(
          'system',
          'pre-save',
          'adapter cannot honor preconditions',
          'record-concurrency-capability-unavailable'
        )
      );
      expect(recordSaveFailureStatus(systemAfterConflict)).to.equal(500);

      // Missing precondition wins over a stale one regardless of insertion order.
      const bothCodes = new RecordSaveResponse(requestId);
      bothCodes.addProblem(recordSaveProblem('conflict', 'pre-save', 'stale', 'record-revision-stale'));
      bothCodes.addProblem(recordSaveProblem('conflict', 'pre-save', 'required', 'record-precondition-required'));
      expect(recordSaveFailureStatus(bothCodes)).to.equal(428);
    });
  });
});
